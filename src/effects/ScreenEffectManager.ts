import type Phaser from 'phaser';

export interface PostProcessingParams {
  crtIntensity: number;
  grainIntensity: number;
  vignetteAmount: number;
  chromaticAberration: number;
  bloomEnabled: boolean;
  bloomIntensity: number;
  shakeIntensity: number;
}

const BASELINE_PARAMS: PostProcessingParams = {
  crtIntensity: 0.15,
  grainIntensity: 0.08,
  vignetteAmount: 0.65,
  chromaticAberration: 2,
  bloomEnabled: false,
  bloomIntensity: 0,
  shakeIntensity: 0,
};

const SANITY_PARAMS: Partial<PostProcessingParams> = {
  grainIntensity: 0.16,
  vignetteAmount: 0.85,
  chromaticAberration: 6,
  shakeIntensity: 0.003,
};

const CHASE_PARAMS: Partial<PostProcessingParams> = {
  grainIntensity: 0.12,
  vignetteAmount: 0.75,
  chromaticAberration: 4,
  shakeIntensity: 0.005,
};

export class ScreenEffectManager {
  private scene: Phaser.Scene;
  private params: PostProcessingParams = { ...BASELINE_PARAMS };
  private activePreset: 'none' | 'sanity' | 'chase' = 'none';
  private enabled = true;
  private smoothTween: Phaser.Tweens.Tween | null = null;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];
  private redPulseActive = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Toggle post-processing on/off (wired to PauseMenu pixel filter toggle). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Stop any in-flight smooth transition so its onUpdate doesn't clobber the
    // baseline params we reset to below.
    this.smoothTween?.stop();
    this.smoothTween = null;
    if (!enabled) {
      // Reset to no-effect baseline when disabled
      this.params = { ...BASELINE_PARAMS, crtIntensity: 0, grainIntensity: 0, vignetteAmount: 0, chromaticAberration: 0 };
    } else {
      this.params = { ...BASELINE_PARAMS };
      if (this.activePreset === 'sanity') this.activateSanityPreset();
      else if (this.activePreset === 'chase') this.activateChasePreset();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getParams(): PostProcessingParams {
    return { ...this.params };
  }

  setParams(updates: Partial<PostProcessingParams>): void {
    this.params = { ...this.params, ...updates };
  }

  setParamsSmooth(updates: Partial<PostProcessingParams>, durationMs = 300): void {
    if (!this.enabled) {
      this.params = { ...this.params, ...updates };
      return;
    }
    // Cancel previous smooth transition
    this.smoothTween?.stop();
    this.smoothTween = null;
    // Build a proxy holding the START values for each numeric property. The
    // target (end) values are spread as top-level keys on the tween config so
    // Phaser's TweenBuilder creates real TweenData for them — without this,
    // `tweens.add` receives only reserved keys (targets/duration/ease/...)
    // and creates a tween with zero TweenData (effectively a timer), so the
    // params jump instantly instead of interpolating.
    const proxy: Record<string, number> = {};
    const targets: Record<string, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'number') {
        const startValue = this.params[key as keyof PostProcessingParams] as number;
        proxy[key] = startValue;
        targets[key] = value;
      }
    }
    const targetKeys = Object.keys(targets);
    if (targetKeys.length > 0 && this.scene?.tweens) {
      // Capture key list once to avoid per-frame allocation in onUpdate.
      const keys = [...targetKeys];
      this.smoothTween = this.scene.tweens.add({
        targets: proxy,
        duration: durationMs,
        ease: 'Linear',
        // Spread target values as top-level tween properties so TweenBuilder
        // creates TweenData for each one.
        ...targets,
        onComplete: () => { this.smoothTween = null; },
        onUpdate: () => {
          const p = this.params as unknown as Record<string, unknown>;
          for (const key of keys) {
            p[key] = proxy[key];
          }
        },
      });
    }
    // Non-number params (bloomEnabled etc) set immediately
    const p = this.params as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'number') {
        p[key] = value;
      }
    }
  }

  activateSanityPreset(): void {
    this.activePreset = 'sanity';
    this.setParamsSmooth(SANITY_PARAMS);
  }

  activateChasePreset(): void {
    this.activePreset = 'chase';
    this.setParamsSmooth(CHASE_PARAMS);
  }

  deactivatePreset(): void {
    this.activePreset = 'none';
    this.setParamsSmooth(BASELINE_PARAMS);
  }

  getActivePreset(): 'none' | 'sanity' | 'chase' {
    return this.activePreset;
  }

  triggerBloom(durationMs = 300): void {
    this.params.bloomEnabled = true;
    this.params.bloomIntensity = 0.5;
    if (!this.scene.time) return;
    const t = this.scene.time.delayedCall(durationMs, () => {
      this.params.bloomEnabled = false;
      this.params.bloomIntensity = 0;
    });
    this.pendingTimers.push(t);
  }

  triggerRealityTear(): void {
    this.setParamsSmooth({
      chromaticAberration: 8,
      grainIntensity: 0.20,
    }, 200);
    if (!this.scene.time) return;
    const t = this.scene.time.delayedCall(300, () => {
      if (this.activePreset === 'sanity') this.activateSanityPreset();
      else if (this.activePreset === 'chase') this.activateChasePreset();
      else this.deactivatePreset();
    });
    this.pendingTimers.push(t);
  }

  /**
   * Red pulse overlay for chase countdown <= 10s.
   * Triggers bloom internally; the caller is responsible for also calling
   * ScreenShake.flashRed() to produce the red flash visual.
   * Includes debouncing to prevent timer accumulation from per-frame calls.
   */
  triggerChaseRedPulse(durationMs = 300): void {
    if (this.redPulseActive) return; // Debounce: skip if already pulsing
    this.redPulseActive = true;
    this.triggerBloom(durationMs);
    const t = this.scene.time?.delayedCall(durationMs, () => {
      this.redPulseActive = false;
    });
    if (t) this.pendingTimers.push(t);
  }

  destroy(): void {
    this.smoothTween?.stop();
    this.smoothTween = null;
    for (const t of this.pendingTimers) {
      t.remove();
    }
    this.pendingTimers = [];
  }
}
