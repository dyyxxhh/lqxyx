import { describe, it, expect } from 'vitest';
import {
  UNARMED_ID, WEAK_PUNCH_DAMAGE, BASE_CONSUMABLE_SLOTS, MAX_CONSUMABLE_SLOTS,
  getConsumableSlotCount, validateLoadout, consumeLoadoutFromStash,
} from '../tombraid/meta/LoadoutManager';
import type { TombRaidUpgradesState, TombRaidStashState } from '../tombraid/state/tombRaidState';
import type { Loadout } from '../tombraid/meta/LoadoutManager';

function tiers(over: Partial<Record<keyof TombRaidUpgradesState['tiers'], number>> = {}): TombRaidUpgradesState['tiers'] {
  return { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0, ...over };
}

function stash(sanity: number, items: { itemId: string; quantity: number }[] = []): TombRaidStashState {
  return { schemaVersion: 1, sanity, items };
}

describe('LoadoutManager constants', () => {
  it('pins unarmed id, weak punch dmg, base/max consumable slots', () => {
    expect(UNARMED_ID).toBe('unarmed');
    expect(WEAK_PUNCH_DAMAGE).toBe(5);
    expect(BASE_CONSUMABLE_SLOTS).toBe(3);
    expect(MAX_CONSUMABLE_SLOTS).toBe(6);
  });
});

describe('getConsumableSlotCount (spec §8.3)', () => {
  it('base 3, +1 per armory tier, capped at 6', () => {
    expect(getConsumableSlotCount(tiers())).toBe(3);
    expect(getConsumableSlotCount(tiers({ armory: 1 }))).toBe(4);
    expect(getConsumableSlotCount(tiers({ armory: 3 }))).toBe(6);
    expect(getConsumableSlotCount(tiers({ armory: 5 }))).toBe(6); // 上限 6
  });
});

describe('validateLoadout', () => {
  it('accepts 1 weapon + up-to-slot consumables, all in stash', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0, [
      { itemId: 'weapon.ruler', quantity: 1 },
      { itemId: 'consumable.celery', quantity: 2 },
    ]);
    const loadout: Loadout = {
      weaponId: 'weapon.ruler',
      consumables: [{ itemId: 'consumable.celery', quantity: 2 }],
    };
    expect(validateLoadout(u, s, loadout).ok).toBe(true);
  });

  it('accepts unarmed weapon with no consumables', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0);
    const loadout: Loadout = { weaponId: 'unarmed', consumables: [] };
    expect(validateLoadout(u, s, loadout).ok).toBe(true);
  });

  it('rejects consumable count exceeding slot count', () => {
    const u = { schemaVersion: 1, tiers: tiers() }; // 3 slots
    const s = stash(0, [
      { itemId: 'consumable.celery', quantity: 5 },
      { itemId: 'consumable.mint', quantity: 5 },
      { itemId: 'consumable.expiredEyeDrops', quantity: 5 },
      { itemId: 'consumable.halfBottleWater', quantity: 5 },
    ]);
    const loadout: Loadout = {
      weaponId: 'unarmed',
      consumables: [
        { itemId: 'consumable.celery', quantity: 1 },
        { itemId: 'consumable.mint', quantity: 1 },
        { itemId: 'consumable.expiredEyeDrops', quantity: 1 },
        { itemId: 'consumable.halfBottleWater', quantity: 1 },
      ],
    };
    const result = validateLoadout(u, s, loadout);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-many-consumables');
  });

  it('rejects when stash lacks required weapon', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0, []);
    const loadout: Loadout = { weaponId: 'weapon.ruler', consumables: [] };
    const result = validateLoadout(u, s, loadout);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-stock');
  });

  it('rejects when stash lacks required consumable quantity', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0, [{ itemId: 'consumable.celery', quantity: 1 }]);
    const loadout: Loadout = {
      weaponId: 'unarmed',
      consumables: [{ itemId: 'consumable.celery', quantity: 3 }],
    };
    const result = validateLoadout(u, s, loadout);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-stock');
  });
});

describe('consumeLoadoutFromStash', () => {
  it('removes weapon + consumables from stash; unarmed removes nothing', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0, [
      { itemId: 'weapon.ruler', quantity: 2 },
      { itemId: 'consumable.celery', quantity: 5 },
    ]);
    const loadout: Loadout = {
      weaponId: 'weapon.ruler',
      consumables: [{ itemId: 'consumable.celery', quantity: 3 }],
    };
    const result = consumeLoadoutFromStash(u, s, loadout);
    expect(result.stash.items.find((it) => it.itemId === 'weapon.ruler')?.quantity).toBe(1);
    expect(result.stash.items.find((it) => it.itemId === 'consumable.celery')?.quantity).toBe(2);
    expect(result.weaponRemovedFromStash).toBe(true);
  });

  it('unarmed loadout does not touch stash items', () => {
    const u = { schemaVersion: 1, tiers: tiers() };
    const s = stash(0, [{ itemId: 'consumable.celery', quantity: 3 }]);
    const loadout: Loadout = { weaponId: 'unarmed', consumables: [] };
    const result = consumeLoadoutFromStash(u, s, loadout);
    expect(result.weaponRemovedFromStash).toBe(false);
    expect(result.stash.items).toHaveLength(1);
  });
});
