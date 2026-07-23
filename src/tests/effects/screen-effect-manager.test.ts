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
    time: {
      addEvent: vi.fn(),
      delayedCall: vi.fn(() => ({ remove: vi.fn() })),
    },
    tweens: {
      add: vi.fn((config: any) => {
        const tween = { stop: vi.fn() };
        // Defer onUpdate/onComplete so the proxy target values are set first
        queueMicrotask(() => {
          if (config.onUpdate) config.onUpdate();
          if (config.onComplete) config.onComplete();
        });
        return tween;
      }),
    },
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

  it('activateSanityPreset sets sanity parameters', async () => {
    manager.activateSanityPreset();
    await Promise.resolve();
    const params = manager.getParams();
    expect(params.grainIntensity).toBeCloseTo(0.16);
    expect(params.vignetteAmount).toBeCloseTo(0.85);
    expect(params.chromaticAberration).toBeCloseTo(6);
  });

  it('activateChasePreset sets chase parameters', async () => {
    manager.activateChasePreset();
    await Promise.resolve();
    const params = manager.getParams();
    expect(params.vignetteAmount).toBeCloseTo(0.75);
    expect(params.grainIntensity).toBeCloseTo(0.12);
    expect(params.chromaticAberration).toBeCloseTo(4);
  });

  it('deactivatePreset returns to baseline', async () => {
    manager.activateSanityPreset();
    manager.deactivatePreset();
    await Promise.resolve();
    const params = manager.getParams();
    expect(params.grainIntensity).toBeCloseTo(0.08);
    expect(params.vignetteAmount).toBeCloseTo(0.65);
    expect(params.chromaticAberration).toBeCloseTo(2);
  });

  it('triggerBloom enables bloom temporarily', () => {
    manager.triggerBloom(300);
    expect(manager.getParams().bloomEnabled).toBe(true);
  });

  it('triggerRealityTear sets extreme chromatic aberration + grain', async () => {
    manager.triggerRealityTear();
    await Promise.resolve();
    const params = manager.getParams();
    expect(params.chromaticAberration).toBeGreaterThanOrEqual(6);
    expect(params.grainIntensity).toBeGreaterThanOrEqual(0.15);
  });

  it('destroy cleans up tween and timers without throwing', () => {
    manager.triggerBloom(300);
    manager.triggerRealityTear();
    expect(() => manager.destroy()).not.toThrow();
  });

  it('triggerChaseRedPulse debounces repeated calls', () => {
    manager.triggerChaseRedPulse(300);
    manager.triggerChaseRedPulse(300); // should be debounced
    // Only one delayedCall for the debounce reset (triggerBloom also adds one)
    const delayedCalls = mockScene.time.delayedCall.mock.calls.length;
    expect(delayedCalls).toBeGreaterThanOrEqual(2); // bloom + debounce reset
    expect(delayedCalls).toBeLessThanOrEqual(2); // not 3 (second pulse debounced)
  });

  it('setParamsSmooth uses tween when enabled', async () => {
    manager.setParamsSmooth({ chromaticAberration: 10 }, 200);
    expect(mockScene.tweens.add).toHaveBeenCalled();
    await Promise.resolve();
    expect(manager.getParams().chromaticAberration).toBeCloseTo(10);
  });

  it('setParamsSmooth applies immediately when disabled', () => {
    manager.setEnabled(false);
    manager.setParamsSmooth({ chromaticAberration: 10 }, 200);
    expect(mockScene.tweens.add).not.toHaveBeenCalled();
    // When disabled, updates are applied immediately (no tween)
    expect(manager.getParams().chromaticAberration).toBeCloseTo(10);
  });
});
