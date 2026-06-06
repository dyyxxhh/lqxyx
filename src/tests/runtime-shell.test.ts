import { describe, expect, it } from 'vitest';

import {
  GAME_HEIGHT,
  GAME_WIDTH,
  createInitialSceneDebugState,
  markGameSceneReady,
  markPreloadReady,
  markSceneStarted,
  resetSceneDebugState,
  setCanvasDebugState,
} from '../game/scaffoldState';

describe('runtime scene shell', () => {
  it('records BootScene, PreloadScene, and GameScene exactly once with preload readiness before game readiness', () => {
    resetSceneDebugState();

    markSceneStarted('BootScene');
    markSceneStarted('PreloadScene');
    markSceneStarted('PreloadScene');
    markPreloadReady();
    markSceneStarted('GameScene');
    const state = markGameSceneReady();

    expect(state.sceneOrder).toEqual(['BootScene', 'PreloadScene', 'GameScene']);
    expect(state.sceneCounts).toEqual({ BootScene: 1, PreloadScene: 2, GameScene: 1 });
    expect(state.booted).toBe(true);
    expect(state.preloaded).toBe(true);
    expect(state.gameReady).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.menu).toEqual({ visible: true, selectedAction: 'new-game' });
  });

  it('exposes deterministic sizing and canvas debug info for desktop and mobile landscape checks', () => {
    resetSceneDebugState();

    const state = setCanvasDebugState({
      parentId: 'game-root',
      canvasWidth: 1280,
      canvasHeight: 720,
      displayWidth: 915,
      displayHeight: 412,
      viewportWidth: 915,
      viewportHeight: 412,
    });

    expect(state.canvas).toEqual({
      parentId: 'game-root',
      canvasWidth: 1280,
      canvasHeight: 720,
      displayWidth: 915,
      displayHeight: 412,
      viewportWidth: 915,
      viewportHeight: 412,
    });
    expect(state.sizing).toEqual({
      mode: 'FIT',
      autoCenter: 'CENTER_BOTH',
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      aspectRatio: GAME_WIDTH / GAME_HEIGHT,
    });
  });

  it('starts with shell-specific debug fields in their inactive state', () => {
    expect(createInitialSceneDebugState()).toMatchObject({
      sceneOrder: [],
      currentScene: null,
      booted: false,
      preloaded: false,
      gameReady: false,
      ready: false,
      sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0 },
      menu: { visible: false, selectedAction: null },
      canvas: null,
    });
  });
});
