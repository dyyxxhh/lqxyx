import { getSceneDebugState } from '../game/scaffoldState';
import type { CharacterId } from '../data/story';
import { UI_THEME } from './uiTheme';

export const DISPLAY_NAMES: Record<string, string> = {
  yangYunBlue: '杨云',
  yangYunRed: '杨云',
  dongJihao: '董继豪',
  danYuxuan: '但宇轩',
  qinHaorui: '秦浩睿',
  unknown: '？？？',
};

export const PORTRAIT_KEYS: Record<string, string> = {
  yangYunBlue: 'portrait.yangYunBlue',
  yangYunRed: 'portrait.yangYunRed',
  dongJihao: 'portrait.dongJihao',
  danYuxuan: 'portrait.danYuxuan',
  qinHaorui: 'portrait.qinHaorui',
};

const ROLE_PROMPT_BORDER_COLORS: Record<string, number> = {
  yangYunBlue: UI_THEME.colors.borderBlue,
  yangYunRed: UI_THEME.colors.border,
  dongJihao: UI_THEME.colors.borderBlue,
};

export function getRolePromptBorderColor(characterId: string): number {
  return ROLE_PROMPT_BORDER_COLORS[characterId] ?? UI_THEME.colors.border;
}

export function getDisplayName(characterId: string): string {
  return DISPLAY_NAMES[characterId] ?? characterId;
}

export function getPortraitKey(characterId: string): string | undefined {
  return PORTRAIT_KEYS[characterId];
}

export function getDialoguePortraitKey(speaker: string, currentCharacterId?: CharacterId): string | undefined {
  if (speaker === '杨云') {
    if (currentCharacterId === 'yangYunBlue' || currentCharacterId === 'yangYunRed') {
      return PORTRAIT_KEYS[currentCharacterId];
    }

    return PORTRAIT_KEYS.yangYunRed;
  }

  const speakerToCharacterId: Record<string, CharacterId> = {
    董继豪: 'dongJihao',
    但宇轩: 'danYuxuan',
    秦浩睿: 'qinHaorui',
  };

  const characterId = speakerToCharacterId[speaker];
  return characterId ? PORTRAIT_KEYS[characterId] : undefined;
}

export interface NarrativeUiDebugState {
  taskVisible: boolean;
  taskText: string;
  dialogueVisible: boolean;
  dialogueSpeaker: string;
  dialogueText: string;
  dialoguePortraitKey: string | null;
  rolePromptVisible: boolean;
  roleCharacterId: string;
  roleDisplayName: string;
  timerVisible: boolean;
  timerRemainingMs: number;
  curtainVisible: boolean;
  curtainTitle: string;
  curtainSubtitle: string;
  minorEndingVisible: boolean;
  minorEndingBody: string;
}

export function createInitialNarrativeUiDebugState(): NarrativeUiDebugState {
  return {
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
  };
}

export function setNarrativeUiDebugState(partial: Partial<NarrativeUiDebugState>): NarrativeUiDebugState {
  const state = getSceneDebugState();
  state.ui = { ...state.ui, ...partial };
  return state.ui;
}
