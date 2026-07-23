import { describe, it, expect, vi } from 'vitest';

// Mock Phaser to avoid canvas initialization in jsdom
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
    },
  };
});

import { RunLifecycle } from '../../forgottenSanity/run/RunLifecycle';
import { ForgottenSanityScene } from '../../forgottenSanity/ForgottenSanityScene';

describe('Combat SFX integration', () => {
  it('RunLifecycle setOnCombatSfxCallback is defined on the prototype', () => {
    expect(RunLifecycle.prototype.setOnCombatSfxCallback).toBeDefined();
  });

  it('RunLifecycle setOnCombatSfxCallback is a function', () => {
    expect(typeof RunLifecycle.prototype.setOnCombatSfxCallback).toBe('function');
  });

  it('ForgottenSanityScene setAudioManager is defined on the prototype', () => {
    expect(ForgottenSanityScene.prototype.setAudioManager).toBeDefined();
  });

  it('ForgottenSanityScene getAudioManager is defined on the prototype', () => {
    expect(ForgottenSanityScene.prototype.getAudioManager).toBeDefined();
  });

  it('ForgottenSanityScene setAudioManager is a function', () => {
    expect(typeof ForgottenSanityScene.prototype.setAudioManager).toBe('function');
  });
});
