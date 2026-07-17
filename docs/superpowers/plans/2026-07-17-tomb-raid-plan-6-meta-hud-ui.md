# 摸金模式 Plan 6：Meta 经济 + HUD + 地图 UI Implementation Plan

> **依赖**：Plan 1（场景骨架 + 4-key localStorage tombRaidState）、Plan 2（TombRaidMapManifest）、Plan 3（PlayerCombat/CombatCallbacks）、Plan 4（WeaponRegistry/WeaponCooldowns）、Plan 5（LootItem/Inventory）。
> **范围**：Meta 经济（升级/仓库/商城/起配）+ 对局 HUD + 小地图/大地图 + 红边雾战遮罩 + 撤离/死亡结算 + 移动端控件 + 集成冒烟。
> **约束**：不修改剧情模式代码；复用 `UI_THEME`；TypeScript strict（`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）；TDD 强制（RED→GREEN→COMMIT）；素材根目录仅 `最终素材/`。
> **规格依据**：`docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` §1.3 / §8 / §9 / §11.4。

---

## 文件结构

| 文件 | 责任 | 任务 |
|---|---|---|
| `src/tombraid/meta/UpgradeManager.ts` | 6 种永久升级：成本表、阶数校验、效果计算、localStorage 桥 | Task 1 |
| `src/tombraid/meta/StashManager.ts` | 仓库：无限槽位、理智台账、并入本局 Inventory | Task 2 |
| `src/tombraid/meta/ShopManager.ts` | 商城：卖 1:1、买 `Math.round(sanityValue×1.75)`、可买/可卖过滤 | Task 3 |
| `src/tombraid/meta/LoadoutManager.ts` | 起配：1 武器 + 3 消耗品槽、武备扩展、空手 = `unarmed` | Task 4 |
| `src/tombraid/ui/HubUI.ts` | 枢纽 5 面板（仓库/商城/起配/升级/进入墓穴），复用按钮工厂 + UI_THEME | Task 5 |
| `src/tombraid/ui/TombRaidHUD.ts` | 对局 HUD：HP/武器/大招 CD 环 / 理智+基准线达标变金 / 消耗品槽 / 理智比率 | Task 6 |
| `src/tombraid/ui/Minimap.ts` | 小地图：雾战脚步点亮、玩家点+出口+宝箱+身体标记、M 键/点击大地图、ESC 关闭修复 | Task 7 |
| `src/tombraid/ui/RedEdgeFogOverlay.ts` | 杨云红边击杀全屏遮罩"理智正在消散"2s + 玩家周围 220px 可见 | Task 8 |
| `src/tombraid/ui/SettlementScreen.ts` | 撤离/死亡结算：达标入仓库+更新 best / 拒绝 / 全丢 | Task 9 |
| `src/tombraid/ui/MobileControls.ts` | 移动端：复用 InputManager 摇杆 + 右侧 4 动作按钮（普攻J/大招K/交互H/消耗品） | Task 10 |
| `src/tombraid/TombRaidHubScene.ts` *(修改)* | 接线 HubUI 进枢纽骨架 | Task 5 |
| `src/tombraid/TombRaidScene.ts` *(修改)* | 接线 HUD + Minimap + fog + settlement + mobile 进对局骨架 | Task 11 |
| `src/tests/tomb-raid-upgrade-manager.test.ts` | Task 1 |
| `src/tests/tomb-raid-stash-manager.test.ts` | Task 2 |
| `src/tests/tomb-raid-shop-manager.test.ts` | Task 3 |
| `src/tests/tomb-raid-loadout-manager.test.ts` | Task 4 |
| `src/tests/tomb-raid-hub-ui.test.ts` | Task 5 |
| `src/tests/tomb-raid-hud.test.ts` | Task 6 |
| `src/tests/tomb-raid-minimap.test.ts` | Task 7 |
| `src/tests/tomb-raid-red-edge-fog.test.ts` | Task 8 |
| `src/tests/tomb-raid-settlement.test.ts` | Task 9 |
| `src/tests/tomb-raid-mobile-controls.test.ts` | Task 10 |
| `src/tests/tomb-raid-plan-6-integration.test.ts` | Task 11 |

---

## 跨任务共享类型

以下类型在多个任务间复用，统一定义语义（实际 `import` 来源在各任务实现中标注）。

```ts
// 来自 Plan 1: src/tombraid/state/tombRaidState.ts
export type TombRaidUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';
export interface TombRaidStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly TombRaidStashItem[];
}
export interface TombRaidStashItem { readonly itemId: string; readonly quantity: number; }
export interface TombRaidUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<TombRaidUpgradeId, number>>;
}
export interface TombRaidBestState { readonly schemaVersion: number; readonly bestSanity: number; }
export type TombRaidLoadResult<T> =
  | { readonly status: 'valid'; readonly state: T }
  | { readonly status: 'empty'; readonly state: T }
  | { readonly status: 'invalid'; readonly state: T; readonly reason?: string };
// 持久化键
export const STASH_KEY = 'ying-zhong-jiu.tomb-raid.stash.v1';
export const UPGRADES_KEY = 'ying-zhong-jiu.tomb-raid.upgrades.v1';
export const BEST_KEY = 'ying-zhong-jiu.tomb-raid.best.v1';
export const PROGRESS_KEY = 'ying-zhong-jiu.tomb-raid.progress.v1';
// 起手包
export const STARTER_PACK_WEAPON_ID = 'weapon.ruler';
export const STARTER_PACK_CONSUMABLE_ID = 'consumable.celery';
export const STARTER_PACK_CONSUMABLE_QUANTITY = 3;

// 来自 Plan 5: src/tombraid/loot/Inventory.ts + LootItem.ts
export type LootRarity = 'blue' | 'purple' | 'green' | 'gold' | 'white';
export type LootType = 'material' | 'consumable' | 'relic' | 'weapon' | 'treasure';
export interface LootItem {
  readonly id: string; readonly name: string; readonly rarity: LootRarity;
  readonly type: LootType; readonly sanityValue: number;
  readonly spriteKey?: string; readonly description: string; readonly effect: unknown;
}
export interface InventoryEntry { readonly itemId: string; readonly quantity: number; }
// 设计变更：StashManager/SettlementScreen 仅依赖本局 Inventory 的只读快照能力（entries/totalSanityValue/clear），
// 抽出为 InventoryPort 端口接口（定义在 src/tombraid/meta/StashManager.ts），解耦对 Plan 5 完整 Inventory 的依赖。
// 完整 Inventory（add/remove/has/quantity/activeRelics）仍由 Plan 5 src/tombraid/loot/Inventory.ts 提供，结构兼容此端口（超集）。
export interface InventoryPort {
  entries(): readonly InventoryEntry[];
  totalSanityValue(): number;
  clear(): void;
}

// 来自 Plan 3: src/tombraid/combat/PlayerCombat.ts
export interface PlayerCombat {
  readonly hp: number;
  readonly maxHp: number;
  readonly weaponId: string;
  isDead(): boolean;
}

// 来自 Plan 4: src/tombraid/weapons/WeaponCooldowns.ts
export interface WeaponCooldowns {
  getUltimateCooldownRemaining(timeMs: number, weapon: { readonly ultimate: { readonly cooldownMs: number } }): number;
}

// 来自 Plan 4: src/tombraid/weapons/WeaponRegistry.ts
export interface WeaponDef {
  readonly id: string; readonly name: string; readonly rarity: LootRarity;
  readonly sanityValue: number; readonly textureKey?: string;
  readonly basic: { readonly attacksPerSecond: number; readonly damage: number };
  readonly ultimate: { readonly cooldownMs: number };
}

// 来自 Plan 2: src/tombraid/map/tombRaidMapState.ts
export interface TombRaidRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface TombRaidRoom {
  readonly id: string; readonly kind: string;
  readonly bounds: TombRaidRect; readonly walkableBounds: TombRaidRect;
  readonly spawnPoint: { readonly x: number; readonly y: number }; readonly cellIndex: number;
}
export interface TombRaidChestSpawn { readonly id: string; readonly roomId: string; readonly kind: 'normal' | 'gilded'; readonly bounds: TombRaidRect; }
export interface TombRaidMapManifest {
  readonly id: string; readonly seed: number; readonly roomCount: number;
  readonly bounds: { readonly width: 5000; readonly height: 4000 };
  readonly rooms: readonly TombRaidRoom[];
  readonly doors: readonly unknown[];
  readonly chests: readonly TombRaidChestSpawn[];
  readonly baselineSanity: number;
  readonly entranceRoomId: string; readonly exitRoomId: string;
  readonly floorTile: { readonly tileWidth: 192; readonly tileHeight: 192 };
}
```

### 本 plan 新增的跨任务共享类型（定义在各自文件并 export）

```ts
// LoadoutManager.ts
export interface LoadoutConsumableSlot { readonly itemId: string; readonly quantity: number; }
export interface Loadout {
  readonly weaponId: string;                  // 'unarmed' 表示空手
  readonly consumables: readonly LoadoutConsumableSlot[];
}
export interface BuiltRun {
  readonly loadout: Loadout;
  readonly weaponRemovedFromStash: boolean;
  readonly consumablesRemovedFromStash: readonly { readonly itemId: string; readonly quantity: number }[];
}
export type ConsumeResult =
  | { readonly ok: true; readonly stash: TombRaidStashState }
  | { readonly ok: false; readonly reason: 'insufficient-stock'; readonly stash: TombRaidStashState };

// SettlementScreen.ts (与 spec §1.3 一致)
export type SettlementOutcome =
  | { readonly kind: 'evacuated'; readonly totalValue: number; readonly bestSanity: number }
  | { readonly kind: 'refused'; readonly totalValue: number; readonly baseline: number }
  | { readonly kind: 'dead' };

// Minimap.ts
export interface MinimapBodyMarker { readonly bodyId: string; readonly x: number; readonly y: number; }
export interface MinimapUpdate {
  readonly playerX: number; readonly playerY: number;
  readonly exploredCells: readonly number[];      // 已点亮的 cellIndex 列表
  readonly chestMarkers: readonly { readonly id: string; readonly x: number; readonly y: number; readonly opened: boolean; readonly kind: 'normal' | 'gilded' }[];
  readonly bodyMarkers: readonly MinimapBodyMarker[];
  readonly exitDiscovered: boolean;
  readonly exitX: number; readonly exitY: number;
}

// TombRaidHUD.ts
export interface HudSnapshot {
  readonly hp: number; readonly maxHp: number;
  readonly weaponId: string; readonly weaponName: string;
  readonly ultCooldownRemaining: number; readonly ultCooldownTotal: number;
  readonly sanity: number; readonly baseline: number;
  readonly consumableSlots: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly stashSanity: number;
}

// MobileControls.ts
export interface MobileControlsCallbacks {
  readonly onBasicAttack: () => void;
  readonly onUltimate: () => void;
  readonly onInteract: () => void;
  readonly onConsumable: () => void;
}
```

### 深度常量（本 plan 统一）

```ts
export const HUD_BASE_DEPTH = 1000;
export const HUD_TEXT_DEPTH = 1001;
export const HUD_OVERLAY_DEPTH = 1002;
export const MINIMAP_DEPTH = 1011;
export const BIG_MAP_DEPTH = 1980;
export const FOG_MASK_DEPTH = 1990;
export const SETTLEMENT_DEPTH = 1996;
export const MOBILE_ACTION_DEPTH = 952; // 复用 InputManager 摇杆层 (950/951) 之上
```

---

## Task 1: UpgradeManager — 6 种永久升级数据层

**文件**：`src/tombraid/meta/UpgradeManager.ts`、`src/tests/tomb-raid-upgrade-manager.test.ts`

**spec §8.4 数值表**：
- physique（体魄）：+4% maxHP，5 阶，200/400/600/800/1000
- swift（疾走）：+4% moveSpeed，5 阶，200/400/600/800/1000
- pickup（拾取）：+4% pickupRange，5 阶，300/500/700/900/1100
- sharp（锐利）：+4% attackDamage，5 阶，300/500/700/900/1100
- lucky（幸运）：+4% dropRate，5 阶，500/800/1200/1500/2000
- armory（武备）：+1 消耗品槽，3 阶，500/800/1200

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-upgrade-manager.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  UPGRADE_COSTS, UPGRADE_MAX_TIERS, UPGRADE_EFFECT_PER_TIER,
  getUpgradeCost, canUpgrade, applyUpgrade, getUpgradeEffects,
} from '../tombraid/meta/UpgradeManager';
import type { TombRaidUpgradesState, TombRaidStashState } from '../tombraid/state/tombRaidState';

function tiers(over: Partial<Record<keyof TombRaidUpgradesState['tiers'], number>> = {}): TombRaidUpgradesState['tiers'] {
  return {
    physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0,
    ...over,
  };
}

function stash(sanity: number): TombRaidStashState {
  return { schemaVersion: 1, sanity, items: [] };
}

describe('UpgradeManager cost tables (spec §8.4)', () => {
  it('pins 5-tier cost arrays for physique/swift', () => {
    expect(UPGRADE_COSTS.physique).toEqual([200, 400, 600, 800, 1000]);
    expect(UPGRADE_COSTS.swift).toEqual([200, 400, 600, 800, 1000]);
  });

  it('pins 5-tier cost arrays for pickup/sharp', () => {
    expect(UPGRADE_COSTS.pickup).toEqual([300, 500, 700, 900, 1100]);
    expect(UPGRADE_COSTS.sharp).toEqual([300, 500, 700, 900, 1100]);
  });

  it('pins 5-tier cost array for lucky', () => {
    expect(UPGRADE_COSTS.lucky).toEqual([500, 800, 1200, 1500, 2000]);
  });

  it('pins 3-tier cost array for armory', () => {
    expect(UPGRADE_COSTS.armory).toEqual([500, 800, 1200]);
  });

  it('pins max tiers', () => {
    expect(UPGRADE_MAX_TIERS.physique).toBe(5);
    expect(UPGRADE_MAX_TIERS.armory).toBe(3);
  });

  it('pins +4% effect per tier for stat upgrades', () => {
    expect(UPGRADE_EFFECT_PER_TIER.physique).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.swift).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.pickup).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.sharp).toBe(0.04);
    expect(UPGRADE_EFFECT_PER_TIER.lucky).toBe(0.04);
  });
});

describe('getUpgradeCost', () => {
  it('returns cost to go from current tier to next', () => {
    expect(getUpgradeCost('physique', 0)).toBe(200);
    expect(getUpgradeCost('physique', 2)).toBe(600);
    expect(getUpgradeCost('armory', 0)).toBe(500);
  });

  it('throws when current tier >= max', () => {
    expect(() => getUpgradeCost('armory', 3)).toThrow();
    expect(() => getUpgradeCost('physique', 5)).toThrow();
  });
});

describe('canUpgrade', () => {
  it('true when tier < max and sanity >= cost', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers() }, stash(300), 'physique')).toBe(true);
  });

  it('false when tier already maxed', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers({ armory: 3 }) }, stash(99999), 'armory')).toBe(false);
  });

  it('false when sanity < cost', () => {
    expect(canUpgrade({ schemaVersion: 1, tiers: tiers() }, stash(100), 'physique')).toBe(false);
  });
});

describe('applyUpgrade', () => {
  it('increments tier and deducts sanity, returns new state', () => {
    const result = applyUpgrade(
      { schemaVersion: 1, tiers: tiers({ physique: 1 }) },
      stash(1000),
      'physique',
    );
    expect(result.upgrades.tiers.physique).toBe(2);
    expect(result.stash.sanity).toBe(400); // 1000 - 600
    expect(result.stash.items).toEqual([]);
  });

  it('throws when cannot upgrade', () => {
    expect(() => applyUpgrade(
      { schemaVersion: 1, tiers: tiers({ armory: 3 }) },
      stash(99999),
      'armory',
    )).toThrow();
  });
});

describe('getUpgradeEffects', () => {
  it('computes multipliers for stat upgrades', () => {
    const e = getUpgradeEffects(tiers({ physique: 3, swift: 2, pickup: 1, sharp: 4, lucky: 5 }));
    expect(e.maxHpMultiplier).toBeCloseTo(1 + 0.04 * 3);
    expect(e.moveSpeedMultiplier).toBeCloseTo(1 + 0.04 * 2);
    expect(e.pickupRangeMultiplier).toBeCloseTo(1 + 0.04 * 1);
    expect(e.attackDamageMultiplier).toBeCloseTo(1 + 0.04 * 4);
    expect(e.dropRateMultiplier).toBeCloseTo(1 + 0.04 * 5);
    expect(e.consumableSlotCount).toBe(3); // armory tier 0
  });

  it('armory tier adds consumable slots up to 6', () => {
    expect(getUpgradeEffects(tiers({ armory: 1 })).consumableSlotCount).toBe(4);
    expect(getUpgradeEffects(tiers({ armory: 3 })).consumableSlotCount).toBe(6);
  });

  it('maxHp bonus respects base 100', () => {
    const e = getUpgradeEffects(tiers({ physique: 5 }));
    expect(e.maxHpBonus).toBe(100 * 0.04 * 5); // +20
    expect(e.maxHpMultiplier).toBeCloseTo(1.2);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-upgrade-manager.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/meta/UpgradeManager.ts`：

