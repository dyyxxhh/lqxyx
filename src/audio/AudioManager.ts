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
  // Reserved for future BGM ducking during dialogue.
  private dialogueActive = false;
  private ambientTimers: Phaser.Time.TimerEvent[] = [];
  private heartbeatTimer: Phaser.Time.TimerEvent | null = null;
  // Fade-in/fade-out timers scheduled by fadeOut()/fadeIn(). Tracked so they
  // can be cancelled when BGM changes mid-fade (e.g. setEnabled(true) within
  // 200ms of setEnabled(false)) — without this, pending fade callbacks keep
  // writing volume / calling stop+remove on an already-detached sound, which
  // can double-remove the sound from the audio manager.
  private fadeTimers: Phaser.Time.TimerEvent[] = [];

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
    this.currentBgm.play();
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
    this.currentBgm.play();
    this.fadeIn(this.currentBgm, volume, durationMs);
  }

  switchBgmImmediate(key: BgmKey, volume: number): void {
    if (!this.enabled) return;
    this.stopBgmInternal();
    this.currentBgmKey = key;
    this.currentBgmVolume = volume;
    this.currentBgm = this.scene.sound.add(key, { volume, loop: true });
    this.currentBgm.play();
  }

  stopBgm(): void {
    this.stopBgmInternal();
    this.currentBgmKey = null;
  }

  pauseBgm(): void {
    if (this.currentBgm) {
      this.stopBgmInternal();
      this.previousBgmKey = this.currentBgmKey;
      this.previousBgmVolume = this.currentBgmVolume;
      this.currentBgmKey = null;
    }
  }

  resumeBgm(): void {
    if (this.currentBgm) return;
    if (this.previousBgmKey && this.enabled) {
      this.playBgm(this.previousBgmKey, this.previousBgmVolume);
      this.previousBgmKey = null;
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
      default: {
        // Exhaustiveness check: ensures every SfxName is handled.
        const _exhaustive: never = name;
        void _exhaustive;
      }
    }
  }

  playChaseHeartbeat(bpm: number): void {
    this.synth.playChaseHeartbeat(bpm);
  }

  startHeartbeat(bpm: number): void {
    if (!this.enabled) return;
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

  /**
   * Tear down all audio: stop BGM, ambient loops, heartbeat, and the synth.
   * The shared AudioContext is NOT closed here (it is owned by the caller).
   */
  destroy(): void {
    this.stopBgm();
    this.stopAmbient();
    this.stopHeartbeat();
    this.cancelFades();
    this.synth.destroy();
  }

  /** Cancel all pending fade-in/fade-out timers. Safe to call any time. */
  private cancelFades(): void {
    for (const t of this.fadeTimers) t.remove();
    this.fadeTimers = [];
  }

  /** Whether dialogue is active (reserved for future BGM ducking). */
  isDialogueActive(): boolean {
    return this.dialogueActive;
  }

  setDialogueActive(active: boolean): void {
    // Reserved for future BGM ducking during dialogue (currently a no-op).
    this.dialogueActive = active;
  }

  setEnabled(enabled: boolean): void {
    // Cancel any in-flight fade so its callbacks don't keep writing volume /
    // calling stop+remove on a sound we're about to swap out (double-remove).
    this.cancelFades();
    this.enabled = enabled;
    if (!enabled) {
      if (this.currentBgm) {
        this.fadeOut(this.currentBgm, 200);
      }
      this.stopAmbient();
      this.stopHeartbeat();
    } else {
      if (this.currentBgmKey) {
        this.playBgm(this.currentBgmKey, this.currentBgmVolume);
      }
      this.startAmbient();
    }
  }

  startAmbient(): void {
    if (!this.enabled) return;
    // Idempotent: clear any in-flight ambient timers before scheduling new ones.
    this.stopAmbient();
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
      // Cancel any pending fade on this sound so its callbacks don't keep
      // writing volume / calling stop+remove on the sound we're stopping now
      // (double-remove).
      this.cancelFades();
      this.currentBgm.stop();
      this.scene.sound.remove(this.currentBgm);
      this.currentBgm = null;
    }
  }

  private fadeOut(sound: Phaser.Sound.BaseSound, durationMs: number): void {
    // Phaser.Sound.BaseSound does not expose volume/setVolume; those live on the
    // concrete WebAudioSound implementation, so assert for volume access only.
    const steps = 10;
    const stepMs = durationMs / steps;
    const startVol = (sound as Phaser.Sound.WebAudioSound).volume || 1;
    for (let i = 1; i <= steps; i++) {
      const t = this.scene.time.delayedCall(i * stepMs, () => {
        (sound as Phaser.Sound.WebAudioSound).setVolume(startVol * (1 - i / steps));
        // Remove this fired timer from the tracked set.
        this.fadeTimers = this.fadeTimers.filter(x => x !== t);
      });
      this.fadeTimers.push(t);
    }
    const finalT = this.scene.time.delayedCall(durationMs, () => {
      sound.stop();
      this.scene.sound.remove(sound);
      this.fadeTimers = this.fadeTimers.filter(x => x !== finalT);
    });
    this.fadeTimers.push(finalT);
  }

  private fadeIn(sound: Phaser.Sound.BaseSound, targetVolume: number, durationMs: number): void {
    // Phaser.Sound.BaseSound does not expose volume/setVolume; those live on the
    // concrete WebAudioSound implementation, so assert for volume access only.
    const steps = 10;
    const stepMs = durationMs / steps;
    (sound as Phaser.Sound.WebAudioSound).setVolume(0);
    for (let i = 1; i <= steps; i++) {
      const t = this.scene.time.delayedCall(i * stepMs, () => {
        (sound as Phaser.Sound.WebAudioSound).setVolume(targetVolume * (i / steps));
        this.fadeTimers = this.fadeTimers.filter(x => x !== t);
      });
      this.fadeTimers.push(t);
    }
  }

  private scheduleAmbientEvent(_type: string, minMs: number, maxMs: number): void {
    const delay = minMs + Math.random() * (maxMs - minMs);
    const timer = this.scene.time.delayedCall(delay, () => {
      if (!this.enabled) return;
      // Remove this fired timer before rescheduling so the array never accumulates
      // stale entries (prevents a timer leak across the session lifetime).
      this.ambientTimers = this.ambientTimers.filter(t => t !== timer);
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
