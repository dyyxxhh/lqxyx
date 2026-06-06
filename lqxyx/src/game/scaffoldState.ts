import type { PreloadDebugState } from '../scenes/preloadState';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GAME_SCENES = ['BootScene', 'PreloadScene', 'GameScene'] as const;

export type GameSceneName = (typeof GAME_SCENES)[number];

export interface SceneDebugState {
  sceneOrder: GameSceneName[];
  currentScene: GameSceneName | null;
  booted: boolean;
  preloaded: boolean;
  gameReady: boolean;
  preload: PreloadDebugState | null;
}

declare global {
  interface Window {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  }
}

export function createInitialSceneDebugState(): SceneDebugState {
  return {
    sceneOrder: [],
    currentScene: null,
    booted: false,
    preloaded: false,
    gameReady: false,
    preload: null,
  };
}

export function getSceneDebugState(): SceneDebugState {
  if (typeof window === 'undefined') {
    return createInitialSceneDebugState();
  }

  window.__YING_ZHONG_JIU_SCENE_STATE__ ??= createInitialSceneDebugState();
  return window.__YING_ZHONG_JIU_SCENE_STATE__;
}

export function markSceneStarted(sceneName: GameSceneName): SceneDebugState {
  const state = getSceneDebugState();

  if (!state.sceneOrder.includes(sceneName)) {
    state.sceneOrder.push(sceneName);
  }

  state.currentScene = sceneName;
  state.booted ||= sceneName === 'BootScene';
  state.preloaded ||= sceneName === 'PreloadScene';
  state.gameReady ||= sceneName === 'GameScene';

  return state;
}

export function setPreloadDebugState(preload: PreloadDebugState): SceneDebugState {
  const state = getSceneDebugState();
  state.preload = preload;
  return state;
}
