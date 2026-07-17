// src/forgottenSanity/meta/StashManager.ts
// 被遗忘的理智仓库数据层：无限槽位、理智台账、并入本局 Inventory、读写 localStorage。
// 纯 TS，无 Phaser import。spec §8.1，plan 6 Task 2。
import type { ForgottenSanityStashState, ForgottenSanityStashItem, ForgottenSanityLoadResult } from '../state/forgottenSanityState';
import {
  FORGOTTEN_SANITY_STASH_STORAGE_KEY as STASH_KEY,
  createDefaultStashState,
  loadStashState,
  saveStashState,
} from '../state/forgottenSanityState';
import type { InventoryEntry } from '../loot/Inventory';

// InventoryPort 端口接口 — StashManager 仅消费本局 Inventory 的只读快照能力
// （entries/totalSanityValue/clear），不依赖 Plan 5 完整 Inventory（add/remove/has/quantity/activeRelics）。
// SettlementScreen 传入的完整 Inventory 结构兼容此端口（超集）。定义在此处并由本文件 export。
export interface InventoryPort {
  entries(): readonly InventoryEntry[];
  totalSanityValue(): number;
  clear(): void;
}

export function getStashItemQuantity(stash: ForgottenSanityStashState, itemId: string): number {
  for (const item of stash.items) {
    if (item.itemId === itemId) return item.quantity;
  }
  return 0;
}

export function addLoot(stash: ForgottenSanityStashState, itemId: string, quantity: number): ForgottenSanityStashState {
  if (quantity <= 0) return stash;
  const existing = stash.items.find((it) => it.itemId === itemId);
  let items: readonly ForgottenSanityStashItem[];
  if (existing) {
    items = stash.items.map((it) => it.itemId === itemId ? { itemId, quantity: it.quantity + quantity } : it);
  } else {
    items = [...stash.items, { itemId, quantity }];
  }
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity, items };
}

export function addSanity(stash: ForgottenSanityStashState, amount: number): ForgottenSanityStashState {
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity + amount, items: stash.items };
}

export function removeFromStash(
  stash: ForgottenSanityStashState,
  itemId: string,
  quantity: number,
): ForgottenSanityStashState {
  if (quantity <= 0) return stash;
  const current = getStashItemQuantity(stash, itemId);
  if (current < quantity) return stash; // 不够，原样返回
  const items = stash.items
    .map((it) => it.itemId === itemId ? { itemId, quantity: it.quantity - quantity } : it)
    .filter((it) => it.quantity > 0);
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity, items };
}

export interface DepositRunResult {
  readonly stash: ForgottenSanityStashState;
  readonly totalDeposited: number;
  readonly itemCount: number;
}

export function depositRunInventory(stash: ForgottenSanityStashState, inventory: InventoryPort): DepositRunResult {
  const entries = inventory.entries();
  let next = stash;
  let itemCount = 0;
  for (const entry of entries) {
    next = addLoot(next, entry.itemId, entry.quantity);
    itemCount += entry.quantity;
  }
  const totalDeposited = inventory.totalSanityValue();
  return {
    stash: addSanity(next, totalDeposited),
    totalDeposited,
    itemCount,
  };
}

export function loadStash(): ForgottenSanityStashState {
  const result: ForgottenSanityLoadResult<ForgottenSanityStashState> = loadStashState();
  return result.state;
}

export function storeStash(stash: ForgottenSanityStashState): void {
  saveStashState(stash);
}

export { createDefaultStashState, STASH_KEY };
