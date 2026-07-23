import {
  createInitialCharacterDebugState,
  type CharacterDebugState,
} from '../characters/characterState';
import { createInitialInputDebugState, type InputDebugState } from '../input/inputState';
import { createDefaultSaveState, createSaveDebugState, loadSaveState, type SaveDebugState } from '../state/saveState';
import type { PreloadDebugState } from '../scenes/preloadState';
import { createInitialStoryDebugState, type StoryDebugState } from '../story/eventState';
import { createInitialNarrativeUiDebugState, type NarrativeUiDebugState } from '../ui/uiState';
import { createInitialMapDebugState, type MapDebugState } from '../map/mapState';
import type { ForgottenSanityTestHooks } from '../forgottenSanity/ForgottenSanityScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GAME_SCENES = ['BootScene', 'PreloadScene', 'GameScene', 'PlayScene'] as const;

export type GameSceneName = (typeof GAME_SCENES)[number];

export interface SceneMenuDebugState {
  readonly visible: boolean;
  readonly selectedAction: 'new-game' | 'continue' | null;
  readonly hasContinue: boolean;
}

export interface SceneCanvasDebugState {
  readonly parentId: string | null;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface SceneSizingDebugState {
  readonly mode: 'FIT';
  readonly autoCenter: 'CENTER_BOTH';
  readonly gameWidth: number;
  readonly gameHeight: number;
  readonly aspectRatio: number;
}

/**
 * 被遗忘的理智 子状态（plan 2026-07-19 Task 1）。
 * 由 ForgottenSanityScene / ForgottenSanityRunController 通过测试钩子聚合，
 * 供 E2E 与手动 QA 通过 window.__YING_ZHONG_JIU_SCENE_STATE__.forgottenSanity 断言。
 */
export interface ForgottenSanityDebugState {
  scene: 'hub' | 'run' | 'none';
  inventory?: { items: Record<string, number>; vaultKey: number };
  combat?: {
    enemyCount: number;
    duplicateCount: number;
    farRoomCount: number;
    playerRoomId: string | null;
  };
  exploredCells?: number[];
  vaultDoorUnlocked?: boolean;
  vaultChestsOpened?: number;
  paused?: boolean;
}

export interface SceneDebugState {
  sceneOrder: GameSceneName[];
  currentScene: GameSceneName | null;
  booted: boolean;
  preloaded: boolean;
  gameReady: boolean;
  ready: boolean;
  sceneCounts: Record<GameSceneName, number>;
  menu: SceneMenuDebugState;
  canvas: SceneCanvasDebugState | null;
  sizing: SceneSizingDebugState;
  preload: PreloadDebugState | null;
  save: SaveDebugState;
  input: InputDebugState;
  story: StoryDebugState;
  ui: NarrativeUiDebugState;
  character: CharacterDebugState;
  map: MapDebugState;
  /** 被遗忘的理智 子状态（仅在 ForgottenSanityScene/Hub 活跃时填充）。 */
  forgottenSanity?: ForgottenSanityDebugState;
}

declare global {
  interface Window {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: ForgottenSanityTestHooks;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
  }
}

export function createInitialSceneDebugState(): SceneDebugState {
  return {
    sceneOrder: [],
    currentScene: null,
    booted: false,
    preloaded: false,
    gameReady: false,
    ready: false,
    sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0, PlayScene: 0 },
    menu: { visible: false, selectedAction: null, hasContinue: false },
    canvas: null,
    sizing: {
      mode: 'FIT',
      autoCenter: 'CENTER_BOTH',
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      aspectRatio: GAME_WIDTH / GAME_HEIGHT,
    },
    preload: null,
    save: createSaveDebugState({ status: 'empty', state: createDefaultSaveState() }),
    input: createInitialInputDebugState(),
    story: createInitialStoryDebugState(),
    ui: createInitialNarrativeUiDebugState(),
    character: createInitialCharacterDebugState(),
    map: createInitialMapDebugState(),
  };
}

export function resetSceneDebugState(): SceneDebugState {
  const state = createInitialSceneDebugState();

  if (typeof window !== 'undefined') {
    window.__YING_ZHONG_JIU_SCENE_STATE__ = state;
  }

  return state;
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

  state.sceneCounts[sceneName] += 1;

  if (!state.sceneOrder.includes(sceneName)) {
    state.sceneOrder.push(sceneName);
  }

  state.currentScene = sceneName;
  state.booted ||= sceneName === 'BootScene';
  state.preloaded ||= sceneName === 'PreloadScene';
  state.gameReady ||= sceneName === 'GameScene';

  return state;
}

export function markPreloadReady(): SceneDebugState {
  const state = getSceneDebugState();
  state.preloaded = true;
  return state;
}

export function markGameSceneReady(): SceneDebugState {
  const state = getSceneDebugState();
  state.gameReady = true;
  state.ready = true;
  const save = refreshSaveDebugState().save;
  state.menu = { visible: true, selectedAction: 'new-game', hasContinue: save.hasValidSave };
  return state;
}

export function refreshSaveDebugState(): SceneDebugState {
  const state = getSceneDebugState();
  state.save = createSaveDebugState(loadSaveState());
  state.menu = { ...state.menu, hasContinue: state.save.hasValidSave };
  return state;
}

export function setCanvasDebugState(canvas: SceneCanvasDebugState): SceneDebugState {
  const state = getSceneDebugState();
  state.canvas = canvas;
  return state;
}

export function refreshCanvasDebugState(parentId = 'game-root'): SceneDebugState {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return getSceneDebugState();
  }

  const canvas = document.querySelector<HTMLCanvasElement>(`#${parentId} canvas`);

  if (!canvas) {
    return getSceneDebugState();
  }

  const rect = canvas.getBoundingClientRect();

  return setCanvasDebugState({
    parentId: canvas.parentElement?.id ?? null,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    displayWidth: rect.width,
    displayHeight: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
}

export function setPreloadDebugState(preload: PreloadDebugState): SceneDebugState {
  const state = getSceneDebugState();
  state.preload = preload;
  return state;
}
