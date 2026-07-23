// src/tests/full-wiring.test.ts
// Task 14: Verify full effect system wiring across all scenes.
import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas/WebGL initialization in jsdom
vi.mock('phaser', () => {
  class Scene {
    readonly sceneKey: string;
    constructor(key?: string) {
      this.sceneKey = key ?? '';
    }
  }
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
      GameObjects: {
        Rectangle: class {},
        Text: class {},
        Sprite: class {},
        Image: class {},
        Container: class {},
      },
      Math: { Vector2: class { x = 0; y = 0; } },
    },
  };
});

describe('Full effect system wiring', () => {
  it('PlayScene class is defined', async () => {
    const mod = await import('../scenes/PlayScene');
    expect(mod.PlayScene).toBeDefined();
  });

  it('ForgottenSanityScene class is defined', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityScene');
    expect(mod.ForgottenSanityScene).toBeDefined();
  });

  it('ForgottenSanityScene has setAudioManager method', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityScene');
    expect(typeof mod.ForgottenSanityScene.prototype.setAudioManager).toBe('function');
  });

  it('ForgottenSanityScene has getAudioManager method', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityScene');
    expect(typeof mod.ForgottenSanityScene.prototype.getAudioManager).toBe('function');
  });

  it('ForgottenSanityScene has getSceneFX method', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityScene');
    expect(typeof mod.ForgottenSanityScene.prototype.getSceneFX).toBe('function');
  });

  it('ForgottenSanityScene has getScreenEffect method', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityScene');
    expect(typeof mod.ForgottenSanityScene.prototype.getScreenEffect).toBe('function');
  });

  it('ForgottenSanityRunController has setCombatSfxCallback method', async () => {
    const mod = await import('../forgottenSanity/ForgottenSanityRunController');
    expect(typeof mod.ForgottenSanityRunController.prototype.setCombatSfxCallback).toBe('function');
  });

  it('ScreenEffectManager has setEnabled method', async () => {
    const mod = await import('../effects/ScreenEffectManager');
    expect(typeof mod.ScreenEffectManager.prototype.setEnabled).toBe('function');
  });

  it('ScreenEffectManager has isEnabled method', async () => {
    const mod = await import('../effects/ScreenEffectManager');
    expect(typeof mod.ScreenEffectManager.prototype.isEnabled).toBe('function');
  });

  it('AudioManager exports AUDIO_KEYS and AUDIO_FILE_PATHS', async () => {
    const audioMod = await import('../audio/AudioManager');
    expect(audioMod.AUDIO_KEYS).toBeDefined();
    expect(audioMod.AUDIO_FILE_PATHS).toBeDefined();
  });
});
