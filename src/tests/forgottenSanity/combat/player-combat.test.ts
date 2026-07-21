import { describe, expect, it, vi } from 'vitest';

import {
  PLAYER_MAX_HP,
  PLACEHOLDER_WEAPON_ID,
  STAMINA_MAX,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_FATIGUE_LOCK_MS,
} from '../../../forgottenSanity/combat/DamageType';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';

describe('PlayerCombat 基础 (spec §3.1 / §3.4)', () => {
  it('初始化 HP=100, weapon=weapon.ruler, not dead, stamina 满', () => {
    const p = new PlayerCombat();
    expect(p.hp).toBe(PLAYER_MAX_HP);
    expect(p.maxHp).toBe(PLAYER_MAX_HP);
    expect(p.weaponId).toBe(PLACEHOLDER_WEAPON_ID);
    expect(p.isDead).toBe(false);
    expect(p.stamina).toBe(STAMINA_MAX);
    expect(p.isFatigued).toBe(false);
  });

  it('takeDamage 减少 HP 并触发 onHpChanged', () => {
    const p = new PlayerCombat();
    const onHp = vi.fn();
    p.onHpChanged = onHp;
    p.takeDamage({ amount: 30, category: 'melee' });
    expect(p.hp).toBe(70);
    expect(onHp).toHaveBeenCalledWith(70);
  });

  it('takeDamage 致死触发 onDied 且 isDead=true', () => {
    const p = new PlayerCombat();
    const onDied = vi.fn();
    p.onDied = onDied;
    p.takeDamage({ amount: 150, category: 'melee' });
    expect(p.hp).toBe(0);
    expect(p.isDead).toBe(true);
    expect(onDied).toHaveBeenCalledTimes(1);
  });

  it('死亡后不再受伤', () => {
    const p = new PlayerCombat();
    p.takeDamage({ amount: 100, category: 'melee' });
    p.takeDamage({ amount: 50, category: 'melee' });
    expect(p.hp).toBe(0);
  });

  it('takeDamage 应用 debuff 并触发 onDebuffApplied', () => {
    const p = new PlayerCombat();
    const onDebuff = vi.fn();
    p.onDebuffApplied = onDebuff;
    p.takeDamage({
      amount: 10,
      category: 'aoe',
      debuff: { type: 'burn', dps: 2, remainingMs: 2000 },
    });
    expect(onDebuff).toHaveBeenCalledOnce();
    expect(p.getMovementOverride().locked).toBe(false);
  });

  it('tick 结算 burn 伤害', () => {
    const p = new PlayerCombat();
    p.applyDebuff({ type: 'burn', dps: 5, remainingMs: 1000 });
    p.tick(1000);
    // burn 5/s * 1s = 5
    expect(p.hp).toBe(95);
    expect(p.isDead).toBe(false);
  });

  it('heal 恢复 HP 不超过 maxHp', () => {
    const p = new PlayerCombat();
    p.takeDamage({ amount: 50, category: 'melee' });
    p.heal(30);
    expect(p.hp).toBe(80);
    p.heal(100);
    expect(p.hp).toBe(100);
  });

  it('clearDebuffs 移除所有 debuff', () => {
    const p = new PlayerCombat();
    p.applyDebuff({ type: 'slow', multiplier: 0.5, remainingMs: 2000 });
    p.clearDebuffs();
    expect(p.getMovementOverride().speedMultiplier).toBe(1);
  });

  it('getEffectiveSpeed 应用 slow 倍率', () => {
    const p = new PlayerCombat();
    expect(p.getEffectiveSpeed(200)).toBe(200);
    p.applyDebuff({ type: 'slow', multiplier: 0.4, remainingMs: 2000 });
    expect(p.getEffectiveSpeed(200)).toBeCloseTo(80, 5);
  });

  it('getEffectiveSpeed stun 时返回 0', () => {
    const p = new PlayerCombat();
    p.applyDebuff({ type: 'stun', remainingMs: 1000 });
    expect(p.getEffectiveSpeed(200)).toBe(0);
  });
});

