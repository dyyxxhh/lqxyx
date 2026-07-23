// src/forgottenSanity/loot/LootTable.ts
// 4 张掉率表 + rollLootTable 纯函数（single/independent/multiPick + 白阶70% + 保底）。
// 纯 TS，无 Phaser import。spec §6.7/§7.4/§10，plan 5 Task 2。
import {
  ALL_LOOT,
  getLootItem,
  LOOT_RARITY_ORDER,
  type LootItem,
  type LootRarity,
  type LootType,
} from './LootItem';

export type LootRollMode = 'single' | 'independent' | 'multiPick';

export interface LootTableEntry {
  readonly rarity: LootRarity;
  readonly weight: number; // single/multiPick: 权重；independent: [0,100) 阈值（itemCount 缺省时）或权重（itemCount 设定时）
  readonly allowedTypes: readonly LootType[];
}

export interface LootTable {
  readonly id: string;
  readonly rollMode: LootRollMode;
  readonly entries: readonly LootTableEntry[];
  readonly noneWeight?: number; // single 模式空掉落权重
  readonly itemCount?: { readonly min: number; readonly max: number }; // multiPick / independent-with-pick 模式掷骰次数
  readonly pityRarity?: LootRarity; // multiPick / independent-with-pick 模式保底稀有度
}

export const WHITE_BLANK_DIPLOMA_RATE = 0.7;

/**
 * 普通缄默者掉落表（single 模式，含 none）。
 * 蓝阶仅材料；紫阶含消耗品/遗物/材料/宝物；绿阶含消耗品/遗物/武器/宝物；金阶全类型；白阶全类型。
 */
export const SILENT_ONE_LOOT_TABLE: LootTable = {
  id: 'silent-one',
  rollMode: 'single',
  noneWeight: 2,
  entries: [
    { rarity: 'blue', weight: 70, allowedTypes: ['material'] },
    {
      rarity: 'purple',
      weight: 18,
      allowedTypes: ['consumable', 'relic', 'material', 'treasure'],
    },
    {
      rarity: 'green',
      weight: 8,
      allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'],
    },
    {
      rarity: 'gold',
      weight: 1.5,
      allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'],
    },
    {
      rarity: 'white',
      weight: 0.5,
      allowedTypes: ['treasure', 'weapon', 'relic'],
    },
  ],
};

/**
 * 杨云红边精英掉落表（independent 模式，spec §10.1）。
 * 钥匙不在本表中，由调用方（CombatManager）单独发放。
 * 紫阶=消耗品 / 绿阶=遗物 / 金阶=武器 / 白阶=宝物，每个稀有度独立掷骰。
 */
export const YANG_YUN_RED_LOOT_TABLE: LootTable = {
  id: 'yang-yun-red',
  rollMode: 'independent',
  entries: [
    { rarity: 'purple', weight: 50, allowedTypes: ['consumable'] },
    { rarity: 'green', weight: 30, allowedTypes: ['relic'] },
    { rarity: 'gold', weight: 8, allowedTypes: ['weapon'] },
    { rarity: 'white', weight: 2, allowedTypes: ['treasure'] },
  ],
};

/**
 * 普通宝箱掉落表（independent + itemCount + pity，spec §7.4）。
 * itemCount 决定掷 1-5 件；pityRarity='green' 保底至少一件绿阶+。
 */
export const NORMAL_CHEST_LOOT_TABLE: LootTable = {
  id: 'normal-chest',
  rollMode: 'independent',
  itemCount: { min: 1, max: 5 },
  pityRarity: 'green',
  entries: [
    { rarity: 'blue', weight: 30, allowedTypes: ['material'] },
    { rarity: 'purple', weight: 30, allowedTypes: ['consumable', 'relic', 'material', 'treasure'] },
    { rarity: 'green', weight: 100, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'gold', weight: 15, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'white', weight: 2, allowedTypes: ['treasure', 'weapon', 'relic'] },
  ],
};

/**
 * 鎏金宝箱掉落表（independent + itemCount + pity，spec §7.4）。
 * itemCount 决定掷 1-5 件；pityRarity='gold' 保底至少一件金阶+。
 */
export const GILDED_CHEST_LOOT_TABLE: LootTable = {
  id: 'gilded-chest',
  rollMode: 'independent',
  itemCount: { min: 1, max: 5 },
  pityRarity: 'gold',
  entries: [
    { rarity: 'blue', weight: 30, allowedTypes: ['material'] },
    { rarity: 'purple', weight: 50, allowedTypes: ['consumable', 'relic', 'material', 'treasure'] },
    { rarity: 'green', weight: 70, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'gold', weight: 100, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'white', weight: 15, allowedTypes: ['treasure', 'weapon', 'relic'] },
  ],
};

