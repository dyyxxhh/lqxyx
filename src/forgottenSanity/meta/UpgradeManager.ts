// src/forgottenSanity/meta/UpgradeManager.ts
// 被遗忘的理智 6 种永久升级数据层：成本表、阶数校验、效果计算。
// 纯 TS，无 Phaser import。spec §8.4，plan 6 Task 1。
import type {
  ForgottenSanityUpgradeId,
  ForgottenSanityUpgradesState,
  ForgottenSanityStashState,
} from '../state/forgottenSanityState';

export const UPGRADE_COSTS: Readonly<Record<ForgottenSanityUpgradeId, readonly number[]>> = {
  physique: [200, 400, 600, 800, 1000],
  swift: [200, 400, 600, 800, 1000],
  pickup: [300, 500, 700, 900, 1100],
  sharp: [300, 500, 700, 900, 1100],
  lucky: [500, 800, 1200, 1500, 2000],
  armory: [500, 800, 1200],
};

export const UPGRADE_MAX_TIERS: Readonly<Record<ForgottenSanityUpgradeId, number>> = {
  physique: 5,
  swift: 5,
  pickup: 5,
  sharp: 5,
  lucky: 5,
  armory: 3,
};

// stat 类升级每阶 +4%；armory 是 +1 槽，effect 通过 consumableSlotCount 单独表达
export const UPGRADE_EFFECT_PER_TIER: Readonly<Record<ForgottenSanityUpgradeId, number>> = {
  physique: 0.04,
  swift: 0.04,
  pickup: 0.04,
  sharp: 0.04,
  lucky: 0.04,
  armory: 1,
};

const PLAYER_BASE_MAX_HP = 100;
const CONSUMABLE_BASE_SLOTS = 3;

export function getUpgradeCost(id: ForgottenSanityUpgradeId, currentTier: number): number {
  const max = UPGRADE_MAX_TIERS[id];
  if (currentTier >= max) {
    throw new Error(`Upgrade ${id} already at max tier ${max}`);
  }
  const costs = UPGRADE_COSTS[id];
  const cost = costs[currentTier];
  if (cost === undefined) {
    throw new Error(`Missing cost for ${id} tier ${currentTier}`);
  }
  return cost;
}

export function canUpgrade(
  upgrades: ForgottenSanityUpgradesState,
  stash: ForgottenSanityStashState,
  id: ForgottenSanityUpgradeId,
): boolean {
  const current = upgrades.tiers[id];
  if (current >= UPGRADE_MAX_TIERS[id]) return false;
  const cost = getUpgradeCost(id, current);
  return stash.sanity >= cost;
}

export function applyUpgrade(
  upgrades: ForgottenSanityUpgradesState,
  stash: ForgottenSanityStashState,
  id: ForgottenSanityUpgradeId,
): { readonly upgrades: ForgottenSanityUpgradesState; readonly stash: ForgottenSanityStashState } {
  if (!canUpgrade(upgrades, stash, id)) {
    throw new Error(`Cannot upgrade ${id} (tier=${upgrades.tiers[id]}, sanity=${stash.sanity})`);
  }
  const current = upgrades.tiers[id];
  const cost = getUpgradeCost(id, current);
  const nextTiers = { ...upgrades.tiers, [id]: current + 1 };
  return {
    upgrades: { schemaVersion: upgrades.schemaVersion, tiers: nextTiers },
    stash: { schemaVersion: stash.schemaVersion, sanity: stash.sanity - cost, items: stash.items },
  };
}

export interface UpgradeEffects {
  readonly maxHpMultiplier: number;
  readonly maxHpBonus: number;
  readonly moveSpeedMultiplier: number;
  readonly pickupRangeMultiplier: number;
  readonly attackDamageMultiplier: number;
  readonly dropRateMultiplier: number;
  readonly consumableSlotCount: number;
}

export function getUpgradeEffects(
  tiers: Readonly<Record<ForgottenSanityUpgradeId, number>>,
): UpgradeEffects {
  const phys = tiers.physique * UPGRADE_EFFECT_PER_TIER.physique;
  const swift = tiers.swift * UPGRADE_EFFECT_PER_TIER.swift;
  const pickup = tiers.pickup * UPGRADE_EFFECT_PER_TIER.pickup;
  const sharp = tiers.sharp * UPGRADE_EFFECT_PER_TIER.sharp;
  const lucky = tiers.lucky * UPGRADE_EFFECT_PER_TIER.lucky;
  return {
    maxHpMultiplier: 1 + phys,
    maxHpBonus: Math.round(PLAYER_BASE_MAX_HP * phys),
    moveSpeedMultiplier: 1 + swift,
    pickupRangeMultiplier: 1 + pickup,
    attackDamageMultiplier: 1 + sharp,
    dropRateMultiplier: 1 + lucky,
    consumableSlotCount: CONSUMABLE_BASE_SLOTS + tiers.armory,
  };
}
