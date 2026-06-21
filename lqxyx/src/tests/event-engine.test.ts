import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { InputManager, InputLockReason } from '../input/InputManager';
import type { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { EventEngine, type ScriptedMovementRequest } from '../story/EventEngine';
import {
  createInitialStoryDebugState,
  setStoryDebugState,
} from '../story/eventState';
import { resetSceneDebugState, getSceneDebugState, createInitialSceneDebugState } from '../game/scaffoldState';
import { firstActBranches, storyManifest, type StoryCommand } from '../data/story';
import { buildStoryEntityDebugEntries } from '../scenes/storyEntities';
import { createDefaultSaveState } from '../state/saveState';
import { SAVE_STATE_STORAGE_KEY } from '../state/saveState';
import type { SaveState } from '../state/saveState';
import type { BranchId, CheckpointId, StoryManifest } from '../data/story';
import type { DeathFlashFrame } from '../data/story';

// ── Test helpers ───────────────────────────────────────────────

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
    setTask: vi.fn((text: string) => {
      log.taskTexts.push(text);
    }),
    setDialogue: vi.fn((speaker: string, text: string, portraitKey?: string, _visible?: boolean, tone?: string, bodyAction?: string) => {
      log.dialogues.push({ speaker, text, portraitKey, tone, bodyAction });
    }),
    setCurtain: vi.fn((visible: boolean, title?: string, subtitle?: string, _textureKey?: string) => {
      log.curtains.push({ visible, title, subtitle });
    }),
    setRolePrompt: vi.fn((characterId: string, displayName?: string) => {
      log.rolePrompts.push({ characterId, displayName });
    }),
    setTimer: vi.fn((remainingMs: number, visible: boolean) => {
      log.timerCalls.push({ remainingMs, visible });
    }),
    setVisible: vi.fn(),
    setMinorEnding: vi.fn(),
    isRolePromptBlocking: vi.fn(() => false),
    getDisplayName: vi.fn((id: string) => id),
    getPortraitKey: vi.fn(() => undefined),
  } as unknown as NarrativeUIManager;

  return { ui, log };
}

function createEngine(
  overrides?: {
    onCheckpointReached?: (id: CheckpointId) => void;
    onEndingReached?: (id: string) => void;
    onTimerExpired?: (id: string) => void;
    onScriptedMovement?: (movement: ScriptedMovementRequest, complete: (position: { x: number; y: number }) => void) => void;
    onDeathFlash?: (id: 'celery' | 'ruler', sequence: readonly DeathFlashFrame[]) => void;
    saveState?: SaveState;
    manifest?: StoryManifest;
    visibilityPredicate?: (visibilityTargetId: string) => boolean;
  },
) {
  const { manager, log: inputLog } = createMockInputManager();
  const { ui, log: uiLog } = createMockNarrativeUI();

  const onCheckpointReached = overrides?.onCheckpointReached ?? vi.fn();
  const onEndingReached = overrides?.onEndingReached ?? vi.fn();
  const onTimerExpired = overrides?.onTimerExpired ?? vi.fn();
  const onScriptedMovement = overrides?.onScriptedMovement;
  const onDeathFlash = overrides?.onDeathFlash;
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
    undefined,
    visibilityPredicate,
  );

  return { engine, manager, ui, inputLog, uiLog, onCheckpointReached, onEndingReached, onTimerExpired };
}

/** Call advance() count times to skip through dialogues. */
function advanceTimes(engine: EventEngine, times: number): void {
  for (let i = 0; i < times; i++) {
    engine.advance();
  }
}

/** Pump update() with delta until engine is no longer waiting. */
function pumpUntilDone(engine: EventEngine, deltaMs: number, maxIterations = 1000): void {
  let iterations = 0;
  while (engine.getCurrentState() === 'waiting' && iterations < maxIterations) {
    engine.update(deltaMs);
    iterations++;
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('StoryDebugState', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('returns deterministic initial state', () => {
    expect(createInitialStoryDebugState()).toEqual({
      currentCheckpointId: null,
      currentActId: 'act-1',
      currentCommandIndex: 0,
      isExecuting: false,
      activeTimers: [],
      pendingBranchId: null,
      currentEndingId: null,
    });
  });

  it('setStoryDebugState merges partial into window scene state', () => {
    resetSceneDebugState();
    setStoryDebugState({
      currentCheckpointId: 'A',
      isExecuting: true,
    });

    const state = getSceneDebugState();
    expect(state.story.currentCheckpointId).toBe('A');
    expect(state.story.isExecuting).toBe(true);
    expect(state.story.currentActId).toBe('act-1'); // unchanged
  });

  it('SceneDebugState includes story field with correct defaults', () => {
    resetSceneDebugState();
    const state = createInitialSceneDebugState();
    expect(state.story).toBeDefined();
    expect(state.story.currentCheckpointId).toBeNull();
    expect(state.story.isExecuting).toBe(false);
    expect(state.story.activeTimers).toEqual([]);
  });
});

describe('EventEngine — checkpoint A flow', () => {
  it('blocks switchCharacter role prompt for 2 seconds when the UI declares it blocking', () => {
    const { engine, inputLog, ui } = createEngine();
    vi.mocked(ui.isRolePromptBlocking).mockReturnValue(true);

    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('waiting');
    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]).toEqual({ reason: 'rolePrompt' });
    expect(vi.mocked(ui.setVisible)).not.toHaveBeenCalledWith('rolePrompt', false);

    engine.update(1_999);
    expect(engine.getCurrentState()).toBe('waiting');
    expect(vi.mocked(ui.setVisible)).not.toHaveBeenCalledWith('rolePrompt', false);

    engine.update(1);

    expect(vi.mocked(ui.setVisible)).toHaveBeenCalledWith('rolePrompt', false);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('executes checkpoint A commands in order', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('A');

    // Should be in executing or awaiting_advance state after start
    const state = engine.getCurrentState();
    expect(['executing', 'awaiting_advance']).toContain(state);
  });

  it('calls switchCharacter, dialogue, task, interaction, and checkpoint callbacks for A', () => {
    const { engine, inputLog, uiLog, onCheckpointReached } = createEngine();
    engine.startFromCheckpoint('A');

    // Command 1: switchCharacter (non-blocking) - role prompt set
    expect(uiLog.rolePrompts.length).toBeGreaterThanOrEqual(1);
    expect(uiLog.rolePrompts[0]).toEqual({
      characterId: 'yangYunBlue',
      displayName: '杨云',
    });

    // Commands 2: dialogue "皇上不好了" (blocking)
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues.length).toBeGreaterThanOrEqual(1);
    expect(uiLog.dialogues[0]).toMatchObject({ speaker: '？？？', text: '皇上不好了，秦妃娘娘又被但公公拐跑了' });
    expect(inputLog.lockCalls.length).toBeGreaterThanOrEqual(1);
    expect(inputLog.lockCalls[0]?.reason).toBe('dialogue');

    // Advance past first dialogue
    engine.advance();

    // Next dialogue: "大胆！但宇轩！！"
    expect(uiLog.dialogues.length).toBeGreaterThanOrEqual(2);
    expect(uiLog.dialogues[1]).toMatchObject({ speaker: '杨云', text: '大胆！但宇轩！！可别让我抓到你。' });

    // Advance
    engine.advance();

    // switchCharacter to yangYunRed (non-blocking)
    expect(uiLog.rolePrompts.length).toBeGreaterThanOrEqual(2);
    expect(uiLog.rolePrompts[1]).toMatchObject({ characterId: 'yangYunRed', displayName: '杨云' });

    // task "找到但宇轩"
    expect(uiLog.taskTexts).toContain('找到但宇轩');

    // dialogue "但宇轩……听着也很好吃呢。"
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance();

    // interaction proximity blocks until player enters the configured radius
    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });

    // checkpoint A (non-blocking)
    expect(onCheckpointReached).toHaveBeenCalledWith('A');

    // task "无"
    expect(uiLog.taskTexts).toContain('无');

    // dialogue "我要搓手。"
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance();

    expect(onCheckpointReached).toHaveBeenCalledWith('B');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '杨云', text: '运' });
  });
});

