import { describe, it, expect } from 'vitest';
import {
  getSellPrice, getBuyPrice, isBuyable, isSellable,
  sell, buy, SHOP_BUY_MULTIPLIER, SHOP_SELL_MULTIPLIER,
} from '../tombraid/meta/ShopManager';
import type { TombRaidStashState } from '../tombraid/state/tombRaidState';
import type { LootItem } from '../tombraid/loot/LootItem';

function loot(id: string, type: LootItem['type'], sanityValue: number): LootItem {
  return {
    id, name: id, rarity: 'blue', type, sanityValue,
    spriteKey: '', description: '', effect: null,
  };
}

function stashWith(sanity: number, items: { itemId: string; quantity: number }[] = []): TombRaidStashState {
  return { schemaVersion: 1, sanity, items };
}

describe('ShopManager constants', () => {
  it('pins buy multiplier 1.75 and sell multiplier 1.0', () => {
    expect(SHOP_BUY_MULTIPLIER).toBe(1.75);
    expect(SHOP_SELL_MULTIPLIER).toBe(1);
  });
});

describe('ShopManager pricing (spec §8.2)', () => {
  it('sell price = sanityValue (1:1)', () => {
    expect(getSellPrice(loot('treasure.jadePendant', 'treasure', 220))).toBe(220);
  });

  it('buy price = Math.ceil(sanityValue × 1.75)', () => {
    // celery 120 → 210 ; ruler 130 → 227.5 → 228
    expect(getBuyPrice(loot('consumable.celery', 'consumable', 120))).toBe(210);
    expect(getBuyPrice(loot('weapon.ruler', 'weapon', 130))).toBe(228);
  });
});

describe('ShopManager buyable/sellable filter', () => {
  it('buyable = consumable + weapon only', () => {
    expect(isBuyable(loot('x', 'consumable', 10))).toBe(true);
    expect(isBuyable(loot('x', 'weapon', 10))).toBe(true);
    expect(isBuyable(loot('x', 'material', 10))).toBe(false);
    expect(isBuyable(loot('x', 'relic', 10))).toBe(false);
    expect(isBuyable(loot('x', 'treasure', 10))).toBe(false);
  });

  it('sellable = anything', () => {
    for (const t of ['material', 'consumable', 'relic', 'weapon', 'treasure'] as const) {
      expect(isSellable(loot('x', t, 10))).toBe(true);
    }
  });
});

describe('ShopManager sell', () => {
  it('adds sell price × qty to sanity and removes from stash', () => {
    const stash = stashWith(100, [{ itemId: 'treasure.jadePendant', quantity: 2 }]);
    const result = sell(stash, loot('treasure.jadePendant', 'treasure', 220), 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stash.sanity).toBe(100 + 440);
      expect(result.stash.items).toHaveLength(0);
    }
  });

  it('refuses when stash lacks quantity', () => {
    const stash = stashWith(100, [{ itemId: 'treasure.jadePendant', quantity: 1 }]);
    const result = sell(stash, loot('treasure.jadePendant', 'treasure', 220), 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-stock');
  });
});

describe('ShopManager buy', () => {
  it('deducts buy price × qty and adds to stash when affordable', () => {
    const stash = stashWith(500);
    const result = buy(stash, loot('consumable.celery', 'consumable', 120), 2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stash.sanity).toBe(500 - 210 * 2);
      expect(result.stash.items[0]?.itemId).toBe('consumable.celery');
      expect(result.stash.items[0]?.quantity).toBe(2);
    }
  });

  it('refuses when sanity insufficient', () => {
    const stash = stashWith(100);
    const result = buy(stash, loot('consumable.celery', 'consumable', 120), 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-stock');
  });

  it('refuses to buy non-buyable items', () => {
    const stash = stashWith(99999);
    const result = buy(stash, loot('material.chalkStub', 'material', 12), 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-buyable');
  });
});
