// src/audio/SfxSynth.ts

/**
 * Procedural sound effect synthesizer using Web Audio API.
 * Zero external files — all SFX generated via OscillatorNode + GainNode + BiquadFilterNode.
 *
 * Usage: const synth = new SfxSynth(audioContext);
 *        synth.playTone(440, 0.1, 'sine', 0.3);
 *
 * If AudioContext is null/unavailable, all methods are no-ops (graceful degradation).
 */
export class SfxSynth {
  private ctx: AudioContext | null;

  constructor(ctx: AudioContext | null) {
    this.ctx = ctx;
  }

  /** Play a simple tone with envelope. */
  playTone(freq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** Play a frequency sweep (exponential ramp). */
  playSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 0.01), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /** Play a white noise burst through a filter. */
  playNoiseBurst(duration: number, volume: number, filterType: BiquadFilterType, filterFreq: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(now);
    source.stop(now + duration);
  }
}