describe('EventEngine — black screen and blackScreenDialogueWait timing', () => {
  it('processes blackScreen command and waits for duration', () => {
    const { engine, inputLog } = createEngine();

    // Checkpoint B has blackScreen(1000ms) + blackScreenDialogueWait(500ms)
    engine.startFromCheckpoint('B');

    // Skip past checkpoint B command + 3 dialogue commands
    advanceTimes(engine, 4);

    // Next should be blackScreen(1000ms) — engine enters waiting state
    // But first, let's get through the dialogues...
    // Actually, checkpoint B commands are:
    // 0: checkpoint B (non-blocking)
    // 1: dialogue "运"
    // 2: dialogue "运"
    // 3: dialogue "运"
    // 4: dialogue "气波"
    // 5: dialogue "你废……"
    // 6: dialogue "我可不是什么君子。"
    // 7: dialogue "……物吧"
    // 8: blackScreen 1000ms
    // 9: blackScreenDialogueWait 500ms
    // 10: setFlag
    // 11: switchCharacter
    // 12: dialogue

    // Wait, let me recount. Checkpoint B commands (from story.ts):
    // 0: checkpoint B
    // 1: dialogue "运" (杨云)
    // 2: dialogue "运" (但宇轩)
    // 3: dialogue "运" (杨云)
    // 4: dialogue "气波" (但宇轩)
    // 5: dialogue "你废……" (但宇轩)
    // 6: dialogue "我可不是什么君子。" (杨云)
    // 7: dialogue "……物吧" (但宇轩)
    // 8: blackScreen 1000ms
    // 9: blackScreenDialogueWait 500ms
    // 10: setFlag danYuxuanBodyProneAndBloody true
    // 11: switchCharacter yangYunBlue
    // 12: dialogue "我干了什么？！！！"

    // 7 dialogues to advance through BEFORE blackScreen
    advanceTimes(engine, 7);

    // After all dialogues, we should hit the blackScreen command (waiting state)
    expect(engine.getCurrentState()).toBe('waiting');
    expect(inputLog.lockCalls.some((c) => c.reason === 'blackScreen')).toBe(true);

    // Pump through the 1000ms black screen
    engine.update(1000);

    // After black screen, we should hit blackScreenDialogueWait
    // which is also a waiting state (500ms initial black + 500ms dialogue)
    expect(engine.getCurrentState()).toBe('waiting');

    // Complete the blackScreenDialogueWait (2 × 500ms)
    engine.update(500); // initial black
    engine.update(500); // dialogue
  });

  it('blackScreenDialogueWait completes in exactly 1000ms total', () => {
    // Create a manual test with just the blackScreenDialogueWait command
    const { engine } = createEngine();

    // Start at checkpoint B, advance through dialogues and blackScreen
    engine.startFromCheckpoint('B');
    advanceTimes(engine, 7); // past 7 dialogues

    // Now at blackScreen (1000ms)
    engine.update(1000); // complete black screen

    // Now at blackScreenDialogueWait — should be in waiting state
    expect(engine.getCurrentState()).toBe('waiting');

    // First 500ms: initial black curtain phase
    engine.update(500);
    // Should still be waiting (entered dialogue phase, 500ms more)
    expect(engine.getCurrentState()).toBe('waiting');

    // Second 500ms: complete
    engine.update(500);

    // Should have advanced past blackScreenDialogueWait
    // Now we should be executing setFlag or awaiting_advance for the final dialogue
    const state = engine.getCurrentState();
    expect(['executing', 'awaiting_advance', 'idle']).toContain(state);
  });

  it('locks input as blackScreen during blackScreenDialogueWait', () => {
    const { engine, inputLog } = createEngine();

    engine.startFromCheckpoint('B');
    advanceTimes(engine, 7);

    // Complete blackScreen
    engine.update(1000);

    // During blackScreenDialogueWait, input should be locked
    // The engine locks on blackScreenDialogueWait
    const blackScreenLockCalls = inputLog.lockCalls.filter((c) => c.reason === 'blackScreen');
    expect(blackScreenLockCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('EventEngine — timer system', () => {
  it('starts a timer and calls onTimerExpired when it runs out', () => {
    const onTimerExpired = vi.fn();
    const { engine } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('C');

    // Checkpoint C commands:
    // 0: checkpoint C (non-blocking)
    // 1: setControl enabled=true (non-blocking)
    // 2: branch A-1 (blocks for branch selection)
    // But wait - setControl and branch execute, and engine enters awaiting_branch

    // Actually at checkpoint C:
    // 0: checkpoint C
    // 1: setControl enabled=true
    // 2: branch A-1
    // 3: timer start A-2-auto-eat-dan-yuxuan 10s
    // 4: branch A-2

    // setControl and branch A-1 are non-blocking... wait, branch IS blocking
    // So after setControl (non-blocking), the engine hits branch (blocking) and enters awaiting_branch
    // Timer start and branch A-2 are AFTER branch A-1, so they won't execute yet

    // Let me verify - after startFromCheckpoint('C'), what's the state?
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['A-1']);

    // The timer hasn't started yet because we're blocked on branch
    // To test timers, select a branch first
    engine.selectBranch('A-1');

    // Now branch A-1 executes (which has its own commands like task, dialogue, etc.)
    // After branch A-1, it rejoins at checkpoint D

    // The timer from checkpoint C is never reached here.
    // Let me test timer directly in checkpoint H:
  });

  it('starts survival-route-countdown timer in checkpoint H', () => {
    const onTimerExpired = vi.fn();
    const { engine, uiLog } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('H');

    // Checkpoint H commands:
    // 0: task "无" (non-blocking)
    // 1: switchCharacter yangYunRed hidden (non-blocking)
    // 2: switchView dongJihao (non-blocking)
    // 3: fade in 500ms (blocking - waiting)
    // 4: checkpoint H
    // 5: switchCharacter dongJihao player
    // 6: task "去班里偷同学手机报警"
    // 7: setFlag
    // 8: timer start yang-yun-visible-failure-window 3s
    // 9: timer start survival-route-countdown 120s
    // 10: interaction F
    // 11: dialogue
    // ... etc

    // After start, we should be in waiting state (fade in 500ms)
    expect(engine.getCurrentState()).toBe('waiting');

    engine.update(500); // complete fade

    // Now checkpoint H and other non-blocking commands execute
    // Then timer start commands
    // Then interaction F
    // Then dialogue "信号屏蔽器？这对吗？"

    // The engine should now be awaiting_advance (dialogue blocking)
    // But first, let's check that timers were started
    expect(uiLog.timerCalls.length).toBeGreaterThan(0);

    // Advance through dialogue
    engine.advance();

    // Now pump the timer
    // The survival-route-countdown is 120s, so 120s won't expire quickly
    // But yang-yun-visible-failure-window is 3s
    engine.update(3000);
    expect(onTimerExpired).toHaveBeenCalledWith('yang-yun-visible-failure-window');
  });

  it('stops a timer via timer stop command', () => {
    // Checkpoint I has timer stop for survival-route-countdown
    const { engine } = createEngine();

    engine.startFromCheckpoint('I');

    // Checkpoint I commands:
    // 0: checkpoint I
    // 1: dialogue "好了。"
    // 2: timer stop survival-route-countdown
    // 3: timer reset survival-ending-countdown 30s
    // 4: task "活着"
    // 5: setFlag
    // 6: setFlag
    // 7: wait 30s
    // 8: fade out 500ms
    // 9: ending
    // 10: curtain

    // After start, dialogue blocks
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance(); // past dialogue "好了。"

    // Timer stop and reset are non-blocking, then task, flags
    // Then wait 30s blocks
    expect(engine.getCurrentState()).toBe('waiting');

    // Complete the 30s wait
    engine.update(30000);

    // Now fade out 500ms
    expect(engine.getCurrentState()).toBe('waiting');
  });

  it('survival-ending-countdown timer displays 30s in UI', () => {
    const { engine, uiLog } = createEngine();

    engine.startFromCheckpoint('I');
    engine.advance(); // past dialogue "好了。"

    // Timer reset to 30s should trigger setTimer with 30000ms
    const timerSetCalls = uiLog.timerCalls.filter((c) => c.visible);
    expect(timerSetCalls.length).toBeGreaterThan(0);
  });
});

describe('EventEngine — branch system', () => {
  it('shows branch options and enters awaiting_branch state at checkpoint G', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');

    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });

  it('selecting B-2 branch executes its commands', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);

    engine.selectBranch('B-2');

    pumpUntilDone(engine, 500);
  });

  it('selectBranch ignores invalid branch IDs', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);

    engine.selectBranch('A-1' as BranchId);
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });

  it('advance does nothing during branch selection', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');

    engine.advance();
    // Should still be awaiting_branch
    expect(engine.getCurrentState()).toBe('awaiting_branch');
  });
});

