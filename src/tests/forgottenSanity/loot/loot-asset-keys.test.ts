// src/tests/forgottenSanity/loot/loot-asset-keys.test.ts
// Task 6: lootAssetKeys — itemId→spriteKey 解析 + manifest 交叉验证。
import { describe, expect, it } from 'vitest';

import { assetManifest } from '../../../data/assets';
import { ALL_LOOT } from '../../../forgottenSanity/loot/LootItem';
import {
  LOOT_SPRITE_KEY_MAP,
  lootSpriteKeyFor,
  validateLootSpriteKeys,
} from '../../../forgottenSanity/loot/lootAssetKeys';

describe('lootSpriteKeyFor resolver', () => {
  it('resolves material.chalkStub -> loot.粉笔头', () => {
    expect(lootSpriteKeyFor('material.chalkStub')).toBe('loot.粉笔头');
  });

  it('resolves weapon.ruler -> loot.尺子', () => {
    expect(lootSpriteKeyFor('weapon.ruler')).toBe('loot.尺子');
  });

  it('resolves weapon.soulBanner -> loot.万魂幡', () => {
    expect(lootSpriteKeyFor('weapon.soulBanner')).toBe('loot.万魂幡');
  });

  it('resolves consumable.celery -> loot.芹菜', () => {
    expect(lootSpriteKeyFor('consumable.celery')).toBe('loot.芹菜');
  });

  it('resolves relic.blackGraduationPhoto -> loot.黑色毕业照', () => {
    expect(lootSpriteKeyFor('relic.blackGraduationPhoto')).toBe('loot.黑色毕业照');
  });

  it('returns undefined for unknown itemId', () => {
    expect(lootSpriteKeyFor('material.nonexistent')).toBeUndefined();
  });

  it('LOOT_SPRITE_KEY_MAP has exactly 48 entries (one per spec §6 item)', () => {
    expect(LOOT_SPRITE_KEY_MAP.size).toBe(48);
  });
});

describe('validateLootSpriteKeys cross-validation with assetManifest', () => {
  it('every ALL_LOOT item spriteKey exists in assetManifest', () => {
    const failures = validateLootSpriteKeys();
    expect(failures).toEqual([]);
  });

  it('every LootItem.spriteKey matches lootSpriteKeyFor(itemId)', () => {
    for (const it of ALL_LOOT) {
      expect(it.spriteKey).toBe(lootSpriteKeyFor(it.id));
    }
  });

  it('manifest contains all 48 spec §6 loot sprite keys', () => {
    const manifestKeys = new Set(assetManifest.map((a) => a.key));
    for (const it of ALL_LOOT) {
      expect(manifestKeys.has(it.spriteKey)).toBe(true);
    }
  });

  it('manifest has 52 loot.* entries (48 spec + 4 non-§6 plan 4 weapons)', () => {
    const lootEntries = assetManifest.filter((a) => a.key.startsWith('loot.'));
    expect(lootEntries).toHaveLength(52);
  });
});
