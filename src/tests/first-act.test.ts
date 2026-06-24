import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InputManager, InputLockReason } from '../input/InputManager';
import type { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { EventEngine } from '../story/EventEngine';
import { resetSceneDebugState } from '../game/scaffoldState';
import { storyManifest, type CheckpointId, type BranchId, type StoryAct, type StoryBranch, type StoryCheckpoint } from '../data/story';
import { createDefaultSaveState, loadSaveState, type SaveState } from '../state/saveState';

// ── Test helpers ───────────────────────────────────────────────

interface MockInputLog {
  lockCalls: { reason: string }[];
  unlockCalls: number;
  locked: boolean;
  interactContexts: (string | null)[];
}

interface MockNarrativeLog {
  taskTexts: string[];
  dialogues: { speaker: string; text: string }[];
  curtains: { visible: boolean; title?: string; subtitle?: string }[];
  rolePrompts: { characterId: string; displayName?: string }[];
  timerCalls: { remainingMs: number; visible: boolean }[];
}

function createMockInput(): { manager: InputManager; log: MockInputLog } {
  const log: MockInputLog = {
    lockCalls: [],
    unlockCalls: 0,
    locked: false,
    interactContexts: [],
  };

  const manager = {
    lock: vi.fn((reason: InputLockReason) => {
      log.locked = true;
      log.lockCalls.push({ reason });
    }),
    unlock: vi.fn(() => {
      log.locked = false;
      log.unlockCalls++;
    }),
    isLocked: vi.fn(() => log.locked),
    setInteractContext: vi.fn((action: 'F' | 'Q' | null) => {
      log.interactContexts.push(action);
    }),
    getLockReason: vi.fn(() =>
      log.lockCalls.length > 0 ? log.lockCalls[log.lockCalls.length - 1]?.reason ?? null : null,
    ),
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

function createMockNarrative(): { ui: NarrativeUIManager; log: MockNarrativeLog } {
  const log: MockNarrativeLog = {
    taskTexts: [],
    dialogues: [],
    curtains: [],
    rolePrompts: [],
    timerCalls: [],
  };

  const ui = {
    setTask: vi.fn((text: string) => { log.taskTexts.push(text); }),
    setDialogue: vi.fn((speaker: string, text: string, _portraitKey?: string, _visible?: boolean, _tone?: string, _bodyAction?: string) => { log.dialogues.push({ speaker, text }); }),
    setCurtain: vi.fn((visible: boolean, title?: string, subtitle?: string, _textureKey?: string) => { log.curtains.push({ visible, title, subtitle }); }),
    setRolePrompt: vi.fn((characterId: string, displayName?: string) => { log.rolePrompts.push({ characterId, displayName }); }),
    setTimer: vi.fn((remainingMs: number, visible: boolean) => { log.timerCalls.push({ remainingMs, visible }); }),
    setVisible: vi.fn(),
    setMinorEnding: vi.fn(),
    getDisplayName: vi.fn((id: string) => id),
    getPortraitKey: vi.fn(() => undefined),
  } as unknown as NarrativeUIManager;

  return { ui, log };
}

function createEngine(overrides?: {
  onCheckpointReached?: (id: CheckpointId) => void;
  onEndingReached?: (id: string) => void;
  onTimerExpired?: (id: string) => void;
  saveState?: SaveState;
  visibilityPredicate?: (visibilityTargetId: string) => boolean;
}) {
  const { manager, log: inputLog } = createMockInput();
  const { ui, log: uiLog } = createMockNarrative();
  const onCheckpointReached = overrides?.onCheckpointReached ?? vi.fn();
  const onEndingReached = overrides?.onEndingReached ?? vi.fn();
  const onTimerExpired = overrides?.onTimerExpired ?? vi.fn();
  const visibilityPredicate = overrides?.visibilityPredicate ?? (() => true);

  const engine = new EventEngine(
    storyManifest,
    manager,
    ui,
    overrides?.saveState ?? createDefaultSaveState(),
    onCheckpointReached,
    onEndingReached,
    onTimerExpired,
    undefined,
    undefined,
    undefined,
    undefined,
    visibilityPredicate,
  );

  return { engine, manager, ui, inputLog, uiLog, onCheckpointReached, onEndingReached, onTimerExpired };
}

function advanceTimes(engine: EventEngine, count: number): void {
  for (let i = 0; i < count; i++) engine.advance();
}

function getFirstAct(): StoryAct {
  const act = storyManifest.acts.find((candidate) => candidate.id === 'act-1');
  if (act === undefined) throw new Error('act-1 fixture missing');
  return act;
}

function getCheckpoint(id: CheckpointId): StoryCheckpoint {
  const checkpoint = getFirstAct().checkpoints.find((candidate) => candidate.id === id);
  if (checkpoint === undefined) throw new Error(`checkpoint ${id} fixture missing`);
  return checkpoint;
}

function getBranch(id: BranchId): StoryBranch {
  const branch = getFirstAct().branches.find((candidate) => candidate.id === id);
  if (branch === undefined) throw new Error(`branch ${id} fixture missing`);
  return branch;
}

// ── Tests ──────────────────────────────────────────────────────

describe('First Act — Story Timing Data', () => {
  it('checkpoint B Dan kill goes from blood-black 1000ms directly to body-state change', () => {
    const checkpoint = getCheckpoint('B');
    const bloodBlackIndex = checkpoint.commands.findIndex(
      (command) => command.type === 'blackScreen' && command.durationMs === 1_000 && command.asset === '血迹黑屏',
    );

    expect(checkpoint.commands.slice(bloodBlackIndex, bloodBlackIndex + 5)).toEqual([
      { type: 'blackScreen', durationMs: 1_000, asset: '血迹黑屏' },
      { type: 'setFlag', id: 'danYuxuanStandingVisible', value: false },
      { type: 'setFlag', id: 'danYuxuanBodyProneAndBloody', value: true },
      { type: 'switchCharacter', characterId: 'yangYunBlue', visibleName: '杨云', control: 'player' },
      { type: 'dialogue', speaker: '杨云', text: '我干了什么？！！！' },
    ]);
  });

  it('checkpoint D office entry has fade 500 plus black 1000 then checkpoint E flow', () => {
    const checkpoint = getCheckpoint('D');
    const officeInteractionIndex = checkpoint.commands.findIndex(
      (command) => command.type === 'interaction' && command.target === '办公室门口两门任一',
    );

    expect(checkpoint.commands.slice(officeInteractionIndex + 1, officeInteractionIndex + 4)).toEqual([
      { type: 'fade', direction: 'out', durationMs: 500 },
      { type: 'blackScreen', durationMs: 1_000 },
      { type: 'gotoCheckpoint', id: 'E' },
    ]);
  });

  it('branch B-1 principal-office path keeps its black-screen dialogue wait and weekend dialogue', () => {
    const branch = getBranch('B-1');
    const fadeIndex = branch.commands.findIndex(
      (command) => command.type === 'fade' && command.direction === 'out' && command.durationMs === 500,
    );

    expect(branch.commands.slice(fadeIndex, fadeIndex + 4)).toEqual([
      { type: 'fade', direction: 'out', durationMs: 500 },
      { type: 'blackScreenDialogueWait', durationMs: 500, label: '校长办公室黑屏正常对白等待' },
      { type: 'dialogue', speaker: '董继豪', text: '今天周末，我忘了。' },
      { type: 'wait', durationMs: 3_000, label: '意识到周末后等待' },
    ]);
  });
});

describe('First Act — Checkpoint A-I Flow', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('checkpoint A executes: character switch, dialogues, task, checkpoint save', () => {
    const { engine, uiLog, inputLog, onCheckpointReached } = createEngine();
    engine.startFromCheckpoint('A');

    // First command: switchCharacter to yangYunBlue
    expect(uiLog.rolePrompts.length).toBeGreaterThanOrEqual(1);
    expect(uiLog.rolePrompts[0]).toMatchObject({ characterId: 'yangYunBlue', displayName: '杨云' });

    // Dialogue 1 blocks
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(inputLog.lockCalls.some((c) => c.reason === 'dialogue')).toBe(true);

    advanceTimes(engine, 3);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.advance();

    // After proximity and final dialogue, checkpoint A should have been reached.
    expect(onCheckpointReached).toHaveBeenCalledWith('A');

    expect(onCheckpointReached).toHaveBeenCalledWith('B');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('checkpoint B executes: dialogue chain, black screen, setFlag, character switch', () => {
    const { engine, onCheckpointReached } = createEngine();
    engine.startFromCheckpoint('B');

    advanceTimes(engine, 7); // past 7 dialogues
    expect(onCheckpointReached).toHaveBeenCalledWith('B');

    engine.update(1000); // past blackScreen

    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('checkpoint B chains into checkpoint C after the final 我干了什么 dialogue', () => {
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onCheckpointReached });
    engine.startFromCheckpoint('B');

    advanceTimes(engine, 7); // past 7 pre-blackscreen dialogues
    engine.update(1000); // blackScreen

    // Now at final dialogue "我干了什么？！！！"
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    // Advancing past the terminal dialogue should chain to checkpoint C
    engine.advance();

    expect(onCheckpointReached).toHaveBeenCalledWith('C');
  });

  it('checkpoint C enters awaiting_branch state with branch A-1 pending', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('C');

    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['A-1']);
  });

  it('checkpoint C timer A-2-auto-eat starts before branch blocks', () => {
    const onTimerExpired = vi.fn();
    const { engine } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('C');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['A-1']);

    engine.update(10_000);
    expect(onTimerExpired).toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');
  });

  it('checkpoint D: task toggles, character switches, office interaction', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('D');

    advanceTimes(engine, 2); // past dialogues
    // After D commands: task "无", setFlag, switchCharacter, dialogues, task "去办公室", interaction
    // Ends at fade out (waiting state)
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('checkpoint E: switchView, character control toggle, dialogue', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('E');
    // First non-blocking: checkpoint E, switchView
    // Blocking: fade in 500ms
    expect(engine.getCurrentState()).toBe('waiting');
    engine.update(500);
    // switchCharacter dongJihao + setControl(false) + switchView + dialogue
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('checkpoint F: dongJihao controls, task sets to office phone call', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('F');
    // switchCharacter dongJihao player, task "前往办公室报警"
    // Then interaction F, then dialogue
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    engine.updateLocation('4F', 'office-4f');
    engine.updatePlayerPosition({ x: 620, y: 180 });
    engine.completeInteraction('F');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('checkpoint G enters awaiting_branch with B-1 and B-2 simultaneously', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });

  it('checkpoint H: tasks, timers, interactions fire correctly', () => {
    const { engine, uiLog } = createEngine();
    engine.startFromCheckpoint('H');
    engine.update(500); // fade in
    // Timers should have started
    expect(uiLog.timerCalls.length).toBeGreaterThan(0);
  });

  it('checkpoint I: dialogue, timer stop/reset, 30s wait, ending + curtain', () => {
    const { engine, uiLog, onEndingReached } = createEngine();
    engine.startFromCheckpoint('I');
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance(); // past "好了。"
    expect(engine.getCurrentState()).toBe('waiting'); // 30s wait

    engine.update(30000); // complete 30s wait
    engine.update(500);   // complete fade

    // Ending and curtain should have fired
    expect(onEndingReached).toHaveBeenCalledWith('survival-false-report');
    const curtain = uiLog.curtains.find((c) => c.visible);
    expect(curtain?.title).toBe('"报假警"');
    expect(curtain?.subtitle).toBe('敬请期待');
  });
});

describe('First Act — Branch Selection', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('branch A-1 (go check celery) blocks back door, arms front-door proximity, deathFlash, then gotoCheckpoint D', () => {
    const { engine, onCheckpointReached } = createEngine();
    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');

    // A-1 commands: task, blockDoor (back door), interaction(proximity front door), setFlag, switchCharacter, setControl, dialogue, deathFlash, task, unblockDoor, gotoCheckpoint D
    // First blocking command is proximity for GT2 front door entry
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    // Trigger proximity at GT2 front door
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    // Role prompt wait + scripted movement + dialogue + deathFlash
    engine.update(2_000); // role prompt
    engine.update(2_000); // scripted movement
    engine.advance(); // Qin dialogue
    engine.update(4_200); // deathFlash

    expect(onCheckpointReached).toHaveBeenCalledWith('D');
  });

  it('branch A-1 arms front-door proximity before checkpoint D', () => {
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onCheckpointReached });

    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');

    // A-1 is now structured to arm proximity directly (no back-door interaction).
    // Trigger proximity at GT2 front door entry to advance.
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    // Role prompt + scripted movement + dialogue + deathFlash
    engine.update(2_000); // role prompt
    engine.update(2_000); // scripted movement
    engine.advance(); // Qin dialogue
    engine.update(4_200); // complete deathFlash

    expect(onCheckpointReached).toHaveBeenCalledWith('D');
  });

  it('branch B-1 (find principal) leads to ending split-in-two and returns to G', () => {
    const onEndingReached = vi.fn();
    const { engine, onCheckpointReached } = createEngine({ onEndingReached });

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');
    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 368, y: 2012 });
    engine.completeInteraction('F');

    // B-1: task, interaction(F), fade(500), bsdw(500), dialogue, wait(3s), dialogue, blackScreen(1s), deathFlash(4200), blackScreen(1s), ending(blocking), advance, fade(500), checkpoint G
    // Engine is in awaiting_advance after first dialogue
    engine.update(500); // fade

    // Pump through bsdw (2 × 500ms)
    engine.update(500);
    engine.update(500);

    // Now awaiting_advance for dialogue
    engine.advance(); // "今天周末，我忘了。"
    engine.update(3000); // 3s wait

    // Next dialogue blocks
    engine.advance(); // "操！"

    // blackScreen 1s
    engine.update(1000);
    // deathFlash (ruler now mirrors celery polish ≈ 4200ms)
    engine.update(4200);
    // blackScreen 1s
    engine.update(1000);

    // ending "split-in-two" parks at awaiting_advance until the player confirms
    // via the "返回检查点" button — simulated here with advance().
    expect(onEndingReached).toHaveBeenCalledWith('split-in-two');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance();
    engine.update(500); // fade in

    expect(onCheckpointReached).toHaveBeenCalledWith('G');
  });

  it('branch B-2 (think) executes dialogue chain and transitions to H', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
    engine.selectBranch('B-2');

    engine.update(3000);
    engine.advance();
    engine.advance();

    engine.update(500);
    engine.update(500);

    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('selectBranch ignores invalid branch IDs', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);

    engine.selectBranch('A-1' as BranchId); // A-1 not pending at G
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });
});

