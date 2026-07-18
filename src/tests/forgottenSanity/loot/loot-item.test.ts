import { describe, expect, it } from 'vitest';

import {
  ALL_LOOT,
  getLootItem,
  LOOT_RARITY_ORDER,
  type LootEffect,
  type LootItem,
  type LootRarity,
  type LootType,
} from '../../../forgottenSanity/loot/LootItem';

describe('LootItem types (spec §6.1/§6.8)', () => {
  it('LootRarity order is blue < purple < green < gold < white', () => {
    expect(LOOT_RARITY_ORDER).toEqual(['blue', 'purple', 'green', 'gold', 'white']);
  });

  it('LootType union covers 5 categories', () => {
    const types: LootType[] = ['material', 'consumable', 'relic', 'weapon', 'treasure'];
    expect(types).toHaveLength(5);
  });
});

describe('ALL_LOOT completeness (spec §6.2-§6.6)', () => {
  it('has 49 items (48 spec §6 + 1 spec §10.1 vaultKey)', () => {
    expect(ALL_LOOT).toHaveLength(49);
  });

  it('rarity counts: blue 13 (12 §6 + vaultKey) / purple 12 / green 12 / gold 8 / white 4', () => {
    const counts: Record<LootRarity, number> = { blue: 0, purple: 0, green: 0, gold: 0, white: 0 };
    for (const it of ALL_LOOT) counts[it.rarity] += 1;
    expect(counts).toEqual({ blue: 13, purple: 12, green: 12, gold: 8, white: 4 });
  });

  it('all ids are unique', () => {
    const ids = ALL_LOOT.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all spriteKeys are non-empty strings', () => {
    for (const it of ALL_LOOT) {
      expect(typeof it.spriteKey).toBe('string');
      expect(it.spriteKey.length).toBeGreaterThan(0);
    }
  });

  it('sanityValue ranges per rarity (table-authoritative, excludes §10.1 vaultKey special)', () => {
    const ranges: Record<LootRarity, [number, number]> = {
      blue: [10, 35],
      purple: [45, 95],
      green: [120, 220],
      gold: [400, 580],
      white: [750, 1500],
    };
    for (const it of ALL_LOOT) {
      // spec §10.1 vaultKey is a special blue material with sanity 0 (non-sellable, red-edge only); excluded from §6 range table
      if (it.id === 'material.vaultKey') continue;
      const [min, max] = ranges[it.rarity];
      expect(it.sanityValue).toBeGreaterThanOrEqual(min);
      expect(it.sanityValue).toBeLessThanOrEqual(max);
    }
  });
});

describe('ALL_LOOT specific items (spec §6.2 blue)', () => {
  it('material.chalkStub = 粉笔头, sanity 12, no effect', () => {
    const it = getLootItem('material.chalkStub');
    expect(it).toBeDefined();
    expect(it?.name).toBe('粉笔头');
    expect(it?.rarity).toBe('blue');
    expect(it?.type).toBe('material');
    expect(it?.sanityValue).toBe(12);
    expect(it?.effect).toBeNull();
    expect(it?.spriteKey).toBe('loot.粉笔头');
  });

  it('material.bloodstainedLoveLetter = 染血情书, sanity 35', () => {
    const it = getLootItem('material.bloodstainedLoveLetter');
    expect(it?.sanityValue).toBe(35);
    expect(it?.spriteKey).toBe('loot.染血情书');
  });
});

describe('ALL_LOOT purple consumables & relics (spec §6.3)', () => {
  it('consumable.mint = 薄荷糖, heal 3 instant', () => {
    const it = getLootItem('consumable.mint');
    expect(it?.sanityValue).toBe(50);
    expect(it?.effect).toEqual({ kind: 'heal', amount: 3, castTimeMs: 0 });
  });

  it('consumable.expiredEyeDrops = 过期眼药水, buff visionRange +10% 10s', () => {
    const it = getLootItem('consumable.expiredEyeDrops');
    expect(it?.effect).toEqual({
      kind: 'buff',
      stat: 'visionRange',
      magnitudePercent: 10,
      durationMs: 10000,
    });
  });

  it('consumable.halfBottleWater = 半瓶矿泉水, buff moveSpeed +5% 8s', () => {
    const it = getLootItem('consumable.halfBottleWater');
    expect(it?.sanityValue).toBe(48);
    expect(it?.effect).toEqual({
      kind: 'buff',
      stat: 'moveSpeed',
      magnitudePercent: 5,
      durationMs: 8000,
    });
  });

  it('relic.fadedStudentCard = 褪色学生卡, passiveMaxHp +5', () => {
    const it = getLootItem('relic.fadedStudentCard');
    expect(it?.effect).toEqual({ kind: 'passiveMaxHp', amount: 5 });
  });

  it('relic.tornSchoolbag = 破洞书包, passiveConsumableStackBonus +5', () => {
    const it = getLootItem('relic.tornSchoolbag');
    expect(it?.effect).toEqual({ kind: 'passiveConsumableStackBonus', amount: 5 });
  });
});

