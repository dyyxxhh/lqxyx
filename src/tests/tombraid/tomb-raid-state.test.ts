import { beforeEach, describe, expect, it } from 'vitest';

import { SAVE_STATE_STORAGE_KEY } from '../../state/saveState';
import {
  TOMB_RAID_BEST_STORAGE_KEY,
  TOMB_RAID_PROGRESS_STORAGE_KEY,
  TOMB_RAID_SCHEMA_VERSION,
  TOMB_RAID_STASH_STORAGE_KEY,
  TOMB_RAID_UPGRADES_STORAGE_KEY,
  createDefaultBestState,
  createDefaultProgressState,
  createDefaultStashState,
  createDefaultUpgradesState,
  grantStarterPackIfNeeded,
  loadBestState,
  loadProgressState,
  loadStashState,
  loadUpgradesState,
  saveBestState,
  saveProgressState,
  saveStashState,
  saveUpgradesState,
} from '../../tombraid/state/tombRaidState';

describe('tombRaidState 常量与默认态', () => {
  beforeEach(() => localStorage.clear());

  it('四个 localStorage key 与 schema 版本', () => {
    expect(TOMB_RAID_STASH_STORAGE_KEY).toBe('ying-zhong-jiu.tomb-raid.stash.v1');
    expect(TOMB_RAID_UPGRADES_STORAGE_KEY).toBe('ying-zhong-jiu.tomb-raid.upgrades.v1');
    expect(TOMB_RAID_BEST_STORAGE_KEY).toBe('ying-zhong-jiu.tomb-raid.best.v1');
    expect(TOMB_RAID_PROGRESS_STORAGE_KEY).toBe('ying-zhong-jiu.tomb-raid.progress.v1');
    expect(TOMB_RAID_SCHEMA_VERSION).toBe(1);
  });

  it('默认 stash: schemaVersion 1, sanity 0, items []', () => {
    expect(createDefaultStashState()).toEqual({ schemaVersion: 1, sanity: 0, items: [] });
  });

  it('默认 upgrades: 6 种 tier 全 0', () => {
    expect(createDefaultUpgradesState()).toEqual({
      schemaVersion: 1,
      tiers: { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0 },
    });
  });

  it('默认 best: bestSanity 0', () => {
    expect(createDefaultBestState()).toEqual({ schemaVersion: 1, bestSanity: 0 });
  });

  it('默认 progress: starterPackGranted false', () => {
    expect(createDefaultProgressState()).toEqual({ schemaVersion: 1, starterPackGranted: false });
  });
});

describe('tombRaidState 读写往返', () => {
  beforeEach(() => localStorage.clear());

  it('stash round-trip', () => {
    const state = { schemaVersion: 1, sanity: 250, items: [{ itemId: 'weapon.ruler', quantity: 2 }] };
    saveStashState(state);
    const loaded = loadStashState();
    expect(loaded.status).toBe('valid');
    expect(loaded.state).toEqual(state);
  });

  it('upgrades round-trip', () => {
    const state = {
      schemaVersion: 1,
      tiers: { physique: 3, swift: 1, pickup: 0, sharp: 2, lucky: 0, armory: 1 },
    };
    saveUpgradesState(state);
    expect(loadUpgradesState().state).toEqual(state);
  });

  it('best round-trip', () => {
    saveBestState({ schemaVersion: 1, bestSanity: 900 });
    expect(loadBestState().state).toEqual({ schemaVersion: 1, bestSanity: 900 });
  });

  it('progress round-trip', () => {
    saveProgressState({ schemaVersion: 1, starterPackGranted: true });
    expect(loadProgressState().state).toEqual({ schemaVersion: 1, starterPackGranted: true });
  });

  it('空 key 返回 empty + 默认态', () => {
    expect(loadStashState().status).toBe('empty');
    expect(loadStashState().state).toEqual(createDefaultStashState());
    expect(loadUpgradesState().status).toBe('empty');
    expect(loadBestState().status).toBe('empty');
    expect(loadProgressState().status).toBe('empty');
  });

  it('损坏 JSON 返回 invalid + corrupt-json', () => {
    localStorage.setItem(TOMB_RAID_STASH_STORAGE_KEY, '{not-json');
    const loaded = loadStashState();
    expect(loaded.status).toBe('invalid');
    expect(loaded.status === 'invalid' ? loaded.reason : null).toBe('corrupt-json');
  });

  it('版本不匹配返回 version-mismatch', () => {
    localStorage.setItem(
      TOMB_RAID_STASH_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, sanity: 0, items: [] }),
    );
    const loaded = loadStashState();
    expect(loaded.status).toBe('invalid');
    expect(loaded.status === 'invalid' ? loaded.reason : null).toBe('version-mismatch');
  });

  it('形状无效返回 invalid-shape', () => {
    localStorage.setItem(
      TOMB_RAID_STASH_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, sanity: 'oops', items: [] }),
    );
    const loaded = loadStashState();
    expect(loaded.status).toBe('invalid');
    expect(loaded.status === 'invalid' ? loaded.reason : null).toBe('invalid-shape');
  });
});

describe('grantStarterPackIfNeeded', () => {
  beforeEach(() => localStorage.clear());

  it('首次调用发放 weapon.ruler×1 + consumable.celery×3 并标记 progress', () => {
    const result = grantStarterPackIfNeeded();
    expect(result.granted).toBe(true);
    expect(result.stash.items).toEqual([
      { itemId: 'weapon.ruler', quantity: 1 },
      { itemId: 'consumable.celery', quantity: 3 },
    ]);
    expect(result.progress.starterPackGranted).toBe(true);
    expect(loadProgressState().state.starterPackGranted).toBe(true);
    expect(loadStashState().state.items).toEqual([
      { itemId: 'weapon.ruler', quantity: 1 },
      { itemId: 'consumable.celery', quantity: 3 },
    ]);
  });

  it('二次调用不重复发放', () => {
    grantStarterPackIfNeeded();
    const result = grantStarterPackIfNeeded();
    expect(result.granted).toBe(false);
    expect(result.stash.items).toHaveLength(2);
  });

  it('不污染剧情模式 checkpoint 存档键', () => {
    grantStarterPackIfNeeded();
    expect(localStorage.getItem(SAVE_STATE_STORAGE_KEY)).toBeNull();
  });

  it('已有 stash 时合并数量且保留 sanity', () => {
    saveStashState({ schemaVersion: 1, sanity: 100, items: [{ itemId: 'weapon.ruler', quantity: 1 }] });
    const result = grantStarterPackIfNeeded();
    expect(result.granted).toBe(true);
    const ruler = result.stash.items.find((i) => i.itemId === 'weapon.ruler');
    expect(ruler?.quantity).toBe(2);
    const celery = result.stash.items.find((i) => i.itemId === 'consumable.celery');
    expect(celery?.quantity).toBe(3);
    expect(result.stash.sanity).toBe(100);
  });
});
