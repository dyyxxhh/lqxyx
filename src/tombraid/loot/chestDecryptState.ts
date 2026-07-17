// src/tombraid/loot/chestDecryptState.ts
// 宝箱破译纯状态机：hold/release 无回退 + 4 锁扣 0.25/0.5/0.75/1.0。
// 纯 TS，无 Phaser import。spec §7.1/§7.2，plan 5 Task 4。
export type ChestDecryptPhase = 'idle' | 'decrypting' | 'opening' | 'completed';

export const CHEST_DECRYPT_TOTAL_MS = 2500;
export const CHEST_DECRYPT_LOCK_COUNT = 4;
export const CHEST_DECRYPT_OPEN_DURATION_MS = 600;

export interface ChestDecryptSnapshot {
  readonly phase: ChestDecryptPhase;
  readonly progress: number;
  readonly brokenLocks: number;
  readonly elapsedMs: number;
  readonly holding: boolean;
}

export interface ChestDecryptCallbacks {
  readonly onLockBroken?: (lockIndex: number) => void;
  readonly onOpenStart?: () => void;
  readonly onCompleted?: () => void;
}

export interface ChestDecryptStateOptions extends ChestDecryptCallbacks {}

export class ChestDecryptState {
  private phase: ChestDecryptPhase = 'idle';
  private progress = 0;
  private elapsedMs = 0;
  private brokenLocks = 0;
  private holding = false;
  private openElapsedMs = 0;
  private readonly callbacks: ChestDecryptCallbacks;

  constructor(callbacks: ChestDecryptCallbacks = {}) {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'decrypting';
    this.holding = true;
  }

  hold(): void {
    if (this.phase === 'decrypting') this.holding = true;
  }

  release(): void {
    this.holding = false;
  }

  advance(deltaMs: number): void {
    if (deltaMs <= 0) return;
    if (this.phase === 'decrypting' && this.holding) {
      this.advanceDecrypt(deltaMs);
    } else if (this.phase === 'opening') {
      this.advanceOpening(deltaMs);
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.progress = 0;
    this.elapsedMs = 0;
    this.brokenLocks = 0;
    this.holding = false;
    this.openElapsedMs = 0;
  }

  snapshot(): ChestDecryptSnapshot {
    return {
      phase: this.phase,
      progress: this.progress,
      brokenLocks: this.brokenLocks,
      elapsedMs: this.elapsedMs,
      holding: this.holding,
    };
  }

  private advanceDecrypt(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.progress = Math.min(1, this.elapsedMs / CHEST_DECRYPT_TOTAL_MS);
    const newBroken = Math.min(
      CHEST_DECRYPT_LOCK_COUNT,
      Math.floor(this.progress * CHEST_DECRYPT_LOCK_COUNT),
    );
    while (this.brokenLocks < newBroken) {
      this.brokenLocks += 1;
      this.callbacks.onLockBroken?.(this.brokenLocks - 1);
    }
    if (this.progress >= 1) {
      this.phase = 'opening';
      this.holding = false;
      this.callbacks.onOpenStart?.();
    }
  }

  private advanceOpening(deltaMs: number): void {
    this.openElapsedMs += deltaMs;
    if (this.openElapsedMs >= CHEST_DECRYPT_OPEN_DURATION_MS) {
      this.phase = 'completed';
      this.callbacks.onCompleted?.();
    }
  }
}