describe('PlayerCombat stamina 状态机 (grill 2026-07-17 补全)', () => {
  it('满体力时 canRun=true', () => {
    const p = new PlayerCombat();
    expect(p.canRun()).toBe(true);
  });

  it('tickStamina 跑 1s 耗 33.3 体力', () => {
    const p = new PlayerCombat();
    p.tickStamina(1000, true);
    expect(p.stamina).toBeCloseTo(STAMINA_MAX - STAMINA_DRAIN_PER_SEC, 3);
    expect(p.isFatigued).toBe(false);
  });

  it('tickStamina 跑 3s 耗完体力并进入疲劳锁', () => {
    const p = new PlayerCombat();
    // 33.3/s × 3s = 99.9，需略超 3s 才耗尽触发疲劳（spec 「3s 耗完」为近似）
    p.tickStamina(3100, true);
    expect(p.stamina).toBe(0);
    expect(p.isFatigued).toBe(true);
    expect(p.canRun()).toBe(false);
  });

  it('疲劳锁期间不回体力且不能跑', () => {
    const p = new PlayerCombat();
    p.tickStamina(3100, true); // 耗尽 + 进入疲劳
    expect(p.isFatigued).toBe(true);
    p.tickStamina(500, false); // 疲劳锁前半段
    expect(p.isFatigued).toBe(true);
    expect(p.stamina).toBe(0);
    expect(p.canRun()).toBe(false);
  });

  it('疲劳锁 1s 后解除并开始回体', () => {
    const p = new PlayerCombat();
    p.tickStamina(3100, true); // 进入疲劳
    p.tickStamina(STAMINA_FATIGUE_LOCK_MS, false); // 等待 1s
    expect(p.isFatigued).toBe(false);
    // 锁解除但体力仍为 0，canRun 仍为 false（无体力可耗）
    expect(p.canRun()).toBe(false);
    // 疲劳锁结束后应开始回体（同 tick 内不回，下一 tick 才回）
    p.tickStamina(1000, false);
    expect(p.stamina).toBeCloseTo(STAMINA_REGEN_PER_SEC, 3);
    expect(p.canRun()).toBe(true);
  });

  it('非疲劳下静止/走 5s 回满体力', () => {
    const p = new PlayerCombat();
    p.tickStamina(2000, true); // 耗 66.6
    expect(p.stamina).toBeCloseTo(33.4, 3);
    p.tickStamina(5000, false); // 回 5s
    expect(p.stamina).toBe(STAMINA_MAX);
  });

  it('疲劳期间 isRunning=true 被忽略（强制走）', () => {
    const p = new PlayerCombat();
    p.tickStamina(3100, true); // 进入疲劳
    p.tickStamina(500, true);  // 疲劳下尝试跑：应被忽略，不耗体力
    expect(p.stamina).toBe(0);
    expect(p.isFatigued).toBe(true);
  });
});

describe('PlayerCombat 噪声暴露 (grill 2026-07-17，供 CombatManager 三态机读取)', () => {
  it('lastNoiseRadius 默认 0', () => {
    const p = new PlayerCombat();
    expect(p.lastNoiseRadius).toBe(0);
  });

  it('setNoiseRadius 设置当前帧噪声半径', () => {
    const p = new PlayerCombat();
    p.setNoiseRadius(200); // 跑
    expect(p.lastNoiseRadius).toBe(200);
    p.setNoiseRadius(0);   // 静止
    expect(p.lastNoiseRadius).toBe(0);
  });
});

describe('PlayerCombat M4 无敌期应用 debuff (plan Task 11)', () => {
  it('invincibleMs>0 时 takeDamage 不扣 HP', () => {
    const p = new PlayerCombat();
    p.setInvincible(300);
    const initialHp = p.hp;
    p.takeDamage({
      amount: 50,
      category: 'melee',
      debuff: { type: 'slow', multiplier: 0.5, remainingMs: 1000 },
    });
    expect(p.hp).toBe(initialHp);
  });

  it('invincibleMs>0 时 takeDamage 仍应用 slow debuff', () => {
    const p = new PlayerCombat();
    p.setInvincible(300);
    p.takeDamage({
      amount: 50,
      category: 'melee',
      debuff: { type: 'slow', multiplier: 0.5, remainingMs: 1000 },
    });
    expect(p.activeDebuffs.some((d) => d.type === 'slow')).toBe(true);
  });

  it('invincibleMs>0 时 takeDamage 仍应用 burn debuff', () => {
    const p = new PlayerCombat();
    p.setInvincible(300);
    p.takeDamage({
      amount: 50,
      category: 'melee',
      debuff: { type: 'burn', dps: 10, remainingMs: 2000 },
    });
    expect(p.activeDebuffs.some((d) => d.type === 'burn')).toBe(true);
  });

  it('invincibleMs>0 时 takeDamage 触发 onDebuffApplied 但不触发 onDamaged', () => {
    const p = new PlayerCombat();
    p.setInvincible(300);
    const onDebuff = vi.fn();
    const onDamaged = vi.fn();
    p.onDebuffApplied = onDebuff;
    p.onDamaged = onDamaged;
    p.takeDamage({
      amount: 50,
      category: 'melee',
      debuff: { type: 'slow', multiplier: 0.5, remainingMs: 1000 },
    });
    expect(onDebuff).toHaveBeenCalledOnce();
    expect(onDamaged).not.toHaveBeenCalled();
  });

  it('invincibleMs=0 时 takeDamage 扣 HP 且应用 debuff（无回归）', () => {
    const p = new PlayerCombat();
    const initialHp = p.hp;
    p.takeDamage({
      amount: 50,
      category: 'melee',
      debuff: { type: 'slow', multiplier: 0.5, remainingMs: 1000 },
    });
    expect(p.hp).toBe(initialHp - 50);
    expect(p.activeDebuffs.some((d) => d.type === 'slow')).toBe(true);
  });
});
