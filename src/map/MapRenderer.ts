import Phaser from 'phaser';
import { schoolMaps } from '../data/maps';
import type { CorridorDoor, FloorId, InRoomDoor, MapArea, RoomArea, RoomId, RoomInteractionTarget } from '../data/maps';
import { setMapDebugState } from './mapState';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { UI_THEME, applyPixelTextStyle } from '../ui/uiTheme';

const DOOR_FILL_COLOR = 0x5c4221;
const DOOR_STROKE_COLOR = 0xa37435;
const DOOR_STROKE_WIDTH = 2;
const DOOR_HOVER_COLOR = 0x8f6330;
const IN_ROOM_DOOR_FILL_COLOR = 0xd6a84f;
const IN_ROOM_DOOR_STROKE_COLOR = 0xffe08a;
const IN_ROOM_DOOR_STROKE_WIDTH = 4;
const WALL_COLOR = 0x1a171c;
const ROOM_WALL_COLOR = 0x17131a;
const ELEVATOR_FADE_DURATION = 500;
const ELEVATOR_TRANSITION_RECOVERY_MS = 1200;
const ELEVATOR_FADE_IN_DELAY_MS = 50;
const STEEL_DEVICE_COLOR = 0x8f9aa3;
const STEEL_DEVICE_DARK_COLOR = 0x56616a;
const STEEL_DEVICE_LIGHT_COLOR = 0xc6d0d6;
const FLOOR_SOURCE_TILE_SIZE = 192;
const FLOOR_SOURCE_TILE_X = FLOOR_SOURCE_TILE_SIZE;
const FLOOR_SOURCE_TILE_Y = 0;
const FLOOR_TILE_FRAME = 'single-floor-tile-192';
const CORRIDOR_FLOOR_TILE_DISPLAY_SIZE = 120;
const CORRIDOR_LEFT_DOOR_SURFACE_COLOR = WALL_COLOR;
const CORRIDOR_LEFT_DOOR_SURFACE_X = 0;
const CORRIDOR_LEFT_DOOR_SURFACE_WIDTH = 300;

export const CLASSROOM_DESK_TARGET_HEIGHT = 48;

export type DoorInteractionHandler = (door: CorridorDoor) => void;
export type RoomExitHandler = (entryDoorId: InRoomDoor['entryDoorId']) => void;

export class MapRenderer {
  private scene: Phaser.Scene;
  private currentFloorId: FloorId;
  private corridorObjects: Phaser.GameObjects.GameObject[] = [];
  private roomObjects: Phaser.GameObjects.GameObject[] = [];
  private interactiveDoorMap = new Map<string, Phaser.GameObjects.Rectangle>();
  private transitioning = false;
  private transitionRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly onDoorInteraction: DoorInteractionHandler | undefined;
  private readonly onExitRoomRequested: RoomExitHandler | undefined;

  constructor(
    scene: Phaser.Scene,
    floorId: FloorId,
    onDoorInteraction?: DoorInteractionHandler,
    onExitRoomRequested?: RoomExitHandler,
  ) {
    this.scene = scene;
    this.currentFloorId = floorId;
    this.onDoorInteraction = onDoorInteraction;
    this.onExitRoomRequested = onExitRoomRequested;
    setMapDebugState({ currentFloorId: floorId });
  }

  get currentFloor(): FloorId {
    return this.currentFloorId;
  }

