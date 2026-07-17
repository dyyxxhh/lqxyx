// src/forgottenSanity/loot/Inventory.ts
// 本局背包：遗物不叠加 + 消耗品堆叠上限受 tornSchoolbag 影响 + totalSanityValue。
// 纯 TS，无 Phaser import。spec §10，plan 5 Task 3。
import { getLootItem, type LootItem } from './LootItem';

export const BASE_CONSUMABLE_STACK_LIMIT = 10;
export const TORN_SCHOOLBAG_BONUS = 5;

export interface InventoryEntry {
  readonly itemId: string;
  readonly quantity: number;
}

export interface AddResult {
  readonly added: number;
  readonly overflow: number;
}

export interface InventoryOptions {
  readonly isTornSchoolbagActive?: () => boolean;
}

export class Inventory {
  private readonly quantities = new Map<string, number>();
  private readonly activeRelicIds = new Set<string>();
  private readonly isTornSchoolbagActive: () => boolean;

  constructor(opts: InventoryOptions = {}) {
    this.isTornSchoolbagActive = opts.isTornSchoolbagActive ?? (() => false);
  }

  add(itemId: string, qty = 1): AddResult {
    if (qty <= 0) return { added: 0, overflow: 0 };
    const item = getLootItem(itemId);
    if (item === undefined) return { added: 0, overflow: qty };
    const current = this.quantities.get(itemId) ?? 0;
    const cap = this.capFor(item);
    const newQty = Math.min(cap, current + qty);
    const added = newQty - current;
    const overflow = qty - added;
    this.quantities.set(itemId, newQty);
    if (item.type === 'relic' && !this.activeRelicIds.has(itemId)) {
      this.activeRelicIds.add(itemId);
    }
    return { added, overflow };
  }

  remove(itemId: string, qty = 1): boolean {
    if (qty <= 0) return true;
    const current = this.quantities.get(itemId) ?? 0;
    if (current < qty) return false;
    const newQty = current - qty;
    if (newQty <= 0) {
      this.quantities.delete(itemId);
      const item = getLootItem(itemId);
      if (item?.type === 'relic') this.activeRelicIds.delete(itemId);
    } else {
      this.quantities.set(itemId, newQty);
    }
    return true;
  }

  has(itemId: string): boolean {
    return (this.quantities.get(itemId) ?? 0) > 0;
  }

  quantity(itemId: string): number {
    return this.quantities.get(itemId) ?? 0;
  }

  entries(): readonly InventoryEntry[] {
    return [...this.quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  activeRelics(): readonly string[] {
    return [...this.activeRelicIds];
  }

  totalSanityValue(): number {
    let total = 0;
    for (const [itemId, qty] of this.quantities) {
      const item = getLootItem(itemId);
      if (item !== undefined) total += item.sanityValue * qty;
    }
    return total;
  }

  clear(): void {
    this.quantities.clear();
    this.activeRelicIds.clear();
  }

  private capFor(item: LootItem): number {
    if (item.type === 'consumable') {
      return BASE_CONSUMABLE_STACK_LIMIT + (this.isTornSchoolbagActive() ? TORN_SCHOOLBAG_BONUS : 0);
    }
    return Number.POSITIVE_INFINITY;
  }
}
