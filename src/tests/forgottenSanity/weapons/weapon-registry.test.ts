import { describe, expect, it } from 'vitest';

import {
  ALL_WEAPONS,
  WEAPON_IDS,
  getWeapon,
  listWeaponsByRarity,
  type WeaponDef,
  type WeaponId,
  type WeaponRarity,
} from '../../../forgottenSanity/weapons/WeaponRegistry';

describe('WeaponRegistry — 8 把武器 (spec §4)', () => {
  it('ALL_WEAPONS 恰好 8 把', () => {
    expect(ALL_WEAPONS).toHaveLength(8);
  });

  it('WEAPON_IDS 恰好 8 个', () => {
    expect(WEAPON_IDS).toHaveLength(8);
  });

  it('稀有度计数：紫 2 / 绿 3 / 金 2 / 白 1', () => {
    expect(listWeaponsByRarity('purple')).toHaveLength(2);
    expect(listWeaponsByRarity('green')).toHaveLength(3);
    expect(listWeaponsByRarity('gold')).toHaveLength(2);
    expect(listWeaponsByRarity('white')).toHaveLength(1);
  });

  it('getWeapon 返回定义；未知 id 返回 null', () => {
    expect(getWeapon('weapon.ruler')).not.toBeNull();
    expect(getWeapon('weapon.unarmed' as WeaponId)).toBeNull();
  });

  it('断尺 weapon.brokenRuler (紫阶, sanity 85, 快攻型 meleeFan π/6/90)', () => {
    const w = getWeapon('weapon.brokenRuler')!;
    expect(w.name).toBe('断尺');
    expect(w.rarity).toBe('purple');
    expect(w.sanityValue).toBe(85);
    expect(w.basic.kind).toBe('meleeFan');
    expect(w.basic.damage).toBe(8);
    expect(w.basic.attacksPerSecond).toBe(1.8);
    // grill §4.6 快攻型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 6, 5); // 30°
    expect(w.basic.range).toBe(90);
    expect(w.ultimate.kind).toBe('scatterShards');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.shardCount).toBe(6);
    expect(w.ultimate.damage).toBe(4);
  });

  it('粉笔 weapon.chalk (紫阶, sanity 70, ranged pierce 1)', () => {
    const w = getWeapon('weapon.chalk')!;
    expect(w.name).toBe('粉笔');
    expect(w.sanityValue).toBe(70);
    expect(w.basic.kind).toBe('rangedPiercing');
    expect(w.basic.damage).toBe(6);
    expect(w.basic.attacksPerSecond).toBe(2);
    expect(w.basic.pierceCount).toBe(1);
    expect(w.ultimate.kind).toBe('chalkBombAoe');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.damage).toBe(25);
    // grill §4.7: r150
    expect(w.ultimate.radius).toBe(150);
  });

  it('尺子 weapon.ruler (绿阶, sanity 130, 均衡型 meleeFan π/4/120, textureKey prop.ruler)', () => {
    const w = getWeapon('weapon.ruler')!;
    expect(w.name).toBe('尺子');
    expect(w.rarity).toBe('green');
    expect(w.sanityValue).toBe(130);
    expect(w.textureKey).toBe('prop.ruler');
    expect(w.basic.kind).toBe('meleeFan');
    expect(w.basic.damage).toBe(15);
    expect(w.basic.attacksPerSecond).toBe(1.5);
    // grill §4.6 均衡型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 4, 5); // 45°
    expect(w.basic.range).toBe(120);
    expect(w.ultimate.kind).toBe('rulerStorm');
    expect(w.ultimate.cooldownMs).toBe(20000);
    // grill §4.7: r150 / 3s / dps15
    expect(w.ultimate.radius).toBe(150);
    expect(w.ultimate.durationMs).toBe(3000);
    expect(w.ultimate.damagePerSecond).toBe(15);
  });

  it('灵刃 weapon.spiritBlade (绿阶, sanity 200, ranged pierce Infinity, bladeArray 8-dir)', () => {
    const w = getWeapon('weapon.spiritBlade')!;
    expect(w.name).toBe('灵刃');
    expect(w.sanityValue).toBe(200);
    expect(w.basic.kind).toBe('rangedPiercing');
    expect(w.basic.damage).toBe(18);
    expect(w.basic.attacksPerSecond).toBe(1.2);
    expect(w.basic.pierceCount).toBe(Infinity);
    expect(w.ultimate.kind).toBe('bladeArray');
    expect(w.ultimate.cooldownMs).toBe(25000);
    // grill §4.7: 8 方向 / 每刃长180 / 18伤 / pierce2 / 速400
    expect(w.ultimate.directionCount).toBe(8);
    expect(w.ultimate.bladeLength).toBe(180);
    expect(w.ultimate.damage).toBe(18);
    expect(w.ultimate.pierceCount).toBe(2);
    expect(w.ultimate.projectileSpeed).toBe(400);
  });

  it('拳套 weapon.fistGauntlet (绿阶, sanity 170, 快攻型 meleeFan π/6/90, hitsPerAttack=3, fistDash 0.3s/250px/无敌/锁定)', () => {
    const w = getWeapon('weapon.fistGauntlet')!;
    expect(w.name).toBe('拳套');
    expect(w.sanityValue).toBe(170);
    expect(w.basic.kind).toBe('meleeFan');
    // spec §4.2 "10×3伤" = 10 damage × 3 hits
    expect(w.basic.damage).toBe(10);
    // grill: 拳套 hitsPerAttack=3（同一最近敌受 3 段）
    expect(w.basic.hitsPerAttack).toBe(3);
    expect(w.basic.attacksPerSecond).toBe(2);
    // grill §4.6 快攻型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 6, 5);
    expect(w.basic.range).toBe(90);
    expect(w.ultimate.kind).toBe('fistDash');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.totalDamage).toBe(80);
    expect(w.ultimate.invincibleMs).toBeGreaterThan(0);
    // grill §4.7: 0.3s / 250px / 无敌 / 锁定向
    expect(w.ultimate.durationMs).toBe(300);
    expect(w.ultimate.radius).toBe(250);
    expect(w.ultimate.invincibleMs).toBe(300);
    expect(w.ultimate.lockDirection).toBe(true);
  });

  it('锁链 weapon.chain (金阶, sanity 420, 重型 meleeFan π/3/180, chainCrush pull≤200/root2s/burn10×3s)', () => {
    const w = getWeapon('weapon.chain')!;
    expect(w.name).toBe('锁链');
    expect(w.rarity).toBe('gold');
    expect(w.sanityValue).toBe(420);
    expect(w.basic.damage).toBe(25);
    expect(w.basic.attacksPerSecond).toBe(1);
    // grill §4.6 重型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 3, 5); // 60°
    expect(w.basic.range).toBe(180);
    expect(w.ultimate.kind).toBe('chainCrush');
    expect(w.ultimate.cooldownMs).toBe(25000);
    expect(w.ultimate.rootMs).toBe(2000);
    // grill §4.7: 拉扯≤200px / burn 10/s×3s
    expect(w.ultimate.pullRadius).toBe(200);
    expect(w.ultimate.pullDistance).toBe(200);
    expect(w.ultimate.burnDps).toBe(10);
    expect(w.ultimate.burnMs).toBe(3000);
  });

  it('血镰 weapon.bloodScythe (金阶, sanity 550, 重型 meleeFan π/3/180, lifesteal 10%, bloodWheel r130/3s/dps50)', () => {
    const w = getWeapon('weapon.bloodScythe')!;
    expect(w.name).toBe('血镰');
    expect(w.sanityValue).toBe(550);
    expect(w.basic.damage).toBe(40);
    expect(w.basic.attacksPerSecond).toBe(0.8);
    expect(w.basic.lifestealPercent).toBe(10);
    // grill §4.6 重型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 3, 5);
    expect(w.basic.range).toBe(180);
    expect(w.ultimate.kind).toBe('bloodWheel');
    expect(w.ultimate.cooldownMs).toBe(25000);
    expect(w.ultimate.damagePerSecond).toBe(50);
    expect(w.ultimate.durationMs).toBe(3000);
    // grill §4.7: r130 / lifesteal 10%
    expect(w.ultimate.radius).toBe(130);
    expect(w.ultimate.lifestealPercent).toBe(10);
  });

  it('万魂幡 weapon.soulBanner (白阶, sanity 1200, 均衡型 meleeFan π/4/120, fear 20%, soulCapture screenViewport CD 120s)', () => {
    const w = getWeapon('weapon.soulBanner')!;
    expect(w.name).toBe('万魂幡');
    expect(w.rarity).toBe('white');
    expect(w.sanityValue).toBe(1200);
    expect(w.basic.damage).toBe(20);
    expect(w.basic.fearProcPercent).toBe(20);
    expect(w.basic.fearDurationMs).toBe(2000);
    // grill §4.6 均衡型档位
    expect(w.basic.halfAngle).toBeCloseTo(Math.PI / 4, 5);
    expect(w.basic.range).toBe(120);
    expect(w.ultimate.kind).toBe('soulCapture');
    expect(w.ultimate.cooldownMs).toBe(120000);
    // M11: captureMode='screenViewport' + excludeKinds=['yangYunRed','danYuxuanBody']（移除 excludeHpLe）
    expect(w.ultimate.captureMode).toBe('screenViewport');
    expect(w.ultimate.excludeKinds).toContain('yangYunRed');
    expect(w.ultimate.excludeKinds).toContain('danYuxuanBody');
  });

  it('所有武器 id 唯一', () => {
    const ids = ALL_WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('尺子有贴图，其余 7 把 textureKey null（程序绘制）', () => {
    const ruler = getWeapon('weapon.ruler')!;
    expect(ruler.textureKey).toBe('prop.ruler');
    const others = ALL_WEAPONS.filter((w) => w.id !== 'weapon.ruler');
    for (const w of others) {
      expect(w.textureKey).toBeNull();
    }
  });
});
