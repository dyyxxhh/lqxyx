import { getSceneDebugState } from '../game/scaffoldState';

export interface StoryTimerState {
  id: string;
  remainingMs: number;
}

export interface StoryDebugState {
  currentCheckpointId: string | null;
  currentActId: string | null;
  currentCommandIndex: number;
  isExecuting: boolean;
  activeTimers: StoryTimerState[];
  pendingBranchId: string | null;
  currentEndingId: string | null;
}

export function createInitialStoryDebugState(): StoryDebugState {
  return {
    currentCheckpointId: null,
    currentActId: 'act-1',
    currentCommandIndex: 0,
    isExecuting: false,
    activeTimers: [],
    pendingBranchId: null,
    currentEndingId: null,
  };
}

export function setStoryDebugState(partial: Partial<StoryDebugState>): StoryDebugState {
  const state = getSceneDebugState();
  state.story = { ...state.story, ...partial };
  return state.story;
}
