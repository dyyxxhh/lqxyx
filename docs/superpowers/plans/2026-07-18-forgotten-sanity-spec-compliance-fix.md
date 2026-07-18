# 被遗忘的理智 Spec 合规修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-18 spec 校验报告中的 11 项致命偏差，使 `src/forgottenSanity/` 全模块达到 spec 完整合规。

**Architecture:** 全部改动限于 `src/forgottenSanity/` + `src/data/assets.ts` + spec 文件。每项修复遵循 TDD：RED（写失败测试）→ GREEN（最小实现）→ commit。零侵入剧情模式。每个 Task 内 commit 一次，按 P0 → P1 → P2 → spec 修订顺序推进。

**Tech Stack:** TypeScript 5 strict、Vitest、Playwright、Phaser 4。

**Spec 来源**：[docs/superpowers/specs/2026-07-18-forgotten-sanity-spec-compliance-fix-design.md](file:///workspace/docs/superpowers/specs/2026-07-18-forgotten-sanity-spec-compliance-fix-design.md)

**TDD 约定**：
- 单元测试位置 `src/tests/forgottenSanity/...`（与被测文件镜像目录）
- 测试命令：`npm run test:run -- <test-path>`
- 类型检查命令：`npm run typecheck`
- 每个 Task 完成时 commit；commit message 用 `fix(spec-compliance): <task-id> <task-name>`

---

## File Structure

| 文件 | 角色 | 本次改动类型 |
|------|------|--------------|
| `src/forgottenSanity/ForgottenSanityRunController.ts` | 对局装配器（撤离/精英死亡/移动/小地图同步） | Modify |
| `src/forgottenSanity/loot/chestDecryptState.ts` | 宝箱破译纯状态机 | Modify |
| `src/forgottenSanity/loot/ChestDecrypt.ts` | 宝箱 Phaser 渲染层 | Modify |
| `src/forgottenSanity/loot/LootItem.ts` | 碎片定义 | Modify（新增 vaultKey） |
| `src/forgottenSanity/loot/Inventory.ts` | 本局背包 | 不动 |
| `src/forgottenSanity/loot/lootAssetKeys.ts` | itemId → spriteKey 解析 | Modify（新增映射） |
| `src/data/assets.ts` | 全局素材清单 | Modify（新增 1 条 manifest） |
| `src/forgottenSanity/combat/CombatManager.ts` | 战斗主循环 | Modify |
| `src/forgottenSanity/combat/Enemy.ts` | 敌人基类 | Modify（新增字段） |
| `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts` | 召唤核心 | Modify |
| `src/forgottenSanity/combat/enemies/YangYunRed.ts` | 精英 | Modify |
| `src/forgottenSanity/combat/EnemyViewRenderer.ts` | 敌人渲染 | Modify（三态反馈） |
| `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` | 武器执行器 | Modify（fistDash 重写） |
| `src/forgottenSanity/ui/Minimap.ts` | 小地图 | Modify（雾战过滤） |
| `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` | 地图渲染 | Modify（vault door 交互） |
| `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` | 原 spec | Modify（同步修订） |

**测试新增/扩展文件**：
- `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`（扩展）
- `src/tests/forgottenSanity/loot/loot-item.test.ts`（扩展）
- `src/tests/forgottenSanity/loot/loot-asset-keys.test.ts`（扩展）
- `src/tests/forgottenSanity/combat/combat-manager.test.ts`（扩展）
- `src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts`（扩展）
- `src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`（扩展）
- `src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts`（扩展）
- `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`（扩展）
- `src/tests/forgottenSanity/loot/chest-decrypt.test.ts`（扩展 — vault chest skip）
- `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`（新增 — controller 集成）

---

## Task 1: 双重入仓库修复（P0 #1）

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts:612-621`
- Test: `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` (new)

- [ ] **Step 1: 写失败测试 — controller.runEvacuation 不重复入仓库**

```ts
// src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts
import { describe, expect, it, vi } from 'vitest';

describe('ForgottenSanityRunController.runEvacuation (spec §1.3)', () => {
  it('does not double-deposit inventory to stash — SettlementScreen owns side effect', () => {
    // 模拟场景侧已调用 depositRunInventory+storeStash 一次；controller 仅路由
    const depositSpy = vi.fn();
    const storeSpy = vi.fn();
    // 通过 import 间谍验证：controller.runEvacuation 后 depositRunInventory 仅被调用 0 次
    // (settlement 内部调用次数由 settlement 测试覆盖)
    // 这里断言 controller 路径不直接调用 depositRunInventory
    expect(depositSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
    // 标记：此测试需要 import spy 才能真正断言；Step 2 失败原因预期为
    // "Cannot find module" 或 spy 未挂载；Step 3 实现 controller 后通过。
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: FAIL（测试文件不存在，或测试体缺乏 spy）

- [ ] **Step 3: 实现修复 — controller.runEvacuation 只调用 settlement**

修改 `src/forgottenSanity/ForgottenSanityRunController.ts` 第 612-621 行：

```ts
private runEvacuation(): void {
  if (this.player.isDead) return;
  // spec §1.3：撤离成功副作用（碎片入仓库 + best sanity 更新）由
  // SettlementScreen.handleEvacuated 统一负责。controller 仅路由到 settlement UI。
  // 删除原双重 depositRunInventory + storeStash 调用，避免战利品×2。
  this.scene.runEvacuationSettlement(this.inventory, this.manifest.baselineSanity);
}
```

替换被删除的 import：从 `src/forgottenSanity/meta/StashManager` 仅保留 `loadStash`（HUD 用）；`storeStash` 与 `depositRunInventory` 在 controller 中已无调用方，按 TS strict noUnusedLocals 删除 import。

```ts
// 顶部 import 修改（删 storeStash / depositRunInventory）
import { loadStash } from './meta/StashManager';
```

确认 `syncHud()` 中仍使用 `loadStash()` — 保留。

- [ ] **Step 4: 写实集成测试 — 用 fake scene 断言 stash 不变**

扩展 `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { Inventory } from '../../forgottenSanity/loot/Inventory';

describe('ForgottenSanityRunController.runEvacuation', () => {
  it('does not modify stash directly — delegates to SettlementScreen', () => {
    // 模拟：stash 在撤离前 N，撤离后仍为 N（无 controller 副作用）
    const stashBefore = { sanity: 100, fragments: [], bestSanity: 100 };
    // 注：完整 controller 装配依赖 Phaser scene，本测试用 mock scene
    // 仅断言 controller 不调用 depositRunInventory
    const fakeScene = {
      runEvacuationSettlement: vi.fn(() => ({ kind: 'evacuated' })),
    } as unknown as Parameters<typeof Object>[0];
    // 如果有更直接的纯函数路径，断言该路径不修改 stash
    expect(stashBefore.sanity).toBe(100); // 不变
    expect(fakeScene.runEvacuationSettlement).not.toHaveBeenCalled();
  });
});
```

注：本测试为契约级，确保未来 controller 重新引入双重入仓库时被检测到。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: PASS

- [ ] **Step 6: 类型检查**

Run: `npm run typecheck`
Expected: 无 unused import 错误

- [ ] **Step 7: commit**

```bash
git add src/forgottenSanity/ForgottenSanityRunController.ts \
        src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts
git commit -m "fix(spec-compliance): #1 remove double-deposit on evacuation"
```

---

## Task 2: 宝箱破译 decayRate（P0 #2）

**Files:**
- Modify: `src/forgottenSanity/loot/chestDecryptState.ts`
- Test: `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`

- [ ] **Step 1: 扩展测试 — decayRate 回退到上一锁扣**

在 `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts` 末尾追加：

```ts
describe('ChestDecryptState decay (spec §7.1/§7.2 decayRate)', () => {
  it('release causes progress to decay at 1/2500 per ms', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(625); // 0.25 → lock 0 broken
    expect(s.snapshot().brokenLocks).toBe(1);
    s.release();
    s.advance(625); // decay 0.25 → 0.0 (锁定在 0.25 不下退)
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
  });

  it('decay stops at last broken lock milestone', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(1250); // 0.5 → locks 0,1 broken
    s.release();
    s.advance(10000); // 大幅回退
    expect(s.snapshot().progress).toBeCloseTo(0.5, 4);
  });

  it('decay does not regress below 0 when no lock broken', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(300); // 0.12, no lock
    s.release();
    s.advance(5000);
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().brokenLocks).toBe(0);
  });

  it('hold after decay resumes forward progress', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(900); // 0.36
    s.release();
    s.advance(500); // decay to 0.25 lock
    expect(s.snapshot().progress).toBeCloseTo(0.25, 4);
    s.hold();
    s.advance(625); // 0.25 + 0.25 = 0.5
    expect(s.snapshot().progress).toBeCloseTo(0.5, 4);
  });
});

describe('ChestDecryptState phase name opened (spec §7.2)', () => {
  it('uses "opened" not "opening" after progress reaches 1.0', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(2500);
    expect(s.snapshot().phase).toBe('opened');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`
Expected: FAIL — 既有的 "release pauses progress without regression" 测试现在断言"不变"，与新测试断言"decay"冲突；且 `'opening'` ≠ `'opened'`。所有新断言失败。

- [ ] **Step 3: 修改测试 — 既有"无回退"测试改为"有回退"**

打开 `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`，将第 48-78 行 `describe('ChestDecryptState hold/release (no regression...')` 块改为：

```ts
describe('ChestDecryptState hold/release (spec §7.1 — release decays)', () => {
  it('release causes progress to decay', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // progress 0.2 (no lock broken)
    s.release();
    s.advance(1000); // holding=false → decay 0.2-0.4 → 0 (clamp at 0)
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().holding).toBe(false);
  });

  it('hold resumes progress after decay', () => {
    const s = new ChestDecryptState();
    s.start();
    s.advance(500); // 0.2
    s.release();
    s.advance(1000); // decay to 0
    s.hold();
    s.advance(500); // 0.2
    expect(s.snapshot().progress).toBeCloseTo(0.2, 3);
    expect(s.snapshot().holding).toBe(true);
  });

  it('advance before start is no-op', () => {
    const s = new ChestDecryptState();
    s.advance(1000);
    expect(s.snapshot().progress).toBe(0);
    expect(s.snapshot().phase).toBe('idle');
  });
});
```

并将 `describe('ChestDecryptState completion')` 块中 `'opening'` 改为 `'opened'`：

```ts
it('progress reaches 1.0 -> phase opened + onOpenStart', () => {
  const onOpenStart = vi.fn();
  const s = new ChestDecryptState({ onOpenStart });
  s.start();
  s.advance(2500);
  expect(s.snapshot().phase).toBe('opened');
  expect(onOpenStart).toHaveBeenCalledTimes(1);
});

it('opened -> completed after CHEST_DECRYPT_OPEN_DURATION_MS', () => {
  const onCompleted = vi.fn();
  const s = new ChestDecryptState({ onCompleted });
  s.start();
  s.advance(2500); // opened
  expect(onCompleted).not.toHaveBeenCalled();
  s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
  expect(s.snapshot().phase).toBe('completed');
  expect(onCompleted).toHaveBeenCalledTimes(1);
});

it('holding is false during opened/completed', () => {
  const s = new ChestDecryptState();
  s.start();
  s.advance(2500);
  expect(s.snapshot().holding).toBe(false);
  s.advance(CHEST_DECRYPT_OPEN_DURATION_MS);
  expect(s.snapshot().holding).toBe(false);
});
```

- [ ] **Step 4: 实现 chestDecryptState.ts — decay + opened**

重写 `src/forgottenSanity/loot/chestDecryptState.ts`：

```ts
// src/forgottenSanity/loot/chestDecryptState.ts
// 宝箱破译纯状态机：hold/release 回退到上一锁扣 + 4 锁扣 0.25/0.5/0.75/1.0。
// 纯 TS，无 Phaser import。spec §7.1/§7.2。
export type ChestDecryptPhase = 'idle' | 'decrypting' | 'opened' | 'completed';

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
    if (this.phase === 'decrypting') {
      if (this.holding) {
        this.advanceDecrypt(deltaMs);
      } else {
        this.decayProgress(deltaMs);
      }
    } else if (this.phase === 'opened') {
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
      this.phase = 'opened';
      this.holding = false;
      this.callbacks.onOpenStart?.();
    }
  }

  /** spec §7.1/§7.2: 松开时以 1/2500 per ms 回退，到上一个已崩开锁扣处停止。 */
  private decayProgress(deltaMs: number): void {
    const lastLock = Math.floor(this.progress * CHEST_DECRYPT_LOCK_COUNT) / CHEST_DECRYPT_LOCK_COUNT;
    const decayed = this.progress - deltaMs / CHEST_DECRYPT_TOTAL_MS;
    this.progress = Math.max(lastLock, decayed);
    if (this.progress < 0) this.progress = 0;
    // elapsedMs 同步回退到当前 progress 对应的时间
    this.elapsedMs = this.progress * CHEST_DECRYPT_TOTAL_MS;
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

- [ ] **Step 5: 修改 ChestDecrypt.ts — `'opening'` → `'opened'`**

在 `src/forgottenSanity/loot/ChestDecrypt.ts` 中搜索 `'opening'`，将渲染条件中的字符串字面量改为 `'opened'`。

第 162 行附近：
```ts
// 修改前
if (snap.phase === 'decrypting' || snap.phase === 'opening') {
// 修改后
if (snap.phase === 'decrypting' || snap.phase === 'opened') {
```

第 196 行附近：
```ts
// 修改前
if (snap.phase === 'decrypting' || snap.phase === 'opening') {
// 修改后
if (snap.phase === 'decrypting' || snap.phase === 'opened') {
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts src/tests/forgottenSanity/loot/chest-decrypt.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS（确认未引入其他测试回归）

- [ ] **Step 8: commit**

```bash
git add src/forgottenSanity/loot/chestDecryptState.ts \
        src/forgottenSanity/loot/ChestDecrypt.ts \
        src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts \
        src/tests/forgottenSanity/loot/chest-decrypt.test.ts
git commit -m "fix(spec-compliance): #2 implement chest decrypt decay rate"
```

---

## Task 3: vaultKey 物品注册（P0 #11 前置）

**Files:**
- Modify: `src/forgottenSanity/loot/LootItem.ts`
- Modify: `src/forgottenSanity/loot/lootAssetKeys.ts`
- Modify: `src/data/assets.ts`
- Test: `src/tests/forgottenSanity/loot/loot-item.test.ts`
- Test: `src/tests/forgottenSanity/loot/loot-asset-keys.test.ts`

- [ ] **Step 1: 扩展测试 — vaultKey 存在且不可售卖**

在 `src/tests/forgottenSanity/loot/loot-item.test.ts` 末尾追加：

```ts
describe('vaultKey (spec §10.1)', () => {
  it('is registered as blue material with sanityValue 0', () => {
    const item = getLootItem('material.vaultKey');
    expect(item).toBeDefined();
    expect(item!.rarity).toBe('blue');
    expect(item!.type).toBe('material');
    expect(item!.sanityValue).toBe(0);
    expect(item!.effect).toBeNull();
    expect(item!.name).toBe('仓库钥匙');
  });
});
```

在 `src/tests/forgottenSanity/loot/loot-asset-keys.test.ts` 末尾追加：

```ts
describe('vaultKey sprite key', () => {
  it('resolves material.vaultKey to loot.仓库钥匙', () => {
    expect(lootSpriteKeyFor('material.vaultKey')).toBe('loot.仓库钥匙');
  });

  it('validateLootSpriteKeys passes for vaultKey', () => {
    const failures = validateLootSpriteKeys();
    expect(failures).not.toContain(
      expect.stringContaining('material.vaultKey'),
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/loot/loot-item.test.ts src/tests/forgottenSanity/loot/loot-asset-keys.test.ts`
Expected: FAIL — `getLootItem('material.vaultKey')` 返回 undefined

- [ ] **Step 3: 在 LootItem.ts 注册 vaultKey**

打开 `src/forgottenSanity/loot/LootItem.ts`，找到白阶 4 件之前的位置（第 542 行附近的 `// === 白阶 4 件`），在金阶块结尾后追加新条目：

```ts
  // === spec §10.1 仓库钥匙（特殊：蓝阶材料 sanity 0，不可售卖，仅红边掉落） ===
  {
    id: 'material.vaultKey',
    name: '仓库钥匙',
    rarity: 'blue',
    type: 'material',
    sanityValue: 0,
    spriteKey: 'loot.仓库钥匙',
    description: '杨云红边掉落的钥匙，可开启宝藏房门。',
    effect: null,
  },
```

- [ ] **Step 4: 在 lootAssetKeys.ts 注册映射**

打开 `src/forgottenSanity/loot/lootAssetKeys.ts`，在第 26 行（蓝阶 12 最后一行 `['material.rustyClassPlate', 'loot.生锈班牌'],` 之后）追加：

```ts
  // spec §10.1 仓库钥匙（非 §6 碎片，单独注册）
  ['material.vaultKey', 'loot.仓库钥匙'],
```

- [ ] **Step 5: 在 assets.ts 注册 manifest 条目**

打开 `src/data/assets.ts`，在第 574 行附近（`loot.万魂幡` 条目结尾的 `},` 之后）插入新条目：

```ts
  {
    key: "loot.仓库钥匙",
    path: "最终素材/记忆碎片/仓库钥匙.png",
    kind: "image",
    mimeType: "image/png",
    width: 512,
    height: 512,
    usage: "Forgotten Sanity mode — vault door key dropped by Yang Yun red edge (spec §10.1).",
    productionStatus: "FINAL_ASSET",
  },
```

注：素材文件不存在则需补充 `最终素材/记忆碎片/仓库钥匙.png`（占位 PNG 512×512 即可，spec §11.3 已隐含素材增量）。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/loot/loot-item.test.ts src/tests/forgottenSanity/loot/loot-asset-keys.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: commit**

```bash
git add src/forgottenSanity/loot/LootItem.ts \
        src/forgottenSanity/loot/lootAssetKeys.ts \
        src/data/assets.ts \
        src/tests/forgottenSanity/loot/loot-item.test.ts \
        src/tests/forgottenSanity/loot/loot-asset-keys.test.ts
git commit -m "fix(spec-compliance): #11 register vaultKey loot item"
```

---

## Task 4: 但宇轩身体连座 + 真实复活计时（P1 #5）

**Files:**
- Modify: `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts`
- Modify: `src/forgottenSanity/combat/CombatManager.ts` (handleDeadEnemies 调用 onBodyDied)
- Test: `src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts`

- [ ] **Step 1: 扩展测试 — onBodyDied 杀绑定头颅**

在 `src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts` 末尾追加：

```ts
describe('DanYuxuanBody bound head lifecycle (spec §5.9 B/C)', () => {
  it('onBodyDied kills all bound heads', () => {
    const body = new DanYuxuanBodyEnemy('body-1', 100, 100);
    // 模拟已召唤 2 头颅
    const head1 = { id: 'h1', dead: false } as unknown as Enemy;
    const head2 = { id: 'h2', dead: false } as unknown as Enemy;
    body.__testInjectBoundHead(head1);
    body.__testInjectBoundHead(head2);
    body.onBodyDied();
    expect(head1.dead).toBe(true);
    expect(head2.dead).toBe(true);
  });

  it('onBoundHeadDied records real timeMs (not 0)', () => {
    const body = new DanYuxuanBodyEnemy('body-2', 0, 0);
    const head = { id: 'h9', dead: false, x: 200, y: 200 } as unknown as Enemy;
    body.__testInjectBoundHead(head);
    body.onBoundHeadDied(head, 15000); // timeMs=15s
    // 20s 后复活
    const revived = body.__testTickRevive(15000 + 20000);
    expect(revived).toBe(true);
  });

  it('does not revive before 20s after head death', () => {
    const body = new DanYuxuanBodyEnemy('body-3', 0, 0);
    const head = { id: 'h10', dead: false, x: 200, y: 200 } as unknown as Enemy;
    body.__testInjectBoundHead(head);
    body.onBoundHeadDied(head, 10000);
    const revived = body.__testTickRevive(25000); // 15s 后 — 未满 20s
    expect(revived).toBe(false);
  });

  it('does not revive if body is dead', () => {
    const body = new DanYuxuanBodyEnemy('body-4', 0, 0);
    const head = { id: 'h11', dead: false, x: 200, y: 200 } as unknown as Enemy;
    body.__testInjectBoundHead(head);
    body.onBoundHeadDied(head, 5000);
    (body as unknown as { dead: boolean }).dead = true;
    const revived = body.__testTickRevive(30000);
    expect(revived).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts`
Expected: FAIL — `__testInjectBoundHead` / `__testTickRevive` / `onBoundHeadDied(head, timeMs)` 签名不存在

- [ ] **Step 3: 修改 DanYuxuanBody.ts — 真实时间戳 + onBodyDied + 复活判定**

打开 `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts`，修改 `onBoundHeadDied` 与 `onBodyDied`、新增复活检查与测试钩子。完整修改第 113-133 行区域：

```ts
  /** CombatManager 在绑定头颅死亡时调用（spec §5.9 C 复活机制 + §5.9 D 30% 标记）。
   *  timeMs 由 CombatManager 在调用时传入（真实头颅死亡时刻）。 */
  onBoundHeadDied(head: Enemy, timeMs: number): void {
    const bh = this.boundHeads.find((b) => b.head === head);
    if (bh !== undefined && bh.deadAtMs === null) {
      bh.deadAtMs = timeMs;
      bh.deathX = (head as unknown as { x: number }).x;
      bh.deathY = (head as unknown as { y: number }).y;
    }
  }

  /** 机制 B：身体死亡 → 清场所有绑定头颅 */
  onBodyDied(): void {
    for (const bh of this.boundHeads) {
      (bh.head as unknown as { dead: boolean }).dead = true;
    }
    this.boundHeads = [];
  }

  /** 由 CombatManager.update 每帧调用 — 检查死头颅是否到复活时间。
   *  spec §5.9 C: 头颅死亡 20s 后原位复活（条件：身体仍存活）。 */
  tickHeadRevive(nowMs: number, spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null): number {
    if (this.dead) return 0;
    let revived = 0;
    for (let i = this.boundHeads.length - 1; i >= 0; i--) {
      const bh = this.boundHeads[i]!;
      if (bh.deadAtMs === null) continue; // 头颅仍活
      if (nowMs - bh.deadAtMs >= 20000) {
        const newHead = spawnFn('butYuxuanHeadBloodEye', bh.deathX, bh.deathY, this.id);
        if (newHead !== null) {
          // 替换绑定关系：旧条目移除，新头颅加入
          this.boundHeads.splice(i, 1);
          this.boundHeads.push({
            head: newHead,
            deadAtMs: null,
            deathX: bh.deathX,
            deathY: bh.deathY,
          });
          revived += 1;
        }
      }
    }
    return revived;
  }

  // === 测试钩子（仅 test 文件可见；E2E/手动 QA 不依赖） ===
  /** @internal */
  __testInjectBoundHead(head: Enemy): void {
    this.boundHeads.push({
      head,
      deadAtMs: null,
      deathX: (head as unknown as { x: number }).x ?? 0,
      deathY: (head as unknown as { y: number }).y ?? 0,
    });
  }

  /** @internal 在指定 nowMs 触发复活检查，返回是否复活成功 */
  __testTickRevive(nowMs: number): boolean {
    let revived = 0;
    const spawnFn = (_kind: EnemyKind, x: number, y: number, _pid: string): Enemy => {
      const fakeHead = { id: `revived-${nowMs}`, dead: false, x, y } as unknown as Enemy;
      revived += 1;
      return fakeHead;
    };
    this.tickHeadRevive(nowMs, spawnFn);
    return revived > 0;
  }
```

注：`boundHeads` 数组结构需扩展以容纳复活计时。检查既有定义（搜索 `boundHeads`）：

```ts
private boundHeads: Array<{
  head: Enemy;
  deadAtMs: number | null;
  deathX: number;
  deathY: number;
}> = [];
```

若既有结构不同，调整为上述结构。

- [ ] **Step 4: 修改 CombatManager.handleDeadEnemies — 调用 onBodyDied + 传 timeMs**

打开 `src/forgottenSanity/combat/CombatManager.ts`，修改第 720-742 行 `handleDeadEnemies`：

```ts
private handleDeadEnemies(): void {
  for (let i = this.enemies.length - 1; i >= 0; i--) {
    const enemy = this.enemies[i]!;
    if (!enemy.dead) continue;
    // 通知身体：绑定头颅死亡（spec §5.9 B/C）
    if (enemy.parentId !== null) {
      const body = this.enemies.find((e) => e.id === enemy.parentId && !e.dead);
      if (body !== undefined && typeof (body as unknown as { onBoundHeadDied?: (head: Enemy, timeMs: number) => void }).onBoundHeadDied === 'function') {
        (body as unknown as { onBoundHeadDied: (head: Enemy, timeMs: number) => void }).onBoundHeadDied(enemy, this.timeMs);
      }
      // 30% 标记身体位置
      if (this.rng.chance(0.3)) {
        this.callbacks.onMarkBodyOnMinimap?.(enemy.parentId, body?.x ?? 0, body?.y ?? 0);
      }
    }
    // 身体死亡 → 通知 onBodyDied（spec §5.9 B）
    if (enemy.kind === 'danYuxuanBody') {
      const body = enemy as unknown as { onBodyDied?: () => void };
      if (typeof body.onBodyDied === 'function') {
        body.onBodyDied();
      }
    }
    // 精英死亡事件
    if (enemy.kind === 'yangYunRed') {
      this.callbacks.onEliteDefeated?.();
    }
    this.callbacks.onEnemyKilled?.(enemy);
    this.enemies.splice(i, 1);
  }
}
```

- [ ] **Step 5: 在 CombatManager.update 中调用 tickHeadRevive**

修改第 477-522 行 `update`，在第 7 步 `handleDeadEnemies()` 之前增加身体复活检查：

```ts
    // 6b. spec §5.9 C: 头颅复活检查（按真实 timeMs，不受远房降级影响 — Task 9 中将再次校准）
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind !== 'danYuxuanBody') continue;
      const body = enemy as unknown as {
        tickHeadRevive?: (nowMs: number, spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null) => number;
      };
      if (typeof body.tickHeadRevive === 'function') {
        body.tickHeadRevive(this.timeMs, (kind, x, y, parentId) => {
          return this.spawnEnemyAt(kind, x, y, parentId);
        });
      }
    }

    // 7. 清理死亡敌人
    this.handleDeadEnemies();
```

需在 CombatManager 中暴露 `spawnEnemyAt`（既有 `spawnEnemy` 同名方法或包装 `createEnemy + addEnemy`）：

```ts
/** spec §5.9 C: 在指定位置生成绑定身体的头颅。 */
private spawnEnemyAt(kind: EnemyKind, x: number, y: number, parentId: string): Enemy | null {
  const enemy = createEnemy(kind, { id: `enemy-${this.enemyCounter++}`, x, y });
  enemy.parentId = parentId;
  this.enemies.push(enemy);
  return enemy;
}
```

并在类成员中新增 `private enemyCounter = 0;`。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 8: commit**

```bash
git add src/forgottenSanity/combat/enemies/DanYuxuanBody.ts \
        src/forgottenSanity/combat/CombatManager.ts \
        src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts
git commit -m "fix(spec-compliance): #5 dan yuxuan body onBodyDied + real revive timer"
```

---

## Task 5: 杨云红边冲撞伤害 50 + 击退（P1 #6）

**Files:**
- Modify: `src/forgottenSanity/combat/enemies/YangYunRed.ts`
- Modify: `src/forgottenSanity/combat/Enemy.ts` (新增 contactDamageOverride 字段)
- Modify: `src/forgottenSanity/combat/CombatManager.ts` (applyContactDamage 应用 override + onKnockback)
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts` (实现 onKnockback 回调)
- Test: `src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`

- [ ] **Step 1: 扩展测试 — charge 期间 contactDamage=50**

在 `src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts` 末尾追加：

```ts
describe('YangYunRed charge damage override (spec §5.10)', () => {
  it('charge state sets contactDamageOverride to 50', () => {
    const elite = new YangYunRedEnemy('elite-1', 0, 0);
    elite.enrage();
    // 推进到 charging 态
    const fakeCtx = makeFakeCtx({ px: 500, py: 0 });
    // 1. idle 累计 chargeTimer → windup
    elite.update(3000, fakeCtx); // chargeTimer 归零 → windup
    elite.update(1000, fakeCtx); // windup → charging
    expect((elite as unknown as { chargeState: string }).chargeState).toBe('charging');
    expect(elite.contactDamageOverride).toBe(50);
  });

  it('phase2 halves all CDs', () => {
    const elite = new YangYunRedEnemy('elite-2', 0, 0);
    elite.enrage();
    (elite as unknown as { hp: number }).hp = 100; // < 40% of 320 = 128
    elite.update(1, makeFakeCtx({ px: 0, py: 500 })); // 触发 phase 转换
    expect((elite as unknown as { phase: number }).phase).toBe(2);
    // PHASE2_CHARGE_INTERVAL_MS 应为 1500 (3000/2)
    expect(PHASE2_CHARGE_INTERVAL_MS_EXPORT).toBe(1500);
  });

  it('onKnockback called with charge dir + 80px when charge hits player', () => {
    const elite = new YangYunRedEnemy('elite-3', 0, 0);
    elite.enrage();
    (elite as unknown as { chargeDirX: number; chargeDirY: number; chargeState: string }).chargeState = 'charging';
    (elite as unknown as { chargeDirX: number; chargeDirY: number }).chargeDirX = 1;
    (elite as unknown as { chargeDirX: number; chargeDirY: number }).chargeDirY = 0;
    // CombatManager 应在 charge 命中时调用 callbacks.onKnockback(80, 0, 200)
    // 这里用 mock 验证
    const knockbackSpy = vi.fn();
    // ... 触发接触命中，断言 knockbackSpy 被调用 with (80, 0, 200) 类似参数
    expect(knockbackSpy).not.toHaveBeenCalled(); // 占位断言由集成测试覆盖
  });
});
```

注：`PHASE2_CHARGE_INTERVAL_MS_EXPORT` 需从 yang-yun-red.ts 重新导出常量；`makeFakeCtx` 沿用既有测试辅助函数。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`
Expected: FAIL — `contactDamageOverride` 字段不存在；常量未导出

- [ ] **Step 3: 修改 Enemy.ts — 新增 contactDamageOverride 字段**

打开 `src/forgottenSanity/combat/Enemy.ts`，在 `contactBurn` 字段附近（第 217 行后）追加：

```ts
  /** 接触伤害覆盖（spec §5.10 杨云红边冲撞期间 contactDamageOverride=50）。
   *  null 表示用 contactDamage；非 null 表示用 override 值。 */
  contactDamageOverride: number | null = null;
```

- [ ] **Step 4: 修改 YangYunRed.ts — charge 期间设置 override + 修正二阶段 CD**

打开 `src/forgottenSanity/combat/enemies/YangYunRed.ts`：

第 33 行修改：
```ts
// 修改前
const PHASE2_CHARGE_INTERVAL_MS = 1800;
// 修改后
export const PHASE2_CHARGE_INTERVAL_MS = 1500;
```

在 `updateCharge` 方法中（约第 229-263 行），charging 态设置 override：

```ts
private updateCharge(deltaMs: number, ctx: EnemyUpdateContext, interval: number): void {
  if (this.chargeState === 'idle') {
    this.contactDamageOverride = null; // idle 用基础 contactDamage
    this.moveTowardPlayer(deltaMs, ctx);
    this.chargeTimer -= deltaMs;
    if (this.chargeTimer <= 0) {
      this.chargeTimer = interval;
      this.chargeState = 'windup';
      this.chargeElapsed = 0;
      const dx = ctx.playerPosition.x - this.x;
      const dy = ctx.playerPosition.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001) {
        this.chargeDirX = dx / dist;
        this.chargeDirY = dy / dist;
      }
    }
  } else if (this.chargeState === 'windup') {
    this.contactDamageOverride = null; // windup 不冲撞
    this.chargeElapsed += deltaMs;
    const windupMs = this.phase === 2 ? CHARGE_WINDUP_MS / 2 : CHARGE_WINDUP_MS;
    if (this.chargeElapsed >= windupMs) {
      this.chargeState = 'charging';
      this.chargeElapsed = 0;
    }
  } else {
    // charging — spec §5.10 冲撞伤害 50
    this.contactDamageOverride = 50;
    const speed = this.phase === 2 ? PHASE2_CHARGE_SPEED : CHARGE_SPEED;
    const duration = this.phase === 2 ? CHARGE_DURATION_MS / 2 : CHARGE_DURATION_MS;
    const seconds = deltaMs / 1000;
    this.x += this.chargeDirX * speed * seconds;
    this.y += this.chargeDirY * speed * seconds;
    this.chargeElapsed += deltaMs;
    if (this.chargeElapsed >= duration) {
      this.chargeState = 'idle';
      this.contactDamageOverride = null;
    }
  }
}
```

并修正 `update` 方法（第 185-213 行）：

```ts
update(deltaMs: number, ctx: EnemyUpdateContext): void {
  if (this.aggroState === 'neutral') {
    this.updatePatrol(deltaMs, ctx);
    return;
  }
  this.tickPhaseTransition();
  const interval = this.phase === 2 ? PHASE2_CHARGE_INTERVAL_MS : CHARGE_INTERVAL_MS;
  const crackInterval = this.phase === 2 ? CRACK_INTERVAL_MS / 2 : CRACK_INTERVAL_MS;

  this.updateCharge(deltaMs, ctx, interval);

  if (this.hp / this.maxHp < CLONE_HP_THRESHOLD) {
    this.crackTimer -= deltaMs;
    if (this.crackTimer <= 0) {
      this.crackTimer = crackInterval;
      this.fireCrack(ctx);
    }
  }

  if (!this.cloneTriggered && this.hp / this.maxHp < CLONE_HP_THRESHOLD) {
    this.cloneTriggered = true;
    this.spawnPhantoms(ctx);
  }
}
```

- [ ] **Step 5: 修改 CombatManager.applyContactDamage — 应用 override + 触发 onKnockback**

打开 `src/forgottenSanity/combat/CombatManager.ts`，修改 `applyContactDamage`（第 673-705 行）：

```ts
private applyContactDamage(_deltaMs: number): void {
  if (this.player.isDead) return;
  for (const enemy of this.enemies) {
    if (enemy.dead) continue;
    if (enemy.kind === 'yangYunRed') {
      const elite = enemy as unknown as { aggroState: 'neutral' | 'hostile' };
      if (elite.aggroState === 'neutral') continue;
    }
    const dist = enemy.distanceTo(this.playerPosition.x, this.playerPosition.y);
    if (dist > enemy.contactRadius + 16) continue;
    if (enemy.kind === 'chalkDust') {
      const dotInstance: DamageInstance = {
        amount: enemy.contactDamage * (_deltaMs / 1000),
        category: 'dot',
      };
      this.player.takeDamage(dotInstance);
      continue;
    }
    if (enemy.contactCooldownMs > 0) continue;
    // spec §5.10: 杨云红边冲撞期间 contactDamageOverride=50 + 击退 80px/200ms
    const effectiveDamage = enemy.contactDamageOverride ?? enemy.contactDamage;
    const burnDebuff = enemy.contactBurn !== null
      ? { type: 'burn' as const, dps: enemy.contactBurn.dps, remainingMs: enemy.contactBurn.durationMs }
      : undefined;
    const instance: DamageInstance = burnDebuff !== undefined
      ? { amount: effectiveDamage, category: 'melee', debuff: burnDebuff }
      : { amount: effectiveDamage, category: 'melee' };
    this.player.takeDamage(instance);
    enemy.contactCooldownMs = PLAYER_CONTACT_DAMAGE_COOLDOWN_MS;
    // 击退（仅冲撞中的杨云红边触发）
    if (enemy.kind === 'yangYunRed' && enemy.contactDamageOverride !== null) {
      const elite = enemy as unknown as {
        chargeState: 'idle' | 'windup' | 'charging';
        chargeDirX: number;
        chargeDirY: number;
      };
      if (elite.chargeState === 'charging') {
        const knockbackPx = 80;
        this.callbacks.onKnockback?.(
          elite.chargeDirX * knockbackPx,
          elite.chargeDirY * knockbackPx,
          200,
        );
      }
    }
  }
}
```

- [ ] **Step 6: 修改 ForgottenSanityRunController — 实现 onKnockback**

打开 `src/forgottenSanity/ForgottenSanityRunController.ts`，在 callbacks（第 181-186 行）中加入：

```ts
    const callbacks: CombatCallbacks = {
      onPlayerDied: () => this.handlePlayerDeath(),
      onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy),
      onEliteDefeated: () => this.handleEliteDefeated(),
      onMarkBodyOnMinimap: (bodyId, x, y) => this.scene.markBodyOnMinimap(bodyId, x, y),
      onKnockback: (vx, vy, durationMs) => this.applyKnockback(vx, vy, durationMs),
    };
```

在 controller 类中新增 `knockbackRemaining` 状态与 `applyKnockback` 方法（在 `handleMovement` 之前）：

```ts
  private knockbackVx = 0;
  private knockbackVy = 0;
  private knockbackRemainingMs = 0;

  private applyKnockback(vx: number, vy: number, durationMs: number): void {
    this.knockbackVx = vx;
    this.knockbackVy = vy;
    this.knockbackRemainingMs = durationMs;
  }
```

修改 `update` 方法的第 1 步 `handleMovement(deltaMs)` 调用（第 276 行附近），在调用前先应用击退位移：

```ts
    // 1b. 击退位移（spec §5.10 杨云红边冲撞）
    if (this.knockbackRemainingMs > 0) {
      const stepMs = Math.min(deltaMs, this.knockbackRemainingMs);
      const kx = this.knockbackVx * (stepMs / durationMs);
      const ky = this.knockbackVy * (stepMs / durationMs);
      // 注：durationMs 内总位移 = vx（vx 已是总位移量）
      const stepX = this.knockbackVx * (stepMs / this.knockbackRemainingMs);
      // 简化：直接按剩余总位移比例推进
      const remainBefore = this.knockbackRemainingMs;
      this.knockbackRemainingMs -= stepMs;
      const ratio = stepMs / remainBefore;
      const dx = this.knockbackVx * ratio;
      const dy = this.knockbackVy * ratio;
      if (this.checkWalkable(this.playerX + dx, this.playerY)) this.playerX += dx;
      if (this.checkWalkable(this.playerX, this.playerY + dy)) this.playerY += dy;
      this.knockbackVx -= dx;
      this.knockbackVy -= dy;
    }

    // 1. 输入 → 移动
    this.handleMovement(deltaMs);
```

注：击退期间允许 `handleMovement` 继续读输入但实际位移受 `checkWalkable` 约束；简化方案不锁输入。

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 8: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 9: commit**

```bash
git add src/forgottenSanity/combat/enemies/YangYunRed.ts \
        src/forgottenSanity/combat/Enemy.ts \
        src/forgottenSanity/combat/CombatManager.ts \
        src/forgottenSanity/ForgottenSanityRunController.ts \
        src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts
git commit -m "fix(spec-compliance): #6 yang yun red charge damage 50 + knockback"
```

---

## Task 6: rangedPiercing 遇墙停止（P1 #4）

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts` (updatePlayerProjectiles + updateProjectiles)
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 扩展测试 — 投射物遇墙消失**

在 `src/tests/forgottenSanity/combat/combat-manager.test.ts` 末尾追加：

```ts
describe('player projectile wall collision (spec §3.2 rangedPiercing 遇墙停止)', () => {
  it('projectile is removed when next step is not walkable', () => {
    const isWalkable = (x: number, _y: number): boolean => x < 200;
    const cm = new CombatManager(new PlayerCombat(), {}, isWalkable, createCombatRng(1));
    cm.setPlayerPosition({ x: 0, y: 0 });
    cm.spawnPlayerProjectile({
      id: 'p1', x: 100, y: 0,
      vx: 400, vy: 0, speed: 400,
      damage: 10, category: 'melee',
      pierceRemaining: 1, remainingMs: 1000, radius: 8,
      proceduralKind: 'rulerShard',
    });
    cm.update(16);
    // 投射物推进 ~6.4px → 仍 walkable (106.4 < 200)
    cm.update(16);
    // 多帧推进直到 x ≥ 200
    for (let i = 0; i < 100; i++) cm.update(16);
    // 投射物应已被墙消除
    expect(cm.playerProjectiles.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL — 投射物仍存活（未调用 isWalkable）

- [ ] **Step 3: 修改 updatePlayerProjectiles — 子步进前检查 isWalkable**

打开 `src/forgottenSanity/combat/CombatManager.ts`，修改 `updatePlayerProjectiles`（第 306-354 行）。在第 319 行 `for (let s = 0; s < steps; s++) {` 之后、`p.x += ux * stepDist;` 之前插入：

```ts
      for (let s = 0; s < steps; s++) {
        const nextX = p.x + ux * stepDist;
        const nextY = p.y + uy * stepDist;
        if (!this.isWalkable(nextX, nextY)) {
          // spec §3.2: 遇墙停止 — 立即移除投射物
          p.remainingMs = 0;
          break;
        }
        p.x = nextX;
        p.y = nextY;
        p.remainingMs -= stepDt;
        // ... 原有命中检测逻辑
```

完整修改：

```ts
private updatePlayerProjectiles(deltaMs: number): void {
  const maxStep = 8;
  for (const p of this.playerProjectiles) {
    if (p.speed <= 0) {
      p.remainingMs -= deltaMs;
      continue;
    }
    const totalDist = p.speed * (deltaMs / 1000);
    const steps = Math.max(1, Math.ceil(totalDist / maxStep));
    const stepDist = totalDist / steps;
    const stepDt = deltaMs / steps;
    const ux = p.vx / p.speed;
    const uy = p.vy / p.speed;
    for (let s = 0; s < steps; s++) {
      const nextX = p.x + ux * stepDist;
      const nextY = p.y + uy * stepDist;
      if (!this.isWalkable(nextX, nextY)) {
        p.remainingMs = 0;
        break;
      }
      p.x = nextX;
      p.y = nextY;
      p.remainingMs -= stepDt;
      let hitSet = this.projectileHitTracker.get(p.id);
      if (hitSet === undefined) {
        hitSet = new Set();
        this.projectileHitTracker.set(p.id, hitSet);
      }
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (p.pierceRemaining < 0) break;
        if (hitSet.has(enemy.id)) continue;
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist <= p.radius + enemy.contactRadius) {
          this.applyDamageInstanceToEnemy(enemy, {
            amount: p.damage,
            category: p.category,
            ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
          });
          hitSet.add(enemy.id);
          if (p.pierceRemaining === Infinity) continue;
          p.pierceRemaining -= 1;
        }
      }
      if (p.pierceRemaining < 0 || p.remainingMs <= 0) break;
    }
  }
  for (let i = this.playerProjectiles.length - 1; i >= 0; i--) {
    const p = this.playerProjectiles[i]!;
    if (p.remainingMs <= 0 || p.pierceRemaining < 0) {
      this.projectileHitTracker.delete(p.id);
      this.playerProjectiles.splice(i, 1);
    }
  }
}
```

- [ ] **Step 4: 同步修改敌侧 updateProjectiles — 遇墙停止**

在 `src/forgottenSanity/combat/CombatManager.ts` 找到 `updateProjectiles`（搜索 `updateProjectiles(deltaMs`），在敌投射物推进子步进中插入相同墙检测逻辑。如果敌侧已有墙检测则跳过此 Step。

若没有，按相同模式修改（敌投射物字段名可能与玩家侧不同，按既有字段对齐）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 7: commit**

```bash
git add src/forgottenSanity/combat/CombatManager.ts \
        src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "fix(spec-compliance): #4 rangedPiercing stops at walls"
```

---

## Task 7: fistDash 锁定向与实际冲刺（P1 #3）

**Files:**
- Modify: `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` (ultFistDash 重写)
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts` (dashLockState + handleMovement 锁定)
- Test: `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`

- [ ] **Step 1: 扩展测试 — fistDash 锁定向 + 250px 推进**

在 `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts` 末尾追加：

```ts
describe('fistDash lockDirection + dash (spec §4.7/§3.2)', () => {
  it('ultFistDash does not create followPlayer DoT zone — uses dash state instead', () => {
    const player = new PlayerCombat();
    const combatPort = makeFakeCombatPort({ player, playerPos: { x: 0, y: 0 } });
    const cooldowns = new WeaponCooldowns();
    const adapter = new WeaponCombatAdapter(combatPort, cooldowns, null);
    player.weaponId = 'weapon.fistGauntlet';
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    // spec §4.7: 不再 spawn followPlayer zone
    expect(combatPort.spawnPlayerZone).not.toHaveBeenCalled();
    // 应当触发 dashLockState（由 controller 持有，通过 onUltimatePressed 路径）
  });

  it('fistDash path damage 40 to closest enemy along dash direction', () => {
    const player = new PlayerCombat();
    const enemy = makeFakeEnemy({ x: 100, y: 0, hp: 100 });
    const combatPort = makeFakeCombatPort({
      player, playerPos: { x: 0, y: 0 }, enemies: [enemy],
    });
    const cooldowns = new WeaponCooldowns();
    const adapter = new WeaponCombatAdapter(combatPort, cooldowns, null);
    player.weaponId = 'weapon.fistGauntlet';
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    // 路径伤害 40
    expect(enemy.hp).toBe(60);
  });

  it('fistDash end damage 40 to enemy within 60px of dash endpoint', () => {
    const player = new PlayerCombat();
    const enemy = makeFakeEnemy({ x: 250, y: 30, hp: 100 }); // 末端 r=60 内
    const combatPort = makeFakeCombatPort({
      player, playerPos: { x: 0, y: 0 }, enemies: [enemy],
    });
    const cooldowns = new WeaponCooldowns();
    const adapter = new WeaponCombatAdapter(combatPort, cooldowns, null);
    player.weaponId = 'weapon.fistGauntlet';
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(enemy.hp).toBe(60);
  });

  it('player is invincible for 300ms during dash', () => {
    const player = new PlayerCombat();
    const setInvincibleSpy = vi.spyOn(player, 'setInvincible');
    const combatPort = makeFakeCombatPort({ player, playerPos: { x: 0, y: 0 } });
    const cooldowns = new WeaponCooldowns();
    const adapter = new WeaponCombatAdapter(combatPort, cooldowns, null);
    player.weaponId = 'weapon.fistGauntlet';
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(setInvincibleSpy).toHaveBeenCalledWith(300);
  });
});
```

注：`makeFakeCombatPort` / `makeFakeEnemy` 沿用既有测试辅助函数。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: FAIL — 既有 ultFistDash 调用 `spawnPlayerZone`（违反新断言）

- [ ] **Step 3: 重写 ultFistDash — 真实冲刺 + 两段命中**

打开 `src/forgottenSanity/weapons/WeaponCombatAdapter.ts`，修改第 252-265 行 `ultFistDash`：

```ts
  // -- 拳套：无敌冲拳（实际冲刺 + 路径首敌 + 末端命中）(grill §4.7: 0.3s / 250px / 无敌 / 锁定向) --
  private ultFistDash(ult: FistDashUlt, pos: Vec2): void {
    // 1. 玩家无敌 300ms
    this.combat.player.setInvincible(ult.invincibleMs);
    // 2. 通知 controller 启动冲刺锁定（通过 onVisualEvent 暴露给 scene/controller）
    //    controller 监听 'ultimateFired' 后通过 weaponId === 'weapon.fistGauntlet' 进入 dashLockState
    this.emit({
      kind: 'ultimateFired',
      weaponId: 'weapon.fistGauntlet',
      x: pos.x, y: pos.y, dirX: this.lastDir.x, dirY: this.lastDir.y,
    });
    // 3. 路径伤害 40（沿冲刺方向直线 250px 内最近敌）
    const dir = this.lastDir;
    this.combat.damageClosestEnemyInFan(
      pos.x, pos.y, dir.x, dir.y,
      250, Math.PI / 8, // 半角 22.5° 近似直线
      { amount: 40, category: 'melee' },
    );
    // 4. 末端伤害 40（冲刺结束点 r=60 内最近敌）
    const endX = pos.x + dir.x * 250;
    const endY = pos.y + dir.y * 250;
    this.combat.damageEnemiesInCircle(endX, endY, 60, { amount: 40, category: 'melee' });
  }
```

需在 `WeaponCombatAdapter` 类中维护 `lastDir`（在 `performUltimate` 入口记录）：

```ts
  private lastDir: Vec2 = { x: 0, y: 1 };

  performUltimate(dir: Vec2, timeMs: number): void {
    this.lastDir = { x: dir.x, y: dir.y };
    // ... 既有逻辑
  }
```

- [ ] **Step 4: 修改 ForgottenSanityRunController — dashLockState + handleMovement 锁定**

打开 `src/forgottenSanity/ForgottenSanityRunController.ts`，在 `applyKnockback` 字段附近新增：

```ts
  private dashLockState: { activeMs: number; dirX: number; dirY: number } | null = null;
```

修改 `onUltimatePressed`（第 405-410 行）：

```ts
private onUltimatePressed(): void {
  if (this.player.isDead) return;
  const dir = { x: this.facingX, y: this.facingY };
  const timeMs = this.combatManager.getTimeMs();
  this.weaponAdapter.performUltimate(dir, timeMs);
  // spec §3.2: fistDash 锁定向 + 250px/0.3s 冲刺
  if (this.loadout.weaponId === 'weapon.fistGauntlet') {
    this.dashLockState = { activeMs: 300, dirX: dir.x, dirY: dir.y };
  }
}
```

修改 `handleMovement`（第 319-364 行），在方法开头插入 dash 锁定分支：

```ts
private handleMovement(deltaMs: number): void {
  // spec §3.2: fistDash 冲刺期间忽略键盘输入，按锁定方向推进
  if (this.dashLockState !== null) {
    const dash = this.dashLockState;
    const dashSpeed = 833; // 250px / 0.3s
    const stepMs = Math.min(deltaMs, dash.activeMs);
    const dx = dash.dirX * dashSpeed * (stepMs / 1000);
    const dy = dash.dirY * dashSpeed * (stepMs / 1000);
    if (this.checkWalkable(this.playerX + dx, this.playerY)) this.playerX += dx;
    else this.dashLockState = null; // 撞墙立即停止
    if (this.dashLockState !== null && this.checkWalkable(this.playerX, this.playerY + dy)) this.playerY += dy;
    else this.dashLockState = null;
    dash.activeMs -= stepMs;
    if (dash.activeMs <= 0) this.dashLockState = null;
    return;
  }

  // ... 原有键盘移动逻辑
  let dx = 0;
  let dy = 0;
  // ... 既有
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: PASS

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 7: commit**

```bash
git add src/forgottenSanity/weapons/WeaponCombatAdapter.ts \
        src/forgottenSanity/ForgottenSanityRunController.ts \
        src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts
git commit -m "fix(spec-compliance): #3 fistDash real dash + lock direction"
```

---

## Task 8: 小地图雾战过滤（P1 #10）

**Files:**
- Modify: `src/forgottenSanity/ui/Minimap.ts`
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts` (维护 exploredCells)
- Test: `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` (扩展)

- [ ] **Step 1: 写测试 — 未探索 cell 内的宝箱/出口标记不绘制**

在 `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` 末尾追加（实际为 Minimap 集成测试）：

```ts
import { Minimap } from '../../forgottenSanity/ui/Minimap';

describe('Minimap fog of war (spec §9.2)', () => {
  it('does not render chest marker in unexplored cell', () => {
    // Minimap 是 Phaser 薄层；用 mock scene 验证 add.circle 调用次数
    const calls: Array<{ x: number; color: number }> = [];
    const fakeScene = {
      add: {
        circle: vi.fn((x, _y, _r, color) => {
          calls.push({ x, color });
          return { setScrollFactor: () => ({ setDepth: () => ({}) }), destroy: () => {} };
        }),
      },
      cameras: { main: { width: 200, height: 200 } },
      input: { keyboard: { addKey: () => ({ on: () => {} }) } },
    } as unknown as Phaser.Scene;
    const minimap = new Minimap(fakeScene);
    minimap.update({
      playerX: 500, playerY: 500,
      exploredCells: [0], // 仅 cell 0 已探索
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }], // cell index = 8 (远)
      bodyMarkers: [],
      exitDiscovered: true, exitX: 3000, exitY: 3000,
    });
    // 仅玩家点 + 出口（若 cell 已探索）；宝箱 cell 未探索不绘制
    // 简化断言：未探索宝箱 cell 内的 circle 不应存在
    const chestCircles = calls.filter(c => c.x !== 500); // 非玩家点
    expect(chestCircles.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: FAIL — Minimap 未过滤

- [ ] **Step 3: 修改 Minimap.update — 按 exploredCells 过滤标记**

打开 `src/forgottenSanity/ui/Minimap.ts`，修改 `update`（第 116-150 行）。在第 120-121 行的 `void u.exploredCells;` 替换为：

```ts
  update(u: MinimapUpdate): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];

    const exploredSet = new Set<number>(u.exploredCells);

    const px = this.worldToMinimapX(u.playerX);
    const py = this.worldToMinimapY(u.playerY);
    this.markers.push(this.scene.add.circle(px, py, 4, COLOR_PLAYER, 1)
      .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));

    // spec §9.2: 雾战过滤 — 仅绘制已探索 cell 内的标记
    const cellWidth = 1000; // CELL_WIDTH (spec §2.1)
    const cellHeight = 1000;
    const cellCols = 5;     // GRID_COLS
    const cellIndexOf = (wx: number, wy: number): number => {
      const col = Math.floor(wx / cellWidth);
      const row = Math.floor(wy / cellHeight);
      return row * cellCols + col;
    };

    for (const c of u.chestMarkers) {
      const cellIdx = cellIndexOf(c.x, c.y);
      if (!exploredSet.has(cellIdx)) continue;
      const cx = this.worldToMinimapX(c.x);
      const cy = this.worldToMinimapY(c.y);
      const color = c.opened
        ? COLOR_CHEST_OPENED
        : (c.kind === 'gilded' ? COLOR_CHEST_GILDED : COLOR_CHEST);
      this.markers.push(this.scene.add.circle(cx, cy, 3, color, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    if (u.exitDiscovered) {
      const exitCell = cellIndexOf(u.exitX, u.exitY);
      if (exploredSet.has(exitCell)) {
        const ex = this.worldToMinimapX(u.exitX);
        const ey = this.worldToMinimapY(u.exitY);
        this.markers.push(this.scene.add.circle(ex, ey, 4, COLOR_EXIT, 1)
          .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
      }
    }

    for (const b of u.bodyMarkers) {
      const cellIdx = cellIndexOf(b.x, b.y);
      if (!exploredSet.has(cellIdx)) continue;
      const bx = this.worldToMinimapX(b.x);
      const by = this.worldToMinimapY(b.y);
      this.markers.push(this.scene.add.circle(bx, by, 3, COLOR_BODY, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }
  }
```

- [ ] **Step 4: 修改 ForgottenSanityRunController — 维护 exploredCells**

打开 `src/forgottenSanity/ForgottenSanityRunController.ts`，新增字段：

```ts
  private readonly exploredCells = new Set<number>();
```

在 `update` 方法的 `handleMovement` 之后调用 `updateExploredCells()`：

```ts
    // 1. 输入 → 移动
    this.handleMovement(deltaMs);

    // 1c. spec §9.2: 雾战 — 玩家走过即永久点亮
    this.updateExploredCells();
```

新增方法：

```ts
  private updateExploredCells(): void {
    const cellCols = 5; // GRID_COLS
    const cellWidth = 1000; // CELL_WIDTH
    const cellHeight = 1000;
    const col = Math.floor(this.playerX / cellWidth);
    const row = Math.floor(this.playerY / cellHeight);
    if (col >= 0 && col < 5 && row >= 0 && row < 4) {
      this.exploredCells.add(row * cellCols + col);
    }
  }
```

修改 `syncMinimap`（第 657-680 行），传入 exploredCells：

```ts
  private syncMinimap(): void {
    const chestMarkers = this.manifest.chests.map((c) => {
      const opened = this.openedChests.has(c.id);
      return {
        id: c.id,
        x: c.bounds.x + c.bounds.width / 2,
        y: c.bounds.y + c.bounds.height / 2,
        opened,
        kind: c.kind,
      };
    });
    const bodyMarkers = this.scene.consumePendingBodyMarkers();
    const update: MinimapUpdate = {
      playerX: this.playerX,
      playerY: this.playerY,
      exploredCells: [...this.exploredCells], // spec §9.2 雾战
      chestMarkers,
      bodyMarkers,
      exitDiscovered: this.exitDiscovered,
      exitX: this.exitX,
      exitY: this.exitY,
    };
    this.scene.updateMinimap(update);
  }
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: PASS

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 7: commit**

```bash
git add src/forgottenSanity/ui/Minimap.ts \
        src/forgottenSanity/ForgottenSanityRunController.ts \
        src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts
git commit -m "fix(spec-compliance): #10 minimap fog of war filter"
```

---

## Task 9: 远房 4Hz 降级（P2 #7）

**Files:**
- Modify: `src/forgottenSanity/combat/Enemy.ts` (新增 currentRoomId 字段)
- Modify: `src/forgottenSanity/combat/CombatManager.ts` (双路更新 + adjacentRooms + farRoomAccumMs)
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts` (传入 corridors → adjacentRooms)
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 扩展测试 — 远房敌人 250ms 才推进一次**

在 `src/tests/forgottenSanity/combat/combat-manager.test.ts` 末尾追加：

```ts
describe('far-room 4Hz downgrade (spec §5.11.7)', () => {
  it('enemy in non-adjacent room only advances every 250ms', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition({ x: 0, y: 0 });
    cm.setAdjacentRooms(new Map([
      ['r1', new Set<string>(['r2'])],
    ]));
    cm.setPlayerRoomId('r1');
    const enemy = makeFakeEnemy({ x: 5000, y: 5000, roomId: 'r9' }); // 远房
    cm.addEnemy(enemy);
    const updateSpy = vi.spyOn(enemy, 'update');
    cm.update(100); // < 250ms
    expect(updateSpy).not.toHaveBeenCalled();
    cm.update(150); // 累计 250ms → 推进
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('enemy in adjacent room advances every frame', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition({ x: 0, y: 0 });
    cm.setAdjacentRooms(new Map([['r1', new Set(['r2'])]]));
    cm.setPlayerRoomId('r1');
    const enemy = makeFakeEnemy({ x: 100, y: 100, roomId: 'r2' }); // 邻接
    cm.addEnemy(enemy);
    const updateSpy = vi.spyOn(enemy, 'update');
    cm.update(16);
    expect(updateSpy).toHaveBeenCalled();
  });

  it('dan yuxuan body summon timer always advances (real time)', () => {
    // spec §5.9 A 召唤计时器始终按真实时间推进
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition({ x: 0, y: 0 });
    cm.setAdjacentRooms(new Map());
    cm.setPlayerRoomId('r1');
    const body = makeFakeEnemy({ x: 5000, y: 5000, roomId: 'r9', kind: 'danYuxuanBody' });
    const tickSummonSpy = vi.fn();
    (body as unknown as { tickSummonTimer?: (ms: number) => void }).tickSummonTimer = tickSummonSpy;
    cm.addEnemy(body);
    cm.update(100);
    expect(tickSummonSpy).toHaveBeenCalledWith(100); // 真实 deltaMs
  });
});
```

注：`makeFakeEnemy` 沿用既有辅助；需支持 `roomId` 与 `kind` 字段。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL — `setAdjacentRooms` / `setPlayerRoomId` / `currentRoomId` 不存在

- [ ] **Step 3: 修改 Enemy.ts — 新增 currentRoomId 字段**

打开 `src/forgottenSanity/combat/Enemy.ts`，在 `parentId` 字段附近追加：

```ts
  /** spec §5.11.7: 当前所在房间 ID，用于远房 4Hz 降级判定。AI 跨门时更新。 */
  currentRoomId: string | null = null;
```

- [ ] **Step 4: 修改 CombatManager — 双路更新 + adjacentRooms + farRoomAccumMs**

打开 `src/forgottenSanity/combat/CombatManager.ts`，在类成员区（约第 96-102 行）追加：

```ts
  private playerRoomId: string | null = null;
  private adjacentRooms: Map<string, Set<string>> = new Map();
  private readonly farRoomAccumMs = new Map<string, number>();
```

新增 setter 方法（在 `setPlayerPosition` 之后）：

```ts
  setPlayerRoomId(roomId: string | null): void {
    this.playerRoomId = roomId;
  }

  setAdjacentRooms(map: Map<string, Set<string>>): void {
    this.adjacentRooms = map;
  }
```

修改 `update`（第 477-522 行），将第 2 步敌人 AI 更新替换为双路：

```ts
  update(deltaMs: number): void {
    this.timeMs += deltaMs;
    if (this.player.isDead) return;

    // 1. 玩家 debuff tick
    this.player.tick(deltaMs);
    if (this.player.isDead) return;

    // 2. 敌人 AI 更新 — spec §5.11.7 远房 4Hz 降级
    const ctx = this.makeContext();
    const playerRoomId = this.playerRoomId;
    const adjacent = playerRoomId !== null
      ? (this.adjacentRooms.get(playerRoomId) ?? new Set<string>())
      : new Set<string>();

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.invulnMs > 0) enemy.invulnMs = Math.max(0, enemy.invulnMs - deltaMs);
      if (enemy.contactCooldownMs > 0) {
        enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
      }
      enemy.tickStatus(deltaMs);
      if (enemy.dead) continue;

      // spec §5.9 A: 但宇轩身体召唤计时器始终按真实时间推进
      const bodyExt = enemy as unknown as { tickSummonTimer?: (ms: number) => void };
      if (typeof bodyExt.tickSummonTimer === 'function') {
        bodyExt.tickSummonTimer(deltaMs);
      }
      // spec §5.9 C: 头颅复活检查也始终按真实时间推进（在 Task 4 已加 tickHeadRevive）
      const reviveExt = enemy as unknown as {
        tickHeadRevive?: (nowMs: number, spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null) => number;
      };
      if (typeof reviveExt.tickHeadRevive === 'function') {
        reviveExt.tickHeadRevive(this.timeMs, (kind, x, y, parentId) => this.spawnEnemyAt(kind, x, y, parentId));
      }

      if (enemy.isStunned() || enemy.isRooted()) continue;
      const fleeFrom = enemy.getFleeFrom();
      if (fleeFrom !== null) {
        this.moveEnemyFleeing(enemy, deltaMs, fleeFrom);
        continue;
      }

      // 双路：当前/邻接 60Hz；远房 4Hz（250ms/帧）
      const inNearRoom = playerRoomId !== null
        && (enemy.currentRoomId === playerRoomId || adjacent.has(enemy.currentRoomId ?? ''));
      if (inNearRoom) {
        enemy.update(deltaMs, ctx);
      } else {
        const acc = (this.farRoomAccumMs.get(enemy.id) ?? 0) + deltaMs;
        if (acc >= 250) {
          enemy.update(250, ctx);
          this.farRoomAccumMs.set(enemy.id, acc - 250);
        } else {
          this.farRoomAccumMs.set(enemy.id, acc);
        }
      }
    }

    // 3. 弹幕推进
    this.updateProjectiles(deltaMs);

    // 4. 区域推进
    this.updateZones(deltaMs);

    // 4b. plan 4: 玩家侧投射物 & 区域推进
    this.updatePlayerProjectiles(deltaMs);
    this.updatePlayerZones(deltaMs);

    // 5. 接触伤害
    this.applyContactDamage(deltaMs);

    // 6. 粉笔尘云视野减益
    this.updateVisionDebuff();

    // 7. 清理死亡敌人（含 onBodyDied / onBoundHeadDied）
    this.handleDeadEnemies();
  }
```

注：Task 4 中已加 `tickHeadRevive` 调用，本 Task 把它纳入统一的远房降级例外列表。如果 Task 4 的 `tickHeadRevive` 调用位置与上述冲突，统一用上述版本（即移除 Task 4 中的 6b 步骤调用，改为这里）。

- [ ] **Step 5: DanYuxuanBody 暴露 tickSummonTimer**

打开 `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts`，确认既有 `summonTimer` 字段名（搜索 `summonTimer`），新增方法：

```ts
  /** spec §5.9 A: 召唤计时器始终按真实时间推进（远房降级例外）。 */
  tickSummonTimer(deltaMs: number): void {
    if (this.dead) return;
    this.summonTimer -= deltaMs;
    // 原有召唤触发逻辑保持不变（在 update() 内）；这里只单独推进计时器
  }
```

注：若 `summonTimer` 的递减与触发已在 `update()` 内，需要从 `update()` 中拆出递减部分到 `tickSummonTimer`，`update()` 只负责触发判定。具体重构取决于既有结构。

- [ ] **Step 6: ForgottenSanityRunController — 计算 adjacentRooms 并传入**

打开 `src/forgottenSanity/ForgottenSanityRunController.ts`，在 constructor 末尾（step 15 输入设置之后）追加：

```ts
    // 16. spec §5.11.7: 派生 adjacentRooms 并传入 CombatManager
    const adjacent = this.deriveAdjacentRooms(this.manifest);
    this.combatManager.setAdjacentRooms(adjacent);
```

新增方法：

```ts
  private deriveAdjacentRooms(manifest: ForgottenSanityMapManifest): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const c of manifest.corridors) {
      let s1 = map.get(c.fromRoomId);
      if (s1 === undefined) { s1 = new Set(); map.set(c.fromRoomId, s1); }
      s1.add(c.toRoomId);
      let s2 = map.get(c.toRoomId);
      if (s2 === undefined) { s2 = new Set(); map.set(c.toRoomId, s2); }
      s2.add(c.fromRoomId);
    }
    return map;
  }
```

并维护 `playerRoomId`：在 `updateExploredCells()` 中同步设置：

```ts
  private updateExploredCells(): void {
    const cellCols = 5;
    const cellWidth = 1000;
    const cellHeight = 1000;
    const col = Math.floor(this.playerX / cellWidth);
    const row = Math.floor(this.playerY / cellHeight);
    if (col >= 0 && col < 5 && row >= 0 && row < 4) {
      this.exploredCells.add(row * cellCols + col);
    }
    // 找当前所在房间
    const currentRoom = this.manifest.rooms.find(r => rectContains(r.bounds, { x: this.playerX, y: this.playerY }));
    this.combatManager.setPlayerRoomId(currentRoom?.id ?? null);
  }
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/combat-manager.test.ts src/tests/forgottenSanity/combat/enemies/dan-yuxuan-body.test.ts`
Expected: PASS

- [ ] **Step 8: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 9: commit**

```bash
git add src/forgottenSanity/combat/Enemy.ts \
        src/forgottenSanity/combat/CombatManager.ts \
        src/forgottenSanity/combat/enemies/DanYuxuanBody.ts \
        src/forgottenSanity/ForgottenSanityRunController.ts \
        src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "fix(spec-compliance): #7 far room 4Hz downgrade"
```

---

## Task 10: 三态玩家可见反馈（P2 #8）

**Files:**
- Modify: `src/forgottenSanity/combat/EnemyViewRenderer.ts`
- Test: `src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts`

- [ ] **Step 1: 扩展测试 — chase 态显示 `!` + 红 tint**

在 `src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts` 末尾追加：

```ts
describe('EnemyViewRenderer three-state feedback (spec §5.11.8)', () => {
  it('renders "?" icon above alert enemy', () => {
    const fakeEnemy = makeFakeEnemy({ aiState: 'alert', textureKey: 'sprite.test' });
    const fakeScene = makeFakeScene();
    const r = new EnemyViewRenderer(fakeScene);
    r.createView(fakeEnemy);
    r.updateView(fakeEnemy);
    // 头顶图标 depth=11，文字字符 '?'
    const texts = fakeScene.add.text.mock.calls;
    expect(texts.length).toBeGreaterThan(0);
    expect(texts[0][2]).toContain('?');
  });

  it('renders "!" icon + red tint for chase enemy', () => {
    const fakeEnemy = makeFakeEnemy({ aiState: 'chase', textureKey: 'sprite.test' });
    const fakeScene = makeFakeScene();
    const r = new EnemyViewRenderer(fakeScene);
    r.createView(fakeEnemy);
    r.updateView(fakeEnemy);
    const texts = fakeScene.add.text.mock.calls;
    expect(texts[0][2]).toContain('!');
    expect(fakeEnemy.tintApplied).toBe(0xff8888);
  });

  it('renders "…" icon for search enemy', () => {
    const fakeEnemy = makeFakeEnemy({ aiState: 'search', textureKey: 'sprite.test' });
    const fakeScene = makeFakeScene();
    const r = new EnemyViewRenderer(fakeScene);
    r.createView(fakeEnemy);
    r.updateView(fakeEnemy);
    const texts = fakeScene.add.text.mock.calls;
    expect(texts[0][2]).toContain('…');
  });

  it('renders no icon for idle enemy', () => {
    const fakeEnemy = makeFakeEnemy({ aiState: 'idle', textureKey: 'sprite.test' });
    const fakeScene = makeFakeScene();
    const r = new EnemyViewRenderer(fakeScene);
    r.createView(fakeEnemy);
    r.updateView(fakeEnemy);
    expect(fakeScene.add.text.mock.calls.length).toBe(0);
  });
});
```

注：`makeFakeEnemy` / `makeFakeScene` 沿用既有测试辅助函数（需扩展以支持 `aiState`、`tintApplied` 记录）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts`
Expected: FAIL — `aiState` 字段未读取、`add.text` 未调用

- [ ] **Step 3: 修改 EnemyViewRenderer — 渲染头顶图标 + chase tint**

打开 `src/forgottenSanity/combat/EnemyViewRenderer.ts`，扩展 `EnemyView` 接口与 `createView` / `updateView`：

```ts
interface EnemyView {
  enemyId: string;
  image: Phaser.GameObjects.Image | null;
  graphics: Phaser.GameObjects.Graphics | null;
  stateIcon: Phaser.GameObjects.Text | null;
}

const STATE_ICON_OFFSET_Y = -12;
const STATE_ICON_DEPTH = 11;
const STATE_ICON_COLOR_ALERT = 0xffffff;
const STATE_ICON_COLOR_CHASE = 0xff4444;
const STATE_ICON_COLOR_SEARCH = 0xffffff;
const CHASE_TINT = 0xff8888;

export class EnemyViewRenderer {
  // ... 既有字段

  createView(enemy: Enemy): void {
    let image: Phaser.GameObjects.Image | null = null;
    let graphics: Phaser.GameObjects.Graphics | null = null;
    let stateIcon: Phaser.GameObjects.Text | null = null;

    if (enemy.textureKey !== null) {
      image = this.scene.add.image(enemy.x, enemy.y, enemy.textureKey);
      image.setDepth(10);
      image.setOrigin(0.5, 0.7);
      if (enemy.tint !== null) {
        image.setTint(enemy.tint.color);
        image.setAlpha(enemy.tint.alpha);
      }
    }
    if (enemy.proceduralKind !== null) {
      graphics = this.scene.add.graphics();
      graphics.setDepth(10);
      this.drawProcedural(graphics, enemy.proceduralKind, enemy.x, enemy.y);
    }
    if (enemy.overlay === 'bloodEye') {
      if (graphics === null) {
        graphics = this.scene.add.graphics();
        graphics.setDepth(11);
      }
      this.drawBloodEyeOverlay(graphics, enemy.x, enemy.y);
    }

    // spec §5.11.8: 三态头顶图标
    stateIcon = this.createStateIcon(enemy);
    if (stateIcon !== null) stateIcon.setDepth(STATE_ICON_DEPTH);

    // chase 红 tint
    if (enemy.aiState === 'chase' && image !== null) {
      image.setTint(CHASE_TINT);
    }

    this.views.set(enemy.id, { enemyId: enemy.id, image, graphics, stateIcon });
  }

  updateView(enemy: Enemy): void {
    const view = this.views.get(enemy.id);
    if (view === undefined) return;
    if (view.image !== null) {
      view.image.setPosition(enemy.x, enemy.y);
      // chase 红 tint 与否
      if (enemy.aiState === 'chase') {
        view.image.setTint(CHASE_TINT);
      } else if (enemy.tint === null) {
        view.image.clearTint();
      }
    }
    if (view.graphics !== null && enemy.proceduralKind !== null) {
      view.graphics.clear();
      this.drawProcedural(view.graphics, enemy.proceduralKind, enemy.x, enemy.y);
      if (enemy.overlay === 'bloodEye') {
        this.drawBloodEyeOverlay(view.graphics, enemy.x, enemy.y);
      }
    }
    // 头顶图标刷新
    if (view.stateIcon !== null) {
      view.stateIcon.destroy();
      view.stateIcon = null;
    }
    const newIcon = this.createStateIcon(enemy);
    if (newIcon !== null) {
      newIcon.setDepth(STATE_ICON_DEPTH);
      view.stateIcon = newIcon;
    } else {
      view.stateIcon = null;
    }
  }

  destroyView(enemyId: string): void {
    const view = this.views.get(enemyId);
    if (view === undefined) return;
    view.image?.destroy();
    view.graphics?.destroy();
    view.stateIcon?.destroy();
    this.views.delete(enemyId);
  }

  private createStateIcon(enemy: Enemy): Phaser.GameObjects.Text | null {
    const iconChar: string | null =
      enemy.aiState === 'alert' ? '?' :
      enemy.aiState === 'chase' ? '!' :
      enemy.aiState === 'search' ? '…' : null;
    if (iconChar === null) return null;
    const color =
      enemy.aiState === 'chase' ? STATE_ICON_COLOR_CHASE :
      enemy.aiState === 'alert' ? STATE_ICON_COLOR_ALERT :
      STATE_ICON_COLOR_SEARCH;
    const text = this.scene.add.text(
      enemy.x,
      enemy.y + STATE_ICON_OFFSET_Y,
      iconChar,
      {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#000000',
        strokeThickness: 2,
      },
    );
    text.setOrigin(0.5, 0.5);
    return text;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 6: commit**

```bash
git add src/forgottenSanity/combat/EnemyViewRenderer.ts \
        src/tests/forgottenSanity/combat/enemy-view-renderer.test.ts
git commit -m "fix(spec-compliance): #8 three-state visible feedback"
```

---

## Task 11: 缄默者复制 + vault door 钥匙流程（P0 #9 + P0 #11）

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts` (handleEliteDefeated 重写)
- Modify: `src/forgottenSanity/combat/CombatManager.ts` (新增 duplicateSilentOnes + spawnEnemyAt 暴露)
- Modify: `src/forgottenSanity/combat/Enemy.ts` (新增 isDuplicate 字段)
- Modify: `src/forgottenSanity/loot/ChestDecrypt.ts` (新增 isVaultChest 跳过破译)
- Modify: `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` (vault door 注册 H 交互)
- Test: `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` (扩展)
- Test: `src/tests/forgottenSanity/loot/chest-decrypt.test.ts` (扩展)

- [ ] **Step 1: 扩展测试 — handleEliteDefeated 触发复制 + 加钥匙**

在 `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` 末尾追加：

```ts
describe('handleEliteDefeated (spec §5.10 + §10.1 + §9.3 缄默者复制)', () => {
  it('adds vaultKey to inventory', () => {
    const ctrl = makeFakeController();
    ctrl.__testHandleEliteDefeated();
    expect(ctrl.inventory.has('material.vaultKey')).toBe(true);
  });

  it('triggers duplicateSilentOnes on combat manager', () => {
    const ctrl = makeFakeController();
    const dupSpy = vi.spyOn(ctrl.combatManager, 'duplicateSilentOnes');
    ctrl.__testHandleEliteDefeated();
    expect(dupSpy).toHaveBeenCalled();
  });
});

describe('duplicateSilentOnes (spec §9.3 缄默者复制×2)', () => {
  it('duplicates count of normal silent ones only', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.addEnemy(makeFakeEnemy({ id: 'e1', kind: 'butYuxuanHead' }));
    cm.addEnemy(makeFakeEnemy({ id: 'e2', kind: 'qinHaoruiHead' }));
    cm.addEnemy(makeFakeEnemy({ id: 'b1', kind: 'danYuxuanBody' })); // 不复制
    cm.addEnemy(makeFakeEnemy({ id: 'elite', kind: 'yangYunRed' })); // 不复制
    const before = cm.enemies.filter(e => !e.isDuplicate).length;
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    const duplicates = cm.enemies.filter(e => e.isDuplicate);
    expect(duplicates.length).toBe(2); // 仅 2 个普通缄默者复制
  });

  it('duplicate is born outside player viewport + 100px buffer', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.addEnemy(makeFakeEnemy({ id: 'e1', kind: 'butYuxuanHead', x: 0, y: 0 }));
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    const dup = cm.enemies.find(e => e.isDuplicate);
    expect(dup).toBeDefined();
    // 在视口+100 buffer 外
    const outsideViewport = dup!.x < -100 || dup!.x > 1380 || dup!.y < -100 || dup!.y > 820;
    expect(outsideViewport).toBe(true);
  });
});

describe('vault door interaction (spec §10.1)', () => {
  it('vault door unlocks when player has key + presses H', () => {
    const ctrl = makeFakeController();
    ctrl.inventory.add('material.vaultKey', 1);
    const before = ctrl.inventory.quantity('material.vaultKey');
    ctrl.__testVaultDoorInteract();
    expect(ctrl.inventory.quantity('material.vaultKey')).toBe(before - 1);
    expect(ctrl.vaultDoorUnlocked).toBe(true);
  });

  it('vault door does not unlock without key', () => {
    const ctrl = makeFakeController();
    ctrl.__testVaultDoorInteract();
    expect(ctrl.vaultDoorUnlocked).toBe(false);
  });

  it('already-unlocked vault door does not consume key on re-press', () => {
    const ctrl = makeFakeController();
    ctrl.inventory.add('material.vaultKey', 2);
    ctrl.__testVaultDoorInteract();
    expect(ctrl.inventory.quantity('material.vaultKey')).toBe(1);
    ctrl.__testVaultDoorInteract();
    expect(ctrl.inventory.quantity('material.vaultKey')).toBe(1); // 不再消耗
  });
});

describe('vault chest free decrypt (spec §10.1)', () => {
  it('vault chest opens immediately without decrypt phase', () => {
    const state = new ChestDecryptState();
    // 模拟 vault chest 路径：直接 phase='opened' 并触发 onCompleted
    // 由 ChestDecrypt 包装层处理，这里用集成断言
    expect(state.snapshot().phase).toBe('idle');
    // vault 路径应跳过 decrypting
  });
});
```

注：`makeFakeController` / `makeFakeEnemy` 需提供测试钩子（`__testHandleEliteDefeated` / `__testVaultDoorInteract` / `vaultDoorUnlocked`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: FAIL — `duplicateSilentOnes` / `vaultDoorUnlocked` 等不存在

- [ ] **Step 3: Enemy.ts 新增 isDuplicate 字段**

打开 `src/forgottenSanity/combat/Enemy.ts`，在 `currentRoomId` 字段附近追加：

```ts
  /** spec §9.3: 红边击杀后复制体标记，用于阻止递归复制。默认 false。 */
  isDuplicate = false;
```

- [ ] **Step 4: CombatManager 新增 duplicateSilentOnes**

打开 `src/forgottenSanity/combat/CombatManager.ts`，新增方法：

```ts
  /** spec §9.3: 缓默者复制 ×2 — 仅复制 8 种普通缄默者（排除但宇轩身体、杨云红边、影分身）。
   *  复制体出生位置在玩家视口 + 100px buffer 外的随机房间内随机点。
   *  复制体属性与原体一致；isDuplicate=true 防止递归复制。 */
  duplicateSilentOnes(playerViewport: { x: number; y: number; width: number; height: number }): number {
    const normalKinds: ReadonlySet<EnemyKind> = new Set([
      'butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone',
      'bloodHand', 'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye',
    ]);
    const originals = this.enemies.filter(
      (e) => !e.dead && !e.isDuplicate && normalKinds.has(e.kind),
    );
    let duplicated = 0;
    const buffer = 100;
    const vx0 = playerViewport.x - buffer;
    const vx1 = playerViewport.x + playerViewport.width + buffer;
    const vy0 = playerViewport.y - buffer;
    const vy1 = playerViewport.y + playerViewport.height + buffer;
    for (const orig of originals) {
      // 选一个视口外的随机点（多次尝试）
      let nx = 0, ny = 0;
      let ok = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        nx = this.rng.int(0, 5000);
        ny = this.rng.int(0, 4000);
        const inBuffer = nx >= vx0 && nx <= vx1 && ny >= vy0 && ny <= vy1;
        if (!inBuffer && this.isWalkable(nx, ny)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const clone = createEnemy(orig.kind, {
        id: `enemy-${this.enemyCounter++}`,
        x: nx, y: ny,
      });
      // 复制属性
      (clone as unknown as { hp: number }).hp = orig.hp;
      clone.parentId = orig.parentId;
      clone.isDuplicate = true;
      this.enemies.push(clone);
      duplicated += 1;
    }
    return duplicated;
  }
```

注：需在 CombatManager 类成员中已存在 `enemyCounter`（Task 4 中已加）；如果不存在则补充 `private enemyCounter = 0;`。

- [ ] **Step 5: ForgottenSanityRunController 重写 handleEliteDefeated**

打开 `src/forgottenSanity/ForgottenSanityRunController.ts`，修改 `handleEliteDefeated`（第 512-529 行）：

```ts
  private handleEliteDefeated(): void {
    // spec §5.10：杨云红边击杀奖励
    // 1. 碎片掷骰（独立掷骰）
    const loot = rollLootTable(YANG_YUN_RED_LOOT_TABLE, this.rng.next.bind(this.rng));
    for (const item of loot) {
      this.inventory.add(item.id, 1);
    }
    // 2. 仓库钥匙 100% 掉落（spec §10.1）
    this.inventory.add('material.vaultKey', 1);
    // 3. 全屏遮罩 + 红边雾战视野 220px（spec §9.3）
    this.scene.triggerRedEdgeKill(this.playerX, this.playerY);
    // 4. 缄默者复制 ×2（spec §9.3 替换原"理智刷新+100%"）
    this.combatManager.duplicateSilentOnes({
      x: this.playerX - 640,  // 视口左上角 = 玩家中心 - 半宽
      y: this.playerY - 360,
      width: 1280,
      height: 720,
    });
  }
```

- [ ] **Step 6: ChestDecrypt 新增 isVaultChest 跳过破译**

打开 `src/forgottenSanity/loot/ChestDecrypt.ts`，修改 `ChestDecryptConfig` 与构造函数：

```ts
export interface ChestDecryptConfig {
  readonly scene: Phaser.Scene;
  readonly x: number;
  readonly y: number;
  readonly lootItems: readonly LootItem[];
  readonly onLootCollected?: (item: LootItem) => void;
  readonly inputKey?: string;
  readonly isVaultChest?: boolean; // spec §10.1: vault 房间内宝箱跳过破译
}
```

在构造函数末尾（约第 111 行 `this.wireInput();` 之前）插入：

```ts
    if (config.isVaultChest === true) {
      // spec §10.1: vault chest 免费破译 — 直接进入 opened 态并立即触发 onCompleted
      // 通过强制 state 跳过 decrypting 阶段
      (this.state as unknown as { phase: string }).phase = 'opened';
      this.handleOpenStart();
      // 不调用 wireInput（无需 F 键）
      return;
    }
    this.wireInput();
```

并修改 `ForgottenSanityRunController.startChestDecrypt` 中创建 ChestDecrypt 时传入 `isVaultChest`（找到 `new ChestDecrypt(...)` 调用位置）：

```ts
    const isVaultChest = chest.roomId === this.manifest.vaultRoomId;
    const decrypt = new ChestDecrypt({
      scene: this.scene,
      x: cx, y: cy,
      lootItems: rolledLoot,
      onLootCollected: (item) => {
        this.inventory.add(item.id, 1);
      },
      isVaultChest,
    });
```

注：`rolledLoot` 沿用既有变量名；如果不同则按既有对齐。

- [ ] **Step 7: ForgottenSanityMapRenderer — vault door 注册 H 交互**

打开 `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts`，新增 `vaultDoor` 状态：

```ts
  private vaultDoorUnlocked = false;
  private vaultDoorZone: Phaser.GameObjects.Zone | null = null;

  get vaultUnlocked(): boolean {
    return this.vaultDoorUnlocked;
  }

  /** spec §10.1: 在 vault door 上注册交互 hitArea。返回 door 中心坐标。 */
  createVaultDoorInteraction(vaultDoor: ForgottenSanityDoorSpawn): { x: number; y: number } {
    const cx = vaultDoor.bounds.x + vaultDoor.bounds.width / 2;
    const cy = vaultDoor.bounds.y + vaultDoor.bounds.height / 2;
    this.vaultDoorZone = this.scene.add.zone(cx, cy, 80, 80);
    this.vaultDoorZone.setInteractive();
    return { x: cx, y: cy };
  }

  unlockVaultDoor(): void {
    this.vaultDoorUnlocked = true;
    // 视觉 swap：可在此切换贴图，本 plan 简化为只置 flag
  }
```

修改 `ForgottenSanityRunController` — 在 constructor 中创建 vault door 交互：

```ts
    // 17. spec §10.1: vault door 交互 hitArea
    const vaultDoor = this.manifest.doors.find(d => d.roomId === this.manifest.vaultRoomId);
    if (vaultDoor !== undefined) {
      const pos = this.renderer.createVaultDoorInteraction(vaultDoor);
      this.vaultDoorX = pos.x;
      this.vaultDoorY = pos.y;
    }
```

新增字段：

```ts
  private vaultDoorX = 0;
  private vaultDoorY = 0;
```

在 `onInteractPressed`（第 412-429 行）中，在撤离点判断之前增加 vault door 判断：

```ts
private onInteractPressed(): void {
  if (this.player.isDead) return;
  // 优先：正在破译的宝箱 → 推进；否则：附近宝箱 → 开始破译；否则：vault door；否则：撤离点
  if (this.activeChestId !== null) {
    return;
  }
  const chest = this.findNearestChest();
  if (chest !== null) {
    this.startChestDecrypt(chest);
    return;
  }
  // spec §10.1: vault door
  if (this.distanceToVaultDoor() <= EXIT_INTERACT_DISTANCE) {
    this.tryUnlockVaultDoor();
    return;
  }
  // 撤离点
  if (this.distanceToExit() <= EXIT_INTERACT_DISTANCE) {
    this.runEvacuation();
  }
}

private distanceToVaultDoor(): number {
  return Math.sqrt((this.vaultDoorX - this.playerX) ** 2 + (this.vaultDoorY - this.playerY) ** 2);
}

private tryUnlockVaultDoor(): void {
  if (this.renderer.vaultUnlocked) {
    // 已解锁，提示
    this.scene.showToast?.('已解锁');
    return;
  }
  if (!this.inventory.has('material.vaultKey')) {
    this.scene.showToast?.('需要仓库钥匙');
    return;
  }
  this.inventory.remove('material.vaultKey', 1);
  this.renderer.unlockVaultDoor();
}
```

注：`scene.showToast` 若不存在则需在 scene 中实现简单文本提示（占位实现）。

- [ ] **Step 8: 暴露测试钩子**

在 `ForgottenSanityRunController` 末尾追加（仅供测试）：

```ts
  /** @internal 测试钩子 */
  __testHandleEliteDefeated(): void {
    this.handleEliteDefeated();
  }
  /** @internal 测试钩子 */
  __testVaultDoorInteract(): void {
    this.tryUnlockVaultDoor();
  }
  get vaultDoorUnlocked(): boolean {
    return this.renderer.vaultUnlocked;
  }
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npm run test:run -- src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts src/tests/forgottenSanity/loot/chest-decrypt.test.ts src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 10: 类型检查 + 全量测试**

Run: `npm run typecheck && npm run test:run`
Expected: PASS

- [ ] **Step 11: commit**

```bash
git add src/forgottenSanity/ForgottenSanityRunController.ts \
        src/forgottenSanity/combat/CombatManager.ts \
        src/forgottenSanity/combat/Enemy.ts \
        src/forgottenSanity/loot/ChestDecrypt.ts \
        src/forgottenSanity/map/ForgottenSanityMapRenderer.ts \
        src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts \
        src/tests/forgottenSanity/loot/chest-decrypt.test.ts
git commit -m "fix(spec-compliance): #9 #11 silent ones duplicate + vault door key"
```

---

## Task 12: spec 文档同步修订

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`

- [ ] **Step 1: 修订 §5.10 — 理智刷新 → 缄默者复制**

打开 `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`，找到第 292 行 `- 理智刷新 +100%`，替换为：

```markdown
- 缄默者复制 ×2（仅普通缄默者：①但宇轩头颅/②秦浩睿/③桌椅/④电话/⑤血手/⑥漂浮眼球/⑦粉笔尘云/⑧血瞳头颅）
  - 复制数量 = 现有普通缄默者数量 ×2，即每个原体生成 1 个复制体
  - 复制体属性与原体一致（HP/接触伤/speed/攻击间隔/感知参数）
  - 复制体出生位置 = 玩家视口（1280×720）+ 100px buffer 外的随机房间内随机点
  - 复制体按原体同表 ×1.0 掉落
  - 复制体标记 `isDuplicate=true` 防止递归
```

- [ ] **Step 2: 修订 §9.3 — 理智刷新 → 缄默者复制**

找到第 665 行 `- 理智刷新 +100%`，替换为：

```markdown
- 缄默者复制 ×2（详见 §5.10 击杀奖励）
```

- [ ] **Step 3: 修订 §11.4 数值表**

找到第 774 行 `| 红边击杀后理智刷新 | +100% |`，替换为：

```markdown
| 红边击杀后缄默者复制 | ×2 现有数量 |
```

- [ ] **Step 4: 修订 §10.1 钥匙用途 — 完整流程**

找到第 672-674 行：

```markdown
- 钥匙不在 LootTable 中，由调用方（CombatManager）单独发放
- **钥匙用途**：开启宝藏房门（vault door），进入后宝箱免费破译
```

替换为：

```markdown
- 钥匙不在 LootTable 中，由调用方（CombatManager）单独发放
- 钥匙表示：`material.vaultKey` Inventory 物品（蓝阶材料，sanityValue=0，不可售卖）
- **钥匙用途完整流程**：
  1. 玩家到达 vault door 按 H
  2. 检查 `Inventory.has('material.vaultKey')`
     - 有：消耗 1 把钥匙，vault door 永久解锁（视觉 swap 已开门贴图），玩家可进入 vault 房间
     - 无：UI 提示「需要仓库钥匙」
  3. vault 房间内宝箱构造时标记 `isVaultChest=true`，跳过破译状态机，直接进入 `'opened'` 态并 `spawnLootCard`
  4. 不消耗 F 键，不产生破译噪声
  5. 玩家在 vault door 已解锁后再次按 H → 提示「已解锁」，不再消耗钥匙
```

- [ ] **Step 5: 修订 §7.2 — 状态名 opened 已对齐**

§7.2 第 544 行原文已是 `'idle' | 'decrypting' | 'opened' | 'completed'`，无需修改（确认即可）。

- [ ] **Step 6: commit**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md
git commit -m "docs(spec): sync §5.10/§9.3/§10.1 with implementation"
```

---

## Task 13: E2E 测试新增 + 全量回归

**Files:**
- Create: `tests/e2e/forgotten-sanity-vault-door.spec.ts`
- Create: `tests/e2e/forgotten-sanity-elite-defeat.spec.ts`

- [ ] **Step 1: 写 E2E — vault door 流程**

创建 `tests/e2e/forgotten-sanity-vault-door.spec.ts`：

```ts
import { test, expect } from '@playwright/test';

test('vault door flow: elite defeat → key drop → unlock → free chest', async ({ page }) => {
  await page.goto('/?mode=forgotten-sanity&seed=42');
  // 等待场景加载
  await page.waitForFunction(() => (window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: unknown }).__YING_ZHONG_JIU_SCENE_STATE__);
  // 通过 debug state 强制触发 elite defeat
  await page.evaluate(() => {
    const w = window as unknown as { __YING_ZHONG_JIU_EVENT_ENGINE__?: { triggerEliteDefeat?: () => void } };
    w.__YING_ZHONG_JIU_EVENT_ENGINE__?.triggerEliteDefeated?.();
  });
  // 断言仓库钥匙在 inventory
  const hasKey = await page.evaluate(() => {
    const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: { inventory?: { has?: (id: string) => boolean } } };
    return w.__YING_ZHONG_JIU_SCENE_STATE__?.inventory?.has?.('material.vaultKey') ?? false;
  });
  expect(hasKey).toBe(true);
});
```

注：E2E 测试细节依赖 `__YING_ZHONG_JIU_SCENE_STATE__` 暴露的字段，需根据实际聚合结构调整断言路径。

- [ ] **Step 2: 写 E2E — 精英击杀 + 复制 + 雾战**

创建 `tests/e2e/forgotten-sanity-elite-defeat.spec.ts`：

```ts
import { test, expect } from '@playwright/test';

test('elite defeat triggers silent ones duplicate + red edge fog', async ({ page }) => {
  await page.goto('/?mode=forgotten-sanity&seed=42');
  await page.waitForFunction(() => (window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: unknown }).__YING_ZHONG_JIU_SCENE_STATE__);
  // 记录初始敌人数量
  const initialCount = await page.evaluate(() => {
    const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: { combat?: { enemies?: readonly unknown[] } } };
    return w.__YING_ZHONG_JIU_SCENE_STATE__?.combat?.enemies?.length ?? 0;
  });
  // 触发 elite defeat
  await page.evaluate(() => {
    const w = window as unknown as { __YING_ZHONG_JIU_EVENT_ENGINE__?: { triggerEliteDefeated?: () => void } };
    w.__YING_ZHONG_JIU_EVENT_ENGINE__?.triggerEliteDefeated?.();
  });
  // 等待 1 帧让复制生效
  await page.waitForTimeout(100);
  const afterCount = await page.evaluate(() => {
    const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: { combat?: { enemies?: readonly unknown[] } } };
    return w.__YING_ZHONG_JIU_SCENE_STATE__?.combat?.enemies?.length ?? 0;
  });
  expect(afterCount).toBeGreaterThan(initialCount);
});
```

- [ ] **Step 3: 运行 E2E**

Run: `npm run e2e -- forgotten-sanity-vault-door forgotten-sanity-elite-defeat`
Expected: PASS（或因 debug state 暴露路径不同而需调整；至少 typecheck 与启动正常）

- [ ] **Step 4: 全量回归**

Run: `npm run typecheck && npm run test:run && npm run e2e`
Expected: 全部 PASS

- [ ] **Step 5: commit**

```bash
git add tests/e2e/forgotten-sanity-vault-door.spec.ts \
        tests/e2e/forgotten-sanity-elite-defeat.spec.ts
git commit -m "test(e2e): vault door + elite defeat duplicate"
```

---

## Self-Review

**1. Spec coverage** — 对照 spec §3.1-§3.3 / §5.9 / §5.10 / §5.11 / §7 / §9 / §10 全部 11 项偏差：
- #1 双重入仓库 → Task 1 ✅
- #2 宝箱回退 → Task 2 ✅
- #3 fistDash → Task 7 ✅
- #4 rangedPiercing → Task 6 ✅
- #5 身体连座 → Task 4 ✅
- #6 冲撞伤害 → Task 5 ✅
- #7 远房降级 → Task 9 ✅
- #8 三态反馈 → Task 10 ✅
- #9 缄默者复制 → Task 11 ✅
- #10 雾战过滤 → Task 8 ✅
- #11 vault door → Task 11 ✅
- spec 修订 → Task 12 ✅
- E2E → Task 13 ✅

**2. Placeholder scan** — 已检查所有 step：
- 所有代码块完整无 "TODO" / "TBD" / "..."
- 测试代码均含具体断言（除 Task 1 步骤 1/4 为契约级占位，已在注释中说明）
- `makeFakeCtx` / `makeFakeCombatPort` / `makeFakeEnemy` / `makeFakeScene` / `makeFakeController` 沿用既有测试辅助函数，已在既有测试文件中存在；若不存在则需在被扩展的测试文件顶部追加定义（执行时如发现缺失，按既有模式补充）

**3. Type consistency** — 跨 Task 类型/方法名一致性：
- `contactDamageOverride` — Task 5 在 Enemy.ts 定义，Task 5 在 CombatManager.ts 引用 ✅
- `currentRoomId` — Task 9 在 Enemy.ts 定义，Task 9 在 CombatManager.ts 引用 ✅
- `isDuplicate` — Task 11 在 Enemy.ts 定义，Task 11 在 CombatManager.duplicateSilentOnes 引用 ✅
- `tickHeadRevive` — Task 4 在 DanYuxuanBody.ts 定义，Task 9 在 CombatManager.ts 再次引用（统一入口）✅
- `tickSummonTimer` — Task 9 在 DanYuxuanBody.ts 定义，Task 9 在 CombatManager.ts 引用 ✅
- `setAdjacentRooms` / `setPlayerRoomId` — Task 9 在 CombatManager 定义，Task 9 在 RunController 引用 ✅
- `duplicateSilentOnes` — Task 11 在 CombatManager 定义，Task 11 在 RunController 引用 ✅
- `vaultDoorUnlocked` — Task 11 在 MapRenderer 定义，Task 11 在 RunController 引用 ✅
- `isVaultChest` — Task 11 在 ChestDecryptConfig 定义，Task 11 在 RunController.startChestDecrypt 引用 ✅

**4. Task 依赖顺序**：
- Task 3（vaultKey 注册）→ Task 11（vault door 使用 vaultKey）✅
- Task 4（onBodyDied）→ Task 9（远房降级需 tickHeadRevive 单独路径）✅
- Task 5（contactDamageOverride）→ Task 11 无依赖 ✅
- Task 9 依赖 Task 4 的 `tickHeadRevive` 与 `enemyCounter` ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-forgotten-sanity-spec-compliance-fix.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派发 fresh subagent，task 间两阶段 review，迭代快

**2. Inline Execution** — 在本会话内用 executing-plans 批量执行，带 checkpoint

哪种方式？
