import type Phaser from 'phaser';
import { SfxSynth } from './SfxSynth';

export type SfxName =
  | 'attackSwing' | 'hit' | 'hurt' | 'kill' | 'projectile' | 'wallBounce'
  | 'buttonClick' | 'panelPopup' | 'chestUnlock' | 'decrypt' | 'purchase'
  | 'pause' | 'resume'
  | 'dialogueAdvance' | 'speakerChange' | 'branchAppear' | 'branchConfirm' | 'taskUpdate'
  | 'bloodBlackFrame' | 'whiteSilhouette' | 'blackSilhouette' | 'finalBloodBlack'
  | 'chaseHeartbeat' | 'realityTear';

export type BgmKey =
  | 'menu_bgm' | 'explore_act1_bgm' | 'explore_fs_bgm' | 'hub_bgm'
  | 'chase_bgm' | 'combat_bgm' | 'sanity_bgm'
  | 'minor_ending_bgm' | 'major_ending_bgm' | 'fb_burst_sfx';

export const AUDIO_KEYS: BgmKey[] = [
  'menu_bgm', 'explore_act1_bgm', 'explore_fs_bgm', 'hub_bgm',
  'chase_bgm', 'combat_bgm', 'sanity_bgm',
  'minor_ending_bgm', 'major_ending_bgm', 'fb_burst_sfx',
];

export const AUDIO_FILE_PATHS: Record<BgmKey, string> = {
  menu_bgm: 'assets/audio/bgm/menu_bgm.ogg',
  explore_act1_bgm: 'assets/audio/bgm/explore_act1_bgm.ogg',
  explore_fs_bgm: 'assets/audio/bgm/explore_fs_bgm.ogg',
  hub_bgm: 'assets/audio/bgm/hub_bgm.ogg',
  chase_bgm: 'assets/audio/bgm/chase_bgm.ogg',
  combat_bgm: 'assets/audio/bgm/combat_bgm.ogg',
  sanity_bgm: 'assets/audio/bgm/sanity_bgm.ogg',
  minor_ending_bgm: 'assets/audio/bgm/minor_ending_bgm.ogg',
  major_ending_bgm: 'assets/audio/bgm/major_ending_bgm.ogg',
  fb_burst_sfx: 'assets/audio/bgm/fb_burst_sfx.ogg',
};

