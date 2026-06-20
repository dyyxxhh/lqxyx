import { describe, expect, it, vi } from 'vitest';

import { createInitialSceneDebugState, getSceneDebugState, resetSceneDebugState } from '../game/scaffoldState';
import { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { UI_THEME } from '../ui/uiTheme';
import * as uiStateModule from '../ui/uiState';
import {
  createInitialNarrativeUiDebugState,
  DISPLAY_NAMES,
  getDisplayName,
  getPortraitKey,
  getDialoguePortraitKey,
  PORTRAIT_KEYS,
  setNarrativeUiDebugState,
} from '../ui/uiState';

function chainableUiObject(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { visible: false, ...extra };
  object.setOrigin = () => object;
  object.setScrollFactor = () => object;
  object.setDepth = () => object;
  object.setVisible = (visible: boolean) => {
    object.visible = visible;
    return object;
  };
  object.setStrokeStyle = (lineWidth: number, color: number, alpha?: number) => {
    object.strokeLineWidth = lineWidth;
    object.strokeColor = color;
    object.strokeAlpha = alpha;
    return object;
  };
  object.setShadow = () => object;
  object.setText = (text: string) => {
    object.text = text;
    return object;
  };
  object.setDisplaySize = (width: number, height: number) => {
    object.displayWidth = width;
    object.displayHeight = height;
    return object;
  };
  object.setFillStyle = (color: number, alpha?: number) => {
    object.fillColor = color;
    object.fillAlpha = alpha;
    return object;
  };
  object.setInteractive = () => object;
  object.on = () => object;
  object.getBounds = () => ({ x: 0, y: 0, width: 0, height: 0 });
  return object;
}

function createMockScene() {
  return {
    add: {
      rectangle: vi.fn(() => chainableUiObject()),
      text: vi.fn(() => chainableUiObject()),
      image: vi.fn(() => chainableUiObject({ originX: 0.5, originY: 0.5, displayWidth: 0, displayHeight: 0 })),
    },
  };
}

describe('display name rules', () => {
  it('maps yangYunBlue to 杨云', () => {
    expect(getDisplayName('yangYunBlue')).toBe('杨云');
  });

  it('maps yangYunRed to 杨云', () => {
    expect(getDisplayName('yangYunRed')).toBe('杨云');
  });

  it('maps dongJihao to 董继豪', () => {
    expect(getDisplayName('dongJihao')).toBe('董继豪');
  });

  it('maps danYuxuan to 但宇轩', () => {
    expect(getDisplayName('danYuxuan')).toBe('但宇轩');
  });

  it('maps qinHaorui to 秦浩睿', () => {
    expect(getDisplayName('qinHaorui')).toBe('秦浩睿');
  });

  it('maps unknown to ？？？', () => {
    expect(getDisplayName('unknown')).toBe('？？？');
  });

  it('falls back to raw id for unmapped characters', () => {
    expect(getDisplayName('nonExistent')).toBe('nonExistent');
  });

  it('DISPLAY_NAMES constant has expected entries', () => {
    expect(DISPLAY_NAMES).toHaveProperty('yangYunBlue', '杨云');
    expect(DISPLAY_NAMES).toHaveProperty('yangYunRed', '杨云');
    expect(DISPLAY_NAMES).toHaveProperty('dongJihao', '董继豪');
    expect(DISPLAY_NAMES).toHaveProperty('danYuxuan', '但宇轩');
    expect(DISPLAY_NAMES).toHaveProperty('qinHaorui', '秦浩睿');
    expect(DISPLAY_NAMES).toHaveProperty('unknown', '？？？');
  });
});

describe('portrait key mapping', () => {
  it('maps yangYunBlue to portrait.yangYunBlue', () => {
    expect(getPortraitKey('yangYunBlue')).toBe('portrait.yangYunBlue');
  });

  it('maps yangYunRed to portrait.yangYunRed', () => {
    expect(getPortraitKey('yangYunRed')).toBe('portrait.yangYunRed');
  });

  it('maps dongJihao to portrait.dongJihao', () => {
    expect(getPortraitKey('dongJihao')).toBe('portrait.dongJihao');
  });

  it('maps danYuxuan to portrait.danYuxuan', () => {
    expect(getPortraitKey('danYuxuan')).toBe('portrait.danYuxuan');
  });

  it('maps qinHaorui to portrait.qinHaorui', () => {
    expect(getPortraitKey('qinHaorui')).toBe('portrait.qinHaorui');
  });

  it('returns undefined for unknown character', () => {
    expect(getPortraitKey('nonExistent')).toBeUndefined();
  });

  it('PORTRAIT_KEYS constant has expected entries', () => {
    expect(PORTRAIT_KEYS).toHaveProperty('yangYunBlue', 'portrait.yangYunBlue');
    expect(PORTRAIT_KEYS).toHaveProperty('yangYunRed', 'portrait.yangYunRed');
    expect(PORTRAIT_KEYS).toHaveProperty('dongJihao', 'portrait.dongJihao');
    expect(PORTRAIT_KEYS).toHaveProperty('danYuxuan', 'portrait.danYuxuan');
    expect(PORTRAIT_KEYS).toHaveProperty('qinHaorui', 'portrait.qinHaorui');
  });

  it('maps known dialogue speakers to portrait keys and leaves narration without a portrait', () => {
    expect(getDialoguePortraitKey('杨云', 'yangYunBlue')).toBe('portrait.yangYunBlue');
    expect(getDialoguePortraitKey('杨云', 'yangYunRed')).toBe('portrait.yangYunRed');
    expect(getDialoguePortraitKey('董继豪')).toBe('portrait.dongJihao');
    expect(getDialoguePortraitKey('但宇轩')).toBe('portrait.danYuxuan');
    expect(getDialoguePortraitKey('秦浩睿')).toBe('portrait.qinHaorui');
    expect(getDialoguePortraitKey('？？？')).toBeUndefined();
    expect(getDialoguePortraitKey('')).toBeUndefined();
  });
});

describe('narrative UI debug state', () => {
  it('returns deterministic initial debug state', () => {
    expect(createInitialNarrativeUiDebugState()).toEqual({
      taskVisible: false,
      taskText: '',
      dialogueVisible: false,
      dialogueSpeaker: '',
      dialogueText: '',
      dialoguePortraitKey: null,
      rolePromptVisible: false,
      roleCharacterId: '',
      roleDisplayName: '',
      timerVisible: false,
      timerRemainingMs: 0,
      curtainVisible: false,
      curtainTitle: '下一幕',
      curtainSubtitle: '敬请期待',
      minorEndingVisible: false,
      minorEndingBody: '',
    });
  });

  it('is part of the overall scene debug state', () => {
    resetSceneDebugState();
    const state = getSceneDebugState();

    expect(state.ui).toBeDefined();
    expect(state.ui.taskVisible).toBe(false);
    expect(state.ui.curtainTitle).toBe('下一幕');
    expect(state.ui.curtainSubtitle).toBe('敬请期待');
  });

  it('createInitialSceneDebugState includes ui field', () => {
    const state = createInitialSceneDebugState();

    expect(state.ui).toBeDefined();
    expect(state.ui.taskVisible).toBe(false);
    expect(state.ui.dialogueVisible).toBe(false);
    expect(state.ui.rolePromptVisible).toBe(false);
    expect(state.ui.timerVisible).toBe(false);
    expect(state.ui.curtainVisible).toBe(false);
  });
});

describe('task visibility via debug state', () => {
  it('marks task as invisible when text is 无', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({ taskText: '无', taskVisible: false });

    const state = getSceneDebugState().ui;
    expect(state.taskText).toBe('无');
    expect(state.taskVisible).toBe(false);
  });

  it('marks task as invisible when text is empty', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({ taskText: '', taskVisible: false });

    const state = getSceneDebugState().ui;
    expect(state.taskText).toBe('');
    expect(state.taskVisible).toBe(false);
  });

  it('marks task as visible for non-empty task text', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({ taskText: '寻找出路', taskVisible: true });

    const state = getSceneDebugState().ui;
    expect(state.taskText).toBe('寻找出路');
    expect(state.taskVisible).toBe(true);
  });

  it('marks task as visible for 找到但宇轩', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({ taskText: '找到但宇轩', taskVisible: true });

    const state = getSceneDebugState().ui;
    expect(state.taskText).toBe('找到但宇轩');
    expect(state.taskVisible).toBe(true);
  });
});