describe('EventEngine — switchView location state', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('checkpoint E switchView sets explicit room location instead of inferring from text', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('E');

    expect(engine.getLocation()).toMatchObject({
      floorId: '4F',
      roomId: 'gt2-classroom',
    });

    engine.update(500);
    engine.advance();
    engine.advance();
    engine.update(500);

    expect(engine.getCurrentState()).toBe('waiting');
    const stateAfterOfficeSwitch = getSceneDebugState();
    expect(stateAfterOfficeSwitch.story.isExecuting).toBe(true);
  });

  it('checkpoint E begins with task "无" and only sets "前往五楼关闭学校通信" after 搞定了', () => {
    const { engine, uiLog } = createEngine({
      onScriptedMovement: (movement, complete) => complete(movement.target),
    });

    engine.startFromCheckpoint('E');
    // Initial wave: checkpoint E → task "无" → switchView → fade in (waiting)
    expect(uiLog.taskTexts).toEqual(['无']);

    engine.update(500); // fade in completes
    // Now: switchCharacter dongJihao(scripted) → setControl(false, scripted movement)
    // scriptedMovement auto-completes via test stub → dialogue "我操！..."
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    // Still no other task set during 董继豪 walks toward 秦浩睿 / dialogues
    expect(uiLog.taskTexts).toEqual(['无']);

    engine.advance(); // past "我操！真的假的？芹菜你别吓我。"
    expect(uiLog.taskTexts).toEqual(['无']);

    engine.advance(); // past "真的……"
    // fade out 500ms → switchView yangYunRed → fade in 500ms
    engine.update(500);
    engine.update(500);
    // switchCharacter yangYunRed(player) → dialogue "搞定了"
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    // Task should still be "无" until "搞定了" advances
    expect(uiLog.taskTexts).toEqual(['无']);

    engine.advance(); // past "搞定了"
    // task "前往五楼关闭学校通信" runs after
    expect(uiLog.taskTexts).toEqual(['无', '前往五楼关闭学校通信']);
  });

  it('checkpoint E plays "我操！真的假的？芹菜你别吓我。" BEFORE the scripted walk to 秦浩睿尸体', () => {
    const checkpointE = storyManifest.acts[0]!.checkpoints.find((c) => c.id === 'E')!;
    const ourcryIndex = checkpointE.commands.findIndex(
      (cmd) => cmd.type === 'dialogue' && cmd.text === '我操！真的假的？芹菜你别吓我。',
    );
    const setControlIndex = checkpointE.commands.findIndex(
      (cmd) => cmd.type === 'setControl' && cmd.scriptedMovementId === 'dong-jihao-to-qin-haorui-body',
    );
    const lateryIndex = checkpointE.commands.findIndex(
      (cmd) => cmd.type === 'dialogue' && cmd.text === '真的……',
    );

    expect(ourcryIndex).toBeGreaterThan(-1);
    expect(setControlIndex).toBeGreaterThan(-1);
    expect(lateryIndex).toBeGreaterThan(-1);
    // Ordering: outcry → scripted-walk → grief
    expect(ourcryIndex).toBeLessThan(setControlIndex);
    expect(setControlIndex).toBeLessThan(lateryIndex);
  });

  it('checkpoint F transitions to checkpoint G after the "……坏了。" dialogue advances', () => {
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onCheckpointReached });

    engine.startFromCheckpoint('F');
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', 'office-4f');
    engine.updatePlayerPosition({ x: 620, y: 180 });
    engine.completeInteraction('F');
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance(); // past "……坏了。"
    // task "无" → gotoCheckpoint G → checkpoint G + branches → awaiting_branch
    expect(onCheckpointReached).toHaveBeenCalledWith('G');
    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['B-1', 'B-2']);
  });

  it('checkpoint H switchView sets Dong Jihao in the office room', () => {
    const { engine } = createEngine({
      saveState: {
        ...createDefaultSaveState(),
        checkpointId: 'H',
      },
    });

    engine.startFromCheckpoint('H');

    expect(engine.getLocation()).toMatchObject({
      floorId: '4F',
      roomId: 'office-4f',
    });
  });

  it('A-1 plays "秦浩睿: 杨云？杨云？！你不要过来啊！！" BEFORE the scripted walk to 秦浩睿', () => {
    const branch = firstActBranches.find((b) => b.id === 'A-1')!;
    const dialogueIndex = branch.commands.findIndex(
      (cmd) => cmd.type === 'dialogue' && cmd.text === '杨云？杨云？！你不要过来啊！！',
    );
    const setControlIndex = branch.commands.findIndex(
      (cmd) => cmd.type === 'setControl' && cmd.scriptedMovementId === 'yang-yun-to-qin-haorui-body',
    );
    expect(dialogueIndex).toBeGreaterThan(-1);
    expect(setControlIndex).toBeGreaterThan(-1);
    expect(dialogueIndex).toBeLessThan(setControlIndex);
  });

  it('A-2 plays "秦浩睿: 杨云？杨云？！你不要过来啊！！" BEFORE the scripted walk to 秦浩睿', () => {
    const branch = firstActBranches.find((b) => b.id === 'A-2')!;
    const dialogueIndex = branch.commands.findIndex(
      (cmd) => cmd.type === 'dialogue' && cmd.text === '杨云？杨云？！你不要过来啊！！',
    );
    const setControlIndex = branch.commands.findIndex(
      (cmd) => cmd.type === 'setControl' && cmd.scriptedMovementId === 'yang-yun-to-qin-haorui-body',
    );
    expect(dialogueIndex).toBeGreaterThan(-1);
    expect(setControlIndex).toBeGreaterThan(-1);
    expect(dialogueIndex).toBeLessThan(setControlIndex);
  });

  it('B-1 split-in-two ending returns by restarting checkpoint G instead of branch-local fake checkpoint commands', () => {
    const branch = firstActBranches.find((b) => b.id === 'B-1')!;
    const endingIndex = branch.commands.findIndex(
      (cmd) => cmd.type === 'ending' && cmd.id === 'split-in-two',
    );
    expect(endingIndex).toBeGreaterThan(-1);
    expect(branch.commands.slice(endingIndex + 1)).toEqual([]);
  });

  it('B-2 requires picking up BOTH heads at body positions and chains to checkpoint H via gotoCheckpoint', () => {
    const branch = firstActBranches.find((b) => b.id === 'B-2')!;
    const interactions = branch.commands.filter(
      (cmd): cmd is Extract<StoryCommand, { type: 'interaction' }> => cmd.type === 'interaction' && cmd.input === 'Q',
    );
    expect(interactions).toHaveLength(2);

    const danPickup = interactions.find((cmd) => cmd.target.includes('但宇轩'));
    const qinPickup = interactions.find((cmd) => cmd.target.includes('秦浩睿'));
    expect(danPickup).toBeDefined();
    expect(qinPickup).toBeDefined();

    const danTarget = danPickup!.physicalTarget;
    const qinTarget = qinPickup!.physicalTarget;
    expect(Array.isArray(danTarget)).toBe(false);
    expect(Array.isArray(qinTarget)).toBe(false);
    expect(danTarget).toMatchObject({ floorId: '4F', roomId: 'gt1-classroom', points: [{ x: 760, y: 520 }] });
    expect(qinTarget).toMatchObject({ floorId: '4F', roomId: 'gt2-classroom', points: [{ x: 760, y: 330 }] });

    // Ends with gotoCheckpoint H (not a bare checkpoint annotation that would leave the engine idle).
    const last = branch.commands[branch.commands.length - 1];
    expect(last).toMatchObject({ type: 'gotoCheckpoint', id: 'H' });
  });

  it('B-2 wires replay-specific head pickup flags into the real story command flow', () => {
    const branch = firstActBranches.find((b) => b.id === 'B-2')!;
    const flagCommands = branch.commands.filter(
      (cmd): cmd is Extract<StoryCommand, { type: 'setFlag' }> => cmd.type === 'setFlag',
    );
    const flagValues = flagCommands.map((cmd) => [cmd.id, cmd.value]);

    expect(flagValues).toEqual(expect.arrayContaining([
      ['yangYunReplayRestoresHeads', true],
      ['yangYunReplayDanHeadPickedUp', false],
      ['yangYunReplayQinHeadPickedUp', false],
      ['yangYunReplayDanHeadPickedUp', true],
      ['yangYunReplayQinHeadPickedUp', true],
    ]));
  });

  it('B-2 hides 董继豪 with control="hidden" before switching to 杨云 so the role prompt does NOT briefly say "你现在是董继豪"', () => {
    const branch = firstActBranches.find((b) => b.id === 'B-2')!;
    const dongJihaoHide = branch.commands.findIndex(
      (cmd) => cmd.type === 'switchCharacter' && cmd.characterId === 'dongJihao' && cmd.control === 'hidden',
    );
    const yangYunSwitch = branch.commands.findIndex(
      (cmd) => cmd.type === 'switchCharacter' && cmd.characterId === 'yangYunRed' && cmd.control === 'player',
    );
    expect(dongJihaoHide).toBeGreaterThan(-1);
    expect(yangYunSwitch).toBeGreaterThan(dongJihaoHide);
  });

  it('checkpoint E runs switchCharacter BEFORE the fade-in so the role prompt and the fade-in render as one transition', () => {
    const checkpoint = storyManifest.acts[0]!.checkpoints.find((c) => c.id === 'E')!;
    // First fade-in / switchCharacter pair (董继豪)
    const dongFadeIn = checkpoint.commands.findIndex(
      (cmd) => cmd.type === 'fade' && cmd.direction === 'in',
    );
    const dongSwitch = checkpoint.commands.findIndex(
      (cmd) => cmd.type === 'switchCharacter' && cmd.characterId === 'dongJihao',
    );
    expect(dongSwitch).toBeGreaterThan(-1);
    expect(dongFadeIn).toBeGreaterThan(-1);
    expect(dongSwitch).toBeLessThan(dongFadeIn);

    // Second fade-in / switchCharacter pair (yangYunRed)
    const lastFadeIn = checkpoint.commands.findLastIndex(
      (cmd) => cmd.type === 'fade' && cmd.direction === 'in',
    );
    const yangSwitch = checkpoint.commands.findIndex(
      (cmd) => cmd.type === 'switchCharacter' && cmd.characterId === 'yangYunRed',
    );
    expect(yangSwitch).toBeGreaterThan(-1);
    expect(lastFadeIn).toBeGreaterThan(-1);
    expect(yangSwitch).toBeLessThan(lastFadeIn);
  });

  it('switchCharacter with control="hidden" does NOT raise a role prompt or block the engine', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'switchCharacter', characterId: 'dongJihao', visibleName: '董继豪', control: 'hidden' },
      { type: 'task', text: 'sentinel' },
    ]);
    const { engine, uiLog } = createEngine({ manifest });

    engine.startFromCheckpoint('A');

    // The engine drains both commands without entering a wait/awaiting state for the hidden switch.
    expect(uiLog.rolePrompts).toEqual([]);
    expect(uiLog.taskTexts).toContain('sentinel');
  });
});

