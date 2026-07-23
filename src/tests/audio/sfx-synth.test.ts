import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SfxSynth } from '../../audio/SfxSynth';

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
