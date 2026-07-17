// src/tests/tombraid/loot/integration.test.ts
// Task 7: plan 5 内部模块联动集成冒烟测试（纯 TS，无 Phaser）。
// 联动 LootTable -> Inventory / ChestDecryptState，spec §6.7/§7/§10。
import { describe, expect, it } from 'vitest';

import { getLootItem, type LootItem } from '../../../tombraid/loot/LootItem';
import {
  GILDED_CHEST_LOOT_TABLE,
  NORMAL_CHEST_LOOT_TABLE,
  rollLootTable,
  SILENT_ONE_LOOT_TABLE,
  YANG_YUN_RED_LOOT_TABLE,
} from '../../../tombraid/loot/LootTable';
import { Inventory } from '../../../tombraid/loot/Inventory';
import {
  CHEST_DECRYPT_OPEN_DURATION_MS,
  CHEST_DECRYPT_TOTAL_MS,
  ChestDecryptState,
} from '../../../tombraid/loot/chestDecryptState';

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

describe('integration: silent one drop -> inventory', () => {
  it('roll silent one table and add all drops to inventory', () => {
    const rng = mulberry32(777);
    const inv = new Inventory();
    let dropped = 0;
    for (let i = 0; i < 20; i++) {
      const drops = rollLootTable(SILENT_ONE_LOOT_TABLE, rng);
      for (const item of drops) {
        inv.add(item.id, 1);
        dropped += 1;
      }
    }
    expect(dropped).toBeGreaterThan(0);
    expect(inv.totalSanityValue()).toBeGreaterThan(0);
    // 所有入袋条目都是合法 LootItem
    for (const e of inv.entries()) {
      const item = getLootItem(e.itemId);
      expect(item).toBeDefined();
      expect(e.quantity).toBeGreaterThan(0);
    }
  });

  it('silent one blue drops are all materials', () => {
    const rng = mulberry32(31);
    for (let i = 0; i < 200; i++) {
      const drops = rollLootTable(SILENT_ONE_LOOT_TABLE, rng);
      for (const item of drops) {
        if (item.rarity === 'blue') expect(item.type).toBe('material');
      }
    }
  });
});

describe('integration: chest decrypt -> loot -> inventory', () => {
  it('pre-roll chest loot, drive ChestDecryptState to completion, add loot to inventory', () => {
    const loot = rollLootTable(NORMAL_CHEST_LOOT_TABLE, mulberry32(2024)) as LootItem[];
    expect(loot.length).toBeGreaterThanOrEqual(3);
    expect(loot.length).toBeLessThanOrEqual(5);

    const inv = new Inventory();
    const state = new ChestDecryptState({
      onCompleted: () => {
        for (const item of loot) inv.add(item.id, 1);
      },
    });
    // 推进破译到完成
    state.start();
    state.advance(CHEST_DECRYPT_TOTAL_MS); // -> opening
    state.advance(CHEST_DECRYPT_OPEN_DURATION_MS); // -> completed, onCompleted 触发
    expect(state.snapshot().phase).toBe('completed');

    // 入袋条目数 = loot 中不同 itemId 的数量（同名掉落自动堆叠，spec §10 允许宝箱重复掉落）
    const distinctCount = new Set(loot.map((it) => it.id)).size;
    expect(inv.entries()).toHaveLength(distinctCount);
    // totalSanityValue 等于 loot 之和（少量掉落不触堆叠上限）
    const expected = loot.reduce((s, it) => s + it.sanityValue, 0);
    expect(inv.totalSanityValue()).toBe(expected);
  });

  it('gilded chest pity guarantees a gold+ drop that lands in inventory', () => {
    const loot = rollLootTable(GILDED_CHEST_LOOT_TABLE, mulberry32(99)) as LootItem[];
    const hasGold = loot.some((it) => it.rarity === 'gold' || it.rarity === 'white');
    expect(hasGold).toBe(true);
    // spec §7.4：鎏金宝箱掷 4-5 件（with-replacement，允许同名重复）
    expect(loot.length).toBeGreaterThanOrEqual(4);
    const inv = new Inventory();
    for (const item of loot) inv.add(item.id, 1);
    // 入袋条目数 = loot 中不同 itemId 的数量（同名掉落自动堆叠，spec §10 允许宝箱重复掉落）
    const distinctCount = new Set(loot.map((it) => it.id)).size;
    expect(inv.entries()).toHaveLength(distinctCount);
  });
});

describe('integration: yangYunRed drop -> inventory (spec §10.1)', () => {
  it('rolls 0-4 fragments, each rarity at most once, key not in loot', () => {
    const rng = mulberry32(555);
    const inv = new Inventory();
    for (let i = 0; i < 30; i++) {
      const drops = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
      expect(drops.length).toBeLessThanOrEqual(4);
      const rarities = drops.map((it) => it.rarity);
      expect(new Set(rarities).size).toBe(rarities.length);
      for (const item of drops) inv.add(item.id, 1);
    }
    // 钥匙不在 LootTable 中（由调用方单独发放），本测试只验证碎片
    expect(inv.has('treasure.vaultKey')).toBe(false);
  });
});

describe('integration: relic non-stacking with chest loot', () => {
  it('two blueEdgeHeadband from different chests activate once', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 1);
    inv.add('relic.blueEdgeHeadband', 1);
    expect(inv.quantity('relic.blueEdgeHeadband')).toBe(2);
    expect(inv.activeRelics()).toEqual(['relic.blueEdgeHeadband']);
    // totalSanityValue 仍按数量累加（仓库价值），但效果只激活一次
    expect(inv.totalSanityValue()).toBe(400); // 200 * 2
  });
});

describe('integration: consumable stack limit with tornSchoolbag', () => {
  it('without tornSchoolbag caps celery at 10', () => {
    const inv = new Inventory();
    inv.add('consumable.celery', 50);
    expect(inv.quantity('consumable.celery')).toBe(10);
  });

  it('with tornSchoolbag caps celery at 15', () => {
    const inv = new Inventory({ isTornSchoolbagActive: () => true });
    inv.add('consumable.celery', 50);
    expect(inv.quantity('consumable.celery')).toBe(15);
  });

  it('overflow from chest drops is discarded silently', () => {
    const inv = new Inventory();
    inv.add('consumable.celery', 10); // 满
    const r = inv.add('consumable.celery', 5); // 模拟宝箱掉落
    expect(inv.quantity('consumable.celery')).toBe(10);
    expect(r.added).toBe(0);
    expect(r.overflow).toBe(5);
  });
});

describe('integration: end-to-end smoke (multi-seed)', () => {
  it('100 seeds: roll chest, add to inventory, sanityValue consistent', () => {
    for (let s = 1; s <= 100; s++) {
      const loot = rollLootTable(NORMAL_CHEST_LOOT_TABLE, mulberry32(s)) as LootItem[];
      const inv = new Inventory();
      for (const item of loot) inv.add(item.id, 1);
      const expected = loot.reduce((sum, it) => sum + it.sanityValue, 0);
      // 注意：消耗品可能因上限被截断，但宝箱每次只掉 1 件同类，不会触发上限
      expect(inv.totalSanityValue()).toBe(expected);
    }
  });
});