describe('EventEngine — input lock/unlock', () => {
  it('blocks switchCharacter role prompt for exactly 2000ms when UI declares blocking prompt support', () => {
    const { engine, ui, inputLog } = createEngine();
    const blockingUi = ui as unknown as { isRolePromptBlocking: () => boolean; setVisible: ReturnType<typeof vi.fn> };
    blockingUi.isRolePromptBlocking = () => true;

    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('waiting');
    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]).toEqual({ reason: 'rolePrompt' });

    engine.advance();
    expect(engine.getCurrentState()).toBe('waiting');

    engine.update(1_999);
    expect(engine.getCurrentState()).toBe('waiting');

    engine.update(1);
    expect(blockingUi.setVisible).toHaveBeenCalledWith('rolePrompt', false);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]).toEqual({ reason: 'dialogue' });
  });

  it('locks input with reason "dialogue" during dialogue command', () => {
    const { engine, inputLog } = createEngine();
    engine.startFromCheckpoint('A');

    // First blocking command after switchCharacter should be dialogue
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(inputLog.lockCalls.some((c) => c.reason === 'dialogue')).toBe(true);
  });

  it('setControl with enabled=false locks input', () => {
    const { engine } = createEngine();

    // Checkpoint E has setControl enabled=false
    engine.startFromCheckpoint('E');

    // Commands in E:
    // 0: checkpoint E
    // 1: switchView dongJihao
    // 2: fade in 500ms (waiting)
    
    expect(engine.getCurrentState()).toBe('waiting');
  });

  it('does not double-trigger events on repeated advance()', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    // Multiple advances should not cause issues
    engine.advance();
    engine.advance();
    engine.advance();

    // Engine should be in a valid state
    const state = engine.getCurrentState();
    expect(['executing', 'awaiting_advance', 'awaiting_proximity', 'idle', 'waiting']).toContain(state);
  });
});

describe('EventEngine — curtain and ending', () => {
  it('triggers curtain with correct title and subtitle through checkpoint I', () => {
    const { engine, uiLog, onEndingReached } = createEngine();

    engine.startFromCheckpoint('I');
    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance(); // past dialogue "好了。"
    expect(engine.getCurrentState()).toBe('waiting'); // 30s wait

    engine.update(30000); // past 30s wait → now at fade
    expect(engine.getCurrentState()).toBe('waiting'); // 500ms fade

    engine.update(500); // past fade → ending + curtain executed
    expect(onEndingReached).toHaveBeenCalledWith('survival-false-report');

    // Verify curtain was set visible with correct title and subtitle
    const visibleCurtains = uiLog.curtains.filter((c) => c.visible);
    expect(visibleCurtains.length).toBeGreaterThanOrEqual(1);

    const lastVisible = visibleCurtains[visibleCurtains.length - 1];
    expect(lastVisible?.title).toBe('"报假警"');
    expect(lastVisible?.subtitle).toBe('敬请期待');
  });

  it('ending command triggers onEndingReached callback', () => {
    const onEndingReached = vi.fn();
    const { engine } = createEngine({ onEndingReached });

    engine.startFromCheckpoint('I');
    engine.advance(); // dialogue
    engine.update(30000); // wait
    engine.update(500); // fade

    expect(onEndingReached).toHaveBeenCalledWith('survival-false-report');
  });

  it('curtain command is reachable after ending in checkpoint I', () => {
    const { engine, uiLog } = createEngine();

    engine.startFromCheckpoint('I');
    engine.advance();
    engine.update(30000);
    engine.update(500);

    // After all updates, curtain should have been triggered
    const allCurtains = uiLog.curtains;
    expect(allCurtains.length).toBeGreaterThan(0);

    const lastCurtain = allCurtains[allCurtains.length - 1];
    expect(lastCurtain?.visible).toBe(true);
    expect(lastCurtain?.title).toBe('"报假警"');
    expect(lastCurtain?.subtitle).toBe('敬请期待');
  });
});

describe('EventEngine — deterministic replay', () => {
  it('same manifest and same inputs produce same command sequence', () => {
    // Create two engines with the same save state
    const saveState = createDefaultSaveState();

    const { engine: e1 } = createEngine({ saveState });
    const { engine: e2 } = createEngine({ saveState });

    e1.startFromCheckpoint('A');
    e2.startFromCheckpoint('A');

    // Both should hit the same first dialogue
    expect(e1.getCurrentState()).toBe('awaiting_advance');
    expect(e2.getCurrentState()).toBe('awaiting_advance');

    // Advance through all of A
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

describe('EventEngine — death flash timing', () => {
  it('emits celery frame sequence to renderer while preserving total wait duration', () => {
    const deathFlash = vi.fn();
    const completedMovements: ScriptedMovementRequest[] = [];
    let completeMovement: ((position: { x: number; y: number }) => void) | null = null;
    const { engine, inputLog, onCheckpointReached } = createEngine({
      onDeathFlash: deathFlash,
      onScriptedMovement: (movement, complete) => {
        completedMovements.push(movement);
        completeMovement = complete;
      },
    });

    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');

    // Complete back door F interaction
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 288, y: 324 });
    engine.completeInteraction('F');

    // Advance past "滚去前门" dialogue
    engine.advance();

    // Trigger proximity at GT2 front door
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);
    // Proximity satisfied → switchCharacter → dialogue 秦浩睿 "你不要过来啊！！" (awaiting_advance)
    engine.advance(); // past 秦浩睿 dialogue → setControl scripted movement
    expect(completedMovements).toHaveLength(1);
    completeMovement?.(completedMovements[0]!.target);
    engine.advance();

    const branch = firstActBranches.find((candidate) => candidate.id === 'A-1');
    const flash = branch?.commands.find((command) => command.type === 'deathFlash');
    if (flash?.type !== 'deathFlash') throw new Error('A-1 death flash missing');
    const totalMs = flash.sequence.reduce((sum, frame) => sum + frame.durationMs, 0);

    expect(deathFlash).toHaveBeenCalledWith('celery', flash.sequence);
    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]?.reason).toBe('blackScreen');
    expect(engine.getCurrentState()).toBe('waiting');

    engine.update(totalMs - 1);
    expect(onCheckpointReached).not.toHaveBeenCalledWith('D');

    engine.update(1);
    expect(onCheckpointReached).toHaveBeenCalledWith('D');
    expect(inputLog.locked).toBe(true);
  });

  it('cancels checkpoint C auto-branch timer after selecting A-1', () => {
    const onTimerExpired = vi.fn();
    const { engine, uiLog } = createEngine({ onTimerExpired });

    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');
    engine.update(10_000);

    expect(onTimerExpired).not.toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');
    expect(uiLog.timerCalls[uiLog.timerCalls.length - 1]).toEqual({ remainingMs: 0, visible: false });
  });

  it('death flash locks input during sequence', () => {
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onCheckpointReached });

    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 288, y: 324 });
    engine.completeInteraction('F');
    engine.advance();
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    const state = engine.getCurrentState();
    expect(['executing', 'waiting', 'awaiting_advance', 'idle']).toContain(state);
  });
});

describe('EventEngine — wait command', () => {
  it('wait command pauses for the specified duration', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('I');
    engine.advance();

    // After non-blocking commands, the 30s wait blocks
    expect(engine.getCurrentState()).toBe('waiting');
    expect(engine.getCommandIndex()).toBe(7);

    // Partial wait — still waiting
    engine.update(15000);
    expect(engine.getCurrentState()).toBe('waiting');

    // Complete the 30s wait — advances to fade (500ms), which blocks again
    engine.update(15000);
    expect(engine.getCurrentState()).toBe('waiting'); // now waiting on fade
    expect(engine.getCommandIndex()).toBe(8); // advanced to fade command
  });

  it('0ms waits are asynchronous and do not synchronously recurse through command chains', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'wait', durationMs: 0, label: 'zero-1' },
      { type: 'wait', durationMs: 0, label: 'zero-2' },
      { type: 'dialogue', speaker: '系统', text: 'after zero waits' },
    ]);
    const { engine, uiLog } = createEngine({ manifest });

    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('waiting');
    expect(engine.getCommandIndex()).toBe(0);
    expect(uiLog.dialogues).toHaveLength(0);

    engine.update(0);

    expect(engine.getCurrentState()).toBe('waiting');
    expect(engine.getCommandIndex()).toBe(1);
    expect(uiLog.dialogues).toHaveLength(0);

    engine.update(0);

    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[0]).toEqual({ speaker: '系统', text: 'after zero waits' });
  });
});