  private getRenderBounds(area: MapArea): MapArea['bounds'] {
    const width = Math.max(area.bounds.width, GAME_WIDTH);
    const height = Math.max(area.bounds.height, GAME_HEIGHT);
    const centerX = area.bounds.x + area.bounds.width / 2;
    const centerY = area.bounds.y + area.bounds.height / 2;

    return {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
  }

  // ── Corridor Rendering ──────────────────────────────────────

  renderCorridor(floorId: FloorId): void {
    this.clearAll();
    this.currentFloorId = floorId;
    const floor = schoolMaps.floors[floorId];
    const corridor = floor.corridor;

    const renderBounds = this.getRenderBounds(corridor);

    // Set world bounds for camera
    this.scene.cameras.main.setBounds(
      renderBounds.x,
      renderBounds.y,
      renderBounds.width,
      renderBounds.height,
    );

    const floorCoverage = {
      x: corridor.bounds.x,
      y: corridor.bounds.y,
      width: corridor.bounds.width,
      height: corridor.bounds.height,
    };
    this.renderFloorTiles(corridor, this.corridorObjects, floorCoverage, {
      width: CORRIDOR_FLOOR_TILE_DISPLAY_SIZE,
      height: CORRIDOR_FLOOR_TILE_DISPLAY_SIZE,
    });

    // Draw wall rectangles from collision zones
    for (const zone of corridor.collisionZones) {
      const wall = this.scene.add.rectangle(
        zone.x + zone.width / 2,
        zone.y + zone.height / 2,
        zone.width,
        zone.height,
        WALL_COLOR,
      );
      wall.setOrigin(0.5, 0.5);
      wall.setDepth(1);
      wall.setStrokeStyle(1, 0x4b3139);
      this.corridorObjects.push(wall);
    }

    const leftDoorSurface = this.scene.add.rectangle(
      CORRIDOR_LEFT_DOOR_SURFACE_X + CORRIDOR_LEFT_DOOR_SURFACE_WIDTH / 2,
      corridor.bounds.y + corridor.bounds.height / 2,
      CORRIDOR_LEFT_DOOR_SURFACE_WIDTH,
      corridor.bounds.height,
      CORRIDOR_LEFT_DOOR_SURFACE_COLOR,
    );
    leftDoorSurface.setOrigin(0.5, 0.5);
    leftDoorSurface.setDepth(2);
    this.corridorObjects.push(leftDoorSurface);

    const rightDoorSurface = this.scene.add.rectangle(
      840,
      corridor.bounds.y + corridor.bounds.height / 2,
      40,
      corridor.bounds.height,
      WALL_COLOR,
    );
    rightDoorSurface.setOrigin(0.5, 0.5);
    rightDoorSurface.setDepth(2);
    this.corridorObjects.push(rightDoorSurface);

    // Place doors
    for (const door of corridor.doors) {
      this.renderDoor(door);
    }

    setMapDebugState({ currentFloorId: floorId, currentRoomId: null });
  }

  // ── Room Rendering ──────────────────────────────────────────

  renderRoom(roomId: RoomId): void {
    this.clearAll();

    // Find the room across all floors
    let foundRoom: RoomArea | null = null;
    let foundFloorId: FloorId | null = null;
    for (const [fId, floor] of Object.entries(schoolMaps.floors)) {
      const candidate = floor.rooms[roomId];
      if (candidate) {
        foundRoom = candidate;
        foundFloorId = fId as FloorId;
        break;
      }
    }

    if (!foundRoom || !foundFloorId) {
      return;
    }

    const room = foundRoom;
    const floorId = foundFloorId;
    this.currentFloorId = floorId;

    const renderBounds = this.getRenderBounds(room);

    // Set camera bounds for room
    this.scene.cameras.main.setBounds(renderBounds.x, renderBounds.y, renderBounds.width, renderBounds.height);

    this.renderFloorTiles(room, this.roomObjects, room.bounds, {
      width: CORRIDOR_FLOOR_TILE_DISPLAY_SIZE,
      height: CORRIDOR_FLOOR_TILE_DISPLAY_SIZE,
    });

    // Draw room walls (boundary)
    const wallThickness = 12;
    // Top wall
    this.roomObjects.push(
      this.scene.add
        .rectangle(room.bounds.x + room.bounds.width / 2, room.bounds.y + wallThickness / 2, room.bounds.width, wallThickness, ROOM_WALL_COLOR)
        .setDepth(2),
    );
    // Bottom wall
    this.roomObjects.push(
      this.scene.add
        .rectangle(room.bounds.x + room.bounds.width / 2, room.bounds.y + room.bounds.height - wallThickness / 2, room.bounds.width, wallThickness, ROOM_WALL_COLOR)
        .setDepth(2),
    );
    // Left wall
    this.roomObjects.push(
      this.scene.add
        .rectangle(room.bounds.x + wallThickness / 2, room.bounds.y + room.bounds.height / 2, wallThickness, room.bounds.height, ROOM_WALL_COLOR)
        .setDepth(2),
    );
    // Right wall
    this.roomObjects.push(
      this.scene.add
        .rectangle(room.bounds.x + room.bounds.width - wallThickness / 2, room.bounds.y + room.bounds.height / 2, wallThickness, room.bounds.height, ROOM_WALL_COLOR)
        .setDepth(2),
    );

    // Place furniture (desk/chairs) at collision zone positions
    const deskKey = 'furniture.classroomDeskChairs';
    const hasDeskTexture = this.scene.textures.exists(deskKey);

    for (const zone of room.collisionZones) {
      // Place desk sprite if texture exists
      if (hasDeskTexture) {
        const desk = this.scene.add.image(zone.x + zone.width / 2, zone.y + zone.height / 2, deskKey);
        desk.setOrigin(0.5, 0.5);
        const scaleY = CLASSROOM_DESK_TARGET_HEIGHT / desk.height;
        desk.setScale(scaleY);
        desk.setDepth(3);
        this.roomObjects.push(desk);
      }
    }

    for (const door of room.inRoomDoors) {
      if (door.visible) {
        this.renderInRoomDoor(door);
      }
    }

    for (const target of room.interactionTargets) {
      if (target.visible && target.render.assetKey === 'communication.steelInteractable') {
        this.renderCommunicationDevice(target);
      } else if (target.visible && target.render.assetKey === 'prop.phone') {
        this.renderOfficePhone(target);
      }
    }

    setMapDebugState({ currentFloorId: floorId, currentRoomId: roomId });
  }

  // ── Door Rendering ──────────────────────────────────────────

  private ensureFloorTileFrame(textureKey: string): string {
    const texture = this.scene.textures.get(textureKey);
    if (!texture.has(FLOOR_TILE_FRAME)) {
      texture.add(FLOOR_TILE_FRAME, 0, FLOOR_SOURCE_TILE_X, FLOOR_SOURCE_TILE_Y, FLOOR_SOURCE_TILE_SIZE, FLOOR_SOURCE_TILE_SIZE);
    }
    return FLOOR_TILE_FRAME;
  }

  private renderFloorTiles(
    area: MapArea,
    targetObjects: Phaser.GameObjects.GameObject[],
    coverageBounds: MapArea['bounds'] = area.bounds,
    displayTileSize = { width: area.floorTile.tileWidth, height: area.floorTile.tileHeight },
  ): void {
    const tileKey = area.floorTile.assetKey;
    if (!this.scene.textures.exists(tileKey)) {
      return;
    }

    const frame = this.ensureFloorTileFrame(tileKey);
    const columns = Math.ceil(coverageBounds.width / displayTileSize.width);
    const rows = Math.ceil(coverageBounds.height / displayTileSize.height);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const tile = this.scene.add.image(
          coverageBounds.x + column * displayTileSize.width + displayTileSize.width / 2,
          coverageBounds.y + row * displayTileSize.height + displayTileSize.height / 2,
          tileKey,
          frame,
        );
        tile.setOrigin(0.5, 0.5);
        tile.setDisplaySize(displayTileSize.width, displayTileSize.height);
        tile.setDepth(0);
        targetObjects.push(tile);
      }
    }
  }


  private renderDoor(door: CorridorDoor): void {
    const bounds = door.bounds;
    const gfx = this.scene.add.graphics();

    // Fill
    gfx.fillStyle(DOOR_FILL_COLOR, 1);
    gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Stroke / outline
    gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
    gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    gfx.setDepth(6);
    this.corridorObjects.push(gfx);

    // Door label text
    const labelX = door.side === 'left' ? bounds.x + bounds.width + 8 : bounds.x + bounds.width / 2;
    const labelOriginX = door.side === 'left' ? 0 : 0.5;
    const labelText = applyPixelTextStyle(this.scene.add.text(labelX, bounds.y - 8, door.label, {
      align: door.side === 'left' ? 'left' : 'center',
      color: UI_THEME.colors.textMuted,
      fontFamily: UI_THEME.font.ui,
      fontSize: '10px',
    }));
    labelText.setOrigin(labelOriginX, 1);
    labelText.setDepth(7);
    this.corridorObjects.push(labelText);

    // Interaction zone — only for non-background, interactive doors
    const interaction = door.interaction;
    if (interaction.type !== 'none') {
      const hitArea = this.scene.add.rectangle(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        bounds.width + 16,
        bounds.height + 16,
        0xffffff,
        0,
      );
      hitArea.setDepth(8);
      hitArea.setInteractive({ useHandCursor: true });

      if (interaction.type === 'elevator') {
        hitArea.on('pointerdown', () => {
          this.handleDoorInteraction(door);
        });
        hitArea.on('pointerover', () => {
          gfx.clear();
          gfx.fillStyle(DOOR_HOVER_COLOR, 1);
          gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
          gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        });
        hitArea.on('pointerout', () => {
          gfx.clear();
          gfx.fillStyle(DOOR_FILL_COLOR, 1);
          gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
          gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        });
        this.interactiveDoorMap.set(door.id, hitArea);
      } else if (interaction.type === 'roomTransition') {
        hitArea.on('pointerdown', () => {
          this.handleDoorInteraction(door);
        });
        hitArea.on('pointerover', () => {
          gfx.clear();
          gfx.fillStyle(DOOR_HOVER_COLOR, 1);
          gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
          gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        });
        hitArea.on('pointerout', () => {
          gfx.clear();
          gfx.fillStyle(DOOR_FILL_COLOR, 1);
          gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
          gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        });
        this.interactiveDoorMap.set(door.id, hitArea);
      }

      this.corridorObjects.push(hitArea);
    }

    // 5F left background doors: visible but NOT interactive (no setInteractive call above)
  }

  private renderInRoomDoor(door: InRoomDoor): void {
    const bounds = door.bounds;
    const doorRect = this.scene.add.rectangle(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width,
      bounds.height,
      IN_ROOM_DOOR_FILL_COLOR,
      1,
    );
    doorRect.setOrigin(0.5, 0.5);
    doorRect.setDepth(4);
    doorRect.setStrokeStyle(IN_ROOM_DOOR_STROKE_WIDTH, IN_ROOM_DOOR_STROKE_COLOR, 1);
    this.roomObjects.push(doorRect);

    const hitArea = this.scene.add.rectangle(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
      bounds.width + 16,
      bounds.height + 16,
      0xffffff,
      0,
    );
    hitArea.setDepth(8);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      this.onExitRoomRequested?.(door.entryDoorId);
    });
    this.roomObjects.push(hitArea);
  }

  private renderCommunicationDevice(target: RoomInteractionTarget): void {
    const bounds = target.bounds;
    const gfx = this.scene.add.graphics();

    gfx.fillStyle(STEEL_DEVICE_COLOR, 1);
    gfx.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 10);
    gfx.lineStyle(2, STEEL_DEVICE_DARK_COLOR, 1);
    gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    gfx.fillStyle(STEEL_DEVICE_LIGHT_COLOR, 1);
    gfx.fillRect(bounds.x + 14, bounds.y + 12, bounds.width - 28, 16);
    gfx.fillStyle(STEEL_DEVICE_DARK_COLOR, 1);
    gfx.fillRect(bounds.x + 18, bounds.y + 42, 14, 14);
    gfx.fillRect(bounds.x + 42, bounds.y + 42, 14, 14);
    gfx.fillRect(bounds.x + 66, bounds.y + 42, 14, 14);
    gfx.setDepth(3);
    this.roomObjects.push(gfx);

    const labelText = applyPixelTextStyle(this.scene.add.text(bounds.x + bounds.width / 2, bounds.y - 8, target.label, {
      align: 'center',
      color: UI_THEME.colors.textMuted,
      fontFamily: UI_THEME.font.ui,
      fontSize: '10px',
    }));
    labelText.setOrigin(0.5, 1);
    labelText.setDepth(4);
    this.roomObjects.push(labelText);
  }

  private renderOfficePhone(target: RoomInteractionTarget): void {
    const bounds = target.bounds;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const phoneKey = 'prop.phone';

    if (this.scene.textures.exists(phoneKey)) {
      const phone = this.scene.add.image(centerX, centerY, phoneKey);
      phone.setOrigin(0.5, 0.5);
      const targetHeight = bounds.height;
      const scale = targetHeight / phone.height;
      phone.setScale(scale);
      phone.setDepth(3);
      this.roomObjects.push(phone);
    } else {
      const gfx = this.scene.add.graphics();
      gfx.fillStyle(0x1f1410, 1);
      gfx.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 6);
      gfx.lineStyle(2, 0x000000, 1);
      gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      gfx.setDepth(3);
      this.roomObjects.push(gfx);
    }

    const labelText = applyPixelTextStyle(this.scene.add.text(centerX, bounds.y - 8, target.label, {
      align: 'center',
      color: UI_THEME.colors.textMuted,
      fontFamily: UI_THEME.font.ui,
      fontSize: '10px',
    }));
    labelText.setOrigin(0.5, 1);
    labelText.setDepth(4);
    this.roomObjects.push(labelText);
  }

  // ── Elevator Transition ─────────────────────────────────────

  startElevatorTransition(toFloor: FloorId, onFloorRendered?: () => void): void {
    if (this.transitioning) {
      return;
    }

    this.transitioning = true;
    setMapDebugState({ elevatorTransitioning: true });

    const inputManager = (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__ as
      | { lock(reason: string): void; unlock(): void }
      | undefined;
    inputManager?.lock('elevatorFade');

    let floorRendered = false;
    let fadeInStarted = false;
    let completed = false;

    const completeTransition = () => {
      if (completed) {
        return;
      }
      completed = true;
      this.clearTransitionRecoveryTimeout();
      this.transitioning = false;
      setMapDebugState({ elevatorTransitioning: false });
      inputManager?.unlock();
    };

    const startFadeIn = (delayMs: number) => {
      if (fadeInStarted) {
        return;
      }
      fadeInStarted = true;
      const fadeIn = () => {
        this.scene.cameras.main.fadeIn(ELEVATOR_FADE_DURATION, 0, 0, 0);
        this.scene.cameras.main.once('camerafadeincomplete', completeTransition);
      };

      if (delayMs > 0) {
        this.scene.time.delayedCall(delayMs, fadeIn);
      } else {
        fadeIn();
      }
    };

    const renderTargetFloor = (fadeInDelayMs: number) => {
      if (floorRendered) {
        return;
      }
      floorRendered = true;
      this.renderCorridor(toFloor);
      onFloorRendered?.();
      startFadeIn(fadeInDelayMs);
    };

    this.clearTransitionRecoveryTimeout();
    this.transitionRecoveryTimeout = setTimeout(() => {
      renderTargetFloor(0);
      completeTransition();
    }, ELEVATOR_TRANSITION_RECOVERY_MS);

    this.scene.cameras.main.fadeOut(ELEVATOR_FADE_DURATION, 0, 0, 0);
    this.scene.cameras.main.once('camerafadeoutcomplete', () => {
      renderTargetFloor(ELEVATOR_FADE_IN_DELAY_MS);
    });
  }

  // ── Interaction check for keyboard F ────────────────────────

  /**
   * Returns the interactive door nearest to a world position,
   * or null if no interactive door is within proximity.
   */
  getInteractiveDoorNear(x: number, y: number, proximity = 80): CorridorDoor | null {
    const floor = schoolMaps.floors[this.currentFloorId];
    let closest: CorridorDoor | null = null;
    let closestDist = proximity;

    for (const door of floor.corridor.doors) {
      if (door.interaction.type === 'none') {
        continue;
      }
      const cx = door.bounds.x + door.bounds.width / 2;
      const cy = door.bounds.y + door.bounds.height / 2;
      const dist = Phaser.Math.Distance.Between(x, y, cx, cy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = door;
      }
    }

    return closest;
  }

  /**
   * Try to interact with a door near the given position.
   * Called from GameScene update when F key is pressed.
   */
  tryInteract(x: number, y: number): boolean {
    const door = this.getInteractiveDoorNear(x, y);
    if (!door) {
      return false;
    }

    this.handleDoorInteraction(door);
    return true;
  }

  private handleDoorInteraction(door: CorridorDoor): void {
    if (this.onDoorInteraction) {
      this.onDoorInteraction(door);
      return;
    }

    if (door.interaction.type === 'elevator') {
      this.startElevatorTransition(door.interaction.targetFloorId);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────

  private clearAll(): void {
    for (const obj of this.corridorObjects) {
      obj.destroy();
    }
    this.corridorObjects = [];
    for (const obj of this.roomObjects) {
      obj.destroy();
    }
    this.roomObjects = [];
    this.interactiveDoorMap.clear();
  }

  private clearTransitionRecoveryTimeout(): void {
    if (this.transitionRecoveryTimeout !== null) {
      clearTimeout(this.transitionRecoveryTimeout);
      this.transitionRecoveryTimeout = null;
    }
  }

  destroy(): void {
    this.clearTransitionRecoveryTimeout();
    this.clearAll();
  }
}
