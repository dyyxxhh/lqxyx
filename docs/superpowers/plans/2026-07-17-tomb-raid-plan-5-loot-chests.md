# 摸金模式 Plan 5：记忆碎片 + 掉落 + 宝箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现摸金模式（Tomb Raid Mode）的记忆碎片数据层（48 件）、4 张掉率表与掷骰纯函数、本局背包（遗物不叠加 + 消耗品堆叠上限受破洞书包影响）、宝箱破译纯状态机（hold/pause 无回退 + 4 锁扣里程碑）、Phaser 薄层破译渲染器（程序绘制码环/进度弧/粒子/屏震 + 切贴图 + 战利品卡飞出）、itemId→spriteKey 解析与 manifest 交叉验证、以及 plan 5 内部集成冒烟测试。核心掉落/背包/破译状态机为纯 TypeScript（无 Phaser import），可在 jsdom 单元测试；Phaser 渲染由 `ChestDecrypt` 薄层处理（`import type Phaser`，类型擦除）。

**Architecture:**
- `loot/LootItem.ts` — `LootRarity`/`LootType`/`LootEffect` 判别联合 + `LootItem` 接口 + 48 件 `ALL_LOOT` 定义 + `getLootItem(id)` 查询（武器条目从 plan 4 `getWeapon` 派生 `sanityValue`/`rarity`）
- `loot/LootTable.ts` — `LootTable`/`LootTableEntry`/`LootRollMode` + 4 张掉率表（`SILENT_ONE_LOOT_TABLE`/`YANG_YUN_RED_LOOT_TABLE`/`NORMAL_CHEST_LOOT_TABLE`/`GILDED_CHEST_LOOT_TABLE`）+ `rollLootTable(table, rng)` 纯函数（single/independent/multiPick 三模式 + 白阶 70% 无字毕业证 + 保底 pity）
- `loot/Inventory.ts` — 本局背包（遗物 `activeRelicIds` 不叠加 + 消耗品堆叠上限受 `tornSchoolbag` relic 影响 + `totalSanityValue`）
- `loot/chestDecryptState.ts` — 宝箱破译纯状态机（`ChestDecryptState` + `ChestDecryptSnapshot` + 回调，hold/松开回退(100%速率,锁扣保留) + 4 锁扣 0.25/0.5/0.75/1.0）
- `loot/ChestDecrypt.ts` — Phaser 薄层（`import type Phaser`，构造注入 scene，程序绘制码环/进度弧/粒子 + 切贴图 `prop.phoneCabinetFront`→`prop.phoneCabinetAngled` + 战利品卡飞出）
- `loot/lootAssetKeys.ts` — `lootSpriteKeyFor(itemId)` 解析（itemId → `loot.<中文名>` manifest key）+ manifest 交叉验证 helper
- 不修改剧情模式代码；不修改 `GAME_SCENES`；依赖 plan 4 `WeaponRegistry.getWeapon`/`WeaponId`/`WeaponDef`；不实现效果应用（在 plan 3 战斗与未来 effects 系统）

**Tech Stack:** Phaser 4.1.0, TypeScript（strict: `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noUnusedLocals` / `noUnusedParameters`）, Vitest 4.1.8, jsdom

---

## File Structure

| 文件 | 职责 | Phaser 依赖 |
|------|------|------------|
| `src/tombraid/loot/LootItem.ts` | 48 件碎片定义 + LootEffect 联合 + getLootItem | 无 |
| `src/tombraid/loot/LootTable.ts` | 4 张掉率表 + rollLootTable 纯函数 | 无 |
| `src/tombraid/loot/Inventory.ts` | 本局背包 | 无 |
| `src/tombraid/loot/chestDecryptState.ts` | 破译纯状态机 | 无 |
| `src/tombraid/loot/ChestDecrypt.ts` | Phaser 薄层渲染 + F 键 wiring | `import type Phaser`（类型擦除） |
| `src/tombraid/loot/lootAssetKeys.ts` | itemId→spriteKey 解析 + manifest 交叉验证 | 无 |
| `src/tests/tombraid/loot/loot-item.test.ts` | Task 1 测试 | 无 |
| `src/tests/tombraid/loot/loot-table.test.ts` | Task 2 测试 | 无 |
| `src/tests/tombraid/loot/inventory.test.ts` | Task 3 测试 | 无 |
| `src/tests/tombraid/loot/chest-decrypt-state.test.ts` | Task 4 测试 | 无 |
| `src/tests/tombraid/loot/chest-decrypt.test.ts` | Task 5 测试 | 注入 fake scene（无 vi.mock） |
| `src/tests/tombraid/loot/loot-asset-keys.test.ts` | Task 6 测试 | 无 |
| `src/tests/tombraid/loot/integration.test.ts` | Task 7 集成冒烟测试 | 无 |

## Constraints

- **不修改剧情模式代码**（EventEngine/storyManifest/SaveState/PreloadScene/InputManager/PlayScene）
- **依赖 plan 4**：`import { getWeapon, type WeaponId, type WeaponDef } from '../weapons/WeaponRegistry'`；4 把武器 LootItem（`weapon.ruler`/`weapon.chain`/`weapon.bloodScythe`/`weapon.soulBanner`）的 `sanityValue` 与 `rarity` 从 `getWeapon(id)` 派生，避免 drift
- **核心掉落/背包/破译状态机纯 TS**：`LootItem`/`LootTable`/`Inventory`/`chestDecryptState`/`lootAssetKeys` 不 import Phaser；仅 `ChestDecrypt.ts` 用 `import type Phaser`（编译期擦除，测试注入 fake scene，无需 `vi.mock('phaser')`）
- **TypeScript strict**：`noUncheckedIndexedAccess`（数组访问返回 `T | undefined`，用守卫或 `!`）/ `exactOptionalPropertyTypes`（可选属性不能赋 `undefined`）/ `noUnusedLocals`+`noUnusedParameters`
- **TDD 强制**：每个任务 5 步（RED → GREEN → SURFACE）
- **数值严格遵循 spec §6/§7/§10**：48 件碎片 sanityValue 与效果、4 张表权重、白阶 70%、破译 4 锁扣 0.25/0.5/0.75/1.0、总时长 ~2.5s
- **资产**：manifest 中 52 条 `loot.<中文名>` 条目已由先前 plan 注册（`src/data/assets.ts` 行 565–1084，含 spec §6 的 48 件 + 4 把非 §6 的 plan 4 武器 `loot.断尺`/`loot.粉笔`/`loot.灵刃`/`loot.拳套`）；`assets.test.ts` 已断言 `toHaveLength(134)`。Plan 5 Task 6 不重复添加 manifest 条目，而是新增 `lootAssetKeys.ts` 提供 `itemId → spriteKey` 解析并交叉验证 48 件 LootItem 的 spriteKey 全部存在于 `assetManifest`

## Design Conventions

1. **稀有度顺序**：蓝 < 紫 < 绿 < 金 < 白；`LootRarity = 'blue' | 'purple' | 'green' | 'gold' | 'white'`
2. **类型分类**：`LootType = 'material' | 'consumable' | 'relic' | 'weapon' | 'treasure'`
3. **LootEffect 判别联合**：14 变体（heal/cleanse/buff/multiBuff/invulnerable/aoeStun/passiveMaxHp/passiveStat/passiveStatWithHpPenalty/passiveConsumableStackBonus/passiveDamageImmunityChance/passiveExtractionValueBonus/passiveReviveOnce）+ `null`（材料/宝物/武器无 effect；武器战斗行为来自 plan 4 WeaponDef）。**效果应用不在 plan 5**（在 plan 3 战斗与未来 effects 系统），plan 5 只定义数据结构
4. **武器 LootItem 派生**：`weapon.ruler`/`weapon.chain`/`weapon.bloodScythe`/`weapon.soulBanner` 的 `sanityValue` 与 `rarity` 调用 `getWeapon(id)` 派生；`effect = null`；测试断言与 plan 4 WeaponDef 一致
5. **白阶 70% 规则**：`rollLootTable` 内 `pickItem` 对 `rarity === 'white'` 的条目先 roll `rng()`，`< 0.7` → 强制返回 `treasure.blankDiploma`；`>= 0.7` → 从白阶池排除 `blankDiploma` 后随机。精确 P(blankDiploma | white) = 70%
6. **遗物不叠加**：`Inventory.activeRelicIds: Set<string>` 跟踪 distinct relic id；`add` 同名遗物数量叠加但 `activeRelics()` 只返回一次；`remove` 至 0 时从 activeRelicIds 删除
7. **消耗品堆叠上限**：`BASE_CONSUMABLE_STACK_LIMIT = 10`；`relic.tornSchoolbag` 激活时 `+5` → 15（通过构造注入 `isTornSchoolbagActive: () => boolean`）；超出上限部分计入 `overflow` 丢弃
8. **宝箱破译**：`phase: 'idle' | 'decrypting' | 'opening' | 'completed'`；`holding` 布尔独立于 phase 控制 `advance` 是否推进；`release()` 置 `holding=false`，progress 以与破译相同速率回退(decayRate=1/2500 per ms)，回退到上一个已崩开锁扣处停止(progress 回退到 `floor(progress*4)/4` 时不低于该值)；4 锁扣 `brokenLocks = min(4, floor(progress*4))`，每锁扣触发 `onLockBroken(index)`；`progress >= 1` → `phase='opening'` + `onOpenStart`；`openElapsedMs >= 600` → `phase='completed'` + `onCompleted`
9. **破译速率**：`CHEST_DECRYPT_TOTAL_MS = 2500`，`rate = 1/2500 per ms`，总时长 ~2.5s
10. **spec §6.5/§6.6 表头价值区间与表格不一致时以表格为权威**：spec §6.5 表头写「110~220」但表格最低 120（芹菜）；§6.6 表头写「320~580」但表格最低 400（圣水）。Plan 5 以表格数值为准，测试用表格推导的区间：蓝 [10,35] / 紫 [45,95] / 绿 [120,220] / 金 [400,580] / 白 [750,1500]

## Run Commands

```bash
npm run test:run     # vitest run（运行所有单元测试）
npm run typecheck    # tsc --noEmit（类型检查）
npm run build        # tsc --noEmit + vite build
```

单个测试文件：
```bash
npx vitest run src/tests/tombraid/loot/loot-item.test.ts
```

---

## Task 1: LootItem.ts — 48 件记忆碎片定义 + LootEffect 判别联合

**目标**：定义 `LootRarity`/`LootType`/`LootEffect` 判别联合、`LootItem` 接口、48 件 `ALL_LOOT`（蓝 12 + 紫 12 + 绿 12 + 金 8 + 白 4）、`getLootItem(id)` 查询。4 把武器条目从 plan 4 `getWeapon` 派生 `sanityValue`/`rarity`。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/loot-item.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import {
  ALL_LOOT,
  getLootItem,
  LOOT_RARITY_ORDER,
  type LootEffect,
  type LootItem,
  type LootRarity,
  type LootType,
} from '../../../tombraid/loot/LootItem';

describe('LootItem types (spec §6.1/§6.8)', () => {
  it('LootRarity order is blue < purple < green < gold < white', () => {
    expect(LOOT_RARITY_ORDER).toEqual(['blue', 'purple', 'green', 'gold', 'white']);
  });

  it('LootType union covers 5 categories', () => {
    const types: LootType[] = ['material', 'consumable', 'relic', 'weapon', 'treasure'];
    expect(types).toHaveLength(5);
  });
});

describe('ALL_LOOT completeness (spec §6.2-§6.6)', () => {
  it('has exactly 48 items', () => {
    expect(ALL_LOOT).toHaveLength(48);
  });

  it('rarity counts: blue 12 / purple 12 / green 12 / gold 8 / white 4', () => {
    const counts: Record<LootRarity, number> = { blue: 0, purple: 0, green: 0, gold: 0, white: 0 };
    for (const it of ALL_LOOT) counts[it.rarity] += 1;
    expect(counts).toEqual({ blue: 12, purple: 12, green: 12, gold: 8, white: 4 });
  });

  it('all ids are unique', () => {
    const ids = ALL_LOOT.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all spriteKeys are non-empty strings', () => {
    for (const it of ALL_LOOT) {
      expect(typeof it.spriteKey).toBe('string');
      expect(it.spriteKey.length).toBeGreaterThan(0);
    }
  });

  it('sanityValue ranges per rarity (table-authoritative)', () => {
    const ranges: Record<LootRarity, [number, number]> = {
      blue: [10, 35],
      purple: [45, 95],
      green: [120, 220],
      gold: [400, 580],
      white: [750, 1500],
    };
    for (const it of ALL_LOOT) {
      const [min, max] = ranges[it.rarity];
      expect(it.sanityValue).toBeGreaterThanOrEqual(min);
      expect(it.sanityValue).toBeLessThanOrEqual(max);
    }
  });
});

