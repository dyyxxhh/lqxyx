import { describe, expect, it, vi } from 'vitest';

import {
  CHEST_DECRYPT_LOCK_COUNT,
  CHEST_DECRYPT_OPEN_DURATION_MS,
  CHEST_DECRYPT_TOTAL_MS,
  ChestDecryptState,
  type ChestDecryptPhase,
} from '../../../tombraid/loot/chestDecryptState';

describe('chestDecryptState constants (spec §7.1/§7.2)', () => {
  it('CHEST_DECRYPT_TOTAL_MS = 2500 (~2.5s)', () => {
    expect(CHEST_DECRYPT_TOTAL_MS).toBe(2500);
  });
  it('CHEST_DECRYPT_LOCK_COUNT = 4', () => {
    expect(CHEST_DECRYPT_LOCK_COUNT).toBe(4);
  });
  it('CHEST_DECRYPT_OPEN_DURATION_MS = 600', () => {
    expect(CHEST_DECRYPT_OPEN_DURATION_MS).toBe(600);
  });
});

describe('ChestDecryptState lifecycle', () => {
  it('starts idle with progress 0', () => {
    const s = new ChestDecryptState();
    const snap = s.snapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.progress).toBe(0);
    expect(snap.brokenLocks).toBe(0);
    expect(snap.holding).toBe(false);
  });

  it('start transitions idle -> decrypting and sets holding=true', () => {
    const s = new ChestDecryptState();
    s.start();
    expect(s.snapshot().phase).toBe('decrypting');
    expect(s.snapshot().holding).toBe(true);
  });

  it('start is no-op when not idle', () => {
    const s = new ChestDecryptState();
    s.start();
    s.start(); // 第二次 start 不应崩溃
    expect(s.snapshot().phase).toBe('decrypting');
  });
});

describe('ChestDecryptState hold/release (no regression, spec §7.1)', () => {
  it('release pauses progress without regression', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // progress 0.2
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
    s.release();
    s.advance(1000); // holding=false → 不推进
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
    expect(s.snapshot().holding).toBe(false);
  });

  it('hold resumes progress from where it paused', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // 0.2
    s.release();
    s.advance(1000); // 不动
    s.hold();
    s.advance(500); // 0.2 + 0.2 = 0.4
    expect(s.snapshot().progress).toBeCloseTo(0.4, 3);
    expect(s.snapshot().holding).toBe(true);
  });

  it('advance before start is no-op', () => {
    const s = new ChestDecryptState();
    s.advance(1000);
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().phase).toBe('idle');
  });
});

describe('ChestDecryptState progress & lock milestones (spec §7.1)', () => {
  it('progress rate = 1/2500 per ms', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625); // 625/2500 = 0.25
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });

  it('progress clamps at 1.0', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(5000);
    expect(s.snapshot().progress).toBe(1);
  });

  it('onLockBroken fires at 0.25/0.5/0.75/1.0 with indices 0/1/2/3', () => {
    const onLockBroken = vi.fn();
    const s = new ChestDecryptState({ onLockBroken });
    s.start();
    s.advance(625); // 0.25 → lock 0
    expect(onLockBroken).toHaveBeenCalledWith(0);
    s.advance(625); // 0.5 → lock 1
    expect(onLockBroken).toHaveBeenCalledWith(1);
    s.advance(625); // 0.75 → lock 2
    expect(onLockBroken).toHaveBeenCalledWith(2);
    s.advance(625); // 1.0 → lock 3
    expect(onLockBroken).toHaveBeenCalledWith(3);
    expect(onLockBroken).toHaveBeenCalledTimes(4);
  });

  it('brokenLocks reflects milestone count', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625);
    expect(s.snapshot().brokenLocks).toBe(1);
    s.advance(625);
    expect(s.snapshot().brokenLocks).toBe(2);
  });

  it('repeated advance within same milestone does not re-fire onLockBroken', () => {
    const onLockBroken = vi.fn();
    const s = new ChestDecryptState({ onLockBroken });
    s.start();
    s.advance(100); // 0.04, no lock
    s.advance(100); // 0.08, no lock
    expect(onLockBroken).not.toHaveBeenCalled();
  });
});

describe('ChestDecryptState completion (spec §7.1/§7.3)', () => {
  it('progress reaches 1.0 -> phase opening + onOpenStart', () => {
    const onOpenStart = vi.fn();
    const s = new ChestDecryptState({ onOpenStart });
    s.start();
    s.advance(2500);
    expect(s.snapshot().phase).toBe('opening');
    expect(onOpenStart).toHaveBeenCalledTimes(1);
  });

  it('opening -> completed after CHEST_DECRYPT_OPEN_DURATION_MS', () => {
    const onCompleted = vi.fn();
    const s = new ChestDecryptState({ onCompleted });
    s.start();
    s.advance(2500); // opening
    expect(onCompleted).not.toHaveBeenCalled();
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().phase).toBe('completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('holding is false during opening/completed', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    expect(s.snapshot().holding).toBe(false);
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().holding).toBe(false);
  });
});

describe('ChestDecryptState reset', () => {
  it('reset returns to idle with all counters zeroed', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2000);
    s.reset();
    const snap = s.snapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.progress).toBe(0);
    expect(snap.brokenLocks).toBe(0);
    expect(snap.holding).toBe(false);
  });

  it('can restart after reset', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    s.reset();
    s.start();
    expect(s.snapshot().phase).toBe('decrypting');
    s.advance(625);
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });
});

// Static type asserts
function _compileTimeAssert(phase: ChestDecryptPhase): void {
  void phase;
}
void _compileTimeAssert;