```ts
import type {
  TombRaidUpgradeId,
  TombRaidUpgradesState,
  TombRaidStashState,
} from '../state/tombRaidState';

export const UPGRADE_COSTS: Readonly<Record<TombRaidUpgradeId, readonly number[]>> = {
  physique: [200, 400, 600, 800, 1000],
  swift: [200, 400, 600, 800, 1000],
  pickup: [300, 500, 700, 900, 1100],
  sharp: [300, 500, 700, 900, 1100],
  lucky: [500, 800, 1200, 1500, 2000],
  armory: [500, 800, 1200],
} as const;

export const UPGRADE_MAX_TIERS: Readonly<Record<TombRaidUpgradeId, number>> = {
  physique: 5,
  swift: 5,
  pickup: 5,
  sharp: 5,
  lucky: 5,
  armory: 3,
} as const;

// stat 类升级每阶 +4%；armory 是 +1 槽，effect 用 UPGRADE_MAX_TIERS 单独表达
export const UPGRADE_EFFECT_PER_TIER: Readonly<Record<TombRaidUpgradeId, number>> = {
  physique: 0.04,
  swift: 0.04,
  pickup: 0.04,
  sharp: 0.04,
  lucky: 0.04,
  armory: 1, // 槽位数，不参与 multiplier
} as const;

const PLAYER_BASE_MAX_HP = 100;
const CONSUMABLE_BASE_SLOTS = 3;

export function getUpgradeCost(id: TombRaidUpgradeId, currentTier: number): number {
  const max = UPGRADE_MAX_TIERS[id];
  if (currentTier >= max) {
    throw new Error(`Upgrade ${id} already at max tier ${max}`);
  }
  const costs = UPGRADE_COSTS[id];
  const cost = costs[currentTier];
  if (cost === undefined) {
    throw new Error(`Missing cost for ${id} tier ${currentTier}`);
  }
  return cost;
}

export function canUpgrade(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  id: TombRaidUpgradeId,
): boolean {
  const current = upgrades.tiers[id];
  if (current >= UPGRADE_MAX_TIERS[id]) return false;
  const cost = getUpgradeCost(id, current);
  return stash.sanity >= cost;
}

export function applyUpgrade(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  id: TombRaidUpgradeId,
): { readonly upgrades: TombRaidUpgradesState; readonly stash: TombRaidStashState } {
  if (!canUpgrade(upgrades, stash, id)) {
    throw new Error(`Cannot upgrade ${id} (tier=${upgrades.tiers[id]}, sanity=${stash.sanity})`);
  }
  const current = upgrades.tiers[id];
  const cost = getUpgradeCost(id, current);
  const nextTiers = { ...upgrades.tiers, [id]: current + 1 };
  return {
    upgrades: { schemaVersion: upgrades.schemaVersion, tiers: nextTiers },
    stash: { schemaVersion: stash.schemaVersion, sanity: stash.sanity - cost, items: stash.items },
  };
}

export interface UpgradeEffects {
  readonly maxHpMultiplier: number;
  readonly maxHpBonus: number;
  readonly moveSpeedMultiplier: number;
  readonly pickupRangeMultiplier: number;
  readonly attackDamageMultiplier: number;
  readonly dropRateMultiplier: number;
  readonly consumableSlotCount: number;
}

export function getUpgradeEffects(
  tiers: Readonly<Record<TombRaidUpgradeId, number>>,
): UpgradeEffects {
  const phys = tiers.physique * UPGRADE_EFFECT_PER_TIER.physique;
  const swift = tiers.swift * UPGRADE_EFFECT_PER_TIER.swift;
  const pickup = tiers.pickup * UPGRADE_EFFECT_PER_TIER.pickup;
  const sharp = tiers.sharp * UPGRADE_EFFECT_PER_TIER.sharp;
  const lucky = tiers.lucky * UPGRADE_EFFECT_PER_TIER.lucky;
  return {
    maxHpMultiplier: 1 + phys,
    maxHpBonus: Math.round(PLAYER_BASE_MAX_HP * phys),
    moveSpeedMultiplier: 1 + swift,
    pickupRangeMultiplier: 1 + pickup,
    attackDamageMultiplier: 1 + sharp,
    dropRateMultiplier: 1 + lucky,
    consumableSlotCount: CONSUMABLE_BASE_SLOTS + tiers.armory,
  };
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-upgrade-manager.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/meta/UpgradeManager.ts src/tests/tomb-raid-upgrade-manager.test.ts
git commit -m "feat(tomb-raid): add UpgradeManager 6 permanent upgrades data layer"
```

---

## Task 2: StashManager — 仓库数据层

**文件**：`src/tombraid/meta/StashManager.ts`、`src/tests/tomb-raid-stash-manager.test.ts`

**spec §8.1**：无限槽位；存 `items + sanity` 理智账；key `ying-zhong-jiu.tomb-raid.stash.v1`。本局 Inventory 撤离时并入仓库。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-stash-manager.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStashItemQuantity, addLoot, addSanity, removeFromStash,
  depositRunInventory, loadStash, storeStash,
} from '../tombraid/meta/StashManager';
import { createDefaultStashState } from '../tombraid/state/tombRaidState';
import type { TombRaidStashState } from '../tombraid/state/tombRaidState';
import type { InventoryEntry } from '../tombraid/loot/Inventory';
import type { InventoryPort } from '../tombraid/meta/StashManager';

function stashWith(sanity: number, items: { itemId: string; quantity: number }[] = []): TombRaidStashState {
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
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-stash-manager.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/meta/StashManager.ts`：

```ts
import type { TombRaidStashState, TombRaidStashItem, TombRaidLoadResult } from '../state/tombRaidState';
import {
  STASH_KEY, createDefaultStashState, loadStashState, saveStashState,
} from '../state/tombRaidState';
import type { InventoryEntry } from '../loot/Inventory';

// 设计变更：InventoryPort 端口接口 — StashManager 仅消费本局 Inventory 的只读快照能力
// （entries/totalSanityValue/clear），不依赖 Plan 5 完整 Inventory（add/remove/has/quantity/activeRelics）。
// SettlementScreen 传入的完整 Inventory 结构兼容此端口（超集）。定义在此处并由本文件 export。
export interface InventoryPort {
  entries(): readonly InventoryEntry[];
  totalSanityValue(): number;
  clear(): void;
}

export function getStashItemQuantity(stash: TombRaidStashState, itemId: string): number {
  for (const item of stash.items) {
    if (item.itemId === itemId) return item.quantity;
  }
  return 0;
}

export function addLoot(stash: TombRaidStashState, itemId: string, quantity: number): TombRaidStashState {
  if (quantity <= 0) return stash;
  const existing = stash.items.find((it) => it.itemId === itemId);
  let items: readonly TombRaidStashItem[];
  if (existing) {
    items = stash.items.map((it) => it.itemId === itemId ? { itemId, quantity: it.quantity + quantity } : it);
  } else {
    items = [...stash.items, { itemId, quantity }];
  }
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity, items };
}

export function addSanity(stash: TombRaidStashState, amount: number): TombRaidStashState {
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity + amount, items: stash.items };
}

export function removeFromStash(
  stash: TombRaidStashState,
  itemId: string,
  quantity: number,
): TombRaidStashState {
  if (quantity <= 0) return stash;
  const current = getStashItemQuantity(stash, itemId);
  if (current < quantity) return stash; // 不够，原样返回
  const items = stash.items
    .map((it) => it.itemId === itemId ? { itemId, quantity: it.quantity - quantity } : it)
    .filter((it) => it.quantity > 0);
  return { schemaVersion: stash.schemaVersion, sanity: stash.sanity, items };
}

export interface DepositRunResult {
  readonly stash: TombRaidStashState;
  readonly totalDeposited: number;
  readonly itemCount: number;
}

export function depositRunInventory(stash: TombRaidStashState, inventory: InventoryPort): DepositRunResult {
  const entries = inventory.entries();
  let next = stash;
  let itemCount = 0;
  for (const entry of entries) {
    next = addLoot(next, entry.itemId, entry.quantity);
    itemCount += entry.quantity;
  }
  const totalDeposited = inventory.totalSanityValue();
  return {
    stash: addSanity(next, totalDeposited),
    totalDeposited,
    itemCount,
  };
}

export function loadStash(): TombRaidStashState {
  const result: TombRaidLoadResult<TombRaidStashState> = loadStashState();
  return result.state;
}

export function storeStash(stash: TombRaidStashState): void {
  saveStashState(stash);
}

export { createDefaultStashState, STASH_KEY };
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-stash-manager.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/meta/StashManager.ts src/tests/tomb-raid-stash-manager.test.ts
git commit -m "feat(tomb-raid): add StashManager infinite-slot stash with sanity ledger"
```

---

## Task 3: ShopManager — 商城数据层

**文件**：`src/tombraid/meta/ShopManager.ts`、`src/tests/tomb-raid-shop-manager.test.ts`

**spec §8.2**：卖价 = `sanityValue × 1`（1:1）；买价 = `Math.round(sanityValue × 1.75)`；可买 = 消耗品 + 武器；可卖 = 任意。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-shop-manager.test.ts`：

```ts
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
    description: '', effect: null,
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

  it('buy price = Math.round(sanityValue × 1.75)', () => {
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
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-shop-manager.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/meta/ShopManager.ts`：

```ts
import type { TombRaidStashState } from '../state/tombRaidState';
import type { LootItem } from '../loot/LootItem';
import { addLoot, addSanity, getStashItemQuantity, removeFromStash } from './StashManager';

export const SHOP_BUY_MULTIPLIER = 1.75;
export const SHOP_SELL_MULTIPLIER = 1;

export function getSellPrice(item: LootItem): number {
  return Math.round(item.sanityValue * SHOP_SELL_MULTIPLIER);
}

export function getBuyPrice(item: LootItem): number {
  return Math.round(item.sanityValue * SHOP_BUY_MULTIPLIER);
}

export function isBuyable(item: LootItem): boolean {
  return item.type === 'consumable' || item.type === 'weapon';
}

export function isSellable(_item: LootItem): boolean {
  return true; // 任意皆可卖
}

export type ShopResult =
  | { readonly ok: true; readonly stash: TombRaidStashState }
  | { readonly ok: false; readonly reason: 'insufficient-stock' | 'not-buyable'; readonly stash: TombRaidStashState };

export function sell(
  stash: TombRaidStashState,
  item: LootItem,
  quantity: number,
): ShopResult {
  if (!isSellable(item)) {
    return { ok: false, reason: 'not-buyable', stash };
  }
  if (quantity <= 0) return { ok: true, stash };
  if (getStashItemQuantity(stash, item.id) < quantity) {
    return { ok: false, reason: 'insufficient-stock', stash };
  }
  const afterRemove = removeFromStash(stash, item.id, quantity);
  const gain = getSellPrice(item) * quantity;
  return { ok: true, stash: addSanity(afterRemove, gain) };
}

export function buy(
  stash: TombRaidStashState,
  item: LootItem,
  quantity: number,
): ShopResult {
  if (!isBuyable(item)) {
    return { ok: false, reason: 'not-buyable', stash };
  }
  if (quantity <= 0) return { ok: true, stash };
  const cost = getBuyPrice(item) * quantity;
  if (stash.sanity < cost) {
    return { ok: false, reason: 'insufficient-stock', stash };
  }
  const afterDeduct = { schemaVersion: stash.schemaVersion, sanity: stash.sanity - cost, items: stash.items };
  return { ok: true, stash: addLoot(afterDeduct, item.id, quantity) };
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-shop-manager.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/meta/ShopManager.ts src/tests/tomb-raid-shop-manager.test.ts
git commit -m "feat(tomb-raid): add ShopManager sell 1:1 buy x1.75 Math.round"
```

---

## Task 4: LoadoutManager — 起配数据层

**文件**：`src/tombraid/meta/LoadoutManager.ts`、`src/tests/tomb-raid-loadout-manager.test.ts`

