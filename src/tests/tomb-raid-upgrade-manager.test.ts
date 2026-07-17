import { describe, it, expect } from 'vitest';
import {
  UPGRADE_COSTS, UPGRADE_MAX_TIERS, UPGRADE_EFFECT_PER_TIER,
  getUpgradeCost, canUpgrade, applyUpgrade, getUpgradeEffects,
} from '../tombraid/meta/UpgradeManager';
import type { TombRaidUpgradesState, TombRaidStashState } from '../tombraid/state/tombRaidState';

function tiers(over: Partial<Record<keyof TombRaidUpgradesState['tiers'], number>> = {}): TombRaidUpgradesState['tiers'] {
  return {
    physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0,
    ...over,
  };
}

function stash(sanity: number): TombRaidStashState {
  return { schemaVersion: 1, sanity, items: [] };
}

describe('UpgradeManager cost tables (spec §8.4)', () => {
  it('pins 5-tier cost arrays for physique/swift', () => {
    expect(UPGRADE_COSTS.physique).toEqual([200, 400, 600, 800, 1000]);
    expect(UPGRADE_COSTS.swift).toEqual([200, 400, 600, 800, 1000]);
  });

  it('pins 5-tier cost arrays for pickup/sharp', () => {
    expect(UPGRADE_COSTS.pickup).toEqual([300, 500, 700, 900, 1100]);
    expect(UPGRADE_COSTS.sharp).toEqual([300, 500, 700, 900, 1100]);
  });

  it('pins 5-tier cost array for lucky', () => {
    expect(UPGRADE_COSTS.lucky).toEqual([500, 800, 1200, 1500, 2000]);
  });

  it('pins 3-tier cost array for armory', () => {
    expect(UPGRADE_COSTS.armory).toEqual([500, 800, 1200]);
  });

  it('pins max tiers', () => {
    expect(UPGRADE_MAX_TIERS.physique).toBe(5);
    expect(UPGRADE_MAX_TIERS.armory).toBe(3);
  });

  it('pins +4% effect per tier for stat upgrades', () => {
    expect(UPGRADE_EFFECT_PER_TIER.physique).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.swift).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.pickup).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.sharp).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.lucky).toBe(0.04);
  });
});

describe('getUpgradeCost', () => {
  it('returns cost to go from current tier to next', () => {
    expect(getUpgradeCost('physique', 0)).toBe(200);
    expect(getUpgradeCost('physique', 2)).toBe(600);
    expect(getUpgradeCost('armory', 0)).toBe(500);
  });

  it('throws when current tier >= max', () => {
    expect(() => getUpgradeCost('armory', 3)).toThrow();
    expect(() => getUpgradeCost('physique', 5)).toThrow();
  });
});

describe('canUpgrade', () => {
  it('true when tier < max and sanity >= cost', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers() }, stash(300), 'physique')).toBe(true);
  });

  it('false when tier already maxed', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers({ armory: 3 }) }, stash(99999), 'armory')).toBe(false);
  });

  it('false when sanity < cost', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers() }, stash(100), 'physique')).toBe(false);
  });
});

describe('applyUpgrade', () => {
  it('increments tier and deducts sanity, returns new state', () => {
    const result = applyUpgrade(
      { schemaVersion: 1, tiers: tiers({ physique: 2 }) },
      stash(1000),
      'physique',
    );
    expect(result.upgrades.tiers.physique).toBe(3);
    expect(result.stash.sanity).toBe(400); // 1000 - 600 (cost[2]=600)
    expect(result.stash.items).toEqual([]);
  });

  it('throws when cannot upgrade', () => {
    expect(() => applyUpgrade(
      { schemaVersion: 1, tiers: tiers({ armory: 3 }) },
      stash(99999),
      'armory',
    )).toThrow();
  });
});

describe('getUpgradeEffects', () => {
  it('computes multipliers for stat upgrades', () => {
    const e = getUpgradeEffects(tiers({ physique: 3, swift: 2, pickup: 1, sharp: 4, lucky: 5 }));
    expect(e.maxHpMultiplier).toBeCloseTo(1 + 0.04 * 3);
    expect(e.moveSpeedMultiplier).toBeCloseTo(1 + 0.04 * 2);
    expect(e.pickupRangeMultiplier).toBeCloseTo(1 + 0.04 * 1);
    expect(e.attackDamageMultiplier).toBeCloseTo(1 + 0.04 * 4);
    expect(e.dropRateMultiplier).toBeCloseTo(1 + 0.04 * 5);
    expect(e.consumableSlotCount).toBe(3); // armory tier 0
  });

  it('armory tier adds consumable slots up to 6', () => {
    expect(getUpgradeEffects(tiers({ armory: 1 })).consumableSlotCount).toBe(4);
    expect(getUpgradeEffects(tiers({ armory: 3 })).consumableSlotCount).toBe(6);
  });

  it('maxHp bonus respects base 100', () => {
    const e = getUpgradeEffects(tiers({ physique: 5 }));
    expect(e.maxHpBonus).toBe(100 * 0.04 * 5); // +20
    expect(e.maxHpMultiplier).toBeCloseTo(1.2);
  });
});