export function rollLootTable(table: LootTable, rng: () => number): readonly LootItem[] {
  switch (table.rollMode) {
    case 'single':
      return rollSingle(table, rng);
    case 'independent':
      return rollIndependent(table, rng);
    case 'multiPick':
      return rollMultiPick(table, rng);
  }
}

function rollSingle(table: LootTable, rng: () => number): LootItem[] {
  const none = table.noneWeight ?? 0;
  const total = table.entries.reduce((s, e) => s + e.weight, 0) + none;
  const r = rng() * total;
  if (r < none) return [];
  let acc = none;
  for (const e of table.entries) {
    acc += e.weight;
    if (r < acc) return [pickItem(e, rng)];
  }
  return [];
}

/**
 * independent 模式两种语义：
 * - itemCount 缺省（YANG_YUN_RED）：对每条 entry 独立掷骰 rng*100<weight，返回 0..N 件（每稀有度至多一件）
 * - itemCount 设定（NORMAL/GILDED_CHEST）：按 itemCount 抽 N 件（权重加权），最后应用 pity
 */
function rollIndependent(table: LootTable, rng: () => number): LootItem[] {
  if (table.itemCount !== undefined) {
    return rollWeightedMultiPick(table, rng);
  }
  const out: LootItem[] = [];
  for (const e of table.entries) {
    if (rng() * 100 < e.weight) out.push(pickItem(e, rng));
  }
  return out;
}

function rollMultiPick(table: LootTable, rng: () => number): LootItem[] {
  return rollWeightedMultiPick(table, rng);
}

function rollWeightedMultiPick(table: LootTable, rng: () => number): LootItem[] {
  const range = table.itemCount ?? { min: 1, max: 1 };
  const count = range.min + Math.floor(rng() * (range.max - range.min + 1));
  const out: LootItem[] = [];
  for (let i = 0; i < count; i++) {
    const e = pickWeightedEntry(table.entries, rng);
    out.push(pickItem(e, rng));
  }
  if (table.pityRarity !== undefined) {
    applyPity(out, table.pityRarity, table.entries, rng);
  }
  return out;
}

function pickWeightedEntry(entries: readonly LootTableEntry[], rng: () => number): LootTableEntry {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return pickFromFallback(entries, rng);
}

function pickFromFallback<T>(arr: readonly T[], rng: () => number): T {
  if (arr.length === 0) {
    throw new Error('LootTable fallback empty: no candidates for rarity');
  }
  return arr[Math.floor(rng() * arr.length)] as T;
}

function pickItem(entry: LootTableEntry, rng: () => number): LootItem {
  // 白阶 70% 无字毕业证规则（spec §6.7）
  if (entry.rarity === 'white') {
    if (rng() < WHITE_BLANK_DIPLOMA_RATE) {
      const blank = getLootItem('treasure.blankDiploma');
      if (blank) return blank;
    }
    const others = ALL_LOOT.filter(
      (it) => it.rarity === 'white' && it.id !== 'treasure.blankDiploma' && entry.allowedTypes.includes(it.type),
    );
    if (others.length > 0) return pickFromFallback(others, rng);
    // allowedTypes 过窄时回退
    const fallback = getLootItem('treasure.blankDiploma');
    if (fallback) return fallback;
  }

  const candidates = ALL_LOOT.filter(
    (it) => it.rarity === entry.rarity && entry.allowedTypes.includes(it.type),
  );
  if (candidates.length === 0) {
    // allowedTypes 过窄：回退到该稀有度全部
    const fallback = ALL_LOOT.filter((it) => it.rarity === entry.rarity);
    return pickFromFallback(fallback, rng);
  }
  return pickFromFallback(candidates, rng);
}

function applyPity(
  out: LootItem[],
  pityRarity: LootRarity,
  entries: readonly LootTableEntry[],
  rng: () => number,
): void {
  if (out.length === 0) return;
  const threshold = LOOT_RARITY_ORDER.indexOf(pityRarity);
  const hasPity = out.some((it) => LOOT_RARITY_ORDER.indexOf(it.rarity) >= threshold);
  if (hasPity) return;
  // 将第一件升级为保底稀有度
  const pityEntry = entries.find((e) => e.rarity === pityRarity);
  if (pityEntry !== undefined) {
    out[0] = pickItem(pityEntry, rng);
  }
}
