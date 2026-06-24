import { describe, expect, it, vi } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH, createInitialSceneDebugState, getSceneDebugState, resetSceneDebugState } from '../game/scaffoldState';
import { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { UI_THEME } from '../ui/uiTheme';
import * as uiStateModule from '../ui/uiState';
import {
  createInitialNarrativeUiDebugState,
  DISPLAY_NAMES,
  getDisplayName,
  getPortraitKey,
  getRolePromptBorderColor,
  getDialoguePortraitKey,
  PORTRAIT_KEYS,
  setNarrativeUiDebugState,
} from '../ui/uiState';

function chainableUiObject(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { visible: false, ...extra };
  object.setOrigin = (originX = 0.5, originY?: number) => {
    object.originX = originX;
    object.originY = originY ?? originX;
    return object;
  };
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
  object.setTexture = (textureKey: string) => {
    object.textureKey = textureKey;
    return object;
  };
  object.setScale = (scaleX: number, scaleY?: number) => {
    object.scaleX = scaleX;
    object.scaleY = scaleY ?? scaleX;
    return object;
  };
  object.setFillStyle = (color: number, alpha?: number) => {
    object.fillColor = color;
    object.fillAlpha = alpha;
    return object;
  };
  object.setInteractive = (config?: unknown) => {
    object.interactiveConfig = config ?? true;
    return object;
  };
  object.on = (eventName: string, handler: unknown) => {
    const events = isEventRecord(object.events) ? object.events : {};
    events[eventName] = handler;
    object.events = events;
    return object;
  };
  object.getBounds = () => {
    const x = typeof object.x === 'number' ? object.x : 0;
    const y = typeof object.y === 'number' ? object.y : 0;
    const width = typeof object.displayWidth === 'number' && object.displayWidth > 0
      ? object.displayWidth
      : typeof object.width === 'number' ? object.width : 0;
    const height = typeof object.displayHeight === 'number' && object.displayHeight > 0
      ? object.displayHeight
      : typeof object.height === 'number' ? object.height : 0;
    const originX = typeof object.originX === 'number' ? object.originX : 0.5;
    const originY = typeof object.originY === 'number' ? object.originY : 0.5;
    return { x: x - width * originX, y: y - height * originY, width, height };
  };
  return object;
}

function isEventRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type VisualBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

type NarrativeVisualDebugState = {
  task?: VisualBox;
  timer?: VisualBox;
  curtainTitle?: VisualBox;
  curtainSubtitleCapsule?: VisualBox;
  curtainSubtitle?: VisualBox;
  minorEndingTitle?: VisualBox;
  minorEndingBody?: VisualBox;
  minorEndingButton?: VisualBox;
  minorEndingButtonText?: VisualBox;
  colors?: { timer?: string; timerBackground?: string | number };
};

function expectInsideViewport(box: VisualBox): void {
  expect(box.visible).toBe(true);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(GAME_WIDTH);
  expect(box.y + box.height).toBeLessThanOrEqual(GAME_HEIGHT);
}

function boxesOverlap(first: VisualBox, second: VisualBox): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function expectNoOverlap(first: VisualBox, second: VisualBox): void {
  expect(boxesOverlap(first, second)).toBe(false);
}

function boundsOf(object: Record<string, unknown>): VisualBox {
  const getBounds = object.getBounds;
  if (typeof getBounds !== 'function') {
    throw new Error('mock object does not expose getBounds');
  }
  const bounds = getBounds() as VisualBox;
  return { ...bounds, visible: object.visible === true };
}

function createMockScene() {
  return {
    add: {
      rectangle: vi.fn((x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number) => chainableUiObject({
        x,
        y,
        width,
        height,
        fillColor,
        fillAlpha,
      })),
      text: vi.fn((x: number, y: number, text?: string, style?: Record<string, unknown>) => chainableUiObject({ x, y, text, style })),
      image: vi.fn((x: number, y: number, textureKey?: string) => chainableUiObject({
        x,
        y,
        textureKey,
        originX: 0.5,
        originY: 0.5,
        displayWidth: 0,
        displayHeight: 0,
      })),
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

  it('generic dialogue show keeps portrait hidden after no-portrait dialogue', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setDialogue('董继豪', '我操！真的假的？', 'portrait.dongJihao');
    ui.setDialogue('？？？', '皇上不好了', undefined, true);
    ui.setVisible('dialogue', true);

    const dialoguePortrait = scene.add.image.mock.results[0]?.value;
    expect(dialoguePortrait.visible).toBe(false);
  });

  it('generic dialogue hide and re-show does not restore a stale portrait', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setDialogue('董继豪', '我操！真的假的？', 'portrait.dongJihao');
    ui.setDialogue('旁白', '窗外传来脚步声。', undefined, true);
    ui.setVisible('dialogue', false);
    ui.setVisible('dialogue', true);

    const dialogueBg = scene.add.rectangle.mock.results[1]?.value;
    const dialoguePortrait = scene.add.image.mock.results[0]?.value;
    expect(dialogueBg.visible).toBe(true);
    expect(dialoguePortrait.visible).toBe(false);
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
  it('renders the blue Yang role prompt with D10 title, portrait, layout, border, and debug state', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setRolePrompt('yangYunBlue', '杨云');

    const rolePromptBg = scene.add.rectangle.mock.results[2]?.value;
    const rolePromptCard = scene.add.rectangle.mock.results[3]?.value;
    const rolePromptTitleText = scene.add.text.mock.results[3]?.value;
    const rolePromptNameText = scene.add.text.mock.results[4]?.value;
    const rolePromptPortrait = scene.add.image.mock.results[1]?.value;
    expect(rolePromptTitleText.text).toBe('你现在是');
    expect(Math.abs(rolePromptTitleText.x - GAME_WIDTH / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(rolePromptTitleText.x - rolePromptCard.x)).toBeLessThanOrEqual(2);
    expect(rolePromptPortrait.textureKey).toBe(getPortraitKey('yangYunBlue'));
    expect(rolePromptPortrait.visible).toBe(true);
    expect(rolePromptCard.strokeColor).toBe(getRolePromptBorderColor('yangYunBlue'));
    expect(rolePromptTitleText.y).toBeLessThan(rolePromptPortrait.y);
    expect(rolePromptPortrait.x).toBeLessThan(rolePromptNameText.x);
    expect(rolePromptNameText.y).toBeGreaterThan(rolePromptPortrait.y);
    expectNoOverlap(boundsOf(rolePromptPortrait), boundsOf(rolePromptNameText));
    expect(rolePromptBg.getBounds()).toMatchObject({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT });
    expect(rolePromptCard.getBounds().x).toBeGreaterThanOrEqual(0);
    expect(rolePromptCard.getBounds().y).toBeGreaterThanOrEqual(0);
    expect(rolePromptCard.getBounds().x + rolePromptCard.getBounds().width).toBeLessThanOrEqual(GAME_WIDTH);
    expect(rolePromptCard.getBounds().y + rolePromptCard.getBounds().height).toBeLessThanOrEqual(GAME_HEIGHT);
    expect(getSceneDebugState().ui).toMatchObject({
      rolePromptVisible: true,
      roleCharacterId: 'yangYunBlue',
      roleDisplayName: '杨云',
    });
  });

  it('renders the red Yang role prompt with D10 portrait, lower-right name, exact border, and blocking semantics', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setRolePrompt('yangYunRed', '杨云');

    const rolePromptCard = scene.add.rectangle.mock.results[3]?.value;
    const rolePromptTitleText = scene.add.text.mock.results[3]?.value;
    const rolePromptNameText = scene.add.text.mock.results[4]?.value;
    const rolePromptPortrait = scene.add.image.mock.results[1]?.value;
    expect(rolePromptTitleText.text).toBe('你现在是');
    expect(Math.abs(rolePromptTitleText.x - GAME_WIDTH / 2)).toBeLessThanOrEqual(2);
    expect(rolePromptPortrait.textureKey).toBe(getPortraitKey('yangYunRed'));
    expect(rolePromptCard.strokeColor).toBe(getRolePromptBorderColor('yangYunRed'));
    expect(rolePromptPortrait.x).toBeLessThan(rolePromptNameText.x);
    expect(rolePromptNameText.y).toBeGreaterThan(rolePromptPortrait.y);
    expectNoOverlap(boundsOf(rolePromptPortrait), boundsOf(rolePromptNameText));
    expect(rolePromptCard.getBounds().x).toBeGreaterThanOrEqual(0);
    expect(rolePromptCard.getBounds().y).toBeGreaterThanOrEqual(0);
    expect(rolePromptCard.getBounds().x + rolePromptCard.getBounds().width).toBeLessThanOrEqual(GAME_WIDTH);
    expect(rolePromptCard.getBounds().y + rolePromptCard.getBounds().height).toBeLessThanOrEqual(GAME_HEIGHT);
    expect(ui.isRolePromptBlocking()).toBe(true);
    expect(getSceneDebugState().ui).toMatchObject({
      rolePromptVisible: true,
      roleCharacterId: 'yangYunRed',
      roleDisplayName: '杨云',
    });
  });

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

  it('task and danger timer HUD stay inside the design viewport with pixel-horror styling', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setTask('当前任务：调查教学楼');
    ui.setTimer(30_000, true);

    const visual = ui.getVisualDebugState() as NarrativeVisualDebugState;
    const task = visual.task;
    const timer = visual.timer;
    if (!task || !timer) throw new Error('missing HUD visual bounds');

    expectInsideViewport(task);
    expectInsideViewport(timer);
    expect(visual.colors?.timer).toBe(UI_THEME.colors.textDanger);
    expect(visual.colors?.timerBackground).toBe(UI_THEME.colors.surfaceRaised);
  });
});