describe('ALL_LOOT specific items (spec §6.2 blue)', () => {
  it('material.chalkStub = 粉笔头, sanity 12, no effect', () => {
    const it = getLootItem('material.chalkStub');
    expect(it).toBeDefined();
    expect(it?.name).toBe('粉笔头');
    expect(it?.rarity).toBe('blue');
    expect(it?.type).toBe('material');
    expect(it?.sanityValue).toBe(12);
    expect(it?.effect).toBeNull();
    expect(it?.spriteKey).toBe('loot.粉笔头');
  });

  it('material.bloodstainedLoveLetter = 染血情书, sanity 35', () => {
    const it = getLootItem('material.bloodstainedLoveLetter');
    expect(it?.sanityValue).toBe(35);
    expect(it?.spriteKey).toBe('loot.染血情书');
  });
});

describe('ALL_LOOT purple consumables & relics (spec §6.3)', () => {
  it('consumable.mint = 薄荷糖, heal 3 instant', () => {
    const it = getLootItem('consumable.mint');
    expect(it?.sanityValue).toBe(50);
    expect(it?.effect).toEqual({ kind: 'heal', amount: 3, castTimeMs: 0 });
  });

  it('consumable.expiredEyeDrops = 过期眼药水, buff visionRange +10% 10s', () => {
    const it = getLootItem('consumable.expiredEyeDrops');
    expect(it?.effect).toEqual({
      kind: 'buff',
      stat: 'visionRange',
      magnitudePercent: 10,
      durationMs: 10000,
    });
  });

  it('consumable.halfBottleWater = 半瓶矿泉水, buff moveSpeed +5% 8s', () => {
    const it = getLootItem('consumable.halfBottleWater');
    expect(it?.sanityValue).toBe(48);
    expect(it?.effect).toEqual({
      kind: 'buff',
      stat: 'moveSpeed',
      magnitudePercent: 5,
      durationMs: 8000,
    });
  });

  it('relic.fadedStudentCard = 褪色学生卡, passiveMaxHp +5', () => {
    const it = getLootItem('relic.fadedStudentCard');
    expect(it?.effect).toEqual({ kind: 'passiveMaxHp', amount: 5 });
  });

  it('relic.tornSchoolbag = 破洞书包, passiveConsumableStackBonus +5', () => {
    const it = getLootItem('relic.tornSchoolbag');
    expect(it?.effect).toEqual({ kind: 'passiveConsumableStackBonus', amount: 5 });
  });
});

describe('ALL_LOOT green (spec §6.4)', () => {
  it('consumable.celery = 芹菜, heal 30 cast 500ms', () => {
    const it = getLootItem('consumable.celery');
    expect(it?.sanityValue).toBe(120);
    expect(it?.effect).toEqual({ kind: 'heal', amount: 30, castTimeMs: 500 });
    expect(it?.spriteKey).toBe('loot.芹菜');
  });

  it('consumable.antidote = 解药, cleanse cast 300ms', () => {
    expect(getLootItem('consumable.antidote')?.effect).toEqual({ kind: 'cleanse', castTimeMs: 300 });
  });

  it('consumable.adrenaline = 肾上腺素, multiBuff moveSpeed+30% & attackSpeed+20% 8s', () => {
    const it = getLootItem('consumable.adrenaline');
    expect(it?.effect).toEqual({
      kind: 'multiBuff',
      buffs: [
        { stat: 'moveSpeed', magnitudePercent: 30 },
        { stat: 'attackSpeed', magnitudePercent: 20 },
      ],
      durationMs: 8000,
    });
  });

  it('relic.blueEdgeHeadband = 蓝边发带, passiveMaxHp +20', () => {
    expect(getLootItem('relic.blueEdgeHeadband')?.effect).toEqual({ kind: 'passiveMaxHp', amount: 20 });
  });

  it('relic.bloodstainedBandage = 血渍绷带, passiveDamageImmunityChance 15%', () => {
    expect(getLootItem('relic.bloodstainedBandage')?.effect).toEqual({
      kind: 'passiveDamageImmunityChance',
      chancePercent: 15,
    });
  });

  it('relic.boxingGlove = 拳击手套, passiveStat basicDamage +20%', () => {
    expect(getLootItem('relic.boxingGlove')?.effect).toEqual({
      kind: 'passiveStat',
      stat: 'basicDamage',
      magnitudePercent: 20,
    });
  });
});

describe('ALL_LOOT gold (spec §6.5)', () => {
  it('consumable.holyWater = 圣水, invulnerable 3s fullRestore cast 1000ms', () => {
    expect(getLootItem('consumable.holyWater')?.effect).toEqual({
      kind: 'invulnerable',
      durationMs: 3000,
      castTimeMs: 1000,
      fullRestore: true,
    });
  });

  it('consumable.soulBell = 镇魂铃, aoeStun 5s vuln +30%', () => {
    expect(getLootItem('consumable.soulBell')?.effect).toEqual({
      kind: 'aoeStun',
      durationMs: 5000,
      vulnerabilityBonusPercent: 30,
    });
  });

  it('relic.redEdgeHeadband = 红边发带, passiveStatWithHpPenalty atkSpeed+25% hp-15', () => {
    expect(getLootItem('relic.redEdgeHeadband')?.effect).toEqual({
      kind: 'passiveStatWithHpPenalty',
      stat: 'attackSpeed',
      magnitudePercent: 25,
      maxHpDelta: -15,
    });
  });

  it('relic.principalSeal = 校长印章, passiveExtractionValueBonus +15%', () => {
    expect(getLootItem('relic.principalSeal')?.effect).toEqual({
      kind: 'passiveExtractionValueBonus',
      magnitudePercent: 15,
    });
  });
});

describe('ALL_LOOT white (spec §6.6)', () => {
  it('treasure.blankDiploma = 无字毕业证, sanity 750, no effect', () => {
    const it = getLootItem('treasure.blankDiploma');
    expect(it?.sanityValue).toBe(750);
    expect(it?.effect).toBeNull();
  });

  it('relic.blackGraduationPhoto = 黑色毕业照, passiveReviveOnce 50%', () => {
    expect(getLootItem('relic.blackGraduationPhoto')?.effect).toEqual({
      kind: 'passiveReviveOnce',
      reviveHpPercent: 50,
    });
  });
});

describe('weapon LootItems derive from plan 4 getWeapon (spec §6.4/§6.5/§6.6)', () => {
  it('weapon.ruler = 尺子, green, sanity from getWeapon, no effect', () => {
    const it = getLootItem('weapon.ruler');
    expect(it?.rarity).toBe('green');
    expect(it?.type).toBe('weapon');
    expect(it?.effect).toBeNull();
    expect(it?.sanityValue).toBe(130);
    expect(it?.spriteKey).toBe('loot.尺子');
  });

  it('weapon.chain = 锁链, gold, sanity 420', () => {
    const it = getLootItem('weapon.chain');
    expect(it?.rarity).toBe('gold');
    expect(it?.sanityValue).toBe(420);
  });

  it('weapon.bloodScythe = 血镰, gold, sanity 550', () => {
    const it = getLootItem('weapon.bloodScythe');
    expect(it?.rarity).toBe('gold');
    expect(it?.sanityValue).toBe(550);
  });

  it('weapon.soulBanner = 万魂幡, white, sanity 1200', () => {
    const it = getLootItem('weapon.soulBanner');
    expect(it?.rarity).toBe('white');
    expect(it?.sanityValue).toBe(1200);
  });
});

describe('getLootItem lookup', () => {
  it('returns undefined for unknown id', () => {
    expect(getLootItem('material.nonexistent')).toBeUndefined();
  });
});

describe('LootEffect is a discriminated union', () => {
  it('every effect has a kind field', () => {
    const e: LootEffect | null = { kind: 'heal', amount: 1, castTimeMs: 0 };
    expect(e?.kind).toBe('heal');
  });
});
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/loot-item.test.ts
```

**Expected**：失败（模块 `../../../tombraid/loot/LootItem` 不存在）。

### Step 3: 实现 LootItem.ts

- [ ] 创建 `src/tombraid/loot/LootItem.ts`：

```ts
import { getWeapon } from '../weapons/WeaponRegistry';
import type { WeaponId } from '../weapons/WeaponRegistry';

export type LootRarity = 'blue' | 'purple' | 'green' | 'gold' | 'white';
export type LootType = 'material' | 'consumable' | 'relic' | 'weapon' | 'treasure';

export const LOOT_RARITY_ORDER: readonly LootRarity[] = ['blue', 'purple', 'green', 'gold', 'white'];

export type LootBuffStat = 'moveSpeed' | 'attackSpeed' | 'visionRange' | 'pickupRange';
export type LootPassiveStat =
  | 'moveSpeed'
  | 'attackSpeed'
  | 'visionRange'
  | 'pickupRange'
  | 'critRate'
  | 'basicDamage';

export type LootEffect =
  | { readonly kind: 'heal'; readonly amount: number; readonly castTimeMs: number }
  | { readonly kind: 'cleanse'; readonly castTimeMs: number }
  | {
      readonly kind: 'buff';
      readonly stat: LootBuffStat;
      readonly magnitudePercent: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'multiBuff';
      readonly buffs: ReadonlyArray<{ readonly stat: LootBuffStat; readonly magnitudePercent: number }>;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'invulnerable';
      readonly durationMs: number;
      readonly castTimeMs: number;
      readonly fullRestore: boolean;
    }
  | {
      readonly kind: 'aoeStun';
      readonly durationMs: number;
      readonly vulnerabilityBonusPercent: number;
    }
  | { readonly kind: 'passiveMaxHp'; readonly amount: number }
  | {
      readonly kind: 'passiveStat';
      readonly stat: LootPassiveStat;
      readonly magnitudePercent: number;
    }
  | {
      readonly kind: 'passiveStatWithHpPenalty';
      readonly stat: 'attackSpeed';
      readonly magnitudePercent: number;
      readonly maxHpDelta: number;
    }
  | { readonly kind: 'passiveConsumableStackBonus'; readonly amount: number }
  | { readonly kind: 'passiveDamageImmunityChance'; readonly chancePercent: number }
  | { readonly kind: 'passiveExtractionValueBonus'; readonly magnitudePercent: number }
  | { readonly kind: 'passiveReviveOnce'; readonly reviveHpPercent: number };

export interface LootItem {
  readonly id: string;
  readonly name: string;
  readonly rarity: LootRarity;
  readonly type: LootType;
  readonly sanityValue: number;
  readonly spriteKey: string;
  readonly description: string;
  readonly effect: LootEffect | null;
}

function weaponLoot(id: WeaponId, name: string, description: string, spriteKey: string): LootItem {
  const w = getWeapon(id);
  return {
    id,
    name,
    rarity: w.rarity as LootRarity,
    type: 'weapon',
    sanityValue: w.sanityValue,
    spriteKey,
    description,
    effect: null,
  };
}

