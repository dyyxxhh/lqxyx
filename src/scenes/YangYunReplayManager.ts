import type Phaser from 'phaser';
import type { CharacterDirection } from '../characters/characterState';
import { WALK_ANIMATIONS, getIdleAnimationKey } from '../characters/CharacterRegistry';
import { schoolMaps, type CorridorDoor, type FloorId, type RoomId, type SpawnPoint } from '../data/maps';
import { isRectInCameraView } from './cameraView';

export interface ReplayFrame {
  t: number;
  x: number;
  y: number;
  floorId: FloorId;
  roomId: RoomId | null;
  direction: CharacterDirection;
}

export interface DongJihaoSnapshot {
  x: number;
  y: number;
  floorId: FloorId;
  roomId: RoomId | null;
}

const CHASE_SPEED_PX_PER_SEC = 150;
const SPRITE_HALF_WIDTH = 24;
const SPRITE_HALF_HEIGHT = 32;
const REPLAY_SPRITE_DEPTH = 9;
const REPLAY_BUFFER_STORAGE_KEY = 'ying-zhong-jiu.replay-buffer.v1';
const DOOR_REACH_TOLERANCE_PX = 8;

type Phase = 'idle' | 'recording' | 'replaying' | 'chasing' | 'done';

export class YangYunReplayManager {
  private readonly scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite | null = null;
  private buffer: ReplayFrame[] = [];
  private phase: Phase = 'idle';
  private recordStart = 0;
  private replayStart = 0;
  private replayIndex = 0;
  private chaseEnabled = false;
  private currentX = 0;
  private currentY = 0;
  private currentFloor: FloorId = '4F';
  private currentRoom: RoomId | null = null;
  private currentDirection: CharacterDirection = 'down';
  private moving = false;
  private animationTime = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public startRecording(time: number): void {
    this.buffer = [];
    this.phase = 'recording';
    this.recordStart = time;
  }

  public recordFrame(time: number, x: number, y: number, floorId: FloorId, roomId: RoomId | null, direction: CharacterDirection): void {
    if (this.phase !== 'recording') return;
    this.buffer.push({ t: time - this.recordStart, x, y, floorId, roomId, direction });
  }

  public stopRecording(): void {
    if (this.phase !== 'recording') return;
    this.phase = 'idle';
    this.persistBuffer();
  }

  public restoreBuffer(): void {
    if (this.buffer.length > 0) return;
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(REPLAY_BUFFER_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.buffer = parsed.filter((frame): frame is ReplayFrame =>
        typeof frame === 'object' && frame !== null
        && typeof (frame as ReplayFrame).t === 'number'
        && typeof (frame as ReplayFrame).x === 'number'
        && typeof (frame as ReplayFrame).y === 'number',
      );
    } catch {
      this.buffer = [];
    }
  }