describe('curtain state via debug state', () => {
  it('curtain renders 敬请期待 as a visible non-reactive button', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setCurtain(true, '"报假警"', '敬请期待');

    const curtainButtonBg = scene.add.rectangle.mock.results[5]?.value;
    const curtainSubtitleText = scene.add.text.mock.results[7]?.value;
    expect(curtainButtonBg.visible).toBe(true);
    expect(curtainButtonBg.strokeColor).toBe(UI_THEME.colors.gold);
    expect(curtainButtonBg.interactiveConfig).toBeUndefined();
    expect(curtainButtonBg.events).toBeUndefined();
    expect(curtainSubtitleText.visible).toBe(true);
    expect(curtainSubtitleText.text).toBe('敬请期待');
    expect(getSceneDebugState().ui.curtainSubtitle).toBe('敬请期待');
  });

  it('curtain uses the documented pixel-horror ending layout', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setCurtain(true, '"报假警"', '敬请期待');

    const curtainBg = scene.add.rectangle.mock.results[4]?.value;
    const curtainButtonBg = scene.add.rectangle.mock.results[5]?.value;
    const curtainTitleText = scene.add.text.mock.results[6]?.value;
    const curtainSubtitleText = scene.add.text.mock.results[7]?.value;

    expect(curtainBg.fillColor).toBe(UI_THEME.colors.surface);
    expect(curtainBg.fillAlpha).toBe(0.98);
    expect(curtainTitleText.y).toBe(296);
    expect(curtainTitleText.style).toMatchObject({
      color: UI_THEME.colors.textGold,
      fontSize: '64px',
    });
    expect(curtainButtonBg.width).toBe(320);
    expect(curtainButtonBg.height).toBe(64);
    expect(curtainButtonBg.y).toBe(424);
    expect(curtainSubtitleText.style).toMatchObject({
      color: UI_THEME.colors.text,
      fontSize: '26px',
    });
  });

  it('final curtain exposes viewport-safe title, subtitle, and capsule bounds with no overlap', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setCurtain(true, '"报假警"', '敬请期待');

    const visual = ui.getVisualDebugState() as NarrativeVisualDebugState;
    expect(visual.curtainTitle).toBeDefined();
    expect(visual.curtainSubtitleCapsule).toBeDefined();
    expect(visual.curtainSubtitle).toBeDefined();

    const curtainTitle = visual.curtainTitle;
    const curtainSubtitleCapsule = visual.curtainSubtitleCapsule;
    const curtainSubtitle = visual.curtainSubtitle;
    if (!curtainTitle || !curtainSubtitleCapsule || !curtainSubtitle) throw new Error('missing curtain visual bounds');

    expectInsideViewport(curtainTitle);
    expectInsideViewport(curtainSubtitleCapsule);
    expectInsideViewport(curtainSubtitle);
    expectNoOverlap(curtainTitle, curtainSubtitleCapsule);
    expect(curtainSubtitleCapsule.width).toBeGreaterThan(curtainSubtitle.width);
    expect(curtainSubtitleCapsule.height).toBeGreaterThan(curtainSubtitle.height);
  });

  it('curtain hides subtitle button for black screens with empty subtitle', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setCurtain(true, '', '');

    const curtainButtonBg = scene.add.rectangle.mock.results[5]?.value;
    const curtainSubtitleText = scene.add.text.mock.results[7]?.value;
    const curtainBg = scene.add.rectangle.mock.results[4]?.value;
    expect(curtainBg.fillColor).toBe(0x000000);
    expect(curtainBg.fillAlpha).toBe(1);
    expect(curtainButtonBg.visible).toBe(false);
    expect(curtainSubtitleText.visible).toBe(false);
    expect(curtainSubtitleText.text).toBe('');
    expect(getSceneDebugState().ui.curtainSubtitle).toBe('');
  });

  it('generic curtain hide also hides subtitle button background', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setCurtain(true, '下一幕', '敬请期待');
    ui.setVisible('curtain', false);

    const curtainBg = scene.add.rectangle.mock.results[4]?.value;
    const curtainButtonBg = scene.add.rectangle.mock.results[5]?.value;
    const curtainTitleText = scene.add.text.mock.results[6]?.value;
    const curtainSubtitleText = scene.add.text.mock.results[7]?.value;
    expect(curtainBg.visible).toBe(false);
    expect(curtainTitleText.visible).toBe(false);
    expect(curtainSubtitleText.visible).toBe(false);
    expect(curtainButtonBg.visible).toBe(false);
  });
});

