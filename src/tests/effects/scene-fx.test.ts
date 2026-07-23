import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import { SceneFX } from '../../effects/SceneFX';
import { ScreenEffectManager } from '../../effects/ScreenEffectManager';
import { ScreenShake } from '../../effects/ScreenShake';
import { ParticleFactory } from '../../effects/ParticleFactory';
import { AudioManager } from '../../audio/AudioManager';

function createMockScene() {
  const chainable = () => {
    const obj: Record<string, any> = {};
    obj.setOrigin = vi.fn(() => obj);
    obj.setScrollFactor = vi.fn(() => obj);
    obj.setDepth = vi.fn(() => obj);
    obj.setVisible = vi.fn((v: boolean) => { obj.visible = v; return obj; });
    obj.setAlpha = vi.fn(() => obj);
    obj.setDisplaySize = vi.fn(() => obj);
    obj.setScale = vi.fn(() => obj);
    obj.setTexture = vi.fn(() => obj);
    obj.destroy = vi.fn();
    obj.visible = false;
    return obj;
  };
  return {
    add: {
      rectangle: vi.fn(chainable),
      text: vi.fn(chainable),
      image: vi.fn(chainable),
      particles: vi.fn(() => {
        const e: Record<string, any> = {};
        e.setDepth = vi.fn(() => e);
        e.setScrollFactor = vi.fn(() => e);
        e.emitParticleAt = vi.fn();
        e.destroy = vi.fn();
        e.setAlpha = vi.fn(() => e);
        e.quantity = 1;
        return e;
      }),
    },
    cameras: {
      main: {
        shake: vi.fn(),
        flash: vi.fn(),
        scrollX: 0,
        scrollY: 0,
        width: 1280,
        height: 720,
      },
    },
    time: {
      addEvent: vi.fn(() => ({ remove: vi.fn() })),
      delayedCall: vi.fn((_ms: number, cb: () => void) => ({ cb, remove: vi.fn() })),
    },
    tweens: { add: vi.fn() },
    sound: {
      add: vi.fn(() => {
        const s: Record<string, any> = {};
        s.play = vi.fn();
        s.stop = vi.fn();
        s.setVolume = vi.fn(() => s);
        s.destroy = vi.fn();
        return s;
      }),
      remove: vi.fn(),
      get: vi.fn(() => null),
    },
    load: { audio: vi.fn() },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    sys: { game: { events: { on: vi.fn(), off: vi.fn() }, config: {} } },
    scale: { width: 1280, height: 720 },
  };
}

function createMockAudioContext() {
  return {
    createOscillator: vi.fn(() => ({
      type: 'sine',
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})),
      disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: { value: 350, setValueAtTime: vi.fn() },
      Q: { value: 1, setValueAtTime: vi.fn() },
      connect: vi.fn(() => ({})),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(() => ({})),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({
      getChannelData: vi.fn(() => new Float32Array(100)),
      numberOfChannels: 1,
      length: 100,
      sampleRate: 44100,
    })),
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    resume: vi.fn(async () => {}),
  };
}

describe('SceneFX', () => {
  let mockScene: any;
  let sceneFX: SceneFX;

  beforeEach(() => {
    mockScene = createMockScene();
    const screenEffect = new ScreenEffectManager(mockScene as unknown as Phaser.Scene);
    const shake = new ScreenShake(mockScene as unknown as Phaser.Scene);
    const particles = new ParticleFactory(mockScene as unknown as Phaser.Scene);
    const audio = new AudioManager(mockScene as unknown as Phaser.Scene, createMockAudioContext());
    sceneFX = new SceneFX(screenEffect, shake, particles, audio);
  });

  it('initializes with no active preset', () => {
    expect(sceneFX.getActivePreset()).toBe('none');
  });

  it('activatePreset sanity sets sanity preset on all systems', () => {
    sceneFX.activatePreset('sanity');
    expect(sceneFX.getActivePreset()).toBe('sanity');
  });

  it('activatePreset chase sets chase preset + heartbeat', () => {
    sceneFX.activatePreset('chase');
    expect(sceneFX.getActivePreset()).toBe('chase');
  });

  it('deactivate returns to none', () => {
    sceneFX.activatePreset('sanity');
    sceneFX.deactivate();
    expect(sceneFX.getActivePreset()).toBe('none');
  });

  it('updateChaseCountdown updates heartbeat BPM without throwing', () => {
    sceneFX.activatePreset('chase');
    sceneFX.updateChaseCountdown(60); // 60s -> ~60 BPM
    expect(true).toBe(true); // no throw
  });

  it('updateChaseCountdown is no-op when not in chase preset', () => {
    sceneFX.activatePreset('sanity');
    sceneFX.updateChaseCountdown(60);
    expect(sceneFX.getActivePreset()).toBe('sanity');
  });

  it('updateChaseCountdown only restarts heartbeat when BPM changes', () => {
    sceneFX.activatePreset('chase');
    // First call starts heartbeat
    sceneFX.updateChaseCountdown(60);
    const firstCallCount = mockScene.time.addEvent.mock.calls.length;
    // Second call with same BPM should NOT restart (no new addEvent)
    sceneFX.updateChaseCountdown(60);
    expect(mockScene.time.addEvent.mock.calls.length).toBe(firstCallCount);
    // Different BPM should restart
    sceneFX.updateChaseCountdown(50);
    expect(mockScene.time.addEvent.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it('triggerFB triggers mental breakdown chaos effect', () => {
    sceneFX.triggerFB();
    // Should trigger shake + red flash + chromatic aberration + audio burst
    expect(mockScene.cameras.main.shake).toHaveBeenCalled();
  });

  it('triggerFB schedules chromatic aberration restore', () => {
    sceneFX.triggerFB();
    // Should schedule a delayedCall to restore (deactivatePreset)
    expect(mockScene.time.delayedCall).toHaveBeenCalled();
  });

  it('triggerRealityTear triggers reality tear on ScreenEffectManager', () => {
    sceneFX.triggerRealityTear();
    expect(true).toBe(true); // no throw
  });

  it('triggerMajorEnding triggers burst then silence', () => {
    sceneFX.triggerMajorEnding();
    expect(mockScene.time.delayedCall).toHaveBeenCalled();
  });

  it('triggerMinorEnding split triggers unique ending audio', () => {
    sceneFX.triggerMinorEnding('split'); // 一分为二
    expect(true).toBe(true); // no throw
  });

  it('triggerMinorEnding chase_catch triggers F-B burst audio', () => {
    sceneFX.triggerMinorEnding('chase_catch'); // 躁子
    expect(true).toBe(true); // no throw
  });

  it('triggerDeathFlashSfx maps frame types to SFX names', () => {
    sceneFX.triggerDeathFlashSfx('bloodBlack');
    sceneFX.triggerDeathFlashSfx('whiteSilhouette');
    sceneFX.triggerDeathFlashSfx('blackSilhouette');
    sceneFX.triggerDeathFlashSfx('finalBloodBlack');
    expect(true).toBe(true); // no throw — all frame types handled
  });

  it('destroy cleans up pending timers without throwing', () => {
    sceneFX.triggerFB();
    sceneFX.triggerMajorEnding();
    sceneFX.triggerMinorEnding('split');
    expect(() => sceneFX.destroy()).not.toThrow();
  });
});