describe('curtain debug state', () => {
  it('curtain defaults to visible=false with correct title/subtitle', () => {
    resetSceneDebugState();
    const state = getSceneDebugState().ui;

    expect(state.curtainVisible).toBe(false);
    expect(state.curtainTitle).toBe('下一幕');
    expect(state.curtainSubtitle).toBe('敬请期待');
  });

  it('curtain shows 下一幕 and 敬请期待 when made visible', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      curtainVisible: true,
      curtainTitle: '下一幕',
      curtainSubtitle: '敬请期待',
    });

    const state = getSceneDebugState().ui;
    expect(state.curtainVisible).toBe(true);
    expect(state.curtainTitle).toBe('下一幕');
    expect(state.curtainSubtitle).toBe('敬请期待');
  });

  it('curtain hides correctly', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      curtainVisible: true,
      curtainTitle: '下一幕',
      curtainSubtitle: '敬请期待',
    });

    setNarrativeUiDebugState({ curtainVisible: false });

    const state = getSceneDebugState().ui;
    expect(state.curtainVisible).toBe(false);
    expect(state.curtainTitle).toBe('下一幕');
    expect(state.curtainSubtitle).toBe('敬请期待');
  });
});

describe('dialogue state via debug state', () => {
  it('initial dialogue is hidden with empty fields', () => {
    resetSceneDebugState();

    const state = getSceneDebugState().ui;
    expect(state.dialogueVisible).toBe(false);
    expect(state.dialogueSpeaker).toBe('');
    expect(state.dialogueText).toBe('');
    expect(state.dialoguePortraitKey).toBeNull();
  });

  it('dialogue shows with speaker, text, and portrait', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      dialogueVisible: true,
      dialogueSpeaker: '杨云',
      dialogueText: '大胆！但宇轩！！可别让我抓到你。',
      dialoguePortraitKey: 'portrait.yangYunRed',
    });

    const state = getSceneDebugState().ui;
    expect(state.dialogueVisible).toBe(true);
    expect(state.dialogueSpeaker).toBe('杨云');
    expect(state.dialogueText).toBe('大胆！但宇轩！！可别让我抓到你。');
    expect(state.dialoguePortraitKey).toBe('portrait.yangYunRed');
  });

  it('dialogue hides correctly', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      dialogueVisible: true,
      dialogueSpeaker: '董继豪',
      dialogueText: '我操！真的假的？',
      dialoguePortraitKey: 'portrait.dongJihao',
    });

    setNarrativeUiDebugState({ dialogueVisible: false });

    const state = getSceneDebugState().ui;
    expect(state.dialogueVisible).toBe(false);
    expect(state.dialogueSpeaker).toBe('董继豪');
    expect(state.dialogueText).toBe('我操！真的假的？');
    expect(state.dialoguePortraitKey).toBe('portrait.dongJihao');
  });

  it('dialogue with ？？？ speaker has no portrait', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      dialogueVisible: true,
      dialogueSpeaker: '？？？',
      dialogueText: '皇上不好了，秦妃娘娘又被但公公拐跑了',
      dialoguePortraitKey: null,
    });

    const state = getSceneDebugState().ui;
    expect(state.dialogueVisible).toBe(true);
    expect(state.dialogueSpeaker).toBe('？？？');
    expect(state.dialoguePortraitKey).toBeNull();
  });
});