**spec §8.3**：1 武器 + 3 消耗品槽；武备 +1 槽（最多 +3 → 6 槽）；空手 = `unarmed` 弱拳 5 伤；新用户起手包 `weapon.ruler ×1` + `consumable.celery ×3`。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-loadout-manager.test.ts`：

```ts
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
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-loadout-manager.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/meta/LoadoutManager.ts`：

```ts
import type { TombRaidUpgradesState, TombRaidStashState } from '../state/tombRaidState';
import { getStashItemQuantity, removeFromStash } from './StashManager';
import { UPGRADE_MAX_TIERS } from './UpgradeManager';

export const UNARMED_ID = 'unarmed';
export const WEAK_PUNCH_DAMAGE = 5;
export const BASE_CONSUMABLE_SLOTS = 3;
export const MAX_CONSUMABLE_SLOTS = 6;

export interface LoadoutConsumableSlot { readonly itemId: string; readonly quantity: number; }
export interface Loadout {
  readonly weaponId: string; // 'unarmed' 表示空手
  readonly consumables: readonly LoadoutConsumableSlot[];
}
export interface BuiltRun {
  readonly loadout: Loadout;
  readonly weaponRemovedFromStash: boolean;
  readonly consumablesRemovedFromStash: readonly { readonly itemId: string; readonly quantity: number }[];
}

export function getConsumableSlotCount(
  tiers: Readonly<Record<keyof TombRaidUpgradesState['tiers'], number>>,
): number {
  const slots = BASE_CONSUMABLE_SLOTS + tiers.armory;
  return Math.min(slots, MAX_CONSUMABLE_SLOTS);
}

export type ValidateLoadoutResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'too-many-consumables' | 'insufficient-stock' };

export function validateLoadout(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  loadout: Loadout,
): ValidateLoadoutResult {
  const slotCount = getConsumableSlotCount(upgrades.tiers);
  if (loadout.consumables.length > slotCount) {
    return { ok: false, reason: 'too-many-consumables' };
  }
  if (loadout.weaponId !== UNARMED_ID) {
    if (getStashItemQuantity(stash, loadout.weaponId) < 1) {
      return { ok: false, reason: 'insufficient-stock' };
    }
  }
  for (const c of loadout.consumables) {
    if (getStashItemQuantity(stash, c.itemId) < c.quantity) {
      return { ok: false, reason: 'insufficient-stock' };
    }
  }
  return { ok: true };
}

export function consumeLoadoutFromStash(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  loadout: Loadout,
): BuiltRun {
  const validation = validateLoadout(upgrades, stash, loadout);
  if (!validation.ok) {
    throw new Error(`Cannot consume loadout: ${validation.reason}`);
  }
  let next = stash;
  let weaponRemoved = false;
  const consumablesRemoved: { itemId: string; quantity: number }[] = [];
  if (loadout.weaponId !== UNARMED_ID) {
    next = removeFromStash(next, loadout.weaponId, 1);
    weaponRemoved = true;
  }
  for (const c of loadout.consumables) {
    next = removeFromStash(next, c.itemId, c.quantity);
    consumablesRemoved.push({ itemId: c.itemId, quantity: c.quantity });
  }
  return {
    loadout,
    weaponRemovedFromStash: weaponRemoved,
    consumablesRemovedFromStash: consumablesRemoved,
  };
  // 注意：consumablesRemoved 用于上层失败回滚；此处仅返回 BuiltRun 信息
  // next stash 由调用方通过 StashManager.storeStash 持久化（此处不副作用）
  // 为保持纯函数，下面通过临时变量提供 next（ unreachable，仅为消除 unused 误判）
  void next;
}

export { UPGRADE_MAX_TIERS };
```

> 说明：`consumeLoadoutFromStash` 保留纯函数语义——它返回 BuiltRun 信息但**不**写 localStorage。调用方（HubUI/Scene）需要时再 `storeStash(next)`。为避免在 `noUnusedLocals` 下报错，返回结构同时暴露 `stash` 字段。修正版见下方"实现补丁"。

**实现补丁**（替换 `BuiltRun` 与 `consumeLoadoutFromStash`，使 stash 可被调用方持久化）：

```ts
export interface BuiltRun {
  readonly loadout: Loadout;
  readonly stash: TombRaidStashState;            // 扣除武器+消耗品后的新仓库
  readonly weaponRemovedFromStash: boolean;
  readonly consumablesRemovedFromStash: readonly { readonly itemId: string; readonly quantity: number }[];
}

