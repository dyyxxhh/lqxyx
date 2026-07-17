import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStashItemQuantity, addLoot, addSanity, removeFromStash,
  depositRunInventory, loadStash, storeStash,
} from '../forgottenSanity/meta/StashManager';
import { createDefaultStashState } from '../forgottenSanity/state/forgottenSanityState';
import type { ForgottenSanityStashState } from '../forgottenSanity/state/forgottenSanityState';
import type { InventoryEntry } from '../forgottenSanity/loot/Inventory';
import type { InventoryPort } from '../forgottenSanity/meta/StashManager';

function stashWith(sanity: number, items: { itemId: string; quantity: number }[] = []): ForgottenSanityStashState {
  return { schemaVersion: 1, sanity, items };
}

function makeInventory(entries: readonly InventoryEntry[], total: number): InventoryPort {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.itemId, e.quantity);
  return {
    entries: () => Array.from(map.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    totalSanityValue: () => total,
    clear: () => { map.clear(); },
  };
}

describe('StashManager infinite slots', () => {
  it('addLoot stacks by itemId', () => {
    const s1 = addLoot(stashWith(0), 'material.chalkStub', 5);
    const s2 = addLoot(s1, 'material.chalkStub', 3);
    expect(getStashItemQuantity(s2, 'material.chalkStub')).toBe(8);
  });

  it('addLoot creates new entry for new itemId', () => {
    const s = addLoot(stashWith(0), 'treasure.jadePendant', 1);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.itemId).toBe('treasure.jadePendant');
  });

  it('addSanity increases sanity ledger', () => {
    const s = addSanity(stashWith(100), 250);
    expect(s.sanity).toBe(350);
  });
});

describe('StashManager removeFromStash', () => {
  it('removes partial quantity', () => {
    const s = removeFromStash(stashWith(0, [{ itemId: 'consumable.celery', quantity: 5 }]), 'consumable.celery', 2);
    expect(getStashItemQuantity(s, 'consumable.celery')).toBe(3);
  });

  it('removes entry entirely when quantity reaches 0', () => {
    const s = removeFromStash(stashWith(0, [{ itemId: 'consumable.celery', quantity: 5 }]), 'consumable.celery', 5);
    expect(s.items).toHaveLength(0);
  });

  it('refuses to remove more than available (returns unchanged)', () => {
    const original = stashWith(0, [{ itemId: 'consumable.celery', quantity: 2 }]);
    const s = removeFromStash(original, 'consumable.celery', 5);
    expect(s).toBe(original);
  });
});

describe('StashManager depositRunInventory (spec §1.3)', () => {
  it('deposits all entries and adds total sanity value', () => {
    const inv = makeInventory(
      [{ itemId: 'treasure.jadePendant', quantity: 1 }, { itemId: 'material.chalkStub', quantity: 3 }],
      220 + 36, // 220 + 3*12
    );
    const result = depositRunInventory(stashWith(50), inv);
    expect(result.stash.sanity).toBe(50 + 220 + 36);
    expect(getStashItemQuantity(result.stash, 'treasure.jadePendant')).toBe(1);
    expect(getStashItemQuantity(result.stash, 'material.chalkStub')).toBe(3);
    expect(result.totalDeposited).toBe(220 + 36);
    expect(result.itemCount).toBe(4);
  });
});

describe('StashManager persistence', () => {
  beforeEach(() => localStorage.clear());

  it('loadStash returns default when empty', () => {
    const s = loadStash();
    expect(s.sanity).toBe(0);
    expect(s.items).toEqual([]);
  });

  it('storeStash then loadStash round-trips', () => {
    const s = stashWith(750, [{ itemId: 'treasure.jadePendant', quantity: 2 }]);
    storeStash(s);
    expect(loadStash()).toEqual(s);
  });

  it('createDefaultStashState exposed via re-export', () => {
    expect(createDefaultStashState()).toEqual({ schemaVersion: 1, sanity: 0, items: [] });
  });
});
