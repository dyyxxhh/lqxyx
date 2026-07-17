// src/forgottenSanity/meta/ShopManager.ts
// 被遗忘的理智商城数据层：卖价 1:1、买价 Math.ceil(sanityValue×1.75)、可买过滤、可卖任意。
// 纯 TS，无 Phaser import。spec §8.2，plan 6 Task 3。
import type { ForgottenSanityStashState } from '../state/forgottenSanityState';
import type { LootItem } from '../loot/LootItem';
import { addLoot, addSanity, getStashItemQuantity, removeFromStash } from './StashManager';

export const SHOP_BUY_MULTIPLIER = 1.75;
export const SHOP_SELL_MULTIPLIER = 1;

export function getSellPrice(item: LootItem): number {
  return Math.round(item.sanityValue * SHOP_SELL_MULTIPLIER);
}

export function getBuyPrice(item: LootItem): number {
  return Math.ceil(item.sanityValue * SHOP_BUY_MULTIPLIER);
}

export function isBuyable(item: LootItem): boolean {
  return item.type === 'consumable' || item.type === 'weapon';
}

export function isSellable(_item: LootItem): boolean {
  return true; // 任意皆可卖
}

export type ShopResult =
  | { readonly ok: true; readonly stash: ForgottenSanityStashState }
  | { readonly ok: false; readonly reason: 'insufficient-stock' | 'not-buyable'; readonly stash: ForgottenSanityStashState };

export function sell(
  stash: ForgottenSanityStashState,
  item: LootItem,
  quantity: number,
): ShopResult {
  if (!isSellable(item)) {
    return { ok: false, reason: 'not-buyable', stash };
  }
  if (quantity <= 0) return { ok: true, stash };
  if (getStashItemQuantity(stash, item.id) < quantity) {
    return { ok: false, reason: 'insufficient-stock', stash };
  }
  const afterRemove = removeFromStash(stash, item.id, quantity);
  const gain = getSellPrice(item) * quantity;
  return { ok: true, stash: addSanity(afterRemove, gain) };
}

export function buy(
  stash: ForgottenSanityStashState,
  item: LootItem,
  quantity: number,
): ShopResult {
  if (!isBuyable(item)) {
    return { ok: false, reason: 'not-buyable', stash };
  }
  if (quantity <= 0) return { ok: true, stash };
  const cost = getBuyPrice(item) * quantity;
  if (stash.sanity < cost) {
    return { ok: false, reason: 'insufficient-stock', stash };
  }
  const afterDeduct: ForgottenSanityStashState = {
    schemaVersion: stash.schemaVersion,
    sanity: stash.sanity - cost,
    items: stash.items,
  };
  return { ok: true, stash: addLoot(afterDeduct, item.id, quantity) };
}