export class AudioManager {
  private scene: Phaser.Scene;
  private synth: SfxSynth;
  private enabled = true;
  private currentBgmKey: BgmKey | null = null;
  private currentBgm: Phaser.Sound.BaseSound | null = null;
  private currentBgmVolume = 0;
  private previousBgmKey: BgmKey | null = null;
  private previousBgmVolume = 0;
  private dialogueActive = false;
  private ambientTimers: Phaser.Time.TimerEvent[] = [];
  private heartbeatTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, audioCtx: AudioContext | null) {
    this.scene = scene;
    this.synth = new SfxSynth(audioCtx);
  }

  isEnabled(): boolean { return this.enabled; }
  getCurrentBgmKey(): BgmKey | null { return this.currentBgmKey; }

  playBgm(key: BgmKey, volume: number): void {
    if (!this.enabled) return;
    this.stopBgmInternal();
    this.currentBgmKey = key;
    this.currentBgmVolume = volume;
    this.currentBgm = this.scene.sound.add(key, { volume, loop: true });
    (this.currentBgm as any).play();
  }

  switchBgm(key: BgmKey, volume: number, durationMs = 500): void {
    if (!this.enabled) return;
    if (this.currentBgmKey === key) return;
    if (this.currentBgm) {
      this.fadeOut(this.currentBgm, durationMs);
    }
    this.previousBgmKey = this.currentBgmKey;
    this.previousBgmVolume = this.currentBgmVolume;
    this.currentBgmKey = key;
    this.currentBgmVolume = volume;
    this.currentBgm = this.scene.sound.add(key, { volume: 0, loop: true });
    (this.currentBgm as any).play();
    this.fadeIn(this.currentBgm, volume, durationMs);
  }

  switchBgmImmediate(key: BgmKey, volume: number): void {
    if (!this.enabled) return;
    this.stopBgmInternal();
    this.currentBgmKey = key;
    this.currentBgmVolume = volume;
    this.currentBgm = this.scene.sound.add(key, { volume, loop: true });
    (this.currentBgm as any).play();
  }

  stopBgm(): void {
    this.stopBgmInternal();
    this.currentBgmKey = null;
  }

  pauseBgm(): void {
    if (this.currentBgm) {
      this.previousBgmKey = this.currentBgmKey;
      this.previousBgmVolume = this.currentBgmVolume;
      (this.currentBgm as any).stop();
    }
  }

  resumeBgm(): void {
    if (this.previousBgmKey && this.enabled) {
      this.playBgm(this.previousBgmKey, this.previousBgmVolume);
    }
  }

  playSfx(name: SfxName): void {
    if (!this.enabled) return;
    switch (name) {
      case 'attackSwing': this.synth.playAttackSwing(); break;
      case 'hit': this.synth.playHit(); break;
      case 'hurt': this.synth.playHurt(); break;
      case 'kill': this.synth.playKill(); break;
      case 'projectile': this.synth.playProjectile(); break;
      case 'wallBounce': this.synth.playWallBounce(); break;
      case 'buttonClick': this.synth.playButtonClick(); break;
      case 'panelPopup': this.synth.playPanelPopup(); break;
      case 'chestUnlock': this.synth.playChestUnlock(); break;
      case 'decrypt': this.synth.playDecrypt(); break;
      case 'purchase': this.synth.playPurchase(); break;
      case 'pause': this.synth.playPause(); break;
      case 'resume': this.synth.playResume(); break;
      case 'dialogueAdvance': this.synth.playDialogueAdvance(); break;
      case 'speakerChange': this.synth.playSpeakerChange(); break;
      case 'branchAppear': this.synth.playBranchAppear(); break;
      case 'branchConfirm': this.synth.playBranchConfirm(); break;
      case 'taskUpdate': this.synth.playTaskUpdate(); break;
      case 'bloodBlackFrame': this.synth.playBloodBlackFrame(); break;
      case 'whiteSilhouette': this.synth.playWhiteSilhouette(); break;
      case 'blackSilhouette': this.synth.playBlackSilhouette(); break;
      case 'finalBloodBlack': this.synth.playFinalBloodBlack(); break;
      case 'chaseHeartbeat': this.synth.playChaseHeartbeat(60); break;
      case 'realityTear': this.synth.playRealityTear(); break;
    }
  }

  playChaseHeartbeat(bpm: number): void {
    this.synth.playChaseHeartbeat(bpm);
  }

  startHeartbeat(bpm: number): void {
    this.stopHeartbeat();
    const intervalMs = 60000 / bpm;
    this.synth.playChaseHeartbeat(bpm);
    this.heartbeatTimer = this.scene.time.addEvent({
      delay: intervalMs,
      callback: () => this.synth.playChaseHeartbeat(bpm),
      loop: true,
    });
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.heartbeatTimer.remove();
      this.heartbeatTimer = null;
    }
  }

  setDialogueActive(active: boolean): void {
    this.dialogueActive = active;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      if (this.currentBgm) {
        this.fadeOut(this.currentBgm, 200);
      }
      this.stopAmbient();
    } else {
      if (this.currentBgmKey) {
        this.playBgm(this.currentBgmKey, this.currentBgmVolume);
      }
    }
  }

  startAmbient(): void {
    if (!this.enabled) return;
    this.scheduleAmbientEvent('electrical', 30000, 60000);
    this.scheduleAmbientEvent('whisper', 30000, 60000);
  }

  stopAmbient(): void {
    for (const timer of this.ambientTimers) {
      timer.remove();
    }
    this.ambientTimers = [];
  }

  private stopBgmInternal(): void {
    if (this.currentBgm) {
      (this.currentBgm as any).stop();
      this.scene.sound.remove(this.currentBgm as any);
      this.currentBgm = null;
    }
  }

  private fadeOut(sound: Phaser.Sound.BaseSound, durationMs: number): void {
    const s = sound as any;
    const steps = 10;
    const stepMs = durationMs / steps;
    const startVol = s.volume || 1;
    for (let i = 1; i <= steps; i++) {
      this.scene.time.delayedCall(i * stepMs, () => {
        if (s) s.setVolume(startVol * (1 - i / steps));
      });
    }
    this.scene.time.delayedCall(durationMs, () => {
      if (s) { s.stop(); this.scene.sound.remove(s); }
    });
  }

  private fadeIn(sound: Phaser.Sound.BaseSound, targetVolume: number, durationMs: number): void {
    const s = sound as any;
    const steps = 10;
    const stepMs = durationMs / steps;
    s.setVolume(0);
    for (let i = 1; i <= steps; i++) {
      this.scene.time.delayedCall(i * stepMs, () => {
        if (s) s.setVolume(targetVolume * (i / steps));
      });
    }
  }

  private scheduleAmbientEvent(_type: string, minMs: number, maxMs: number): void {
    const delay = minMs + Math.random() * (maxMs - minMs);
    const timer = this.scene.time.delayedCall(delay, () => {
      if (!this.enabled) return;
      if (_type === 'electrical') {
        this.synth.playNoiseBurst(0.3, 0.1, 'bandpass', 120);
      } else if (_type === 'whisper') {
        this.synth.playNoiseBurst(0.5, 0.08, 'bandpass', 800);
      }
      this.scheduleAmbientEvent(_type, minMs, maxMs);
    });
    this.ambientTimers.push(timer);
  }
}
