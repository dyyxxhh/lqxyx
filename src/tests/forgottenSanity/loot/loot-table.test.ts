import { describe, expect, it } from 'vitest';

import { getLootItem, LOOT_RARITY_ORDER, type LootItem, type LootRarity } from '../../../forgottenSanity/loot/LootItem';
import {
  GILDED_CHEST_LOOT_TABLE,
  NORMAL_CHEST_LOOT_TABLE,
  rollLootTable,
  SILENT_ONE_LOOT_TABLE,
  WHITE_BLANK_DIPLOMA_RATE,
  YANG_YUN_RED_LOOT_TABLE,
  type LootTable,
} from '../../../forgottenSanity/loot/LootTable';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('LootTable definitions (spec §10)', () => {
  it('SILENT_ONE uses single mode with none weight', () => {
    expect(SILENT_ONE_LOOT_TABLE.rollMode).toBe('single');
    expect(SILENT_ONE_LOOT_TABLE.noneWeight).toBeGreaterThan(0);
  });

  it('YANG_YUN_RED uses independent mode (spec §10.1)', () => {
    expect(YANG_YUN_RED_LOOT_TABLE.rollMode).toBe('independent');
    const rarities = YANG_YUN_RED_LOOT_TABLE.entries.map((e) => e.rarity);
    expect(rarities).toEqual(['purple', 'green', 'gold', 'white']);
    // 每个稀有度单一 allowedType
    expect(YANG_YUN_RED_LOOT_TABLE.entries[0]?.allowedTypes).toEqual(['consumable']);
    expect(YANG_YUN_RED_LOOT_TABLE.entries[1]?.allowedTypes).toEqual(['relic']);
    expect(YANG_YUN_RED_LOOT_TABLE.entries[2]?.allowedTypes).toEqual(['weapon']);
    expect(YANG_YUN_RED_LOOT_TABLE.entries[3]?.allowedTypes).toEqual(['treasure']);
  });

  it('NORMAL_CHEST uses independent mode (spec §7.4)', () => {
    expect(NORMAL_CHEST_LOOT_TABLE.rollMode).toBe('independent');
    expect(NORMAL_CHEST_LOOT_TABLE.entries[0]?.weight).toBe(30); // blue 30%
    expect(NORMAL_CHEST_LOOT_TABLE.entries[2]?.weight).toBe(100); // green 100%
  });

  it('GILDED_CHEST uses independent mode (spec §7.4)', () => {
    expect(GILDED_CHEST_LOOT_TABLE.rollMode).toBe('independent');
    expect(GILDED_CHEST_LOOT_TABLE.entries[3]?.weight).toBe(100); // gold 100%
    expect(GILDED_CHEST_LOOT_TABLE.entries[4]?.weight).toBe(15); // white 15%
  });
});

describe('rollLootTable single mode (silent one)', () => {
  it('returns 0 or 1 item', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(SILENT_ONE_LOOT_TABLE, rng);
      expect(r.length).toBeLessThanOrEqual(1);
    }
  });

  it('can return empty (none weight)', () => {
    // 用一系列种子找到至少一个空结果
    let sawEmpty = false;
    for (let s = 1; s < 200 && !sawEmpty; s++) {
      const r = rollLootTable(SILENT_ONE_LOOT_TABLE, mulberry32(s));
      if (r.length === 0) sawEmpty = true;
    }
    expect(sawEmpty).toBe(true);
  });

  it('returned item has rarity in table entries', () => {
    const rng = mulberry32(42);
    const validRarities = SILENT_ONE_LOOT_TABLE.entries.map((e) => e.rarity);
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(SILENT_ONE_LOOT_TABLE, rng);
      for (const it of r) {
        expect(validRarities).toContain(it.rarity);
      }
    }
  });
});

