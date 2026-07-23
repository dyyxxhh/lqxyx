import type Phaser from 'phaser';
import { ScreenEffectManager } from './ScreenEffectManager';
import { ScreenShake } from './ScreenShake';
import { ParticleFactory } from './ParticleFactory';
import { AudioManager, type BgmKey } from '../audio/AudioManager';

export type PresetName = 'none' | 'sanity' | 'chase';
export type MinorEndingType = 'split' | 'chase_catch';

/**
 * Scene effect coordinator. Manages preset system for sanity dissolution
 * and chase sequences, coordinating ScreenEffectManager, ScreenShake,
 * ParticleFactory, and AudioManager.
 *
 * Grill-me decisions:
 * - Chase: full pressure throughout, heartbeat throughout
 * - Sanity phantoms: story dialogue fragments
 * - F-B: mental breakdown chaos
 * - Minor endings: unique per ending + echo decay
 * - Major ending: burst then silence
 */
export class SceneFX {
  private screenEffect: ScreenEffectManager;
  private shake: ScreenShake;
  private particles: ParticleFactory;
  private audio: AudioManager;
  private activePreset: PresetName = 'none';
  private scene: Phaser.Scene;

  constructor(
    screenEffect: ScreenEffectManager,
    shake: ScreenShake,
    particles: ParticleFactory,
    audio: AudioManager,
  ) {
    this.screenEffect = screenEffect;
    this.shake = shake;
    this.particles = particles;
    this.audio = audio;
    // Extract scene from ScreenShake (they share the same scene)
    this.scene = (shake as any).scene;
  }

  getActivePreset(): PresetName {
    return this.activePreset;
  }

  /** Activate a scene preset. */
  activatePreset(preset: PresetName): void {
    this.activePreset = preset;
    switch (preset) {
      case 'sanity':
        this.activateSanity();
        break;
      case 'chase':
        this.activateChase();
        break;
      case 'none':
        this.deactivate();
        break;
    }
  }

  /** Deactivate current preset, return to baseline. */
  deactivate(): void {
    this.activePreset = 'none';
    this.screenEffect.deactivatePreset();
    this.audio.stopHeartbeat();
    this.particles.setAshDensityMultiplier(1);
    this.audio.switchBgm('explore_act1_bgm' as BgmKey, 0.25, 500);
  }

  /** Update chase countdown (called every frame during chase). */
  updateChaseCountdown(remainingSeconds: number): void {
    if (this.activePreset !== 'chase') return;
    // BPM: 120s -> 60 BPM, 10s -> 180 BPM
    const bpm = Math.round(60 + (120 - remainingSeconds) * (120 / 110));
    this.audio.startHeartbeat(bpm);
    if (remainingSeconds <= 10) {
      this.screenEffect.triggerChaseRedPulse();
    }
  }

  /** F-B: mental breakdown chaos (grill-me: 精神崩溃混乱). */
  triggerFB(): void {
    this.shake.shakeFB();
    this.shake.flashRed(200, 0.5);
    this.screenEffect.setParams({ chromaticAberration: 8 });
    this.audio.playSfx('realityTear');
    // BGM distortion + layered whispers burst
    this.audio.switchBgmImmediate('fb_burst_sfx' as BgmKey, 0.6);
  }

  /** Reality tear: chromatic aberration burst + grain + low-freq impact. */
  triggerRealityTear(): void {
    this.screenEffect.triggerRealityTear();
    this.audio.playSfx('realityTear');
  }

  /** Major ending: burst then silence (grill-me: 爆发后死寂). */
  triggerMajorEnding(): void {
    // Burst: all effects maxed for 0.5s
    this.screenEffect.setParams({ bloomEnabled: true, bloomIntensity: 1.0, grainIntensity: 0.3 });
    this.shake.shakeCustom(20, 500);
    // After 0.5s: complete silence
    this.scene.time.delayedCall(500, () => {
      this.audio.stopBgm();
      this.audio.stopAmbient();
      this.audio.stopHeartbeat();
      this.screenEffect.deactivatePreset();
    });
  }

  /** Minor ending: unique per ending (grill-me: 每结局独特). */
  triggerMinorEnding(type: MinorEndingType): void {
    switch (type) {
      case 'split':
        // 一分为二: tearing sound (downward sweep + noise burst + distortion)
        this.audio.playSfx('kill');
        this.audio.playSfx('finalBloodBlack');
        break;
      case 'chase_catch':
        // 躁子 (F-B): chaotic whisper burst + distorted BGM fragments
        this.audio.playSfx('realityTear');
        this.audio.switchBgmImmediate('fb_burst_sfx' as BgmKey, 0.5);
        break;
    }
    // After ending: echo decay transition back to exploration (2s)
    this.scene.time.delayedCall(2000, () => {
      this.audio.switchBgm('explore_act1_bgm' as BgmKey, 0.25, 1000);
    });
  }

  /** Death flash frame SFX trigger. */
  triggerDeathFlashSfx(frameType: 'bloodBlack' | 'whiteSilhouette' | 'blackSilhouette' | 'finalBloodBlack'): void {
    switch (frameType) {
      case 'bloodBlack': this.audio.playSfx('bloodBlackFrame'); break;
      case 'whiteSilhouette': this.audio.playSfx('whiteSilhouette'); break;
      case 'blackSilhouette': this.audio.playSfx('blackSilhouette'); break;
      case 'finalBloodBlack': this.audio.playSfx('finalBloodBlack'); break;
    }
  }

  private activateSanity(): void {
    this.screenEffect.activateSanityPreset();
    this.particles.setAshDensityMultiplier(2);
    this.audio.switchBgmImmediate('sanity_bgm' as BgmKey, 0.5);
    this.audio.startAmbient();
  }

  private activateChase(): void {
    this.screenEffect.activateChasePreset();
    this.particles.setAshDensityMultiplier(1.5);
    this.audio.switchBgmImmediate('chase_bgm' as BgmKey, 0.4);
    this.audio.startHeartbeat(60); // Start at 60 BPM, accelerates
  }
}
