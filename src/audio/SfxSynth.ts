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
  /** Pending setTimeout handles scheduled by SFX methods, tracked for cleanup. */
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(ctx: AudioContext | null) {
    this.ctx = ctx;
  }

  /** Play a simple tone with envelope. */
  playTone(freq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx) return;
    // P0: exponentialRampToValueAtTime throws RangeError when the starting value
    // is 0 (volume) or the frequency is <= 0. Clamp both to safe positive values.
    const safeFreq = Math.max(freq, 0.01);
    const safeVol = Math.max(volume, 0.0001);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(safeFreq, now);
    gain.gain.setValueAtTime(safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
    // P3: release audio nodes once playback ends to avoid dangling graph nodes.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Play a frequency sweep (exponential ramp). */
  playSweep(startFreq: number, endFreq: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.ctx) return;
    // P0: protect against non-positive frequencies/volume which crash exponential ramps.
    const safeStart = Math.max(startFreq, 0.01);
    const safeEnd = Math.max(endFreq, 0.01);
    const safeVol = Math.max(volume, 0.0001);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(safeStart, now);
    osc.frequency.exponentialRampToValueAtTime(safeEnd, now + duration);
    gain.gain.setValueAtTime(safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
    // P3: release audio nodes once playback ends to avoid dangling graph nodes.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Play a white noise burst through a filter. */
  playNoiseBurst(duration: number, volume: number, filterType: BiquadFilterType, filterFreq: number): void {
    if (!this.ctx) return;
    // P0: createBuffer crashes with a zero-length buffer.
    if (duration <= 0) return;
    const safeVol = Math.max(volume, 0.0001);
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
    gain.gain.setValueAtTime(safeVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(now);
    source.stop(now + duration);
    // P3: release audio nodes (including the filter) once playback ends.
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  // ── Combat SFX ──

  /** Attack swing: white noise burst + lowpass, 0.15s. */
  playAttackSwing(): void {
    this.playNoiseBurst(0.15, 0.15, 'lowpass', 800);
  }

  /** Hit: short low-freq sine impact, 0.1s. */
  playHit(): void {
    this.playTone(120, 0.1, 'sine', 0.3);
  }

  /** Hurt: distorted sawtooth, 0.2s. */
  playHurt(): void {
    this.playTone(180, 0.2, 'sawtooth', 0.25);
  }

  /** Kill: downward frequency sweep, 0.3s. */
  playKill(): void {
    this.playSweep(400, 50, 0.3, 'sawtooth', 0.3);
  }

  /** Projectile launch: upward sweep, 0.15s. */
  playProjectile(): void {
    this.playSweep(200, 800, 0.15, 'sine', 0.2);
  }

  /** Wall bounce: high-freq short ping, 0.08s. */
  playWallBounce(): void {
    this.playTone(1200, 0.08, 'sine', 0.15);
  }

  // ── UI SFX ──

  /** Button click: short square, 0.05s. */
  playButtonClick(): void {
    this.playTone(600, 0.05, 'square', 0.15);
  }

  /** Panel popup: ascending major third (two sines), 0.15s. */
  playPanelPopup(): void {
    this.playTone(523, 0.08, 'sine', 0.15);
    // `let` (declared separately) avoids a TDZ ReferenceError when a synchronous
    // setTimeout stub invokes the callback before the handle is assigned; in normal
    // async usage this is equivalent to `const t = setTimeout(...)`.
    let t: ReturnType<typeof setTimeout>;
    t = setTimeout(() => {
      this.playTone(659, 0.07, 'sine', 0.15);
      this.removeTimer(t);
    }, 80);
    this.pendingTimers.push(t);
  }

  /** Chest unlock: mechanical click (noise + lowpass), 0.1s. */
  playChestUnlock(): void {
    this.playNoiseBurst(0.1, 0.2, 'lowpass', 500);
  }

  /** Decrypt: tick sequence (3-5 short square waves), 0.3s. */
  playDecrypt(): void {
    const ticks = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < ticks; i++) {
      let t: ReturnType<typeof setTimeout>;
      t = setTimeout(() => {
        this.playTone(800, 0.03, 'square', 0.1);
        this.removeTimer(t);
      }, i * 60);
      this.pendingTimers.push(t);
    }
  }

  /** Purchase: coin sound (two high-freq sines), 0.15s. */
  playPurchase(): void {
    this.playTone(1200, 0.08, 'sine', 0.15);
    let t: ReturnType<typeof setTimeout>;
    t = setTimeout(() => {
      this.playTone(1600, 0.07, 'sine', 0.15);
      this.removeTimer(t);
    }, 80);
    this.pendingTimers.push(t);
  }

  /** Pause: descending minor second, 0.1s. */
  playPause(): void {
    this.playSweep(440, 392, 0.1, 'sine', 0.15);
  }

  /** Resume: ascending minor second, 0.1s. */
  playResume(): void {
    this.playSweep(392, 440, 0.1, 'sine', 0.15);
  }

  // ── Dialogue SFX ──

  /** Dialogue advance: paper rustle (noise + bandpass), 0.08s. */
  playDialogueAdvance(): void {
    this.playNoiseBurst(0.08, 0.08, 'bandpass', 2000);
  }

  /** Speaker change: low sine 80Hz, 0.1s. */
  playSpeakerChange(): void {
    this.playTone(80, 0.1, 'sine', 0.15);
  }

  /** Branch appear: ascending major second (two sines), 0.15s. */
  playBranchAppear(): void {
    this.playTone(440, 0.08, 'sine', 0.15);
    let t: ReturnType<typeof setTimeout>;
    t = setTimeout(() => {
      this.playTone(494, 0.07, 'sine', 0.15);
      this.removeTimer(t);
    }, 80);
    this.pendingTimers.push(t);
  }

  /** Branch confirm: short square, 0.06s. */
  playBranchConfirm(): void {
    this.playTone(700, 0.06, 'square', 0.12);
  }

  /** Task update: three-tone ascending arpeggio, 0.25s. */
  playTaskUpdate(): void {
    this.playTone(523, 0.08, 'sine', 0.15);
    let t1: ReturnType<typeof setTimeout>;
    t1 = setTimeout(() => {
      this.playTone(659, 0.08, 'sine', 0.15);
      this.removeTimer(t1);
    }, 80);
    this.pendingTimers.push(t1);
    let t2: ReturnType<typeof setTimeout>;
    t2 = setTimeout(() => {
      this.playTone(784, 0.09, 'sine', 0.15);
      this.removeTimer(t2);
    }, 160);
    this.pendingTimers.push(t2);
  }

  // ── Death Flash SFX ──

  /** Blood black frame: low-freq impact (80Hz sine + noise), 0.3s. */
  playBloodBlackFrame(): void {
    this.playTone(80, 0.3, 'sine', 0.3);
    this.playNoiseBurst(0.15, 0.15, 'lowpass', 400);
  }

  /** White silhouette: sharp high-freq sawtooth 2000Hz, 0.15s. */
  playWhiteSilhouette(): void {
    this.playTone(2000, 0.15, 'sawtooth', 0.2);
  }

  /** Black silhouette: low-freq hum 60Hz, 0.15s. */
  playBlackSilhouette(): void {
    this.playTone(60, 0.15, 'sine', 0.2);
  }

  /** Final blood black: downward sweep + low hum, 1s. */
  playFinalBloodBlack(): void {
    this.playSweep(300, 40, 1.0, 'sawtooth', 0.25);
    this.playTone(50, 1.0, 'sine', 0.15);
  }

  /** Chase heartbeat: two thumps at given BPM. */
  playChaseHeartbeat(bpm: number): void {
    // P2: previously the bpm parameter was ignored. Derive the half-beat interval
    // between the two thumps so faster BPMs produce a quicker double-thump.
    // Clamp bpm to >= 1 so 0/negative values don't yield Infinity/negative
    // intervals (negative → setTimeout fires immediately as a double-thump
    // with no delay; zero → Infinity → never fires the second thump).
    const safeBpm = Math.max(bpm, 1);
    const interval = 60000 / safeBpm / 2;
    this.playTone(60, 0.08, 'sine', 0.3);
    let t: ReturnType<typeof setTimeout>;
    t = setTimeout(() => {
      this.playTone(50, 0.06, 'sine', 0.2);
      this.removeTimer(t);
    }, interval);
    this.pendingTimers.push(t);
  }

  /** Reality tear: low-freq impact + noise burst, 0.2s. */
  playRealityTear(): void {
    this.playTone(80, 0.2, 'sine', 0.3);
    this.playNoiseBurst(0.2, 0.2, 'lowpass', 600);
  }

  // ── Lifecycle ──

  /** Remove a fired timer from the pending list. */
  private removeTimer(t: ReturnType<typeof setTimeout>): void {
    this.pendingTimers = this.pendingTimers.filter(x => x !== t);
  }

  /** Clear all pending timers and release the AudioContext reference. */
  destroy(): void {
    for (const t of this.pendingTimers) {
      clearTimeout(t);
    }
    this.pendingTimers = [];
    this.ctx = null;
  }
}
