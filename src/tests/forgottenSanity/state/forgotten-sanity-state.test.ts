import { describe, it, expect, vi } from 'vitest';
import {
  isStashState,
  isUpgradesState,
  loadStashState,
  loadUpgradesState,
  loadTyped,
  FORGOTTEN_SANITY_STASH_STORAGE_KEY,
  FORGOTTEN_SANITY_UPGRADES_STORAGE_KEY,
} from '../../../forgottenSanity/state/forgottenSanityState';

// 完整 6 tier（用于让现有「要求 6 tier 全到齐」的检查通过，从而把 RED 焦点放到
// 新增的 tier 数值范围检查上）
const FULL_VALID_TIERS = { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0 };

describe('H4: localStorage 数值范围校验', () => {
  it('rejects negative quantity', () => {
    // 注意：必须带 sanity:0，否则当前实现会因 sanity 缺失先返回 false（不是 RED）
    expect(isStashState({ schemaVersion: 1, sanity: 0, items: [{ itemId: 'x', quantity: -1 }] })).toBe(false);
  });
  it('rejects non-integer quantity', () => {
    expect(isStashState({ schemaVersion: 1, sanity: 0, items: [{ itemId: 'x', quantity: 1.5 }] })).toBe(false);
  });
  it('accepts valid quantity 0 and positive integer', () => {
    expect(isStashState({ schemaVersion: 1, sanity: 0, items: [{ itemId: 'x', quantity: 0 }] })).toBe(true);
    expect(isStashState({ schemaVersion: 1, sanity: 0, items: [{ itemId: 'x', quantity: 100 }] })).toBe(true);
  });
  it('rejects upgrades tier out of range', () => {
    // 注意：必须补齐 6 tier，否则当前实现会因 tier 缺失先返回 false（不是 RED）
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: 999 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: 6 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: -1 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, armory: 4 } })).toBe(false);
  });
  it('accepts valid upgrades tiers', () => {
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: 0 } })).toBe(true);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: 5 } })).toBe(true);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, armory: 3 } })).toBe(true);
  });
  it('accepts upgrades with missing tiers (default 0)', () => {
    expect(isUpgradesState({ schemaVersion: 1, tiers: {} })).toBe(true);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: 5 } })).toBe(true);
  });
});

describe('H4: loadStashState fallback on invalid', () => {
  it('returns invalid status when stash has negative quantity', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === FORGOTTEN_SANITY_STASH_STORAGE_KEY
          ? JSON.stringify({ schemaVersion: 1, sanity: 0, items: [{ itemId: 'x', quantity: -100 }] })
          : null,
      setItem: () => {},
      removeItem: () => {},
    });
    const result = loadStashState();
    expect(result.status).toBe('invalid');
    expect(result.state.items).toEqual([]);
    vi.unstubAllGlobals();
  });
  it('returns invalid status when upgrades tier is 999', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === FORGOTTEN_SANITY_UPGRADES_STORAGE_KEY
          ? JSON.stringify({ schemaVersion: 1, tiers: { ...FULL_VALID_TIERS, physique: 999 } })
          : null,
      setItem: () => {},
      removeItem: () => {},
    });
    const result = loadUpgradesState();
    expect(result.status).toBe('invalid');
    vi.unstubAllGlobals();
  });
});

describe('H2: schemaVersion migration framework', () => {
  it('returns version-mismatch when no migration provided', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
      removeItem: () => {},
    });
    const result = loadTyped(
      'test.key',
      1,
      (s): s is { schemaVersion: number; items: unknown[] } =>
        typeof s === 'object' && s !== null && (s as Record<string, unknown>).schemaVersion === 1,
      () => ({ schemaVersion: 1, items: [] }),
    );
    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('version-mismatch');
    vi.unstubAllGlobals();
  });

  it('applies migration when provided', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
      removeItem: () => {},
    });
    const migrations = new Map([
      [0, (s: unknown) => { const obj = s as Record<string, unknown>; return { ...obj, schemaVersion: 1 }; }],
    ]);
    const result = loadTyped(
      'test.key',
      1,
      (s): s is { schemaVersion: number; items: unknown[] } =>
        typeof s === 'object' && s !== null && (s as Record<string, unknown>).schemaVersion === 1,
      () => ({ schemaVersion: 1, items: [] }),
      migrations,
    );
    expect(result.status).toBe('ok');
    expect(result.state.schemaVersion).toBe(1);
    vi.unstubAllGlobals();
  });

  it('returns migration-failed when migration throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
      removeItem: () => {},
    });
    const migrations = new Map([
      [0, () => { throw new Error('migration boom'); }],
    ]);
    const result = loadTyped(
      'test.key',
      1,
      (s): s is { schemaVersion: number; items: unknown[] } =>
        typeof s === 'object' && s !== null && (s as Record<string, unknown>).schemaVersion === 1,
      () => ({ schemaVersion: 1, items: [] }),
      migrations,
    );
    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('migration-failed');
    vi.unstubAllGlobals();
  });

  it('returns migration-failed when migrated state fails validation', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
      removeItem: () => {},
    });
    const migrations = new Map([
      [0, (s: unknown) => s], // 不改 schemaVersion，验证会失败
    ]);
    const result = loadTyped(
      'test.key',
      1,
      (s): s is { schemaVersion: number; items: unknown[] } =>
        typeof s === 'object' && s !== null && (s as Record<string, unknown>).schemaVersion === 1,
      () => ({ schemaVersion: 1, items: [] }),
      migrations,
    );
    expect(result.status).toBe('invalid');
    expect(result.reason).toBe('migration-failed');
    vi.unstubAllGlobals();
  });

  it('existing callers without migrations param still work', () => {
    // 验证 migrations 是可选参数，现有调用方无需改动
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    const result = loadTyped(
      'test.key',
      1,
      (s): s is { schemaVersion: number } => typeof s === 'object' && s !== null,
      () => ({ schemaVersion: 1 }),
    );
    expect(result.status).toBe('ok');
    vi.unstubAllGlobals();
  });
});