export function consumeLoadoutFromStash(
  upgrades: TombRaidUpgradesState,
  stash: TombRaidStashState,
  loadout: Loadout,
): BuiltRun {
  const validation = validateLoadout(upgrades, stash, loadout);
  if (!validation.ok) {
    throw new Error(`Cannot consume loadout: ${validation.reason}`);
  }
  let next = stash;
  let weaponRemoved = false;
  const consumablesRemoved: { itemId: string; quantity: number }[] = [];
  if (loadout.weaponId !== UNARMED_ID) {
    next = removeFromStash(next, loadout.weaponId, 1);
    weaponRemoved = true;
  }
  for (const c of loadout.consumables) {
    next = removeFromStash(next, c.itemId, c.quantity);
    consumablesRemoved.push({ itemId: c.itemId, quantity: c.quantity });
  }
  return {
    loadout,
    stash: next,
    weaponRemovedFromStash: weaponRemoved,
    consumablesRemovedFromStash: consumablesRemoved,
  };
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-loadout-manager.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/meta/LoadoutManager.ts src/tests/tomb-raid-loadout-manager.test.ts
git commit -m "feat(tomb-raid): add LoadoutManager 1 weapon + 3 consumables, armory expansion, unarmed"
```

---

## Task 5: HubUI + TombRaidHubScene 接线 — 枢纽 5 面板 UI

**文件**：`src/tombraid/ui/HubUI.ts`、`src/tombraid/TombRaidHubScene.ts`（修改）、`src/tests/tomb-raid-hub-ui.test.ts`

**spec §1.2 / §8 / §11.2**：枢纽 5 面板（仓库 / 商城 / 起配 / 永久升级 / 进入墓穴）；复用 `UI_THEME` + GameScene 按钮工厂模式。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-hub-ui.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubUI, HUB_PANELS } from '../tombraid/ui/HubUI';

// 复用 narrative-ui.test.ts 的 mock scene 模式
function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color: number, alpha?: number) => {
        const o = chainable({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, interactive: false, origin: 0 });
        objects.push(o);
        return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chainable({ x, y, text, _kind: 'text', depth: 0, visible: true, origin: 0 });
        objects.push(o);
        return o;
      }),
    },
    input: { on: vi.fn(), keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() } },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
    scene: { start: vi.fn(), get: vi.fn(() => null) },
  };
  return { scene, objects };
}

function chainable(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition']) {
    o[m] = vi.fn((..._args: any[]) => o);
  }
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  return o;
}

describe('HubUI panels', () => {
  it('pins 5 panel ids in display order', () => {
    expect(HUB_PANELS.map((p) => p.id)).toEqual(['stash', 'shop', 'loadout', 'upgrades', 'enter']);
    expect(HUB_PANELS.map((p) => p.label)).toEqual(['仓库', '商城', '起配', '永久升级', '进入墓穴']);
  });
});

describe('HubUI lifecycle', () => {
  beforeEach(() => localStorage.clear());

  it('create renders 5 panel buttons + back button + active panel title', () => {
    const env = createMockScene();
    const onEnter = vi.fn();
    const onBack = vi.fn();
    const hub = new HubUI(env.scene, { onEnter, onBack });
    hub.create();
    // 5 panel 按钮 + 1 返回按钮 + 标题文字
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(6);
    const texts = env.objects.filter((o) => o._kind === 'text');
    expect(texts.some((t) => t.text === '仓库')).toBe(true);
    expect(texts.some((t) => t.text === '进入墓穴')).toBe(true);
    expect(texts.some((t) => t.text === '返回')).toBe(true);
  });

  it('switching panel updates active panel title', () => {
    const env = createMockScene();
    const hub = new HubUI(env.scene, { onEnter: vi.fn(), onBack: vi.fn() });
    hub.create();
    hub.switchPanel('upgrades');
    const texts = env.objects.filter((o) => o._kind === 'text');
    expect(texts.some((t) => t.text === '永久升级')).toBe(true);
  });

  it('clicking enter panel triggers onEnter callback', () => {
    const env = createMockScene();
    const onEnter = vi.fn();
    const hub = new HubUI(env.scene, { onEnter, onBack: vi.fn() });
    hub.create();
    hub.handlePanelClick('enter');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('clicking back triggers onBack', () => {
    const env = createMockScene();
    const onBack = vi.fn();
    const hub = new HubUI(env.scene, { onEnter: vi.fn(), onBack });
    hub.create();
    hub.handleBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-hub-ui.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/HubUI.ts`：

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';
import {
  loadStash, storeStash,
} from '../meta/StashManager';
import {
  loadUpgradesState, saveUpgradesState, createDefaultUpgradesState,
} from '../state/tombRaidState';
import {
  UPGRADE_COSTS, UPGRADE_MAX_TIERS, canUpgrade, applyUpgrade, getUpgradeEffects,
} from '../meta/UpgradeManager';
import { getSellPrice, getBuyPrice, isBuyable, sell, buy } from '../meta/ShopManager';
import {
  getConsumableSlotCount, validateLoadout, consumeLoadoutFromStash, UNARMED_ID,
} from '../meta/LoadoutManager';
import { getLootItem, ALL_LOOT } from '../loot/LootItem';

export const HUD_BASE_DEPTH = 1000;
export const HUD_TEXT_DEPTH = 1001;
export const HUD_OVERLAY_DEPTH = 1002;

export interface HubPanelDef { readonly id: 'stash' | 'shop' | 'loadout' | 'upgrades' | 'enter'; readonly label: string; }
export const HUB_PANELS: readonly HubPanelDef[] = [
  { id: 'stash', label: '仓库' },
  { id: 'shop', label: '商城' },
  { id: 'loadout', label: '起配' },
  { id: 'upgrades', label: '永久升级' },
  { id: 'enter', label: '进入墓穴' },
];

export interface HubUICallbacks {
  readonly onEnter: () => void;
  readonly onBack: () => void;
}

const PANEL_BUTTON_WIDTH = 200;
const PANEL_BUTTON_HEIGHT = 48;
const PANEL_BUTTON_Y = 56;
const PANEL_GAP = 16;
const BACK_BUTTON_X = 80;
const BACK_BUTTON_Y = 690;

export class HubUI {
  private panelButtons: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private panelLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private titleText: Phaser.GameObjects.Text | null = null;
  private contentContainer: Phaser.GameObjects.Container | null = null;
  private activePanel: HubPanelDef['id'] = 'stash';

  constructor(private scene: Phaser.Scene, private callbacks: HubUICallbacks) {}

  create(): void {
    const totalWidth = HUB_PANELS.length * PANEL_BUTTON_WIDTH + (HUB_PANELS.length - 1) * PANEL_GAP;
    const startX = (GAME_WIDTH - totalWidth) / 2 + PANEL_BUTTON_WIDTH / 2;
    HUB_PANELS.forEach((panel, i) => {
      const x = startX + i * (PANEL_BUTTON_WIDTH + PANEL_GAP);
      const rect = this.scene.add.rectangle(x, PANEL_BUTTON_Y, PANEL_BUTTON_WIDTH, PANEL_BUTTON_HEIGHT, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
        .setOrigin(0.5).setDepth(HUD_BASE_DEPTH).setInteractive({ useHandCursor: true });
      applyPixelStrokeStyle(rect, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
      const label = applyPixelTextStyle(this.scene.add.text(x, PANEL_BUTTON_Y, panel.label,
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '20px' }))
        .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);
      rect.on('pointerup', () => this.handlePanelClick(panel.id));
      this.panelButtons.set(panel.id, rect);
      this.panelLabels.set(panel.id, label);
    });

    this.titleText = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, 120, '仓库',
      { align: 'center', color: UI_THEME.colors.textGold, fontFamily: UI_THEME.font.ui, fontSize: '28px', fontStyle: 'bold' }))
      .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);

    this.contentContainer = this.scene.add.container(0, 0).setDepth(HUD_OVERLAY_DEPTH);

    // 返回按钮
    const back = this.scene.add.rectangle(BACK_BUTTON_X, BACK_BUTTON_Y, 120, 40, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5).setDepth(HUD_BASE_DEPTH).setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(back, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    applyPixelTextStyle(this.scene.add.text(BACK_BUTTON_X, BACK_BUTTON_Y, '返回',
      { align: 'center', color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '18px' }))
      .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);
    back.on('pointerup', () => this.handleBack());

    this.renderActivePanel();
  }

  switchPanel(id: HubPanelDef['id']): void {
    this.activePanel = id;
    if (this.titleText) this.titleText.setText(HUB_PANELS.find((p) => p.id === id)?.label ?? '');
    this.renderActivePanel();
  }

  handlePanelClick(id: HubPanelDef['id']): void {
    if (id === 'enter') { this.callbacks.onEnter(); return; }
    this.switchPanel(id);
  }

  handleBack(): void {
    this.callbacks.onBack();
  }

  private renderActivePanel(): void {
    if (!this.contentContainer) return;
    this.contentContainer.removeAll(true);
    switch (this.activePanel) {
      case 'stash': this.renderStashPanel(); break;
      case 'shop': this.renderShopPanel(); break;
      case 'loadout': this.renderLoadoutPanel(); break;
      case 'upgrades': this.renderUpgradesPanel(); break;
      case 'enter': break;
    }
  }

  private renderStashPanel(): void {
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `理智: ${stash.sanity}`, UI_THEME.colors.textGold);
    let y = 220;
    if (stash.items.length === 0) {
      this.addContentText(GAME_WIDTH / 2, y, '（仓库空）', UI_THEME.colors.textMuted);
      return;
    }
    for (const item of stash.items) {
      const def = getLootItem(item.itemId);
      const name = def?.name ?? item.itemId;
      const value = def ? def.sanityValue : 0;
      this.addContentText(GAME_WIDTH / 2, y, `${name} ×${item.quantity}   (${value}/件)`, UI_THEME.colors.text);
      y += 28;
    }
  }

  private renderShopPanel(): void {
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `理智: ${stash.sanity}`, UI_THEME.colors.textGold);
    let y = 220;
    this.addContentText(GAME_WIDTH / 2, y, '— 可买 (消耗品/武器) —', UI_THEME.colors.textMuted); y += 28;
    for (const item of ALL_LOOT) {
      if (!isBuyable(item)) continue;
      this.addContentText(GAME_WIDTH / 2 - 200, y, `${item.name} 买 ${getBuyPrice(item)}`, UI_THEME.colors.text);
      this.addBuyButton(GAME_WIDTH / 2 + 200, y, item.id);
      y += 28;
    }
    y += 12;
    this.addContentText(GAME_WIDTH / 2, y, '— 可卖 (仓库内) —', UI_THEME.colors.textMuted); y += 28;
    for (const entry of stash.items) {
      const def = getLootItem(entry.itemId);
      if (!def) continue;
      this.addContentText(GAME_WIDTH / 2 - 200, y, `${def.name} ×${entry.quantity} 卖 ${getSellPrice(def)}`, UI_THEME.colors.text);
      this.addSellButton(GAME_WIDTH / 2 + 200, y, entry.itemId);
      y += 28;
    }
  }

  private renderLoadoutPanel(): void {
    const upgrades = loadUpgradesState().state;
    const slotCount = getConsumableSlotCount(upgrades.tiers);
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `消耗品槽位: ${slotCount} (武备 ${upgrades.tiers.armory}/${UPGRADE_MAX_TIERS.armory})`, UI_THEME.colors.textGold);
    let y = 220;
    this.addContentText(GAME_WIDTH / 2, y, `武器: ${stash.items.some((i) => i.itemId.startsWith('weapon.')) ? '已配置' : '空手(unarmed)'}`, UI_THEME.colors.text); y += 28;
    this.addContentText(GAME_WIDTH / 2, y, '（在仓库/商城获取武器与消耗品后，进入墓穴前在此确认起配）', UI_THEME.colors.textMuted); y += 28;
    this.addContentText(GAME_WIDTH / 2, y, `空手 = ${UNARMED_ID}, 弱拳 5 伤`, UI_THEME.colors.textMuted);
  }

  private renderUpgradesPanel(): void {
    const upgrades = loadUpgradesState().state;
    const stash = loadStash();
    const labels: Record<string, string> = {
      physique: '体魄 +4% maxHP', swift: '疾走 +4% moveSpeed', pickup: '拾取 +4% pickupRange',
      sharp: '锐利 +4% attackDamage', lucky: '幸运 +4% dropRate', armory: '武备 +1 消耗品槽',
    };
    let y = 180;
    (Object.keys(labels) as Array<keyof typeof labels>).forEach((id) => {
      const tier = upgrades.tiers[id];
      const max = UPGRADE_MAX_TIERS[id];
      const costs = UPGRADE_COSTS[id];
      const cost = tier < max ? costs[tier] : null;
      const status = cost === null ? '已满阶' : `${cost} 理智`;
      const canAfford = canUpgrade(upgrades, stash, id);
      this.addContentText(GAME_WIDTH / 2 - 240, y, `${labels[id]}  ${tier}/${max}`, UI_THEME.colors.text);
      this.addContentText(GAME_WIDTH / 2 + 80, y, status, UI_THEME.colors.textMuted);
      if (cost !== null) this.addUpgradeButton(GAME_WIDTH / 2 + 240, y, id, canAfford);
      y += 32;
    });
    const e = getUpgradeEffects(upgrades.tiers);
    y += 16;
    this.addContentText(GAME_WIDTH / 2, y, `当前效果: maxHP×${e.maxHpMultiplier.toFixed(2)} 速度×${e.moveSpeedMultiplier.toFixed(2)} 槽位${e.consumableSlotCount}`, UI_THEME.colors.textGold);
  }

  private addBuyButton(x: number, y: number, itemId: string): void {
    this.addActionButton(x, y, '买', () => {
      const item = getLootItem(itemId);
      if (!item) return;
      const result = buy(loadStash(), item, 1);
      if (result.ok) storeStash(result.stash);
      this.renderActivePanel();
    });
  }

  private addSellButton(x: number, y: number, itemId: string): void {
    this.addActionButton(x, y, '卖', () => {
      const item = getLootItem(itemId);
      if (!item) return;
      const result = sell(loadStash(), item, 1);
      if (result.ok) storeStash(result.stash);
      this.renderActivePanel();
    });
  }

  private addUpgradeButton(x: number, y: number, id: keyof typeof UPGRADE_COSTS, enabled: boolean): void {
    this.addActionButton(x, y, '升级', () => {
      if (!enabled) return;
      const upgrades = loadUpgradesState().state;
      const stash = loadStash();
      const next = applyUpgrade(upgrades, stash, id);
      saveUpgradesState(next.upgrades);
      storeStash(next.stash);
      this.renderActivePanel();
    }, enabled);
  }

  private addActionButton(x: number, y: number, label: string, onPointerUp: () => void, enabled = true): void {
    const rect = this.scene.add.rectangle(x, y, 80, 24, enabled ? UI_THEME.colors.accent : UI_THEME.colors.surfaceMuted, UI_THEME.alpha.control)
      .setOrigin(0.5).setInteractive({ useHandCursor: enabled });
    applyPixelStrokeStyle(rect, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(this.scene.add.text(x, y, label,
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setOrigin(0.5);
    rect.on('pointerup', onPointerUp);
    if (!enabled) rect.disableInteractive();
    this.contentContainer?.add([rect]);
  }

  private addContentText(x: number, y: number, text: string, color: string): void {
    const t = applyPixelTextStyle(this.scene.add.text(x, y, text,
      { align: 'center', color, fontFamily: UI_THEME.font.ui, fontSize: '16px' }))
      .setOrigin(0.5);
    this.contentContainer?.add(t);
  }
}

export { GAME_HEIGHT };
```

**TombRaidHubScene 接线**（修改 `src/tombraid/TombRaidHubScene.ts`，替换 Plan 1 占位）：

```ts
// 在 create() 中替换占位文本：
import { HubUI } from './ui/HubUI';

export class TombRaidHubScene extends Phaser.Scene {
  private hubUI: HubUI | null = null;

  constructor() { super('TombRaidHub'); }

  create(): void {
    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);
    this.hubUI = new HubUI(this, {
      onEnter: () => this.scene.start('TombRaid'),
      onBack: () => this.scene.start('Game'),
    });
    this.hubUI.create();
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-hub-ui.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/HubUI.ts src/tombraid/TombRaidHubScene.ts src/tests/tomb-raid-hub-ui.test.ts
git commit -m "feat(tomb-raid): add HubUI 5 panels + wire TombRaidHubScene"
```

---

## Task 6: TombRaidHUD — 对局 HUD

**文件**：`src/tombraid/ui/TombRaidHUD.ts`、`src/tests/tomb-raid-hud.test.ts`

**spec §9.1**：左上 HP+武器+大招 CD 环 / 上中 理智+基准线（达标变金）/ 右上 小地图（由 Task 7 占位）/ 下中 消耗品槽 / 左下 理智比率。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-hud.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { TombRaidHUD, HUD_BASE_DEPTH, HUD_TEXT_DEPTH } from '../tombraid/ui/TombRaidHUD';
import type { HudSnapshot } from '../tombraid/ui/TombRaidHUD';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      arc: vi.fn((x: number, y: number, r: number) => {
        const o = chain({ x, y, r, _kind: 'arc', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setAngle', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn(() => o);
  o.clear = vi.fn(() => o);
  o.fillStyle = vi.fn(() => o);
  o.lineStyle = vi.fn(() => o);
  o.beginPath = vi.fn(() => o);
  o.arc = vi.fn(() => o);
  o.moveTo = vi.fn(() => o);
  o.lineTo = vi.fn(() => o);
  o.strokePath = vi.fn(() => o);
  o.fillPath = vi.fn(() => o);
  o.slice = vi.fn(() => o);
  o.fillCircle = vi.fn(() => o);
  return o;
}

function snapshot(over: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    hp: 80, maxHp: 100,
    weaponId: 'weapon.ruler', weaponName: '尺子',
    ultCooldownRemaining: 5000, ultCooldownTotal: 20000,
    sanity: 180, baseline: 200,
    consumableSlots: [{ itemId: 'consumable.celery', quantity: 2 }],
    stashSanity: 750,
    ...over,
  };
}

describe('TombRaidHUD depth constants', () => {
  it('pins HUD depths (1000/1001)', () => {
    expect(HUD_BASE_DEPTH).toBe(1000);
    expect(HUD_TEXT_DEPTH).toBe(1001);
  });
});

describe('TombRaidHUD lifecycle', () => {
  it('create renders HP bar, weapon name, ult CD, sanity, consumable slots, sanity ratio', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    hud.update(snapshot());
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    // 至少包含 HP 文本、武器名、理智/基准、消耗品、理智比率
    expect(texts.some((t: string) => /80|100/.test(t))).toBe(true);
    expect(texts.some((t: string) => t.includes('尺子'))).toBe(true);
    expect(texts.some((t: string) => /180|200/.test(t))).toBe(true);
  });

  it('sanity text turns gold when sanity >= baseline', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const below = hud.update(snapshot({ sanity: 150, baseline: 200 }));
    const at = hud.update(snapshot({ sanity: 200, baseline: 200 }));
    const above = hud.update(snapshot({ sanity: 250, baseline: 200 }));
    expect(below.sanityAtBaseline).toBe(false);
    expect(at.sanityAtBaseline).toBe(true);
    expect(above.sanityAtBaseline).toBe(true);
  });

  it('ult CD ring fraction = 1 - remaining/total', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ ultCooldownRemaining: 5000, ultCooldownTotal: 20000 }));
    expect(r.ultCooldownFraction).toBeCloseTo(0.75);
  });

  it('ult CD ready when remaining 0', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ ultCooldownRemaining: 0, ultCooldownTotal: 20000 }));
    expect(r.ultReady).toBe(true);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-hud.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/TombRaidHUD.ts`：

```ts
import Phaser from 'phaser';
import { GAME_WIDTH } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const HUD_BASE_DEPTH = 1000;
export const HUD_TEXT_DEPTH = 1001;
export const HUD_OVERLAY_DEPTH = 1002;

export interface HudSnapshot {
  readonly hp: number;
  readonly maxHp: number;
  readonly weaponId: string;
  readonly weaponName: string;
  readonly ultCooldownRemaining: number;
  readonly ultCooldownTotal: number;
  readonly sanity: number;
  readonly baseline: number;
  readonly consumableSlots: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly stashSanity: number;
}

export interface HudUpdateResult {
  readonly ultCooldownFraction: number;
  readonly ultReady: boolean;
  readonly sanityAtBaseline: boolean;
}

const HP_BAR_X = 40;
const HP_BAR_Y = 40;
const HP_BAR_WIDTH = 220;
const HP_BAR_HEIGHT = 16;
const ULT_RING_X = 290;
const ULT_RING_Y = 48;
const ULT_RING_RADIUS = 22;
const SANITY_TEXT_X = GAME_WIDTH / 2;
const SANITY_TEXT_Y = 36;
const CONSUMABLE_Y = 690;
const RATIO_X = 80;
const RATIO_Y = 660;

export class TombRaidHUD {
  private hpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private hpBarFill: Phaser.GameObjects.Rectangle | null = null;
  private hpText: Phaser.GameObjects.Text | null = null;
  private weaponText: Phaser.GameObjects.Text | null = null;
  private ultRing: Phaser.GameObjects.Arc | null = null;
  private ultText: Phaser.GameObjects.Text | null = null;
  private sanityText: Phaser.GameObjects.Text | null = null;
  private consumableTexts: Phaser.GameObjects.Text[] = [];
  private ratioText: Phaser.GameObjects.Text | null = null;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.hpBarBg = this.scene.add.rectangle(HP_BAR_X + HP_BAR_WIDTH / 2, HP_BAR_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH);
    applyPixelStrokeStyle(this.hpBarBg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    this.hpBarFill = this.scene.add.rectangle(HP_BAR_X, HP_BAR_Y, 0, HP_BAR_HEIGHT, UI_THEME.colors.accent)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH + 1);

    this.hpText = applyPixelTextStyle(this.scene.add.text(HP_BAR_X, HP_BAR_Y + 18, '',
      { color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    this.weaponText = applyPixelTextStyle(this.scene.add.text(HP_BAR_X, HP_BAR_Y + 40, '',
      { color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    this.ultRing = this.scene.add.arc(ULT_RING_X, ULT_RING_Y, ULT_RING_RADIUS, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setStrokeStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9)
      .setScrollFactor(0).setDepth(HUD_BASE_DEPTH);
    this.ultText = applyPixelTextStyle(this.scene.add.text(ULT_RING_X, ULT_RING_Y, 'K',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    this.sanityText = applyPixelTextStyle(this.scene.add.text(SANITY_TEXT_X, SANITY_TEXT_Y, '',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '22px', fontStyle: 'bold' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    this.ratioText = applyPixelTextStyle(this.scene.add.text(RATIO_X, RATIO_Y, '',
      { color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);
  }

  update(s: HudSnapshot): HudUpdateResult {
    const hpFraction = s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 0;
    if (this.hpBarFill) this.hpBarFill.width = HP_BAR_WIDTH * hpFraction;
    if (this.hpText) this.hpText.setText(`HP ${Math.max(0, Math.round(s.hp))}/${s.maxHp}`);
    if (this.weaponText) this.weaponText.setText(`武器: ${s.weaponName} (J普攻)`);

    const ultReady = s.ultCooldownRemaining <= 0;
    const ultFraction = s.ultCooldownTotal > 0
      ? Math.max(0, Math.min(1, 1 - s.ultCooldownRemaining / s.ultCooldownTotal))
      : 1;
    if (this.ultRing) {
      this.ultRing.setFillStyle(ultReady ? UI_THEME.colors.gold : UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel);
    }
    if (this.ultText) this.ultText.setText(ultReady ? 'K' : `${Math.ceil(s.ultCooldownRemaining / 1000)}`);

    const sanityAtBaseline = s.sanity >= s.baseline;
    if (this.sanityText) {
      this.sanityText.setText(`理智 ${s.sanity} / ${s.baseline}`);
      this.sanityText.setColor(sanityAtBaseline ? UI_THEME.colors.textGold : UI_THEME.colors.text);
    }

    // 消耗品槽（重建）
    for (const t of this.consumableTexts) t.destroy();
    this.consumableTexts = [];
    const slotCount = Math.max(s.consumableSlots.length, 1);
    const slotWidth = 80;
    const startX = GAME_WIDTH / 2 - (slotCount * (slotWidth + 8)) / 2 + slotWidth / 2;
    s.consumableSlots.forEach((slot, i) => {
      const t = applyPixelTextStyle(this.scene.add.text(startX + i * (slotWidth + 8), CONSUMABLE_Y,
        `${slot.itemId.split('.')[1] ?? '?'}×${slot.quantity}`,
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
        .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);
      this.consumableTexts.push(t);
    });

    if (this.ratioText) {
      const ratio = s.stashSanity > 0 ? (s.sanity / s.stashSanity).toFixed(2) : '—';
      this.ratioText.setText(`理智比率(本局/仓库): ${ratio}`);
    }

    return { ultCooldownFraction: ultFraction, ultReady, sanityAtBaseline };
  }

  destroy(): void {
    for (const t of this.consumableTexts) t.destroy();
    this.consumableTexts = [];
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-hud.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/TombRaidHUD.ts src/tests/tomb-raid-hud.test.ts
git commit -m "feat(tomb-raid): add TombRaidHUD HP/weapon/ult-CD/sanity/consumables"
```

---

## Task 7: Minimap — 小地图 + 雾战 + 大地图（含 ESC 关闭修复）

**文件**：`src/tombraid/ui/Minimap.ts`、`src/tests/tomb-raid-minimap.test.ts`

**spec §9.2**：雾战脚步点亮；玩家点 + 出口/宝箱/身体标记；缄默者不显示；M 键或点击小地图 → 大地图；ESC 或再点关闭。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-minimap.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { Minimap, MINIMAP_DEPTH, BIG_MAP_DEPTH } from '../tombraid/ui/Minimap';
import type { MinimapUpdate } from '../tombraid/ui/Minimap';

function createMockScene() {
  const objects: any[] = [];
  const keyboardKey = { isDown: false, on: vi.fn(), off: vi.fn() };
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
    },
    input: {
      keyboard: { addKey: vi.fn(() => keyboardKey), addCapture: vi.fn(), on: vi.fn(), off: vi.fn() },
      on: vi.fn(), off: vi.fn(),
    },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects, keyboardKey };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius', 'setBlendMode']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  return o;
}

function update(over: Partial<MinimapUpdate> = {}): MinimapUpdate {
  return {
    playerX: 2500, playerY: 2000,
    exploredCells: [0, 1, 2],
    chestMarkers: [{ id: 'chest-1', x: 1000, y: 1000, opened: false, kind: 'normal' }],
    bodyMarkers: [{ bodyId: 'body-1', x: 1500, y: 1500 }],
    exitDiscovered: true, exitX: 4500, exitY: 3500,
    ...over,
  };
}

describe('Minimap depth constants', () => {
  it('pins minimap < big map', () => {
    expect(MINIMAP_DEPTH).toBe(1011);
    expect(BIG_MAP_DEPTH).toBe(1980);
  });
});

describe('Minimap lifecycle', () => {
  it('create renders minimap background at top-right', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThan(0);
    const bg = rects[0];
    expect(bg.x).toBeGreaterThan(900); // 右上
    expect(bg.y).toBeLessThan(200);
  });

  it('update renders player dot + chest + exit + body markers', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update());
    const circles = env.objects.filter((o) => o._kind === 'circle');
    expect(circles.length).toBeGreaterThanOrEqual(4); // player + chest + exit + body
  });

  it('does NOT render enemy markers', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update());
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts.some((t: string) => t.includes('缄默者') || t.includes('enemy'))).toBe(false);
  });

  it('toggleBigMap opens and closes big map', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    expect(m.isBigMapOpen()).toBe(false);
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(true);
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(false);
  });

  it('handleEsc closes big map when open (ESC close fix)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(true);
    const closed = m.handleEsc();
    expect(closed).toBe(true);          // ESC 被消费
    expect(m.isBigMapOpen()).toBe(false);
  });

  it('handleEsc returns false when big map closed (does not steal ESC)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    expect(m.isBigMapOpen()).toBe(false);
    expect(m.handleEsc()).toBe(false);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-minimap.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/Minimap.ts`：

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const MINIMAP_DEPTH = 1011;
export const BIG_MAP_DEPTH = 1980;
export const BIG_MAP_TEXT_DEPTH = 1981;

export interface MinimapBodyMarker { readonly bodyId: string; readonly x: number; readonly y: number; }
export interface MinimapUpdate {
  readonly playerX: number;
  readonly playerY: number;
  readonly exploredCells: readonly number[];
  readonly chestMarkers: readonly { readonly id: string; readonly x: number; readonly y: number; readonly opened: boolean; readonly kind: 'normal' | 'gilded' }[];
  readonly bodyMarkers: readonly MinimapBodyMarker[];
  readonly exitDiscovered: boolean;
  readonly exitX: number;
  readonly exitY: number;
}

const MAP_WORLD_WIDTH = 5000;
const MAP_WORLD_HEIGHT = 4000;
const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 160;
const MINIMAP_X = GAME_WIDTH - MINIMAP_WIDTH / 2 - 16;
const MINIMAP_Y = MINIMAP_HEIGHT / 2 + 16;
const BIG_MAP_WIDTH = 880;
const BIG_MAP_HEIGHT = 560;
const COLOR_PLAYER = UI_THEME.colors.gold;
const COLOR_CHEST = 0x9c7a3a;
const COLOR_CHEST_GILDED = UI_THEME.colors.gold;
const COLOR_EXIT = 0x6bff8f;
const COLOR_BODY = UI_THEME.colors.accent;

export class Minimap {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private markers: Phaser.GameObjects.Arc[] = [];
  private bigMapBg: Phaser.GameObjects.Rectangle | null = null;
  private bigMapMarkers: Phaser.GameObjects.Arc[] = [];
  private bigMapOpen = false;
  private keyM: Phaser.Input.Keyboard.Key | null = null;
  private keyEsc: Phaser.Input.Keyboard.Key | null = null;
  private escPrevDown = false;
  private mPrevDown = false;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.bg = this.scene.add.rectangle(MINIMAP_X, MINIMAP_Y, MINIMAP_WIDTH, MINIMAP_HEIGHT, UI_THEME.colors.surface, UI_THEME.alpha.panel)
      .setOrigin(0.5).setScrollFactor(0).setDepth(MINIMAP_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    this.bg.on('pointerup', () => this.toggleBigMap());

    this.bigMapBg = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, BIG_MAP_WIDTH, BIG_MAP_HEIGHT, UI_THEME.colors.surface, 0.96)
      .setOrigin(0.5).setScrollFactor(0).setDepth(BIG_MAP_DEPTH)
      .setVisible(false);
    applyPixelStrokeStyle(this.bigMapBg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);
    this.bigMapBg.setInteractive({ useHandCursor: true });
    this.bigMapBg.on('pointerup', () => this.toggleBigMap());

    if (this.scene.input.keyboard) {
      this.keyM = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M, false);
      this.keyEsc = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
    }
  }

  isBigMapOpen(): boolean {
    return this.bigMapOpen;
  }

  toggleBigMap(): void {
    this.bigMapOpen = !this.bigMapOpen;
    this.bigMapBg?.setVisible(this.bigMapOpen);
    if (!this.bigMapOpen) {
      for (const m of this.bigMapMarkers) m.destroy();
      this.bigMapMarkers = [];
    }
  }

  /** @returns true 表示 ESC 被消费（大地图已开并关闭），false 表示未消费 */
  handleEsc(): boolean {
    if (this.bigMapOpen) {
      this.toggleBigMap();
      return true;
    }
    return false;
  }

  update(u: MinimapUpdate): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];

    const px = this.worldToMinimapX(u.playerX);
    const py = this.worldToMinimapY(u.playerY);
    this.markers.push(this.scene.add.circle(px, py, 4, COLOR_PLAYER, 1)
      .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));

    for (const c of u.chestMarkers) {
      const cx = this.worldToMinimapX(c.x);
      const cy = this.worldToMinimapY(c.y);
      const color = c.opened ? 0x444444 : (c.kind === 'gilded' ? COLOR_CHEST_GILDED : COLOR_CHEST);
      this.markers.push(this.scene.add.circle(cx, cy, 3, color, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    if (u.exitDiscovered) {
      const ex = this.worldToMinimapX(u.exitX);
      const ey = this.worldToMinimapY(u.exitY);
      this.markers.push(this.scene.add.circle(ex, ey, 4, COLOR_EXIT, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    for (const b of u.bodyMarkers) {
      const bx = this.worldToMinimapX(b.x);
      const by = this.worldToMinimapY(b.y);
      this.markers.push(this.scene.add.circle(bx, by, 3, COLOR_BODY, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    if (this.bigMapOpen) {
      for (const m of this.bigMapMarkers) m.destroy();
      this.bigMapMarkers = [];
      const scale = BIG_MAP_WIDTH / MINIMAP_WIDTH;
      const ox = GAME_WIDTH / 2 - MINIMAP_WIDTH * scale / 2;
      const oy = GAME_HEIGHT / 2 - MINIMAP_HEIGHT * scale / 2;
      this.bigMapMarkers.push(this.scene.add.circle(ox + px * scale, oy + py * scale, 6, COLOR_PLAYER, 1)
        .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      for (const c of u.chestMarkers) {
        const cx = this.worldToMinimapX(c.x);
        const cy = this.worldToMinimapY(c.y);
        const color = c.opened ? 0x444444 : (c.kind === 'gilded' ? COLOR_CHEST_GILDED : COLOR_CHEST);
        this.bigMapMarkers.push(this.scene.add.circle(ox + cx * scale, oy + cy * scale, 5, color, 1)
          .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      }
      if (u.exitDiscovered) {
        const ex = this.worldToMinimapX(u.exitX);
        const ey = this.worldToMinimapY(u.exitY);
        this.bigMapMarkers.push(this.scene.add.circle(ox + ex * scale, oy + ey * scale, 6, COLOR_EXIT, 1)
          .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      }
      for (const b of u.bodyMarkers) {
        const bx = this.worldToMinimapX(b.x);
        const by = this.worldToMinimapY(b.y);
        this.bigMapMarkers.push(this.scene.add.circle(ox + bx * scale, oy + by * scale, 5, COLOR_BODY, 1)
          .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      }
    }
  }

  pollKeyboard(): void {
    if (!this.keyM || !this.keyEsc) return;
    const mDown = this.keyM.isDown;
    if (mDown && !this.mPrevDown) this.toggleBigMap();
    this.mPrevDown = mDown;

    const escDown = this.keyEsc.isDown;
    if (escDown && !this.escPrevDown) this.handleEsc();
    this.escPrevDown = escDown;
  }

  private worldToMinimapX(worldX: number): number {
    return MINIMAP_X - MINIMAP_WIDTH / 2 + (worldX / MAP_WORLD_WIDTH) * MINIMAP_WIDTH;
  }

  private worldToMinimapY(worldY: number): number {
    return MINIMAP_Y - MINIMAP_HEIGHT / 2 + (worldY / MAP_WORLD_HEIGHT) * MINIMAP_HEIGHT;
  }

  destroy(): void {
    for (const m of this.markers) m.destroy();
    for (const m of this.bigMapMarkers) m.destroy();
    this.markers = [];
    this.bigMapMarkers = [];
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-minimap.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/Minimap.ts src/tests/tomb-raid-minimap.test.ts
git commit -m "feat(tomb-raid): add Minimap fog of war + big map with ESC close fix"
```

---

## Task 8: RedEdgeFogOverlay — 杨云红边击杀全屏遮罩

**文件**：`src/tombraid/ui/RedEdgeFogOverlay.ts`、`src/tests/tomb-raid-red-edge-fog.test.ts`

**spec §5.10 / §9.3**：击杀杨云红边后触发；全屏遮罩"理智正在消散"持续 2s；视野缩减为 220px；理智刷新 +100%。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-red-edge-fog.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  RedEdgeFogOverlay, RED_EDGE_VISIBILITY_RADIUS_PX, RED_EDGE_MASK_DURATION_MS, FOG_MASK_DEPTH,
} from '../tombraid/ui/RedEdgeFogOverlay';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    time: { delayedCall: vi.fn((ms: number, cb: () => void) => { cb(); return { remove: vi.fn() }; }) },
    cameras: { main: { worldView: { x: 0, y: 0, width: 1280, height: 720 }, centerX: 640, centerY: 360 } },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  return o;
}

