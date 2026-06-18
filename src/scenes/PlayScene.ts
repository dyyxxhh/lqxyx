import Phaser from 'phaser';

import type { CharacterDirection, CharacterId } from '../characters/characterState';
import {
  getDisplayName,
  isWalkable,
  resolveDirection,
  WALK_ANIMATIONS,
} from '../characters/CharacterRegistry';
import { setCharacterDebugState } from '../characters/characterState';
import type { BranchId, CheckpointId } from '../data/story';
import type { DeathFlashFrame } from '../data/story';
import { storyManifest } from '../data/story';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  markSceneStarted,
} from '../game/scaffoldState';
import { InputManager } from '../input/InputManager';
import { CollisionManager } from '../map/CollisionManager';
import { schoolMaps, type CorridorDoor, type DoorId, type FloorId, type RoomArea, type RoomId, type SpawnPoint } from '../data/maps';
import { MapRenderer } from '../map/MapRenderer';
import type { SaveState } from '../state/saveState';
import { loadSaveState } from '../state/saveState';
import { EventEngine, type ScriptedMovementRequest } from '../story/EventEngine';
import { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';
import { DeathFlashManager } from './DeathFlashManager';
import { isRectInCameraView } from './cameraView';
import { buildStoryEntityDebugEntries, type StoryEntityDebugEntry } from './storyEntities';

const PLAYER_SPEED = 200; // px/s
const MAX_MOVEMENT_DELTA_MS = 50;
const PLAYER_SPAWN_X = 560;
const PLAYER_SPAWN_Y = 920;
const DOOR_PROXIMITY = 80;

export class PlayScene extends Phaser.Scene {
  private mapRenderer!: MapRenderer;
  private inputManager!: InputManager;
  private narrativeUI!: NarrativeUIManager;
  private eventEngine!: EventEngine;
  private collisionManager!: CollisionManager;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerPosition: { x: number; y: number } = { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y };
  private currentCharacter: CharacterId = 'yangYunRed';
  private currentDirection: CharacterDirection = 'down';
  private isMoving = false;
  private activeTextureKey: string | null = null;
  private endingActive = false;
  private inRoom = false;
  private currentFloor: FloorId = '4F';
  private currentRoom: RoomId | null = null;
  private scriptedMovementActive = false;
  private deathFlashManager!: DeathFlashManager;
  private storyEntitySprites: Phaser.GameObjects.Image[] = [];
  private storyEntityDebugEntries: StoryEntityDebugEntry[] = [];
  private storyEntitySignature = '';

  // Branch choice UI
  private branchBg: Phaser.GameObjects.Rectangle | null = null;
  private branchButtons: Phaser.GameObjects.Rectangle[] = [];
  private branchTexts: Phaser.GameObjects.Text[] = [];
  private branchIds: BranchId[] = [];

  // Black screen overlay (separate from curtain for mid-scene blackscreens)
  private blackOverlay: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super('PlayScene');
  }

  create(): void {
    this.shutdown();
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    markSceneStarted('PlayScene');

    // ── Initialize subsystems ──────────────────────────────────
    const saveResult = loadSaveState();
    const saveState: SaveState = saveResult.state;

    this.mapRenderer = new MapRenderer(
      this,
      saveState.floorId,
      (door) => this.handleDoorInteraction(door),
      (entryDoorId) => this.exitRoomViaDoor(entryDoorId),
    );
    this.currentFloor = saveState.floorId;
    this.currentRoom = saveState.roomId;
    this.inRoom = saveState.roomId !== null;
    if (saveState.roomId) {
      this.mapRenderer.renderRoom(saveState.roomId);
    } else {
      this.mapRenderer.renderCorridor(saveState.floorId);
    }

    this.inputManager = new InputManager(this);
    this.narrativeUI = new NarrativeUIManager(this);
    this.collisionManager = new CollisionManager();

    // ── Create player sprite ───────────────────────────────────
    this.currentCharacter = saveState.controllableCharacterId;
    this.currentDirection = saveState.position.facing;
    this.playerPosition = { x: saveState.position.x, y: saveState.position.y };

    const idleKey = this.getIdleKey(this.currentCharacter, this.currentDirection);
    if (this.textures.exists(idleKey)) {
      this.playerSprite = this.add.sprite(
        this.playerPosition.x,
        this.playerPosition.y,
        idleKey,
      );
    } else {
      this.ensureWhiteFallbackTexture();
      this.playerSprite = this.add.sprite(
        this.playerPosition.x,
        this.playerPosition.y,
        '__WHITE',
      );
    }
    this.playerSprite.setDepth(10);
    this.playerSprite.setOrigin(0.5, 0.7);
    this.activeTextureKey = idleKey;
    this.cameras.main.centerOn(this.playerPosition.x, this.playerPosition.y);

    // ── Create branch choice UI (hidden initially) ─────────────
    this.branchBg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 98, 600, 200, UI_THEME.colors.surface, UI_THEME.alpha.panelStrong)
      .setDepth(1500)
      .setScrollFactor(0)
      .setVisible(false);
    applyPixelStrokeStyle(this.branchBg, UI_THEME.stroke.medium, UI_THEME.colors.border, 0.98);

    this.deathFlashManager = new DeathFlashManager(this);

    // ── Black overlay for mid-scene black screens ──────────────
    this.blackOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setDepth(1500)
      .setScrollFactor(0)
      .setVisible(false);

    // ── Create EventEngine ─────────────────────────────────────
    this.eventEngine = new EventEngine(
      storyManifest,
      this.inputManager,
      this.narrativeUI,
      saveState,
      (checkpointId: CheckpointId) => this.onCheckpointReached(checkpointId),
      (endingId: string) => this.onEndingReached(endingId),
      (timerId: string) => this.onTimerExpired(timerId),
      (movement, complete) => this.startScriptedMovement(movement, complete),
      (id, sequence) => this.playDeathFlash(id, sequence),
      (direction, durationMs) => this.handleFade(direction, durationMs),
      (floorId, roomId, position, facing) => this.handleSwitchView(floorId, roomId, position, facing),
      (visibilityTargetId) => this.isVisibilityTargetInView(visibilityTargetId),
    );

    this.eventEngine.startFromCheckpoint(saveState.checkpointId);
    this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);

    // ── Expose on window for e2e ───────────────────────────────
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__ = this.inputManager;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_NARRATIVE_UI__ = this.narrativeUI;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__ = this.narrativeUI;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_MAP_RENDERER__ = this.mapRenderer;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_EVENT_ENGINE__ = this.eventEngine;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__ = {
        getPlayerPosition: () => ({ ...this.playerPosition }),
        setPlayerPosition: (position: { x: number; y: number }) => {
          this.playerPosition = { x: position.x, y: position.y };
          this.playerSprite.setPosition(position.x, position.y);
          this.eventEngine.updatePlayerPosition(this.playerPosition);
          this.syncCharacterDebugState();
        },
        interactWithNearestDoor: () => {
          if (this.inRoom) {
            this.returnToCorridor();
            return;
          }
          this.enterNearestDoor();
        },
        isScriptedMovementActive: () => this.scriptedMovementActive,
        getDeathFlashFrameLog: () => this.deathFlashManager.getFrameLog().map((entry) => ({ ...entry })),
        isDeathFlashActive: () => this.deathFlashManager.isActive(),
        getDeathFlashActiveObjectCount: () => this.deathFlashManager.getActiveObjectCount(),
        getStoryEntities: () => this.storyEntityDebugEntries.map((entry) => ({ ...entry })),
        getBranchVisualDebugState: () => this.getBranchVisualDebugState(),
      };
    }

    this.refreshStoryEntities();
  }

  update(_time: number, delta: number): void {
    this.inputManager.update();

    this.eventEngine.updatePlayerPosition(this.playerPosition);
    this.cameras.main.centerOn(this.playerPosition.x, this.playerPosition.y);
    // Update event engine (drives timers, waits, state transitions)
    this.eventEngine.update(delta);
    this.refreshStoryEntities();

    // Handle black screen overlay visibility based on lock reason
    this.updateBlackOverlay();

    if (this.endingActive) {
      // Game over — no movement or interaction beyond curtain display
      return;
    }

    // ── Player movement ────────────────────────────────────────
    const movementVector = this.inputManager.getMovementVector();
    this.handleMovement(movementVector, delta);

    // ── Interact ───────────────────────────────────────────────
    const interact = this.inputManager.consumeInteract();
    this.handleInteract(interact.action, interact.pressed);

    // ── Branch UI management ───────────────────────────────────
    this.updateBranchUI();

    // ── Character animation ────────────────────────────────────
    this.updateCharacterAnimation();

    // ── Camera follow ──────────────────────────────────────────
    this.cameras.main.centerOn(this.playerPosition.x, this.playerPosition.y);
  }

  // ═══════════════════════════════════════════════════════════════
  // Movement
  // ═══════════════════════════════════════════════════════════════

  private handleMovement(vector: { x: number; y: number }, delta: number): void {
    const dx = vector.x;
    const dy = vector.y;

    if (dx === 0 && dy === 0) {
      if (!this.scriptedMovementActive) {
        this.isMoving = false;
      }
      this.syncCharacterDebugState();
      return;
    }

    this.isMoving = true;
    this.currentDirection = resolveDirection(vector);

    const effectiveDelta = Math.min(delta, MAX_MOVEMENT_DELTA_MS);
    const speed = PLAYER_SPEED * (effectiveDelta / 1000);
    const len = Math.sqrt(dx * dx + dy * dy);
    const normX = dx / len;
    const normY = dy / len;

    const newX = this.playerPosition.x + normX * speed;
    const newY = this.playerPosition.y + normY * speed;

    // Clamp to walkable bounds
    const clamped = this.clampToWalkable(newX, newY);
    this.playerPosition = clamped;
    this.playerSprite.setPosition(clamped.x, clamped.y);
    this.eventEngine.updatePlayerPosition(this.playerPosition);
    this.syncCharacterDebugState();
  }

  private clampToWalkable(x: number, y: number): { x: number; y: number } {
    const bounds = this.inRoom && this.currentRoom
      ? this.collisionManager.getRoomWalkableBounds(this.currentRoom)
      : this.collisionManager.getWalkableBounds(this.currentFloor);

    let cx = Phaser.Math.Clamp(x, bounds.x + 16, bounds.x + bounds.width - 16);
    let cy = Phaser.Math.Clamp(y, bounds.y + 16, bounds.y + bounds.height - 16);

    // Also check collision zones
    const walkable = this.inRoom && this.currentRoom
      ? this.collisionManager.isRoomWalkable(cx, cy, this.currentRoom)
      : this.collisionManager.isWalkable(cx, cy, this.currentFloor);
    if (!walkable) {
      // Revert to original position if collision detected
      cx = this.playerPosition.x;
      cy = this.playerPosition.y;
    }

    return { x: cx, y: cy };
  }

  // ═══════════════════════════════════════════════════════════════
  // Interact
  // ═══════════════════════════════════════════════════════════════

  private handleInteract(action: string | null, pressed: boolean): void {
    if (!pressed || !action) return;

    if (action === 'F') {
      this.handleFInteract();
    } else if (action === 'Q') {
      this.handleQInteract();
    }
  }

  private handleFInteract(): void {
    if (this.eventEngine.isAmbientDialogueActive()) {
      this.eventEngine.dismissAmbientDialogue();
      return;
    }
    if (this.advanceDialogueIfAwaiting()) return;

    const engineState = this.eventEngine.getCurrentState();
    if (engineState === 'awaiting_interaction') {
      // If the player is at the interaction target, completeInteraction returns
      // true and the event engine advances — do NOT fall through to door entry.
      // If the player is at the wrong location, completeInteraction returns
      // false without changing state — fall through to door entry so the player
      // can still use doors/elevators while an interaction is pending.
      const completed = this.eventEngine.completeInteraction('F');
      if (completed) return;
    }
    if (engineState === 'awaiting_proximity') {
      // Same logic as awaiting_interaction: only return if the proximity
      // interaction actually completed. Otherwise fall through to door entry.
      const completed = this.eventEngine.completeInteraction('F');
      if (completed) return;
    }

    if (this.enterNearestDoor()) return;

    if (this.inRoom) {
      this.returnToCorridor();
    }
  }

  private enterNearestDoor(): boolean {
    if (!this.inRoom) {
      const door = this.mapRenderer.getInteractiveDoorNear(
        this.playerPosition.x,
        this.playerPosition.y,
        DOOR_PROXIMITY,
      );

      if (door) return this.handleDoorInteraction(door);

      const didInteract = this.mapRenderer.tryInteract(
        this.playerPosition.x,
        this.playerPosition.y,
      );
      if (didInteract) {
        const newFloor = this.mapRenderer.currentFloor;
        if (newFloor !== this.currentFloor) {
          this.currentFloor = newFloor;
          this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);
        }
        return true;
      }
    }

    return false;
  }

  private handleDoorInteraction(door: CorridorDoor): boolean {
    const interaction = door.interaction;

    if (this.eventEngine.attemptBlockedDoor(door.id)) {
      return false;
    }

    // Block door entry/exit when an interaction is pending in the player's current location.
    // The pending interaction has a physical target requiring the player to stand at a specific
    // point; using a door would teleport them away and prevent the interaction from completing.
    // (Proximity-based interactions are exempt: the proximity target may be inside a room the
    // player must enter, so falling through to door entry is the intended path.)
    if (this.eventEngine.isInteractionTargetInCurrentLocation()) {
      return false;
    }

    if (interaction.type === 'elevator') {
      const targetFloor = interaction.targetFloorId;
      this.mapRenderer.startElevatorTransition(targetFloor, () => {
        this.currentFloor = targetFloor;
        this.inRoom = false;
        this.currentRoom = null;
        this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);
        this.movePlayerToElevatorArrival(targetFloor);
      });
      return true;
    }

    if (interaction.type === 'roomTransition') {
      this.mapRenderer.renderRoom(interaction.targetRoomId);
      this.currentFloor = this.mapRenderer.currentFloor;
      this.inRoom = true;
      this.currentRoom = interaction.targetRoomId;
      this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);
      const spawnPoint = this.getRoomSpawnPoint(interaction.targetRoomId, interaction.spawnPointId);
      this.currentDirection = spawnPoint.facing;
      this.playerPosition = { x: spawnPoint.x, y: spawnPoint.y };
      this.playerSprite.setPosition(this.playerPosition.x, this.playerPosition.y);
      this.eventEngine.updatePlayerPosition(this.playerPosition);
      this.syncCharacterDebugState();
      return true;
    }

    return false;
  }

  private returnToCorridor(): void {
    const exitDoor = this.findExitDoorNearPlayer();
    if (this.inRoom && exitDoor) {
      this.exitToCorridorThroughDoor(exitDoor);
    }
  }

  private exitRoomViaDoor(entryDoorId: DoorId): void {
    if (!this.inRoom) return;
    const corridorDoor = this.findCorridorDoor(entryDoorId);
    if (!corridorDoor || corridorDoor.interaction.type !== 'roomTransition') return;
    if (corridorDoor.interaction.targetRoomId !== this.currentRoom) return;
    this.exitToCorridorThroughDoor(corridorDoor);
  }

  private exitToCorridorThroughDoor(door: CorridorDoor): void {
    const returnPosition = this.getCorridorReturnPosition(door);
    this.mapRenderer.renderCorridor(this.currentFloor);
    this.inRoom = false;
    this.currentRoom = null;
    this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);
    this.currentDirection = returnPosition.facing;
    this.playerPosition = { x: returnPosition.x, y: returnPosition.y };
    this.playerSprite.setPosition(this.playerPosition.x, this.playerPosition.y);
    this.eventEngine.updatePlayerPosition(this.playerPosition);
    this.syncCharacterDebugState();
  }

  private getRoomSpawnPoint(roomId: RoomId, spawnPointId: string) {
    const room = Object.values(schoolMaps.floors).map((floor) => floor.rooms[roomId]).find((candidate) => candidate !== undefined);
    const spawnPoint = room?.spawnPoints.find((spawn) => spawn.id === spawnPointId);
    if (!spawnPoint) {
      throw new Error(`Missing spawn point ${spawnPointId} for room ${roomId}`);
    }
    return spawnPoint;
  }

  private findExitDoorNearPlayer(): CorridorDoor | null {
    if (!this.inRoom || !this.currentRoom) {
      return null;
    }

    const room = this.findRoom(this.currentRoom);
    if (!room) {
      return null;
    }

    let closest: { door: CorridorDoor; distance: number } | null = null;

    for (const inRoomDoor of room.inRoomDoors) {
      const door = this.findCorridorDoor(inRoomDoor.entryDoorId);
      if (!door || door.interaction.type !== 'roomTransition') {
        continue;
      }
      if (door.interaction.targetRoomId !== room.id) {
        continue;
      }
      const doorCenterX = inRoomDoor.bounds.x + inRoomDoor.bounds.width / 2;
      const doorCenterY = inRoomDoor.bounds.y + inRoomDoor.bounds.height / 2;
      const distance = Phaser.Math.Distance.Between(this.playerPosition.x, this.playerPosition.y, doorCenterX, doorCenterY);
      if (distance <= DOOR_PROXIMITY && (!closest || distance < closest.distance)) {
        closest = { door, distance };
      }
    }

    return closest?.door ?? null;
  }

  private getCorridorReturnPosition(door: CorridorDoor): SpawnPoint {
    const walkable = schoolMaps.floors[door.floorId].corridor.walkableBounds[0]!;
    return {
      id: `${door.id}-return`,
      x: door.side === 'left' ? walkable.x + 24 : walkable.x + walkable.width - 24,
      y: door.bounds.y + door.bounds.height / 2,
      facing: door.side === 'left' ? 'right' : 'left',
    };
  }

  private findCorridorDoor(doorId: DoorId): CorridorDoor | null {
    for (const floor of Object.values(schoolMaps.floors)) {
      const door = floor.corridor.doors.find((candidate) => candidate.id === doorId);
      if (door) {
        return door;
      }
    }
    return null;
  }

  private findRoom(roomId: RoomId): RoomArea | null {
    for (const floor of Object.values(schoolMaps.floors)) {
      const room = floor.rooms[roomId];
      if (room) {
        return room;
      }
    }
    return null;
  }

  private handleQInteract(): void {
    // Q is used for contextual interactions (e.g., picking up heads in B-2 branch)
    if (this.advanceDialogueIfAwaiting()) return;
    this.eventEngine.completeInteraction('Q');
  }

  private movePlayerToElevatorArrival(floorId: FloorId): void {
    const spawnPoint = schoolMaps.floors[floorId].corridor.spawnPoints.find(
      (spawn) => spawn.id === `${floorId.toLowerCase()}-elevator-arrival`,
    )!;
    this.currentDirection = spawnPoint.facing;
    this.playerPosition = { x: spawnPoint.x, y: spawnPoint.y };
    this.playerSprite.setPosition(this.playerPosition.x, this.playerPosition.y);
    this.eventEngine.updatePlayerPosition(this.playerPosition);
    this.syncCharacterDebugState();
  }

  private advanceDialogueIfAwaiting(): boolean {
    if (this.eventEngine.getCurrentState() !== 'awaiting_advance') return false;
    this.eventEngine.advance();
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // Branch UI
  // ═══════════════════════════════════════════════════════════════

  private updateBranchUI(): void {
    const engineState = this.eventEngine.getCurrentState();

    if (engineState === 'awaiting_branch') {
      const pendingIds = this.eventEngine.getPendingBranchIds();
      // Only rebuild if branches changed
      const idsChanged =
        pendingIds.length !== this.branchIds.length ||
        pendingIds.some((id, i) => id !== this.branchIds[i]);

      if (idsChanged) {
        this.buildBranchChoices(pendingIds);
      }
    } else {
      if (this.branchIds.length > 0) {
        this.hideBranchChoices();
      }
    }
  }

  private buildBranchChoices(branchIds: readonly BranchId[]): void {
    this.hideBranchChoices();
    this.branchIds = [...branchIds];

    if (branchIds.length === 0) return;

    if (this.branchBg) {
      this.branchBg.setVisible(true);
      const height = 88 + branchIds.length * 62;
      this.branchBg.setSize(540, height);
      this.branchBg.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 76);
    }

    const branchLabels: Record<string, string> = {
      'A-1': '让我去看看芹菜怎么样了',
      'A-2': '让我尝尝',
      'B-1': '去找校长',
      'B-2': '思索',
    };

    branchIds.forEach((branchId, index) => {
      const yPos = GAME_HEIGHT / 2 + 40 + index * 60;

      const btn = this.add
        .rectangle(GAME_WIDTH / 2, yPos, 460, 46, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
        .setDepth(1501)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      applyPixelStrokeStyle(btn, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 1);

      const label = branchLabels[branchId] ?? branchId;
      const txt = applyPixelTextStyle(this.add
        .text(GAME_WIDTH / 2, yPos, label, {
          align: 'center',
          color: UI_THEME.colors.text,
          fontFamily: UI_THEME.font.ui,
          fontSize: '20px',
          fontStyle: 'bold',
        })
      )
        .setOrigin(0.5)
        .setDepth(1502)
        .setScrollFactor(0);

      btn.on('pointerover', () => btn.setFillStyle(UI_THEME.colors.borderMuted, UI_THEME.alpha.panelStrong));
      btn.on('pointerout', () => btn.setFillStyle(UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel));
      btn.on('pointerdown', () => btn.setFillStyle(UI_THEME.colors.accentPressed, UI_THEME.alpha.panelStrong));
      btn.on('pointerdown', () => {
        this.eventEngine.selectBranch(branchId as BranchId);
        this.hideBranchChoices();
      });

      this.branchButtons.push(btn);
      this.branchTexts.push(txt);
    });
  }

  private hideBranchChoices(): void {
    if (this.branchBg) this.branchBg.setVisible(false);
    for (const btn of this.branchButtons) {
      btn.destroy();
    }
    for (const txt of this.branchTexts) {
      txt.destroy();
    }
    this.branchButtons = [];
    this.branchTexts = [];
    this.branchIds = [];
  }

  private getBranchVisualDebugState(): Record<string, unknown> {
    return {
      theme: 'dark-pixel-horror',
      visible: this.branchIds.length > 0,
      background: this.branchBg ? this.boundsOf(this.branchBg) : null,
      buttons: this.branchButtons.map((button) => ({ fillColor: button.fillColor, bounds: this.boundsOf(button) })),
      labels: this.branchTexts.map((text) => ({ text: text.text, bounds: this.boundsOf(text) })),
    };
  }

  private boundsOf(object: Phaser.GameObjects.Components.GetBounds & Phaser.GameObjects.Components.Visible): { x: number; y: number; width: number; height: number; visible: boolean } {
    const bounds = object.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, visible: object.visible };
  }

  // ═══════════════════════════════════════════════════════════════
  // Character animation
  // ═══════════════════════════════════════════════════════════════

  private updateCharacterAnimation(): void {
    const engineCharId = this.eventEngine.getControllableCharacterId();
    if (engineCharId !== this.currentCharacter) {
      this.switchCharacterSprite(engineCharId);
    }

    if (!isWalkable(this.currentCharacter)) {
      return;
    }

    const config = WALK_ANIMATIONS[this.currentCharacter][this.currentDirection];
    const frameKey = this.isMoving
      ? config.frameKeys[Math.floor(this.time.now / 180) % config.frameKeys.length]
      : config.idleKey;

    if (frameKey && frameKey !== this.activeTextureKey && this.textures.exists(frameKey)) {
      this.playerSprite.setTexture(frameKey);
      this.activeTextureKey = frameKey;
    }

    setCharacterDebugState({ currentAnimationKey: frameKey ?? null });
  }

  private switchCharacterSprite(characterId: CharacterId): void {
    this.currentCharacter = characterId;

    if (isWalkable(characterId)) {
      const idleKey = this.getIdleKey(characterId, this.currentDirection);
      if (this.textures.exists(idleKey)) {
        this.playerSprite.setTexture(idleKey);
        this.activeTextureKey = idleKey;
      }
    }

    // Update character debug state
    const displayName = getDisplayName(characterId);
    setCharacterDebugState({
      currentCharacterId: characterId,
      currentDisplayName: displayName,
      currentAnimationKey: isWalkable(characterId)
        ? this.getIdleKey(characterId, this.currentDirection)
        : null,
    });
  }

  private syncCharacterDebugState(): void {
    setCharacterDebugState({
      currentCharacterId: this.currentCharacter,
      currentDisplayName: getDisplayName(this.currentCharacter),
      currentDirection: this.currentDirection,
      isMoving: this.isMoving,
    });
  }

  private getIdleKey(characterId: CharacterId, direction: CharacterDirection): string {
    if (isWalkable(characterId)) {
      return WALK_ANIMATIONS[characterId][direction].idleKey;
    }
    return 'sprite.yangYunBlue.down.idle'; // fallback
  }

  private ensureWhiteFallbackTexture(): void {
    if (this.textures.exists('__WHITE')) return;
    const texture = this.textures.createCanvas('__WHITE', 1, 1);
    if (!texture) return;
    const fallbackTexture = texture;
    const context = fallbackTexture.getContext();
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    fallbackTexture.refresh();
  }

  private startScriptedMovement(
    movement: ScriptedMovementRequest,
    complete: (position: { x: number; y: number }) => void,
  ): void {
    const from = { ...this.playerPosition };
    this.currentDirection = resolveDirection({
      x: movement.target.x - from.x,
      y: movement.target.y - from.y,
    });
    this.isMoving = true;
    this.scriptedMovementActive = true;
    this.syncCharacterDebugState();

    this.tweens.add({
      targets: this.playerPosition,
      x: movement.target.x,
      y: movement.target.y,
      duration: movement.durationMs,
      ease: 'Linear',
      onUpdate: () => {
        this.playerSprite.setPosition(this.playerPosition.x, this.playerPosition.y);
        this.eventEngine.updatePlayerPosition(this.playerPosition);
        this.syncCharacterDebugState();
      },
      onComplete: () => {
        this.playerPosition = { ...movement.target };
        this.playerSprite.setPosition(this.playerPosition.x, this.playerPosition.y);
        this.isMoving = false;
        this.scriptedMovementActive = false;
        this.eventEngine.updatePlayerPosition(this.playerPosition);
        this.syncCharacterDebugState();
        complete(this.playerPosition);
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EventEngine callbacks
  // ═══════════════════════════════════════════════════════════════

  private handleSwitchView(
    floorId: FloorId,
    roomId: RoomId | null,
    position?: { x: number; y: number },
    facing?: CharacterDirection,
  ): void {
    if (roomId !== this.currentRoom || floorId !== this.currentFloor) {
      if (roomId) {
        this.mapRenderer.renderRoom(roomId);
        this.inRoom = true;
        this.currentRoom = roomId;
      } else {
        this.mapRenderer.renderCorridor(floorId);
        this.inRoom = false;
        this.currentRoom = null;
      }
      this.currentFloor = floorId;
      this.eventEngine.updateLocation(this.currentFloor, this.currentRoom);
    }

    if (position) {
      this.playerPosition = { x: position.x, y: position.y };
      this.playerSprite.setPosition(position.x, position.y);
      this.eventEngine.updatePlayerPosition(this.playerPosition);
      this.syncCharacterDebugState();
    }

    if (facing) {
      this.currentDirection = facing;
      const idleKey = this.getIdleKey(this.currentCharacter, this.currentDirection);
      if (this.textures.exists(idleKey)) {
        this.playerSprite.setTexture(idleKey);
        this.activeTextureKey = idleKey;
      }
      this.syncCharacterDebugState();
    }
  }

  private onCheckpointReached(checkpointId: CheckpointId): void {
    // Update character to match checkpoint's expected playable character
    const act = storyManifest.acts.find((a) => a.status === 'playable');
    if (act) {
      const checkpoint = act.checkpoints.find((c) => c.id === checkpointId);
      if (checkpoint) {
        const expectedChar = checkpoint.playableCharacter;
        if (expectedChar !== this.currentCharacter) {
          this.switchCharacterSprite(expectedChar);
        }
      }
    }
  }

  private onEndingReached(endingId: string): void {
    // Handle game-over endings (no return-to-checkpoint)
    const act = storyManifest.acts.find((a) => a.status === 'playable');
    const ending = act?.endings.find((e) => e.id === endingId);

    if (ending && !ending.returnsToCheckpoint) {
      this.endingActive = true;
      this.inputManager.lock('ending');
    }
  }

  private onTimerExpired(timerId: string): void {
    switch (timerId) {
      case 'A-2-auto-eat-dan-yuxuan':
        this.eventEngine.loadBranchDirect('A-2');
        break;
      case 'survival-route-countdown':
        // 120s countdown expired — trigger saozi ending
        this.triggerEnding('saozi');
        break;
      case 'yang-yun-visible-failure-window':
        // 3s visibility window expired — trigger saozi ending
        this.triggerEnding('saozi');
        break;
      default:
        break;
    }
  }

  private triggerEnding(_endingId: string): void {
    this.endingActive = true;
    this.inputManager.lock('ending');
    this.narrativeUI.setCurtain(true, '臊子', '');
  }

  // ═══════════════════════════════════════════════════════════════
  // Visual effects
  // ═══════════════════════════════════════════════════════════════

  private updateBlackOverlay(): void {
    if (!this.blackOverlay) return;

    const lockReason = this.inputManager.getLockReason();
    if (this.deathFlashManager.isActive()) {
      this.blackOverlay.setVisible(false);
      return;
    }

    // Show black overlay for blackScreen or ending locks
    // (curtain handles its own black via NarrativeUIManager)
    if (lockReason === 'blackScreen' && !this.endingActive) {
      this.blackOverlay.setVisible(true);
    } else {
      this.blackOverlay.setVisible(false);
    }
  }

  private playDeathFlash(id: 'celery' | 'ruler', sequence: readonly DeathFlashFrame[]): void {
    this.deathFlashManager.play(id, sequence);
  }

  private handleFade(direction: 'in' | 'out', durationMs: number): void {
    const camera = this.cameras.main;
    if (direction === 'out') {
      camera.fadeOut(durationMs);
    } else {
      camera.fadeIn(durationMs);
    }
  }

  private isVisibilityTargetInView(visibilityTargetId: string): boolean {
    const act = storyManifest.acts.find((a) => a.status === 'playable');
    const target = act?.visibilityTargets?.find((candidate) => candidate.id === visibilityTargetId);
    if (!target) return false;

    if (target.floorId !== this.currentFloor) return false;
    if (target.roomId !== this.currentRoom) return false;

    return isRectInCameraView(this.cameras.main, target.rect);
  }

  private refreshStoryEntities(): void {
    const entries = buildStoryEntityDebugEntries(this.eventEngine.getStoryFlags(), {
      floorId: this.currentFloor,
      roomId: this.currentRoom,
    });
    const signature = entries.map((entry) => `${entry.id}:${entry.textureKey}:${entry.floorId}:${entry.roomId}:${entry.x}:${entry.y}`).join('|');
    if (signature === this.storyEntitySignature) return;

    for (const sprite of this.storyEntitySprites) {
      sprite.destroy();
    }
    this.storyEntitySprites = [];
    this.storyEntityDebugEntries = entries;
    this.storyEntitySignature = signature;

    for (const entry of entries) {
      if (!this.textures.exists(entry.textureKey)) continue;
      const sprite = this.add.image(entry.x, entry.y, entry.textureKey);
      sprite.setOrigin(0.5, 0.7);
      sprite.setDepth(entry.depth);
      this.storyEntitySprites.push(sprite);
    }
  }

  shutdown(): void {
    this.deathFlashManager?.cleanup();
    for (const sprite of this.storyEntitySprites) {
      sprite.destroy();
    }
    this.storyEntitySprites = [];
    this.storyEntityDebugEntries = [];
    this.storyEntitySignature = '';
    this.inputManager?.destroy();
    this.mapRenderer?.destroy();
    this.hideBranchChoices();
  }
}
