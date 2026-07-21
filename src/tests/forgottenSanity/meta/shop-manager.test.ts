import { describe, expect, it } from 'vitest';

import { getLootItem } from '../../../forgottenSanity/loot/LootItem';
import { isSellable, sell } from '../../../forgottenSanity/meta/ShopManager';
import { addLoot } from '../../../forgottenSanity/meta/StashManager';
import { createDefaultStashState } from '../../../forgottenSanity/state/forgottenSanityState';

describe('#11 vaultKey sellable=false', () => {
  it('getLootItem returns sellable=false for vaultKey', () => {
    const item = getLootItem('material.vaultKey');
    expect(item?.sellable).toBe(false);
  });

  it('getLootItem returns sellable undefined (default sellable) for normal item', () => {
    const item = getLootItem('consumable.celery');
    expect(item?.sellable).toBeUndefined();
  });

  it('isSellable returns false for vaultKey', () => {
    const item = getLootItem('material.vaultKey');
    expect(item).toBeDefined();
    expect(isSellable(item!)).toBe(false);
  });

  it('isSellable returns true for normal consumable', () => {
    const item = getLootItem('consumable.celery');
    expect(item).toBeDefined();
    expect(isSellable(item!)).toBe(true);
  });

  it('sell returns unsellable reason for vaultKey and leaves stash unchanged', () => {
    const item = getLootItem('material.vaultKey');
    expect(item).toBeDefined();
    const stash = addLoot(createDefaultStashState(), item!.id, 1);
    const result = sell(stash, item!, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsellable');
    }
    // 仓库未变动
    expect(result.stash).toEqual(stash);
  });

  it('sell succeeds for normal consumable', () => {
    const item = getLootItem('consumable.celery');
    expect(item).toBeDefined();
    const stash = addLoot(createDefaultStashState(), item!.id, 1);
    const result = sell(stash, item!, 1);
    expect(result.ok).toBe(true);
  });
});