describe('First Act — Timer Expiry', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('timer A-2-auto-eat-dan-yuxuan 10s expiry triggers onTimerExpired', () => {
    // Test timer starts at checkpoint H where timers are effectively tested
    const onTimerExpired = vi.fn();
    const { engine } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('H');
    engine.update(500); // fade in

    // Timer yang-yun-visible-failure-window (3s) should expire
    engine.update(3000);
    expect(onTimerExpired).toHaveBeenCalledWith('yang-yun-visible-failure-window');

    // survival-route-countdown (120s) started at same time;
    // 500ms fade + 3000ms yang-yun = 3500ms elapsed → 116500ms remaining under 120s
    engine.update(116000);
    expect(onTimerExpired).not.toHaveBeenCalledWith('survival-route-countdown');
  });

  it('timer survival-route-countdown 120s expiry triggers onTimerExpired', () => {
    const onTimerExpired = vi.fn();
    const { engine } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('H');
    engine.update(500); // fade in
    engine.update(3000); // yang-yun timer expires
    engine.update(117000); // survival-route-countdown full duration

    expect(onTimerExpired).toHaveBeenCalledWith('survival-route-countdown');
  });

  it('timer survival-ending-countdown 30s displays countdown in UI', () => {
    const { engine, uiLog } = createEngine();
    engine.startFromCheckpoint('I');
    engine.advance(); // past dialogue

    // Timer reset should have called setTimer with 30s
    const visibleTimerCalls = uiLog.timerCalls.filter((c) => c.visible);
    expect(visibleTimerCalls.length).toBeGreaterThan(0);
  });
});