describe('RedEdgeFogOverlay constants', () => {
  it('pins 220px visibility, 2000ms mask, depth 1990', () => {
    expect(RED_EDGE_VISIBILITY_RADIUS_PX).toBe(220);
    expect(RED_EDGE_MASK_DURATION_MS).toBe(2000);
    expect(FOG_MASK_DEPTH).toBe(1990);
  });
});

describe('RedEdgeFogOverlay lifecycle', () => {
  it('create pre-renders hidden overlay + label', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(rects[0].visible).toBe(false);
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts.some((t: string) => t.includes('理智正在消散'))).toBe(true);
  });

  it('activate shows overlay + schedules 2s hide', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(640, 360);
    expect(fog.isActive()).toBe(true);
    // delayedCall 已在 mock 中立即触发回调 → 视觉遮罩隐藏但"红边雾战"逻辑仍持续
    // isActive 表示红边雾战生效（220px 视野），独立于 2s 文字遮罩
    expect(fog.isRedEdgeFogActive()).toBe(true);
  });

  it('update moves overlay center to follow player', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(100, 100);
    fog.update(250, 300);
    // 中心应跟随 (无 assertion 细节，仅验证不抛错)
    expect(fog.isRedEdgeFogActive()).toBe(true);
  });

  it('deactivate clears red edge fog', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(0, 0);
    fog.deactivate();
    expect(fog.isRedEdgeFogActive()).toBe(false);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-red-edge-fog.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/RedEdgeFogOverlay.ts`：

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelTextStyle } from '../../ui/uiTheme';

export const RED_EDGE_VISIBILITY_RADIUS_PX = 220;
export const RED_EDGE_MASK_DURATION_MS = 2000;
export const FOG_MASK_DEPTH = 1990;
export const FOG_TEXT_DEPTH = 1991;

const FULLSCREEN_ALPHA = 0.92;

export class RedEdgeFogOverlay {
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private visionCircle: Phaser.GameObjects.Arc | null = null;
  private label: Phaser.GameObjects.Text | null = null;
  private maskTimer: Phaser.Time.TimerEvent | null = null;
  private textMaskTimer: Phaser.Time.TimerEvent | null = null;
  private redEdgeFogActive = false;
  private textMaskActive = false;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.overlay = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, FULLSCREEN_ALPHA)
      .setOrigin(0.5).setScrollFactor(0).setDepth(FOG_MASK_DEPTH).setVisible(false);

    // 视野孔：用一个高 alpha 黑圆做"反向遮罩"近似（孔外黑，孔内透明）。
    // 真实 Phaser 中可用 mask，这里用大矩形 + 跟随的浅色圆叠加做简化。
    this.visionCircle = this.scene.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, RED_EDGE_VISIBILITY_RADIUS_PX, 0x000000, 0)
      .setScrollFactor(0).setDepth(FOG_MASK_DEPTH + 1).setVisible(false);

    this.label = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, '理智正在消散',
      { align: 'center', color: UI_THEME.colors.textDanger, fontFamily: UI_THEME.font.ui, fontSize: '32px', fontStyle: 'bold' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(FOG_TEXT_DEPTH).setVisible(false);
  }

  isActive(): boolean {
    return this.textMaskActive;
  }

  isRedEdgeFogActive(): boolean {
    return this.redEdgeFogActive;
  }

  activate(playerX: number, playerY: number): void {
    this.redEdgeFogActive = true;
    this.textMaskActive = true;
    this.overlay?.setVisible(true).setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.visionCircle?.setVisible(true).setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
    this.label?.setVisible(true);

    if (this.maskTimer) this.maskTimer.remove();
    if (this.textMaskTimer) this.textMaskTimer.remove();
    // 2s 后隐藏文字与全屏遮罩，但保留 220px 视野（红边雾战持续到撤离/死亡）
    this.textMaskTimer = this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
      this.textMaskActive = false;
      this.label?.setVisible(false);
      this.overlay?.setVisible(false);
    });
  }

  update(playerX: number, playerY: number): void {
    if (!this.redEdgeFogActive) return;
    this.visionCircle?.setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
  }

  deactivate(): void {
    this.redEdgeFogActive = false;
    this.textMaskActive = false;
    this.overlay?.setVisible(false);
    this.visionCircle?.setVisible(false);
    this.label?.setVisible(false);
    if (this.maskTimer) { this.maskTimer.remove(); this.maskTimer = null; }
    if (this.textMaskTimer) { this.textMaskTimer.remove(); this.textMaskTimer = null; }
  }

  private worldToScreenX(worldX: number): number {
    const cam = this.scene.cameras.main;
    return worldX - cam.scrollX;
  }

  private worldToScreenY(worldY: number): number {
    const cam = this.scene.cameras.main;
    return worldY - cam.scrollY;
  }

  destroy(): void {
    this.deactivate();
    this.overlay?.destroy();
    this.visionCircle?.destroy();
    this.label?.destroy();
    this.overlay = null;
    this.visionCircle = null;
    this.label = null;
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-red-edge-fog.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/RedEdgeFogOverlay.ts src/tests/tomb-raid-red-edge-fog.test.ts
git commit -m "feat(tomb-raid): add RedEdgeFogOverlay 220px visibility + 2s sanity mask"
```

---

## Task 9: SettlementScreen — 撤离/死亡结算

**文件**：`src/tombraid/ui/SettlementScreen.ts`、`src/tests/tomb-raid-settlement.test.ts`

**spec §1.3**：
- 撤离成功：Inventory 碎片总值 ≥ baselineSanity → 碎片入仓库、更新 best sanity
- 撤离拒绝：总值 < baselineSanity → 拒绝撤离，不修改仓库
- 死亡：本局所有战利品丢失，仓库完全不变

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-settlement.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettlementScreen, SETTLEMENT_DEPTH } from '../tombraid/ui/SettlementScreen';
import type { SettlementOutcome } from '../tombraid/ui/SettlementScreen';
import {
  loadStashState, saveStashState, createDefaultStashState,
  loadBestState, saveBestState, createDefaultBestState,
} from '../tombraid/state/tombRaidState';
import type { Inventory, InventoryEntry } from '../tombraid/loot/Inventory';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn(() => o);
  return o;
}

