import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    readonly sceneKey: string;
    constructor(key?: string) {
      this.sceneKey = key ?? '';
    }
  }
  class Game {
    scene = { stop: vi.fn(), start: vi.fn() };
    constructor(_config: unknown) {}
  }
  return {
    default: {
      Game,
      Scene,
      AUTO: 'auto',
      Scale: { FIT: 'fit', CENTER_BOTH: 'center-both' },
    },
  };
});

import { createGame, createGameConfig } from '../../game/createGame';
import { ForgottenSanityHubScene } from '../../forgottenSanity/ForgottenSanityHubScene';
import { ForgottenSanityScene } from '../../forgottenSanity/ForgottenSanityScene';

describe('createGameConfig 注册被遗忘的理智场景', () => {
  it('scene 数组以 Boot→Preload→Game→Play→Hub→ForgottenSanity 顺序包含 6 个场景类', () => {
    const config = createGameConfig('game-root') as { scene: Array<new () => unknown> };
    const names = config.scene.map((cls) => cls.name);
    expect(names).toEqual([
      'BootScene',
      'PreloadScene',
      'GameScene',
      'PlayScene',
      'ForgottenSanityHubScene',
      'ForgottenSanityScene',
    ]);
    expect(config.scene[4]).toBe(ForgottenSanityHubScene);
    expect(config.scene[5]).toBe(ForgottenSanityScene);
  });
});

describe('createGame 暴露 startForgottenSanityHub 窗口助手', () => {
  it('调用 startForgottenSanityHub 停止 GameScene 并启动 ForgottenSanityHubScene', () => {
    const game = createGame('game-root') as unknown as {
      scene: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
    };
    const w = window as unknown as {
      __YING_ZHONG_JIU_GAME__: { startPlayScene: () => void; startForgottenSanityHub: () => void };
    };
    expect(w.__YING_ZHONG_JIU_GAME__).toBeDefined();
    expect(typeof w.__YING_ZHONG_JIU_GAME__.startForgottenSanityHub).toBe('function');
    w.__YING_ZHONG_JIU_GAME__.startForgottenSanityHub();
    expect(game.scene.stop).toHaveBeenCalledWith('GameScene');
    expect(game.scene.start).toHaveBeenCalledWith('ForgottenSanityHubScene');
  });
});