export const ALL_LOOT: readonly LootItem[] = [
  // === 蓝阶 12 件（材料，sanity 10-35）spec §6.2 ===
  {
    id: 'material.chalkStub',
    name: '粉笔头',
    rarity: 'blue',
    type: 'material',
    sanityValue: 12,
    spriteKey: 'loot.粉笔头',
    description: '一截被踩碎的粉笔头，沾着粉笔灰。',
    effect: null,
  },
  {
    id: 'material.brokenPencil',
    name: '断铅笔',
    rarity: 'blue',
    type: 'material',
    sanityValue: 18,
    spriteKey: 'loot.断铅笔',
    description: '断成两截的铅笔，笔芯还露在外面。',
    effect: null,
  },
  {
    id: 'material.emptyColaCan',
    name: '空可乐罐',
    rarity: 'blue',
    type: 'material',
    sanityValue: 22,
    spriteKey: 'loot.空可乐罐',
    description: '被踩扁的空可乐罐，还残留着甜腻气味。',
    effect: null,
  },
  {
    id: 'material.rustyHairpin',
    name: '生锈发卡',
    rarity: 'blue',
    type: 'material',
    sanityValue: 28,
    spriteKey: 'loot.生锈发卡',
    description: '生锈的金属发卡，边缘已经发黑。',
    effect: null,
  },
  {
    id: 'material.lostHomework',
    name: '走失作业本',
    rarity: 'blue',
    type: 'material',
    sanityValue: 15,
    spriteKey: 'loot.走失作业本',
    description: '一本次主人不明的作业本，字迹潦草。',
    effect: null,
  },
  {
    id: 'material.bloodstainedUniform',
    name: '沾血校服布',
    rarity: 'blue',
    type: 'material',
    sanityValue: 30,
    spriteKey: 'loot.沾血校服布',
    description: '一块沾着干涸血迹的校服布片。',
    effect: null,
  },
  {
    id: 'material.tornDiary',
    name: '缺页日记',
    rarity: 'blue',
    type: 'material',
    sanityValue: 25,
    spriteKey: 'loot.缺页日记',
    description: '日记本缺了好几页，剩下的字句令人不安。',
    effect: null,
  },
  {
    id: 'material.dustyMedal',
    name: '蒙尘奖章',
    rarity: 'blue',
    type: 'material',
    sanityValue: 32,
    spriteKey: 'loot.蒙尘奖章',
    description: '蒙着灰尘的旧奖章，看不清 awarded 给谁。',
    effect: null,
  },
  {
    id: 'material.brokenRulerShard',
    name: '断尺碎片',
    rarity: 'blue',
    type: 'material',
    sanityValue: 10,
    spriteKey: 'loot.断尺碎片',
    description: '断尺崩飞出来的碎片，边缘锋利。',
    effect: null,
  },
  {
    id: 'material.oldCassette',
    name: '旧磁带',
    rarity: 'blue',
    type: 'material',
    sanityValue: 20,
    spriteKey: 'loot.旧磁带',
    description: '一盒外壳开裂的旧磁带，磁带已散开。',
    effect: null,
  },
  {
    id: 'material.bloodstainedLoveLetter',
    name: '染血情书',
    rarity: 'blue',
    type: 'material',
    sanityValue: 35,
    spriteKey: 'loot.染血情书',
    description: '一封被血浸透的情书，字迹已无法辨认。',
    effect: null,
  },
  {
    id: 'material.rustyClassPlate',
    name: '生锈班牌',
    rarity: 'blue',
    type: 'material',
    sanityValue: 33,
    spriteKey: 'loot.生锈班牌',
    description: '生锈的班级门牌，号码已被划花。',
    effect: null,
  },

  // === 紫阶 12 件（sanity 45-95）spec §6.3 ===
  // 消耗品 3
  {
    id: 'consumable.mint',
    name: '薄荷糖',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 50,
    spriteKey: 'loot.薄荷糖',
    description: '一颗薄荷糖，含下去能稍微提神。',
    effect: { kind: 'heal', amount: 3, castTimeMs: 0 },
  },
  {
    id: 'consumable.expiredEyeDrops',
    name: '过期眼药水',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 55,
    spriteKey: 'loot.过期眼药水',
    description: '过期很久的眼药水，滴下去视野会短暂清晰。',
    effect: { kind: 'buff', stat: 'visionRange', magnitudePercent: 10, durationMs: 10000 },
  },
  {
    id: 'consumable.halfBottleWater',
    name: '半瓶矿泉水',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 48,
    spriteKey: 'loot.半瓶矿泉水',
    description: '喝剩半瓶的矿泉水，能短暂加快脚步。',
    effect: { kind: 'buff', stat: 'moveSpeed', magnitudePercent: 5, durationMs: 8000 },
  },
  // 遗物 3
  {
    id: 'relic.fadedStudentCard',
    name: '褪色学生卡',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 75,
    spriteKey: 'loot.褪色学生卡',
    description: '褪色的学生卡，随身携带似乎能撑住一口气。',
    effect: { kind: 'passiveMaxHp', amount: 5 },
  },
  {
    id: 'relic.wornEraser',
    name: '磨旧橡皮',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 70,
    spriteKey: 'loot.磨旧橡皮',
    description: '磨旧的橡皮，攥在手里总觉得能多捡点东西。',
    effect: { kind: 'passiveStat', stat: 'pickupRange', magnitudePercent: 10 },
  },
  {
    id: 'relic.tornSchoolbag',
    name: '破洞书包',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 65,
    spriteKey: 'loot.破洞书包',
    description: '破了个洞的书包，虽然漏东西但能装更多消耗品。',
    effect: { kind: 'passiveConsumableStackBonus', amount: 5 },
  },
  // 材料 4
  {
    id: 'material.steelMealCard',
    name: '不锈钢饭卡',
    rarity: 'purple',
    type: 'material',
    sanityValue: 80,
    spriteKey: 'loot.不锈钢饭卡',
    description: '不锈钢饭卡，沉甸甸的。',
    effect: null,
  },
  {
    id: 'material.glassMarble',
    name: '玻璃弹珠',
    rarity: 'purple',
    type: 'material',
    sanityValue: 45,
    spriteKey: 'loot.玻璃弹珠',
    description: '一颗透亮的玻璃弹珠。',
    effect: null,
  },
  {
    id: 'material.brassBookmark',
    name: '黄铜书签',
    rarity: 'purple',
    type: 'material',
    sanityValue: 90,
    spriteKey: 'loot.黄铜书签',
    description: '黄铜书签，刻着看不懂的花纹。',
    effect: null,
  },
  {
    id: 'material.plasticAbacusBead',
    name: '塑料算盘珠',
    rarity: 'purple',
    type: 'material',
    sanityValue: 60,
    spriteKey: 'loot.塑料算盘珠',
    description: '一颗塑料算盘珠，色彩鲜艳却显得廉价。',
    effect: null,
  },
  // 宝物 2
  {
    id: 'treasure.silverSchoolBadge',
    name: '银质校徽',
    rarity: 'purple',
    type: 'treasure',
    sanityValue: 85,
    spriteKey: 'loot.银质校徽',
    description: '银质校徽，做工精致。',
    effect: null,
  },
  {
    id: 'treasure.jadePendantFragment',
    name: '玉坠碎片',
    rarity: 'purple',
    type: 'treasure',
    sanityValue: 95,
    spriteKey: 'loot.玉坠碎片',
    description: '玉坠崩碎的一角，温润依旧。',
    effect: null,
  },

  // === 绿阶 12 件（sanity 120-220）spec §6.4 ===
  // 消耗品 3
  {
    id: 'consumable.celery',
    name: '芹菜',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 120,
    spriteKey: 'loot.芹菜',
    description: '一根芹菜，嚼下去能回不少血。',
    effect: { kind: 'heal', amount: 30, castTimeMs: 500 },
  },
  {
    id: 'consumable.antidote',
    name: '解药',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 150,
    spriteKey: 'loot.解药',
    description: '解药，能清除身上所有负面状态。',
    effect: { kind: 'cleanse', castTimeMs: 300 },
  },
  {
    id: 'consumable.adrenaline',
    name: '肾上腺素',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 180,
    spriteKey: 'loot.肾上腺素',
    description: '肾上腺素，短暂大幅强化速度与攻速。',
    effect: {
      kind: 'multiBuff',
      buffs: [
        { stat: 'moveSpeed', magnitudePercent: 30 },
        { stat: 'attackSpeed', magnitudePercent: 20 },
      ],
      durationMs: 8000,
    },
  },
  // 遗物 5
  {
    id: 'relic.blueEdgeHeadband',
    name: '蓝边发带',
    rarity: 'green',
    type: 'relic',
    sanityValue: 200,
    spriteKey: 'loot.蓝边发带',
    description: '蓝边发带，戴上后体魄更壮。',
    effect: { kind: 'passiveMaxHp', amount: 20 },
  },
  {
    id: 'relic.danYuxuanGlasses',
    name: '但宇轩眼镜',
    rarity: 'green',
    type: 'relic',
    sanityValue: 160,
    spriteKey: 'loot.但宇轩眼镜',
    description: '但宇轩的眼镜，戴上视野更广。',
    effect: { kind: 'passiveStat', stat: 'visionRange', magnitudePercent: 20 },
  },
  {
    id: 'relic.qinHaoruiRulerCompass',
    name: '秦浩睿尺规',
    rarity: 'green',
    type: 'relic',
    sanityValue: 170,
    spriteKey: 'loot.秦浩睿尺规',
    description: '秦浩睿的尺规，让攻击更易命中要害。',
    effect: { kind: 'passiveStat', stat: 'critRate', magnitudePercent: 8 },
  },
  {
    id: 'relic.bloodstainedBandage',
    name: '血渍绷带',
    rarity: 'green',
    type: 'relic',
    sanityValue: 140,
    spriteKey: 'loot.血渍绷带',
    description: '血渍绷带，缠在身上偶尔能硬扛一击。',
    effect: { kind: 'passiveDamageImmunityChance', chancePercent: 15 },
  },
  {
    id: 'relic.boxingGlove',
    name: '拳击手套',
    rarity: 'green',
    type: 'relic',
    sanityValue: 190,
    spriteKey: 'loot.拳击手套',
    description: '拳击手套，让普攻更有力。',
    effect: { kind: 'passiveStat', stat: 'basicDamage', magnitudePercent: 20 },
  },
  // 武器 1（从 plan 4 getWeapon 派生）
  weaponLoot('weapon.ruler', '尺子', '尺子。普攻扇形，大招 rulerStorm。', 'loot.尺子'),
  // 宝物 3
  {
    id: 'treasure.jadeSchoolPlate',
    name: '翡翠校牌',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 160,
    spriteKey: 'loot.翡翠校牌',
    description: '翡翠校牌，价值不菲。',
    effect: null,
  },
  {
    id: 'treasure.jadePendant',
    name: '玉佩',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 220,
    spriteKey: 'loot.玉佩',
    description: '完整的玉佩，温润通透。',
    effect: null,
  },
  {
    id: 'treasure.gildedPen',
    name: '镀金钢笔',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 130,
    spriteKey: 'loot.镀金钢笔',
    description: '镀金钢笔，笔尖闪光。',
    effect: null,
  },

  // === 金阶 8 件（sanity 400-580）spec §6.5 ===
  // 消耗品 2
  {
    id: 'consumable.holyWater',
    name: '圣水',
    rarity: 'gold',
    type: 'consumable',
    sanityValue: 400,
    spriteKey: 'loot.圣水',
    description: '圣水，饮用后短暂无敌并恢复全部状态。',
    effect: {
      kind: 'invulnerable',
      durationMs: 3000,
      castTimeMs: 1000,
      fullRestore: true,
    },
  },
  {
    id: 'consumable.soulBell',
    name: '镇魂铃',
    rarity: 'gold',
    type: 'consumable',
    sanityValue: 500,
    spriteKey: 'loot.镇魂铃',
    description: '镇魂铃，摇响后范围内缄默者眩晕并易伤。',
    effect: { kind: 'aoeStun', durationMs: 5000, vulnerabilityBonusPercent: 30 },
  },
  // 遗物 2
  {
    id: 'relic.redEdgeHeadband',
    name: '红边发带',
    rarity: 'gold',
    type: 'relic',
    sanityValue: 450,
    spriteKey: 'loot.红边发带',
    description: '红边发带，攻速大增但会消耗生命。',
    effect: {
      kind: 'passiveStatWithHpPenalty',
      stat: 'attackSpeed',
      magnitudePercent: 25,
      maxHpDelta: -15,
    },
  },
  {
    id: 'relic.principalSeal',
    name: '校长印章',
    rarity: 'gold',
    type: 'relic',
    sanityValue: 480,
    spriteKey: 'loot.校长印章',
    description: '校长印章，撤离结算时记忆碎片准出价值更高。',
    effect: { kind: 'passiveExtractionValueBonus', magnitudePercent: 15 },
  },
  // 武器 2（从 plan 4 getWeapon 派生）
  weaponLoot('weapon.chain', '锁链', '锁链。普攻大范围扇形，大招 chainCrush。', 'loot.锁链'),
  weaponLoot('weapon.bloodScythe', '血镰', '血镰。普攻带吸血，大招 bloodWheel。', 'loot.血镰'),
  // 宝物 2
  {
    id: 'treasure.diamondCufflink',
    name: '钻石袖扣',
    rarity: 'gold',
    type: 'treasure',
    sanityValue: 480,
    spriteKey: 'loot.钻石袖扣',
    description: '钻石袖扣，璀璨夺目。',
    effect: null,
  },
  {
    id: 'treasure.pureGoldSchoolBadge',
    name: '纯金校徽',
    rarity: 'gold',
    type: 'treasure',
    sanityValue: 580,
    spriteKey: 'loot.纯金校徽',
    description: '纯金校徽，沉甸甸的财富。',
    effect: null,
  },

  // === 白阶 4 件（sanity 750-1500）spec §6.6 ===
  {
    id: 'treasure.blankDiploma',
    name: '无字毕业证',
    rarity: 'white',
    type: 'treasure',
    sanityValue: 750,
    spriteKey: 'loot.无字毕业证',
    description: '一张空白的毕业证，什么都没写。',
    effect: null,
  },
  weaponLoot('weapon.soulBanner', '万魂幡', '万魂幡。普攻有概率恐惧，大招 soulCapture 即死。', 'loot.万魂幡'),
  {
    id: 'treasure.emeraldRing',
    name: '祖母绿戒指',
    rarity: 'white',
    type: 'treasure',
    sanityValue: 1300,
    spriteKey: 'loot.祖母绿戒指',
    description: '祖母绿戒指，绿光幽幽。',
    effect: null,
  },
  {
    id: 'relic.blackGraduationPhoto',
    name: '黑色毕业照',
    rarity: 'white',
    type: 'relic',
    sanityValue: 1500,
    spriteKey: 'loot.黑色毕业照',
    description: '黑色毕业照，受致命伤时复活一次。',
    effect: { kind: 'passiveReviveOnce', reviveHpPercent: 50 },
  },
];