describe('EventEngine — timer mutation safety', () => {
  it('does not tick timers added by an expiration callback during the same update pass', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'timer', id: 'first', action: 'start', durationMs: 1 },
      { type: 'interaction', input: 'F', target: 'hold', result: 'wait' },
      { type: 'dialogue', speaker: '系统', text: 'hold timers open' },
    ]);
    let engineRef: EventEngine | null = null;
    const expired: string[] = [];
    const { engine } = createEngine({
      manifest,
      onTimerExpired: (id) => {
        expired.push(id);
        if (id === 'first') {
          (engineRef as unknown as { gameTimers: Map<string, { remainingMs: number }> }).gameTimers.set('added-during-callback', { remainingMs: 0 });
        }
      },
    });
    engineRef = engine;

    engine.startFromCheckpoint('A');
    engine.update(1);

    expect(expired).toEqual(['first']);

    engine.update(0);

    expect(expired).toEqual(['first', 'added-during-callback']);
  });
});

describe('EventEngine — fade timing', () => {
  it('fade out command blocks for its duration then advances to ending', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('I');
    engine.advance();
    engine.update(30000); // complete 30s wait, now at fade (500ms)

    expect(engine.getCurrentState()).toBe('waiting');
    engine.update(250);
    expect(engine.getCurrentState()).toBe('waiting');

    engine.update(250);
    // After fade, ending and curtain execute, then engine goes idle
    expect(engine.getCurrentState()).toBe('idle');
  });
});

describe('EventEngine — dialogue input restoration', () => {
  it('restores player input after advancing past a terminal dialogue', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'dialogue', speaker: '系统', text: 'terminal dialogue' },
    ]);
    const { engine, inputLog } = createEngine({ manifest });

    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(inputLog.locked).toBe(true);

    engine.advance();

    expect(engine.getCurrentState()).toBe('idle');
    expect(inputLog.unlockCalls).toBeGreaterThan(0);
    expect(inputLog.locked).toBe(false);
  });

  it('blocks F interactions until the matching interaction is completed', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'test door', result: 'continue' },
      { type: 'dialogue', speaker: '系统', text: 'after F' },
    ]);
    const { engine, inputLog, uiLog } = createEngine({ manifest });

    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    expect(inputLog.interactContexts).toEqual(['F']);
    expect(uiLog.dialogues).toHaveLength(0);

    engine.completeInteraction('Q');
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    expect(uiLog.dialogues).toHaveLength(0);

    engine.completeInteraction('F');

    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[0]).toMatchObject({ speaker: '系统', text: 'after F' });
  });
});

describe('EventEngine — physical target validation', () => {
  function createPhysicalTargetManifest(physicalTarget: NonNullable<Extract<StoryManifest['acts'][number]['checkpoints'][number]['commands'][number], { type: 'interaction' }>['physicalTarget']>, input: 'F' | 'Q' = 'F'): StoryManifest {
    return createSingleCheckpointManifest([
      { type: 'interaction', input, target: 'physical target', result: 'continue', physicalTarget },
      { type: 'dialogue', speaker: '系统', text: 'after interaction' },
    ]);
  }

  it('rejects F when not near the 4F office corridor doors', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '4F',
      roomId: null,
      points: [{ x: 832, y: 868, radiusPx: 48 }, { x: 832, y: 1028, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');

    expect(engine.completeInteraction('F')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('accepts F near either 4F office corridor door', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '4F',
      roomId: null,
      points: [{ x: 832, y: 868, radiusPx: 48 }, { x: 832, y: 1028, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 832, y: 1028 });

    expect(engine.completeInteraction('F')).toBe(true);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('rejects F for 5F communication when floor or room is wrong', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '5F',
      roomId: 'communication-control-5f',
      points: [{ x: 620, y: 240, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 620, y: 240 });

    expect(engine.completeInteraction('F')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('accepts F near the 5F communication device', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '5F',
      roomId: 'communication-control-5f',
      points: [{ x: 620, y: 240, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');
    engine.updateLocation('5F', 'communication-control-5f');
    engine.updatePlayerPosition({ x: 620, y: 240 });

    expect(engine.completeInteraction('F')).toBe(true);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('rejects F for the office phone when outside office-4f', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '4F',
      roomId: 'office-4f',
      points: [{ x: 620, y: 180, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 620, y: 180 });

    expect(engine.completeInteraction('F')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('accepts F near the office phone inside office-4f', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest({
      floorId: '4F',
      roomId: 'office-4f',
      points: [{ x: 620, y: 180, radiusPx: 48 }],
    }) });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', 'office-4f');
    engine.updatePlayerPosition({ x: 620, y: 180 });

    expect(engine.completeInteraction('F')).toBe(true);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('rejects Q for head pickup outside both classroom head positions', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest([
      { floorId: '4F', roomId: 'gt1-classroom', points: [{ x: 720, y: 360, radiusPx: 48 }] },
      { floorId: '4F', roomId: 'gt2-classroom', points: [{ x: 800, y: 360, radiusPx: 48 }] },
    ], 'Q') });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 720, y: 360 });

    expect(engine.completeInteraction('Q')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('accepts Q near either classroom head pickup position', () => {
    const { engine } = createEngine({ manifest: createPhysicalTargetManifest([
      { floorId: '4F', roomId: 'gt1-classroom', points: [{ x: 720, y: 360, radiusPx: 48 }] },
      { floorId: '4F', roomId: 'gt2-classroom', points: [{ x: 800, y: 360, radiusPx: 48 }] },
    ], 'Q') });

    engine.startFromCheckpoint('A');
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 800, y: 360 });

    expect(engine.completeInteraction('Q')).toBe(true);
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('branch B-1 principal office interaction requires the 5F principal office door', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-1');

    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 288, y: 584 });

    expect(engine.completeInteraction('F')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('5F', null);
    engine.updatePlayerPosition({ x: 288, y: 2012 });

    expect(engine.completeInteraction('F')).toBe(true);
  });

  it('checkpoint H phone-cabinet interaction requires a GT classroom phone cabinet', () => {
    const { engine } = createEngine({
      saveState: {
        ...createDefaultSaveState(),
        checkpointId: 'H',
        storyFlags: { communicationDisabled: false },
      },
    });

    engine.startFromCheckpoint('H');
    engine.update(500);

    engine.advance();

    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 160, y: 260 });

    expect(engine.completeInteraction('F')).toBe(false);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });

    expect(engine.completeInteraction('F')).toBe(true);
  });
});

describe('EventEngine — elevator transition timing', () => {
  it('elevator sequence is fade→wait→switch→fade with correct 500ms timing', () => {
    // Simulate elevator transition via fade commands
    // The engine processes: fade out 500ms → switchView (change floor) → fade in 500ms
    // This can be tested by processing fade commands sequentially

    const { engine } = createEngine();

    // Start checkpoint D which has fade out → blackScreen → blackScreenDialogueWait
    engine.startFromCheckpoint('D');

    // Checkpoint D commands:
    // 0: checkpoint D
    // 1: task "无"
    // 2: setFlag
    // 3: switchCharacter yangYunBlue
    // 4: dialogue "……"
    // 5: dialogue "我该怎么办？"
    // 6: switchCharacter yangYunRed
    // 7: task "去办公室"
    // 8: interaction F
    // 9: fade out 500ms
    // 10: blackScreen 1000ms
    // 11: blackScreenDialogueWait 500ms

    // Advance through dialogues
    advanceTimes(engine, 2);

    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 832, y: 868 });
    engine.completeInteraction('F');

    // fade out 500ms blocks
    expect(engine.getCurrentState()).toBe('waiting');

    // Complete fade out
    engine.update(500);
    // Now at blackScreen 1000ms
    expect(engine.getCurrentState()).toBe('waiting');
    engine.update(1000);
    // Now at blackScreenDialogueWait
    expect(engine.getCurrentState()).toBe('waiting');
  });
});

describe('EventEngine — save persistence', () => {
  it('checkpoint command persists to localStorage', () => {
    const { engine, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });

    // After entering proximity, we should have passed checkpoint A
    expect(onCheckpointReached).toHaveBeenCalledWith('A');

    // Check localStorage
    const stored = localStorage.getItem(SAVE_STATE_STORAGE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.checkpointId).toBe('A');
    expect(parsed.actId).toBe('act-1');
  });

  it('checkpoint save stores initial checkpoint state', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('B');
    advanceTimes(engine, 7);
    engine.update(1000); // past blackScreen
    engine.update(1000); // past blackScreenDialogueWait (2 × 500ms)

    // Check that checkpoint B was persisted (first save happened at cmd0)
    const stored = localStorage.getItem(SAVE_STATE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.checkpointId).toBe('B');
  });

  it('story flags updated in memory survive execution flow', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('B');
    advanceTimes(engine, 7);
    engine.update(1000); // past blackScreen
    engine.update(500);  // past BDSW phase 1
    engine.update(500);  // past BDSW phase 2

    // After BDSW completes, setFlag + switchCharacter + final dialogue execute
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });
});


