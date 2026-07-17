import { describe, expect, it } from 'vitest';

import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { getWeapon } from '../../../tombraid/weapons/WeaponRegistry';

describe('WeaponCooldowns (plan 4)', () => {
  it('初始可普攻可大招', () => {
    const cd = new WeaponCooldowns();
    expect(cd.canBasicAttack(0)).toBe(true);
    expect(cd.canUltimate(0)).toBe(true);
  });

  it('recordBasicAttack 按攻速锁 CD；CD 内不可普攻', () => {
    const cd = new WeaponCooldowns();
    const ruler = getWeapon('weapon.ruler')!;
    cd.recordBasicAttack(ruler, 0);
    // 尺子 1.5/s → CD = 1000/1.5 ≈ 666.67ms
    expect(cd.canBasicAttack(0)).toBe(false);
    expect(cd.canBasicAttack(600)).toBe(false);
    expect(cd.canBasicAttack(700)).toBe(true);
  });

  it('recordBasicAttackCooldown 直接用攻速（空手路径）', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0); // 2/s → 500ms
    expect(cd.canBasicAttack(400)).toBe(false);
    expect(cd.canBasicAttack(500)).toBe(true);
  });

  it('recordUltimate 按大招 CD 锁定', () => {
    const cd = new WeaponCooldowns();
    const ruler = getWeapon('weapon.ruler')!;
    cd.recordUltimate(ruler, 0);
    expect(cd.canUltimate(0)).toBe(false);
    expect(cd.canUltimate(19999)).toBe(false);
    expect(cd.canUltimate(20000)).toBe(true);
  });

  it('万魂幡大招 CD 120s', () => {
    const cd = new WeaponCooldowns();
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    expect(cd.canUltimate(119999)).toBe(false);
    expect(cd.canUltimate(120000)).toBe(true);
  });

  it('getBasicCooldownRemaining 返回剩余 ms', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0); // 500ms
    expect(cd.getBasicCooldownRemaining(0)).toBe(500);
    expect(cd.getBasicCooldownRemaining(200)).toBe(300);
    expect(cd.getBasicCooldownRemaining(500)).toBe(0);
  });

  it('getUltimateCooldownRemaining 返回剩余 ms', () => {
    const cd = new WeaponCooldowns();
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    expect(cd.getUltimateCooldownRemaining(0)).toBe(120000);
    expect(cd.getUltimateCooldownRemaining(60000)).toBe(60000);
    expect(cd.getUltimateCooldownRemaining(120000)).toBe(0);
  });

  it('onWeaponSwap 重置 CD（立即可普攻可大招）', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0);
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    cd.onWeaponSwap();
    expect(cd.canBasicAttack(0)).toBe(true);
    expect(cd.canUltimate(0)).toBe(true);
  });
});
