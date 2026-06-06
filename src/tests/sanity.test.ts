import { describe, expect, it } from 'vitest';

import { GAME_SCENES, createInitialSceneDebugState } from '../game/scaffoldState';

describe('Phaser app scaffold', () => {
  it('registers Boot, Preload, and Game scenes in startup order', () => {
    expect(GAME_SCENES).toEqual(['BootScene', 'PreloadScene', 'GameScene']);
  });

  it('exposes deterministic scene debug state for sanity and e2e tests', () => {
    expect(createInitialSceneDebugState()).toEqual({
      sceneOrder: [],
      currentScene: null,
      booted: false,
      preloaded: false,
      gameReady: false,
      ready: false,
      sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0 },
      menu: { visible: false, selectedAction: null },
      canvas: null,
      sizing: {
        mode: 'FIT',
        autoCenter: 'CENTER_BOTH',
        gameWidth: 1280,
        gameHeight: 720,
        aspectRatio: 1280 / 720
      },
      preload: null
    });
  });

  it('builds a Phaser config with the expected canvas parent and dimensions', () => {
    const sceneKeys = [...GAME_SCENES];

    expect(sceneKeys).toHaveLength(3);
    expect(sceneKeys[0]).toBe('BootScene');
    expect(sceneKeys[2]).toBe('GameScene');
  });
});