describe('ALL_LOOT green (spec §6.4)', () => {
  it('consumable.celery = 芹菜, heal 30 cast 500ms', () => {
    const it = getLootItem('consumable.celery');
    expect(it?.sanityValue).toBe(120);
    expect(it?.effect).toEqual({ kind: 'heal', amount: 30, castTimeMs: 500 });
    expect(it?.spriteKey).toBe('loot.芹菜');
  });

  it('consumable.antidote = 解药, cleanse cast 300ms', () => {
    expect(getLootItem('consumable.antidote')?.effect).toEqual({ kind: 'cleanse', castTimeMs: 300 });
  });

  it('consumable.adrenaline = 肾上腺素, multiBuff moveSpeed+30% & attackSpeed+20% 8s', () => {
    const it = getLootItem('consumable.adrenaline');
    expect(it?.effect).toEqual({
      kind: 'multiBuff',
      buffs: [
        { stat: 'moveSpeed', magnitudePercent: 30 },
        { stat: 'attackSpeed', magnitudePercent: 20 },
      ],
      durationMs: 8000,
    });
  });

  it('relic.blueEdgeHeadband = 蓝边发带, passiveMaxHp +20', () => {
    expect(getLootItem('relic.blueEdgeHeadband')?.effect).toEqual({ kind: 'passiveMaxHp', amount: 20 });
  });

  it('relic.bloodstainedBandage = 血渍绷带, passiveDamageImmunityChance 15%', () => {
    expect(getLootItem('relic.bloodstainedBandage')?.effect).toEqual({
      kind: 'passiveDamageImmunityChance',
      chancePercent: 15,
    });
  });

  it('relic.boxingGlove = 拳击手套, passiveStat basicDamage +20%', () => {
    expect(getLootItem('relic.boxingGlove')?.effect).toEqual({
      kind: 'passiveStat',
      stat: 'basicDamage',
      magnitudePercent: 20,
    });
  });
});

describe('ALL_LOOT gold (spec §6.5)', () => {
  it('consumable.holyWater = 圣水, invulnerable 3s fullRestore cast 1000ms', () => {
    expect(getLootItem('consumable.holyWater')?.effect).toEqual({
      kind: 'invulnerable',
      durationMs: 3000,
      castTimeMs: 1000,
      fullRestore: true,
    });
  });

  it('consumable.soulBell = 镇魂铃, aoeStun 5s vuln +30%', () => {
    expect(getLootItem('consumable.soulBell')?.effect).toEqual({
      kind: 'aoeStun',
      durationMs: 5000,
      vulnerabilityBonusPercent: 30,
    });
  });

  it('relic.redEdgeHeadband = 红边发带, passiveStatWithHpPenalty atkSpeed+25% hp-15', () => {
    expect(getLootItem('relic.redEdgeHeadband')?.effect).toEqual({
      kind: 'passiveStatWithHpPenalty',
      stat: 'attackSpeed',
      magnitudePercent: 25,
      maxHpDelta: -15,
    });
  });

  it('relic.principalSeal = 校长印章, passiveExtractionValueBonus +15%', () => {
    expect(getLootItem('relic.principalSeal')?.effect).toEqual({
      kind: 'passiveExtractionValueBonus',
      magnitudePercent: 15,
    });
  });
});

describe('ALL_LOOT white (spec §6.6)', () => {
  it('treasure.blankDiploma = 无字毕业证, sanity 750, no effect', () => {
    const it = getLootItem('treasure.blankDiploma');
    expect(it?.sanityValue).toBe(750);
    expect(it?.effect).toBeNull();
  });

  it('relic.blackGraduationPhoto = 黑色毕业照, passiveReviveOnce 50%', () => {
    expect(getLootItem('relic.blackGraduationPhoto')?.effect).toEqual({
      kind: 'passiveReviveOnce',
      reviveHpPercent: 50,
    });
  });
});

describe('weapon LootItems derive from plan 4 getWeapon (spec §6.4/§6.5/§6.6)', () => {
  it('weapon.ruler = 尺子, green, sanity from getWeapon, no effect', () => {
    const it = getLootItem('weapon.ruler');
    expect(it?.rarity).toBe('green');
    expect(it?.type).toBe('weapon');
    expect(it?.effect).toBeNull();
    expect(it?.sanityValue).toBe(130);
    expect(it?.spriteKey).toBe('loot.尺子');
  });

  it('weapon.chain = 锁链, gold, sanity 420', () => {
    const it = getLootItem('weapon.chain');
    expect(it?.rarity).toBe('gold');
    expect(it?.sanityValue).toBe(420);
  });

  it('weapon.bloodScythe = 血镰, gold, sanity 550', () => {
    const it = getLootItem('weapon.bloodScythe');
    expect(it?.rarity).toBe('gold');
    expect(it?.sanityValue).toBe(550);
  });

  it('weapon.soulBanner = 万魂幡, white, sanity 1200', () => {
    const it = getLootItem('weapon.soulBanner');
    expect(it?.rarity).toBe('white');
    expect(it?.sanityValue).toBe(1200);
  });
});

describe('getLootItem lookup', () => {
  it('returns undefined for unknown id', () => {
    expect(getLootItem('material.nonexistent')).toBeUndefined();
  });
});

describe('LootEffect is a discriminated union', () => {
  it('every effect has a kind field', () => {
    const e: LootEffect | null = { kind: 'heal', amount: 1, castTimeMs: 0 };
    expect(e?.kind).toBe('heal');
  });
});

// Static type assertion to ensure LootItem exposes required fields
function _compileTimeAssert(item: LootItem): void {
  void item;
}
void _compileTimeAssert;

describe('vaultKey (spec §10.1)', () => {
  it('is registered as blue material with sanityValue 0', () => {
    const item = getLootItem('material.vaultKey');
    expect(item).toBeDefined();
    expect(item!.rarity).toBe('blue');
    expect(item!.type).toBe('material');
    expect(item!.sanityValue).toBe(0);
    expect(item!.effect).toBeNull();
    expect(item!.name).toBe('仓库钥匙');
  });
});