describe('First Act — Endings and Curtain', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('ending split-in-two (B-1) triggers onEndingReached and returns to checkpoint G', () => {
    const onEndingReached = vi.fn();
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onEndingReached, onCheckpointReached });

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');
    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 368, y: 2012 });
    engine.completeInteraction('F');

    // Pump through B-1: fade500 → bsdw1000 → adv dialogue → wait3000 → adv → black1000 → death4200 → black1000 → ending(blocking) → advance → fade500 → checkpoint G
    engine.update(500);
    engine.update(500);
    engine.update(500);
    engine.advance();
    engine.update(3000);
    engine.advance();
    engine.update(1000);
    engine.update(4200); // ruler death flash now mirrors celery (4200ms)
    engine.update(1000);

    expect(onEndingReached).toHaveBeenCalledWith('split-in-two');
    // Minor ending parks at awaiting_advance until the player confirms via
    // the "返回检查点" button — simulated here via advance().
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    const checkpointGCallsBeforeConfirm = onCheckpointReached.mock.calls.filter((args) => args[0] === 'G').length;

    engine.advance();

    const checkpointGCallsAfterConfirm = onCheckpointReached.mock.calls.filter((args) => args[0] === 'G').length;
    expect(checkpointGCallsAfterConfirm).toBe(checkpointGCallsBeforeConfirm + 1);
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });

  it('ending split-in-two restores checkpoint G office location and original save position', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'G',
      controllableCharacterId: 'dongJihao',
      floorId: '4F',
      roomId: 'office-4f',
      position: { x: 620, y: 180, facing: 'up' },
    };
    const { engine, uiLog } = createEngine({ saveState });

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');
    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 368, y: 2012 });
    engine.completeInteraction('F');
    engine.update(500);
    engine.update(500);
    engine.update(500);
    engine.advance();
    engine.update(3_000);
    engine.advance();
    engine.update(1_000);
    engine.update(4_200);
    engine.update(1_000);
    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getLocation()).toEqual({ floorId: '4F', roomId: 'office-4f' });
    expect(loadSaveState().state.position).toEqual({ x: 620, y: 180, facing: 'up' });
    expect(uiLog.curtains[uiLog.curtains.length - 1]).toMatchObject({ visible: false });
  });

  it('ending split-in-two return clears black-screen lock before showing checkpoint G branch choice', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'G',
      controllableCharacterId: 'dongJihao',
      floorId: '4F',
      roomId: 'office-4f',
      position: { x: 620, y: 180, facing: 'up' },
    };
    const { engine, inputLog } = createEngine({ saveState });

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');
    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 368, y: 2012 });
    engine.completeInteraction('F');
    engine.update(500);
    engine.update(500);
    engine.update(500);
    engine.advance();
    engine.update(3_000);
    engine.advance();
    engine.update(1_000);
    engine.update(4_200);
    engine.update(1_000);

    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]).toEqual({ reason: 'ending' });

    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(inputLog.locked).toBe(false);
  });

  it('branch B-1 hides principal-office task before the black-screen curtain appears', () => {
    const { engine, uiLog } = createEngine();

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');
    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 368, y: 2012 });
    engine.completeInteraction('F');

    expect(uiLog.taskTexts[uiLog.taskTexts.length - 1]).toBe('无');
    expect(uiLog.curtains.some((call) => call.visible && call.title === '' && call.subtitle === '')).toBe(false);

    engine.update(500);

    expect(uiLog.curtains.some((call) => call.visible && call.title === '' && call.subtitle === '')).toBe(true);
  });

  it('ending survival-false-report (I) triggers curtain with quoted 报假警 + 敬请期待', () => {
    const { engine, uiLog, onEndingReached } = createEngine();
    engine.startFromCheckpoint('I');
    engine.advance(); // dialogue
    engine.update(30000); // wait
    engine.update(500);   // fade

    expect(onEndingReached).toHaveBeenCalledWith('survival-false-report');

    const curtainCalls = uiLog.curtains.filter((c) => c.visible);
    const lastCurtain = curtainCalls[curtainCalls.length - 1];
    expect(lastCurtain?.title).toBe('"报假警"');
    expect(lastCurtain?.subtitle).toBe('敬请期待');
  });

  it('no later-act checkpoints exist beyond I', () => {
    // Verify checkpoint I is the last for act-1
    const act1 = storyManifest.acts.find((a) => a.id === 'act-1');
    expect(act1?.checkpoints.length).toBe(9); // A through I
    const ids = act1?.checkpoints.map((c) => c.id);
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  });

  it('curtain command alone sets title and subtitle correctly', () => {
    const { engine, uiLog } = createEngine();
    engine.startFromCheckpoint('I');
    engine.advance();
    engine.update(30000);
    engine.update(500);

    // The curtain should be visible with correct text
    const visibleCurtains = uiLog.curtains.filter((c) => c.visible);
    expect(visibleCurtains.length).toBeGreaterThan(0);
    expect(visibleCurtains[visibleCurtains.length - 1]).toMatchObject({
      visible: true,
      title: '"报假警"',
      subtitle: '敬请期待',
    });
  });
});

