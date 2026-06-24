import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InputManager, InputLockReason } from '../input/InputManager';
import type { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { EventEngine, type ScriptedMovementRequest } from '../story/EventEngine';
import { resetSceneDebugState } from '../game/scaffoldState';
import { storyManifest, type StoryManifest } from '../data/story';
import { createDefaultSaveState, type SaveState } from '../state/saveState';
import { schoolMaps } from '../data/maps';

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
  minorEndings: { visible: boolean; body?: string; onConfirm?: () => void }[];
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
    minorEndings: [],
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
    setMinorEnding: vi.fn((visible: boolean, body?: string, onConfirm?: () => void) => { log.minorEndings.push({ visible, body, onConfirm }); }),
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
      { type: 'interaction', input: 'F', target: 'office door', result: 'enter', physicalTarget: { floorId: '4F', roomId: null, points: [{ x: 912, y: 868, radiusPx: 48 }] } },
      { type: 'dialogue', speaker: '系统', text: 'after' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

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

  it('Bug (B-2 position): branch B-2 switchView places Yang Yun inside 5F communication-control-5f, where he last stood at the end of checkpoint E', () => {
    const onSwitchView = vi.fn();
    const { engine } = createEngine({ onSwitchView });

    engine.startFromCheckpoint('G');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
    engine.selectBranch('B-2');

    engine.update(3000);
    engine.advance();
    engine.advance();
    engine.update(500);

    expect(onSwitchView).toHaveBeenCalledWith(
      '5F',
      'communication-control-5f',
      { x: 620, y: 240 },
      'up',
    );
  });

  it('Bug (communicationDisabled timing): checkpoint E sets communicationDisabled=true after Yang Yun completes the 5F shutdown F-interaction', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'E',
      controllableCharacterId: 'yangYunRed',
      storyFlags: { ...createDefaultSaveState().storyFlags, communicationDisabled: false },
    };
    const { engine } = createEngine({
      saveState,
      onScriptedMovement: (_movement, complete) => complete({ x: 760, y: 330 }),
    });

    engine.startFromCheckpoint('E');
    while (engine.getCurrentState() === 'awaiting_advance' || engine.getCurrentState() === 'waiting') {
      if (engine.getCurrentState() === 'awaiting_advance') engine.advance();
      else engine.update(1000);
    }
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('5F', 'communication-control-5f');
    engine.updatePlayerPosition({ x: 620, y: 240 });
    expect(engine.getStoryFlags().communicationDisabled).toBe(false);

    engine.completeInteraction('F');
    expect(engine.getStoryFlags().communicationDisabled).toBe(true);
  });

  it('Bug (B-2 recording): B-2 toggles yangYunRecordingActive around the player-controlled pickup segment', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-2');
    engine.update(3000);
    engine.advance();
    engine.advance();
    engine.update(500);
    engine.update(2000);
    engine.update(500);
    expect(engine.getStoryFlags().yangYunRecordingActive).toBe(true);
  });

  it('Bug (multi-flag condition): a command with an array condition runs only when ALL flags match', () => {
    const onSwitchView = vi.fn();
    const manifest = createSingleCheckpointManifest([
      { type: 'setFlag', id: 'a', value: true },
      { type: 'setFlag', id: 'b', value: false },
      {
        type: 'switchView',
        characterId: 'yangYunBlue',
        location: 'gated',
        locationState: { floorId: '4F', roomId: null },
        condition: [
          { flag: 'a', equals: true },
          { flag: 'b', equals: false },
        ],
      },
      { type: 'setFlag', id: 'b', value: true },
      {
        type: 'switchView',
        characterId: 'yangYunBlue',
        location: 'should-not-fire',
        locationState: { floorId: '5F', roomId: null },
        condition: [
          { flag: 'a', equals: true },
          { flag: 'b', equals: false },
        ],
      },
    ]);
    const { engine } = createEngine({ manifest, onSwitchView });
    engine.startFromCheckpoint('A');

    expect(onSwitchView).toHaveBeenCalledTimes(1);
    expect(onSwitchView).toHaveBeenCalledWith('4F', null, undefined, undefined);
  });

  it('Bug (continuous visibility): timer with visibilityRequiresContinuous resets to durationMs whenever predicate goes false', () => {
    let visible = true;
    const visibilityPredicate = (id: string) => id === 'test-target' && visible;
    const onTimerExpired = vi.fn();
    const manifest = createSingleCheckpointManifest([
      { type: 'timer', id: 'continuous-3s', action: 'start', durationMs: 3_000, trigger: 't', visibilityTargetId: 'test-target', visibilityRequiresContinuous: true },
      { type: 'dialogue', speaker: '系统', text: 'wait' },
    ]);
    const { engine } = createEngine({ manifest, visibilityPredicate, onTimerExpired });
    engine.startFromCheckpoint('A');

    engine.update(1500);
    visible = false;
    engine.update(2000);
    visible = true;
    engine.update(2000);
    expect(onTimerExpired).not.toHaveBeenCalled();

    engine.update(1100);
    expect(onTimerExpired).toHaveBeenCalledWith('continuous-3s');
  });

  it('Bug (cumulative visibility): timer without visibilityRequiresContinuous accumulates visible time across pauses', () => {
    let visible = true;
    const visibilityPredicate = (id: string) => id === 'test-target' && visible;
    const onTimerExpired = vi.fn();
    const manifest = createSingleCheckpointManifest([
      { type: 'timer', id: 'cumulative-3s', action: 'start', durationMs: 3_000, trigger: 't', visibilityTargetId: 'test-target' },
      { type: 'dialogue', speaker: '系统', text: 'wait' },
    ]);
    const { engine } = createEngine({ manifest, visibilityPredicate, onTimerExpired });
    engine.startFromCheckpoint('A');

    engine.update(1500);
    visible = false;
    engine.update(5000);
    visible = true;
    engine.update(1600);

    expect(onTimerExpired).toHaveBeenCalledWith('cumulative-3s');
  });

  it('Bug (phone cabinet condition): phoneCabinetInteractionDisabled=true blocks the GT phone-cabinet F-interaction in H', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: false, phoneCabinetInteractionDisabled: true },
    };
    const { engine, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);
    engine.advance();

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });
    engine.completeInteraction('F');

    expect(onCheckpointReached).not.toHaveBeenCalledWith('I');
  });

  it('Bug (replay buffer persistence): YangYunReplayManager persists buffer to localStorage on stopRecording and restores it on demand', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const stubScene = {
      add: { sprite: () => ({ setOrigin: () => ({ setDepth: () => ({ setVisible: () => ({}) }) }), setVisible: () => undefined, setPosition: () => undefined, setTexture: () => undefined, destroy: () => undefined, visible: false }) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;

    const writer = new YangYunReplayManager(stubScene);
    writer.startRecording(0);
    writer.recordFrame(100, 100, 200, '4F', 'gt1-classroom', 'down', { danYuxuan: false, qinHaorui: false });
    writer.recordFrame(200, 110, 200, '4F', 'gt1-classroom', 'right', { danYuxuan: true, qinHaorui: false });
    writer.stopRecording();

    expect(localStorage.getItem('ying-zhong-jiu.replay-buffer.v1')).toContain('"headPickups":{"danYuxuan":true,"qinHaorui":false}');

    const reader = new YangYunReplayManager(stubScene);
    reader.restoreBuffer();
    expect(reader.getDebugState().bufferLength).toBe(2);
  });

  it('Bug (H phone cabinet rendering): GT1 and GT2 classrooms have phoneCabinet interactionTargets at the cabinet spawn point', () => {
    const gt1 = Object.values(schoolMaps.floors).flatMap((f) => Object.values(f.rooms)).find((r) => r?.id === 'gt1-classroom');
    const gt2 = Object.values(schoolMaps.floors).flatMap((f) => Object.values(f.rooms)).find((r) => r?.id === 'gt2-classroom');
    expect(gt1?.interactionTargets.some((t) => t.id === 'gt1-phone-cabinet')).toBe(true);
    expect(gt2?.interactionTargets.some((t) => t.id === 'gt2-phone-cabinet')).toBe(true);
  });

  it('Bug (H comms online dialogue): after opening 5F comms, Dong Jihao says "搞定了。" before the cabinet task', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: true },
    };
    const { engine, uiLog } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });
    engine.completeInteraction('F');
    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('5F', 'communication-control-5f');
    engine.updatePlayerPosition({ x: 620, y: 240 });
    engine.completeInteraction('F');

    expect(uiLog.dialogues.some((d) => d.speaker === '董继豪' && d.text === '搞定了。')).toBe(true);
  });

  it('Bug (H comms disabled phone cabinet dialogue): clicking cabinet explains signal jammer before task update', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: true, phoneCabinetInteractionDisabled: false },
    };
    const { engine, uiLog } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });
    engine.completeInteraction('F');

    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '董继豪', text: '信号屏蔽器？这对吗？' });
    engine.advance();
    expect(uiLog.taskTexts[uiLog.taskTexts.length - 1]).toBe('去五楼开启学校通信');
  });

  it('Bug (H comms controller): 5F communication controller works during the 120s window without first touching the phone cabinet', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: true, phoneCabinetInteractionDisabled: false },
    };
    const { engine, uiLog } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);
    expect(engine.hasRunningTimer('survival-route-countdown')).toBe(true);

    engine.updateLocation('5F', 'communication-control-5f');
    engine.updatePlayerPosition({ x: 620, y: 240 });
    expect(engine.completeInteraction('F')).toBe(true);

    expect(engine.getStoryFlags().communicationDisabled).toBe(false);
    expect(uiLog.dialogues.some((d) => d.speaker === '董继豪' && d.text === '搞定了。')).toBe(true);
    engine.advance();
    expect(uiLog.taskTexts[uiLog.taskTexts.length - 1]).toBe('去班里偷同学手机报警');
  });

  it('Bug (saozi minor ending): triggering saozi shows minor-ending UI and advance returns to checkpoint H', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
    };
    const { engine, uiLog, onEndingReached, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.triggerEndingById('saozi');

    expect(onEndingReached).toHaveBeenCalledWith('saozi');
    expect(uiLog.minorEndings[uiLog.minorEndings.length - 1]).toMatchObject({ visible: true, body: '躁子' });
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance();
    engine.update(500);

    expect(onCheckpointReached).toHaveBeenCalledWith('H');
    expect(engine.getLocation()).toEqual({ floorId: '4F', roomId: 'office-4f' });
  });

  it('Bug (A-2 into A-1 front-door route): 滚去前门 does not relock input as scriptedMovement', () => {
    const { engine, inputLog, uiLog } = createEngine();

    engine.startFromCheckpoint('C');
    engine.loadBranchDirect('A-2');
    engine.update(2_000);
    engine.advance();
    engine.update(500);
    engine.update(1_000);
    engine.update(500);
    engine.advance();
    engine.update(2_000);
    engine.advance();
    engine.advance();
    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.attemptBlockedDoor('4f-gt2-back');
    engine.dismissAmbientDialogue();

    expect(inputLog.locked).toBe(false);
    expect(inputLog.interactContexts[inputLog.interactContexts.length - 1]).toBe('F');
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 760, y: 220 });
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '秦浩睿' });
  });

  it('Bug (Yang Yun replay animation): replay uses walking frames while replay position advances', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const textureCalls: string[] = [];
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn((key: string) => { textureCalls.push(key); return sprite; }),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 100, 200, '4F', 'gt1-classroom', 'right');
    manager.recordFrame(200, 160, 200, '4F', 'gt1-classroom', 'right');
    manager.stopRecording();
    manager.startReplay(0, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });

    manager.update(360, 16, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });

    expect(textureCalls).toContain('sprite.yangYunRed.right.step');
  });

  it('Bug (Yang Yun replay leg jitter): replay does not reset the same walking texture every update', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const textureCalls: string[] = [];
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn((key: string) => { textureCalls.push(key); return sprite; }),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 100, 300, '4F', 'gt1-classroom', 'up');
    manager.recordFrame(200, 100, 220, '4F', 'gt1-classroom', 'up');
    manager.recordFrame(220, 100, 140, '4F', 'gt1-classroom', 'up');
    manager.stopRecording();
    manager.startReplay(0, { x: 100, y: 300, floorId: '4F', roomId: 'gt1-classroom' });
    textureCalls.length = 0;

    manager.update(200, 16, { x: 100, y: 300, floorId: '4F', roomId: 'gt1-classroom' });
    manager.update(220, 16, { x: 100, y: 300, floorId: '4F', roomId: 'gt1-classroom' });

    expect(textureCalls).toEqual(['sprite.yangYunRed.up.rightLeg']);
  });

  it('Bug (Yang Yun replay leg jitter): replay stays moving between sparse same-direction samples', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const textureCalls: string[] = [];
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn((key: string) => { textureCalls.push(key); return sprite; }),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 100, 200, '4F', 'gt1-classroom', 'right');
    manager.recordFrame(200, 180, 200, '4F', 'gt1-classroom', 'right');
    manager.stopRecording();
    manager.startReplay(0, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });
    textureCalls.length = 0;

    manager.update(100, 16, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });

    expect(textureCalls.at(-1)).toBe('sprite.yangYunRed.right.step');
  });

  it('Bug (Yang Yun replay heads): replay exposes head pickup state from the active replay frame', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn(() => sprite),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    localStorage.setItem('ying-zhong-jiu.replay-buffer.v1', JSON.stringify([
      { t: 0, x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom', direction: 'right', headPickups: { danYuxuan: false, qinHaorui: false } },
      { t: 500, x: 120, y: 200, floorId: '4F', roomId: 'gt1-classroom', direction: 'right', headPickups: { danYuxuan: true, qinHaorui: false } },
      { t: 1_000, x: 140, y: 200, floorId: '4F', roomId: 'gt2-classroom', direction: 'right', headPickups: { danYuxuan: true, qinHaorui: true } },
    ]));
    const manager = new YangYunReplayManager(stubScene);

    manager.restoreBuffer();
    manager.startReplay(0, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });
    expect(manager.getDebugState()).toMatchObject({ headPickups: { danYuxuan: false, qinHaorui: false } });

    manager.update(500, 16, { x: 100, y: 200, floorId: '4F', roomId: 'gt1-classroom' });
    expect(manager.getDebugState()).toMatchObject({ headPickups: { danYuxuan: true, qinHaorui: false } });
  });

  it('Bug (survival chase): Yang Yun follows Dong Jihao across room and elevator boundaries', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn(() => sprite),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 160, 260, '4F', 'gt2-classroom', 'down');
    manager.stopRecording();
    manager.startReplay(0, { x: 160, y: 260, floorId: '4F', roomId: 'gt2-classroom' });
    manager.setChaseEnabled(true);
    manager.update(1_000, 1_000, { x: 760, y: 920, floorId: '4F', roomId: null });

    expect(manager.getDebugState()).toMatchObject({ phase: 'chasing', floorId: '4F', roomId: 'gt2-classroom', visible: false });

    manager.update(2_000, 1_000, { x: 520, y: 920, floorId: '5F', roomId: null });

    expect(manager.getDebugState()).toMatchObject({ phase: 'chasing', floorId: '4F', roomId: 'gt2-classroom', visible: false });
  });

  it('Bug (survival chase walking): Yang Yun does not teleport to Dong Jihao when chase crosses locations', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn(() => sprite),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 160, 260, '4F', 'gt2-classroom', 'down');
    manager.stopRecording();
    manager.startReplay(0, { x: 160, y: 260, floorId: '4F', roomId: 'gt2-classroom' });
    manager.setChaseEnabled(true);
    manager.update(1_000, 1_000, { x: 760, y: 920, floorId: '4F', roomId: null });

    expect(manager.getDebugState()).toMatchObject({ phase: 'chasing', floorId: '4F', roomId: 'gt2-classroom' });
    expect(manager.getDebugState().x).not.toBe(760);
    expect(manager.getDebugState().y).not.toBe(920);
  });

  it('Bug (survival chase jitter): Yang Yun keeps chase direction stable for tiny target jitter', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const textureCalls: string[] = [];
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn((key: string) => { textureCalls.push(key); return sprite; }),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 100, 100, '4F', null, 'right');
    manager.stopRecording();
    manager.startReplay(0, { x: 200, y: 100, floorId: '4F', roomId: null });
    manager.setChaseEnabled(true);
    manager.update(1_000, 1_000, { x: 200, y: 100, floorId: '4F', roomId: null });
    textureCalls.length = 0;

    manager.update(1_180, 16, { x: manager.getDebugState().x + 1, y: manager.getDebugState().y - 4, floorId: '4F', roomId: null });

    expect(textureCalls.every((key) => key.startsWith('sprite.yangYunRed.right.'))).toBe(true);
  });

  it('Bug (survival chase pathing): Yang Yun walks from GT2 through the corridor toward GT1 instead of freezing', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn(() => sprite),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 760, 330, '4F', 'gt2-classroom', 'down');
    manager.stopRecording();
    manager.startReplay(0, { x: 760, y: 520, floorId: '4F', roomId: 'gt1-classroom' });
    manager.setChaseEnabled(true);
    manager.update(1_000, 1_000, { x: 760, y: 520, floorId: '4F', roomId: 'gt1-classroom' });

    expect(manager.getDebugState()).toMatchObject({ phase: 'chasing', floorId: '4F', roomId: 'gt2-classroom' });
    expect(manager.getDebugState().y).toBeGreaterThan(330);

    for (let step = 0; step < 20 && manager.getDebugState().roomId === 'gt2-classroom'; step += 1) {
      manager.update(2_000 + step * 1_000, 1_000, { x: 760, y: 520, floorId: '4F', roomId: 'gt1-classroom' });
    }

    for (let step = 0; step < 20 && manager.getDebugState().roomId === null; step += 1) {
      manager.update(30_000 + step * 1_000, 1_000, { x: 760, y: 520, floorId: '4F', roomId: 'gt1-classroom' });
    }

    expect(manager.getDebugState()).toMatchObject({ floorId: '4F', roomId: 'gt1-classroom' });
    expect(manager.getDebugState().visible).toBe(true);
  });

  it('Bug (survival chase pathing): Yang Yun uses the elevator when the target changes floors', async () => {
    const { YangYunReplayManager } = await import('../scenes/YangYunReplayManager');
    const sprite = {
      visible: false,
      setOrigin: vi.fn(() => sprite),
      setDepth: vi.fn(() => sprite),
      setVisible: vi.fn((visible: boolean) => { sprite.visible = visible; return sprite; }),
      setPosition: vi.fn(() => sprite),
      setTexture: vi.fn(() => sprite),
      destroy: vi.fn(),
    };
    const stubScene = {
      add: { sprite: vi.fn(() => sprite) },
      textures: { exists: () => true },
    } as unknown as Phaser.Scene;
    const manager = new YangYunReplayManager(stubScene);

    manager.startRecording(0);
    manager.recordFrame(0, 796, 452, '4F', null, 'up');
    manager.stopRecording();
    manager.startReplay(0, { x: 796, y: 424, floorId: '5F', roomId: null });
    manager.setChaseEnabled(true);

    for (let step = 0; step < 5 && manager.getDebugState().floorId === '4F'; step += 1) {
      manager.update(1_000 + step * 1_000, 1_000, { x: 796, y: 424, floorId: '5F', roomId: null });
    }

    expect(manager.getDebugState()).toMatchObject({ floorId: '5F', roomId: null });
  });
});
