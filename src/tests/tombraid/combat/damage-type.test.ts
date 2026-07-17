import { describe, expect, it } from 'vitest';

import {
  PLAYER_BASE_SPEED,
  PLAYER_RUN_SPEED,
  PLAYER_MAX_HP,
  PLACEHOLDER_WEAPON_ID,
  WEAK_PUNCH_DAMAGE,
  PLAYER_CONTACT_DAMAGE_COOLDOWN_MS,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_FATIGUE_LOCK_MS,
  type BurnDebuff,
  DebuffTracker,
} from '../../../tombraid/combat/DamageType';

describe('DamageType constants (spec §3.1，grill 2026-07-17 补全跑/体力)', () => {
  it('PLAYER_MAX_HP = 100', () => {
    expect(PLAYER_MAX_HP).toBe(100);
  });
  it('PLAYER_BASE_SPEED = 200', () => {
    expect(PLAYER_BASE_SPEED).toBe(200);
  });
  it('PLAYER_RUN_SPEED = 320', () => {
    expect(PLAYER_RUN_SPEED).toBe(320);
  });
  it('STAMINA_MAX = 100', () => {
    expect(STAMINA_MAX).toBe(100);
  });
  it('STAMINA_DRAIN_PER_SEC = 33.3', () => {
    expect(STAMINA_DRAIN_PER_SEC).toBeCloseTo(33.3, 5);
  });
  it('STAMINA_REGEN_PER_SEC = 20', () => {
    expect(STAMINA_REGEN_PER_SEC).toBe(20);
  });
  it('STAMINA_FATIGUE_LOCK_MS = 1000', () => {
    expect(STAMINA_FATIGUE_LOCK_MS).toBe(1000);
  });
  it('WEAK_PUNCH_DAMAGE = 5', () => {
    expect(WEAK_PUNCH_DAMAGE).toBe(5);
  });
  it('PLACEHOLDER_WEAPON_ID = weapon.ruler', () => {
    expect(PLACEHOLDER_WEAPON_ID).toBe('weapon.ruler');
  });
  it('PLAYER_CONTACT_DAMAGE_COOLDOWN_MS = 1000', () => {
    expect(PLAYER_CONTACT_DAMAGE_COOLDOWN_MS).toBe(1000);
  });
});

describe('DebuffTracker state machine', () => {
  it('apply burn then tick returns dps*dt burn damage', () => {
    const tracker = new DebuffTracker();
    const burn: BurnDebuff = { type: 'burn', dps: 2, remainingMs: 2000 };
    tracker.apply(burn);
    // tick 1000ms → burn damage = 2 * 1 = 2
    const r = tracker.tick(1000);
    expect(r.burnDamage).toBeCloseTo(2, 5);
    expect(tracker.has('burn')).toBe(true);
  });

  it('burn expires after duration', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'burn', dps: 3, remainingMs: 1000 });
    tracker.tick(1000);
    expect(tracker.has('burn')).toBe(false);
  });

  it('slow reduces speedMultiplier; multiplier 0.4 = 60% slow', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'slow', multiplier: 0.4, remainingMs: 2000 });
    const mo = tracker.getMovementOverride();
    expect(mo.locked).toBe(false);
    expect(mo.speedMultiplier).toBeCloseTo(0.4, 5);
    expect(mo.fleeFrom).toBeNull();
  });

  it('stun locks movement (multiplier 0)', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'stun', remainingMs: 5000 });
    const mo = tracker.getMovementOverride();
    expect(mo.locked).toBe(true);
    expect(mo.speedMultiplier).toBe(0);
  });

  it('root locks movement', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'root', remainingMs: 1000 });
    expect(tracker.getMovementOverride().locked).toBe(true);
  });

  it('fear sets fleeFrom source', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'fear', remainingMs: 2000, sourceX: 100, sourceY: 200 });
    const mo = tracker.getMovementOverride();
    expect(mo.fleeFrom).toEqual({ x: 100, y: 200 });
    expect(mo.locked).toBe(false);
  });

  it('stun overrides slow (locked wins)', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'slow', multiplier: 0.5, remainingMs: 2000 });
    tracker.apply({ type: 'stun', remainingMs: 1000 });
    expect(tracker.getMovementOverride().locked).toBe(true);
  });

  it('clear removes all debuffs', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'burn', dps: 1, remainingMs: 1000 });
    tracker.clear();
    expect(tracker.list()).toHaveLength(0);
  });

  it('strongest slow wins (lowest multiplier)', () => {
    const tracker = new DebuffTracker();
    tracker.apply({ type: 'slow', multiplier: 0.6, remainingMs: 2000 });
    tracker.apply({ type: 'slow', multiplier: 0.4, remainingMs: 1000 });
    expect(tracker.getMovementOverride().speedMultiplier).toBeCloseTo(0.4, 5);
  });
});