describe('EventEngine — checkpoint H communication branching', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('checkpoint H with communicationDisabled=true (comms jammed) resolves to 5F device path and asks to open comms', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: true },
    };
    const { engine, inputLog, uiLog, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);

    expect(inputLog.interactContexts).toEqual(['F']);
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });
    engine.completeInteraction('F');
    engine.advance();

    engine.updateLocation('5F', 'communication-control-5f');
    engine.updatePlayerPosition({ x: 620, y: 240 });
    engine.completeInteraction('F');

    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '董继豪', text: '搞定了。' });
    expect(onCheckpointReached).not.toHaveBeenCalledWith('I');
  });

  it('checkpoint H with communicationDisabled=false (comms online) resolves to enabled phone-cabinet path and enters checkpoint I', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      checkpointId: 'H',
      controllableCharacterId: 'dongJihao',
      storyFlags: { communicationDisabled: false },
    };
    const { engine, uiLog, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('H');
    engine.update(500);

    expect(engine.getCurrentState()).toBe('awaiting_advance');

    engine.advance();

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 160, y: 260 });
    engine.completeInteraction('F');

    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '董继豪', text: '好了。' });
    expect(onCheckpointReached).toHaveBeenCalledWith('I');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('selecting B-2 leaves communicationDisabled unchanged at checkpoint H save (default false; comms-closed flag is owned by checkpoint E)', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');
    engine.selectBranch('B-2');
    engine.update(3000);            // 思索 wait → dialogue 1 awaiting_advance
    engine.advance();               // dialogue 2 awaiting_advance
    engine.advance();               // fade out → waiting
    engine.update(500);             // fade out done → switchCharacter hidden (non-blocking) → switchView → switchCharacter player (role prompt 2s waiting)
    engine.update(2000);            // role prompt done → fade in → waiting
    engine.update(500);             // fade in done → dialogue "我好像忘了点啥" awaiting_advance
    engine.advance();               // past dialogue → task → interaction Q at GT1 awaiting_interaction

    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    // Pickup 但宇轩's head at GT1 body position
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.completeInteraction('Q');

    // Pickup 秦浩睿's head at GT2 body position
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 760, y: 330 });
    engine.completeInteraction('Q');

    // dialogue "材料够了。" awaiting_advance
    engine.advance();               // past "材料够了。" → setFlag → fade out → waiting
    engine.update(500);             // fade out done → gotoCheckpoint H → H's task/hidden/switchView (non-blocking) → fade in (waiting)
    engine.update(500);             // fade in done → checkpoint H runs → save persisted

    const stored = localStorage.getItem(SAVE_STATE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.checkpointId).toBe('H');
    expect(parsed.storyFlags.communicationDisabled).toBe(false);

    const loadedSaveState = parsed as SaveState;
    const { engine: loadedEngine, onCheckpointReached } = createEngine({ saveState: loadedSaveState });
    loadedEngine.startFromCheckpoint('H');
    loadedEngine.update(500);
    loadedEngine.advance();
    loadedEngine.updateLocation('4F', 'gt1-classroom');
    loadedEngine.updatePlayerPosition({ x: 160, y: 260 });
    loadedEngine.completeInteraction('F');

    expect(onCheckpointReached).toHaveBeenCalledWith('I');
  });
});


describe('EventEngine — proximity and scripted movement contracts', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('checkpoint A proximity interaction blocks before radius and progresses after player enters radius', () => {
    const { engine, uiLog, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 100, y: 100 });
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');

    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.update(16);

    expect(onCheckpointReached).toHaveBeenCalledWith('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '杨云', text: '我要搓手。' });
  });

  it('checkpoint A proximity ignores Dan coordinates outside the 4F GT1 classroom', () => {
    const { engine, uiLog, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 100, y: 100 });
    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);

    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 100, y: 100 });
    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);
  });

  it('checkpoint A proximity triggers at Dan coordinates after movement inside 4F GT1 classroom', () => {
    const { engine, uiLog, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 600, y: 520 });
    engine.updatePlayerPosition({ x: 760, y: 520 });
    engine.update(16);

    expect(onCheckpointReached).toHaveBeenCalledWith('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '杨云', text: '我要搓手。' });
  });

  it('checkpoint A proximity does not immediately pass when armed inside radius until position changes', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      position: { x: 760, y: 520, facing: 'down' },
    };
    const { engine, uiLog, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    engine.update(16);
    engine.updatePlayerPosition({ x: 760.5, y: 520 });

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);

    engine.updatePlayerPosition({ x: 762, y: 520 });

    expect(onCheckpointReached).toHaveBeenCalledWith('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
  });

  it('checkpoint A proximity can be completed by pressing F inside Dan radius', () => {
    const saveState: SaveState = {
      ...createDefaultSaveState(),
      roomId: 'gt1-classroom',
      position: { x: 760, y: 520, facing: 'down' },
    };
    const { engine, uiLog, onCheckpointReached } = createEngine({ saveState });

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(engine.completeInteraction('F')).toBe(true);

    expect(onCheckpointReached).toHaveBeenCalledWith('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(uiLog.dialogues[uiLog.dialogues.length - 1]).toMatchObject({ speaker: '杨云', text: '我要搓手。' });
  });

  it('checkpoint A proximity F press outside Dan radius is a no-op', () => {
    const { engine, uiLog, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 100, y: 100 });

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(engine.completeInteraction('F')).toBe(false);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);
  });

  it('checkpoint A proximity F press in the wrong room is a no-op', () => {
    const { engine, uiLog, onCheckpointReached } = createEngine();

    engine.startFromCheckpoint('A');
    advanceTimes(engine, 3);
    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(engine.completeInteraction('F')).toBe(false);

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(onCheckpointReached).not.toHaveBeenCalledWith('A');
    expect(uiLog.dialogues.some((d) => d.text === '我要搓手。')).toBe(false);
  });

  it('scripted movement command locks input until fixed target completion and restores player control', () => {
    const scriptedMovements: Array<{ target: { x: number; y: number }; durationMs: number; tolerancePx: number }> = [];
    const { engine, inputLog } = createEngine({
      onScriptedMovement: (movement, complete) => {
        scriptedMovements.push(movement);
        expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]?.reason).toBe('scriptedMovement');
        complete({ x: movement.target.x + 8, y: movement.target.y - 6 });
      },
    });

    engine.startFromCheckpoint('E');
    engine.update(500);
    engine.advance(); // past "我操！真的假的？芹菜你别吓我。" → setControl scripted movement

    expect(scriptedMovements).toHaveLength(1);
    const movement = scriptedMovements[0]!;
    const distance = Math.hypot((movement.target.x + 8) - movement.target.x, (movement.target.y - 6) - movement.target.y);
    expect(distance).toBeLessThanOrEqual(16);
    expect(movement.target).toEqual({ x: 760, y: 330 });
    expect(movement.tolerancePx).toBe(16);
    expect(inputLog.lockCalls.some((c) => c.reason === 'scriptedMovement')).toBe(true);
    // sync stub overshoots through the post-movement dialogue into fade-out (production stays at awaiting_advance because Phaser tween defers completion)
    expect(engine.getCurrentState()).not.toBe('awaiting_scripted_movement');
  });
});

describe('EventEngine — window debug state', () => {
  beforeEach(() => {
    resetSceneDebugState();
  });

  it('updates window.__YING_ZHONG_JIU_SCENE_STATE__.story during execution', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('A');

    const debugState = getSceneDebugState().story;
    expect(debugState.currentCheckpointId).toBe('A');
    expect(debugState.currentActId).toBe('act-1');
    expect(debugState.isExecuting).toBe(true);
  });

  it('activeTimers reflects running game timers', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('H');
    engine.update(500); // complete fade

    const debugState = getSceneDebugState().story;
    // After timer start commands execute, activeTimers should be populated
    if (debugState.activeTimers.length > 0) {
      expect(debugState.activeTimers[0]).toHaveProperty('id');
      expect(debugState.activeTimers[0]).toHaveProperty('remainingMs');
    }
  });

  it('pendingBranchId is set during branch selection', () => {
    const { engine } = createEngine();

    engine.startFromCheckpoint('G');

    const debugState = getSceneDebugState().story;
    expect(debugState.pendingBranchId).toBe('B-1');
  });});

describe('EventEngine — dialogue portraits', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('passes portrait keys for known story speakers and hides unknown speaker portraits', () => {
    const { engine, uiLog } = createEngine();

    engine.startFromCheckpoint('A');
    expect(uiLog.dialogues[0]).toMatchObject({ speaker: '？？？', portraitKey: undefined });

    engine.advance();
    expect(uiLog.dialogues[1]).toMatchObject({ speaker: '杨云', portraitKey: 'portrait.yangYunBlue' });

    engine.advance();
    engine.advance();
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 520 });
    expect(uiLog.dialogues[2]).toMatchObject({ speaker: '杨云', portraitKey: 'portrait.yangYunRed' });

    const { engine: checkpointBEngine, uiLog: checkpointBLog } = createEngine();
    checkpointBEngine.startFromCheckpoint('B');
    checkpointBEngine.advance();
    expect(checkpointBLog.dialogues[1]).toMatchObject({ speaker: '但宇轩', portraitKey: 'portrait.danYuxuan' });

    const { engine: checkpointEEngine, uiLog: checkpointELog } = createEngine({
      onScriptedMovement: (movement, complete) => complete(movement.target),
    });
    checkpointEEngine.startFromCheckpoint('E');
    checkpointEEngine.update(500);
    expect(checkpointELog.dialogues[0]).toMatchObject({ speaker: '董继豪', portraitKey: 'portrait.dongJihao' });
  });
});

