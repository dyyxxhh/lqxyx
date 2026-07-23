# 被遗忘的理智 — 结构债收口实施计划（plan#5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关闭 spec#2 §9 悬空的「结构性偏差 A-J」承诺，收口 2026-07-23 审核发现的 P0/P1/P2 结构债。

**Architecture:** 4 Phase 顺序实施。Phase 1 修 A-J 类型契约（P0）→ Phase 2 拆三大文件 → Phase 3 BitmapMask + 低风险打包 → Phase 4 测试补全 + 文档同步。每个 Phase 内部 task 可并联派发子代理。全程 TDD（RED→GREEN→COMMIT），零侵入剧情模式，功能冻结。

**Tech Stack:** TypeScript 5 + Phaser 4 + Vitest（单元）+ Playwright（E2E）。strict 模式 + noUnusedLocals + noUncheckedIndexedAccess + exactOptionalPropertyTypes。

**对照 spec：** `docs/superpowers/specs/2026-07-23-forgotten-sanity-structural-debt-closure-design.md`（spec#5）

**关键代码现状（plan 编写时核实）：**
- `CombatManager`（`src/forgottenSanity/combat/CombatManager.ts:119`）未 `implements CombatPort`
- RunController（`ForgottenSanityRunController.ts:221-260`）**手写 combatPort 对象字面量**代理整个 CombatPort 接口（非 cast，比 spec 描述更糟）
- `defaultEnemyOpts` 双源：`CombatManager.ts:783` + `ForgottenSanityRunController.ts:638`
- CombatManager 多处 duck-typing：`:576,641,646,976,1005,1042,1043,1052`（8 处 `as unknown as` 探测 enemy 钩子）
- `createEnemy`（`Enemy.ts:399-403`）未注册返回 `null`
- `mapState` 已 export `FORGOTTEN_SANITY_MAP_WIDTH=5000` 等（Minimap 用了不同名 `MAP_WORLD_WIDTH`）
- `scaffoldState.ts:84-88` 已有 `declare global { interface Window { __YING_ZHONG_JIU_SCENE_STATE__? } }`，可在此追加
- `LootTable.ts:182,195,207,209` 四处 `[...]!` 非空断言
- `WeaponCombatAdapter.ts:88-89` 模块级 `let playerProjectileCounter/playerZoneCounter`
- `RedEdgeFogOverlay.ts` 简化版用 `overlay`(rectangle) + `visionCircle`(arc)

---

## Phase 1：A-J 类型契约（P0）

### Task 1: window 全局 declare global（§4.3）

**Files:**
- Modify: `src/game/scaffoldState.ts:84-88`
- Test: `src/tests/forgottenSanity/types/globals.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/forgottenSanity/types/globals.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { ForgottenSanityTestHooks } from '../../../forgottenSanity/ForgottenSanityScene';

describe('window globals — forgotten sanity', () => {
  it('__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ 类型为 ForgottenSanityTestHooks | undefined', () => {
    expectTypeOf(window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__).toEqualTypeOf<ForgottenSanityTestHooks | undefined>();
  });
  it('__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ 类型为 boolean | undefined', () => {
    expectTypeOf(window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__).toEqualTypeOf<boolean | undefined>();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/tests/forgottenSanity/types/globals.test.ts`
Expected: FAIL — `Property '__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__' does not exist on type 'Window'`

- [ ] **Step 3: 在 scaffoldState.ts 的 declare global 追加声明**

```ts
// src/game/scaffoldState.ts:84-88 修改为：
declare global {
  interface Window {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: ForgottenSanityTestHooks;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
  }
}
```

在文件顶部 import 区追加：
```ts
import type { ForgottenSanityTestHooks } from '../forgottenSanity/ForgottenSanityScene';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/tests/forgottenSanity/types/globals.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck 全局确认无破坏**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/game/scaffoldState.ts src/tests/forgottenSanity/types/globals.test.ts
git commit -m "refactor(forgotten-sanity): declare window globals for forgotten sanity (spec#5 §4.3)"
```

---

### Task 2: HubScene 补 scene:'hub' 调试标记（§4.6）

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityHubScene.ts`
- Test: `src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts`

- [ ] **Step 1: 写失败测试**

在 `forgotten-sanity-scenes.test.ts` 的 HubScene describe 中追加：
```ts
it('create 后 forgottenSanity 调试状态 scene === "hub"', () => {
  resetSceneDebugState();
  // ... 现有 HubScene create 调用 ...
  expect(getSceneDebugState().forgottenSanity?.scene).toBe('hub');
});