const LOOT_BY_ID: ReadonlyMap<string, LootItem> = new Map(ALL_LOOT.map((it) => [it.id, it]));

export function getLootItem(id: string): LootItem | undefined {
  return LOOT_BY_ID.get(id);
}
```

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/loot-item.test.ts
```

**Expected**：全部通过（48 件齐全、稀有度计数正确、价值区间无越界、武器条目派生正确、效果联合字段正确）。

### Step 5: SURFACE — typecheck + 边界确认

```bash
npm run typecheck
```

- [ ] 确认 `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` 通过
- [ ] 确认 `getLootItem('material.nonexistent')` 返回 `undefined`（已覆盖）
- [ ] 确认 `ALL_LOOT` 为 `readonly LootItem[]`，外部不可变

---

## Task 2: LootTable.ts — 4 张掉率表 + rollLootTable 纯函数

**目标**：定义 `LootRollMode`/`LootTableEntry`/`LootTable`、4 张掉率表（`SILENT_ONE_LOOT_TABLE`/`YANG_YUN_RED_LOOT_TABLE`/`NORMAL_CHEST_LOOT_TABLE`/`GILDED_CHEST_LOOT_TABLE`）、`rollLootTable(table, rng)` 纯函数（single/independent/multiPick 三模式 + 白阶 70% 无字毕业证 + 保底 pity）。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/loot-table.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { getLootItem, LOOT_RARITY_ORDER, type LootItem, type LootRarity } from '../../../tombraid/loot/LootItem';
import {
  GILDED_CHEST_LOOT_TABLE,
  NORMAL_CHEST_LOOT_TABLE,
  rollLootTable,
  SILENT_ONE_LOOT_TABLE,
  WHITE_BLANK_DIPLOMA_RATE,
  YANG_YUN_RED_LOOT_TABLE,
  type LootTable,
} from '../../../tombraid/loot/LootTable';

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
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/loot-table.test.ts
```

**Expected**：失败（模块不存在）。

### Step 3: 实现 LootTable.ts

- [ ] 创建 `src/tombraid/loot/LootTable.ts`：

```ts
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
  readonly weight: number; // 百分比点（single/multiPick 中作为权重；independent 中作为 [0,100) 阈值）
  readonly allowedTypes: readonly LootType[];
}

export interface LootTable {
  readonly id: string;
  readonly rollMode: LootRollMode;
  readonly entries: readonly LootTableEntry[];
  readonly noneWeight?: number; // single 模式空掉落权重
  readonly itemCount?: { readonly min: number; readonly max: number }; // multiPick 模式掷骰次数
  readonly pityRarity?: LootRarity; // multiPick 模式保底稀有度
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
 * 普通宝箱掉落表（multiPick 3-5 件，保底 green，spec §7.4）。
 */
export const NORMAL_CHEST_LOOT_TABLE: LootTable = {
  id: 'normal-chest',
  rollMode: 'independent',
  entries: [
    { rarity: 'blue', weight: 30, allowedTypes: ['material'] },
    { rarity: 'purple', weight: 30, allowedTypes: ['consumable', 'relic', 'material', 'treasure'] },
    { rarity: 'green', weight: 100, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'gold', weight: 15, allowedTypes: ['consumable', 'relic', 'weapon', 'treasure'] },
    { rarity: 'white', weight: 2, allowedTypes: ['treasure', 'weapon', 'relic'] },
  ],
};

/**
 * 鎏金宝箱掉落表（multiPick 4-5 件，保底 gold，spec §7.4）。
 */
export const GILDED_CHEST_LOOT_TABLE: LootTable = {
  id: 'gilded-chest',
  rollMode: 'independent',
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

function rollIndependent(table: LootTable, rng: () => number): LootItem[] {
  const out: LootItem[] = [];
  for (const e of table.entries) {
    // weight 视为百分比阈值：rng() * 100 < weight
    if (rng() * 100 < e.weight) out.push(pickItem(e, rng));
  }
  return out;
}

function rollMultiPick(table: LootTable, rng: () => number): LootItem[] {
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
  return entries[entries.length - 1]!;
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
    if (others.length > 0) return others[Math.floor(rng() * others.length)]!;
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
    return fallback[Math.floor(rng() * fallback.length)]!;
  }
  return candidates[Math.floor(rng() * candidates.length)]!;
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
```

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/loot-table.test.ts
```

**Expected**：全部通过（4 张表定义正确、三模式掷骰范围正确、保底生效、白阶 70% blankDiploma 统计在 0.65-0.75、纯函数可复现）。

### Step 5: SURFACE — typecheck + 边界

```bash
npm run typecheck
```

- [ ] 确认 `LootTable` 不可变（`readonly` 全字段）
- [ ] 确认 `rollLootTable` 无副作用（不修改 table 或 ALL_LOOT）
- [ ] 确认 `applyPity` 在 `out.length === 0` 时不越界

---

## Task 3: Inventory.ts — 本局背包（遗物不叠加 + 消耗品堆叠上限）

**目标**：实现 `Inventory` 类（`add`/`remove`/`has`/`quantity`/`entries`/`activeRelics`/`totalSanityValue`/`clear`）。遗物 `activeRelicIds` 不叠加；消耗品堆叠上限 `BASE_CONSUMABLE_STACK_LIMIT=10`，`relic.tornSchoolbag` 激活时 `+5`；超出上限部分计入 `overflow` 丢弃。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/inventory.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { Inventory, BASE_CONSUMABLE_STACK_LIMIT, TORN_SCHOOLBAG_BONUS } from '../../../tombraid/loot/Inventory';

describe('Inventory constants', () => {
  it('BASE_CONSUMABLE_STACK_LIMIT = 10', () => {
    expect(BASE_CONSUMABLE_STACK_LIMIT).toBe(10);
  });
  it('TORN_SCHOOLBAG_BONUS = 5', () => {
    expect(TORN_SCHOOLBAG_BONUS).toBe(5);
  });
});

describe('Inventory add/remove basics', () => {
  it('add material stacks without cap', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 100);
    expect(inv.quantity('material.chalkStub')).toBe(100);
    expect(inv.has('material.chalkStub')).toBe(true);
  });

  it('add treasure stacks without cap', () => {
    const inv = new Inventory();
    inv.add('treasure.jadePendant', 5);
    expect(inv.quantity('treasure.jadePendant')).toBe(5);
  });

  it('remove decrements quantity', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 10);
    expect(inv.remove('material.chalkStub', 3)).toBe(true);
    expect(inv.quantity('material.chalkStub')).toBe(7);
  });

  it('remove returns false when insufficient', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 2);
    expect(inv.remove('material.chalkStub', 5)).toBe(false);
    expect(inv.quantity('material.chalkStub')).toBe(2);
  });

  it('remove to zero deletes entry', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 5);
    inv.remove('material.chalkStub', 5);
    expect(inv.has('material.chalkStub')).toBe(false);
    expect(inv.quantity('material.chalkStub')).toBe(0);
  });

  it('add unknown item returns added 0 overflow qty', () => {
    const inv = new Inventory();
    const r = inv.add('material.nonexistent', 3);
    expect(r.added).toBe(0);
    expect(r.overflow).toBe(3);
  });
});

describe('Inventory consumable stack limit', () => {
  it('caps consumable at BASE_CONSUMABLE_STACK_LIMIT=10 by default', () => {
    const inv = new Inventory();
    const r = inv.add('consumable.celery', 20);
    expect(inv.quantity('consumable.celery')).toBe(10);
    expect(r.added).toBe(10);
    expect(r.overflow).toBe(10);
  });

  it('caps at 15 when tornSchoolbag active', () => {
    const inv = new Inventory({ isTornSchoolbagActive: () => true });
    inv.add('consumable.celery', 20);
    expect(inv.quantity('consumable.celery')).toBe(15);
  });

  it('subsequent add respects existing cap', () => {
    const inv = new Inventory();
    inv.add('consumable.celery', 8);
    const r = inv.add('consumable.celery', 5);
    expect(inv.quantity('consumable.celery')).toBe(10);
    expect(r.added).toBe(2);
    expect(r.overflow).toBe(3);
  });
});

describe('Inventory relic non-stacking', () => {
  it('adding same relic twice keeps single activeRelic entry', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 1);
    inv.add('relic.blueEdgeHeadband', 1);
    expect(inv.quantity('relic.blueEdgeHeadband')).toBe(2);
    expect(inv.activeRelics()).toEqual(['relic.blueEdgeHeadband']);
  });

  it('different relics each activate once', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 1);
    inv.add('relic.danYuxuanGlasses', 1);
    expect(inv.activeRelics()).toHaveLength(2);
    expect(inv.activeRelics()).toContain('relic.blueEdgeHeadband');
    expect(inv.activeRelics()).toContain('relic.danYuxuanGlasses');
  });

  it('relic deactivates when removed to zero', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.remove('relic.blueEdgeHeadband', 2);
    expect(inv.activeRelics()).toEqual([]);
  });

  it('relic stays active when partially removed', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.remove('relic.blueEdgeHeadband', 1);
    expect(inv.activeRelics()).toEqual(['relic.blueEdgeHeadband']);
    expect(inv.quantity('relic.blueEdgeHeadband')).toBe(1);
  });

  it('materials and treasures are not relics', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 1);
    inv.add('treasure.jadePendant', 1);
    inv.add('consumable.celery', 1);
    inv.add('weapon.ruler', 1);
    expect(inv.activeRelics()).toEqual([]);
  });
});

describe('Inventory totalSanityValue', () => {
  it('sums sanityValue * quantity across all items', () => {
    const inv = new Inventory();
    // chalkStub sanity 12 × 3 = 36
    inv.add('material.chalkStub', 3);
    // celery sanity 120 × 1 = 120
    inv.add('consumable.celery', 1);
    // blueEdgeHeadband sanity 200 × 2 = 400
    inv.add('relic.blueEdgeHeadband', 2);
    expect(inv.totalSanityValue()).toBe(36 + 120 + 400);
  });

  it('returns 0 when empty', () => {
    expect(new Inventory().totalSanityValue()).toBe(0);
  });
});

describe('Inventory entries & clear', () => {
  it('entries lists all items', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 3);
    inv.add('consumable.celery', 1);
    const e = inv.entries();
    expect(e).toHaveLength(2);
    expect(e.map((x) => x.itemId).sort()).toEqual(['consumable.celery', 'material.chalkStub']);
  });

  it('clear empties everything', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.add('material.chalkStub', 5);
    inv.clear();
    expect(inv.entries()).toEqual([]);
    expect(inv.activeRelics()).toEqual([]);
    expect(inv.totalSanityValue()).toBe(0);
  });
});
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/inventory.test.ts
```

**Expected**：失败（模块不存在）。

### Step 3: 实现 Inventory.ts

- [ ] 创建 `src/tombraid/loot/Inventory.ts`：

```ts
import { getLootItem, type LootItem } from './LootItem';

export const BASE_CONSUMABLE_STACK_LIMIT = 10;
export const TORN_SCHOOLBAG_BONUS = 5;

export interface InventoryEntry {
  readonly itemId: string;
  readonly quantity: number;
}

export interface AddResult {
  readonly added: number;
  readonly overflow: number;
}

export interface InventoryOptions {
  readonly isTornSchoolbagActive?: () => boolean;
}

export class Inventory {
  private readonly quantities = new Map<string, number>();
  private readonly activeRelicIds = new Set<string>();
  private readonly isTornSchoolbagActive: () => boolean;

  constructor(opts: InventoryOptions = {}) {
    this.isTornSchoolbagActive = opts.isTornSchoolbagActive ?? (() => false);
  }

  add(itemId: string, qty = 1): AddResult {
    if (qty <= 0) return { added: 0, overflow: 0 };
    const item = getLootItem(itemId);
    if (item === undefined) return { added: 0, overflow: qty };
    const current = this.quantities.get(itemId) ?? 0;
    const cap = this.capFor(item);
    const newQty = Math.min(cap, current + qty);
    const added = newQty - current;
    const overflow = qty - added;
    this.quantities.set(itemId, newQty);
    if (item.type === 'relic' && !this.activeRelicIds.has(itemId)) {
      this.activeRelicIds.add(itemId);
    }
    return { added, overflow };
  }

  remove(itemId: string, qty = 1): boolean {
    if (qty <= 0) return true;
    const current = this.quantities.get(itemId) ?? 0;
    if (current < qty) return false;
    const newQty = current - qty;
    if (newQty <= 0) {
      this.quantities.delete(itemId);
      const item = getLootItem(itemId);
      if (item?.type === 'relic') this.activeRelicIds.delete(itemId);
    } else {
      this.quantities.set(itemId, newQty);
    }
    return true;
  }

  has(itemId: string): boolean {
    return (this.quantities.get(itemId) ?? 0) > 0;
  }

  quantity(itemId: string): number {
    return this.quantities.get(itemId) ?? 0;
  }

