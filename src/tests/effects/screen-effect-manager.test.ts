import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import { ScreenEffectManager, type PostProcessingParams } from '../../effects/ScreenEffectManager';

function createMockScene() {
  return {
    add: {
      rectangle: vi.fn(() => ({
        setOrigin: vi.fn(function() { return this; }),
        setScrollFactor: vi.fn(function() { return this; }),
        setDepth: vi.fn(function() { return this; }),
        setVisible: vi.fn(function() { return this; }),
        setAlpha: vi.fn(function() { return this; }),
        destroy: vi.fn(),
      })),
    },
    cameras: { main: { setPostPipeline: vi.fn() } },
    time: { addEvent: vi.fn(), delayedCall: vi.fn() },
    tweens: { add: vi.fn() },
  };
}

describe('ScreenEffectManager', () => {
  let mockScene: any;
  let manager: ScreenEffectManager;

  beforeEach(() => {
    mockScene = createMockScene();
    manager = new ScreenEffectManager(mockScene as unknown as Phaser.Scene);
  });

  it('initializes with baseline params (clearly stylized)', () => {
    const params = manager.getParams();
    expect(params.crtIntensity).toBeCloseTo(0.15);
    expect(params.grainIntensity).toBeCloseTo(0.08);
    expect(params.vignetteAmount).toBeCloseTo(0.65);
    expect(params.chromaticAberration).toBeCloseTo(2);
    expect(params.bloomEnabled).toBe(false);
  });

  it('setParams updates parameters', () => {
    manager.setParams({ grainIntensity: 0.16 });
    expect(manager.getParams().grainIntensity).toBeCloseTo(0.16);
  });

  it('activateSanityPreset sets sanity parameters', () => {
    manager.activateSanityPreset();
    const params = manager.getParams();
    expect(params.grainIntensity).toBeCloseTo(0.16);
    expect(params.vignetteAmount).toBeCloseTo(0.85);
    expect(params.chromaticAberration).toBeCloseTo(6);
  });

  it('activateChasePreset sets chase parameters', () => {
    manager.activateChasePreset();
    const params = manager.getParams();
    expect(params.vignetteAmount).toBeCloseTo(0.75);
    expect(params.grainIntensity).toBeCloseTo(0.12);
    expect(params.chromaticAberration).toBeCloseTo(4);
  });

  it('deactivatePreset returns to baseline', () => {
    manager.activateSanityPreset();
    manager.deactivatePreset();
    const params = manager.getParams();
    expect(params.grainIntensity).toBeCloseTo(0.08);
    expect(params.vignetteAmount).toBeCloseTo(0.65);
    expect(params.chromaticAberration).toBeCloseTo(2);
  });

  it('triggerBloom enables bloom temporarily', () => {
    manager.triggerBloom(300);
    expect(manager.getParams().bloomEnabled).toBe(true);
  });

  it('triggerRealityTear sets extreme chromatic aberration + grain', () => {
    manager.triggerRealityTear();
    const params = manager.getParams();
    expect(params.chromaticAberration).toBeGreaterThanOrEqual(6);
    expect(params.grainIntensity).toBeGreaterThanOrEqual(0.15);
  });
});
