// src/tombraid/meta/LoadoutManager.ts
// 摸金模式起配数据层：1 武器 + 3 消耗品槽（武备 +1 最多 +3→6）、空手 unarmed、纯函数消费仓库。
// 纯 TS，无 Phaser import。spec §8.3，plan 6 Task 4。
import type { TombRaidUpgradesState, TombRaidStashState } from '../state/tombRaidState';
import { getStashItemQuantity, removeFromStash } from './StashManager';
import { UPGRADE_MAX_TIERS } from './UpgradeManager';

export const UNARMED_ID = 'unarmed';
export const WEAK_PUNCH_DAMAGE = 5;
export const BASE_CONSUMABLE_SLOTS = 3;
export const MAX_CONSUMABLE_SLOTS = 6;

export interface LoadoutConsumableSlot { readonly itemId: string; readonly quantity: number; }
export interface Loadout {
  readonly weaponId: string; // 'unarmed' 表示空手
  readonly consumables: readonly LoadoutConsumableSlot[];
}
export interface BuiltRun {
  readonly loadout: Loadout;
  readonly stash: TombRaidStashState;
  readonly weaponRemovedFromStash: boolean;
  readonly consumablesRemovedFromStash: readonly { readonly itemId: string; readonly quantity: number }[];
}

export function getConsumableSlotCount(
  tiers: Readonly<Record<keyof TombRaidUpgradesState['tiers'], number>>,
): number {
  const slots = BASE_CONSUMABLE_SLOTS + tiers.armory;
  return Math.min(slots, MAX_CONSUMABLE_SLOTS);
}

export type ValidateLoadoutResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'too-many-consumables' | 'insufficient-stock' };

export function validateLoadout(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  loadout: Loadout,
): ValidateLoadoutResult {
  const slotCount = getConsumableSlotCount(upgrades.tiers);
  if (loadout.consumables.length > slotCount) {
    return { ok: false, reason: 'too-many-consumables' };
  }
  if (loadout.weaponId !== UNARMED_ID) {
    if (getStashItemQuantity(stash, loadout.weaponId) < 1) {
      return { ok: false, reason: 'insufficient-stock' };
    }
  }
  for (const c of loadout.consumables) {
    if (getStashItemQuantity(stash, c.itemId) < c.quantity) {
      return { ok: false, reason: 'insufficient-stock' };
    }
  }
  return { ok: true };
}

export function consumeLoadoutFromStash(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  loadout: Loadout,
): BuiltRun {
  const validation = validateLoadout(upgrades, stash, loadout);
  if (!validation.ok) {
    throw new Error(`Cannot consume loadout: ${validation.reason}`);
  }
  let next = stash;
  let weaponRemoved = false;
  const consumablesRemoved: { itemId: string; quantity: number }[] = [];
  if (loadout.weaponId !== UNARMED_ID) {
    next = removeFromStash(next, loadout.weaponId, 1);
    weaponRemoved = true;
  }
  for (const c of loadout.consumables) {
    next = removeFromStash(next, c.itemId, c.quantity);
    consumablesRemoved.push({ itemId: c.itemId, quantity: c.quantity });
  }
  return {
    loadout,
    stash: next,
    weaponRemovedFromStash: weaponRemoved,
    consumablesRemovedFromStash: consumablesRemoved,
  };
}

export { UPGRADE_MAX_TIERS };