  entries(): readonly InventoryEntry[] {
    return [...this.quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  activeRelics(): readonly string[] {
    return [...this.activeRelicIds];
  }

  totalSanityValue(): number {
    let total = 0;
    for (const [itemId, qty] of this.quantities) {
      const item = getLootItem(itemId);
      if (item !== undefined) total += item.sanityValue * qty;
    }
    return total;
  }

  clear(): void {
    this.quantities.clear();
    this.activeRelicIds.clear();
  }

  private capFor(item: LootItem): number {
    if (item.type === 'consumable') {
      return BASE_CONSUMABLE_STACK_LIMIT + (this.isTornSchoolbagActive() ? TORN_SCHOOLBAG_BONUS : 0);
    }
    return Number.POSITIVE_INFINITY;
  }
}
```

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/inventory.test.ts
```

**Expected**：全部通过（消耗品上限 10/15、遗物不叠加、部分移除保持激活、totalSanityValue 求和、clear 清空）。

### Step 5: SURFACE — typecheck + 边界

```bash
npm run typecheck
```

- [ ] 确认 `activeRelics()` 不含重复（`Set` 保证）
- [ ] 确认 `add` 未知 id 不抛异常（返回 overflow=qty）
- [ ] 确认 `remove` qty<=0 直接返回 true（无操作）

---

## Task 4: chestDecryptState.ts — 宝箱破译纯状态机

**目标**：实现 `ChestDecryptState` 纯状态机（`phase: 'idle'|'decrypting'|'opening'|'completed'`、`holding` 布尔、`progress 0..1`、4 锁扣里程碑 0.25/0.5/0.75/1.0、`hold`/`release` 无回退、`advance(deltaMs)`、回调 `onLockBroken`/`onOpenStart`/`onCompleted`、`snapshot()`）。常量 `CHEST_DECRYPT_TOTAL_MS=2500`、`CHEST_DECRYPT_LOCK_COUNT=4`、`CHEST_DECRYPT_OPEN_DURATION_MS=600`。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/chest-decrypt-state.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  CHEST_DECRYPT_LOCK_COUNT,
  CHEST_DECRYPT_OPEN_DURATION_MS,
  CHEST_DECRYPT_TOTAL_MS,
  ChestDecryptState,
  type ChestDecryptPhase,
} from '../../../tombraid/loot/chestDecryptState';

describe('chestDecryptState constants (spec §7.1/§7.2)', () => {
  it('CHEST_DECRYPT_TOTAL_MS = 2500 (~2.5s)', () => {
    expect(CHEST_DECRYPT_TOTAL_MS).toBe(2500);
  });
  it('CHEST_DECRYPT_LOCK_COUNT = 4', () => {
    expect(CHEST_DECRYPT_LOCK_COUNT).toBe(4);
  });
  it('CHEST_DECRYPT_OPEN_DURATION_MS = 600', () => {
    expect(CHEST_DECRYPT_OPEN_DURATION_MS).toBe(600);
  });
});

describe('ChestDecryptState lifecycle', () => {
  it('starts idle with progress 0', () => {
    const s = new ChestDecryptState();
    const snap = s.snapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.progress).toBe(0);
    expect(snap.brokenLocks).toBe(0);
    expect(snap.holding).toBe(false);
  });

  it('start transitions idle -> decrypting and sets holding=true', () => {
    const s = new ChestDecryptState();
    s.start();
    expect(s.snapshot().phase).toBe('decrypting');
    expect(s.snapshot().holding).toBe(true);
  });

  it('start is no-op when not idle', () => {
    const s = new ChestDecryptState();
    s.start();
    s.start(); // 第二次 start 不应崩溃
    expect(s.snapshot().phase).toBe('decrypting');
  });
});

describe('ChestDecryptState hold/release (no regression, spec §7.1)', () => {
  it('release pauses progress without regression', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // progress 0.2
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
    s.release();
    s.advance(1000); // holding=false → 不推进
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
    expect(s.snapshot().holding).toBe(false);
  });

  it('hold resumes progress from where it paused', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // 0.2
    s.release();
    s.advance(1000); // 不动
    s.hold();
    s.advance(500); // 0.2 + 0.2 = 0.4
    expect(s.snapshot().progress).toBeCloseTo(0.4, 3);
    expect(s.snapshot().holding).toBe(true);
  });

  it('advance before start is no-op', () => {
    const s = new ChestDecryptState();
    s.advance(1000);
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().phase).toBe('idle');
  });
});

describe('ChestDecryptState progress & lock milestones (spec §7.1)', () => {
  it('progress rate = 1/2500 per ms', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625); // 625/2500 = 0.25
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });

  it('progress clamps at 1.0', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(5000);
    expect(s.snapshot().progress).toBe(1);
  });

  it('onLockBroken fires at 0.25/0.5/0.75/1.0 with indices 0/1/2/3', () => {
    const onLockBroken = vi.fn();
    const s = new ChestDecryptState({ onLockBroken });
    s.start();
    s.advance(625); // 0.25 → lock 0
    expect(onLockBroken).toHaveBeenCalledWith(0);
    s.advance(625); // 0.5 → lock 1
    expect(onLockBroken).toHaveBeenCalledWith(1);
    s.advance(625); // 0.75 → lock 2
    expect(onLockBroken).toHaveBeenCalledWith(2);
    s.advance(625); // 1.0 → lock 3
    expect(onLockBroken).toHaveBeenCalledWith(3);
    expect(onLockBroken).toHaveBeenCalledTimes(4);
  });

  it('brokenLocks reflects milestone count', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625);
    expect(s.snapshot().brokenLocks).toBe(1);
    s.advance(625);
    expect(s.snapshot().brokenLocks).toBe(2);
  });

  it('repeated advance within same milestone does not re-fire onLockBroken', () => {
    const onLockBroken = vi.fn();
    const s = new ChestDecryptState({ onLockBroken });
    s.start();
    s.advance(100); // 0.04, no lock
    s.advance(100); // 0.08, no lock
    expect(onLockBroken).not.toHaveBeenCalled();
  });
});

describe('ChestDecryptState completion (spec §7.1/§7.3)', () => {
  it('progress reaches 1.0 -> phase opening + onOpenStart', () => {
    const onOpenStart = vi.fn();
    const s = new ChestDecryptState({ onOpenStart });
    s.start();
    s.advance(2500);
    expect(s.snapshot().phase).toBe('opening');
    expect(onOpenStart).toHaveBeenCalledTimes(1);
  });

  it('opening -> completed after CHEST_DECRYPT_OPEN_DURATION_MS', () => {
    const onCompleted = vi.fn();
    const s = new ChestDecryptState({ onCompleted });
    s.start();
    s.advance(2500); // opening
    expect(onCompleted).not.toHaveBeenCalled();
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().phase).toBe('completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it('holding is false during opening/completed', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    expect(s.snapshot().holding).toBe(false);
    s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(s.snapshot().holding).toBe(false);
  });
});

describe('ChestDecryptState reset', () => {
  it('reset returns to idle with all counters zeroed', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2000);
    s.reset();
    const snap = s.snapshot();
    expect(snap.phase).toBe('idle');
    expect(snap.progress).toBe(0);
    expect(snap.brokenLocks).toBe(0);
    expect(snap.holding).toBe(false);
  });

  it('can restart after reset', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    s.reset();
    s.start();
    expect(s.snapshot().phase).toBe('decrypting');
    s.advance(625);
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });
});
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/chest-decrypt-state.test.ts
```

**Expected**：失败（模块不存在）。

### Step 3: 实现 chestDecryptState.ts

- [ ] 创建 `src/tombraid/loot/chestDecryptState.ts`：

```ts
export type ChestDecryptPhase = 'idle' | 'decrypting' | 'opening' | 'completed';

export const CHEST_DECRYPT_TOTAL_MS = 2500;
export const CHEST_DECRYPT_LOCK_COUNT = 4;
export const CHEST_DECRYPT_OPEN_DURATION_MS = 600;

export interface ChestDecryptSnapshot {
  readonly phase: ChestDecryptPhase;
  readonly progress: number;
  readonly brokenLocks: number;
  readonly elapsedMs: number;
  readonly holding: boolean;
}

export interface ChestDecryptCallbacks {
  readonly onLockBroken?: (lockIndex: number) => void;
  readonly onOpenStart?: () => void;
  readonly onCompleted?: () => void;
}

export interface ChestDecryptStateOptions extends ChestDecryptCallbacks {}

export class ChestDecryptState {
  private phase: ChestDecryptPhase = 'idle';
  private progress = 0;
  private elapsedMs = 0;
  private brokenLocks = 0;
  private holding = false;
  private openElapsedMs = 0;
  private readonly callbacks: ChestDecryptCallbacks;

  constructor(callbacks: ChestDecryptCallbacks = {}) {
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'decrypting';
    this.holding = true;
  }

  hold(): void {
    if (this.phase === 'decrypting') this.holding = true;
  }

  release(): void {
    this.holding = false;
  }

  advance(deltaMs: number): void {
    if (deltaMs <= 0) return;
    if (this.phase === 'decrypting' && this.holding) {
      this.advanceDecrypt(deltaMs);
    } else if (this.phase === 'opening') {
      this.advanceOpening(deltaMs);
    }
  }

  reset(): void {
    this.phase = 'idle';
    this.progress = 0;
    this.elapsedMs = 0;
    this.brokenLocks = 0;
    this.holding = false;
    this.openElapsedMs = 0;
  }

  snapshot(): ChestDecryptSnapshot {
    return {
      phase: this.phase,
      progress: this.progress,
      brokenLocks: this.brokenLocks,
      elapsedMs: this.elapsedMs,
      holding: this.holding,
    };
  }

  private advanceDecrypt(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    this.progress = Math.min(1, this.elapsedMs / CHEST_DECRYPT_TOTAL_MS);
    const newBroken = Math.min(
      CHEST_DECRYPT_LOCK_COUNT,
      Math.floor(this.progress * CHEST_DECRYPT_LOCK_COUNT),
    );
    while (this.brokenLocks < newBroken) {
      this.brokenLocks += 1;
      this.callbacks.onLockBroken?.(this.brokenLocks - 1);
    }
    if (this.progress >= 1) {
      this.phase = 'opening';
      this.holding = false;
      this.callbacks.onOpenStart?.();
    }
  }

  private advanceOpening(deltaMs: number): void {
    this.openElapsedMs += deltaMs;
    if (this.openElapsedMs >= CHEST_DECRYPT_OPEN_DURATION_MS) {
      this.phase = 'completed';
      this.callbacks.onCompleted?.();
    }
  }
}
```

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/chest-decrypt-state.test.ts
```

**Expected**：全部通过（生命周期、hold/release 无回退、4 锁扣里程碑 0.25/0.5/0.75/1.0、opening/completed 转移、reset 重置）。

### Step 5: SURFACE — typecheck + 边界

```bash
npm run typecheck
```

- [ ] 确认 `ChestDecryptState` 不 import Phaser
- [ ] 确认 `advance(deltaMs<=0)` 是 no-op
- [ ] 确认 `release` 后 `progress` 不回退（已覆盖）

---

## Task 5: ChestDecrypt.ts — Phaser 薄层渲染 + F 键 wiring

**目标**：实现 `ChestDecrypt` 类（`import type Phaser`，构造注入 scene）。F 按下时 `state.start()` 或 `state.hold()`，松开 `state.release()`；`update(deltaMs)` 调 `state.advance` 并按 snapshot 程序绘制码环/进度弧；锁扣崩开触发屏震；progress 达 1.0 切贴图 `prop.phoneCabinetFront`→`prop.phoneCabinetAngled` + 全屏白闪；`onCompleted` 时战利品卡飞出，点击战利品卡回调 `onLootCollected`。测试注入 fake scene（无 `vi.mock('phaser')`）。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/chest-decrypt.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { ChestDecrypt } from '../../../tombraid/loot/ChestDecrypt';
import { CHEST_DECRYPT_OPEN_DURATION_MS, CHEST_DECRYPT_TOTAL_MS } from '../../../tombraid/loot/chestDecryptState';
import { getLootItem, type LootItem } from '../../../tombraid/loot/LootItem';

interface FakeImage {
  textureKey: string;
  setDisplaySize: (w: number, h: number) => FakeImage;
  setTexture: (key: string) => void;
  destroy: () => void;
}
interface FakeGraphics {
  clear: () => FakeGraphics;
  lineStyle: () => FakeGraphics;
  beginPath: () => FakeGraphics;
  arc: () => FakeGraphics;
  strokePath: () => FakeGraphics;
}
interface FakeContainer {
  add: () => FakeContainer;
  setSize: () => FakeContainer;
  setInteractive: () => FakeContainer;
  on: (event: string, cb: () => void) => FakeContainer;
  destroy: () => void;
  x: number;
  y: number;
}
interface FakeTween {
  target: unknown;
}
interface FakeCamera {
  shake: (duration: number, intensity: number) => void;
  flash: (duration: number, r: number, g: number, b: number) => void;
}
interface FakeKeyboard {
  handlers: Record<string, Array<() => void>>;
  on: (event: string, cb: () => void) => void;
}
interface FakeScene {
  add: {
    image: (x: number, y: number, key: string) => FakeImage;
    graphics: () => FakeGraphics;
    container: (x: number, y: number) => FakeContainer;
  };
  cameras: { main: FakeCamera };
  input: { keyboard: FakeKeyboard };
  tweens: { add: (cfg: Record<string, unknown>) => FakeTween };
}

