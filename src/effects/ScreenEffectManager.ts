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

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getParams(): PostProcessingParams {
    return { ...this.params };
  }

  setParams(updates: Partial<PostProcessingParams>): void {
    this.params = { ...this.params, ...updates };
  }

  setParamsSmooth(updates: Partial<PostProcessingParams>, durationMs = 300): void {
    this.params = { ...this.params, ...updates };
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
    this.scene.time?.delayedCall(durationMs, () => {
      this.params.bloomEnabled = false;
      this.params.bloomIntensity = 0;
    });
  }

  triggerRealityTear(): void {
    this.setParamsSmooth({
      chromaticAberration: 8,
      grainIntensity: 0.20,
    }, 200);
    this.scene.time?.delayedCall(300, () => {
      if (this.activePreset === 'sanity') this.activateSanityPreset();
      else if (this.activePreset === 'chase') this.activateChasePreset();
      else this.deactivatePreset();
    });
  }

  triggerChaseRedPulse(): void {
    // Red pulse overlay for countdown <= 10s
  }

  destroy(): void {
    // Clean up shaders, overlays, timers
  }
}