describe('minor ending overlay state', () => {
  it('minor ending hides stale dialogue and timer while keeping title, body, and button inside the viewport', () => {
    resetSceneDebugState();
    const scene = createMockScene();
    const ui = new NarrativeUIManager(scene as never);

    ui.setDialogue('杨云', '这里不该继续显示。', 'portrait.yangYunBlue', true);
    ui.setTimer(30_000, true);
    ui.setMinorEnding(true, '你触发了错误的选择。', () => undefined);

    const state = getSceneDebugState().ui;
    expect(state.minorEndingVisible).toBe(true);
    expect(state.dialogueVisible).toBe(false);
    expect(state.timerVisible).toBe(false);

    const dialogueBg = scene.add.rectangle.mock.results[1]?.value;
    const timerText = scene.add.text.mock.results[5]?.value;
    expect(dialogueBg.visible).toBe(false);
    expect(timerText.visible).toBe(false);

    const visual = ui.getVisualDebugState() as NarrativeVisualDebugState;
    const minorEndingTitle = visual.minorEndingTitle;
    const minorEndingBody = visual.minorEndingBody;
    const minorEndingButton = visual.minorEndingButton;
    const minorEndingButtonText = visual.minorEndingButtonText;
    if (!minorEndingTitle || !minorEndingBody || !minorEndingButton || !minorEndingButtonText) throw new Error('missing minor ending visual bounds');

    expectInsideViewport(minorEndingTitle);
    expectInsideViewport(minorEndingBody);
    expectInsideViewport(minorEndingButton);
    expectInsideViewport(minorEndingButtonText);
    expectNoOverlap(minorEndingTitle, minorEndingBody);
    expectNoOverlap(minorEndingBody, minorEndingButton);
    expect(minorEndingButton.width).toBeGreaterThan(minorEndingButtonText.width);
    expect(minorEndingButton.height).toBeGreaterThan(minorEndingButtonText.height);
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