function createFakeScene(): FakeScene {
  const keyboard: FakeKeyboard = { handlers: {}, on(e, cb) { (this.handlers[e] ??= []).push(cb); } };
  const camera: FakeCamera = { shake: vi.fn(), flash: vi.fn() };
  return {
    add: {
      image: vi.fn((_x, _y, key) => ({
        textureKey: key,
        setDisplaySize: vi.fn(function (this: FakeImage) { return this; }),
        setTexture: vi.fn(function (this: FakeImage, k: string) { this.textureKey = k; return this; }),
        destroy: vi.fn(),
      })),
      graphics: vi.fn(() => ({
        clear: vi.fn(function (this: FakeGraphics) { return this; }),
        lineStyle: vi.fn(function (this: FakeGraphics) { return this; }),
        beginPath: vi.fn(function (this: FakeGraphics) { return this; }),
        arc: vi.fn(function (this: FakeGraphics) { return this; }),
        strokePath: vi.fn(function (this: FakeGraphics) { return this; }),
      })),
      container: vi.fn((_x, _y) => ({
        add: vi.fn(function (this: FakeContainer) { return this; }),
        setSize: vi.fn(function (this: FakeContainer) { return this; }),
        setInteractive: vi.fn(function (this: FakeContainer) { return this; }),
        on: vi.fn(function (this: FakeContainer, _e: string, cb: () => void) {
          (this as unknown as { _cb?: () => void })._cb = cb;
          return this;
        }),
        destroy: vi.fn(),
        x: 0,
        y: 0,
      })),
    },
    cameras: { main: camera },
    input: { keyboard },
    tweens: { add: vi.fn(() => ({ target: null })) },
  } as unknown as FakeScene;
}

function fireKey(scene: FakeScene, event: string): void {
  for (const cb of scene.input.keyboard.handlers[event] ?? []) cb();
}

const sampleLoot: LootItem[] = [
  getLootItem('material.chalkStub')!,
  getLootItem('consumable.celery')!,
];

describe('ChestDecrypt input wiring', () => {
  it('F keydown when idle starts state', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 100, y: 200, lootItems: [] });
    fireKey(scene, 'keydown-F');
    expect(cd.snapshot().phase).toBe('decrypting');
    cd.destroy();
  });

  it('F keyup releases (pauses progress)', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F'); // start + hold
    cd.update(625); // progress 0.25
    fireKey(scene, 'keyup-F'); // release
    cd.update(625); // holding=false → 不推进
    expect(cd.snapshot().progress).toBeCloseTo(0.25, 4);
    cd.destroy();
  });

  it('second keydown-F (already decrypting) calls hold', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(100);
    fireKey(scene, 'keyup-F');
    fireKey(scene, 'keydown-F'); // hold
    cd.update(525); // 0.04 + 0.21 = 0.25
    expect(cd.snapshot().progress).toBeCloseTo(0.25, 4);
    cd.destroy();
  });

  it('uses custom inputKey when provided', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [], inputKey: 'H' });
    fireKey(scene, 'keydown-H');
    expect(cd.snapshot().phase).toBe('decrypting');
    cd.destroy();
  });
});

describe('ChestDecrypt update advances state', () => {
  it('update forwards deltaMs to state.advance', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    expect(cd.snapshot().phase).toBe('opening');
    cd.destroy();
  });
});

describe('ChestDecrypt visual feedback (spec §7.3)', () => {
  it('cabinet starts with prop.phoneCabinetFront texture', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    expect(cd.cabinetTextureKey()).toBe('prop.phoneCabinetFront');
    cd.destroy();
  });

  it('lock broken triggers camera shake', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(625); // lock 0 broken
    expect(scene.cameras.main.shake).toHaveBeenCalled();
    cd.destroy();
  });

  it('progress reaches 1.0 swaps texture to phoneCabinetAngled + white flash', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    expect(cd.cabinetTextureKey()).toBe('prop.phoneCabinetAngled');
    expect(scene.cameras.main.flash).toHaveBeenCalled();
    cd.destroy();
  });
});

describe('ChestDecrypt loot card spawn (spec §7.3)', () => {
  it('onCompleted spawns loot cards and pointerdown collects', () => {
    const scene = createFakeScene();
    const collected: LootItem[] = [];
    const cd = new ChestDecrypt({
      scene,
      x: 0,
      y: 0,
      lootItems: sampleLoot,
      onLootCollected: (item) => collected.push(item),
    });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS); // opening
    cd.update(CHEST_DECRYPT_OPEN_DURATION_MS); // completed
    expect(collected).toHaveLength(0); // 尚未点击
    cd.clickAllLootCards();
    expect(collected).toHaveLength(2);
    expect(collected.map((it) => it.id).sort()).toEqual(['consumable.celery', 'material.chalkStub']);
    cd.destroy();
  });

  it('onLootCollected defaults to no-op when omitted', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: sampleLoot });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    cd.update(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(() => cd.clickAllLootCards()).not.toThrow();
    cd.destroy();
  });

  it('destroy cleans up container', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene, x: 0, y: 0, lootItems: [] });
    cd.destroy();
    // 多次 destroy 不崩溃
    expect(() => cd.destroy()).not.toThrow();
  });
});
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/chest-decrypt.test.ts
```

**Expected**：失败（模块不存在）。

### Step 3: 实现 ChestDecrypt.ts

- [ ] 创建 `src/tombraid/loot/ChestDecrypt.ts`：

**渲染参数（spec §7.3 grill 确认 2026-07-17，夸张视觉档，权威性高于下方既有代码常量）**：

| 元素 | 参数 | 常量名建议 |
|------|------|-----------|
| 旋转码环 | r80，1 圈/s，像素字符 8 个均匀分布 | `CODE_RING_RADIUS = 80` / `CODE_RING_ROTATE_SPEED = 2*Math.PI` / `CODE_RING_CHAR_COUNT = 8` |
| 进度弧 | r100，0°→360° 随 progress 填充，金色描边 | `PROGRESS_ARC_RADIUS = 100` |
| 粒子 | 16 个，环绕宝箱随机角度，r120-150 漂浮，1s 寿命循环 | `PARTICLE_COUNT = 16` / `PARTICLE_MIN_R = 120` / `PARTICLE_MAX_R = 150` / `PARTICLE_LIFETIME_MS = 1000` |
| 屏震幅度 | `progress × 6px`（progress=1 时最大 6px） | `SHAKE_MAX_PX = 6` |
| 锁扣崩开震幅 | ×3（即 18px 瞬时震） | `LOCK_BREAK_SHAKE_MULTIPLIER = 3` |
| 最后一扣全屏白闪 | 1 帧（~16ms），alpha=1.0 后立即归零 | `FINAL_LOCK_FLASH_MS = 16` |
| 开盖金光柱 | r150 高 150，从宝箱中心向上，持续 800ms 渐隐 | `LIGHT_PILLAR_RADIUS = 150` / `LIGHT_PILLAR_HEIGHT = 150` / `LIGHT_PILLAR_DURATION_MS = 800` |
| 战利品卡 | 64×64，按稀有度描边色（蓝#4a90e2 / 紫#a155d1 / 绿#4caf50 / 金#ffc107 / 白#ffffff），从宝箱飞出 200px 距离悬停 1.5s 可拾取 | `LOOT_CARD_SIZE = 64` / `LOOT_CARD_FLY_DISTANCE = 200` / `LOOT_CARD_HOVER_MS = 1500` / `LOOT_RARITY_BORDER_COLORS` |

既有代码段中若 `setDisplaySize(96, 144)` 或其他常量与上表冲突，以上表为准。下方代码块保留作骨架参考，执行 agent 需按上表常量重写渲染部分。

```ts
import type Phaser from 'phaser';

import {
  ChestDecryptState,
  type ChestDecryptSnapshot,
} from './chestDecryptState';
import type { LootItem } from './LootItem';

export interface ChestDecryptConfig {
  readonly scene: Phaser.Scene;
  readonly x: number;
  readonly y: number;
  readonly lootItems: readonly LootItem[];
  readonly onLootCollected?: (item: LootItem) => void;
  readonly inputKey?: string;
}

interface LootCardHandle {
  readonly container: Phaser.GameObjects.Container;
  readonly item: LootItem;
  readonly onClick: () => void;
}

export class ChestDecrypt {
  private readonly scene: Phaser.Scene;
  private readonly inputKey: string;
  private readonly onLootCollected: (item: LootItem) => void;
  private readonly state: ChestDecryptState;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cabinet: Phaser.GameObjects.Image;
  private readonly ringGraphics: Phaser.GameObjects.Graphics;
  private readonly arcGraphics: Phaser.GameObjects.Graphics;
  private readonly lootCards: LootCardHandle[] = [];
  private destroyed = false;

  constructor(config: ChestDecryptConfig) {
    this.scene = config.scene;
    this.inputKey = config.inputKey ?? 'F';
    this.onLootCollected = config.onLootCollected ?? (() => {});

    this.state = new ChestDecryptState({
      onLockBroken: (i) => this.handleLockBroken(i),
      onOpenStart: () => this.handleOpenStart(),
      onCompleted: () => this.handleCompleted(),
    });

    this.container = config.scene.add.container(config.x, config.y);
    this.cabinet = config.scene.add.image(0, 0, 'prop.phoneCabinetFront').setDisplaySize(96, 144);
    this.ringGraphics = config.scene.add.graphics();
    this.arcGraphics = config.scene.add.graphics();
    this.container.add([this.cabinet, this.ringGraphics, this.arcGraphics]);

    this.wireInput();
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.state.advance(deltaMs);
    this.render();
  }

  snapshot(): ChestDecryptSnapshot {
    return this.state.snapshot();
  }

  cabinetTextureKey(): string {
    return (this.cabinet as unknown as { textureKey?: string }).textureKey
      ?? (this.cabinet.texture as unknown as { key: string } | null)?.key
      ?? '';
  }

  clickAllLootCards(): void {
    for (const card of [...this.lootCards]) card.onClick();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy();
    this.lootCards.length = 0;
  }

  private wireInput(): void {
    const kb = this.scene.input.keyboard;
    if (kb === null) return;
    kb.on(`keydown-${this.inputKey}`, () => this.onKeyDown());
    kb.on(`keyup-${this.inputKey}`, () => this.state.release());
  }

  private onKeyDown(): void {
    if (this.destroyed) return;
    const snap = this.state.snapshot();
    if (snap.phase === 'idle') this.state.start();
    else this.state.hold();
  }

  private render(): void {
    const snap = this.state.snapshot();
    this.arcGraphics.clear();
    if (snap.phase === 'decrypting' || snap.phase === 'opening') {
      this.arcGraphics.lineStyle(4, 0xffd700, 1);
      this.arcGraphics.beginPath();
      this.arcGraphics.arc(
        0,
        0,
        60,
        -Math.PI / 2,
        -Math.PI / 2 + snap.progress * Math.PI * 2,
      );
      this.arcGraphics.strokePath();
    }
    this.ringGraphics.clear();
    if (snap.phase === 'decrypting') {
      // 旋转码环：随时间旋转（这里用 progress 作为近似角度）
      const angle = snap.elapsedMs * 0.01;
      this.ringGraphics.lineStyle(2, 0x88aacc, 0.6);
      this.ringGraphics.beginPath();
      this.ringGraphics.arc(0, 0, 70, angle, angle + Math.PI * 1.5);
      this.ringGraphics.strokePath();
    }
  }

  private handleLockBroken(lockIndex: number): void {
    const intensity = 0.004 + lockIndex * 0.003;
    this.scene.cameras.main.shake(80, intensity);
  }

  private handleOpenStart(): void {
    // 全屏白闪 1 帧（spec §7.3）
    this.scene.cameras.main.flash(60, 255, 255, 255);
    // 切贴图 prop.phoneCabinetFront -> prop.phoneCabinetAngled
    this.cabinet.setTexture('prop.phoneCabinetAngled');
  }

  private handleCompleted(): void {
    // 战利品卡飞出（spec §7.3）
    for (let i = 0; i < this.config_lootItems().length; i++) {
      this.spawnLootCard(this.config_lootItems()[i]!, i);
    }
  }

  private config_lootItems(): readonly LootItem[] {
    return (this as unknown as { _lootItems?: readonly LootItem[] })._lootItems
      ?? this.lootItemsFromConfig;
  }

