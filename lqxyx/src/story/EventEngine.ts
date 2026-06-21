import type { CheckpointId, BranchId, CharacterId, StoryCommand, StoryManifest, DeathFlashFrame, StoryPoint, StoryProximityTarget, StoryScriptedMovementTarget, StoryPhysicalTargetRequirement, StoryPhysicalTarget } from '../data/story';
import type { FloorId, RoomId } from '../data/maps';
import type { InputLockReason, InputManager } from '../input/InputManager';
import type { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { getDialoguePortraitKey } from '../ui/uiState';
import type { SaveState, SaveTimerStatus, BranchChoiceStatus, SavePosition } from '../state/saveState';
import { saveSaveState } from '../state/saveState';
import { setStoryDebugState, type StoryTimerState } from './eventState';

type EngineState =
  | 'idle'
  | 'executing'
  | 'waiting'
  | 'awaiting_advance'
  | 'awaiting_branch'
  | 'awaiting_interaction'
  | 'awaiting_proximity'
  | 'awaiting_view'
  | 'awaiting_scripted_movement'
  | 'completed';

type BlackScreenDialoguePhase = 'initial_black' | 'dialogue' | null;
type WaitKind = 'normal' | 'rolePrompt';
const ROLE_PROMPT_DURATION_MS = 2_000;

export interface ScriptedMovementRequest {
  target: StoryPoint;
  durationMs: number;
  tolerancePx: number;
}

type ScriptedMovementComplete = (position: StoryPoint) => void;
type StoryControlState = 'player' | 'scripted' | 'hidden';
type DeathFlashRenderer = (id: 'celery' | 'ruler', sequence: readonly DeathFlashFrame[]) => void;
type FadeHandler = (direction: 'in' | 'out', durationMs: number) => void;
export type VisibilityPredicate = (visibilityTargetId: string) => boolean;
const PROXIMITY_FRESH_MOVEMENT_PX = 1;

/**
 * Mutable subset of SaveState that the event engine modifies during execution.
 * Persisted to SaveState via `buildSaveState()` on checkpoint saves.
 */
interface EngineMutable {
  checkpointId: CheckpointId;
  actId: 'act-1';
  floorId: FloorId;
  roomId: SaveState['roomId'];
  controllableCharacterId: CharacterId;
  task: string;
  storyFlags: Record<string, boolean>;
  branchChoices: Partial<Record<BranchId, BranchChoiceStatus>>;
  timers: Record<string, { status: SaveTimerStatus; durationMs: number; remainingMs: number }>;
  triggeredEvents: string[];
  position: SavePosition;
}

export class EventEngine {
  // ── Manifest ─────────────────────────────────────────────────
  private readonly manifest: StoryManifest;

  // ── Dependencies ─────────────────────────────────────────────
  private readonly inputManager: InputManager;
  private readonly narrativeUI: NarrativeUIManager;
  private readonly onCheckpointReached: (checkpointId: CheckpointId) => void;
  private readonly onEndingReached: (endingId: string) => void;
  private readonly onTimerExpired: ((timerId: string) => void) | null;
  private readonly onScriptedMovement: ((movement: ScriptedMovementRequest, complete: ScriptedMovementComplete) => void) | null;
  private readonly onDeathFlash: DeathFlashRenderer | null;
  private readonly onFade: FadeHandler | null;
  private readonly onSwitchView: ((floorId: FloorId, roomId: RoomId | null, position?: StoryPoint, facing?: 'up' | 'down' | 'left' | 'right') => void) | null;

  // ── Mutable save-derived state ───────────────────────────────
  private mutable: EngineMutable;

  // ── Execution state ──────────────────────────────────────────
  private state: EngineState = 'idle';
  private currentCommands: StoryCommand[] = [];
  private commandIndex = 0;
  private waitRemainingMs = 0;
  private waitKind: WaitKind = 'normal';
  private bsdwPhase: BlackScreenDialoguePhase = null;
  private pendingBranchIds: BranchId[] = [];
  private pendingInteractionInput: 'F' | 'Q' | null = null;
  private pendingInteractionPhysicalTarget: StoryPhysicalTargetRequirement | null = null;
  private pendingInteractionFlagMap: Extract<StoryCommand, { type: 'interaction' }>['physicalTargetFlagMap'] | null = null;
  private pendingInteractionCompleteFlags: readonly string[] | null = null;
  private pendingProximityTarget: StoryProximityTarget | null = null;
  private pendingProximityArmedPosition: StoryPoint | null = null;
  private pendingVisibilityTargetId: string | null = null;
  private currentControlState: StoryControlState = 'player';

  // ── Visibility predicate (gates awaitView and visibilityTargetId timers) ─
  private visibilityPredicate: VisibilityPredicate = () => false;

  // ── Game timers (runtime countdowns separate from save-state snapshots) ─
  private gameTimers: Map<string, { remainingMs: number; visibilityTargetId: string | null; visibilityRequiresContinuous: boolean; durationMs: number }> = new Map();

  // ── Blocked doors (story-driven, in-memory only) ────────────────
  private blockedDoors: Map<string, { message: string; speaker: string; shown: boolean }> = new Map();
  private ambientDialogueActive = false;
  private pendingReturnCheckpoint: CheckpointId | null = null;
  private checkpointSnapshots: Map<CheckpointId, SaveState> = new Map();

  // ── Double-trigger guard ─────────────────────────────────────
  private advanceGuard = false;
  private branchGuard = false;

  public constructor(
    manifest: StoryManifest,
    inputManager: InputManager,
    narrativeUI: NarrativeUIManager,
    saveState: SaveState,
    onCheckpointReached: (checkpointId: CheckpointId) => void,
    onEndingReached: (endingId: string) => void,
    onTimerExpired?: (timerId: string) => void,
    onScriptedMovement?: (movement: ScriptedMovementRequest, complete: ScriptedMovementComplete) => void,
    onDeathFlash?: DeathFlashRenderer,
    onFade?: FadeHandler,
    onSwitchView?: (floorId: FloorId, roomId: RoomId | null, position?: StoryPoint, facing?: 'up' | 'down' | 'left' | 'right') => void,
    visibilityPredicate?: VisibilityPredicate,
  ) {
    this.manifest = manifest;
    this.inputManager = inputManager;
    this.narrativeUI = narrativeUI;
    this.onCheckpointReached = onCheckpointReached;
    this.onEndingReached = onEndingReached;
    this.onTimerExpired = onTimerExpired ?? null;
    this.onScriptedMovement = onScriptedMovement ?? null;
    this.onDeathFlash = onDeathFlash ?? null;
    this.onFade = onFade ?? null;
    this.onSwitchView = onSwitchView ?? null;
    if (visibilityPredicate) this.visibilityPredicate = visibilityPredicate;

    // Seed mutable state from save state
    this.mutable = {
      checkpointId: saveState.checkpointId,
      actId: 'act-1',
      floorId: saveState.floorId,
      roomId: saveState.roomId,
      controllableCharacterId: saveState.controllableCharacterId,
      task: saveState.task,
      storyFlags: { ...saveState.storyFlags },
      branchChoices: { ...saveState.branchChoices },
      timers: structuredCloneSafeTimerRecord(saveState.timers),
      triggeredEvents: [...saveState.triggeredEvents],
      position: { ...saveState.position },
    };

    this.checkpointSnapshots.set(saveState.checkpointId, { ...saveState, position: { ...saveState.position } });

    this.syncDebugState();
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Start executing commands from a given checkpoint.
   */
  public startFromCheckpoint(checkpointId: CheckpointId): void {
    const act = this.manifest.acts.find((a) => a.status === 'playable');
    if (!act) return;

    const checkpoint = act.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return;

    this.mutable.controllableCharacterId = checkpoint.playableCharacter;
    this.currentCommands = [...checkpoint.commands];
    this.commandIndex = 0;
    this.waitRemainingMs = 0;
    this.waitKind = 'normal';
    this.bsdwPhase = null;
    this.pendingBranchIds = [];
    this.pendingInteractionInput = null;
    this.pendingInteractionPhysicalTarget = null;
    this.pendingProximityTarget = null;
    this.pendingProximityArmedPosition = null;
    this.pendingVisibilityTargetId = null;
    this.pendingReturnCheckpoint = null;
    this.currentControlState = 'player';
    this.advanceGuard = false;
    this.branchGuard = false;
    this.gameTimers.clear();

    this.state = 'executing';
    this.syncDebugState();
    this.executeNext();
  }

  public setVisibilityPredicate(predicate: VisibilityPredicate): void {
    this.visibilityPredicate = predicate;
  }

  /**
   * Called on F/interact press — advances past a blocking dialogue or interaction.
   */
  public advance(): void {
    if (this.advanceGuard) return;
    this.advanceGuard = true;

    if (this.state === 'awaiting_advance') {
      this.narrativeUI.setVisible('dialogue', false);
      this.narrativeUI.setMinorEnding(false);
      const returnCheckpoint = this.pendingReturnCheckpoint;
      if (returnCheckpoint) {
        this.pendingReturnCheckpoint = null;
        this.restoreCheckpointSnapshot(returnCheckpoint);
        this.startFromCheckpoint(returnCheckpoint);
        this.restoreControlLock();
        this.advanceGuard = false;
        return;
      }
      this.state = 'executing';
      this.restoreControlLock();
      this.commandIndex++;
      this.executeNext();
    }

    this.advanceGuard = false;
  }

  /**
   * Called when the player explicitly chooses a branch.
   */
  public selectBranch(branchId: BranchId): void {
    if (this.branchGuard) return;
    this.branchGuard = true;

    if (this.state !== 'awaiting_branch') {
      this.branchGuard = false;
      return;
    }

    if (!this.pendingBranchIds.includes(branchId)) {
      this.branchGuard = false;
      return;
    }

    this.mutable.branchChoices[branchId] = 'selected';
    this.stopActiveTimers();
    this.loadBranch(branchId);

    this.branchGuard = false;
  }

  /**
   * Frame update — drives timer countdowns and timed waits.
   * @param delta Milliseconds since last frame.
   */
  public update(delta: number): void {
    this.checkPendingProximity();
    this.checkPendingVisibility();

    const timerEntries = Array.from(this.gameTimers.entries());
    for (const [, timer] of timerEntries) {
      if (timer.visibilityTargetId && !this.visibilityPredicate(timer.visibilityTargetId)) {
        if (timer.visibilityRequiresContinuous) {
          timer.remainingMs = timer.durationMs;
        }
        continue;
      }
      timer.remainingMs -= delta;
    }

    const expiredTimerIds = timerEntries
      .filter(([, timer]) => timer.remainingMs <= 0)
      .map(([id]) => id);
    for (const id of expiredTimerIds) {
      const timer = this.gameTimers.get(id);
      if (!timer || timer.remainingMs > 0) continue;
      this.gameTimers.delete(id);
      if (this.mutable.timers[id]) {
        this.mutable.timers[id]!.status = 'stopped';
        this.mutable.timers[id]!.remainingMs = 0;
      }
      this.onTimerExpired?.(id);
    }

    // Ensure save-state timer snapshots stay in sync
    for (const id of this.gameTimers.keys()) {
      const gt = this.gameTimers.get(id);
      if (gt && this.mutable.timers[id]) {
        this.mutable.timers[id]!.remainingMs = Math.max(0, gt.remainingMs);
      }
    }

    const preferredTimer = this.gameTimers.get('survival-route-countdown') ?? this.gameTimers.get('survival-ending-countdown');
    const activeGameTimer = preferredTimer ?? (this.gameTimers.size > 0 ? this.gameTimers.values().next().value : undefined);
    if (activeGameTimer) {
      this.narrativeUI.setTimer(activeGameTimer.remainingMs, true);
    } else if (this.mutable.timers) {
      const runningSave = Object.values(this.mutable.timers).find((t) => t.status === 'running');
      if (runningSave) {
        this.narrativeUI.setTimer(runningSave.remainingMs, true);
      }
    }

    // Handle timed waits
    if (this.state === 'waiting') {
      this.waitRemainingMs -= delta;
      if (this.waitRemainingMs <= 0) {
        this.waitRemainingMs = 0;
        this.onWaitComplete();
      }
    }

    this.syncDebugState();
  }

  // ── Diagnostics ──────────────────────────────────────────────

  public getCurrentState(): EngineState {
    return this.state;
  }

  public getCommandIndex(): number {
    if (this.state === 'awaiting_advance') {
      return this.currentCommands
        .slice(0, this.commandIndex + 1)
        .filter((command) => command.type === 'dialogue').length;
    }
    return this.commandIndex;
  }

  public getPendingBranchIds(): readonly BranchId[] {
    return this.pendingBranchIds;
  }

  public getControllableCharacterId(): CharacterId {
    return this.mutable.controllableCharacterId;
  }

  public getStoryFlags(): Readonly<Record<string, boolean>> {
    return this.mutable.storyFlags;
  }

  public getLocation(): Readonly<{ floorId: FloorId; roomId: SaveState['roomId'] }> {
    return { floorId: this.mutable.floorId, roomId: this.mutable.roomId };
  }

  public isInteractionTargetInCurrentLocation(): boolean {
    if (this.state !== 'awaiting_interaction' || !this.pendingInteractionPhysicalTarget) return false;
    const targets: readonly StoryPhysicalTarget[] = Array.isArray(this.pendingInteractionPhysicalTarget)
      ? this.pendingInteractionPhysicalTarget
      : [this.pendingInteractionPhysicalTarget];

    // If the interaction can be satisfied across more than one distinct
    // (floor, room) location, the player legitimately needs to use doors /
    // the elevator to walk between them — do NOT block doors.
    const distinctLocations = new Set(targets.map((t) => `${t.floorId}::${String(t.roomId)}`));
    if (distinctLocations.size > 1) return false;

    return targets.some(
      (candidate) =>
        candidate.floorId === this.mutable.floorId && candidate.roomId === this.mutable.roomId,
    );
  }

  public updatePlayerPosition(position: StoryPoint): void {
    this.mutable.position = { ...this.mutable.position, x: position.x, y: position.y };
    this.checkPendingProximity();
  }

  public updateLocation(floorId: FloorId, roomId: SaveState['roomId']): void {
    this.mutable.floorId = floorId;
    this.mutable.roomId = roomId;
    this.syncDebugState();
  }

  public completeScriptedMovement(position: StoryPoint): void {
    if (this.state !== 'awaiting_scripted_movement') return;

    this.mutable.position = { ...this.mutable.position, x: position.x, y: position.y };
    this.restoreControlLock();
    this.state = 'executing';
    this.commandIndex++;
    this.syncDebugState();
    this.executeNext();
  }

  public completeInteraction(input: 'F' | 'Q'): boolean {
    if (input === 'F' && this.state === 'awaiting_proximity' && this.pendingProximityTarget) {
      const target = this.pendingProximityTarget;
      if (this.mutable.floorId !== target.floorId || this.mutable.roomId !== target.roomId) return false;

      const distance = Math.hypot(
        this.mutable.position.x - target.point.x,
        this.mutable.position.y - target.point.y,
      );
      if (distance > target.radiusPx) return false;

      this.pendingProximityTarget = null;
      this.pendingProximityArmedPosition = null;
      this.state = 'executing';
      this.commandIndex++;
      this.syncDebugState();
      this.executeNext();
      return true;
    }

    if (this.state !== 'awaiting_interaction' || this.pendingInteractionInput !== input) return false;
    const matchedTargetIndex = this.findMatchedTargetIndex(this.pendingInteractionPhysicalTarget);
    if (this.pendingInteractionPhysicalTarget && matchedTargetIndex === null) {
      return this.completePendingOverrideInteraction(input);
    }

    if (matchedTargetIndex !== null && this.pendingInteractionFlagMap) {
      for (const entry of this.pendingInteractionFlagMap) {
        if (entry.targetIndex !== matchedTargetIndex) continue;
        for (const flag of entry.flags) this.mutable.storyFlags[flag] = true;
      }
    }

    if (this.pendingInteractionCompleteFlags && !this.pendingInteractionCompleteFlags.every((flag) => this.mutable.storyFlags[flag] === true)) {
      this.syncDebugState();
      return true;
    }

    this.pendingInteractionInput = null;
    this.pendingInteractionPhysicalTarget = null;
    this.pendingInteractionFlagMap = null;
    this.pendingInteractionCompleteFlags = null;
    this.inputManager.setInteractContext(null);
    this.state = 'executing';
    this.commandIndex++;
    this.syncDebugState();
    this.executeNext();
    return true;
  }

  private completePendingOverrideInteraction(input: 'F' | 'Q'): boolean {
    for (let i = this.commandIndex + 1; i < this.currentCommands.length; i++) {
      const command = this.currentCommands[i];
      if (!command || command.type !== 'interaction' || command.input !== input || command.allowDuringPending !== true) continue;
      if (!this.shouldExecuteCommand(command)) continue;
      if (this.findMatchedTargetIndex(command.physicalTarget ?? null) === null) continue;

      this.pendingInteractionInput = null;
      this.pendingInteractionPhysicalTarget = null;
      this.pendingInteractionFlagMap = null;
      this.pendingInteractionCompleteFlags = null;
      this.inputManager.setInteractContext(null);
      this.state = 'executing';
      this.commandIndex = i + 1;
      this.syncDebugState();
      this.executeNext();
      return true;
    }

    return false;
  }

  /**
   * Directly load a branch bypassing pending-branch checks.
   * Used by timer-triggered branches (e.g., A-2 auto-eat).
   */
  public loadBranchDirect(branchId: BranchId): void {
    this.loadBranch(branchId);
  }

  // ── Command execution loop ───────────────────────────────────

  private hasNextCommandOfType(type: StoryCommand['type']): boolean {
    const nextIdx = this.commandIndex + 1;
    if (nextIdx >= this.currentCommands.length) return false;
    return this.currentCommands[nextIdx]?.type === type;
  }

  private executeNext(): void {
    if (this.state !== 'executing') return;

    while (this.commandIndex < this.currentCommands.length) {
      const command = this.currentCommands[this.commandIndex];
      if (!command) break;

      if (!this.shouldExecuteCommand(command)) {
        this.commandIndex++;
        continue;
      }

      const blocked = this.executeCommand(command);

      if (blocked) {
        // Command requires waiting or user input — stop looping
        return;
      }

      this.commandIndex++;
    }

    // Reached end of commands
    if (this.commandIndex >= this.currentCommands.length) {
      this.state = 'idle';
      this.syncDebugState();
    }
  }

  /**
   * Execute a single command.
   * @returns true if the command blocks execution (needs wait or user input).
   */
  private executeCommand(command: StoryCommand): boolean {
    switch (command.type) {
      case 'checkpoint':
        this.handleCheckpoint(command);
        return false;

      case 'gotoCheckpoint':
        this.startFromCheckpoint(command.id);
        return true;

      case 'task':
        this.handleTask(command);
        return false;

      case 'dialogue':
        this.handleDialogue(command);
        return true; // blocks for advance

      case 'switchCharacter':
        this.handleSwitchCharacter(command);
        return this.state === 'waiting';

      case 'setControl':
        this.handleSetControl(command);
        return this.state === 'awaiting_scripted_movement';

      case 'wait':
        this.startWait(command.durationMs);
        return true;

      case 'blackScreenDialogueWait':
        this.handleBlackScreenDialogueWait(command);
        return true;

      case 'fade':
        this.onFade?.(command.direction, command.durationMs);
        this.startWait(command.durationMs);
        return true;

      case 'blackScreen':
        this.handleBlackScreen(command);
        return true;

      case 'deathFlash':
        this.handleDeathFlash(command);
        return true;

      case 'branch':
        this.handleBranch(command);
        if (this.hasNextCommandOfType('branch')) {
          return false;
        }
        this.state = 'awaiting_branch';
        this.syncDebugState();
        return true;

      case 'timer':
        this.handleTimer(command);
        return false;

      case 'awaitView':
        this.handleAwaitView(command);
        return this.state === 'awaiting_view';

      case 'interaction':
        this.handleInteraction(command);
        return this.state === 'awaiting_proximity' || this.state === 'awaiting_interaction';

      case 'setFlag':
        this.handleSetFlag(command);
        return false;

      case 'switchView':
        this.handleSwitchView(command);
        return false;

      case 'ending':
        this.handleEnding(command);
        // Minor endings (returnsToCheckpoint) park at awaiting_advance and
        // block until the player confirms via the "返回检查点" button.
        // Major endings stay non-blocking so a curtain command can follow.
        return this.state === 'awaiting_advance';

      case 'curtain':
        this.handleCurtain(command);
        return false;

      case 'blockDoor':
        this.handleBlockDoor(command);
        return false;

      case 'unblockDoor':
        this.handleUnblockDoor(command);
        return false;

      default:
        return false;
    }
  }

  // ── Command handlers ─────────────────────────────────────────

  private shouldExecuteCommand(command: StoryCommand): boolean {
    if (!command.condition) return true;
    const conditions = Array.isArray(command.condition) ? command.condition : [command.condition];
    return conditions.every((c) => (this.mutable.storyFlags[c.flag] ?? false) === c.equals);
  }

  private handleCheckpoint(command: Extract<StoryCommand, { type: 'checkpoint' }>): void {
    this.mutable.checkpointId = command.id;
    this.mutable.triggeredEvents = [...this.mutable.triggeredEvents, `checkpoint-${command.id}`];
    this.currentControlState = 'player';
    this.restoreControlLock();

    this.checkpointSnapshots.set(command.id, this.buildSaveState());
    this.persistSave();
    this.onCheckpointReached(command.id);
  }

  private handleTask(command: Extract<StoryCommand, { type: 'task' }>): void {
    this.mutable.task = command.text;
    this.narrativeUI.setTask(command.text);
  }

  private handleDialogue(command: Extract<StoryCommand, { type: 'dialogue' }>): void {
    this.inputManager.lock('dialogue');
    this.narrativeUI.setDialogue(
      command.speaker,
      command.text,
      getDialoguePortraitKey(command.speaker, this.mutable.controllableCharacterId),
      true,
      command.tone,
      command.bodyAction,
    );
    this.state = 'awaiting_advance';
    this.syncDebugState();
  }

  private handleSwitchCharacter(command: Extract<StoryCommand, { type: 'switchCharacter' }>): void {
    this.mutable.controllableCharacterId = command.characterId;
    this.currentControlState = command.control;
    if (command.control === 'hidden') {
      // Hiding a character is not a "you are now [X]" transition — skip the role prompt entirely.
      this.restoreControlLock();
      return;
    }
    this.narrativeUI.setRolePrompt(command.characterId, command.visibleName);
    const rolePromptController = this.narrativeUI as unknown as { isRolePromptBlocking?: () => boolean };
    if (rolePromptController.isRolePromptBlocking?.() === true) {
      this.inputManager.lock('rolePrompt');
      this.startWait(ROLE_PROMPT_DURATION_MS, 'rolePrompt');
    } else {
      this.restoreControlLock();
    }
  }

  private handleSetControl(command: Extract<StoryCommand, { type: 'setControl' }>): void {
    if (command.enabled) {
      this.inputManager.unlock();
    } else {
        const reason: InputLockReason = (['dialogue', 'rolePrompt', 'blackScreen', 'elevatorFade', 'scriptedMovement', 'ending'] as const).includes(
        command.reason as InputLockReason,
      )
        ? (command.reason as InputLockReason)
        : 'scriptedMovement';
      this.inputManager.lock(reason);

      if (command.scriptedMovementId) {
        const movement = this.findScriptedMovementTarget(command.scriptedMovementId);
        if (!movement) return;

        this.state = 'awaiting_scripted_movement';
        this.syncDebugState();

        const request: ScriptedMovementRequest = {
          target: { ...movement.target },
          durationMs: movement.durationMs,
          tolerancePx: movement.tolerancePx,
        };
        if (this.onScriptedMovement) {
          this.onScriptedMovement(request, (position) => this.completeScriptedMovement(position));
        } else {
          this.completeScriptedMovement(request.target);
        }
      }
    }
  }

  private handleBlackScreen(command: Extract<StoryCommand, { type: 'blackScreen' }>): void {
    this.inputManager.lock('blackScreen');
    const bloodTexture = command.asset === '血迹黑屏' ? 'transition.bloodBlackScreen' : undefined;
    this.narrativeUI.setCurtain(true, '', '', bloodTexture);
    this.startWait(command.durationMs);
  }

  private handleBlackScreenDialogueWait(command: Extract<StoryCommand, { type: 'blackScreenDialogueWait' }>): void {
    this.inputManager.lock('blackScreen');
    this.bsdwPhase = 'initial_black';
    // Show black overlay
    this.narrativeUI.setCurtain(true, '', '');
    // Wait 500ms for initial black screen
    this.startWait(command.durationMs);
  }

  private handleDeathFlash(command: Extract<StoryCommand, { type: 'deathFlash' }>): void {
    this.inputManager.lock('blackScreen');
    this.onDeathFlash?.(command.id, command.sequence);
    const totalMs = sumDeathFlashDuration(command.sequence);
    this.startWait(totalMs);
  }

  private handleBranch(command: Extract<StoryCommand, { type: 'branch' }>): void {
    if (!this.pendingBranchIds.includes(command.id)) {
      this.pendingBranchIds.push(command.id);
    }
  }

  private stopActiveTimers(): void {
    for (const id of Object.keys(this.mutable.timers)) {
      if (this.mutable.timers[id]) {
        this.mutable.timers[id]!.status = 'stopped';
        this.mutable.timers[id]!.remainingMs = 0;
      }
    }
    this.gameTimers.clear();
    this.narrativeUI.setTimer(0, false);
  }

  public stopAllTimers(): void {
    this.stopActiveTimers();
  }

  public hasRunningTimer(timerId: string): boolean {
    return this.gameTimers.has(timerId) || this.mutable.timers[timerId]?.status === 'running';
  }

  private handleTimer(command: Extract<StoryCommand, { type: 'timer' }>): void {
    const id = command.id;

    switch (command.action) {
      case 'start': {
        const durationMs = command.durationMs ?? 0;
        this.gameTimers.set(id, {
          remainingMs: durationMs,
          visibilityTargetId: command.visibilityTargetId ?? null,
          visibilityRequiresContinuous: command.visibilityRequiresContinuous === true,
          durationMs,
        });
        this.mutable.timers[id] = {
          status: 'running',
          durationMs,
          remainingMs: durationMs,
        };
        this.narrativeUI.setTimer(durationMs, true);
        break;
      }
      case 'stop': {
        this.gameTimers.delete(id);
        if (this.mutable.timers[id]) {
          this.mutable.timers[id]!.status = 'stopped';
        }
        this.narrativeUI.setTimer(0, false);
        break;
      }
      case 'reset': {
        const durationMs = command.durationMs ?? 0;
        this.gameTimers.set(id, {
          remainingMs: durationMs,
          visibilityTargetId: command.visibilityTargetId ?? null,
          visibilityRequiresContinuous: command.visibilityRequiresContinuous === true,
          durationMs,
        });
        this.mutable.timers[id] = {
          status: 'running',
          durationMs,
          remainingMs: durationMs,
        };
        this.narrativeUI.setTimer(durationMs, true);
        break;
      }
    }
  }

  private handleAwaitView(command: Extract<StoryCommand, { type: 'awaitView' }>): void {
    if (this.visibilityPredicate(command.visibilityTargetId)) {
      this.pendingVisibilityTargetId = null;
      return;
    }
    this.pendingVisibilityTargetId = command.visibilityTargetId;
    this.state = 'awaiting_view';
    this.syncDebugState();
  }

  private checkPendingVisibility(): void {
    if (this.state !== 'awaiting_view' || !this.pendingVisibilityTargetId) return;
    if (!this.visibilityPredicate(this.pendingVisibilityTargetId)) return;

    this.pendingVisibilityTargetId = null;
    this.state = 'executing';
    this.commandIndex++;
    this.syncDebugState();
    this.executeNext();
  }

  private findMatchedTargetIndex(target: StoryPhysicalTargetRequirement | null): number | null {
    if (!target) return null;
    const targets: readonly StoryPhysicalTarget[] = Array.isArray(target) ? target : [target];
    for (let i = 0; i < targets.length; i++) {
      const candidate = targets[i]!;
      if (this.mutable.floorId !== candidate.floorId || this.mutable.roomId !== candidate.roomId) continue;
      if (candidate.points.some((point) => Math.hypot(
        this.mutable.position.x - point.x,
        this.mutable.position.y - point.y,
      ) <= point.radiusPx)) return i;
    }
    return null;
  }

  private handleInteraction(command: Extract<StoryCommand, { type: 'interaction' }>): void {
    if (command.input === 'F' || command.input === 'Q') {
      this.pendingInteractionInput = command.input;
      this.pendingInteractionPhysicalTarget = command.physicalTarget ?? null;
      this.pendingInteractionFlagMap = command.physicalTargetFlagMap ?? null;
      this.pendingInteractionCompleteFlags = command.completeWhenFlags ?? null;
      this.inputManager.setInteractContext(command.input);
      this.currentControlState = 'player';
      this.inputManager.unlock();
      this.state = 'awaiting_interaction';
      this.syncDebugState();
      return;
    }

    if (command.input === 'proximity' && command.proximityTargetId) {
      const target = this.findProximityTarget(command.proximityTargetId);
      if (!target) return;

      this.pendingProximityTarget = target;
      this.pendingProximityArmedPosition = { x: this.mutable.position.x, y: this.mutable.position.y };
      this.inputManager.setInteractContext('F');
      this.currentControlState = 'player';
      this.inputManager.unlock();
      this.state = 'awaiting_proximity';
      this.syncDebugState();
    }
  }

  private handleSetFlag(command: Extract<StoryCommand, { type: 'setFlag' }>): void {
    this.mutable.storyFlags[command.id] = command.value;
  }

  private handleBlockDoor(command: Extract<StoryCommand, { type: 'blockDoor' }>): void {
    this.blockedDoors.set(command.doorId, {
      message: command.message,
      speaker: command.speaker ?? '',
      shown: false,
    });
  }

  private handleUnblockDoor(command: Extract<StoryCommand, { type: 'unblockDoor' }>): void {
    this.blockedDoors.delete(command.doorId);
  }

  public attemptBlockedDoor(doorId: string): boolean {
    const block = this.blockedDoors.get(doorId);
    if (!block) return false;
    if (!block.shown && !this.ambientDialogueActive && !this.inputManager.isLocked()) {
      block.shown = true;
      this.ambientDialogueActive = true;
      this.inputManager.lock('dialogue');
      this.narrativeUI.setDialogue(
        block.speaker,
        block.message,
        getDialoguePortraitKey(block.speaker, this.mutable.controllableCharacterId),
        true,
      );
    }
    return true;
  }

  public isAmbientDialogueActive(): boolean {
    return this.ambientDialogueActive;
  }

  public dismissAmbientDialogue(): void {
    if (!this.ambientDialogueActive) return;
    this.ambientDialogueActive = false;
    this.narrativeUI.setVisible('dialogue', false);
    this.restoreControlLock();
  }

  private handleSwitchView(command: Extract<StoryCommand, { type: 'switchView' }>): void {
    if (command.locationState) {
      this.mutable.floorId = command.locationState.floorId;
      this.mutable.roomId = command.locationState.roomId;
    }

    if (command.characterId) {
      this.mutable.controllableCharacterId = command.characterId;
    }

    this.onSwitchView?.(
      this.mutable.floorId,
      this.mutable.roomId,
      'position' in command ? (command as StoryCommand & { position?: StoryPoint }).position : undefined,
      'facing' in command ? (command as StoryCommand & { facing?: 'up' | 'down' | 'left' | 'right' }).facing : undefined,
    );
    this.syncDebugState();
  }

  private handleEnding(command: Extract<StoryCommand, { type: 'ending' }>): void {
    this.inputManager.lock('ending');
    this.mutable.triggeredEvents = [...this.mutable.triggeredEvents, `ending-${command.id}`];
    this.onEndingReached(command.id);

    if (command.returnsToCheckpoint) {
      this.pendingReturnCheckpoint = command.returnsToCheckpoint;
      this.narrativeUI.setMinorEnding(true, command.title, () => this.advance());
      this.state = 'awaiting_advance';
    }

    this.syncDebugState();
  }

  public triggerEndingById(endingId: string): void {
    const act = this.manifest.acts.find((a) => a.status === 'playable');
    const ending = act?.endings.find((candidate) => candidate.id === endingId);
    if (!ending) return;
    this.stopActiveTimers();
    this.handleEnding({
      type: 'ending',
      id: ending.id,
      title: ending.title,
      ...(ending.returnsToCheckpoint ? { returnsToCheckpoint: ending.returnsToCheckpoint } : {}),
    });
  }

  private handleCurtain(command: Extract<StoryCommand, { type: 'curtain' }>): void {
    this.narrativeUI.setCurtain(true, command.title, command.subtitle);
  }

  // ── Timing helpers ───────────────────────────────────────────

  private startWait(ms: number, kind: WaitKind = 'normal'): void {
    this.waitRemainingMs = Math.max(0, ms);
    this.waitKind = kind;
    this.state = 'waiting';
    this.syncDebugState();
  }

  private onWaitComplete(): void {
    if (this.waitKind === 'rolePrompt') {
      this.waitKind = 'normal';
      this.narrativeUI.setVisible('rolePrompt', false);
      this.state = 'executing';
      this.commandIndex++;
      this.restoreControlLock();
      this.syncDebugState();
      this.executeNext();
      return;
    }

    // If we were in a blackScreenDialogueWait flow
    if (this.bsdwPhase === 'initial_black') {
      // Phase 1 complete: black screen waited 500ms → show dialogue then wait 500ms more
      this.bsdwPhase = 'dialogue';

      // Hide curtain and show dialogue on top
      this.narrativeUI.setCurtain(false);

      // Show dialogue — use generic "系统" speaker for B-1 style, or show dialogue from surrounding context
      this.narrativeUI.setDialogue('', '', undefined, true);

      // Start the second 500ms wait
      this.startWait(500);
      return;
    }

    if (this.bsdwPhase === 'dialogue') {
      // Phase 2 complete: hide dialogue, unlock, advance
      this.bsdwPhase = null;
      this.inputManager.unlock();
      this.narrativeUI.setCurtain(false);
      this.narrativeUI.setDialogue('', '', undefined, false);
      this.state = 'executing';
      this.commandIndex++;
      this.syncDebugState();
      this.executeNext();
      return;
    }

    // Normal wait complete: hide black screen curtain if it was shown
    this.narrativeUI.setCurtain(false);
    // Don't unlock here — the previous command handler already set the lock state
    this.state = 'executing';
    this.commandIndex++;
    this.syncDebugState();
    this.executeNext();
  }



  private restoreControlLock(): void {
    if (this.state === 'awaiting_advance' || this.state === 'waiting') return;

    if (this.currentControlState === 'player') {
      this.inputManager.unlock();
    } else {
      this.inputManager.lock('scriptedMovement');
    }
  }

  private checkPendingProximity(): void {
    if (this.state !== 'awaiting_proximity' || !this.pendingProximityTarget || !this.pendingProximityArmedPosition) return;

    const target = this.pendingProximityTarget;
    if (this.mutable.floorId !== target.floorId || this.mutable.roomId !== target.roomId) return;

    const distance = Math.hypot(
      this.mutable.position.x - target.point.x,
      this.mutable.position.y - target.point.y,
    );
    const movedSinceArmed = Math.hypot(
      this.mutable.position.x - this.pendingProximityArmedPosition.x,
      this.mutable.position.y - this.pendingProximityArmedPosition.y,
    );

    if (distance > target.radiusPx || movedSinceArmed <= PROXIMITY_FRESH_MOVEMENT_PX) return;

    this.pendingProximityTarget = null;
    this.pendingProximityArmedPosition = null;
    this.state = 'executing';
    this.commandIndex++;
    this.syncDebugState();
    this.executeNext();
  }

  private findProximityTarget(id: string): StoryProximityTarget | null {
    const act = this.manifest.acts.find((a) => a.status === 'playable');
    return act?.proximityTargets?.find((target) => target.id === id) ?? null;
  }

  private findScriptedMovementTarget(id: string): StoryScriptedMovementTarget | null {
    const act = this.manifest.acts.find((a) => a.status === 'playable');
    return act?.scriptedMovementTargets?.find((target) => target.id === id) ?? null;
  }

  // ── Branch support ───────────────────────────────────────────

  private loadBranch(branchId: BranchId): void {
    const act = this.manifest.acts.find((a) => a.status === 'playable');
    if (!act) return;

    const branch = act.branches.find((b) => b.id === branchId);
    if (!branch) return;

    this.stopActiveTimers();
    this.currentCommands = [...branch.commands];
    this.commandIndex = 0;
    this.waitRemainingMs = 0;
    this.bsdwPhase = null;
    this.pendingBranchIds = [];
    this.pendingInteractionInput = null;
    this.pendingInteractionPhysicalTarget = null;
    this.pendingProximityTarget = null;
    this.pendingProximityArmedPosition = null;
    this.pendingVisibilityTargetId = null;
    this.pendingReturnCheckpoint = null;
    this.currentControlState = 'player';
    this.advanceGuard = false;
    this.state = 'executing';
    this.syncDebugState();
    this.executeNext();
  }

  // ── Save persistence ─────────────────────────────────────────

  private persistSave(): void {
    saveSaveState(this.buildSaveState());
  }

  private buildSaveState(): SaveState {
    return {
      schemaVersion: 1,
      checkpointId: this.mutable.checkpointId,
      actId: this.mutable.actId,
      floorId: this.mutable.floorId,
      roomId: this.mutable.roomId,
      position: { ...this.mutable.position },
      controllableCharacterId: this.mutable.controllableCharacterId,
      task: this.mutable.task,
      storyFlags: { ...this.mutable.storyFlags },
      branchChoices: { ...this.mutable.branchChoices },
      timers: { ...this.mutable.timers },
      inventory: [],
      pickups: {},
      triggeredEvents: [...this.mutable.triggeredEvents],
    };
  }

  private restoreCheckpointSnapshot(checkpointId: CheckpointId): void {
    const snapshot = this.checkpointSnapshots.get(checkpointId);
    if (!snapshot) return;

    this.mutable = {
      checkpointId: snapshot.checkpointId,
      actId: 'act-1',
      floorId: snapshot.floorId,
      roomId: snapshot.roomId,
      controllableCharacterId: snapshot.controllableCharacterId,
      task: snapshot.task,
      storyFlags: { ...snapshot.storyFlags },
      branchChoices: { ...snapshot.branchChoices },
      timers: structuredCloneSafeTimerRecord(snapshot.timers),
      triggeredEvents: [...snapshot.triggeredEvents],
      position: { ...snapshot.position },
    };
    this.narrativeUI.setCurtain(false);
    this.onFade?.('in', 0);
    this.onSwitchView?.(snapshot.floorId, snapshot.roomId, { x: snapshot.position.x, y: snapshot.position.y }, snapshot.position.facing);
  }

  // ── Debug state sync ─────────────────────────────────────────

  private syncDebugState(): void {
    const activeTimers: StoryTimerState[] = [];
    for (const [id, t] of this.gameTimers) {
      activeTimers.push({ id, remainingMs: Math.max(0, t.remainingMs) });
    }

    setStoryDebugState({
      currentCheckpointId: this.mutable.checkpointId,
      currentActId: this.mutable.actId,
      currentCommandIndex: this.commandIndex,
      isExecuting: this.state !== 'idle' && this.state !== 'completed',
      activeTimers,
      pendingBranchId: this.pendingBranchIds.length > 0 ? this.pendingBranchIds[0] ?? null : null,
      currentEndingId: this.mutable.triggeredEvents.find((e) => e.startsWith('ending-'))?.replace('ending-', '') ?? null,
    });
  }
}

// ── Helpers ────────────────────────────────────────────────────

function sumDeathFlashDuration(sequence: DeathFlashFrame[]): number {
  return sequence.reduce((sum, frame) => sum + frame.durationMs, 0);
}

function structuredCloneSafeTimerRecord(
  timers: Readonly<Record<string, { readonly status: string; readonly durationMs: number; readonly remainingMs: number }>>,
): Record<string, { status: SaveTimerStatus; durationMs: number; remainingMs: number }> {
  const result: Record<string, { status: SaveTimerStatus; durationMs: number; remainingMs: number }> = {};
  for (const [key, val] of Object.entries(timers)) {
    const status: SaveTimerStatus =
      val.status === 'running' || val.status === 'paused' || val.status === 'stopped' ? val.status : 'stopped';
    result[key] = {
      status,
      durationMs: val.durationMs,
      remainingMs: val.remainingMs,
    };
  }
  return result;
}