describe('role prompt border color state', () => {
  const rolePromptPlanBlue = 0x1f3f6b;
  const rolePromptBorderColorApi = uiStateModule as typeof uiStateModule & {
    getRolePromptBorderColor?: (characterId: string) => number;
  };

  it('planned getRolePromptBorderColor maps blue-border characters to plan blue', () => {
    expect(rolePromptBorderColorApi.getRolePromptBorderColor?.('yangYunBlue')).toBe(rolePromptPlanBlue);
    expect(rolePromptBorderColorApi.getRolePromptBorderColor?.('dongJihao')).toBe(rolePromptPlanBlue);
  });

  it('planned getRolePromptBorderColor preserves red-border characters as theme border', () => {
    expect(rolePromptBorderColorApi.getRolePromptBorderColor?.('yangYunRed')).toBe(UI_THEME.colors.border);
  });

  it('planned getRolePromptBorderColor falls back to theme border for unknown character', () => {
    expect(rolePromptBorderColorApi.getRolePromptBorderColor?.('unknown')).toBe(UI_THEME.colors.border);
    expect(rolePromptBorderColorApi.getRolePromptBorderColor?.('nonExistent')).toBe(UI_THEME.colors.border);
  });

  it('role prompt card applies scripted blue border state for yangYunBlue', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setRolePrompt('yangYunBlue', '杨云');

    const rolePromptCard = scene.add.rectangle.mock.results[3]?.value;
    expect(rolePromptCard.strokeColor).toBe(rolePromptPlanBlue);
  });
});