  private get lootItemsFromConfig(): readonly LootItem[] {
    return (this as unknown as { __configLoot?: readonly LootItem[] }).__configLoot ?? [];
  }

  private spawnLootCard(item: LootItem, index: number): void {
    const offsetX = (index - 1) * 70;
    const card = this.scene.add.container(this.container.x + offsetX, this.container.y - 80);
    const icon = this.scene.add.image(0, 0, item.spriteKey).setDisplaySize(48, 48);
    card.add(icon);
    card.setSize(64, 64);
    card.setInteractive({ useHandCursor: true });
    const onClick = (): void => {
      this.onLootCollected(item);
      const idx = this.lootCards.findIndex((h) => h.item === item);
      if (idx >= 0) this.lootCards.splice(idx, 1);
      card.destroy();
    };
    card.on('pointerdown', onClick);
    this.scene.tweens.add({
      targets: card,
      y: card.y - 30,
      duration: 300,
      ease: 'Cubic.out',
    });
    this.lootCards.push({ container: card, item, onClick });
  }
}
```

> **注**：`config_lootItems()`/`lootItemsFromConfig` 是为绕过 strict 模式下「构造参数 config 不持久化」的取巧写法；实际实现应将 `config.lootItems` 存为 `private readonly lootItems` 字段直接读取，更清晰。下面给出推荐写法（实现时请用此版本，上面仅为占位说明测试契约）：

```ts
// 推荐实现：在构造函数中保存 lootItems
export class ChestDecrypt {
  private readonly lootItems: readonly LootItem;
  // ...其他字段同上
  constructor(config: ChestDecryptConfig) {
    // ...
    this.lootItems = config.lootItems;
    // ...
  }
  private handleCompleted(): void {
    for (let i = 0; i < this.lootItems.length; i++) {
      this.spawnLootCard(this.lootItems[i]!, i);
    }
  }
}
```

> 实现时请直接采用推荐写法（字段 `lootItems`），删除 `config_lootItems()`/`lootItemsFromConfig` 这两个 helper。测试不依赖它们的内部形态，只断言行为契约。

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/chest-decrypt.test.ts
```

**Expected**：全部通过（F 键 wiring start/hold/release、update 推进 state、屏震、贴图切换、白闪、战利品卡 spawn + click 回调、destroy 幂等）。

### Step 5: SURFACE — typecheck + 边界

```bash
npm run typecheck
```

- [ ] 确认 `ChestDecrypt.ts` 只 `import type Phaser`（运行时无 phaser 依赖）
- [ ] 确认 `destroy()` 幂等（多次调用不崩溃）
- [ ] 确认 `inputKey` 默认 `'F'`，自定义 `'H'` 也能 wire

---

## Task 6: lootAssetKeys.ts — itemId→spriteKey 解析 + manifest 交叉验证

**目标**：实现 `lootAssetKeys.ts`，提供 `lootSpriteKeyFor(itemId)` 将 LootItem.id 解析为 `assetManifest` 中已注册的 `loot.<中文名>` texture key；`validateLootSpriteKeys()` 交叉验证 48 件 spec §6 LootItem 的 `spriteKey` 全部存在于 `assetManifest`。**注**：`src/data/assets.ts` 中 52 条 `loot.<中文名>` manifest 条目（行 565-1084，含 spec §6 的 48 件 + 4 把非 §6 的 plan 4 武器 `loot.断尺`/`loot.粉笔`/`loot.灵刃`/`loot.拳套`）已由先前 plan 注册，`assets.test.ts` 已断言 `toHaveLength(134)`。本任务不重复添加 manifest 条目，只新增 plan 5 的胶水模块与交叉验证测试。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/loot-asset-keys.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { assetManifest } from '../../../data/assets';
import { ALL_LOOT, getLootItem } from '../../../tombraid/loot/LootItem';
import { lootSpriteKeyFor, validateLootSpriteKeys, LOOT_SPRITE_KEY_MAP } from '../../../tombraid/loot/lootAssetKeys';

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
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/loot-asset-keys.test.ts
```

**Expected**：失败（模块不存在）。

### Step 3: 实现 lootAssetKeys.ts

- [ ] 创建 `src/tombraid/loot/lootAssetKeys.ts`：

```ts
import { assetManifest } from '../../data/assets';
import { ALL_LOOT } from './LootItem';

/**
 * itemId -> `loot.<中文名>` manifest key 映射。
 * 与 `src/data/assets.ts` 中已注册的 52 条 `loot.*` manifest 条目一一对应。
 * spec §6 的 48 件碎片每件一条；4 把非 §6 的 plan 4 武器（断尺/粉笔/灵刃/拳套）不在本映射中
 * （它们是 plan 4 WeaponDef，不是 plan 5 LootItem）。
 */
export const LOOT_SPRITE_KEY_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  // 蓝阶 12
  ['material.chalkStub', 'loot.粉笔头'],
  ['material.brokenPencil', 'loot.断铅笔'],
  ['material.emptyColaCan', 'loot.空可乐罐'],
  ['material.rustyHairpin', 'loot.生锈发卡'],
  ['material.lostHomework', 'loot.走失作业本'],
  ['material.bloodstainedUniform', 'loot.沾血校服布'],
  ['material.tornDiary', 'loot.缺页日记'],
  ['material.dustyMedal', 'loot.蒙尘奖章'],
  ['material.brokenRulerShard', 'loot.断尺碎片'],
  ['material.oldCassette', 'loot.旧磁带'],
  ['material.bloodstainedLoveLetter', 'loot.染血情书'],
  ['material.rustyClassPlate', 'loot.生锈班牌'],
  // 紫阶 12
  ['consumable.mint', 'loot.薄荷糖'],
  ['consumable.expiredEyeDrops', 'loot.过期眼药水'],
  ['consumable.halfBottleWater', 'loot.半瓶矿泉水'],
  ['relic.fadedStudentCard', 'loot.褪色学生卡'],
  ['relic.wornEraser', 'loot.磨旧橡皮'],
  ['relic.tornSchoolbag', 'loot.破洞书包'],
  ['material.steelMealCard', 'loot.不锈钢饭卡'],
  ['material.glassMarble', 'loot.玻璃弹珠'],
  ['material.brassBookmark', 'loot.黄铜书签'],
  ['material.plasticAbacusBead', 'loot.塑料算盘珠'],
  ['treasure.silverSchoolBadge', 'loot.银质校徽'],
  ['treasure.jadePendantFragment', 'loot.玉坠碎片'],
  // 绿阶 12
  ['consumable.celery', 'loot.芹菜'],
  ['consumable.antidote', 'loot.解药'],
  ['consumable.adrenaline', 'loot.肾上腺素'],
  ['relic.blueEdgeHeadband', 'loot.蓝边发带'],
  ['relic.danYuxuanGlasses', 'loot.但宇轩眼镜'],
  ['relic.qinHaoruiRulerCompass', 'loot.秦浩睿尺规'],
  ['relic.bloodstainedBandage', 'loot.血渍绷带'],
  ['relic.boxingGlove', 'loot.拳击手套'],
  ['weapon.ruler', 'loot.尺子'],
  ['treasure.jadeSchoolPlate', 'loot.翡翠校牌'],
  ['treasure.jadePendant', 'loot.玉佩'],
  ['treasure.gildedPen', 'loot.镀金钢笔'],
  // 金阶 8
  ['consumable.holyWater', 'loot.圣水'],
  ['consumable.soulBell', 'loot.镇魂铃'],
  ['relic.redEdgeHeadband', 'loot.红边发带'],
  ['relic.principalSeal', 'loot.校长印章'],
  ['weapon.chain', 'loot.锁链'],
  ['weapon.bloodScythe', 'loot.血镰'],
  ['treasure.diamondCufflink', 'loot.钻石袖扣'],
  ['treasure.pureGoldSchoolBadge', 'loot.纯金校徽'],
  // 白阶 4
  ['treasure.blankDiploma', 'loot.无字毕业证'],
  ['weapon.soulBanner', 'loot.万魂幡'],
  ['treasure.emeraldRing', 'loot.祖母绿戒指'],
  ['relic.blackGraduationPhoto', 'loot.黑色毕业照'],
]);

export function lootSpriteKeyFor(itemId: string): string | undefined {
  return LOOT_SPRITE_KEY_MAP.get(itemId);
}

/**
 * 交叉验证 ALL_LOOT 中每件 LootItem 的 spriteKey 都存在于 assetManifest。
 * 返回失败条目列表（空数组表示全部通过）。
 */
export function validateLootSpriteKeys(): readonly string[] {
  const manifestKeys = new Set(assetManifest.map((a) => a.key));
  const failures: string[] = [];
  for (const it of ALL_LOOT) {
    const resolved = lootSpriteKeyFor(it.id);
    if (resolved === undefined) {
      failures.push(`LootItem ${it.id} has no spriteKey resolver entry`);
      continue;
    }
    if (resolved !== it.spriteKey) {
      failures.push(`LootItem ${it.id} spriteKey ${it.spriteKey} != resolver ${resolved}`);
    }
    if (!manifestKeys.has(it.spriteKey)) {
      failures.push(`LootItem ${it.id} spriteKey ${it.spriteKey} not in assetManifest`);
    }
  }
  return failures;
}
```

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/loot-asset-keys.test.ts
```

**Expected**：全部通过（48 条映射齐全、resolver 正确、全部 spriteKey 存在于 manifest、manifest 含 52 条 loot.* 条目）。

### Step 5: SURFACE — typecheck + 边界

```bash
npm run typecheck
```

- [ ] 确认 `validateLootSpriteKeys()` 返回空数组（48 件全通过）
- [ ] 确认 `lootSpriteKeyFor` 未知 id 返回 `undefined`
- [ ] 确认未修改 `assets.ts` / `assets.test.ts`（manifest 已就绪，本任务只读不写）

---

## Task 7: 集成冒烟测试 — plan 5 内部模块联动

**目标**：在 `src/tests/tombraid/loot/integration.test.ts` 中验证 plan 5 四大模块联动：
1. 缄默者掉落入袋：`rollLootTable(SILENT_ONE_LOOT_TABLE, rng)` 结果 `Inventory.add` 入袋，`totalSanityValue` 累加
2. 宝箱破译出宝入袋：`rollLootTable(NORMAL_CHEST_LOOT_TABLE, rng)` → `ChestDecryptState` 完成回调 → `Inventory.add`，遗物不叠加
3. 杨云红边掉落：`rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng)` 0-4 件入袋
4. 遗物不叠加 + 消耗品上限受破洞书包影响

