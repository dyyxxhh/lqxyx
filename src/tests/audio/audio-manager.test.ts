import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import { AudioManager } from '../../audio/AudioManager';

vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0; });

function createMockAudioContext() {
  return {
    createOscillator: vi.fn(() => ({
      type: 'sine', frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})), disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass', frequency: { value: 350, setValueAtTime: vi.fn() }, Q: { value: 1, setValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})), disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null, connect: vi.fn(() => ({})), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({ getChannelData: vi.fn(() => new Float32Array(100)), numberOfChannels: 1, length: 100, sampleRate: 44100 })),
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    currentTime: 0, sampleRate: 44100, state: 'running', resume: vi.fn(async () => {}),
  };
}

function createMockSound(key: string) {
  return {
    key, isPlaying: false, volume: 1, mute: false, rate: 1, detune: 0,
    play: vi.fn(function() { this.isPlaying = true; return this; }),
    stop: vi.fn(function() { this.isPlaying = false; return this; }),
    pause: vi.fn(function() { this.isPlaying = false; return this; }),
    resume: vi.fn(function() { this.isPlaying = true; return this; }),
    setVolume: vi.fn(function(v: number) { this.volume = v; return this; }),
    setMute: vi.fn(function(m: boolean) { this.mute = m; return this; }),
    destroy: vi.fn(),
  };
}

function createMockScene() {
  const sounds = new Map<string, any>();
  return {
    sound: {
      add: vi.fn((key: string) => {
        const s = createMockSound(key);
        sounds.set(key, s);
        return s;
      }),
      get: vi.fn((key: string) => sounds.get(key) || null),
      remove: vi.fn(() => true),
      removeAll: vi.fn(() => { sounds.clear(); }),
      mute: false, volume: 1,
    },
    load: { audio: vi.fn() },
    time: { delayedCall: vi.fn((ms: number, cb: () => void) => ({ ms, cb, remove: vi.fn() })), addEvent: vi.fn((config: any) => ({ ...config, remove: vi.fn() })) },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    sys: { game: { events: { on: vi.fn(), off: vi.fn() } } },
  };
}

describe('AudioManager', () => {
  let mockScene: any;
  let mockCtx: any;
  let manager: AudioManager;

  beforeEach(() => {
    mockScene = createMockScene();
    mockCtx = createMockAudioContext();
    manager = new AudioManager(mockScene as unknown as Phaser.Scene, mockCtx);
  });

  it('initializes with empty state', () => {
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getCurrentBgmKey()).toBeNull();
  });

  it('playBgm adds and plays a sound', () => {
    manager.playBgm('menu_bgm', 0.3);
    expect(mockScene.sound.add).toHaveBeenCalledWith('menu_bgm', expect.any(Object));
    expect(manager.getCurrentBgmKey()).toBe('menu_bgm');
  });

  it('switchBgm crossfades old and new BGM', () => {
    manager.playBgm('explore_bgm', 0.25);
    manager.switchBgm('chase_bgm', 0.4, 500);
    expect(manager.getCurrentBgmKey()).toBe('chase_bgm');
  });

  it('stopBgm stops current BGM', () => {
    manager.playBgm('menu_bgm', 0.3);
    manager.stopBgm();
    expect(manager.getCurrentBgmKey()).toBeNull();
  });

  it('setEnabled(false) stops BGM and mutes SFX', () => {
    manager.playBgm('menu_bgm', 0.3);
    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);
  });

  it('setEnabled(true) restores BGM', () => {
    manager.playBgm('menu_bgm', 0.3);
    manager.setEnabled(false);
    manager.setEnabled(true);
    expect(manager.isEnabled()).toBe(true);
  });

  it('pauseBgm completely stops BGM (grill-me: complete stop)', () => {
    manager.playBgm('explore_bgm', 0.25);
    manager.pauseBgm();
    const bgm = mockScene.sound.get('explore_bgm');
    expect(bgm?.stop).toHaveBeenCalled();
  });

  it('resumeBgm restarts the previous BGM', () => {
    manager.playBgm('explore_bgm', 0.25);
    manager.pauseBgm();
    manager.resumeBgm();
    expect(manager.getCurrentBgmKey()).toBe('explore_bgm');
  });

  it('playSfx calls SfxSynth methods', () => {
    manager.playSfx('attackSwing');
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });

  it('playSfx does nothing when disabled', () => {
    manager.setEnabled(false);
    const initialCallCount = mockCtx.createOscillator.mock.calls.length;
    manager.playSfx('hit');
    expect(mockCtx.createOscillator.mock.calls.length).toBe(initialCallCount);
  });

  it('setDialogueActive does not duck BGM (grill-me: no ducking)', () => {
    manager.playBgm('explore_bgm', 0.25);
    const bgmBefore = mockScene.sound.get('explore_bgm');
    const volumeBefore = bgmBefore?.volume;
    manager.setDialogueActive(true);
    manager.setDialogueActive(false);
    expect(bgmBefore?.volume).toBe(volumeBefore);
  });

  it('handles null AudioContext gracefully', () => {
    const silentManager = new AudioManager(mockScene as unknown as Phaser.Scene, null);
    expect(() => silentManager.playSfx('hit')).not.toThrow();
    expect(() => silentManager.playBgm('menu_bgm', 0.3)).not.toThrow();
  });
});

describe('Audio integration constants', () => {
  it('AUDIO_KEYS export contains all 10 BGM keys', async () => {
    const { AUDIO_KEYS } = await import('../../audio/AudioManager');
    expect(AUDIO_KEYS).toHaveLength(10);
    expect(AUDIO_KEYS).toContain('menu_bgm');
    expect(AUDIO_KEYS).toContain('chase_bgm');
    expect(AUDIO_KEYS).toContain('fb_burst_sfx');
  });

  it('AUDIO_FILE_PATHS export maps keys to file paths', async () => {
    const { AUDIO_FILE_PATHS } = await import('../../audio/AudioManager');
    expect(AUDIO_FILE_PATHS['menu_bgm']).toContain('assets/audio/bgm/');
    expect(AUDIO_FILE_PATHS['menu_bgm']).toContain('.ogg');
  });
});