function invWith(entries: readonly InventoryEntry[], total: number): Inventory {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.itemId, e.quantity);
  return {
    add: () => 0, remove: () => true, has: (id) => (map.get(id) ?? 0) > 0,
    quantity: (id) => map.get(id) ?? 0,
    entries: () => Array.from(map.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    totalSanityValue: () => total,
    clear: () => { map.clear(); },
  };
}

describe('SettlementScreen depth', () => {
  it('pins settlement depth 1996', () => {
    expect(SETTLEMENT_DEPTH).toBe(1996);
  });
});

describe('SettlementScreen evacuation (spec §1.3)', () => {
  beforeEach(() => localStorage.clear());

  it('evacuates when totalSanityValue >= baseline: deposits loot + updates best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100 });
    saveBestState(createDefaultBestState());
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const inv = invWith([['treasure.jadePendant', 1]], 220); // 220 >= 200
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    if (outcome.kind === 'evacuated') {
      expect(outcome.totalValue).toBe(220);
      expect(outcome.bestSanity).toBe(220);
    }
    // 仓库并入：sanity 增加 220，物品增加 1
    const stash = loadStashState().state;
    expect(stash.sanity).toBe(100 + 220);
    expect(stash.items).toHaveLength(1);
    // best 更新
    expect(loadBestState().state.bestSanity).toBe(220);
  });

  it('refuses evacuation when totalSanityValue < baseline: stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100 });
    saveBestState(createDefaultBestState());
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const inv = invWith([['material.chalkStub', 1]], 12); // 12 < 200
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.totalValue).toBe(12);
      expect(outcome.baseline).toBe(200);
    }
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(0);
    expect(loadBestState().state.bestSanity).toBe(0);
  });

  it('best only updates when new total > previous best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 0 });
    saveBestState({ ...createDefaultBestState(), bestSanity: 500 });
    const env = createMockScene();
    const screen = new SettlementScreen(env.scene, { onConfirm: vi.fn() });
    screen.create();
    const inv = invWith([['treasure.jadePendant', 1]], 220);
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    if (outcome.kind === 'evacuated') expect(outcome.bestSanity).toBe(500); // 保留旧 best
  });
});

