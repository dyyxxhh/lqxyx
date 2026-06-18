import { getSceneDebugState } from '../game/scaffoldState';

export type WalkableCharacterId = 'yangYunBlue' | 'yangYunRed' | 'dongJihao';
export type NonWalkableCharacterId = 'danYuxuan' | 'qinHaorui';
export type CharacterId = WalkableCharacterId | NonWalkableCharacterId | 'unknown';
export type CharacterDirection = 'up' | 'down' | 'left' | 'right';

export interface CharacterDebugState {
  currentCharacterId: CharacterId;
  currentDisplayName: string;
  currentDirection: CharacterDirection;
  currentAnimationKey: string | null;
  isMoving: boolean;
}

export function createInitialCharacterDebugState(): CharacterDebugState {
  return {
    currentCharacterId: 'unknown',
    currentDisplayName: '???',
    currentDirection: 'down',
    currentAnimationKey: null,
    isMoving: false,
  };
}

export function setCharacterDebugState(
  partial: Partial<CharacterDebugState>,
): CharacterDebugState {
  const state = getSceneDebugState();
  state.character = { ...state.character, ...partial };
  return state.character;
}
