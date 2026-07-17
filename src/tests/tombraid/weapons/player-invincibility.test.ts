import { describe, expect, it, vi } from 'vitest';

import { PLAYER_MAX_HP } from '../../../tombraid/combat/DamageType';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';

describe('PlayerCombat 无敌态 (plan 4 加法式)', () => {
  it('初始 isInvincible false', () => {
    const p = new PlayerCombat();
    expect(p.isInvincible()).toBe(false);
  });

  it('setInvincible 后 takeDamage 不扣血', () => {
    const p = new PlayerCombat();
    p.setInvincible(1200);
    expect(p.isInvincible()).toBe(true);
    p.takeDamage({ amount: 99, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP);
  });

  it('tick 递减 invincibleMs，过期后可受伤', () => {
    const p = new PlayerCombat();
    p.setInvincible(1000);
    p.tick(500);
    expect(p.isInvincible()).toBe(true);
    p.takeDamage({ amount: 30, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP); // 仍无敌
    p.tick(500);
    expect(p.isInvincible()).toBe(false);
    p.takeDamage({ amount: 30, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP - 30);
  });

  it('setInvincible 取最长（不缩短既有无敌）', () => {
    const p = new PlayerCombat();
    p.setInvincible(2000);
    p.setInvincible(500); // 不缩短
    p.tick(1000);
    expect(p.isInvincible()).toBe(true);
  });

  it('无敌态不阻止 heal', () => {
    const p = new PlayerCombat();
    p.takeDamage({ amount: 30, category: 'melee' });
    p.setInvincible(1000);
    p.heal(10);
    expect(p.hp).toBe(PLAYER_MAX_HP - 30 + 10);
  });

  it('无敌态不阻止 burn tick（仅 takeDamage 守卫）', () => {
    const p = new PlayerCombat();
    p.applyDebuff({ type: 'burn', dps: 5, remainingMs: 1000 });
    p.setInvincible(2000);
    p.tick(1000);
    // burn 仍结算（无敌仅守 takeDamage，不守 debuff tick）
    expect(p.hp).toBe(PLAYER_MAX_HP - 5);
  });

  it('plan 3 既有行为无回归：takeDamage 正常扣血', () => {
    const p = new PlayerCombat();
    const onHp = vi.fn();
    p.onHpChanged = onHp;
    p.takeDamage({ amount: 20, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP - 20);
    expect(onHp).toHaveBeenCalledWith(PLAYER_MAX_HP - 20);
  });
});