  private persistBuffer(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(REPLAY_BUFFER_STORAGE_KEY, JSON.stringify(this.buffer));
    } catch (_persistErr) {
      void _persistErr;
    }
  }

  public startReplay(time: number, dongJihao: DongJihaoSnapshot): void {
    if (this.buffer.length === 0) {
      this.phase = 'done';
      return;
    }
    const first = this.buffer[0]!;
    this.currentX = first.x;
    this.currentY = first.y;
    this.currentFloor = first.floorId;
    this.currentRoom = first.roomId;
    this.currentDirection = first.direction;
    this.phase = 'replaying';
    this.replayStart = time;
    this.replayIndex = 0;
    this.ensureSprite();
    this.refreshSpriteVisibility(dongJihao);
  }

  public setChaseEnabled(enabled: boolean): void {
    this.chaseEnabled = enabled;
    if (enabled && this.phase === 'done' && this.sprite) {
      this.phase = 'chasing';
    }
  }

  public update(time: number, deltaMs: number, dongJihao: DongJihaoSnapshot): void {
    this.animationTime = time;
    const previousX = this.currentX;
    const previousY = this.currentY;
    if (this.phase === 'replaying') {
      this.advanceReplay(time);
    }
    if (this.phase === 'chasing') {
      this.advanceChase(deltaMs, dongJihao);
    }
    this.moving = Math.hypot(this.currentX - previousX, this.currentY - previousY) > 0.5;
    this.refreshSpriteVisibility(dongJihao);
  }

  public isVisible(): boolean {
    return this.sprite?.visible === true;
  }

  public isOnCamera(camera: Phaser.Cameras.Scene2D.Camera): boolean {
    if (!this.sprite || !this.sprite.visible) return false;
    return isRectInCameraView(camera, {
      x: this.currentX - SPRITE_HALF_WIDTH,
      y: this.currentY - SPRITE_HALF_HEIGHT,
      width: SPRITE_HALF_WIDTH * 2,
      height: SPRITE_HALF_HEIGHT * 2,
    });
  }

  public destroy(): void {
    this.sprite?.destroy();
    this.sprite = null;
    this.buffer = [];
    this.phase = 'idle';
  }

  public getDebugState(): { phase: Phase; bufferLength: number; replayIndex: number; chaseEnabled: boolean; x: number; y: number; floorId: FloorId; roomId: RoomId | null; visible: boolean } {
    return {
      phase: this.phase,
      bufferLength: this.buffer.length,
      replayIndex: this.replayIndex,
      chaseEnabled: this.chaseEnabled,
      x: this.currentX,
      y: this.currentY,
      floorId: this.currentFloor,
      roomId: this.currentRoom,
      visible: this.isVisible(),
    };
  }

  private advanceReplay(time: number): void {
    const elapsed = time - this.replayStart;
    while (this.replayIndex < this.buffer.length) {
      const frame = this.buffer[this.replayIndex]!;
      if (frame.t > elapsed) break;
      this.currentX = frame.x;
      this.currentY = frame.y;
      this.currentFloor = frame.floorId;
      this.currentRoom = frame.roomId;
      this.currentDirection = frame.direction;
      this.replayIndex++;
    }
    if (this.replayIndex >= this.buffer.length) {
      if (this.chaseEnabled) {
        this.phase = 'chasing';
      } else {
        this.phase = 'done';
      }
    }
  }

  private advanceChase(deltaMs: number, dongJihao: DongJihaoSnapshot): void {
    const target = this.resolveChaseTarget(dongJihao);
    const dx = target.x - this.currentX;
    const dy = target.y - this.currentY;
    const dist = Math.hypot(dx, dy);
    if (dist < DOOR_REACH_TOLERANCE_PX) {
      if (target.nextRoom !== undefined) {
        this.currentFloor = target.nextFloor;
        this.currentRoom = target.nextRoom;
        this.currentX = target.nextX;
        this.currentY = target.nextY;
      }
      return;
    }
    const step = (CHASE_SPEED_PX_PER_SEC * deltaMs) / 1000;
    const ratio = Math.min(1, step / dist);
    this.currentX += dx * ratio;
    this.currentY += dy * ratio;
    if (Math.abs(dx) >= Math.abs(dy)) {
      this.currentDirection = dx < 0 ? 'left' : 'right';
    } else {
      this.currentDirection = dy < 0 ? 'up' : 'down';
    }
  }

  private resolveChaseTarget(dongJihao: DongJihaoSnapshot): { x: number; y: number; nextFloor: FloorId; nextRoom?: RoomId | null; nextX: number; nextY: number } {
    if (this.currentFloor === dongJihao.floorId && this.currentRoom === dongJihao.roomId) {
      return { x: dongJihao.x, y: dongJihao.y, nextFloor: this.currentFloor, nextX: dongJihao.x, nextY: dongJihao.y };
    }

    if (this.currentRoom) {
      const exit = this.chooseRoomExit(this.currentFloor, this.currentRoom, dongJihao);
      if (exit) {
        return {
          x: exit.spawn.x,
          y: exit.spawn.y,
          nextFloor: this.currentFloor,
          nextRoom: null,
          nextX: exit.corridorX,
          nextY: exit.corridorY,
        };
      }
    }

    if (this.currentFloor !== dongJihao.floorId) {
      const elevator = this.chooseElevatorDoor(this.currentFloor);
      const arrivalElevator = this.chooseElevatorDoor(dongJihao.floorId);
      if (elevator && arrivalElevator) {
        return {
          x: elevator.bounds.x + elevator.bounds.width / 2,
          y: elevator.bounds.y + elevator.bounds.height / 2,
          nextFloor: dongJihao.floorId,
          nextRoom: null,
          nextX: arrivalElevator.bounds.x + arrivalElevator.bounds.width / 2,
          nextY: arrivalElevator.bounds.y + arrivalElevator.bounds.height / 2,
        };
      }
    }

    const entryDoor = this.chooseCorridorDoor(this.currentFloor, dongJihao.roomId, dongJihao.y);
    if (entryDoor) {
      const interaction = entryDoor.interaction;
      const targetRoom = interaction.type === 'roomTransition' ? schoolMaps.floors[this.currentFloor].rooms[interaction.targetRoomId] : null;
      const targetSpawn = targetRoom?.spawnPoints.find((spawn) => spawn.id === (interaction.type === 'roomTransition' ? interaction.spawnPointId : ''));
      const targetY = entryDoor.bounds.y + entryDoor.bounds.height / 2;
      if (interaction.type !== 'roomTransition') {
        return { x: entryDoor.bounds.x + entryDoor.bounds.width / 2, y: targetY, nextFloor: this.currentFloor, nextX: entryDoor.bounds.x + entryDoor.bounds.width / 2, nextY: targetY };
      }
      return {
        x: entryDoor.bounds.x + entryDoor.bounds.width / 2,
        y: targetY,
        nextFloor: this.currentFloor,
        nextRoom: interaction.targetRoomId,
        nextX: targetSpawn?.x ?? entryDoor.bounds.x + entryDoor.bounds.width / 2,
        nextY: targetSpawn?.y ?? targetY,
      };
    }

    return { x: dongJihao.x, y: dongJihao.y, nextFloor: this.currentFloor, nextX: dongJihao.x, nextY: dongJihao.y };
  }

  private chooseRoomExit(floorId: FloorId, roomId: RoomId, dongJihao: DongJihaoSnapshot): { spawn: SpawnPoint; corridorX: number; corridorY: number } | null {
    const floor = schoolMaps.floors[floorId];
    const room = floor.rooms[roomId];
    if (!room) return null;
    const destinationDoor = this.currentFloor === dongJihao.floorId
      ? this.chooseCorridorDoor(floorId, dongJihao.roomId, dongJihao.y)
      : this.chooseElevatorDoor(floorId);
    const targetCorridorY = destinationDoor ? destinationDoor.bounds.y + destinationDoor.bounds.height / 2 : dongJihao.y;
    let best: { spawn: SpawnPoint; corridorDoor: CorridorDoor; score: number } | null = null;
    for (const doorId of room.entryDoorIds) {
      const corridorDoor = floor.corridor.doors.find((door) => door.id === doorId);
      if (!corridorDoor) continue;
      const interaction = corridorDoor.interaction;
      if (interaction.type !== 'roomTransition') continue;
      const spawn = room.spawnPoints.find((candidate) => candidate.id === interaction.spawnPointId);
      if (!spawn) continue;
      const corridorY = corridorDoor.bounds.y + corridorDoor.bounds.height / 2;
      const score = Math.abs(corridorY - targetCorridorY);
      if (!best || score < best.score) best = { spawn, corridorDoor, score };
    }
    if (!best) return null;
    return {
      spawn: best.spawn,
      corridorX: best.corridorDoor.bounds.x + best.corridorDoor.bounds.width / 2,
      corridorY: best.corridorDoor.bounds.y + best.corridorDoor.bounds.height / 2,
    };
  }

  private chooseCorridorDoor(floorId: FloorId, roomId: RoomId | null, targetY: number): CorridorDoor | null {
    if (!roomId) return null;
    const doors = schoolMaps.floors[floorId].corridor.doors.filter((door) => door.roomId === roomId);
    let best: { door: CorridorDoor; score: number } | null = null;
    for (const door of doors) {
      const score = Math.abs(door.bounds.y + door.bounds.height / 2 - targetY);
      if (!best || score < best.score) best = { door, score };
    }
    return best?.door ?? null;
  }

  private chooseElevatorDoor(floorId: FloorId): CorridorDoor | null {
    return schoolMaps.floors[floorId].corridor.doors.find((door) => door.kind === 'elevator') ?? null;
  }

  private ensureSprite(): void {
    if (this.sprite) return;
    const idleKey = getIdleAnimationKey('yangYunRed', this.currentDirection);
    const sprite = this.scene.add.sprite(this.currentX, this.currentY, idleKey);
    sprite.setOrigin(0.5, 0.7);
    sprite.setDepth(REPLAY_SPRITE_DEPTH);
    sprite.setVisible(false);
    this.sprite = sprite;
  }

  private refreshSpriteVisibility(dongJihao: DongJihaoSnapshot): void {
    if (!this.sprite) return;
    if (this.phase === 'idle' || this.phase === 'recording') {
      this.sprite.setVisible(false);
      return;
    }
    const sameRoom = this.currentFloor === dongJihao.floorId && this.currentRoom === dongJihao.roomId;
    this.sprite.setVisible(sameRoom);
    this.sprite.setPosition(this.currentX, this.currentY);
    const textureKey = this.getCurrentTextureKey();
    if (this.scene.textures.exists(textureKey)) {
      this.sprite.setTexture(textureKey);
    }
  }

  private getCurrentTextureKey(): string {
    if (!this.moving) {
      return getIdleAnimationKey('yangYunRed', this.currentDirection);
    }
    const frames = WALK_ANIMATIONS.yangYunRed[this.currentDirection].frameKeys;
    return frames[Math.floor(this.animationTime / 180) % frames.length] ?? getIdleAnimationKey('yangYunRed', this.currentDirection);
  }
}
