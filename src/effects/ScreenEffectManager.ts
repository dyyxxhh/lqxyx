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
    // Create a proxy object to tween
    const proxy: Record<string, number> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'number') {
        proxy[key] = this.params[key as keyof PostProcessingParams] as number;
      }
    }
    if (Object.keys(proxy).length > 0 && this.scene?.tweens) {
      this.smoothTween = this.scene.tweens.add({
        targets: proxy,
        duration: durationMs,
        ease: 'Linear',
        onComplete: () => { this.smoothTween = null; },
        onUpdate: () => {
          for (const key of Object.keys(proxy)) {
            (this.params as any)[key] = proxy[key];
          }
        },
      });
      // Set target values for tween
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'number') {
          proxy[key] = value;
        }
      }
    }
    // Non-number params (bloomEnabled etc) set immediately
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'number') {
        (this.params as any)[key] = value;
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
