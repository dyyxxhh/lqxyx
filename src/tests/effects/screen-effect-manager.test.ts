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
        let stopped = false;
        const tween = {
          stop: vi.fn(() => { stopped = true; }),
          isStopped: () => stopped,
        };
        // Phaser reserves a set of config keys (targets, duration, ease,
        // onComplete, onUpdate, ...). Any OTHER top-level key is a tween
        // property whose value is the TARGET (end) value. Simulate a tween
        // that interpolates `targets[key]` from its current value to the
        // target across two onUpdate steps, then fires onComplete. This
        // catches regressions where the tween config has no real tween
        // property keys (which would make params jump instantly). Honors
        // stop() like real Phaser (no further callbacks after stop).
        const reserved = new Set([
          'targets', 'duration', 'ease', 'delay', 'paused', 'useFrames',
          'repeat', 'repeatDelay', 'yoyo', 'flipX', 'flipY', 'persist',
          'interpolation', 'easeParams', 'onStart', 'onUpdate', 'onComplete',
          'onActive', 'onYoyo', 'onRepeat', 'onLoop', 'props',
        ]);
        const targetEntries = Object.entries(config)
          .filter(([k]) => !reserved.has(k))
          .map(([k, v]) => [k, v as number]);
        const proxy = config.targets as Record<string, number>;
        queueMicrotask(() => {
          if (stopped) return; // honor stop()
          // Step 1: move halfway to target.
          for (const [k, target] of targetEntries) {
            const current = proxy[k];
            if (typeof current === 'number' && typeof target === 'number') {
              proxy[k] = (current + target) / 2;
            }
          }
          config.onUpdate?.();
          if (stopped) return;
          // Step 2: reach target.
          for (const [k, target] of targetEntries) {
            if (typeof target === 'number') proxy[k] = target;
          }
          config.onUpdate?.();
          config.onComplete?.();
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

  it('setParamsSmooth passes target values as tween properties (not reserved-only config)', () => {
    // Regression: tween config must include real tween property keys (the
    // numeric targets) so Phaser's TweenBuilder creates TweenData. A config
    // with only reserved keys produces zero TweenData and params jump
    // instantly instead of interpolating.
    manager.setParamsSmooth({ chromaticAberration: 10, grainIntensity: 0.20 }, 200);
    const call = mockScene.tweens.add.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call).toBeDefined();
    expect(call.chromaticAberration).toBe(10);
    expect(call.grainIntensity).toBeCloseTo(0.20);
  });

  it('setEnabled(false) stops a running smooth tween so its onUpdate no longer mutates params', async () => {
    manager.setParamsSmooth({ chromaticAberration: 10 }, 200);
    expect(manager.getParams().chromaticAberration).toBeCloseTo(2); // baseline before microtask
    manager.setEnabled(false); // should stop the tween + reset to disabled baseline
    await Promise.resolve(); // microtask runs but should early-return (stopped)
    expect(manager.getParams().chromaticAberration).toBeCloseTo(0); // disabled baseline preserved
  });

  it('setParamsSmooth applies immediately when disabled', () => {
    manager.setEnabled(false);
    manager.setParamsSmooth({ chromaticAberration: 10 }, 200);
    expect(mockScene.tweens.add).not.toHaveBeenCalled();
    // When disabled, updates are applied immediately (no tween)
    expect(manager.getParams().chromaticAberration).toBeCloseTo(10);
  });
});
