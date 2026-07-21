import { describe, expect, it, vi } from 'vitest';

import {
  CHEST_DECRYPT_LOCK_COUNT,
  CHEST_DECRYPT_OPEN_DURATION_MS,
  CHEST_DECRYPT_TOTAL_MS,
  ChestDecryptState,
  type ChestDecryptPhase,
} from '../../../forgottenSanity/loot/chestDecryptState';

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

describe('ChestDecryptState hold/release (spec §7.1 — release decays)', () => {
  it('release causes progress to decay', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // progress 0.2 (no lock broken)
    s.release();
    s.advance(1000); // holding=false → decay 0.2-0.4 → 0 (clamp at 0)
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().holding).toBe(false);
  });

  it('hold resumes progress after decay', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // 0.2
    s.release();
    s.advance(1000); // decay to 0
    s.hold();
    s.advance(500); // 0.2
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
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
  it('progress reaches 1.0 -> phase opened + onOpenStart', () => {
    const onOpenStart = vi.fn();
    const s = new ChestDecryptState({ onOpenStart });
    s.start();
    s.advance(2500);
    expect(s.snapshot().phase).toBe('opened');
    expect(onOpenStart).toHaveBeenCalledTimes(1);
  });

  it('opened -> completed after CHEST_DECRYPT_OPEN_DURATION_MS', () => {
    const onCompleted = vi.fn();
    const s = new ChestDecryptState({ onCompleted });
    s.start();
    s.advance(2500); // opened
    expect(onCompleted).not.toHaveBeenCalled();
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().phase).toBe('completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('holding is false during opened/completed', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    expect(s.snapshot().holding).toBe(false);
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().holding).toBe(false);
  });
});

describe('ChestDecryptState decay (spec §7.1/§7.2 decayRate)', () => {
  it('release causes progress to decay at 1/2500 per ms', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625); // 0.25 → lock 0 broken
    expect(s.snapshot().brokenLocks).toBe(1);
    s.release();
    s.advance(625); // decay 0.25 → 0.0 (锁定在 0.25 不下退)
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });

  it('decay stops at last broken lock milestone', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(1250); // 0.5 → locks 0,1 broken
    s.release();
    s.advance(10000); // 大幅回退
    expect(s.snapshot().progress).toBeCloseTo(0.5, 4);
  });

  it('decay does not regress below 0 when no lock broken', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(300); // 0.12, no lock
    s.release();
    s.advance(5000);
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().brokenLocks).toBe(0);
  });

  it('hold after decay resumes forward progress', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(900); // 0.36
    s.release();
    s.advance(500); // decay to 0.25 lock
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
    s.hold();
    s.advance(625); // 0.25 + 0.25 = 0.5
    expect(s.snapshot().progress).toBeCloseTo(0.5, 4);
  });
});

describe('ChestDecryptState phase name opened (spec §7.2)', () => {
  it('uses "opened" not "opening" after progress reaches 1.0', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    expect(s.snapshot().phase).toBe('opened');
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

describe('ChestDecryptState decay red flash (spec §4.3)', () => {
  it('default progressArcColor is gold 0xffd700', () => {
    const s = new ChestDecryptState();
    expect(s.getProgressArcColor()).toBe(0xffd700);
  });

  it('decay sets progressArcColor to red 0xff4444', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(1000); // holding=true → progress 0.4
    s.release();
    s.advance(100); // holding=false → decay → red flash
    expect(s.getProgressArcColor()).toBe(0xff4444);
  });

  it('progressArcColor restores to gold 0xffd700 after 200ms', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(1000); // progress 0.4
    s.release();
    s.advance(100); // decay → red, flash=200ms
    s.hold();
    s.advance(200); // holding=true, flash expires → gold
    expect(s.getProgressArcColor()).toBe(0xffd700);
  });
});

describe('2.6 forceOpen()', () => {
  it('sets phase to opened', () => {
    const state = new ChestDecryptState();
    state.forceOpen();
    expect(state.snapshot().phase).toBe('opened');
  });

  it('resets openElapsedMs to 0', () => {
    const state = new ChestDecryptState();
    state.forceOpen();
    expect(state.getOpenElapsedMs()).toBe(0);
  });

  it('forceOpen works from any phase', () => {
    const state = new ChestDecryptState();
    state.start();
    state.advance(500); // decrypting, progress ~0.2
    state.forceOpen();
    expect(state.snapshot().phase).toBe('opened');
    expect(state.getOpenElapsedMs()).toBe(0);
  });

  it('does not fire onOpenStart callback (caller handles side effects)', () => {
    const onOpenStart = vi.fn();
    const state = new ChestDecryptState({ onOpenStart });
    state.forceOpen();
    expect(onOpenStart).not.toHaveBeenCalled();
  });

  it('resets openElapsedMs to 0 even after opening progress', () => {
    const state = new ChestDecryptState();
    state.start();
    state.advance(CHEST_DECRYPT_TOTAL_MS); // decrypting -> opened, openElapsedMs=0
    state.advance(300); // opened, openElapsedMs=300
    expect(state.getOpenElapsedMs()).toBe(300);
    state.forceOpen();
    expect(state.getOpenElapsedMs()).toBe(0);
  });

  it('after forceOpen, advance transitions opened -> completed after OPEN_DURATION_MS', () => {
    const onCompleted = vi.fn();
    const state = new ChestDecryptState({ onCompleted });
    state.forceOpen();
    state.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(state.snapshot().phase).toBe('completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});

// Static type asserts
function _compileTimeAssert(phase: ChestDecryptPhase): void {
  void phase;
}
void _compileTimeAssert;
