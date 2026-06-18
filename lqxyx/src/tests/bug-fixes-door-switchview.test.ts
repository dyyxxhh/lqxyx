import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InputManager, InputLockReason } from '../input/InputManager';
import type { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { EventEngine, type ScriptedMovementRequest } from '../story/EventEngine';
import { resetSceneDebugState } from '../game/scaffoldState';
import { storyManifest, type StoryManifest } from '../data/story';
import { createDefaultSaveState, type SaveState } from '../state/saveState';

interface MockInputCallLog {
  lockCalls: { reason: string }[];
  unlockCalls: number;
  interactContexts: (string | null)[];
  locked: boolean;
}

interface MockNarrativeCallLog {
  taskTexts: string[];
  dialogues: { speaker: string; text: string; portraitKey: string | undefined; tone: string | undefined }[];
  curtains: { visible: boolean; title?: string; subtitle?: string }[];
  rolePrompts: { characterId: string; displayName?: string }[];
  timerCalls: { remainingMs: number; visible: boolean }[];
}

function createMockInputManager(): { manager: InputManager; log: MockInputCallLog } {
  const log: MockInputCallLog = {
    lockCalls: [],
    unlockCalls: 0,
    interactContexts: [],
    locked: false,
  };
  const manager = {
    lock: vi.fn((reason: InputLockReason) => { log.locked = true; log.lockCalls.push({ reason }); }),
    unlock: vi.fn(() => { log.locked = false; log.unlockCalls++; }),
    isLocked: vi.fn(() => log.locked),
    setInteractContext: vi.fn((action: 'F' | 'Q' | null) => { log.interactContexts.push(action); }),
    getLockReason: vi.fn(() => (log.lockCalls.length > 0 ? log.lockCalls[log.lockCalls.length - 1]?.reason ?? null : null)),
    getMovementVector: vi.fn(() => ({ x: 0, y: 0 })),
    consumeInteract: vi.fn(() => ({ action: null, pressed: false })),
    isOnMobile: vi.fn(() => false),
    getFullscreenStatus: vi.fn(() => 'idle' as const),
    getOrientationStatus: vi.fn(() => 'landscape' as const),
    update: vi.fn(),
    destroy: vi.fn(),
  } as unknown as InputManager;
  return { manager, log };
}

function createMockNarrativeUI(): { ui: NarrativeUIManager; log: MockNarrativeCallLog } {
  const log: MockNarrativeCallLog = {
    taskTexts: [],
    dialogues: [],
    curtains: [],
    rolePrompts: [],
    timerCalls: [],
  };
  const ui = {
    setTask: vi.fn((text: string) => { log.taskTexts.push(text); }),
    setDialogue: vi.fn((speaker: string, text: string, portraitKey?: string, _visible?: boolean, tone?: string, _bodyAction?: string) => { log.dialogues.push({ speaker, text, portraitKey, tone }); }),
    setCurtain: vi.fn((visible: boolean, title?: string, subtitle?: string, _textureKey?: string) => { log.curtains.push({ visible, title, subtitle }); }),
    setRolePrompt: vi.fn((characterId: string, displayName?: string) => { log.rolePrompts.push({ characterId, displayName }); }),
    setTimer: vi.fn((remainingMs: number, visible: boolean) => { log.timerCalls.push({ remainingMs, visible }); }),
    setVisible: vi.fn(),
    getDisplayName: vi.fn((id: string) => id),
    getPortraitKey: vi.fn(() => undefined),
  } as unknown as NarrativeUIManager;
  return { ui, log };
}

function createEngine(overrides?: {
  onCheckpointReached?: (id: string) => void;
  onEndingReached?: (id: string) => void;
  onTimerExpired?: (id: string) => void;
  onScriptedMovement?: (movement: ScriptedMovementRequest, complete: (position: { x: number; y: number }) => void) => void;
  onDeathFlash?: (id: 'celery' | 'ruler', sequence: readonly { background: string; durationMs: number }[]) => void;
  saveState?: SaveState;
  manifest?: StoryManifest;
  visibilityPredicate?: (visibilityTargetId: string) => boolean;
  onSwitchView?: (floorId: string, roomId: string | null, position?: { x: number; y: number }, facing?: 'up' | 'down' | 'left' | 'right') => void;
}) {
  const { manager, log: inputLog } = createMockInputManager();
  const { ui, log: uiLog } = createMockNarrativeUI();
  const onCheckpointReached = overrides?.onCheckpointReached ?? vi.fn();
  const onEndingReached = overrides?.onEndingReached ?? vi.fn();
  const onTimerExpired = overrides?.onTimerExpired ?? vi.fn();
  const onScriptedMovement = overrides?.onScriptedMovement;
  const onDeathFlash = overrides?.onDeathFlash;
  const onSwitchView = overrides?.onSwitchView;
  const visibilityPredicate = overrides?.visibilityPredicate ?? (() => true);

  const engine = new EventEngine(
    overrides?.manifest ?? storyManifest,
    manager,
    ui,
    overrides?.saveState ?? createDefaultSaveState(),
    onCheckpointReached,
    onEndingReached,
    onTimerExpired,
    onScriptedMovement,
    onDeathFlash,
    undefined,
    onSwitchView,
    visibilityPredicate,
  );

  return { engine, manager, ui, inputLog, uiLog, onCheckpointReached, onEndingReached, onTimerExpired, onSwitchView };
}

function createSingleCheckpointManifest(
  commands: StoryManifest['acts'][number]['checkpoints'][number]['commands'],
): StoryManifest {
  return {
    ...storyManifest,
    acts: [
      {
        ...storyManifest.acts[0]!,
        checkpoints: [
          {
            id: 'A',
            label: 'Test checkpoint',
            location: 'Test',
            task: 'Test',
            playableCharacter: 'yangYunRed',
            commands,
          },
        ],
        branches: [],
        timers: [],
      },
    ],
  };
}

describe('Bug Fixes — A-1 door fall-through + switchView position', () => {
  beforeEach(() => {
    resetSceneDebugState();
    localStorage.clear();
  });

  it('Bug 6: F press at wrong location during awaiting_interaction does NOT fall through to door entry', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'GT2 back door', result: 'block', physicalTarget: { floorId: '4F', roomId: null, points: [{ x: 288, y: 324, radiusPx: 48 }] } },
      { type: 'dialogue', speaker: '系统', text: 'Go to front door' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 288, y: 676 });
    engine.completeInteraction('F');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('Bug 7: F press at wrong location during awaiting_proximity does NOT fall through to door entry', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'dialogue', speaker: '系统', text: 'dialogue 1' },
      { type: 'interaction', input: 'proximity', target: 'GT2 front door', result: 'enter', proximityTargetId: 'checkpoint-c-gt2-front-entry' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');
    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 772, y: 1136 });
    engine.completeInteraction('F');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
  });

  it('Bug 9 (regression): completeInteraction returns false when player is at wrong location during awaiting_proximity, allowing PlayScene to fall through to door entry', () => {
    // This test documents the contract that PlayScene.handleFInteract relies on:
    // When the player presses F during awaiting_proximity but is NOT at the
    // proximity target, completeInteraction('F') returns false WITHOUT changing
    // the engine state. PlayScene checks this return value to decide whether to
    // fall through to enterNearestDoor().
    //
    // Before the fix, PlayScene unconditionally returned after calling
    // completeInteraction, causing a deadlock where the player could not enter
    // any room or use any elevator while the engine was in awaiting_proximity.
    const manifest = createSingleCheckpointManifest([
      { type: 'dialogue', speaker: '系统', text: 'dialogue 1' },
      { type: 'interaction', input: 'proximity', target: 'GT2 front door', result: 'enter', proximityTargetId: 'checkpoint-c-gt2-front-entry' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');
    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    // Player is NOT at the proximity target (target is at 760,220 in gt2-classroom)
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 560, y: 920 });

    const result = engine.completeInteraction('F');
    expect(result).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');
  });

  it('Bug 10 (regression): completeInteraction returns false when player is at wrong location during awaiting_interaction, allowing PlayScene to fall through to door entry', () => {
    // Same contract as Bug 9 but for awaiting_interaction state.
    // PlayScene must check the return value to avoid the deadlock.
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'office door', result: 'enter', physicalTarget: { floorId: '4F', roomId: null, points: [{ x: 832, y: 868, radiusPx: 48 }] } },
      { type: 'dialogue', speaker: '系统', text: 'after' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    // Player is NOT at the physical target (target is at 832,868)
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 560, y: 920 });

    const result = engine.completeInteraction('F');
    expect(result).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('Bug 8: checkpoint E switchView fires onSwitchView with floor, room, and position', () => {
    const onSwitchView = vi.fn();
    const { engine } = createEngine({
      onSwitchView,
      onScriptedMovement: (_movement, complete) => complete({ x: 760, y: 330 }),
    });

    engine.startFromCheckpoint('E');

    expect(onSwitchView).toHaveBeenCalledWith('4F', 'gt2-classroom', { x: 772, y: 144 }, 'left');
  });

  it('switchView without position fires onSwitchView with undefined position and facing', () => {
    const onSwitchView = vi.fn();
    const manifest = createSingleCheckpointManifest([
      { type: 'switchView', characterId: 'yangYunBlue', location: 'test', locationState: { floorId: '4F', roomId: null } },
    ]);
    const { engine } = createEngine({ manifest, onSwitchView });
    engine.startFromCheckpoint('A');

    expect(onSwitchView).toHaveBeenCalledWith('4F', null, undefined, undefined);
  });
});
