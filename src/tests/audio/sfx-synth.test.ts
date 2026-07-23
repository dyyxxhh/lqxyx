import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SfxSynth } from '../../audio/SfxSynth';

// Several SFX methods (e.g. playPanelPopup, playTaskUpdate, playChaseHeartbeat,
// playDecrypt) schedule staggered tones via setTimeout. The unit tests below
// assert on the number of created audio nodes synchronously, so stub setTimeout
// to fire its callback immediately. This is file-scoped (vitest isolates each
// test file in its own environment) and only affects this suite.
vi.stubGlobal('setTimeout', (fn: () => void) => {
  fn();
  return 0;
});

function createMockAudioContext() {
  const nodes: any[] = [];
  const ctx = {
    createOscillator: vi.fn(() => {
      const node = {
        type: 'sine', frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((target: any) => { node._connected = target; return node; }),
        start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
      };
      nodes.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = {
        gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn((target: any) => { node._connected = target; return node; }),
        disconnect: vi.fn(),
      };
      nodes.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = {
        type: 'lowpass', frequency: { value: 350, setValueAtTime: vi.fn() }, Q: { value: 1, setValueAtTime: vi.fn() },
        connect: vi.fn((target: any) => { node._connected = target; return node; }),
        disconnect: vi.fn(),
      };
      nodes.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null, connect: vi.fn((target: any) => { node._connected = target; return node; }), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(),
      };
      nodes.push(node);
      return node;
    }),
    createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
      getChannelData: vi.fn(() => new Float32Array(length)),
      numberOfChannels: channels, length, sampleRate,
    })),
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    resume: vi.fn(async () => {}),
  };
  return { ctx, nodes };
}

describe('SfxSynth', () => {
  let mockCtx: any;
  let synth: SfxSynth;

  beforeEach(() => {
    const mock = createMockAudioContext();
    mockCtx = mock.ctx;
    synth = new SfxSynth(mockCtx);
  });

  it('creates an oscillator-gain chain and starts/stops it', () => {
    synth.playTone(440, 0.1, 'sine', 0.3);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(1);
    const osc = mockCtx.createOscillator.mock.results[0].value;
    const gain = mockCtx.createGain.mock.results[0].value;
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
  });

  it('creates a noise burst buffer', () => {
    synth.playNoiseBurst(0.15, 0.2, 'lowpass', 1000);
    expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(mockCtx.createBuffer).toHaveBeenCalledTimes(1);
    expect(mockCtx.createBiquadFilter).toHaveBeenCalledTimes(1);
    const filter = mockCtx.createBiquadFilter.mock.results[0].value;
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(1000, 0);
  });

  it('handles null AudioContext gracefully (no-op)', () => {
    const silentSynth = new SfxSynth(null as any);
    expect(() => silentSynth.playTone(440, 0.1, 'sine', 0.3)).not.toThrow();
  });
});

describe('SfxSynth combat SFX', () => {
  let mockCtx: any;
  let synth: SfxSynth;

  beforeEach(() => {
    const mock = createMockAudioContext();
    mockCtx = mock.ctx;
    synth = new SfxSynth(mockCtx);
  });

  it('playAttackSwing creates noise burst with lowpass filter', () => {
    synth.playAttackSwing();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
    const filter = mockCtx.createBiquadFilter.mock.results[0].value;
    expect(filter.type).toBe('lowpass');
  });

  it('playHit creates short low-freq sine', () => {
    synth.playHit();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('sine');
  });

  it('playHurt creates distorted sawtooth', () => {
    synth.playHurt();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('sawtooth');
  });

  it('playKill creates downward frequency sweep', () => {
    synth.playKill();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('playProjectile creates upward sweep', () => {
    synth.playProjectile();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  it('playWallBounce creates high-freq short sine', () => {
    synth.playWallBounce();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });
});

describe('SfxSynth UI SFX', () => {
  let mockCtx: any;
  let synth: SfxSynth;

  beforeEach(() => {
    const mock = createMockAudioContext();
    mockCtx = mock.ctx;
    synth = new SfxSynth(mockCtx);
  });

  it('playButtonClick creates short square wave', () => {
    synth.playButtonClick();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('square');
  });

  it('playPanelPopup creates two-tone ascending', () => {
    synth.playPanelPopup();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('playChestUnlock creates noise + lowpass', () => {
    synth.playChestUnlock();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });

  it('playDecrypt creates sequence of square waves', () => {
    synth.playDecrypt();
    expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('playPurchase creates two-tone high-freq sine', () => {
    synth.playPurchase();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('playPause creates descending tone', () => {
    synth.playPause();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });

  it('playResume creates ascending tone', () => {
    synth.playResume();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
  });
});

describe('SfxSynth dialogue SFX', () => {
  let mockCtx: any;
  let synth: SfxSynth;

  beforeEach(() => {
    const mock = createMockAudioContext();
    mockCtx = mock.ctx;
    synth = new SfxSynth(mockCtx);
  });

  it('playDialogueAdvance creates paper rustle (noise + bandpass)', () => {
    synth.playDialogueAdvance();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
    const filter = mockCtx.createBiquadFilter.mock.results[0].value;
    expect(filter.type).toBe('bandpass');
  });

  it('playSpeakerChange creates low sine 80Hz', () => {
    synth.playSpeakerChange();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(80, 0);
  });

  it('playBranchAppear creates ascending two-tone', () => {
    synth.playBranchAppear();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('playBranchConfirm creates short square', () => {
    synth.playBranchConfirm();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('square');
  });

  it('playTaskUpdate creates three-tone arpeggio', () => {
    synth.playTaskUpdate();
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
  });
});

describe('SfxSynth death flash SFX', () => {
  let mockCtx: any;
  let synth: SfxSynth;

  beforeEach(() => {
    const mock = createMockAudioContext();
    mockCtx = mock.ctx;
    synth = new SfxSynth(mockCtx);
  });

  it('playBloodBlackFrame creates low-freq impact', () => {
    synth.playBloodBlackFrame();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });

  it('playWhiteSilhouette creates sharp high-freq sawtooth', () => {
    synth.playWhiteSilhouette();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.type).toBe('sawtooth');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(2000, 0);
  });

  it('playBlackSilhouette creates low-freq hum', () => {
    synth.playBlackSilhouette();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results[0].value;
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(60, 0);
  });

  it('playFinalBloodBlack creates downward sweep + hum', () => {
    synth.playFinalBloodBlack();
    expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('playChaseHeartbeat creates heartbeat sound (two thumps)', () => {
    synth.playChaseHeartbeat(60);
    expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('playRealityTear creates low-freq impact + noise', () => {
    synth.playRealityTear();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
  });
});