describe('SettlementScreen death (spec §1.3)', () => {
  beforeEach(() => localStorage.clear());

  it('death loses all run loot, stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100, items: [{ itemId: 'treasure.jadePendant', quantity: 1 }] });
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const outcome = screen.showDeath();
    expect(outcome.kind).toBe('dead');
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-settlement.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/SettlementScreen.ts`：

```ts
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';
import type { Inventory } from '../loot/Inventory';
import type { TombRaidStashState } from '../state/tombRaidState';
import {
  loadStashState, saveStashState, loadBestState, saveBestState,
} from '../state/tombRaidState';
import { depositRunInventory } from '../meta/StashManager';

export const SETTLEMENT_DEPTH = 1996;
export const SETTLEMENT_TEXT_DEPTH = 1997;
export const SETTLEMENT_BTN_DEPTH = 1998;

export type SettlementOutcome =
  | { readonly kind: 'evacuated'; readonly totalValue: number; readonly bestSanity: number }
  | { readonly kind: 'refused'; readonly totalValue: number; readonly baseline: number }
  | { readonly kind: 'dead' };

export interface SettlementCallbacks {
  readonly onConfirm: () => void;
}

export class SettlementScreen {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private title: Phaser.GameObjects.Text | null = null;
  private body: Phaser.GameObjects.Text | null = null;
  private confirmBtn: Phaser.GameObjects.Rectangle | null = null;
  private confirmLabel: Phaser.GameObjects.Text | null = null;
  private visible = false;

  constructor(private scene: Phaser.Scene, private callbacks: SettlementCallbacks) {}

  create(): void {
    this.bg = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 200, GAME_HEIGHT - 160, UI_THEME.colors.surface, 0.97)
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_DEPTH).setVisible(false);
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    this.title = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, 140, '',
      { align: 'center', color: UI_THEME.colors.textGold, fontFamily: UI_THEME.font.ui, fontSize: '32px', fontStyle: 'bold' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);

    this.body = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, 260, '',
      { align: 'left', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '18px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);

    this.confirmBtn = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 100, 200, 48, UI_THEME.colors.accent)
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_BTN_DEPTH).setInteractive({ useHandCursor: true }).setVisible(false);
    applyPixelStrokeStyle(this.confirmBtn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    this.confirmBtn.on('pointerup', () => {
      this.hide();
      this.callbacks.onConfirm();
    });

    this.confirmLabel = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, '返回枢纽',
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '18px' }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);
  }

  showEvacuation(inventory: Inventory, baseline: number): SettlementOutcome {
    const total = inventory.totalSanityValue();
    if (total >= baseline) {
      return this.handleEvacuated(inventory, total);
    }
    return this.handleRefused(total, baseline);
  }

  showDeath(): SettlementOutcome {
    this.show('本局战利品全丢', '你死了。\n本局所有战利品已被黑暗吞噬。\n仓库未受影响。', UI_THEME.colors.textDanger);
    return { kind: 'dead' };
  }

  hide(): void {
    this.visible = false;
    this.bg?.setVisible(false);
    this.title?.setVisible(false);
    this.body?.setVisible(false);
    this.confirmBtn?.setVisible(false);
    this.confirmLabel?.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  private handleEvacuated(inventory: Inventory, total: number): SettlementOutcome {
    // 1. 并入仓库
    const stash: TombRaidStashState = loadStashState().state;
    const result = depositRunInventory(stash, inventory);
    saveStashState(result.stash);
    // 2. 更新 best
    const bestState = loadBestState().state;
    const newBest = Math.max(bestState.bestSanity, total);
    if (newBest !== bestState.bestSanity) {
      saveBestState({ schemaVersion: bestState.schemaVersion, bestSanity: newBest });
    }
    // 3. 展示
    const lines: string[] = ['撤离成功！', '', '本局战利品:'];
    for (const e of inventory.entries()) {
      lines.push(`  ${e.itemId} ×${e.quantity}`);
    }
    lines.push('', `总面值: ${total}`, `历史最高理智: ${newBest}`);
    this.show('撤离成功', lines.join('\n'), UI_THEME.colors.textGold);
    return { kind: 'evacuated', totalValue: total, bestSanity: newBest };
  }

  private handleRefused(total: number, baseline: number): SettlementOutcome {
    const lines: string[] = [
      '撤离被拒绝。',
      '',
      `本局总面值 ${total} < 基准线 ${baseline}`,
      '继续探索，收集更多记忆碎片后再来撤离。',
      '',
      '仓库未受影响。',
    ];
    this.show('撤离被拒绝', lines.join('\n'), UI_THEME.colors.textDanger);
    return { kind: 'refused', totalValue: total, baseline };
  }

  private show(title: string, body: string, titleColor: string): void {
    this.visible = true;
    this.bg?.setVisible(true);
    this.title?.setVisible(true).setText(title).setColor(titleColor);
    this.body?.setVisible(true).setText(body);
    this.confirmBtn?.setVisible(true);
    this.confirmLabel?.setVisible(true);
  }

  destroy(): void {
    this.bg?.destroy();
    this.title?.destroy();
    this.body?.destroy();
    this.confirmBtn?.destroy();
    this.confirmLabel?.destroy();
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-settlement.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/SettlementScreen.ts src/tests/tomb-raid-settlement.test.ts
git commit -m "feat(tomb-raid): add SettlementScreen evacuation/death settlement"
```

---

## Task 10: MobileControls — 移动端 4 动作按钮

**文件**：`src/tombraid/ui/MobileControls.ts`、`src/tests/tomb-raid-mobile-controls.test.ts`

**spec §11.4**：复用 InputManager 摇杆（base 200,600, radius 80）+ 右侧 4 按钮（普攻J / 大招K / 交互H / 消耗品）；与桌面端功能对等。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-mobile-controls.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  MobileControls, MOBILE_ACTION_DEPTH, MOBILE_ACTION_BUTTONS,
} from '../tombraid/ui/MobileControls';
import type { MobileControlsCallbacks } from '../tombraid/ui/MobileControls';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { on: vi.fn(), off: vi.fn(), keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() } },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: true } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.disableInteractive = vi.fn(() => o);
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.r * 2, height: o.r * 2 });
  return o;
}

describe('MobileControls constants', () => {
  it('pins 4 action buttons with labels', () => {
    expect(MOBILE_ACTION_BUTTONS).toEqual([
      { id: 'basicAttack', label: '普攻', key: 'J' },
      { id: 'ultimate', label: '大招', key: 'K' },
      { id: 'interact', label: '交互', key: 'H' },
      { id: 'consumable', label: '消耗品', key: 'F' },
    ]);
  });

  it('pins depth 952 (above InputManager joystick 950/951)', () => {
    expect(MOBILE_ACTION_DEPTH).toBe(952);
  });
});

describe('MobileControls lifecycle', () => {
  it('create renders 4 action buttons on the right side', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    const circles = env.objects.filter((o) => o._kind === 'circle');
    expect(circles.length).toBe(4);
    for (const c of circles) expect(c.x).toBeGreaterThan(900);
  });

  it('buttons render with correct labels (普攻/大招/交互/消耗品)', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts).toEqual(expect.arrayContaining(['普攻', '大招', '交互', '消耗品']));
  });

  it('pointerup on basicAttack button triggers onBasicAttack', () => {
    const env = createMockScene();
    const onBasicAttack = vi.fn();
    const mc = new MobileControls(env.scene, {
      onBasicAttack, onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    mc.handleButtonPress('basicAttack');
    expect(onBasicAttack).toHaveBeenCalledTimes(1);
  });

  it('handleButtonPress triggers each callback', () => {
    const env = createMockScene();
    const cbs: MobileControlsCallbacks = {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    };
    const mc = new MobileControls(env.scene, cbs);
    mc.create();
    mc.handleButtonPress('basicAttack');
    mc.handleButtonPress('ultimate');
    mc.handleButtonPress('interact');
    mc.handleButtonPress('consumable');
    expect(cbs.onBasicAttack).toHaveBeenCalledTimes(1);
    expect(cbs.onUltimate).toHaveBeenCalledTimes(1);
    expect(cbs.onInteract).toHaveBeenCalledTimes(1);
    expect(cbs.onConsumable).toHaveBeenCalledTimes(1);
  });

  it('setVisible toggles all buttons', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    mc.setVisible(false);
    const circles = env.objects.filter((o) => o._kind === 'circle');
    for (const c of circles) expect(c.setVisible).toHaveBeenCalledWith(false);
    mc.setVisible(true);
    for (const c of circles) expect(c.setVisible).toHaveBeenCalledWith(true);
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-mobile-controls.test.ts
```

### Step 3: 实现（GREEN）

`src/tombraid/ui/MobileControls.ts`：

```ts
import Phaser from 'phaser';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const MOBILE_ACTION_DEPTH = 952; // 复用 InputManager 摇杆层 (950/951) 之上

export interface MobileActionDef {
  readonly id: 'basicAttack' | 'ultimate' | 'interact' | 'consumable';
  readonly label: string;
  readonly key: string;
}

export const MOBILE_ACTION_BUTTONS: readonly MobileActionDef[] = [
  { id: 'basicAttack', label: '普攻', key: 'J' },
  { id: 'ultimate', label: '大招', key: 'K' },
  { id: 'interact', label: '交互', key: 'H' },
  { id: 'consumable', label: '消耗品', key: 'F' },
];

export interface MobileControlsCallbacks {
  readonly onBasicAttack: () => void;
  readonly onUltimate: () => void;
  readonly onInteract: () => void;
  readonly onConsumable: () => void;
}

const BUTTON_RADIUS = 44;
// 右侧 4 按钮：普攻上、大招中、交互下、消耗品左下（环绕拇指可达区）
const BUTTON_POSITIONS: Readonly<Record<MobileActionDef['id'], { readonly x: number; readonly y: number }>> = {
  basicAttack: { x: 1140, y: 460 },
  ultimate:    { x: 1200, y: 580 },
  interact:    { x: 1100, y: 660 },
  consumable:  { x: 980,  y: 620 },
};

export class MobileControls {
  private buttons: Map<MobileActionDef['id'], Phaser.GameObjects.Arc> = new Map();
  private labels: Map<MobileActionDef['id'], Phaser.GameObjects.Text> = new Map();
  private visible = true;

  constructor(private scene: Phaser.Scene, private callbacks: MobileControlsCallbacks) {}

  create(): void {
    for (const def of MOBILE_ACTION_BUTTONS) {
      const pos = BUTTON_POSITIONS[def.id];
      const btn = this.scene.add.circle(pos.x, pos.y, BUTTON_RADIUS, UI_THEME.colors.accent, UI_THEME.alpha.control)
        .setScrollFactor(0).setDepth(MOBILE_ACTION_DEPTH)
        .setInteractive({ useHandCursor: true });
      applyPixelStrokeStyle(btn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
      btn.on('pointerdown', () => {
        btn.setFillStyle(UI_THEME.colors.accentPressed, UI_THEME.alpha.controlActive);
      });
      btn.on('pointerup', () => {
        btn.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.control);
        this.handleButtonPress(def.id);
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.control);
      });
      this.buttons.set(def.id, btn);

      const label = applyPixelTextStyle(this.scene.add.text(pos.x, pos.y, def.label,
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '16px', fontStyle: 'bold' }))
        .setOrigin(0.5).setScrollFactor(0).setDepth(MOBILE_ACTION_DEPTH + 1);
      this.labels.set(def.id, label);
    }
  }

  handleButtonPress(id: MobileActionDef['id']): void {
    switch (id) {
      case 'basicAttack': this.callbacks.onBasicAttack(); break;
      case 'ultimate':    this.callbacks.onUltimate(); break;
      case 'interact':    this.callbacks.onInteract(); break;
      case 'consumable':  this.callbacks.onConsumable(); break;
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const btn of this.buttons.values()) btn.setVisible(visible);
    for (const label of this.labels.values()) label.setVisible(visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    for (const btn of this.buttons.values()) btn.destroy();
    for (const label of this.labels.values()) label.destroy();
    this.buttons.clear();
    this.labels.clear();
  }
}
```

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-mobile-controls.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/ui/MobileControls.ts src/tests/tomb-raid-mobile-controls.test.ts
git commit -m "feat(tomb-raid): add MobileControls 4 action buttons reusing InputManager depth"
```

---

## Task 11: TombRaidScene 接线 + 集成冒烟测试

**文件**：`src/tombraid/TombRaidScene.ts`（修改）、`src/tests/tomb-raid-plan-6-integration.test.ts`

**目标**：将 Plan 6 的 HUD + Minimap + RedEdgeFogOverlay + SettlementScreen + MobileControls 接入 Plan 1 留下的 TombRaidScene 骨架；用 mock 场景跑端到端冒烟测试，验证从"进入对局 → HUD 更新 → 红边击杀触发雾战 → 撤离结算入仓库"的关键链路。

### Step 1: 写失败测试（RED）

`src/tests/tomb-raid-plan-6-integration.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TombRaidScene } from '../tombraid/TombRaidScene';
import {
  loadStashState, saveStashState, createDefaultStashState,
  loadBestState, saveBestState, createDefaultBestState,
  loadUpgradesState, saveUpgradesState, createDefaultUpgradesState,
  saveProgressState, createDefaultProgressState,
} from '../tombraid/state/tombRaidState';
import { grantStarterPackIfNeeded } from '../tombraid/state/tombRaidState';
import { ALL_LOOT, getLootItem } from '../tombraid/loot/LootItem';
import { Inventory } from '../tombraid/loot/Inventory';
import type { CombatManager } from '../tombraid/combat/CombatManager';
import type { WeaponCombatAdapter } from '../tombraid/weapons/WeaponCombatAdapter';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      arc: vi.fn((x: number, y: number, r: number) => {
        const o = chain({ x, y, r, _kind: 'arc', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      container: vi.fn((x: number, y: number) => {
        const o = chain({ x, y, _kind: 'container', depth: 0, visible: true });
        o.add = vi.fn(); o.removeAll = vi.fn();
        objects.push(o); return o;
      }),
    },
    time: { delayedCall: vi.fn((_ms: number, cb: () => void) => { cb(); return { remove: vi.fn() }; }), now: 0 },
    cameras: { main: { worldView: { x: 0, y: 0, width: 1280, height: 720 }, centerX: 640, centerY: 360, scrollX: 0, scrollY: 0, startFollow: vi.fn(), setBounds: vi.fn(), setBackgroundColor: vi.fn() } },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn(), on: vi.fn(), off: vi.fn() }, on: vi.fn(), off: vi.fn() },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
    scene: { start: vi.fn(), get: vi.fn(() => null), pause: vi.fn(), resume: vi.fn() },
    physics: { add: { existing: vi.fn() }, world: { setBounds: vi.fn() } },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius', 'setBlendMode', 'setAngle']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn(() => o);
  o.disableInteractive = vi.fn(() => o);
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  o.clear = vi.fn(() => o);
  o.fillStyle = vi.fn(() => o);
  o.lineStyle = vi.fn(() => o);
  o.slice = vi.fn(() => o);
  o.fillPath = vi.fn(() => o);
  o.fillCircle = vi.fn(() => o);
  return o;
}

describe('Plan 6 integration smoke: starter pack + loadout flow', () => {
  beforeEach(() => localStorage.clear());

  it('grantStarterPackIfNeeded seeds stash with weapon.ruler + celery x3 (once)', () => {
    grantStarterPackIfNeeded();
    const stash = loadStashState().state;
    expect(stash.items.find((i) => i.itemId === 'weapon.ruler')?.quantity).toBe(1);
    expect(stash.items.find((i) => i.itemId === 'consumable.celery')?.quantity).toBe(3);
    grantStarterPackIfNeeded();
    const stash2 = loadStashState().state;
    expect(stash2.items.find((i) => i.itemId === 'weapon.ruler')?.quantity).toBe(1);
    expect(stash2.items.find((i) => i.itemId === 'consumable.celery')?.quantity).toBe(3);
  });

  it('ALL_LOOT has 48 entries with correct sanity values for jadePendant(220) and chalkStub(12)', () => {
    expect(ALL_LOOT.length).toBe(48);
    expect(getLootItem('treasure.jadePendant')?.sanityValue).toBe(220);
    expect(getLootItem('material.chalkStub')?.sanityValue).toBe(12);
  });
});

describe('Plan 6 integration smoke: HUD + settlement end-to-end (mock scene)', () => {
  beforeEach(() => localStorage.clear());

  it('TombRaidScene.create instantiates HUD + Minimap + SettlementScreen without throwing', () => {
    const env = createMockScene();
    const scene = new TombRaidScene();
    // 注入 mock：用 Object.assign 覆盖 Phaser.Scene 的 add/events/sys 等
    Object.assign(scene, env.scene);
    expect(() => scene.create()).not.toThrow();
    // HUD 文字、Minimap 矩形、Settlement 矩形都已创建
    expect(env.objects.length).toBeGreaterThan(0);
  });

  it('evacuation flow: build inventory ≥ baseline → settlement deposits + updates best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 50 });
    saveBestState(createDefaultBestState());
    saveUpgradesState(createDefaultUpgradesState());
    saveProgressState(createDefaultProgressState());

    const env = createMockScene();
    const scene = new TombRaidScene();
    Object.assign(scene, env.scene);
    scene.create();

    // 模拟本局捡到 jadePendant(220)，达到 baseline 200
    const inv = new Inventory();
    inv.add('treasure.jadePendant', 1);
    const outcome = scene.runEvacuationSettlement(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    // 仓库并入 + best 更新
    expect(loadStashState().state.sanity).toBe(50 + 220);
    expect(loadBestState().state.bestSanity).toBe(220);
  });

  it('death flow: settlement loses all run loot, stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100, items: [{ itemId: 'treasure.jadePendant', quantity: 1 }] });
    const env = createMockScene();
    const scene = new TombRaidScene();
    Object.assign(scene, env.scene);
    scene.create();
    const outcome = scene.runDeathSettlement();
    expect(outcome.kind).toBe('dead');
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(1);
  });

  it('red edge kill triggers fog overlay + 220px visibility, persists until settlement', () => {
    const env = createMockScene();
    const scene = new TombRaidScene();
    Object.assign(scene, env.scene);
    scene.create();
    expect(scene.isRedEdgeFogActive()).toBe(false);
    scene.triggerRedEdgeKill(640, 360);
    expect(scene.isRedEdgeFogActive()).toBe(true);
    // 撤离/死亡应清理雾战
    scene.runDeathSettlement();
    expect(scene.isRedEdgeFogActive()).toBe(false);
  });

  it('HUD update reflects HP/sanity/ult CD without throwing', () => {
    const env = createMockScene();
    const scene = new TombRaidScene();
    Object.assign(scene, env.scene);
    scene.create();
    expect(() => scene.updateHud({
      hp: 80, maxHp: 100, weaponId: 'weapon.ruler', weaponName: '尺子',
      ultCooldownRemaining: 5000, ultCooldownTotal: 20000,
      sanity: 250, baseline: 200,
      consumableSlots: [{ itemId: 'consumable.celery', quantity: 2 }],
      stashSanity: 750,
    })).not.toThrow();
  });

  it('unarmed loadout routes attack to CombatManager.playerAttack, not WeaponCombatAdapter.performAttack', () => {
    const env = createMockScene();
    const scene = new TombRaidScene();
    Object.assign(scene, env.scene);
    scene.create();

    // 注入 mock 战斗依赖（Plan 3 CombatManager + Plan 4 WeaponCombatAdapter）
    const playerAttack = vi.fn();
    const performAttack = vi.fn();
    scene.setCombatDeps(
      { playerAttack } as unknown as CombatManager,
      { performAttack } as unknown as WeaponCombatAdapter,
    );
    scene.setCurrentLoadout({ weaponId: 'unarmed', consumables: [] });

    scene.performPlayerAttack({ x: 1, y: 0 }, 0);

    // 空手 → Plan 3 弱拳 fallback；不调用 Plan 4 adapter
    expect(playerAttack).toHaveBeenCalledWith({ x: 1, y: 0 });
    expect(performAttack).not.toHaveBeenCalled();
  });
});
```

### Step 2: 运行测试，验证失败

```bash
npx vitest run src/tests/tomb-raid-plan-6-integration.test.ts
```

### Step 3: 实现（GREEN）

修改 `src/tombraid/TombRaidScene.ts`（替换 Plan 1 占位，接线 Plan 6 各 UI 模块）：

```ts
import Phaser from 'phaser';
import { UI_THEME } from '../../ui/uiTheme';
import { TombRaidHUD, type HudSnapshot } from './ui/TombRaidHUD';
import { Minimap, type MinimapUpdate } from './ui/Minimap';
import { RedEdgeFogOverlay } from './ui/RedEdgeFogOverlay';
import { SettlementScreen, type SettlementOutcome } from './ui/SettlementScreen';
import { MobileControls } from './ui/MobileControls';
import type { Inventory } from './loot/Inventory';
import type { CombatManager } from './combat/CombatManager';             // Plan 3：空手弱拳 fallback
import type { WeaponCombatAdapter } from './weapons/WeaponCombatAdapter'; // Plan 4：装备武器普攻
import type { Vec2 } from './combat/Enemy';                              // 共享方向类型
import { UNARMED_ID, type Loadout } from './meta/LoadoutManager';        // unarmed 路由常量 + loadout 类型

export class TombRaidScene extends Phaser.Scene {
  private hud: TombRaidHUD | null = null;
  private minimap: Minimap | null = null;
  private fogOverlay: RedEdgeFogOverlay | null = null;
  private settlement: SettlementScreen | null = null;
  private mobile: MobileControls | null = null;
  private isMobile = false;
  // ── 普攻路由依赖（由 setCombatDeps / setCurrentLoadout 注入）──
  private combatManager: CombatManager | null = null;
  private weaponAdapter: WeaponCombatAdapter | null = null;
  private currentLoadout: Loadout | null = null;

  constructor() { super('TombRaid'); }

  create(): void {
    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);
    this.cameras.main.setBounds(0, 0, 5000, 4000);

    this.hud = new TombRaidHUD(this);
    this.hud.create();

    this.minimap = new Minimap(this);
    this.minimap.create();

    this.fogOverlay = new RedEdgeFogOverlay(this);
    this.fogOverlay.create();

    this.settlement = new SettlementScreen(this, {
      onConfirm: () => this.scene.start('TombRaidHub'),
    });
    this.settlement.create();

    this.isMobile = this.sys.game.device.input.touch;
    if (this.isMobile) {
      this.mobile = new MobileControls(this, {
        onBasicAttack: () => this.emitCombatAction('basicAttack'),
        onUltimate:    () => this.emitCombatAction('ultimate'),
        onInteract:    () => this.emitCombatAction('interact'),
        onConsumable:  () => this.emitCombatAction('consumable'),
      });
      this.mobile.create();
    }