describe('role prompt state via debug state', () => {
  it('initial role prompt is hidden', () => {
    resetSceneDebugState();

    const state = getSceneDebugState().ui;
    expect(state.rolePromptVisible).toBe(false);
    expect(state.roleCharacterId).toBe('');
    expect(state.roleDisplayName).toBe('');
  });

  it('role prompt shows 杨云 for yangYunRed', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      rolePromptVisible: true,
      roleCharacterId: 'yangYunRed',
      roleDisplayName: '杨云',
    });

    const state = getSceneDebugState().ui;
    expect(state.rolePromptVisible).toBe(true);
    expect(state.roleCharacterId).toBe('yangYunRed');
    expect(state.roleDisplayName).toBe('杨云');
  });

  it('role prompt shows 杨云 for yangYunBlue', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      rolePromptVisible: true,
      roleCharacterId: 'yangYunBlue',
      roleDisplayName: '杨云',
    });

    const state = getSceneDebugState().ui;
    expect(state.rolePromptVisible).toBe(true);
    expect(state.roleCharacterId).toBe('yangYunBlue');
    expect(state.roleDisplayName).toBe('杨云');
  });

  it('role prompt shows 董继豪 for dongJihao', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      rolePromptVisible: true,
      roleCharacterId: 'dongJihao',
      roleDisplayName: '董继豪',
    });

    const state = getSceneDebugState().ui;
    expect(state.rolePromptVisible).toBe(true);
    expect(state.roleCharacterId).toBe('dongJihao');
    expect(state.roleDisplayName).toBe('董继豪');
  });

  it('role prompt hide updates debug visibility', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setRolePrompt('dongJihao', '董继豪');
    expect(getSceneDebugState().ui.rolePromptVisible).toBe(true);

    ui.setVisible('rolePrompt', false);

    expect(getSceneDebugState().ui.rolePromptVisible).toBe(false);
  });
});

describe('timer state via debug state', () => {
  it('initial timer is hidden with zero remaining', () => {
    resetSceneDebugState();

    const state = getSceneDebugState().ui;
    expect(state.timerVisible).toBe(false);
    expect(state.timerRemainingMs).toBe(0);
  });

  it('timer shows remaining time when visible', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      timerVisible: true,
      timerRemainingMs: 120_000,
    });

    const state = getSceneDebugState().ui;
    expect(state.timerVisible).toBe(true);
    expect(state.timerRemainingMs).toBe(120_000);
  });

  it('timer can be hidden after being shown', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({ timerVisible: true, timerRemainingMs: 30_000 });
    setNarrativeUiDebugState({ timerVisible: false });

    const state = getSceneDebugState().ui;
    expect(state.timerVisible).toBe(false);
    expect(state.timerRemainingMs).toBe(30_000);
  });
});

describe('setNarrativeUiDebugState partial merge', () => {
  it('merges partial state preserving unchanged fields', () => {
    resetSceneDebugState();
    setNarrativeUiDebugState({
      taskText: '找到但宇轩',
      taskVisible: true,
      dialogueSpeaker: '杨云',
    });

    const state = getSceneDebugState().ui;
    expect(state.taskText).toBe('找到但宇轩');
    expect(state.taskVisible).toBe(true);
    expect(state.dialogueSpeaker).toBe('杨云');

    // Unchanged fields retain their initial values
    expect(state.curtainVisible).toBe(false);
    expect(state.curtainTitle).toBe('下一幕');
    expect(state.timerVisible).toBe(false);
    expect(state.timerRemainingMs).toBe(0);
  });
});