it('shutdown 后 forgottenSanity 调试状态 scene === "none"', () => {
  resetSceneDebugState();
  // ... create + shutdown ...
  expect(getSceneDebugState().forgottenSanity?.scene).toBe('none');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts`
Expected: FAIL — `expected undefined to be 'hub'`

- [ ] **Step 3: 修改 HubScene**

在 `ForgottenSanityHubScene.ts` 顶部追加 import：
```ts
import { getSceneDebugState } from '../game/scaffoldState';
```

在 `create()` 开头（grantStarterPackIfNeeded 之前）追加：
```ts
getSceneDebugState().forgottenSanity = { scene: 'hub' };
```

在 `events.once(SHUTDOWN, ...)` 回调内追加：
```ts
getSceneDebugState().forgottenSanity = { scene: 'none' };
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/ForgottenSanityHubScene.ts src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts
git commit -m "feat(forgotten-sanity): mark hub scene in debug state (spec#5 §4.6)"
```

---

### Task 3: Minimap 共享地图常量（§4.5）

**Files:**
- Modify: `src/forgottenSanity/ui/Minimap.ts:38-39`
- Test: `src/tests/forgottenSanity/forgotten-sanity-minimap.test.ts`（行为不变，现有测试回归即可）

- [ ] **Step 1: 修改 Minimap.ts**

删除本地常量：
```ts
// 删除这 2 行（第 38-39 行）
const MAP_WORLD_WIDTH = 5000;
const MAP_WORLD_HEIGHT = 4000;
```

在 import 区追加：
```ts
import { FORGOTTEN_SANITY_MAP_WIDTH, FORGOTTEN_SANITY_MAP_HEIGHT, GRID_COLS, CELL_WIDTH } from '../map/forgottenSanityMapState';
```

文件内所有 `MAP_WORLD_WIDTH` → `FORGOTTEN_SANITY_MAP_WIDTH`，`MAP_WORLD_HEIGHT` → `FORGOTTEN_SANITY_MAP_HEIGHT`（用 replace_all）。

若 Minimap 内部有引用 `cellCols=5` / `cellWidth=1000` 等字面量，改为 `GRID_COLS` / `CELL_WIDTH`。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 3: 回归测试**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-minimap.test.ts`
Expected: PASS（行为不变）

- [ ] **Step 4: Commit**

```bash
git add src/forgottenSanity/ui/Minimap.ts
git commit -m "refactor(forgotten-sanity): minimap shares map constants from mapState (spec#5 §4.5)"
```

---

### Task 4: defaultEnemyOpts 单源化（§4.4）

**Files:**
- Create: `src/forgottenSanity/combat/enemyDefaults.ts`
- Modify: `src/forgottenSanity/combat/CombatManager.ts:783`
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts:638`
- Test: `src/tests/forgottenSanity/combat/enemy-defaults.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/forgottenSanity/combat/enemy-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_ENEMY_OPTS } from '../../../forgottenSanity/combat/enemyDefaults';
import type { EnemyKind } from '../../../forgottenSanity/combat/Enemy';

const ALL_KINDS: EnemyKind[] = [
  'butYuxuanHead', 'qinHoruiHead', 'deskChairs', 'phone',
  'bloodHand', 'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye',
  'danYuxuanBody', 'yangYunRed', 'yangYunRedPhantom',
];

describe('DEFAULT_ENEMY_OPTS', () => {
  it('覆盖全部 11 个 EnemyKind', () => {
    for (const kind of ALL_KINDS) {
      expect(DEFAULT_ENEMY_OPTS[kind]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemy-defaults.test.ts`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 创建 enemyDefaults.ts**

读取 `CombatManager.ts:783` 的 `defaultEnemyOpts` 方法体与 `ForgottenSanityRunController.ts:638` 的 `defaultEnemyOpts` 方法体，对比取并集（两者应一致；若不一致以 CombatManager 为准并记录差异）。

新建 `src/forgottenSanity/combat/enemyDefaults.ts`：
```ts
// src/forgottenSanity/combat/enemyDefaults.ts
// 11 种缄默者默认参数表（spec#5 §4.4 单源化）。
// 原 CombatManager.defaultEnemyOpts 与 RunController.defaultEnemyOpts 双源合并于此。
import type { EnemyKind } from './Enemy';
import type { EnemyConstructorOpts } from './Enemy';

export const DEFAULT_ENEMY_OPTS: Readonly<Record<EnemyKind, Omit<EnemyConstructorOpts, 'id' | 'x' | 'y'>>> = {
  butYuxuanHead: { /* 从 CombatManager.defaultEnemyOpts 迁移 */ },
  qinHaoruiHead: { /* ... */ },
  // ... 11 个 kind 完整迁移 ...
};

/** 按 kind + 位置生成完整 opts（id/x/y 由调用方提供）。 */
export function makeEnemyOpts(
  kind: EnemyKind, id: string, x: number, y: number,
): EnemyConstructorOpts {
  return { id, x, y, ...DEFAULT_ENEMY_OPTS[kind] };
}
```

- [ ] **Step 4: 修改 CombatManager**

删除 `CombatManager.ts:783` 的 `private defaultEnemyOpts(...)` 方法，所有调用点（`:720,731,771`）改：
```ts
import { makeEnemyOpts } from './enemyDefaults';
// 原: const opts = this.defaultEnemyOpts(kind, id, pos.x, pos.y);
const opts = makeEnemyOpts(kind, id, pos.x, pos.y);
```

- [ ] **Step 5: 修改 RunController**

删除 `ForgottenSanityRunController.ts:638` 的 `private defaultEnemyOpts(...)` 方法，调用点（`:631`）改 `makeEnemyOpts`。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemy-defaults.test.ts src/tests/forgottenSanity/combat/`
Expected: PASS

- [ ] **Step 7: 源码契约验证双源已消除**

Run: `grep -rn "defaultEnemyOpts" src/forgottenSanity/ | grep -v enemyDefaults`
Expected: 0 命中（除 enemyDefaults.ts 外无残留）

- [ ] **Step 8: Commit**

```bash
git add src/forgottenSanity/combat/enemyDefaults.ts src/forgottenSanity/combat/CombatManager.ts src/forgottenSanity/ForgottenSanityRunController.ts src/tests/forgottenSanity/combat/enemy-defaults.test.ts
git commit -m "refactor(forgotten-sanity): single-source defaultEnemyOpts (spec#5 §4.4)"
```

---

### Task 5: Enemy 基类声明可选钩子（§4.2）

**Files:**
- Modify: `src/forgottenSanity/combat/Enemy.ts:203`（基类）
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（8 处 duck-typing）
- Modify: `src/forgottenSanity/combat/enemies/YangYunRed.ts`（显式实现）
- Modify: `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts`（显式实现）
- Test: `src/tests/forgottenSanity/combat/enemy-base.test.ts`

- [ ] **Step 1: 写失败测试**

在 `enemy-base.test.ts` 追加：
```ts
it('基类 Enemy 实例调用可选钩子不抛错', () => {
  // 构造一个最小 Enemy 子类实例（或用现有测试 enemy）
  const enemy = createTestEnemy();
  expect(() => enemy.enrage?.()).not.toThrow();
  expect(() => enemy.tickSummonTimer?.(16)).not.toThrow();
  expect(() => enemy.tickHeadRevive?.(16)).not.toThrow();
  expect(enemy.aggroState).toBeUndefined();
});

it('YangYunRed 实例 aggroState 初始为 neutral', () => {
  registerYangYunRed();
  const e = createEnemy('yangYunRed', makeOpts());
  expect(e.aggroState).toBe('neutral');
  expect(typeof e.enrage).toBe('function');
});

it('DanYuxuanBody 实例 tickSummonTimer 为函数', () => {
  registerDanYuxuanBody();
  const e = createEnemy('danYuxuanBody', makeOpts());
  expect(typeof e.tickSummonTimer).toBe('function');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemy-base.test.ts`
Expected: FAIL — `Property 'enrage' does not exist on type 'Enemy'`

- [ ] **Step 3: Enemy 基类声明可选钩子**

在 `Enemy.ts:203` 的 `export abstract class Enemy` 内追加（在现有字段之后）：
```ts
  // 可选钩子（spec#5 §4.2）：子类按需实现，取代 CombatManager duck-typing
  aggroState?: 'neutral' | 'hostile';
  enrage?(): void;
  tickSummonTimer?(deltaMs: number): void;
  tickHeadRevive?(deltaMs: number): void;
  onBodyDied?(): void;
  onBoundHeadDied?(head: Enemy, timeMs: number): void;
```

- [ ] **Step 4: CombatManager 移除 duck-typing**

8 处 `as unknown as { ... }` 改为直接调用可选方法。示例（`:576`）：
```ts
// 原: const elite = e as unknown as { aggroState: 'neutral' | 'hostile'; enrage: () => void };
//     if (elite.aggroState === 'neutral') elite.enrage();
// 新:
if (e.aggroState === 'neutral') e.enrage?.();
```

同理处理 `:641,646,976,1005,1042,1043,1052`。注意 `:1042-1043` onBoundHeadDied、`:1052` onBodyDied 也改为 `enemy.onBoundHeadDied?.(...)` / `body.onBodyDied?.()`。

- [ ] **Step 5: YangYunRed / DanYuxuanBody 显式实现**

在 `YangYunRed.ts` 的 class 内显式声明（覆盖基类可选）：
```ts
  declare aggroState: 'neutral' | 'hostile';
  declare enrage: () => void;
```
（`declare` 表示已有运行时实现，仅类型标注）

DanYuxuanBody 同理声明 `tickSummonTimer` / `onBodyDied` / `onBoundHeadDied` / `tickHeadRevive`。

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/`
Expected: PASS

- [ ] **Step 7: 源码契约验证 duck-typing 已消除**

Run: `grep -n "as unknown as" src/forgottenSanity/combat/CombatManager.ts`
Expected: 0 命中（或仅剩非 enemy 相关的 cast）

- [ ] **Step 8: Commit**

```bash
git add src/forgottenSanity/combat/Enemy.ts src/forgottenSanity/combat/CombatManager.ts src/forgottenSanity/combat/enemies/YangYunRed.ts src/forgottenSanity/combat/enemies/DanYuxuanBody.ts src/tests/forgottenSanity/combat/enemy-base.test.ts
git commit -m "refactor(forgotten-sanity): Enemy base declares optional hooks, remove duck-typing (spec#5 §4.2)"
```

---

### Task 6: CombatManager implements CombatPort + RunController 直传（§4.1）

**依赖**：Task 5 完成（Enemy 钩子已声明，CombatManager 已无 enemy 相关 cast）

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts:119`
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts:221-260`
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// combat-manager.test.ts 追加
import type { CombatPort } from '../../../forgottenSanity/weapons/WeaponCombatAdapter';

it('CombatManager 可赋值给 CombatPort', () => {
  const cm = new CombatManager(/* 现有测试构造 */);
  const port: CombatPort = cm;  // 编译期断言
  expect(port).toBe(cm);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL — `Type 'CombatManager' is not assignable to type 'CombatPort'`（因未 implements）

- [ ] **Step 3: CombatManager 显式 implements**

```ts
// CombatManager.ts:119
import type { CombatPort } from '../weapons/WeaponCombatAdapter';

export class CombatManager implements CombatPort {
  // 现有字段...
```

若 CombatManager 缺少 CombatPort 某方法，补齐（按现有实现，应已全部存在）。

- [ ] **Step 4: RunController 删除手写 combatPort 对象字面量**

`ForgottenSanityRunController.ts:221-260` 整段（combatPort 对象字面量）删除，改为：
```ts
// 原: const combatPort = { player: ..., getPlayerPosition: ..., ... };
// 新: 直接传 combatManager
this.weaponAdapter = new WeaponCombatAdapter(this.combatManager, this.weaponCooldowns, null);
```

同时移除 `import { DamageInstance }` 等仅为 combatPort 代理而引入的 import（若无其他用途）。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts src/tests/forgottenSanity/weapons/`
Expected: PASS

- [ ] **Step 6: typecheck 全局**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/forgottenSanity/combat/CombatManager.ts src/forgottenSanity/ForgottenSanityRunController.ts src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "refactor(forgotten-sanity): CombatManager implements CombatPort, remove hand-written proxy (spec#5 §4.1)"
```

---

## Phase 2：三大文件拆分

> **并联策略**：Task 7（RunController）、Task 8（CombatManager）、Task 9（assets）互不依赖，可派 3 个子代理并联。每个 task 完成后独立 typecheck + test。

### Task 7: ForgottenSanityRunController 拆分（§5.1）

**Files:**
- Create: `src/forgottenSanity/run/RunLifecycle.ts`
- Create: `src/forgottenSanity/run/RunInteractionHandler.ts`
- Create: `src/forgottenSanity/run/RunTestHooks.ts`
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts`（改为门面）
- Test: `src/tests/forgottenSanity/run/run-lifecycle.test.ts`（新建）
- Test: `src/tests/forgottenSanity/run/run-interaction-handler.test.ts`（新建）
- Test: `src/tests/forgottenSanity/run/run-test-hooks.test.ts`（新建）

- [ ] **Step 1: 分析现有 RunController 结构**

读取 `ForgottenSanityRunController.ts` 全文，按职责分三类：
- **Lifecycle**：构造器 14 步 + `update()` + `runEvacuation()` + `abandonRun()` + `handleEliteDefeated()` + `handleEnemyKilled()` + `handlePlayerDeath()` + `spawnInitialEnemies()` + `spawnDanYuxuanBody()` + `spawnEnemy()`
- **Interaction**：`onInteractPressed()` + `onAttackPressed()` + `onUltimatePressed()` + `handleMovement()` + `applyKnockback()` + `checkWalkable()` + note/vault/chest/exit 交互逻辑 + `dashLockState`
- **TestHooks**：11 个 `*ForTest` 方法 + `ForgottenSanityTestHooks` 实现

- [ ] **Step 2: 创建 RunLifecycle.ts**

抽取 Lifecycle 类方法到 `run/RunLifecycle.ts`。共享状态（manifest/inventory/combatManager/playerCombat/scene 等）作为构造器参数注入：
```ts
export class RunLifecycle {
  constructor(
    private readonly deps: {
      scene: ForgottenSanityScenePort;
      manifest: ForgottenSanityMapManifest;
      inventory: Inventory;
      combatManager: CombatManager;
      player: PlayerCombat;
      // ...
    },
  ) {}
  update(time: number, delta: number): void { /* 迁移 */ }
  runEvacuation(): void { /* 迁移 */ }
  abandonRun(): void { /* 迁移 */ }
  // ...
}
```

- [ ] **Step 3: 创建 RunInteractionHandler.ts**

抽取交互方法。共享状态同上注入。

- [ ] **Step 4: 创建 RunTestHooks.ts**

抽取 11 个 `*ForTest` 方法。实现 `ForgottenSanityTestHooks` 接口。

- [ ] **Step 5: 改写 ForgottenSanityRunController.ts 为门面**

```ts
export class ForgottenSanityRunController implements ForgottenSanityTestHooks {
  private readonly lifecycle: RunLifecycle;
  private readonly interaction: RunInteractionHandler;
  private readonly testHooks: RunTestHooks;

  constructor(scene: ForgottenSanityScene, seed: number) {
    // 构造器 14 步迁移到此处（初始化共享状态）
    // 然后组合三个子模块
    this.lifecycle = new RunLifecycle({ scene, manifest, inventory, ... });
    this.interaction = new RunInteractionHandler({ ... });
    this.testHooks = new RunTestHooks({ ... });
  }

  update(time, delta) { return this.lifecycle.update(time, delta); }
  onInteractPressed() { return this.interaction.onInteractPressed(); }
  // ... 门面方法委托 ...
}
```

- [ ] **Step 6: 写模块单测（先 RED）**

每个新测试文件按 spec §7.1 列出的关键路径写。示例：
```ts
// run-lifecycle.test.ts
it('构造器完成后 manifest/inventory/combatManager 非 null', () => {
  const ctrl = makeTestController();
  expect(ctrl.manifest).toBeDefined();
  expect(ctrl.inventory).toBeDefined();
  expect(ctrl.combatManager).toBeDefined();
});

it('runEvacuation 委托 scene.runEvacuationSettlement', () => {
  const spy = vi.fn();
  const ctrl = makeTestController({ runEvacuationSettlement: spy });
  ctrl.runEvacuation();
  expect(spy).toHaveBeenCalled();
});
```

- [ ] **Step 7: 运行测试，修复迁移引入的问题**

Run: `npx vitest run src/tests/forgottenSanity/run/`
Expected: 逐步 GREEN

- [ ] **Step 8: 全量回归**

Run: `npm run typecheck && npm run test:run`
Expected: 全绿

- [ ] **Step 9: Commit**

```bash
git add src/forgottenSanity/run/ src/forgottenSanity/ForgottenSanityRunController.ts src/tests/forgottenSanity/run/
git commit -m "refactor(forgotten-sanity): split RunController into Lifecycle/Interaction/TestHooks (spec#5 §5.1)"
```

---

### Task 8: CombatManager 拆分（§5.2）

**Files:**
- Create: `src/forgottenSanity/combat/EnemySystem.ts`
- Create: `src/forgottenSanity/combat/ProjectileSystem.ts`
- Create: `src/forgottenSanity/combat/ZoneSystem.ts`
- Create: `src/forgottenSanity/combat/WallHitParticleSystem.ts`
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（改为门面）
- Test: 现有 `combat-manager.test.ts` + `combat/integration.test.ts` 应不回归

- [ ] **Step 1: 分析 CombatManager 结构**

按职责分：
- **EnemySystem**：enemies 数组 + AI 调度（60Hz/4Hz）+ `applyEliteAggro` + `duplicateSilentOnes` + `handleDeadEnemies` + 接触伤害 + `playerAttack`（弱拳）
- **ProjectileSystem**：projectiles + playerProjectiles + 4px substepping + 撞墙 + `spawnWallHitFx` 调用
- **ZoneSystem**：zones + playerZones + windup-burst-dot
- **WallHitParticleSystem**：wallHitParticles + `updateWallHitParticles`

- [ ] **Step 2: 创建 WallHitParticleSystem.ts**（最独立，先抽）

```ts
export interface WallHitParticle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; }
export class WallHitParticleSystem {
  private particles: WallHitParticle[] = [];
  spawn(x: number, y: number): void { /* 迁移 spawnWallHitFx */ }
  update(deltaMs: number): void { /* 迁移 updateWallHitParticles */ }
}
```

- [ ] **Step 3: 创建 ProjectileSystem.ts**

抽取 projectiles/playerProjectiles 数组 + update 逻辑。撞墙时调用注入的 `wallHitFx.spawn(x,y)`。

- [ ] **Step 4: 创建 ZoneSystem.ts**

抽取 zones/playerZones + windup-burst-dot 逻辑。

- [ ] **Step 5: 创建 EnemySystem.ts**

抽取 enemies 数组 + AI 调度 + 接触伤害 + `applyEliteAggro` + `duplicateSilentOnes` + `handleDeadEnemies` + `playerAttack`。

- [ ] **Step 6: CombatManager 改为门面**

```ts
export class CombatManager implements CombatPort {
  private readonly enemySys: EnemySystem;
  private readonly projSys: ProjectileSystem;
  private readonly zoneSys: ZoneSystem;
  private readonly wallHitSys: WallHitParticleSystem;
  private frozen = false;

  constructor(player, callbacks, isWalkable) {
    this.wallHitSys = new WallHitParticleSystem();
    this.enemySys = new EnemySystem({ player, callbacks, isWalkable, wallHitFx: this.wallHitSys });
    this.projSys = new ProjectileSystem({ isWalkable, wallHitFx: this.wallHitSys });
    this.zoneSys = new ZoneSystem({ callbacks });
  }

  update(deltaMs: number): void {
    if (this.frozen) { this.wallHitSys.update(deltaMs); return; }
    this.enemySys.update(deltaMs);
    this.projSys.update(deltaMs);
    this.zoneSys.update(deltaMs);
    this.wallHitSys.update(deltaMs);
  }

  setFrozen(f: boolean): void { this.frozen = f; }
  // CombatPort 方法委托到对应子系统
}
```

- [ ] **Step 7: 回归测试**

Run: `npx vitest run src/tests/forgottenSanity/combat/`
Expected: 全绿（行为不变）

- [ ] **Step 8: Commit**

```bash
git add src/forgottenSanity/combat/EnemySystem.ts src/forgottenSanity/combat/ProjectileSystem.ts src/forgottenSanity/combat/ZoneSystem.ts src/forgottenSanity/combat/WallHitParticleSystem.ts src/forgottenSanity/combat/CombatManager.ts
git commit -m "refactor(forgotten-sanity): split CombatManager into Enemy/Projectile/Zone/WallHit systems (spec#5 §5.2)"
```

---

### Task 9: assets.ts 拆分（§5.3）

**Files:**
- Create: `src/data/assets/mainGameAssets.ts`
- Create: `src/data/assets/forgottenSanityAssets.ts`
- Create: `src/data/assets/index.ts`
- Modify: `src/data/assets.ts`（改为 re-export）
- Test: 现有 `src/data/assets.test.ts` 应不回归

- [ ] **Step 1: 分析 assets.ts**

读取 `src/data/assets.ts`，将 `assetManifest` 数组按素材 key 前缀分组：
- **mainGame**：`floor.*` / `prop.*` / `sprite.*`（非 forgottenSanity）/ `portrait.*` / `doors.*` / `officeFurniture.*` / 正传 UI 等
- **forgottenSanity**：`loot.*` / `note.*` / `sprite.forgottenSanity.*` / `ui.rarityFrame.*` / `ui.skillFrame` / `ui.weaponFrame` / `ui.minimapFrame` / `ui.bigmapFrame` / `ui.healthBarBg` / `ui.healthBarFill` / `ui.sanityBarBg` / `ui.sanityBarFill` / `ui.lightPillar.*` / `ui.fogOfWar` / `ui.sanityDrainVignette` / `fx.bloodEye` / `fx.lockpick.*`

- [ ] **Step 2: 创建 mainGameAssets.ts**

```ts
import type { AssetManifestEntry } from '../assetsTypes'; // 或现有类型位置
export const mainGameAssets: readonly AssetManifestEntry[] = [
  // 迁移正传条目
];
```

- [ ] **Step 3: 创建 forgottenSanityAssets.ts**

```ts
export const forgottenSanityAssets: readonly AssetManifestEntry[] = [
  // 迁移 forgotten sanity 条目
];
```

- [ ] **Step 4: 创建 index.ts**

```ts
import { mainGameAssets } from './mainGameAssets';
import { forgottenSanityAssets } from './forgottenSanityAssets';
export const assetManifest: readonly AssetManifestEntry[] = [...mainGameAssets, ...forgottenSanityAssets];
export { validateAssetManifest, allowedAssetRoots, approvedProgrammaticAssets, getMissingAssetBlockers } from './validation'; // 或从原 assets.ts 迁移这些函数
```

- [ ] **Step 5: assets.ts 改为 re-export**

```ts
// src/data/assets.ts
export * from './assets/index';
```

保持现有 import 路径 `from '../data/assets'` 不变。

- [ ] **Step 6: 回归测试**

Run: `npx vitest run src/data/assets.test.ts && npm run typecheck`
Expected: 全绿（`expectedFinalAssetPaths` 集合不变）

- [ ] **Step 7: Commit**

```bash
git add src/data/assets/ src/data/assets.ts
git commit -m "refactor(assets): split assets.ts into mainGame + forgottenSanity + index (spec#5 §5.3)"
```

---

## Phase 3：BitmapMask + 低风险打包

> **并联策略**：Task 10-14 互不依赖，可派 5 个子代理并联。Task 10（BitmapMask）需先验证 Phaser 4 API。

### Task 10: RedEdgeFogOverlay 升级 BitmapMask（§6.1）

**Files:**
- Modify: `src/forgottenSanity/ui/RedEdgeFogOverlay.ts`
- Test: `src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts`

- [ ] **Step 1: 冒烟验证 Phaser 4 BitmapMask API**

写一个临时测试确认 `scene.add.bitmapMask()` / `scene.make.image({ key })` + `setMask()` 可用。若 API 不可用，回退保留简化版并在 commit message 标注。

- [ ] **Step 2: 写失败测试（行为契约不变）**

更新 `forgotten-sanity-red-edge-fog.test.ts`：
```ts
it('activate 后 isActive true，mask 跟随玩家', () => {
  fog.activate(100, 200);
  expect(fog.isActive()).toBe(true);
  fog.update(300, 400);
  // mask 位置断言（视实现而定）
});
```

- [ ] **Step 3: 替换为 BitmapMask 实现**

```ts
// RedEdgeFogOverlay.ts
import Phaser from 'phaser'; // 注意：BitmapMask 需要 runtime import，不能只 import type

export class RedEdgeFogOverlay {
  private maskImage: Phaser.GameObjects.Image | null = null;
  private mask: Phaser.Display.Masks.BitmapMask | null = null;
  private fogOverlay: Phaser.GameObjects.Rectangle | null = null;
  // ...

  create(): void {
    // 创建一个圆形白色蒙版纹理（半径 220 的白色圆，外围透明）
    // 用 Graphics 预渲染到 texture，或用 scene.make.image
    this.fogOverlay = this.scene.add.rectangle(...)
      .setVisible(false);
    // mask 应用到 fogOverlay，使其只在圆外可见
    this.maskImage = this.scene.make.image({ x: 0, y: 0, key: '__redEdgeMask' }, false);
    this.mask = this.scene.add.bitmapMask(this.maskImage);
    this.fogOverlay.setMask(this.mask);
  }

  activate(playerX, playerY): void {
    this.redEdgeFogActive = true;
    this.fogOverlay?.setVisible(true);
    this.maskImage?.setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
    // ... 2s 文字遮罩逻辑不变
  }

  update(playerX, playerY): void {
    if (!this.redEdgeFogActive) return;
    this.maskImage?.setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts`
Expected: PASS

- [ ] **Step 5: E2E 回归（红边击杀场景）**

Run: `npx playwright test tests/e2e/forgotten-sanity-elite-defeat.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/forgottenSanity/ui/RedEdgeFogOverlay.ts src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts
git commit -m "refactor(forgotten-sanity): upgrade RedEdgeFog to BitmapMask (spec#5 §6.1)"
```

---

### Task 11: 硬编码视口尺寸引用 GAME_WIDTH/HEIGHT（§6.2）

**Files:**
- Modify: `src/forgottenSanity/weapons/WeaponCombatAdapter.ts:91-92`
- Modify: `src/forgottenSanity/ui/MobileControls.ts`
- Modify: `src/forgottenSanity/run/RunInteractionHandler.ts`（原 RunController `duplicateSilentOnes` 调用，Phase 2 后位置）

- [ ] **Step 1: WeaponCombatAdapter**

```ts
// 原: const SOUL_CAPTURE_SCREEN_RADIUS = 800;
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
const SOUL_CAPTURE_SCREEN_RADIUS = Math.ceil(Math.hypot(GAME_WIDTH, GAME_HEIGHT) / 2);
// 注释保留：1280×720 半对角线 ≈ 735，取 800 覆盖全屏 → 现为计算值
```

- [ ] **Step 2: MobileControls**

4 按钮坐标改为基于 `GAME_WIDTH - offset` / `GAME_HEIGHT - offset`：
```ts
const BTN_RADIUS = 36;
const BTN_MARGIN = 60;
// 原: (1140,460) (1200,580) (1100,660) (980,620)
// 新:
const btn1 = { x: GAME_WIDTH - 140, y: GAME_HEIGHT / 2 - 100 };
const btn2 = { x: GAME_WIDTH - 80, y: GAME_HEIGHT / 2 + 20 };
const btn3 = { x: GAME_WIDTH - 180, y: GAME_HEIGHT / 2 + 100 };
const btn4 = { x: GAME_WIDTH - 300, y: GAME_HEIGHT / 2 + 60 };
// 数值与原硬编码一致（1280-140=1140 ✓）
```

- [ ] **Step 3: duplicateSilentOnes 调用**

`RunController.ts:689`（或 Phase 2 后的 RunLifecycle）：
```ts
// 原: this.combatManager.duplicateSilentOnes({ viewportWidth: 1280, viewportHeight: 720, ... });
// 新:
import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
this.combatManager.duplicateSilentOnes({ viewportWidth: GAME_WIDTH, viewportHeight: GAME_HEIGHT, ... });
```

- [ ] **Step 4: 回归测试**

Run: `npx vitest run src/tests/forgottenSanity/weapons/ src/tests/forgottenSanity/forgotten-sanity-mobile-controls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/weapons/WeaponCombatAdapter.ts src/forgottenSanity/ui/MobileControls.ts src/forgottenSanity/run/RunLifecycle.ts
git commit -m "refactor(forgotten-sanity): viewport sizes reference GAME_WIDTH/HEIGHT (spec#5 §6.2)"
```

---

### Task 12: WeaponCombatAdapter 模块级计数器改实例字段（§6.3）

**Files:**
- Modify: `src/forgottenSanity/weapons/WeaponCombatAdapter.ts:88-89`

- [ ] **Step 1: 写失败测试**

```ts
// weapon-integration.test.ts 追加
it('两个 adapter 实例计数器独立', () => {
  const a = new WeaponCombatAdapter(combat, cd1, null);
  const b = new WeaponCombatAdapter(combat, cd2, null);
  a.performAttack({ x: 1, y: 0 }, 1000);  // 触发投射物
  // 验证 b 的内部计数器仍为 0（通过行为间接：b 发射的投射物 id 前缀不同）
});
```

- [ ] **Step 2: 修改为实例字段**

```ts
// 原（模块级）:
// let playerProjectileCounter = 0;
// let playerZoneCounter = 0;

// 新（实例字段，在 class 内）:
export class WeaponCombatAdapter {
  private playerProjectileCounter = 0;
  private playerZoneCounter = 0;
  // 构造器无需改（字段初始化即默认 0）
  // 所有引用 playerProjectileCounter → this.playerProjectileCounter
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/tests/forgottenSanity/weapons/`
Expected: PASS

- [ ] **Step 4: 源码契约验证模块级已消除**

Run: `grep -n "^let.*Counter" src/forgottenSanity/weapons/WeaponCombatAdapter.ts`
Expected: 0 命中

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/weapons/WeaponCombatAdapter.ts src/tests/forgottenSanity/weapons/weapon-integration.test.ts
git commit -m "refactor(forgotten-sanity): WeaponCombatAdapter counters as instance fields (spec#5 §6.3)"
```

---

### Task 13: createEnemy 未注册改 throw（§6.4）

**Files:**
- Modify: `src/forgottenSanity/combat/Enemy.ts:399-403`
- Modify: 调用方（CombatManager / EnemySystem Phase 2 后）移除 null 检查
- Test: `src/tests/forgottenSanity/combat/enemy-base.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('createEnemy 未注册 kind 抛错', () => {
  expect(() => createEnemy('invalidKind' as EnemyKind, makeOpts())).toThrow(/not registered/);
});
```

- [ ] **Step 2: 修改 createEnemy**

```ts
// Enemy.ts:399-403
export function createEnemy(kind: EnemyKind, opts: EnemyConstructorOpts): Enemy {
  const factory = ENEMY_FACTORY.get(kind);
  if (factory === undefined) {
    throw new Error(`Enemy kind not registered: ${kind}`);
  }
  return factory(opts);
}
```

- [ ] **Step 3: 调用方移除 null 检查**

搜索 `createEnemy(` 调用点，移除 `=== null` / `if (!enemy)` 检查（现在不可能 null）。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/tests/forgottenSanity/combat/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/combat/Enemy.ts src/tests/forgottenSanity/combat/enemy-base.test.ts
git commit -m "refactor(forgotten-sanity): createEnemy throws on unregistered kind (spec#5 §6.4)"
```

---

### Task 14: LootTable 非空断言加守卫（§6.5）

**Files:**
- Modify: `src/forgottenSanity/loot/LootTable.ts:182,195,207,209`
- Test: `src/tests/forgottenSanity/loot/loot-table.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
it('pickItem 空 fallback 抛错', () => {
  // 构造一个 allowedTypes 极窄 + rarity 无匹配的异常 entry
  // 验证抛错
});
```

- [ ] **Step 2: 提取 pickFromFallback 工具函数 + 加守卫**

```ts
// LootTable.ts
function pickFromFallback<T>(arr: readonly T[], rng: () => number): T {
  if (arr.length === 0) {
    throw new Error('LootTable fallback empty: no candidates for rarity');
  }
  return arr[Math.floor(rng() * arr.length)];
}
```

4 处 `[...]!` 改用 `pickFromFallback(arr, rng)`。

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/tests/forgottenSanity/loot/`
Expected: PASS

- [ ] **Step 4: 源码契约验证非空断言已消除**

Run: `grep -n '\]!' src/forgottenSanity/loot/LootTable.ts`
Expected: 0 命中

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/loot/LootTable.ts src/tests/forgottenSanity/loot/loot-table.test.ts
git commit -m "refactor(forgotten-sanity): LootTable empty-array guards (spec#5 §6.5)"
```

---

## Phase 4：测试补全 + 文档同步

### Task 15: RunController 模块单测补全（§7.1）

**依赖**：Task 7（RunController 拆分）完成

**Files:**
- Test: `src/tests/forgottenSanity/run/run-lifecycle.test.ts`（补充）
- Test: `src/tests/forgottenSanity/run/run-interaction-handler.test.ts`（补充）
- Test: `src/tests/forgottenSanity/run/run-test-hooks.test.ts`（补充）

- [ ] **Step 1: RunLifecycle 补全**

按 spec §7.1 列出路径逐个写测试：
- 构造器完成后字段非空
- `update()` 调用 combatManager.update + minimap.update + hud.update
- `runEvacuation()` 委托 scene.runEvacuationSettlement
- `abandonRun()` 委托 scene.runDeathSettlement
- `handleEliteDefeated()` 调用 rollLootTable + inventory.add vaultKey + triggerRedEdgeKill + duplicateSilentOnes

目标：每个路径至少 1 个测试，共 8-12 个。

- [ ] **Step 2: RunInteractionHandler 补全**

- `onInteractPressed` 优先级（note → vault → chest → exit）
- vault door 持钥匙解锁
- chest 触发破译
- exit sanity 达标撤离

- [ ] **Step 3: RunTestHooks 补全**

- 各 `*ForTest` 方法不抛错
- `getInventorySummary` / `getVaultState` / `getCombatSummary` 返回结构正确

- [ ] **Step 4: 运行全部新测试**

Run: `npx vitest run src/tests/forgottenSanity/run/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tests/forgottenSanity/run/
git commit -m "test(forgotten-sanity): RunController module unit tests (spec#5 §7.1)"
```

---

### Task 16: 文档同步（§7.2）

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`（§7.3 标注音频）
- Modify: `docs/superpowers/specs/2026-07-18-forgotten-sanity-spec-compliance-fix-design.md`（§9 标注 A-J 关闭）

- [ ] **Step 1: spec#1 §7.3 标注音频未规划**

在 spec#1 §7.3 音效相关段落末尾追加：
```
> **2026-07-23 标注（spec#5）**：音效未规划，待音频管线就绪后单独 spec。
```

- [ ] **Step 2: spec#2 §9 标注 A-J 关闭**

在 spec#2 §9「结构性偏差 A-J：单独 spec」后追加：
```
> **2026-07-23 关闭（spec#5）**：结构性偏差 A-J 由 `2026-07-23-forgotten-sanity-structural-debt-closure-design.md`（spec#5）关闭。
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md docs/superpowers/specs/2026-07-18-forgotten-sanity-spec-compliance-fix-design.md
git commit -m "docs(spec): mark A-J closed by spec#5, audio unplanned (spec#5 §7.2)"
```

---

### Task 17: 最终验证（§7.3）

- [ ] **Step 1: typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 2: 单元测试全量**

Run: `npm run test:run`
Expected: 全绿（含新增 RunController 模块单测）

- [ ] **Step 3: E2E 全量**

Run: `npm run e2e`
Expected: 全绿（5 个 forgotten-sanity-*.spec.ts 不回归）

- [ ] **Step 4: verify 脚本**

Run: `npm run verify`
Expected: 全绿

- [ ] **Step 5: 重跑审核**

重新执行 2026-07-23 完整审核流程（spec/plan/代码/测试 四维扫描），确认：
- P0 项（window 全局 / 素材隔离 / A-J）已关闭
- P1 项（三大文件 / RunController 测试 / defaultEnemyOpts）已关闭
- 无新引入的 P0/P1

- [ ] **Step 6: 最终 Commit（如有审核修正）**

```bash
git add -A
git commit -m "chore(forgotten-sanity): spec#5 final verification (spec#5 §7.3)"
```

---

## Self-Review

### Spec 覆盖
- §4.1 CombatPort → Task 6 ✓
- §4.2 Enemy 钩子 → Task 5 ✓
- §4.3 window global → Task 1 ✓
- §4.4 enemyDefaults → Task 4 ✓
- §4.5 Minimap 常量 → Task 3 ✓
- §4.6 HubScene 调试 → Task 2 ✓
- §5.1 RunController 拆分 → Task 7 ✓
- §5.2 CombatManager 拆分 → Task 8 ✓
- §5.3 assets 拆分 → Task 9 ✓
- §6.1 BitmapMask → Task 10 ✓
- §6.2 视口硬编码 → Task 11 ✓
- §6.3 模块级计数器 → Task 12 ✓
- §6.4 createEnemy throw → Task 13 ✓
- §6.5 LootTable 守卫 → Task 14 ✓
- §7.1 RunController 单测 → Task 15 ✓
- §7.2 文档同步 → Task 16 ✓
- §7.3 验证门槛 → Task 17 ✓

### 类型一致性
- `CombatPort` 接口定义在 `WeaponCombatAdapter.ts:29-57`，Task 6 引用一致
- `EnemyKind` 11 变体定义在 `Enemy.ts:52-63`，Task 4/5/13 引用一致
- `DEFAULT_ENEMY_OPTS` 在 Task 4 定义，后续无引用冲突
- `makeEnemyOpts` 函数名 Task 4 定义，CombatManager/RunController 调用一致

### 依赖顺序
- Task 5（Enemy 钩子）必须先于 Task 6（CombatManager implements）—— Task 6 依赖 Task 5 移除 enemy cast
- Task 7/8/9 可并联（互不依赖）
- Task 11 引用 `run/RunLifecycle.ts`，依赖 Task 7 完成
- Task 15 依赖 Task 7
- 其余 Phase 3 task（10/12/13/14）独立

### 风险
- Task 10 BitmapMask 需先验证 Phaser 4 API 可用性
- Task 7/8 拆分可能引入回归，需 E2E 保护
- Task 9 assets 拆分需确保 `expectedFinalAssetPaths` 集合不变