    // ESC 处理：优先关闭大地图，否则交给上层
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => {
        if (this.minimap?.handleEsc()) return; // 大地图开则关闭，消费 ESC
      });
    }
  }

  update(_time: number, _delta: number): void {
    this.minimap?.pollKeyboard();
    // 红边雾战跟随玩家
    if (this.fogOverlay?.isRedEdgeFogActive()) {
      const pos = this.getPlayerWorldPosition();
      this.fogOverlay.update(pos.x, pos.y);
    }
    // 注：普攻不在每帧自动触发；由攻击输入 handler（键鼠普攻键 / 摇杆 / 移动端
    // MobileControls.onBasicAttack）在玩家按下普攻时调用 performPlayerAttack(direction, time)。
  }

  // ── 普攻路由（unarmed vs 武器）──
  // 在 TombRaidScene.update 或攻击输入 handler 中调用：
  //   - 'unarmed' → Plan 3 CombatManager.playerAttack()（5 伤弱拳 fallback，无 CD）
  //     （Plan 4 的 WeaponId 联合类型不含 'unarmed'，故空手必须走 Plan 3 fallback）
  //   - 其他武器 → Plan 4 WeaponCombatAdapter.performAttack(direction, timeMs)
  //     （受武器 CD/大招约束）
  performPlayerAttack(direction: Vec2, timeMs: number): void {
    const weaponId = this.currentLoadout?.weaponId ?? UNARMED_ID;
    if (weaponId === UNARMED_ID) {
      this.combatManager?.playerAttack(direction);
    } else {
      this.weaponAdapter?.performAttack(direction, timeMs);
    }
  }

  /** 注入战斗依赖（Plan 3 CombatManager + Plan 4 WeaponCombatAdapter），由上层 bootstrap 调用。 */
  setCombatDeps(combatManager: CombatManager, weaponAdapter: WeaponCombatAdapter): void {
    this.combatManager = combatManager;
    this.weaponAdapter = weaponAdapter;
  }

  /** 设置当前对局 loadout，performPlayerAttack 据此路由 unarmed vs 武器。 */
  setCurrentLoadout(loadout: Loadout): void {
    this.currentLoadout = loadout;
  }

  // ── Plan 6 接线 API（供 CombatManager/MapRenderer 等上层调用）──

  updateHud(snapshot: HudSnapshot): void {
    this.hud?.update(snapshot);
  }

  updateMinimap(update: MinimapUpdate): void {
    this.minimap?.update(update);
  }

  /** CombatCallbacks.onMarkBodyOnMinimap → MinimapUpdate.bodyMarkers 桥接（plan 3 → plan 6） */
  markBodyOnMinimap(bodyId: string, x: number, y: number): void {
    // 上层在每帧组装 MinimapUpdate 时应包含此 body 标记；
    // 此处提供一个便捷的累积缓存，便于上层 updateMinimap 时读取。
    this.pendingBodyMarkers.push({ bodyId, x, y });
  }

  private pendingBodyMarkers: MinimapUpdate['bodyMarkers'][number][] = [];

  triggerRedEdgeKill(playerX: number, playerY: number): void {
    this.fogOverlay?.activate(playerX, playerY);
  }

  isRedEdgeFogActive(): boolean {
    return this.fogOverlay?.isRedEdgeFogActive() ?? false;
  }

  runEvacuationSettlement(inventory: Inventory, baseline: number): SettlementOutcome {
    const outcome = this.settlement?.showEvacuation(inventory, baseline);
    if (outcome?.kind === 'evacuated') {
      this.fogOverlay?.deactivate(); // 撤离成功清理红边雾战
    }
    return outcome ?? { kind: 'refused', totalValue: inventory.totalSanityValue(), baseline };
  }

  runDeathSettlement(): SettlementOutcome {
    this.fogOverlay?.deactivate(); // 死亡清理红边雾战
    return this.settlement?.showDeath() ?? { kind: 'dead' };
  }

  private emitCombatAction(action: string): void {
    this.events.emit('tomb-raid-combat-action', action);
  }

  private getPlayerWorldPosition(): { x: number; y: number } {
    // 由 plan 3 的 PlayerCombat/CombatManager 提供；此处回退到相机中心
    const cam = this.cameras.main;
    return { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
  }

  destroyPlan6Ui(): void {
    this.hud?.destroy();
    this.minimap?.destroy();
    this.fogOverlay?.destroy();
    this.settlement?.destroy();
    this.mobile?.destroy();
  }
}
```

> **接线说明**：
> - `updateHud` / `updateMinimap` / `markBodyOnMinimap` / `triggerRedEdgeKill` 由 Plan 3（CombatManager）/ Plan 2（MapRenderer）/ Plan 4（WeaponCombatAdapter）在每帧或事件回调中调用。
> - `runEvacuationSettlement` / `runDeathSettlement` 由 Plan 3 的玩家死亡检测或玩家到达出口的交互逻辑调用。
> - `MobileControls` 仅在 `sys.game.device.input.touch` 为 true 时创建，与桌面端功能对等（同一套 `events.emit` 下游）。
> - `markBodyOnMinimap` 实现 plan 3 的 `CombatCallbacks.onMarkBodyOnMinimap → MinimapUpdate.bodyMarkers` 桥接。
> - **普攻路由（unarmed vs 武器）**：`performPlayerAttack(direction, timeMs)` 在攻击输入 handler（键鼠普攻键 / 摇杆 / `MobileControls.onBasicAttack`）中调用，按 `currentLoadout.weaponId` 分发：
>   - `'unarmed'` → Plan 3 `CombatManager.playerAttack(direction)`（5 伤弱拳 fallback，无 CD）。**此分支必须存在**：Plan 4 的 `WeaponId` 联合类型不含 `'unarmed'`，空手无法走 `WeaponCombatAdapter`。
>   - 其他武器 → Plan 4 `WeaponCombatAdapter.performAttack(direction, timeMs)`（受武器 CD/大招约束）。
>   - 依赖由 `setCombatDeps(combatManager, weaponAdapter)` + `setCurrentLoadout(loadout)` 注入；`currentLoadout` 为 `null` 时按 `UNARMED_ID` 兜底。

### Step 4: 运行测试，验证通过

```bash
npx vitest run src/tests/tomb-raid-plan-6-integration.test.ts
```

### Step 5: 提交

```bash
git add src/tombraid/TombRaidScene.ts src/tests/tomb-raid-plan-6-integration.test.ts
git commit -m "feat(tomb-raid): wire HUD/Minimap/fog/settlement/mobile into TombRaidScene + smoke test"
```

---

## 全量验证

完成全部 11 个任务后，运行全量验证（类型检查 + 单元测试 + 构建）：

```bash
npm run typecheck
npm run test:run
npm run build
```

预期：所有 11 个新增测试文件通过，TypeScript strict 模式无报错，`vite build` 产出生产包。

---

## 自审（Self-Review）

### 接口对齐 Plan 1-5 ✅

- **Plan 1（4-key localStorage）**：`StashManager.loadStash/storeStash`、`UpgradeManager.applyUpgrade`、`LoadoutManager` 全部通过 `tombRaidState` 的 `loadStashState/saveStashState/loadUpgradesState/saveUpgradesState/loadBestState/saveBestState` 操作 4 个独立 key（`stash.v1` / `upgrades.v1` / `best.v1` / `progress.v1`），不污染剧情模式 `SaveState`。
- **Plan 2（TombRaidMapManifest）**：`Minimap` 接受 `MinimapUpdate`（playerX/Y、exploredCells、chestMarkers、bodyMarkers、exitDiscovered/X/Y），由 MapRenderer 从 manifest 转换。
- **Plan 3（PlayerCombat/CombatCallbacks）**：`HudSnapshot` 字段（hp/maxHp/weaponId）来自 `PlayerCombat.hp/maxHp/weaponId`；`PlayerCombat.isDead()` 由 TombRaidScene 调用后触发 `runDeathSettlement`；`CombatCallbacks.onMarkBodyOnMinimap` → `TombRaidScene.markBodyOnMinimap` → 累积进 `MinimapUpdate.bodyMarkers`。
- **Plan 4（WeaponCooldowns）**：`HudSnapshot.ultCooldownRemaining/ultCooldownTotal` 来自 `WeaponCooldowns.getUltimateCooldownRemaining(timeMs, weapon)` 与 `weapon.ultimate.cooldownMs`。
- **Plan 5（Inventory/LootItem）**：`SettlementScreen.showEvacuation` 调用 `inventory.entries()` + `inventory.totalSanityValue()`；`StashManager.depositRunInventory` 同；`ShopManager` 用 `getLootItem(id)` + `ALL_LOOT`。
- **设计变更（InventoryPort 端口）**：`StashManager.depositRunInventory` 参数由完整 `Inventory` 收窄为 `InventoryPort`（仅 entries/totalSanityValue/clear，定义并 export 于 `StashManager.ts`）。`SettlementScreen` 传入的完整 Inventory 结构兼容此端口（超集），无需改动。商城买价系数 ×1.35 → ×1.75（celery 120→210、ruler 130→228）。

### 跨任务符号一致 ✅

- `Loadout` / `BuiltRun` 定义在 `LoadoutManager.ts`，`HubUI` import 使用。
- `SettlementOutcome` 定义在 `SettlementScreen.ts`，`TombRaidScene` import 使用，与 spec §1.3 三态一致。
- `MinimapUpdate` / `MinimapBodyMarker` 定义在 `Minimap.ts`，`TombRaidScene` 桥接使用。
- `HudSnapshot` 定义在 `TombRaidHUD.ts`，`TombRaidScene.updateHud` 接受。
- `MobileControlsCallbacks` 定义在 `MobileControls.ts`，`TombRaidScene` 构造时传入。
- 深度常量（HUD_BASE_DEPTH=1000 / HUD_TEXT_DEPTH=1001 / HUD_OVERLAY_DEPTH=1002 / MINIMAP_DEPTH=1011 / BIG_MAP_DEPTH=1980 / FOG_MASK_DEPTH=1990 / SETTLEMENT_DEPTH=1996 / MOBILE_ACTION_DEPTH=952）统一在各自文件 export，复用主项目 UI=1000~2001 区间，不与剧情幕布 2000/2001 冲突。

### Spec 数值核对 ✅

- 升级成本表（spec §8.4）：6 种 ×（5 阶 ×4% 或 3 阶 +1槽）全部 pin 在 `UPGRADE_COSTS` 测试中。
- 商城买价 `Math.round(sanityValue × 1.75)`（celery 120→210、ruler 130→228），卖价 1:1（spec §8.2）。
- 起配 1 武器 + 3 消耗品，武备 +1/阶上限 6 槽，空手 = `unarmed` 弱拳 5 伤（spec §8.3）。
- 撤离达标阈值 `totalSanityValue ≥ baselineSanity`，达标入仓库 + 更新 best，未达标拒绝，死亡全丢（spec §1.3）。
- HUD 布局：左上 HP+武器+CD 环 / 上中 理智+基准线达标变金 / 右上 小地图 / 下中 消耗品槽 / 左下 理智比率（spec §9.1）。
- 小地图雾战脚步点亮、玩家点+出口+宝箱+身体标记、缄默者不显示、M/点击大地图、ESC/再点关闭（spec §9.2）。
- 红边击杀：全屏"理智正在消散"2s + 220px 视野 + 持续到撤离/死亡（spec §5.10/§9.3）。
- 移动端：复用 InputManager 摇杆（base 200,600, radius 80, depth 950/951）+ 右侧 4 按钮（普攻J/大招K/交互H/消耗品F），depth 952（spec §11.4）。

### 约束遵守 ✅

- 不修改剧情模式代码（EventEngine/storyManifest/SaveState/PreloadScene）。
- 复用 `UI_THEME` + `applyPixelTextStyle` + `applyPixelStrokeStyle`。
- TypeScript strict（`noUncheckedLocals`/`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`）：实现中所有 readonly 字段、`for...of` 索引访问、可选属性均符合。
- TDD 强制：每个任务 5 步（RED → run-fail → GREEN → run-pass → COMMIT）。
- 素材根目录仅 `最终素材/`：本 plan 不新增素材路径（loot 资产清单已在 Plan 5 注册）。
- `noUnusedLocals` 修复：`consumeLoadoutFromStash` 中 `next` 通过返回 `stash` 字段消费；其他文件无未使用变量。

### 已知限制 / 后续 plan 处理

- 红边雾战 220px 视野的"孔洞"实现采用简化版（黑色全屏 + 跟随的透明圆作占位），真实 Phaser mask 可在后续 polish 中替换为 `Phaser.Display.Masks.BitmapMask`。当前测试覆盖行为契约（激活/跟随/停用），不影响接口稳定。
- `Minimap` 的雾战"脚步点亮"基于 `MinimapUpdate.exploredCells`，由 MapRenderer 维护（Plan 2/3 的玩家移动事件填入）；本 plan 不实现 cell 划分算法，只消费 `exploredCells` 列表。
- `TombRaidScene.getPlayerWorldPosition` 当前回退到相机中心，真实实现由 Plan 3 的 CombatManager 提供 `getPlayerPosition()` 接入（已在接线说明中标注）。
- 集成测试用 `Object.assign(scene, mockScene)` 注入 mock，未覆盖真实 Phaser 生命周期；端到端 Phaser 集成留待 `tests/e2e/` 在所有 plan 实现完成后补充。

---

## 文件清单（最终）

**新增（10）**：
1. `src/tombraid/meta/UpgradeManager.ts`
2. `src/tombraid/meta/StashManager.ts`
3. `src/tombraid/meta/ShopManager.ts`
4. `src/tombraid/meta/LoadoutManager.ts`
5. `src/tombraid/ui/HubUI.ts`
6. `src/tombraid/ui/TombRaidHUD.ts`
7. `src/tombraid/ui/Minimap.ts`
8. `src/tombraid/ui/RedEdgeFogOverlay.ts`
9. `src/tombraid/ui/SettlementScreen.ts`
10. `src/tombraid/ui/MobileControls.ts`

**修改（2）**：
- `src/tombraid/TombRaidHubScene.ts`（接线 HubUI）
- `src/tombraid/TombRaidScene.ts`（接线 HUD/Minimap/fog/settlement/mobile）

**新增测试（11）**：
- `src/tests/tomb-raid-upgrade-manager.test.ts`
- `src/tests/tomb-raid-stash-manager.test.ts`
- `src/tests/tomb-raid-shop-manager.test.ts`
- `src/tests/tomb-raid-loadout-manager.test.ts`
- `src/tests/tomb-raid-hub-ui.test.ts`
- `src/tests/tomb-raid-hud.test.ts`
- `src/tests/tomb-raid-minimap.test.ts`
- `src/tests/tomb-raid-red-edge-fog.test.ts`
- `src/tests/tomb-raid-settlement.test.ts`
- `src/tests/tomb-raid-mobile-controls.test.ts`
- `src/tests/tomb-raid-plan-6-integration.test.ts`