describe('rollLootTable independent mode (yangYunRed)', () => {
  it('returns 0-4 items, each rarity at most once', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
      expect(r.length).toBeLessThanOrEqual(4);
      const rarities = r.map((it) => it.rarity);
      expect(new Set(rarities).size).toBe(rarities.length);
    }
  });

  it('each dropped item matches its entry allowedType', () => {
    const rng = mulberry32(99);
    const typeByRarity: Record<string, string> = {
      purple: 'consumable',
      green: 'relic',
      gold: 'weapon',
      white: 'treasure',
    };
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
      for (const it of r) {
        expect(it.type).toBe(typeByRarity[it.rarity]);
      }
    }
  });

  it('with all-low rng never drops (all rolls miss 50/30/8/2 thresholds)', () => {
    let v = 0.999;
    const rng = () => {
      v = Math.max(0, v - 0.0001);
      return v;
    };
    const r = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
    // 所有 rng 都 > 阈值百分比/100，无掉落
    expect(r).toHaveLength(0);
  });
});

describe('rollLootTable multiPick mode (chests)', () => {
  it('normal chest returns 3-5 items', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(NORMAL_CHEST_LOOT_TABLE, rng);
      expect(r.length).toBeGreaterThanOrEqual(3);
      expect(r.length).toBeLessThanOrEqual(5);
    }
  });

  it('gilded chest returns 4-5 items', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const r = rollLootTable(GILDED_CHEST_LOOT_TABLE, rng);
      expect(r.length).toBeGreaterThanOrEqual(4);
      expect(r.length).toBeLessThanOrEqual(5);
    }
  });

  it('normal chest pity guarantees at least one green+ item', () => {
    const greenIdx = LOOT_RARITY_ORDER.indexOf('green');
    const rng = mulberry32(11);
    for (let i = 0; i < 100; i++) {
      const r = rollLootTable(NORMAL_CHEST_LOOT_TABLE, rng);
      const hasPity = r.some((it) => LOOT_RARITY_ORDER.indexOf(it.rarity) >= greenIdx);
      expect(hasPity).toBe(true);
    }
  });

  it('gilded chest pity guarantees at least one gold+ item', () => {
    const goldIdx = LOOT_RARITY_ORDER.indexOf('gold');
    const rng = mulberry32(13);
    for (let i = 0; i < 100; i++) {
      const r = rollLootTable(GILDED_CHEST_LOOT_TABLE, rng);
      const hasPity = r.some((it) => LOOT_RARITY_ORDER.indexOf(it.rarity) >= goldIdx);
      expect(hasPity).toBe(true);
    }
  });
});

describe('white 70% blankDiploma rule (spec §6.7)', () => {
  it('WHITE_BLANK_DIPLOMA_RATE = 0.7', () => {
    expect(WHITE_BLANK_DIPLOMA_RATE).toBe(0.7);
  });

  it('approximately 70% of white drops are blankDiploma', () => {
    // 构造一张只掉白阶的表
    const whiteOnly: LootTable = {
      id: 'test.white-only',
      rollMode: 'single',
      noneWeight: 0,
      entries: [{ rarity: 'white', weight: 100, allowedTypes: ['treasure', 'weapon', 'relic'] }],
    };
    const rng = mulberry32(2024);
    let whiteCount = 0;
    let blankCount = 0;
    for (let i = 0; i < 5000; i++) {
      const r = rollLootTable(whiteOnly, rng);
      if (r.length === 1 && r[0]!.rarity === 'white') {
        whiteCount += 1;
        if (r[0]!.id === 'treasure.blankDiploma') blankCount += 1;
      }
    }
    expect(whiteCount).toBe(5000);
    const rate = blankCount / whiteCount;
    expect(rate).toBeGreaterThan(0.65);
    expect(rate).toBeLessThan(0.75);
  });
});

describe('rollLootTable purity', () => {
  it('same seed produces same result', () => {
    const t1 = rollLootTable(NORMAL_CHEST_LOOT_TABLE, mulberry32(123));
    const t2 = rollLootTable(NORMAL_CHEST_LOOT_TABLE, mulberry32(123));
    expect(t1.map((it) => it.id)).toEqual(t2.map((it) => it.id));
  });
});

// Static type asserts
function _compileTimeAssert(item: LootItem, rarity: LootRarity): void {
  void item;
  void rarity;
}
void _compileTimeAssert;
void getLootItem;