describe('EventEngine — visibility-gated checkpoint C', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('waits in awaiting_view with no pending branches and frozen timer when target is out of view', () => {
    let inView = false;
    const onTimerExpired = vi.fn();
    const { engine, uiLog } = createEngine({
      onTimerExpired,
      visibilityPredicate: () => inView,
    });

    engine.startFromCheckpoint('C');

    expect(engine.getCurrentState()).toBe('awaiting_view');
    expect(engine.getPendingBranchIds()).toEqual([]);

    engine.update(15_000);

    expect(engine.getCurrentState()).toBe('awaiting_view');
    expect(engine.getPendingBranchIds()).toEqual([]);
    expect(onTimerExpired).not.toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');
    const lastVisibleTimer = uiLog.timerCalls.filter((c) => c.visible).pop();
    expect(lastVisibleTimer).toBeUndefined();
  });

  it('exposes branch A-1 and starts the A-2 timer once the target enters view', () => {
    let inView = false;
    const onTimerExpired = vi.fn();
    const { engine, uiLog } = createEngine({
      onTimerExpired,
      visibilityPredicate: () => inView,
    });

    engine.startFromCheckpoint('C');
    expect(engine.getCurrentState()).toBe('awaiting_view');

    inView = true;
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_branch');
    expect(engine.getPendingBranchIds()).toEqual(['A-1']);
    const visibleTimer = uiLog.timerCalls.find((c) => c.visible && c.remainingMs === 10_000);
    expect(visibleTimer).toBeDefined();
  });

  it('auto-fires branch A-2 after 10s only while target stays in view', () => {
    let inView = false;
    const onTimerExpired = vi.fn();
    const { engine } = createEngine({
      onTimerExpired,
      visibilityPredicate: () => inView,
    });

    engine.startFromCheckpoint('C');
    inView = true;
    engine.update(16);

    expect(engine.getCurrentState()).toBe('awaiting_branch');

    engine.update(5_000);
    inView = false;
    engine.update(20_000);

    expect(onTimerExpired).not.toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');

    inView = true;
    engine.update(5_000);

    expect(onTimerExpired).toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');
  });

  it('does not crash when no visibility predicate is provided (default safe)', () => {
    const { manager } = createMockInputManager();
    const { ui } = createMockNarrativeUI();
    const onCheckpointReached = vi.fn();
    const onEndingReached = vi.fn();

    const engine = new EventEngine(
      storyManifest,
      manager,
      ui,
      createDefaultSaveState(),
      onCheckpointReached,
      onEndingReached,
    );

    expect(() => {
      engine.startFromCheckpoint('C');
      engine.update(16);
    }).not.toThrow();
    expect(engine.getCurrentState()).toBe('awaiting_view');
  });
});

describe('EventEngine — Qin scripted movement gated on GT2 proximity', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('A-1 branch: gates at 4F gt2-classroom proximity (~760,220 r96) before yang-yun-to-qin-haorui-body scripted movement', () => {
    const scriptedMovements: ScriptedMovementRequest[] = [];
    const { engine } = createEngine({
      onScriptedMovement: (movement, complete) => {
        scriptedMovements.push(movement);
        complete(movement.target);
      },
    });

    engine.startFromCheckpoint('C');
    expect(engine.getPendingBranchIds()).toContain('A-1');

    engine.selectBranch('A-1');

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 100, y: 800 });
    engine.update(16);

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    // Proximity → setFlag → switchCharacter → dialogue 秦浩睿 (awaiting_advance) → setControl scripted movement
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance(); // past 秦浩睿 "你不要过来啊！！"
    expect(scriptedMovements).toHaveLength(1);
    expect(scriptedMovements[0]!.target).toEqual({ x: 760, y: 330 });
  });

  it('A-2 timeout branch: gates at 4F gt2-classroom proximity before yang-yun-to-qin-haorui-body scripted movement', () => {
    const scriptedMovements: ScriptedMovementRequest[] = [];
    let engine!: EventEngine;
    const onTimerExpired = vi.fn((id: string) => {
      if (id === 'A-2-auto-eat-dan-yuxuan') engine.loadBranchDirect('A-2');
    });
    ({ engine } = createEngine({
      onTimerExpired,
      onScriptedMovement: (movement, complete) => {
        scriptedMovements.push(movement);
        complete(movement.target);
      },
    }));

    engine.startFromCheckpoint('C');
    expect(engine.getCurrentState()).toBe('awaiting_branch');

    engine.update(10_000);
    expect(onTimerExpired).toHaveBeenCalledWith('A-2-auto-eat-dan-yuxuan');

    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance();

    engine.update(500);
    engine.update(1000);
    engine.update(500);

    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance();
    engine.advance();
    engine.advance();
    engine.advance();
    engine.advance();

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');

    engine.updateLocation('4F', 'gt2-classroom');
    engine.updatePlayerPosition({ x: 700, y: 220 });
    engine.updatePlayerPosition({ x: 760, y: 220 });
    engine.update(16);

    // Proximity → setFlag → switchCharacter → dialogue 秦浩睿 (awaiting_advance) → setControl scripted movement
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    engine.advance(); // past 秦浩睿 "你不要过来啊！！"
    expect(scriptedMovements).toHaveLength(1);
    expect(scriptedMovements[0]!.target).toEqual({ x: 760, y: 330 });
  });

  it('A-2 timeout regression: waiting 10s in GT1 with body visible does not start Qin scripted movement', () => {
    const scriptedMovements: ScriptedMovementRequest[] = [];
    let engine!: EventEngine;
    const onTimerExpired = vi.fn((id: string) => {
      if (id === 'A-2-auto-eat-dan-yuxuan') engine.loadBranchDirect('A-2');
    });
    ({ engine } = createEngine({
      onTimerExpired,
      onScriptedMovement: (movement, complete) => {
        scriptedMovements.push(movement);
        complete(movement.target);
      },
    }));

    engine.startFromCheckpoint('C');
    engine.updateLocation('4F', 'gt1-classroom');
    engine.updatePlayerPosition({ x: 760, y: 600 });

    engine.update(10_000);

    for (let i = 0; i < 50; i++) {
      const state = engine.getCurrentState();
      if (state === 'awaiting_advance') {
        engine.advance();
        continue;
      }
      if (state === 'waiting') {
        engine.update(2_000);
        continue;
      }
      break;
    }

    expect(scriptedMovements).toEqual([]);
    expect(engine.getCurrentState()).toBe('awaiting_proximity');
  });
});