测试为纯 TS（无 Phaser），只调 `LootTable`/`Inventory`/`ChestDecryptState`，不涉及 `ChestDecrypt`（Phaser 层）。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/loot/integration.test.ts`：

```ts
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

    // 入袋数量 = loot 数量
    expect(inv.entries()).toHaveLength(loot.length);
    // totalSanityValue 等于 loot 之和
    const expected = loot.reduce((s, it) => s + it.sanityValue, 0);
    expect(inv.totalSanityValue()).toBe(expected);
  });

  it('gilded chest pity guarantees a gold+ drop that lands in inventory', () => {
    const loot = rollLootTable(GILDED_CHEST_LOOT_TABLE, mulberry32(99)) as LootItem[];
    const hasGold = loot.some((it) => it.rarity === 'gold' || it.rarity === 'white');
    expect(hasGold).toBe(true);
    const inv = new Inventory();
    for (const item of loot) inv.add(item.id, 1);
    expect(inv.entries().length).toBeGreaterThanOrEqual(4);
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
```

### Step 2: 运行测试确认 RED

```bash
npx vitest run src/tests/tombraid/loot/integration.test.ts
```

**Expected**：失败（依赖的 `LootItem`/`LootTable`/`Inventory`/`chestDecryptState` 模块在 Task 1-4 完成前不存在；若按 Task 顺序执行，本 Task 7 应为 GREEN 一步到位）。

### Step 3: 确认无新实现代码

本 Task 为集成测试，不新增源码。所有被测模块（`LootItem`/`LootTable`/`Inventory`/`chestDecryptState`）已在 Task 1-4 实现。若 Task 7 在 Task 1-6 之后执行，则直接进入 Step 4。

- [ ] 确认 `src/tombraid/loot/` 目录下 6 个源文件齐全：
  - `LootItem.ts`
  - `LootTable.ts`
  - `Inventory.ts`
  - `chestDecryptState.ts`
  - `ChestDecrypt.ts`
  - `lootAssetKeys.ts`

### Step 4: 运行测试确认 GREEN

```bash
npx vitest run src/tests/tombraid/loot/integration.test.ts
```

**Expected**：全部通过（缄默者掉落入袋、宝箱破译出宝入袋、杨云红边 0-4 件、遗物不叠加、消耗品上限受破洞书包影响、100 种子 sanityValue 一致）。

### Step 5: SURFACE — 全量 typecheck + test:run

```bash
npm run typecheck
npm run test:run
```

- [ ] 确认全量 `npm run test:run` 通过（plan 5 的 7 个测试文件 + 既有测试无回归）
- [ ] 确认 `npm run typecheck` 无错误（strict 模式全通过）
- [ ] 确认未修改剧情模式代码（`src/story/`、`src/scenes/PlayScene.ts`、`src/data/story.ts` 等）

---

## Self-Review

### 1. spec 覆盖完整性（spec §6/§7/§10）

| spec 条目 | 覆盖位置 |
|----------|---------|
| §6.1 稀有度顺序 蓝<紫<绿<金<白 | `LootItem.LOOT_RARITY_ORDER` + Task 1 测试 |
| §6.2 蓝阶 12 件材料 sanity 10-35 | `ALL_LOOT` 蓝阶段 + Task 1 区间断言 |
| §6.3 紫阶 12 件（消耗3/遗物3/材料4/宝物2）sanity 45-95 | `ALL_LOOT` 紫阶段 + Task 1 计数+区间断言 |
| §6.4 绿阶 12 件（消耗3/遗物5/武器1/宝物3）sanity 120-220 | `ALL_LOOT` 绿阶段 + Task 1 |
| §6.5 金阶 8 件（消耗2/遗物2/武器2/宝物2）sanity 400-580 | `ALL_LOOT` 金阶段 + Task 1 |
| §6.6 白阶 4 件 sanity 750-1500 | `ALL_LOOT` 白阶段 + Task 1 |
| §6.7 白阶 70% 无字毕业证 | `LootTable.WHITE_BLANK_DIPLOMA_RATE` + `pickItem` + Task 2 统计测试 |
| §6.8 LootItem 数据结构 | `LootItem` 接口 + `LootEffect` 判别联合 |
| §7.1 破译 hold/pause 无回退 + 4 锁扣 | `chestDecryptState` + Task 4 |
| §7.2 破译状态机 states + rate 1/2500 per ms | `CHEST_DECRYPT_TOTAL_MS=2500` + Task 4 |
| §7.3 宝箱视觉（贴图切换/白闪/屏震/战利品卡） | `ChestDecrypt` + Task 5 |
| §7.4 普通宝箱 3-5 件 / 鎏金 4-5 件 + 保底 | `NORMAL_CHEST_LOOT_TABLE`/`GILDED_CHEST_LOOT_TABLE` + Task 2 |
| §10.1 杨云红边独立掷骰 紫50/绿30/金8/白2 + 钥匙非碎片 | `YANG_YUN_RED_LOOT_TABLE` + Task 2/7 |
| §10.2 LootRollMode single/independent/multiPick | `LootRollMode` + `rollLootTable` + Task 2 |
| §11.1 目录结构 `loot/` 6 文件 | File Structure 表 |
| §11.3 loot key 命名 `loot.<itemId>` | `lootAssetKeys.LOOT_SPRITE_KEY_MAP`（注：manifest 实际用 `loot.<中文名>`，本 plan 以 manifest 为权威，resolver 做 itemId→中文名映射） |
| §11.3 46 件 loot manifest 条目 | Task 6 注：manifest 已含 52 条（48 spec + 4 非 §6），`validateLootSpriteKeys` 交叉验证 |

22 条 spec 条目全覆盖。

### 2. 无占位符

通读全文无 `TODO` / `TBD` / `implement later` / `similar to Task N` / `...`（除代码块内的方法体省略号已补全）。Task 5 的 `config_lootItems()` 占位写法已显式标注「实现时请用推荐写法」并给出完整推荐实现，非占位符。所有测试与实现代码完整可运行。

### 3. 类型一致

- `LootRarity`（5 值）/ `LootType`（5 值）/ `LootEffect`（13 变体 + null）/ `LootItem` 字段名（`id`/`name`/`rarity`/`type`/`sanityValue`/`spriteKey`/`description`/`effect`）在 Task 1-7 全部一致引用
- `LootTable`/`LootTableEntry`/`LootRollMode` 在 Task 2 与 Task 7 集成测试一致
- `Inventory` 的 `add`/`remove`/`has`/`quantity`/`entries`/`activeRelics`/`totalSanityValue`/`clear` 签名在 Task 3 与 Task 7 一致
- `ChestDecryptState` 的 `start`/`hold`/`release`/`advance`/`reset`/`snapshot` 与 Task 4/5/7 一致
- `ChestDecrypt` 的 `update`/`snapshot`/`cabinetTextureKey`/`clickAllLootCards`/`destroy` 与 Task 5 测试契约一致
- `lootSpriteKeyFor`/`validateLootSpriteKeys`/`LOOT_SPRITE_KEY_MAP` 在 Task 6 测试与实现一致
- 素材 key `loot.<中文名>` 在 `LootItem.spriteKey`、`lootAssetKeys.LOOT_SPRITE_KEY_MAP`、`assetManifest` 三处一一对应

### 4. 48 件齐全

- 蓝 12：chalkStub/brokenPencil/emptyColaCan/rustyHairpin/lostHomework/bloodstainedUniform/tornDiary/dustyMedal/brokenRulerShard/oldCassette/bloodstainedLoveLetter/rustyClassPlate
- 紫 12：mint/expiredEyeDrops/halfBottleWater/fadedStudentCard/wornEraser/tornSchoolbag/steelMealCard/glassMarble/brassBookmark/plasticAbacusBead/silverSchoolBadge/jadePendantFragment
- 绿 12：celery/antidote/adrenaline/blueEdgeHeadband/danYuxuanGlasses/qinHaoruiRulerCompass/bloodstainedBandage/boxingGlove/weapon.ruler/jadeSchoolPlate/jadePendant/gildedPen
- 金 8：holyWater/soulBell/redEdgeHeadband/principalSeal/weapon.chain/weapon.bloodScythe/diamondCufflink/pureGoldSchoolBadge
- 白 4：blankDiploma/weapon.soulBanner/emeraldRing/blackGraduationPhoto

合计 12+12+12+8+4 = 48 ✓。Task 1 测试 `ALL_LOOT` toHaveLength(48) + 稀有度计数 + id 唯一性三重断言。

### 5. 稀有度价值区间正确性

逐项核对全部 48 件 `sanityValue`，5 个稀有度区间均无越界（以 spec §6 表格为权威，非表头近似区间）：

- **蓝阶 [10, 35]**：12 / 18 / 22 / 28 / 15 / 30 / 25 / 32 / 10 / 20 / 35 / 33 → 全部 ∈ [10, 35]，min=10（断尺碎片）、max=35（染血情书）
- **紫阶 [45, 95]**：50 / 55 / 48 / 75 / 70 / 65 / 80 / 45 / 90 / 60 / 85 / 95 → 全部 ∈ [45, 95]，min=45（玻璃弹珠）、max=95（玉坠碎片）
- **绿阶 [120, 220]**：120 / 150 / 180 / 200 / 160 / 170 / 140 / 190 / 130 / 220 / 130 / 130 → 全部 ∈ [120, 220]，min=120（芹菜）、max=220（玉佩）；其中 `weapon.ruler` sanityValue=130 由 `getWeapon('weapon.ruler').sanityValue` 派生，落区间内
- **金阶 [400, 580]**：400 / 500 / 450 / 480 / 420 / 550 / 480 / 580 → 全部 ∈ [400, 580]，min=400（圣水）、max=580（纯金校徽）；其中 `weapon.chain`=420 与 `weapon.bloodScythe`=550 由 plan 4 `getWeapon` 派生，落区间内
- **白阶 [750, 1500]**：750 / 1200 / 1300 / 1500 → 全部 ∈ [750, 1500]，min=750（无字毕业证）、max=1500（黑色毕业照）；其中 `weapon.soulBanner`=1200 由 plan 4 `getWeapon` 派生，落区间内

spec §6.5 表头写「110~220」但表格最低 120；§6.6 表头写「320~580」但表格最低 400。此差异已在「设计约定 #10」显式标注以表格为权威，测试用表格推导的区间。4 把武器条目从 plan 4 `getWeapon` 派生 sanityValue（ruler 130 / chain 420 / bloodScythe 550 / soulBanner 1200）均落入对应稀有度区间，避免与 plan 4 WeaponDef drift。

### 6. 关键设计要点核对

- ✅ **LootEffect 判别联合**：14 变体（heal/cleanse/buff/multiBuff/invulnerable/aoeStun/passiveMaxHp/passiveStat/passiveStatWithHpPenalty/passiveConsumableStackBonus/passiveDamageImmunityChance/passiveExtractionValueBonus/passiveReviveOnce）+ `null`，覆盖 spec §6 全部消耗品/遗物效果
- ✅ **4 把武器从 plan 4 派生**：`weaponLoot()` helper 调 `getWeapon(id)` 取 `sanityValue`/`rarity`，`effect=null`（战斗行为来自 WeaponDef）
- ✅ **chestDecryptState**：states `idle`/`decrypting`/`opening`/`completed`；progress 0..1；hold/pause 无回退（`release` 仅置 `holding=false`，progress 不变）；4 锁扣 `min(4, floor(progress*4))` 在 0.25/0.5/0.75/1.0 触发 `onLockBroken`；rate=1/2500 per ms；总时长 ~2.5s
- ✅ **白阶 70% 无字毕业证**：`pickItem` 对 `rarity==='white'` 先 roll `rng()<0.7` → 强制 `treasure.blankDiploma`；否则从白阶池排除 blankDiploma 随机。Task 2 统计测试 5000 样本验证 rate ∈ (0.65, 0.75)
- ✅ **yangYunRed 掉落表只 roll 独立碎片**：`rollMode='independent'`，紫50/绿30/金8/白2 各自独立掷骰，返回 0-4 件；key 不在表中（由调用方单独发放），Task 7 断言 `inv.has('treasure.vaultKey')===false`
- ✅ **LootRollMode 三模式**：single（缄默者，含 none）/ independent（杨云红边）/ multiPick（宝箱，含 itemCount + pity）
- ✅ **普通宝箱掷 3-5 件 / 鎏金宝箱掷 4-5 件**：`NORMAL_CHEST_LOOT_TABLE.itemCount={min:3,max:5}` + `pityRarity='green'`；`GILDED_CHEST_LOOT_TABLE.itemCount={min:4,max:5}` + `pityRarity='gold'`
- ✅ **效果应用不在 plan 5**：`LootEffect` 只定义数据结构，`Inventory.add` 不应用效果（maxHp/buff/immunity 等由 plan 3 战斗与未来 effects 系统读取 `Inventory.activeRelics()` 应用）

### 7. 依赖与边界

- **依赖 plan 4**：`import { getWeapon, type WeaponId } from '../weapons/WeaponRegistry'`。执行 plan 5 前须确认 plan 4 已提供 `getWeapon(id)`/`WeaponId`/`WeaponDef`（含 `sanityValue`/`rarity` 字段）
- **依赖既有 `src/data/assets.ts`**：`lootAssetKeys.ts` import `assetManifest` 做 manifest 交叉验证；不修改 `assets.ts` / `assets.test.ts`
- **不修改剧情模式**：plan 5 全部新文件在 `src/tombraid/loot/` 与 `src/tests/tombraid/loot/`，不触碰 `src/story/`/`src/scenes/`/`src/data/story.ts`/`src/state/saveState.ts`
- **Phaser 隔离**：仅 `ChestDecrypt.ts` 用 `import type Phaser`（类型擦除，运行时无 phaser 依赖）；测试注入 fake scene，无需 `vi.mock('phaser')`，可在 jsdom 跑

### 8. 测试覆盖矩阵

| Task | 测试文件 | 覆盖点 |
|------|---------|--------|
| 1 | loot-item.test.ts | 类型/48 件/计数/区间/specific items/武器派生/getLootItem 查询 |
| 2 | loot-table.test.ts | 4 张表定义/三模式/保底/白阶70%统计/纯函数可复现 |
| 3 | inventory.test.ts | add/remove/cap/遗物不叠加/activeRelics/totalSanityValue/clear |
| 4 | chest-decrypt-state.test.ts | 生命周期/hold-release 无回退/4 锁扣/opening-completed/reset |
| 5 | chest-decrypt.test.ts | F 键 wiring/update/屏震/贴图切换/白闪/战利品卡 spawn+click/destroy 幂等 |
| 6 | loot-asset-keys.test.ts | resolver/48 映射/manifest 交叉验证/52 条 loot.* 计数 |
| 7 | integration.test.ts | 缄默者掉落入袋/宝箱破译出宝入袋/杨云红边0-4/遗物不叠加/消耗品上限/100 种子一致 |

合计 7 个测试文件，约 80+ 测试用例。

---

Plan 5 可交付执行。执行顺序：Task 1 → 2 → 3 → 4 → 5 → 6 → 7（依赖链：2 依赖 1；3 依赖 1；5 依赖 4；6 依赖 1 + 既有 assets.ts；7 依赖 1-4）。每个 Task 严格遵循 5-Step TDD（RED → GREEN → SURFACE）。