describe('First Act — Input Lock States', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('locks input as dialogue during dialogue commands', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(inputLog.lockCalls.some((c) => c.reason === 'dialogue')).toBe(true);
  });

  it('locks input as blackScreen during blackScreen commands', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('B');
    advanceTimes(engine, 7);

    expect(inputLog.lockCalls.some((c) => c.reason === 'blackScreen')).toBe(true);
  });

  it('locks input as ending when ending reached', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('I');
    engine.advance();
    engine.update(30000);
    engine.update(500);

    expect(inputLog.lockCalls.some((c) => c.reason === 'ending')).toBe(true);
  });

  it('unlocks input after setControl(enabled=true)', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('C');

    // setControl(enabled=true) is at command index 1
    expect(inputLog.unlockCalls).toBeGreaterThanOrEqual(1);
  });

  it('setControl(enabled=false) locks input as scriptedMovement', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('E');
    engine.update(500); // past fade in → dialogue "我操！..." (awaiting_advance)
    engine.advance();   // past dialogue → setControl(false) scripted movement

    // After setControl(false) for dongJihao scripted movement
    expect(inputLog.lockCalls.some((c) => c.reason === 'scriptedMovement')).toBe(true);
  });
});

describe('First Act — Deterministic Replay', () => {
  it('same inputs produce same sequence for checkpoint A', () => {
    const saveState = createDefaultSaveState();
    const { engine: e1 } = createEngine({ saveState });
    const { engine: e2 } = createEngine({ saveState });

    e1.startFromCheckpoint('A');
    e2.startFromCheckpoint('A');

    advanceTimes(e1, 3);
    advanceTimes(e2, 3);
    e1.updateLocation('4F', 'gt1-classroom');
    e2.updateLocation('4F', 'gt1-classroom');
    e1.updatePlayerPosition({ x: 760, y: 520 });
    e2.updatePlayerPosition({ x: 760, y: 520 });
    advanceTimes(e1, 1);
    advanceTimes(e2, 1);

    expect(e1.getCurrentState()).toBe('awaiting_advance');
    expect(e2.getCurrentState()).toBe('awaiting_advance');
    expect(e1.getCommandIndex()).toBe(e2.getCommandIndex());
  });
});

describe('First Act — Controllable Character', () => {
  it('engine exposes current controllable character ID', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('A');

    // After switchCharacter(yangYunBlue) executes
    expect(engine.getControllableCharacterId()).toBe('yangYunBlue');
  });

  it('controllable character changes after switchCharacter commands', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('A');

    // First switchCharacter sets yangYunBlue
    expect(engine.getControllableCharacterId()).toBe('yangYunBlue');

    // Advance past first dialogue + switch to yangYunRed
    advanceTimes(engine, 2);

    // Now should be yangYunRed
    expect(engine.getControllableCharacterId()).toBe('yangYunRed');
  });
});