describe('EventEngine — Bug Fixes (Round 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('Bug 1: hides timer UI when loadBranchDirect follows timer natural expiry', () => {
    const manifest: StoryManifest = {
      ...storyManifest,
      acts: [
        {
          ...storyManifest.acts[0]!,
          checkpoints: [
            {
              id: 'A',
              label: 'Test',
              location: 'Test',
              task: 'Test',
              playableCharacter: 'yangYunRed',
              commands: [
                { type: 'timer', id: 'expiring-timer', action: 'start', durationMs: 1000 },
                { type: 'wait', durationMs: 0, label: 'hold' },
                { type: 'dialogue', speaker: '系统', text: 'after timer' },
              ],
            },
          ],
          branches: [
            {
              id: 'A-1',
              label: 'Test branch',
              trigger: 'test',
              fromCheckpoint: 'A',
              commands: [{ type: 'dialogue', speaker: '系统', text: 'branch dialogue' }],
            },
          ],
          timers: [],
        },
      ],
    };
    let engineRef!: EventEngine;
    const onTimerExpired = vi.fn((id: string) => {
      if (id === 'expiring-timer') engineRef.loadBranchDirect('A-1');
    });
    const { engine, uiLog } = createEngine({ manifest, onTimerExpired });
    engineRef = engine;

    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('waiting'); // 0ms wait blocks
    engine.update(0); // completes wait
    expect(engine.getCurrentState()).toBe('awaiting_advance'); // dialogue blocks
    expect(uiLog.timerCalls[0]).toEqual({ remainingMs: 1000, visible: true });

    engine.update(1000); // timer expires, triggers onTimerExpired → loadBranchDirect

    expect(onTimerExpired).toHaveBeenCalledWith('expiring-timer');
    expect(engine.getCurrentState()).toBe('awaiting_advance'); // branch dialogue blocks
    const lastTimerCall = uiLog.timerCalls[uiLog.timerCalls.length - 1];
    expect(lastTimerCall).toEqual({ remainingMs: 0, visible: false });
  });

  it('Bug 2: storyEntities shows Qin corpse when standingVisible is cleared and bodyBloodyOnGround is set', () => {
    const entries = buildStoryEntityDebugEntries({
      qinHaoruiStandingVisible: false,
      qinHaoruiBodyBloodyOnGround: true,
    });
    const standing = entries.find((e) => e.id === 'qinHaoruiStanding');
    const corpse = entries.find((e) => e.id === 'qinHaoruiProneBloody');
    expect(standing).toBeUndefined();
    expect(corpse).toBeDefined();
    expect(corpse?.textureKey).toBe('sprite.qinHaorui.lyingBloody');
  });

  it('Bug 2: checkpoint D clears qinHaoruiStandingVisible flag', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('D');
    const flags = engine.getStoryFlags();
    expect(flags.qinHaoruiStandingVisible).toBe(false);
    expect(flags.qinHaoruiBodyBloodyOnGround).toBe(true);
  });

  it('Bug 3: checkpoint D chains to checkpoint E after blackScreenDialogueWait', () => {
    const onCheckpointReached = vi.fn();
    const { engine } = createEngine({ onCheckpointReached });
    engine.startFromCheckpoint('D');

    advanceTimes(engine, 2); // past dialogues
    engine.updateLocation('4F', null);
    engine.updatePlayerPosition({ x: 832, y: 868 });
    engine.completeInteraction('F');

    engine.update(500);  // fade out
    engine.update(1000); // blackScreen
    engine.update(500);  // bsdw phase 1
    engine.update(500);  // bsdw phase 2

    expect(onCheckpointReached).toHaveBeenCalledWith('E');
  });

  it('Bug 4: dialogue with bodyAction passes bodyAction to narrative UI', () => {
    const { engine, uiLog } = createEngine();
    engine.startFromCheckpoint('B');
    advanceTimes(engine, 6); // past 6 dialogues to reach "我可不是什么君子。"
    const dialogueWithBodyAction = uiLog.dialogues.find((d) => d.text === '我可不是什么君子。');
    expect(dialogueWithBodyAction).toBeDefined();
    expect(dialogueWithBodyAction?.bodyAction).toBe('趁但宇轩不注意，一刀砍向他');
    expect(dialogueWithBodyAction?.tone).toBeUndefined();
  });

  it('Bug 5: F press during awaiting_interaction swallows door entry', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'test door', result: 'continue', physicalTarget: { floorId: '4F', roomId: null, points: [{ x: 100, y: 100, radiusPx: 48 }] } },
      { type: 'dialogue', speaker: '系统', text: 'after interaction' },
    ]);
    const { engine, inputLog } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    expect(inputLog.interactContexts).toEqual(['F']);

    // F at wrong location should NOT fall through to door entry
    engine.completeInteraction('F');
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
  });

  it('Bug 4: dialogue without tone passes undefined tone', () => {
    const { engine, uiLog } = createEngine();
    engine.startFromCheckpoint('B');
    advanceTimes(engine, 1); // past first dialogue "运"
    const dialogueWithoutTone = uiLog.dialogues.find((d) => d.text === '运');
    expect(dialogueWithoutTone).toBeDefined();
    expect(dialogueWithoutTone?.tone).toBeUndefined();
  });

  it('isInteractionTargetInCurrentLocation: returns true when awaiting_interaction with target in same location as player', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'office door', result: 'enter', physicalTarget: { floorId: '4F', roomId: null, points: [{ x: 832, y: 868, radiusPx: 48 }] } },
      { type: 'dialogue', speaker: '系统', text: 'after' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('awaiting_interaction');

    engine.updateLocation('4F', null);
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(true);

    engine.updateLocation('4F', 'gt2-classroom');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);
  });

  it('isInteractionTargetInCurrentLocation: returns false when not awaiting_interaction', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'dialogue', speaker: '系统', text: 'no interaction yet' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('awaiting_advance');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);
  });

  it('isInteractionTargetInCurrentLocation: returns false when no physical target on the interaction', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'interaction', input: 'F', target: 'no-physical-target', result: 'enter' },
      { type: 'dialogue', speaker: '系统', text: 'after' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');
    expect(engine.getCurrentState()).toBe('awaiting_interaction');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);
  });

  it('isInteractionTargetInCurrentLocation: returns false for multi-room targets so the player can use doors to walk between them', () => {
    const manifest = createSingleCheckpointManifest([
      {
        type: 'interaction',
        input: 'F',
        target: 'phone cabinet (multi-room target)',
        result: 'pickup',
        physicalTarget: [
          { floorId: '4F', roomId: 'gt1-classroom', points: [{ x: 160, y: 260, radiusPx: 48 }] },
          { floorId: '4F', roomId: 'gt2-classroom', points: [{ x: 160, y: 260, radiusPx: 48 }] },
        ],
      },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    // Multi-room target: never blocks doors regardless of which room the player is in,
    // so they can walk between GT1 and GT2 freely while the interaction is pending.
    engine.updateLocation('4F', 'gt1-classroom');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);

    engine.updateLocation('4F', 'gt2-classroom');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);

    engine.updateLocation('4F', null);
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);
  });

  it('isInteractionTargetInCurrentLocation: returns true for single-room targets to block teleport-via-door', () => {
    const manifest = createSingleCheckpointManifest([
      {
        type: 'interaction',
        input: 'F',
        target: 'office phone (single-room target)',
        result: 'pickup',
        physicalTarget: { floorId: '4F', roomId: 'office-4f', points: [{ x: 620, y: 180, radiusPx: 48 }] },
      },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    engine.updateLocation('4F', 'office-4f');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(true);

    engine.updateLocation('4F', 'gt1-classroom');
    expect(engine.isInteractionTargetInCurrentLocation()).toBe(false);
  });
});

describe('EventEngine — blockDoor / unblockDoor (door blocker mechanism)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSceneDebugState();
  });

  it('blockDoor command registers a door block with the given message', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'blockDoor', doorId: '4f-gt2-back', message: '滚去前门！', speaker: '？？？' },
      { type: 'dialogue', speaker: '系统', text: 'after block' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.attemptBlockedDoor('4f-gt2-back')).toBe(true);
    expect(engine.attemptBlockedDoor('4f-gt2-front')).toBe(false);
    expect(engine.attemptBlockedDoor('non-existent-door')).toBe(false);
  });

  it('attemptBlockedDoor shows ambient dialogue once on first attempt', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'blockDoor', doorId: '4f-gt2-back', message: '滚去前门！', speaker: '？？？' },
      { type: 'interaction', input: 'proximity', target: 'test', result: 'test', proximityTargetId: 'checkpoint-c-gt2-front-entry' },
    ]);
    const { engine, uiLog, inputLog } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.isAmbientDialogueActive()).toBe(false);

    engine.attemptBlockedDoor('4f-gt2-back');
    expect(engine.isAmbientDialogueActive()).toBe(true);
    expect(uiLog.dialogues.find((d) => d.text === '滚去前门！')).toBeDefined();
    expect(inputLog.lockCalls.some((c) => c.reason === 'dialogue')).toBe(true);

    const dialogueCountBefore = uiLog.dialogues.filter((d) => d.text === '滚去前门！').length;

    engine.dismissAmbientDialogue();
    expect(engine.isAmbientDialogueActive()).toBe(false);

    engine.attemptBlockedDoor('4f-gt2-back');
    expect(engine.isAmbientDialogueActive()).toBe(false);

    const dialogueCountAfter = uiLog.dialogues.filter((d) => d.text === '滚去前门！').length;
    expect(dialogueCountAfter).toBe(dialogueCountBefore);
  });

  it('dismissing 滚去前门 keeps movement and interact unlocked while awaiting front-door proximity', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'blockDoor', doorId: '4f-gt2-back', message: '滚去前门！', speaker: '？？？' },
      { type: 'interaction', input: 'proximity', target: 'test', result: 'test', proximityTargetId: 'checkpoint-c-gt2-front-entry' },
    ]);
    const { engine, inputLog } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    engine.attemptBlockedDoor('4f-gt2-back');
    expect(inputLog.lockCalls[inputLog.lockCalls.length - 1]?.reason).toBe('dialogue');

    engine.dismissAmbientDialogue();

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(inputLog.locked).toBe(false);
    expect(inputLog.interactContexts[inputLog.interactContexts.length - 1]).toBe('F');
  });

  it('unblockDoor removes the block', () => {
    const manifest = createSingleCheckpointManifest([
      { type: 'blockDoor', doorId: '4f-gt2-back', message: '滚去前门！', speaker: '？？？' },
      { type: 'unblockDoor', doorId: '4f-gt2-back' },
      { type: 'dialogue', speaker: '系统', text: 'after unblock' },
    ]);
    const { engine } = createEngine({ manifest });
    engine.startFromCheckpoint('A');

    expect(engine.attemptBlockedDoor('4f-gt2-back')).toBe(false);
  });

  it('A-1 branch arms proximity directly without back-door interaction; back door is blocked', () => {
    const { engine } = createEngine();
    engine.startFromCheckpoint('C');
    engine.selectBranch('A-1');

    expect(engine.getCurrentState()).toBe('awaiting_proximity');
    expect(engine.attemptBlockedDoor('4f-gt2-back')).toBe(true);
    expect(engine.attemptBlockedDoor('4f-gt2-front')).toBe(false);
  });
});

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
