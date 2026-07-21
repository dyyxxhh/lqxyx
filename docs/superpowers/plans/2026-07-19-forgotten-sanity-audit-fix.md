# 被遗忘的理智 — 审核修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 forgottenSanity 模块审核报告识别的 25 项问题（spec#2 收尾 + 高风险盲区 + 中风险盲区 + spec 文档同步），达成 spec#2 §8 自验收门槛（31 E2E specs 全部通过）。

**Architecture:** 4 阶段顺序实施：基础设施 → spec#2 收尾 → 中风险 → E2E + 文档同步。TDD 强制（RED→GREEN→SURFACE），零侵入剧情模式。

**Tech Stack:** TypeScript strict + Phaser 4 + Vitest + Playwright + localStorage

**对照 spec**：`docs/superpowers/specs/2026-07-19-forgotten-sanity-audit-fix-design.md`

---

## File Structure

### 新增文件
- `src/forgottenSanity/combat/WallHitRenderer.ts` — 撞墙粒子渲染
- `src/forgottenSanity/ui/PauseMenu.ts` — ESC 暂停菜单 UI
- `tests/e2e/forgotten-sanity-fog-of-war.spec.ts` — 雾战 E2E
- `src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts` — H4/H2/M9 测试
- `src/tests/forgottenSanity/combat/player-combat.test.ts` — 无敌期 debuff 测试
- `src/tests/forgottenSanity/combat/damage-type.test.ts` — burn 累加测试
- `src/tests/forgottenSanity/forgotten-sanity-scene.test.ts` — ESC 暂停菜单测试
- `src/tests/forgottenSanity/meta/shop-manager.test.ts` — vaultKey 不可售卖测试
- `src/tests/forgottenSanity/combat/enemies/state-machine.test.ts` — 三态机转换矩阵测试

### 修改文件
- `src/game/scaffoldState.ts` — SceneDebugState 扩展
- `src/forgottenSanity/ForgottenSanityScene.ts` — 钩子 + 暂停菜单
- `src/forgottenSanity/ForgottenSanityRunController.ts` — abandonRun + handleEliteDefeated frozen
- `src/forgottenSanity/combat/CombatManager.ts` — setFrozen + spawnWallHitFx + currentRoomId + farRoomAccumMs 清理
- `src/forgottenSanity/combat/Enemy.ts` — burn 累加
- `src/forgottenSanity/combat/PlayerCombat.ts` — 无敌期 debuff
- `src/forgottenSanity/combat/EnemyViewRenderer.ts` — WallHitRenderer 集成
- `src/forgottenSanity/combat/enemies/YangYunRed.ts` — cdMultiplier
- `src/forgottenSanity/loot/LootTable.ts` — itemCount + rollIndependent
- `src/forgottenSanity/loot/LootItem.ts` — sellable 字段
- `src/forgottenSanity/loot/Inventory.ts` — vaultKey 不可售卖检查
- `src/forgottenSanity/loot/chestDecryptState.ts` — forceOpen
- `src/forgottenSanity/loot/ChestDecrypt.ts` — 红闪 + forceOpen 调用
- `src/forgottenSanity/meta/ShopManager.ts` — canSell + unsellable
- `src/forgottenSanity/state/forgottenSanityState.ts` — 校验 + 迁移 + 原子性
- `src/forgottenSanity/ui/Minimap.ts` — 大地图过滤
- `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` — fistDash hitSet
- `src/forgottenSanity/weapons/WeaponRegistry.ts` — soulCapture excludeKinds
- `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` — spec 同步

---

## Phase 1：基础设施（4 tasks）

### Task 1: SceneDebugState 扩展 + ForgottenSanityScene Debug 钩子

**Files:**
- Modify: `src/game/scaffoldState.ts`
- Modify: `src/forgottenSanity/ForgottenSanityScene.ts`
- Test: `src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`

- [ ] **Step 1: 写失败测试 — SceneDebugState 扩展**

```typescript
// src/tests/forgottenSanity/forgotten-sanity-scene.test.ts
import { describe, it, expect } from 'vitest';
import type { SceneDebugState } from '../../game/scaffoldState';

describe('SceneDebugState forgottenSanity', () => {
  it('accepts forgottenSanity sub-state with all fields', () => {
    const state: SceneDebugState = {
      currentScene: 'ForgottenSanityScene',
      ready: true,
      forgottenSanity: {
        scene: 'run',
        inventory: { items: { 'material.vaultKey': 1 }, vaultKey: 1 },
        combat: { enemyCount: 5, duplicateCount: 2, farRoomCount: 1, playerRoomId: 'room-0' },
        exploredCells: [0, 1, 5],
        vaultDoorUnlocked: false,
        vaultChestsOpened: 0,
        paused: false,
      },
    };
    expect(state.forgottenSanity?.scene).toBe('run');
    expect(state.forgottenSanity?.combat?.duplicateCount).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: FAIL with type error "forgottenSanity does not exist on type SceneDebugState"

- [ ] **Step 3: 实现 — 扩展 SceneDebugState**

```typescript
// src/game/scaffoldState.ts — 在 SceneDebugState 接口末尾追加
export interface ForgottenSanityDebugState {
  scene: 'hub' | 'run' | 'none';
  inventory?: { items: Record<string, number>; vaultKey: number };
  combat?: {
    enemyCount: number;
    duplicateCount: number;
    farRoomCount: number;
    playerRoomId: string | null;
  };
  exploredCells?: number[];
  vaultDoorUnlocked?: boolean;
  vaultChestsOpened?: number;
  paused?: boolean;
}

export interface SceneDebugState {
  // ... 现有字段保持不变 ...
  forgottenSanity?: ForgottenSanityDebugState;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试 — ForgottenSanityScene 钩子**

```typescript
// src/tests/forgottenSanity/forgotten-sanity-scene.test.ts 追加
import { describe, it, expect, vi } from 'vitest';

describe('ForgottenSanityScene test hooks', () => {
  it('exposes __test* hooks on window in test env', () => {
    const hooks = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: unknown }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
    expect(hooks).toBeDefined();
    expect(typeof (hooks as { __testGetInventorySummary?: () => unknown }).__testGetInventorySummary).toBe('function');
    expect(typeof (hooks as { __testTriggerEliteDefeat?: () => void }).__testTriggerEliteDefeat).toBe('function');
    expect(typeof (hooks as { __testTogglePause?: () => void }).__testTogglePause).toBe('function');
  });
});
```

- [ ] **Step 6: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: FAIL with "hooks is undefined"

- [ ] **Step 7: 实现 — ForgottenSanityScene 暴露钩子**

```typescript
// src/forgottenSanity/ForgottenSanityScene.ts — 在 create() 方法末尾追加
export interface ForgottenSanityTestHooks {
  __testTriggerEliteDefeat(): void;
  __testGiveVaultKey(): void;
  __testMovePlayerToVaultDoor(): void;
  __testSpawnChest(roomId: string, isVaultChest: boolean): void;
  __testGetInventorySummary(): { items: Record<string, number>; vaultKey: number };
  __testGetCombatSummary(): { enemyCount: number; duplicateCount: number; farRoomCount: number };
  __testGetVaultState(): { doorUnlocked: boolean; chestsOpened: number };
  __testGetExploredCells(): number[];
  __testMovePlayerTo(roomId: string): void;
  __testTogglePause(): void;
}

// 在 create() 方法末尾：
if (import.meta.env.DEV || process.env.NODE_ENV === 'test') {
  const hooks: ForgottenSanityTestHooks = {
    __testTriggerEliteDefeat: () => this.runController?.handleEliteDefeated(),
    __testGiveVaultKey: () => this.runController?.giveVaultKeyForTest(),
    __testMovePlayerToVaultDoor: () => this.runController?.movePlayerToVaultDoorForTest(),
    __testSpawnChest: (roomId, isVaultChest) => this.runController?.spawnChestForTest(roomId, isVaultChest),
    __testGetInventorySummary: () => this.runController?.getInventorySummaryForTest() ?? { items: {}, vaultKey: 0 },
    __testGetCombatSummary: () => this.runController?.getCombatSummaryForTest() ?? { enemyCount: 0, duplicateCount: 0, farRoomCount: 0 },
    __testGetVaultState: () => this.runController?.getVaultStateForTest() ?? { doorUnlocked: false, chestsOpened: 0 },
    __testGetExploredCells: () => this.runController?.getExploredCellsForTest() ?? [],
    __testMovePlayerTo: (roomId) => this.runController?.movePlayerToForTest(roomId),
    __testTogglePause: () => this.togglePause(),
  };
  (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: unknown }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ = hooks;
}
```

注：`runController` 需暴露 `*ForTest` 公开方法（后续 task 实现）。当前先暴露钩子壳，`*ForTest` 方法返回占位值即可。`handleEliteDefeated` 若当前为 private，Task 1 中先临时改为 public（Task 23 会正式实现完整 `*ForTest` 方法）。

- [ ] **Step 8: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add src/game/scaffoldState.ts src/forgottenSanity/ForgottenSanityScene.ts src/tests/forgottenSanity/forgotten-sanity-scene.test.ts
git commit -m "feat(forgottenSanity): SceneDebugState forgottenSanity + test hooks"
```

---

### Task 2: H4 localStorage 数值范围校验（拒绝+重置）

**Files:**
- Modify: `src/forgottenSanity/state/forgottenSanityState.ts:68-90`
- Test: `src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — isStashState 拒绝负数/小数**

```typescript
// src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts
import { describe, it, expect } from 'vitest';
import { isStashState, isUpgradesState } from '../../../forgottenSanity/state/forgottenSanityState';

describe('H4: localStorage 数值范围校验', () => {
  it('rejects negative quantity', () => {
    expect(isStashState({ schemaVersion: 1, items: [{ itemId: 'x', quantity: -1 }] })).toBe(false);
  });
  it('rejects non-integer quantity', () => {
    expect(isStashState({ schemaVersion: 1, items: [{ itemId: 'x', quantity: 1.5 }] })).toBe(false);
  });
  it('accepts valid quantity 0 and positive integer', () => {
    expect(isStashState({ schemaVersion: 1, items: [{ itemId: 'x', quantity: 0 }] })).toBe(true);
    expect(isStashState({ schemaVersion: 1, items: [{ itemId: 'x', quantity: 100 }] })).toBe(true);
  });
  it('rejects upgrades tier out of range', () => {
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: 999 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: 6 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: -1 } })).toBe(false);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { armory: 4 } })).toBe(false); // max 3
  });
  it('accepts valid upgrades tiers', () => {
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: 0 } })).toBe(true);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { physique: 5 } })).toBe(true);
    expect(isUpgradesState({ schemaVersion: 1, tiers: { armory: 3 } })).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: FAIL（当前 isStashState 不检查 quantity 范围）

- [ ] **Step 3: 实现 — isStashState + isUpgradesState 增加范围校验**

```typescript
// src/forgottenSanity/state/forgottenSanityState.ts — 替换 isStashState 和 isUpgradesState
export function isStashState(s: unknown): s is ForgottenSanityStashState {
  if (typeof s !== 'object' || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return false;
  if (!Array.isArray(obj.items)) return false;
  for (const item of obj.items) {
    if (typeof item !== 'object' || item === null) return false;
    const it = item as Record<string, unknown>;
    if (typeof it.itemId !== 'string') return false;
    if (typeof it.quantity !== 'number' || !Number.isFinite(it.quantity)) return false;
    if (it.quantity < 0) return false;
    if (!Number.isInteger(it.quantity)) return false;
  }
  return true;
}

export function isUpgradesState(s: unknown): s is ForgottenSanityUpgradesState {
  if (typeof s !== 'object' || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return false;
  if (typeof obj.tiers !== 'object' || obj.tiers === null) return false;
  const tiers = obj.tiers as Record<string, unknown>;
  const validIds: ForgottenSanityUpgradeId[] = ['physique','swift','pickup','sharp','lucky','armory'];
  for (const id of validIds) {
    const v = tiers[id];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (!Number.isInteger(v)) return false;
    const max = id === 'armory' ? 3 : 5;
    if (v < 0 || v > max) return false;
  }
  return true;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试 — loadStashState 非法值返回 fallback**

```typescript
// src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts 追加
import { loadStashState, loadUpgradesState } from '../../../forgottenSanity/state/forgottenSanityState';

describe('H4: loadStashState fallback on invalid', () => {
  it('returns fallback when stash has negative quantity', () => {
    const fakeStorage = {
      getItem: (key: string) => key === 'ying-zhong-jiu.forgotten-sanity.stash.v1'
        ? JSON.stringify({ schemaVersion: 1, items: [{ itemId: 'x', quantity: -100 }] })
        : null,
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
    const result = loadStashState();
    expect(result.status).toBe('invalid');
    expect(result.state.items).toEqual([]);
    vi.unstubAllGlobals();
  });
  it('returns fallback when upgrades tier is 999', () => {
    const fakeStorage = {
      getItem: (key: string) => key === 'ying-zhong-jiu.forgotten-sanity.upgrades.v1'
        ? JSON.stringify({ schemaVersion: 1, tiers: { physique: 999 } })
        : null,
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
    const result = loadUpgradesState();
    expect(result.status).toBe('invalid');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 6: 运行测试验证通过（应已自动通过，因 loadTyped 已在 validate 失败时返回 fallback）**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/forgottenSanity/state/forgottenSanityState.ts src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts
git commit -m "feat(forgottenSanity): H4 localStorage numeric range validation (reject+reset)"
```

---

### Task 3: H2 schemaVersion 迁移框架

**Files:**
- Modify: `src/forgottenSanity/state/forgottenSanityState.ts:111-113`（loadTyped 函数）
- Test: `src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`（扩展）

- [ ] **Step 1: 写失败测试 — migrate 框架**

```typescript
// src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts 追加
import { loadTyped } from '../../../forgottenSanity/state/forgottenSanityState';

describe('H2: schemaVersion migration framework', () => {
  it('returns version-mismatch when no migration provided', () => {
    const fakeStorage = {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
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
    const fakeStorage = {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
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
    const fakeStorage = {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
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
    const fakeStorage = {
      getItem: () => JSON.stringify({ schemaVersion: 0, items: [] }),
      setItem: () => {},
    };
    vi.stubGlobal('localStorage', fakeStorage);
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
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: FAIL（loadTyped 无 migrations 参数）

- [ ] **Step 3: 实现 — loadTyped 增加 migrations 参数**

```typescript
// src/forgottenSanity/state/forgottenSanityState.ts — 修改 loadTyped
type MigrationFn<S> = (state: unknown) => S;
const NO_MIGRATIONS = new Map<number, MigrationFn<unknown>>();

export function loadTyped<S>(
  key: string,
  currentVersion: number,
  validate: (s: unknown) => s is S,
  fallback: () => S,
  migrations: Map<number, MigrationFn<S>> = NO_MIGRATIONS as Map<number, MigrationFn<S>>,
): LoadResult<S> {
  const raw = storage.getItem(key);
  if (raw === null) return { status: 'ok', state: fallback() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'parse-error', state: fallback() };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== currentVersion) {
    const migrate = migrations.get(obj.schemaVersion as number);
    if (!migrate) {
      return { status: 'invalid', reason: 'version-mismatch', state: fallback() };
    }
    let migrated: S;
    try {
      migrated = migrate(parsed);
    } catch {
      return { status: 'invalid', reason: 'migration-failed', state: fallback() };
    }
    if (!validate(migrated)) {
      return { status: 'invalid', reason: 'migration-failed', state: fallback() };
    }
    return { status: 'ok', state: migrated };
  }
  if (!validate(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  return { status: 'ok', state: parsed };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/state/forgottenSanityState.ts src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts
git commit -m "feat(forgottenSanity): H2 schemaVersion migration framework"
```

---

### Task 4: M9 localStorage 原子性（多 key 事务+回滚）

**Files:**
- Modify: `src/forgottenSanity/state/forgottenSanityState.ts`
- Test: `src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`（扩展）

- [ ] **Step 1: 写失败测试 — atomicSaveMulti**

```typescript
// src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts 追加
import { atomicSaveMulti } from '../../../forgottenSanity/state/forgottenSanityState';

describe('M9: atomicSaveMulti', () => {
  it('writes all entries and returns true on success', () => {
    const store: Record<string, string> = { 'key.a': 'old-a', 'key.b': 'old-b' };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    const ok = atomicSaveMulti([
      { key: 'key.a', value: 'new-a', oldValue: null },
      { key: 'key.b', value: 'new-b', oldValue: null },
    ]);
    expect(ok).toBe(true);
    expect(store['key.a']).toBe('new-a');
    expect(store['key.b']).toBe('new-b');
    vi.unstubAllGlobals();
  });

  it('rolls back all entries when second setItem throws', () => {
    const store: Record<string, string> = { 'key.a': 'old-a', 'key.b': 'old-b' };
    let callCount = 0;
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        callCount++;
        if (callCount === 2) throw new Error('QuotaExceededError');
        store[k] = v;
      },
      removeItem: (k: string) => { delete store[k]; },
    });
    const ok = atomicSaveMulti([
      { key: 'key.a', value: 'new-a', oldValue: null },
      { key: 'key.b', value: 'new-b', oldValue: null },
    ]);
    expect(ok).toBe(false);
    expect(store['key.a']).toBe('old-a'); // 回滚
    expect(store['key.b']).toBe('old-b');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: FAIL（atomicSaveMulti 未导出）

- [ ] **Step 3: 实现 — atomicSaveMulti**

```typescript
// src/forgottenSanity/state/forgottenSanityState.ts — 新增导出函数
export function atomicSaveMulti(
  entries: Array<{ key: string; value: string }>,
): boolean {
  const saved: Array<{ key: string; value: string | null }> = [];
  try {
    for (const e of entries) {
      saved.push({ key: e.key, value: storage.getItem(e.key) });
      storage.setItem(e.key, e.value);
    }
    return true;
  } catch {
    for (const s of saved) {
      try {
        if (s.value === null) storage.removeItem(s.key);
        else storage.setItem(s.key, s.value);
      } catch {
        // 回滚失败只能记录，不再抛
        console.error(`[forgottenSanity] atomicSaveMulti rollback failed for key ${s.key}`);
      }
    }
    return false;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: PASS

- [ ] **Step 5: 修改 grantStarterPackIfNeeded 使用 atomicSaveMulti**

```typescript
// src/forgottenSanity/state/forgottenSanityState.ts — grantStarterPackIfNeeded
export function grantStarterPackIfNeeded(): boolean {
  const progress = loadProgressState();
  if (progress.state.starterPackGranted) return true;

  const stash = loadStashState().state;
  const newStash: ForgottenSanityStashState = {
    ...stash,
    items: [
      ...stash.items,
      { itemId: 'weapon.ruler', quantity: 1 },
      { itemId: 'consumable.celery', quantity: 3 },
    ],
  };
  const newProgress: ForgottenSanityProgressState = {
    ...progress.state,
    starterPackGranted: true,
  };

  const ok = atomicSaveMulti([
    { key: STASH_KEY, value: JSON.stringify(newStash) },
    { key: PROGRESS_KEY, value: JSON.stringify(newProgress) },
  ]);
  return ok;
}
```

- [ ] **Step 6: 写测试 — grantStarterPackIfNeeded 失败回滚不重复发放**

```typescript
// src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts 追加
import { grantStarterPackIfNeeded, STASH_KEY, PROGRESS_KEY } from '../../../forgottenSanity/state/forgottenSanityState';

describe('M9: grantStarterPackIfNeeded atomicity', () => {
  it('returns false and does not mark starterPackGranted when atomic save fails', () => {
    const store: Record<string, string> = {
      [STASH_KEY]: JSON.stringify({ schemaVersion: 1, items: [] }),
      [PROGRESS_KEY]: JSON.stringify({ schemaVersion: 1, starterPackGranted: false }),
    };
    let callCount = 0;
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        callCount++;
        if (callCount === 2) throw new Error('QuotaExceededError');
        store[k] = v;
      },
      removeItem: (k: string) => { delete store[k]; },
    });
    const ok = grantStarterPackIfNeeded();
    expect(ok).toBe(false);
    // stash 回滚到空，progress 仍是 starterPackGranted=false
    const progress = JSON.parse(store[PROGRESS_KEY]);
    expect(progress.starterPackGranted).toBe(false);
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 7: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/forgottenSanity/state/forgottenSanityState.ts src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts
git commit -m "feat(forgottenSanity): M9 atomicSaveMulti multi-key transaction with rollback"
```

---

## Phase 2：spec#2 收尾（6 tasks）

### Task 5: #3 fistDash hitSet 去重

**Files:**
- Modify: `src/forgottenSanity/weapons/WeaponCombatAdapter.ts:257-273`
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（damageEnemiesInCircle 增加 excludeIds 参数）
- Test: `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`

- [ ] **Step 1: 写失败测试 — fistDash 同敌去重**

```typescript
// src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts 追加
import { describe, it, expect, vi } from 'vitest';

describe('#3 fistDash hitSet dedup', () => {
  it('path and end hit same enemy → total 40 damage (not 80)', () => {
    // 模拟 enemyA 同时在路径扇形和末端圆形内
    const adapter = createAdapterWithMockedCombat();
    const enemyA = { id: 'e-A', x: 100, y: 100, hp: 1000, dead: false };
    adapter.mockEnemies([enemyA]);
    adapter.ultFistDash({ x: 0, y: 0 }, { x: 200, y: 0 }, 0);
    expect(enemyA.hp).toBe(960); // 1000 - 40
  });

  it('path hits enemyA + end hits enemyB → A:40, B:40', () => {
    const adapter = createAdapterWithMockedCombat();
    const enemyA = { id: 'e-A', x: 100, y: 0, hp: 1000, dead: false };
    const enemyB = { id: 'e-B', x: 250, y: 0, hp: 1000, dead: false };
    adapter.mockEnemies([enemyA, enemyB]);
    adapter.ultFistDash({ x: 0, y: 0 }, { x: 200, y: 0 }, 0);
    expect(enemyA.hp).toBe(960);
    expect(enemyB.hp).toBe(960);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: FAIL（当前路径+末端同敌 = 80 伤）

- [ ] **Step 3: 实现 — damageEnemiesInCircle 增加 excludeIds**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — 修改 damageEnemiesInCircle 签名
damageEnemiesInCircle(
  x: number, y: number, radius: number,
  damage: number,
  options?: { excludeIds?: Set<string>; source?: string },
): string[] {
  const hitIds: string[] = [];
  for (const enemy of this.enemies) {
    if (enemy.dead) continue;
    if (options?.excludeIds?.has(enemy.id)) continue;
    const dx = enemy.x - x;
    const dy = enemy.y - y;
    if (dx * dx + dy * dy <= radius * radius) {
      enemy.takeDamage({ amount: damage, type: 'physical', category: 'aoe', source: options?.source });
      hitIds.push(enemy.id);
    }
  }
  return hitIds;
}
```

- [ ] **Step 4: 实现 — ultFistDash 使用 hitSet**

```typescript
// src/forgottenSanity/weapons/WeaponCombatAdapter.ts:257-273 — 重写 ultFistDash
private ultFistDash(origin: Vec2, target: Vec2, timeMs: number): void {
  const ult = this.currentWeapon.ultimate;
  if (this.cooldowns.isOnCooldown('ultimate', timeMs)) return;
  this.cooldowns.trigger('ultimate', ult.cooldownMs, timeMs);

  // 无敌期
  this.playerCombat.setInvincible(ult.invincibleMs ?? 0);

  // 路径命中
  const hitSet = new Set<string>();
  const pathTarget = this.damageClosestEnemyInFan(
    origin.x, origin.y,
    Math.atan2(target.y - origin.y, target.x - origin.x),
    Math.PI / 8, // 半角
    250, // 范围
    40,  // 伤害
  );
  if (pathTarget) hitSet.add(pathTarget);

  // 末端命中（排除路径已命中）
  this.damageEnemiesInCircle(target.x, target.y, 60, 40, {
    excludeIds: hitSet,
    source: 'fistDash',
  });
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/forgottenSanity/weapons/WeaponCombatAdapter.ts src/forgottenSanity/combat/CombatManager.ts src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts
git commit -m "fix(forgottenSanity): #3 fistDash hitSet dedup path+end same enemy"
```

---

### Task 6: #4 敌侧墙检测 + spawnWallHitFx

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts:688-732`
- Create: `src/forgottenSanity/combat/WallHitRenderer.ts`
- Modify: `src/forgottenSanity/combat/EnemyViewRenderer.ts`
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 写失败测试 — 敌侧投射物撞墙停止**

```typescript
// src/tests/forgottenSanity/combat/combat-manager.test.ts 追加
describe('#4 enemy projectile wall collision', () => {
  it('stops enemy projectile on wall hit', () => {
    const cm = createCombatManagerWithWalls({
      // 墙在 x=100
      walkable: (x: number) => x < 100,
    });
    const enemyProj = { id: 'p1', x: 50, y: 50, vx: 200, vy: 0, damage: 10, dead: false };
    cm.spawnEnemyProjectile(enemyProj);
    cm.updateProjectiles(16); // 16ms → 推进 200*0.016=3.2px → x=53.2
    cm.updateProjectiles(16 * 20); // 推进到 x≈116 → 撞墙
    const remaining = cm.getEnemyProjectiles();
    expect(remaining.length).toBe(0); // 撞墙移除
  });

  it('spawns 3 wall hit particles on wall collision', () => {
    const cm = createCombatManagerWithWalls({ walkable: (x: number) => x < 100 });
    cm.spawnEnemyProjectile({ id: 'p1', x: 50, y: 50, vx: 200, vy: 0, damage: 10, dead: false });
    cm.updateProjectiles(16 * 20);
    const particles = cm.getWallHitParticles();
    expect(particles.length).toBe(3);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL（敌侧 updateProjectiles 未检测墙）

- [ ] **Step 3: 实现 — 敌侧 updateProjectiles 补墙检测**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — updateProjectiles (敌侧)
private updateProjectiles(deltaMs: number): void {
  const dead: number[] = [];
  for (let i = 0; i < this.projectiles.length; i++) {
    const p = this.projectiles[i]!;
    const steps = Math.max(1, Math.ceil((Math.abs(p.vx) + Math.abs(p.vy)) * deltaMs / 1000 / 4));
    const stepDt = deltaMs / steps;
    let removed = false;
    for (let s = 0; s < steps; s++) {
      const nx = p.x + p.vx * stepDt / 1000;
      const ny = p.y + p.vy * stepDt / 1000;
      if (!this.isWalkable(nx, ny)) {
        this.spawnWallHitFx(p.x, p.y);
        dead.push(i);
        removed = true;
        break;
      }
      p.x = nx;
      p.y = ny;
      // 玩家碰撞检测（保留现有逻辑）
      if (this.playerCombat.hitTest(p.x, p.y, p.radius)) {
        this.playerCombat.takeDamage({ amount: p.damage, type: p.damageType, category: 'aoe', source: 'enemyProjectile' });
        dead.push(i);
        removed = true;
        break;
      }
    }
    if (!removed) {
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) dead.push(i);
    }
  }
  for (let i = dead.length - 1; i >= 0; i--) {
    this.projectiles.splice(dead[i]!, 1);
  }
}
```

- [ ] **Step 4: 实现 — spawnWallHitFx + wallHitParticles**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — 新增
interface WallHitParticle {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  maxLifeMs: number;
  color: number;
}

export class CombatManager {
  // ... 现有字段 ...
  private wallHitParticles: WallHitParticle[] = [];

  spawnWallHitFx(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const angle = this.rng.float(0, Math.PI * 2);
      this.wallHitParticles.push({
        x, y,
        vx: Math.cos(angle) * 50,
        vy: Math.sin(angle) * 50,
        lifeMs: 200,
        maxLifeMs: 200,
        color: 0xffffff,
      });
    }
  }

  getWallHitParticles(): readonly WallHitParticle[] {
    return this.wallHitParticles;
  }

  private updateWallHitParticles(deltaMs: number): void {
    for (let i = this.wallHitParticles.length - 1; i >= 0; i--) {
      const p = this.wallHitParticles[i]!;
      p.x += p.vx * deltaMs / 1000;
      p.y += p.vy * deltaMs / 1000;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) this.wallHitParticles.splice(i, 1);
    }
  }
}
```

在 `update()` 方法中调用 `this.updateWallHitParticles(deltaMs);`（在 frozen 检查之后、双路更新之前）。

- [ ] **Step 5: 实现 — WallHitRenderer**

```typescript
// src/forgottenSanity/combat/WallHitRenderer.ts — 新建
import Phaser from 'phaser';

export class WallHitRenderer {
  private particles: Phaser.GameObjects.Rectangle[] = [];

  constructor(private scene: Phaser.Scene) {}

  sync(wallHitParticles: ReadonlyArray<{ x: number; y: number; lifeMs: number; maxLifeMs: number; color: number }>): void {
    // 销毁多余
    while (this.particles.length > wallHitParticles.length) {
      this.particles.pop()?.destroy();
    }
    // 创建不足
    while (this.particles.length < wallHitParticles.length) {
      const rect = this.scene.add.rectangle(0, 0, 2, 2, 0xffffff);
      rect.setDepth(9);
      this.particles.push(rect);
    }
    // 同步位置
    for (let i = 0; i < wallHitParticles.length; i++) {
      const p = wallHitParticles[i]!;
      const r = this.particles[i]!;
      r.setPosition(p.x, p.y);
      r.setFillStyle(p.color, p.lifeMs / p.maxLifeMs);
    }
  }

  destroy(): void {
    for (const p of this.particles) p.destroy();
    this.particles = [];
  }
}
```

- [ ] **Step 6: 集成 WallHitRenderer 到 EnemyViewRenderer 或 ForgottenSanityScene**

在 `ForgottenSanityScene` 中创建 `wallHitRenderer = new WallHitRenderer(this)`，在 `update()` 中调用 `wallHitRenderer.sync(combatManager.getWallHitParticles())`。

- [ ] **Step 7: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/forgottenSanity/combat/CombatManager.ts src/forgottenSanity/combat/WallHitRenderer.ts src/forgottenSanity/ForgottenSanityScene.ts src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "fix(forgottenSanity): #4 enemy projectile wall collision + spawnWallHitFx"
```

---

### Task 7: #6 杨云红边 cdMultiplier 二阶段全 CD 减半

**Files:**
- Modify: `src/forgottenSanity/combat/enemies/YangYunRed.ts`
- Test: `src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`

- [ ] **Step 1: 写失败测试 — 二阶段 windup/duration 减半**

```typescript
// src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts 追加
describe('#6 phase2 cdMultiplier halves all CDs', () => {
  it('phase1 has cdMultiplier=1', () => {
    const e = createYangYunRed();
    expect(e.getCdMultiplier()).toBe(1);
  });

  it('phase2 halves charge windup (1000→500)', () => {
    const e = createYangYunRed();
    e.setHp(50); // < 40% maxHp 触发 phase2
    e.update(16, ctx);
    expect(e.getCdMultiplier()).toBe(0.5);
    expect(e.getEffectiveChargeWindupMs()).toBe(500);
  });

  it('phase2 halves charge duration (700→350)', () => {
    const e = createYangYunRed();
    e.setHp(50);
    e.update(16, ctx);
    expect(e.getEffectiveChargeDurationMs()).toBe(350);
  });

  it('phase2 halves crack windup (600→300)', () => {
    const e = createYangYunRed();
    e.setHp(50);
    e.update(16, ctx);
    expect(e.getEffectiveCrackWindupMs()).toBe(300);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`
Expected: FAIL（无 cdMultiplier 字段）

- [ ] **Step 3: 实现 — cdMultiplier 字段**

```typescript
// src/forgottenSanity/combat/enemies/YangYunRed.ts — 修改
export class YangYunRedEnemy extends Enemy {
  private cdMultiplier = 1;

  getCdMultiplier(): number { return this.cdMultiplier; }
  getEffectiveChargeWindupMs(): number { return CHARGE_WINDUP_MS * this.cdMultiplier; }
  getEffectiveChargeDurationMs(): number { return CHARGE_DURATION_MS * this.cdMultiplier; }
  getEffectiveChargeIntervalMs(): number { return CHARGE_INTERVAL_MS * this.cdMultiplier; }
  getEffectiveCrackWindupMs(): number { return CRACK_WINDUP_MS * this.cdMultiplier; }
  getEffectiveCrackIntervalMs(): number { return CRACK_INTERVAL_MS * this.cdMultiplier; }

  private enterPhase2(): void {
    this.phase = 2;
    this.cdMultiplier = 0.5;
    // ... 其他 phase2 切换 ...
  }
}
```

将所有 CD 读取处从 `CHARGE_WINDUP_MS` 改为 `this.getEffectiveChargeWindupMs()` 等。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/combat/enemies/YangYunRed.ts src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts
git commit -m "fix(forgottenSanity): #6 YangYunRed cdMultiplier phase2 all CDs halved"
```

---

### Task 8: #7 Enemy.currentRoomId 每帧点在矩形赋值

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（update 方法顶部）
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 写失败测试 — currentRoomId 更新**

```typescript
// src/tests/forgottenSanity/combat/combat-manager.test.ts 追加
describe('#7 enemy currentRoomId assignment', () => {
  it('updates currentRoomId based on point-in-rect', () => {
    const cm = createCombatManagerWithRooms([
      { id: 'room-A', bounds: { x: 0, y: 0, width: 200, height: 200 } },
      { id: 'room-B', bounds: { x: 300, y: 0, width: 200, height: 200 } },
    ]);
    const enemy = { id: 'e1', x: 100, y: 100, currentRoomId: null, dead: false };
    cm.spawnEnemyInternal(enemy);
    cm.update(16, ctx);
    expect(enemy.currentRoomId).toBe('room-A');
  });

  it('updates currentRoomId when enemy moves to another room', () => {
    const cm = createCombatManagerWithRooms([
      { id: 'room-A', bounds: { x: 0, y: 0, width: 200, height: 200 } },
      { id: 'room-B', bounds: { x: 300, y: 0, width: 200, height: 200 } },
    ]);
    const enemy = { id: 'e1', x: 100, y: 100, currentRoomId: null, dead: false };
    cm.spawnEnemyInternal(enemy);
    cm.update(16, ctx);
    expect(enemy.currentRoomId).toBe('room-A');
    enemy.x = 350; enemy.y = 50;
    cm.update(16, ctx);
    expect(enemy.currentRoomId).toBe('room-B');
  });

  it('keeps currentRoomId when enemy in corridor (no room)', () => {
    const cm = createCombatManagerWithRooms([
      { id: 'room-A', bounds: { x: 0, y: 0, width: 200, height: 200 } },
    ]);
    const enemy = { id: 'e1', x: 100, y: 100, currentRoomId: null, dead: false };
    cm.spawnEnemyInternal(enemy);
    cm.update(16, ctx);
    expect(enemy.currentRoomId).toBe('room-A');
    enemy.x = 500; enemy.y = 500; // 走廊
    cm.update(16, ctx);
    expect(enemy.currentRoomId).toBe('room-A'); // 保持上次
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL（currentRoomId 未更新）

- [ ] **Step 3: 实现 — update 顶部更新 currentRoomId**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — update 方法顶部
update(deltaMs: number, ctx: CombatContext): void {
  if (this.frozen) {
    this.updateVisualEffects(deltaMs);
    return;
  }

  // #7: 更新所有敌人的 currentRoomId
  for (const enemy of this.enemies) {
    if (enemy.dead) continue;
    const room = this.manifest.rooms.find(r =>
      enemy.x >= r.bounds.x && enemy.x <= r.bounds.x + r.bounds.width &&
      enemy.y >= r.bounds.y && enemy.y <= r.bounds.y + r.bounds.height
    );
    if (room) enemy.currentRoomId = room.id;
  }

  // ... 现有双路更新逻辑 ...
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/combat/CombatManager.ts src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "fix(forgottenSanity): #7 enemy currentRoomId per-frame point-in-rect assignment"
```

---

### Task 9: #10 大地图雾战过滤

**Files:**
- Modify: `src/forgottenSanity/ui/Minimap.ts:176-196`
- Test: `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`

- [ ] **Step 1: 写失败测试 — 大地图过滤未探索 cell**

```typescript
// src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts 追加
describe('#10 bigMap fog-of-war filtering', () => {
  it('does not show chest in unexplored cell on big map', () => {
    const ctrl = createControllerWithExploredCells([0]); // 仅 cell 0 探索
    ctrl.spawnChestForTest('room-far', false);
    const update = ctrl.getMinimapUpdate();
    const bigMapMarkers = collectBigMapChestMarkers(update);
    expect(bigMapMarkers.length).toBe(0); // 远房未探索
  });

  it('shows chest in explored cell on big map', () => {
    const ctrl = createControllerWithExploredCells([0, 5]); // cell 0 和 5 探索
    ctrl.spawnChestInCellForTest(5, false);
    const update = ctrl.getMinimapUpdate();
    const bigMapMarkers = collectBigMapChestMarkers(update);
    expect(bigMapMarkers.length).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: FAIL（bigMapMarkers 未过滤）

- [ ] **Step 3: 实现 — bigMapMarkers 检查 exploredSet**

```typescript
// src/forgottenSanity/ui/Minimap.ts:176-196 — 修改 bigMapMarkers 部分
// 在 bigMapMarkers 渲染前已有 exploredSet = new Set<number>(u.exploredCells)
for (const m of u.chestMarkers) {
  const cellIdx = Math.floor(m.y / CELL_SIZE) * cellCols + Math.floor(m.x / CELL_SIZE);
  if (!exploredSet.has(cellIdx)) continue; // 新增
  // ... 绘制 chest marker ...
}
// exit / body 同理
for (const m of u.exitMarkers) {
  const cellIdx = Math.floor(m.y / CELL_SIZE) * cellCols + Math.floor(m.x / CELL_SIZE);
  if (!exploredSet.has(cellIdx)) continue; // 新增
  // ... 绘制 ...
}
for (const m of u.bodyMarkers) {
  const cellIdx = Math.floor(m.y / CELL_SIZE) * cellCols + Math.floor(m.x / CELL_SIZE);
  if (!exploredSet.has(cellIdx)) continue; // 新增
  // ... 绘制 ...
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/ui/Minimap.ts src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts
git commit -m "fix(forgottenSanity): #10 bigMap fog-of-war filtering"
```

---

### Task 10: #11 LootTable itemCount + rollIndependent + sellable

**Files:**
- Modify: `src/forgottenSanity/loot/LootTable.ts:88,106,146-155`
- Modify: `src/forgottenSanity/loot/LootItem.ts`
- Modify: `src/forgottenSanity/meta/ShopManager.ts`
- Test: `src/tests/forgottenSanity/loot/loot-table.test.ts`
- Test: `src/tests/forgottenSanity/meta/shop-manager.test.ts`（新建）

- [ ] **Step 1: 写失败测试 — itemCount min=1**

```typescript
// src/tests/forgottenSanity/loot/loot-table.test.ts — 修改现有测试
// 找到断言 normal chest returns 3-5 items 的测试，改为：
it('normal chest returns 1-5 items', () => {
  for (let i = 0; i < 100; i++) {
    const items = rollLootTable(NORMAL_CHEST_LOOT_TABLE, rng);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(5);
  }
});

it('gilded chest returns 1-5 items', () => {
  for (let i = 0; i < 100; i++) {
    const items = rollLootTable(GILDED_CHEST_LOOT_TABLE, rng);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.length).toBeLessThanOrEqual(5);
  }
});
```

- [ ] **Step 2: 写失败测试 — rollIndependent 独立掷骰可返回 0 件**

```typescript
// src/tests/forgottenSanity/loot/loot-table.test.ts 追加
describe('#11 rollIndependent per-rarity independent', () => {
  it('returns 0 items when all entries fail', () => {
    // 固定 rng 让所有 weight 失败
    const rng = { float: () => 99.99, int: () => 0, pick: <T>(arr: T[]) => arr[0] };
    const items = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
    expect(items).toEqual([]);
  });

  it('returns 4 items when all entries succeed', () => {
    const rng = { float: () => 0, int: () => 0, pick: <T>(arr: T[]) => arr[0] };
    const items = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
    expect(items.length).toBe(4);
  });

  it('returns 1-4 items in independent mode', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 50; i++) {
      const items = rollLootTable(YANG_YUN_RED_LOOT_TABLE, rng);
      expect(items.length).toBeGreaterThanOrEqual(0);
      expect(items.length).toBeLessThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/loot/loot-table.test.ts`
Expected: FAIL（当前 itemCount min=3/4 + rollIndependent 是加权多选）

- [ ] **Step 4: 实现 — itemCount min=1**

```typescript
// src/forgottenSanity/loot/LootTable.ts:88,106
const NORMAL_CHEST_LOOT_TABLE: LootTable = {
  // ...
  itemCount: { min: 1, max: 5 }, // 原 min:3
};
const GILDED_CHEST_LOOT_TABLE: LootTable = {
  // ...
  itemCount: { min: 1, max: 5 }, // 原 min:4
};
```

- [ ] **Step 5: 实现 — rollIndependent 真正独立掷骰**

```typescript
// src/forgottenSanity/loot/LootTable.ts:146-155 — 重写 rollIndependent 分支
function rollIndependent(table: LootTable, rng: Rng): LootItem[] {
  const out: LootItem[] = [];
  for (const entry of table.entries) {
    if (rng.float(0, 100) < entry.weight) {
      out.push(pickItem(entry, rng));
    }
  }
  return out;
}
```

- [ ] **Step 6: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/loot/loot-table.test.ts`
Expected: PASS

- [ ] **Step 7: 写失败测试 — sellable 字段**

```typescript
// src/tests/forgottenSanity/meta/shop-manager.test.ts — 新建
import { describe, it, expect } from 'vitest';
import { ShopManager } from '../../../forgottenSanity/meta/ShopManager';
import { getLootItem } from '../../../forgottenSanity/loot/LootItem';

describe('#11 vaultKey sellable=false', () => {
  it('getLootItem returns sellable=false for vaultKey', () => {
    const item = getLootItem('material.vaultKey');
    expect(item?.sellable).toBe(false);
  });

  it('getLootItem returns sellable undefined (default true) for normal item', () => {
    const item = getLootItem('consumable.celery');
    expect(item?.sellable).toBeUndefined();
  });

  it('ShopManager.canSell returns false for vaultKey', () => {
    const shop = new ShopManager(/* ... */);
    expect(shop.canSell('material.vaultKey')).toBe(false);
  });

  it('ShopManager.sell returns unsellable reason for vaultKey', () => {
    const shop = new ShopManager(/* ... */);
    const result = shop.sell('material.vaultKey', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsellable');
  });
});
```

- [ ] **Step 8: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/meta/shop-manager.test.ts`
Expected: FAIL（无 sellable 字段）

- [ ] **Step 9: 实现 — LootItem sellable 字段**

```typescript
// src/forgottenSanity/loot/LootItem.ts — 修改 LootItem 接口
export interface LootItem {
  readonly id: string;
  readonly name: string;
  readonly rarity: LootRarity;
  readonly type: LootItemType;
  readonly sanityValue: number;
  readonly effect: LootEffect;
  readonly description: string;
  readonly sellable?: boolean; // 新增，默认 true（undefined 视为可卖）
}

// material.vaultKey 定义
const VAULT_KEY: LootItem = {
  id: 'material.vaultKey',
  name: '仓库钥匙',
  rarity: 'blue',
  type: 'material',
  sanityValue: 0,
  effect: null,
  description: '用于解锁 vault door 的钥匙。',
  sellable: false, // 新增
};
```

- [ ] **Step 10: 实现 — ShopManager.canSell + unsellable**

```typescript
// src/forgottenSanity/meta/ShopManager.ts
canSell(itemId: string): boolean {
  const item = this.lootRegistry.get(itemId);
  return item?.sellable !== false;
}

sell(itemId: string, quantity: number): ShopResult {
  if (!this.canSell(itemId)) {
    return { ok: false, reason: 'unsellable' };
  }
  // ... 现有卖出逻辑 ...
}
```

- [ ] **Step 11: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/meta/shop-manager.test.ts`
Expected: PASS

- [ ] **Step 12: 提交**

```bash
git add src/forgottenSanity/loot/LootTable.ts src/forgottenSanity/loot/LootItem.ts src/forgottenSanity/meta/ShopManager.ts src/tests/forgottenSanity/loot/loot-table.test.ts src/tests/forgottenSanity/meta/shop-manager.test.ts
git commit -m "fix(forgottenSanity): #11 LootTable itemCount min=1 + rollIndependent + sellable"
```

---

## Phase 3：中风险（12 tasks）

### Task 11: M4 fistDash 无敌期应用 debuff

**Files:**
- Modify: `src/forgottenSanity/combat/PlayerCombat.ts:87-101`
- Test: `src/tests/forgottenSanity/combat/player-combat.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/combat/player-combat.test.ts — 新建
import { describe, it, expect } from 'vitest';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';

describe('M4 invincible period applies debuff', () => {
  it('does not apply HP damage when invincibleMs>0', () => {
    const pc = new PlayerCombat();
    pc.setInvincible(300);
    const initialHp = pc.hp;
    pc.takeDamage({ amount: 50, type: 'physical', category: 'melee', debuff: { kind: 'slow', intensity: 0.5, durationMs: 1000 } }, 0);
    expect(pc.hp).toBe(initialHp);
  });

  it('applies debuff even when invincibleMs>0', () => {
    const pc = new PlayerCombat();
    pc.setInvincible(300);
    pc.takeDamage({ amount: 50, type: 'physical', category: 'melee', debuff: { kind: 'slow', intensity: 0.5, durationMs: 1000 } }, 0);
    expect(pc.hasDebuff('slow')).toBe(true);
  });

  it('applies HP damage when invincibleMs=0', () => {
    const pc = new PlayerCombat();
    const initialHp = pc.hp;
    pc.takeDamage({ amount: 50, type: 'physical', category: 'melee', debuff: { kind: 'slow', intensity: 0.5, durationMs: 1000 } }, 0);
    expect(pc.hp).toBe(initialHp - 50);
    expect(pc.hasDebuff('slow')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/player-combat.test.ts`
Expected: FAIL（无敌期 debuff 也被跳过）

- [ ] **Step 3: 实现 — takeDamage 拆分**

```typescript
// src/forgottenSanity/combat/PlayerCombat.ts:87-101 — 重写 takeDamage
takeDamage(instance: DamageInstance, timeMs: number): void {
  if (this.dead) return;
  // 应用 debuff（无敌期也应用）
  if (instance.debuff) {
    this.applyDebuff(instance.debuff, timeMs);
  }
  // 无敌期跳过伤害数值
  if (this.invincibleMs > 0) return;
  // ... 伤害计算（保持现有逻辑） ...
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/player-combat.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/combat/PlayerCombat.ts src/tests/forgottenSanity/combat/player-combat.test.ts
git commit -m "fix(forgottenSanity): M4 invincible period applies debuff but skips damage"
```

---

### Task 12: M5 burn 累加 DPS

**Files:**
- Modify: `src/forgottenSanity/combat/Enemy.ts:280-303`
- Test: `src/tests/forgottenSanity/combat/damage-type.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/combat/damage-type.test.ts — 新建
import { describe, it, expect } from 'vitest';
import { createTestEnemy } from './helpers/createTestEnemy';

describe('M5 burn accumulation', () => {
  it('accumulates DPS from multiple burn sources', () => {
    const enemy = createTestEnemy({ hp: 1000 });
    enemy.applyDebuff({ kind: 'burn', dps: 10, duration: 2000 }, 0);
    enemy.applyDebuff({ kind: 'burn', dps: 3, duration: 2000 }, 0);
    expect(enemy.getStatusBurn()?.dps).toBe(13);
  });

  it('takes max duration', () => {
    const enemy = createTestEnemy({ hp: 1000 });
    enemy.applyDebuff({ kind: 'burn', dps: 10, duration: 2000 }, 0);
    enemy.applyDebuff({ kind: 'burn', dps: 5, duration: 3000 }, 0);
    expect(enemy.getStatusBurn()?.remainingMs).toBe(3000);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/damage-type.test.ts`
Expected: FAIL（当前 burn 覆盖旧 DPS）

- [ ] **Step 3: 实现 — burn case 累加**

```typescript
// src/forgottenSanity/combat/Enemy.ts:280-303 — 修改 case 'burn'
case 'burn': {
  const newDps = debuff.dps;
  const newDuration = debuff.duration;
  if (this.statusBurn === null) {
    this.statusBurn = { dps: newDps, remainingMs: newDuration };
  } else {
    this.statusBurn.dps += newDps;
    this.statusBurn.remainingMs = Math.max(this.statusBurn.remainingMs, newDuration);
  }
  break;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/damage-type.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/combat/Enemy.ts src/tests/forgottenSanity/combat/damage-type.test.ts
git commit -m "fix(forgottenSanity): M5 burn DPS accumulates, duration takes max"
```

---

### Task 13: M6 雾战遮罩冻结敌人 AI

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（setFrozen + update 早返回）
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts:647-652`
- Test: `src/tests/forgottenSanity/combat/combat-manager.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/combat/combat-manager.test.ts 追加
describe('M6 setFrozen freezes enemy AI', () => {
  it('does not advance enemy position when frozen', () => {
    const cm = createCombatManagerWithEnemy({ x: 0, y: 0 });
    const initialX = cm.getEnemies()[0]!.x;
    cm.setFrozen(true);
    cm.update(1000, ctx);
    expect(cm.getEnemies()[0]!.x).toBe(initialX); // 未移动
  });

  it('resumes enemy AI when unfrozen', () => {
    const cm = createCombatManagerWithEnemy({ x: 0, y: 0 });
    cm.setFrozen(true);
    cm.update(1000, ctx);
    cm.setFrozen(false);
    cm.update(16, ctx);
    // 敌人移动（具体断言依赖 enemy AI）
    expect(cm.getEnemies()[0]!.x).not.toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL（无 setFrozen 方法）

- [ ] **Step 3: 实现 — setFrozen + update 早返回**

```typescript
// src/forgottenSanity/combat/CombatManager.ts
export class CombatManager {
  // ...
  private frozen = false;

  setFrozen(frozen: boolean): void { this.frozen = frozen; }
  isFrozen(): boolean { return this.frozen; }

  update(deltaMs: number, ctx: CombatContext): void {
    if (this.frozen) {
      this.updateVisualEffects(deltaMs);
      return;
    }
    // ... 现有 update 逻辑 ...
  }

  private updateVisualEffects(deltaMs: number): void {
    this.updateWallHitParticles(deltaMs);
    // 其他纯视觉更新
  }
}
```

- [ ] **Step 4: 实现 — handleEliteDefeated 调用 setFrozen**

```typescript
// src/forgottenSanity/ForgottenSanityRunController.ts:647-652 — 修改 handleEliteDefeated
private handleEliteDefeated(): void {
  // ... 现有 4 步副作用（碎片/钥匙/雾战/复制） ...
  this.combatManager.setFrozen(true);
  this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
    this.combatManager.setFrozen(false);
  });
}
```

需 import `RED_EDGE_MASK_DURATION_MS` from `RedEdgeFogOverlay`。

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/forgottenSanity/combat/CombatManager.ts src/forgottenSanity/ForgottenSanityRunController.ts src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "feat(forgottenSanity): M6 fog overlay freezes enemy AI for 2s"
```

---

### Task 14: M8 ESC 暂停菜单（3 项）

**Files:**
- Create: `src/forgottenSanity/ui/PauseMenu.ts`
- Modify: `src/forgottenSanity/ForgottenSanityScene.ts:105-109`
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts`（abandonRun）
- Test: `src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`

- [ ] **Step 1: 写失败测试 — ESC 暂停切换**

```typescript
// src/tests/forgottenSanity/forgotten-sanity-scene.test.ts 追加
describe('M8 ESC pause menu', () => {
  it('ESC toggles pause when big map is hidden', () => {
    const scene = createForgottenSanityScene();
    expect(scene.isPaused()).toBe(false);
    scene.handleEsc();
    expect(scene.isPaused()).toBe(true);
    expect(scene.getCombatManager().isFrozen()).toBe(true);
    scene.handleEsc();
    expect(scene.isPaused()).toBe(false);
    expect(scene.getCombatManager().isFrozen()).toBe(false);
  });

  it('ESC closes big map without pausing when big map is visible', () => {
    const scene = createForgottenSanityScene();
    scene.getMinimap().showBigMap();
    scene.handleEsc();
    expect(scene.isPaused()).toBe(false);
    expect(scene.getMinimap().isBigMapVisible()).toBe(false);
  });

  it('abandonRun calls runDeathSettlement without depositRunInventory', () => {
    const ctrl = createRunControllerWithSpies();
    ctrl.abandonRun();
    expect(ctrl.wasRunDeathSettlementCalled()).toBe(true);
    expect(ctrl.wasDepositRunInventoryCalled()).toBe(false);
  });

  it('pause menu has 3 items: resume/abandon/settings', () => {
    const scene = createForgottenSanityScene();
    scene.handleEsc();
    const items = scene.getPauseMenu().getItems();
    expect(items.map(i => i.id)).toEqual(['resume', 'abandon', 'settings']);
  });

  it('settings submenu toggles audio', () => {
    const scene = createForgottenSanityScene();
    scene.handleEsc();
    const initialAudio = scene.getAudioEnabled();
    scene.getPauseMenu().clickSettings();
    scene.getPauseMenu().clickAudioToggle();
    expect(scene.getAudioEnabled()).toBe(!initialAudio);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: FAIL（无 PauseMenu / isPaused / handleEsc 等）

- [ ] **Step 3: 实现 — PauseMenu 类**

```typescript
// src/forgottenSanity/ui/PauseMenu.ts — 新建
import Phaser from 'phaser';
import { UI_THEME, applyPixelTextStyle, applyPixelStrokeStyle } from '../../ui/uiTheme';

export interface PauseMenuItem {
  id: 'resume' | 'abandon' | 'settings';
  label: string;
}

export class PauseMenu {
  private container: Phaser.GameObjects.Container;
  private items: PauseMenuItem[] = [
    { id: 'resume', label: '继续' },
    { id: 'abandon', label: '放弃对局' },
    { id: 'settings', label: '设置' },
  ];
  private onResume: () => void;
  private onAbandon: () => void;
  private audioEnabled = true;
  private pixelFilterEnabled = true;

  constructor(scene: Phaser.Scene, onResume: () => void, onAbandon: () => void) {
    this.onResume = onResume;
    this.onAbandon = onAbandon;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(1999);
    this.container.setVisible(false);
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    const bg = this.container.scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
    const title = this.container.scene.add.text(640, 280, '已暂停', applyPixelTextStyle({ fontSize: '32px' })).setOrigin(0.5);
    this.container.add([bg, title]);

    this.items.forEach((item, i) => {
      const y = 360 + i * 60;
      const btn = this.container.scene.add.text(640, y, item.label, applyPixelTextStyle({ fontSize: '20px' })).setOrigin(0.5);
      btn.setInteractive();
      btn.on('pointerdown', () => this.handleClick(item.id));
      this.container.add(btn);
    });
  }

  private handleClick(id: string): void {
    if (id === 'resume') this.onResume();
    else if (id === 'abandon') this.onAbandon();
    else if (id === 'settings') this.openSettings();
  }

  private openSettings(): void {
    this.container.removeAll(true);
    const bg = this.container.scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7);
    const title = this.container.scene.add.text(640, 280, '设置', applyPixelTextStyle({ fontSize: '32px' })).setOrigin(0.5);
    const audioBtn = this.container.scene.add.text(640, 360, `音效: ${this.audioEnabled ? '开' : '关'}`, applyPixelTextStyle({ fontSize: '20px' })).setOrigin(0.5);
    audioBtn.setInteractive();
    audioBtn.on('pointerdown', () => {
      this.audioEnabled = !this.audioEnabled;
      this.openSettings();
    });
    const pixelBtn = this.container.scene.add.text(640, 420, `像素滤镜: ${this.pixelFilterEnabled ? '开' : '关'}`, applyPixelTextStyle({ fontSize: '20px' })).setOrigin(0.5);
    pixelBtn.setInteractive();
    pixelBtn.on('pointerdown', () => {
      this.pixelFilterEnabled = !this.pixelFilterEnabled;
      this.openSettings();
    });
    const backBtn = this.container.scene.add.text(640, 500, '返回', applyPixelTextStyle({ fontSize: '20px' })).setOrigin(0.5);
    backBtn.setInteractive();
    backBtn.on('pointerdown', () => this.render());
    this.container.add([bg, title, audioBtn, pixelBtn, backBtn]);
  }

  show(): void { this.container.setVisible(true); }
  hide(): void { this.container.setVisible(false); }
  isVisible(): boolean { return this.container.visible; }
  getItems(): PauseMenuItem[] { return this.items; }
  isAudioEnabled(): boolean { return this.audioEnabled; }
  isPixelFilterEnabled(): boolean { return this.pixelFilterEnabled; }
}
```

- [ ] **Step 4: 实现 — ForgottenSanityScene ESC + 暂停**

```typescript
// src/forgottenSanity/ForgottenSanityScene.ts — 修改 handleEsc + 新增 togglePause
import { PauseMenu } from './ui/PauseMenu';

export class ForgottenSanityScene extends Phaser.Scene {
  private paused = false;
  private pauseMenu?: PauseMenu;
  private audioEnabled = true;

  // 在 create() 中：
  this.pauseMenu = new PauseMenu(
    this,
    () => this.togglePause(),
    () => this.runController?.abandonRun(),
  );

  private handleEsc(): void {
    if (this.minimap?.isBigMapVisible()) {
      this.minimap.hideBigMap();
      return;
    }
    this.togglePause();
  }

  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.combatManager?.setFrozen(true);
      this.pauseMenu?.show();
    } else {
      this.combatManager?.setFrozen(false);
      this.pauseMenu?.hide();
    }
  }

  isPaused(): boolean { return this.paused; }
  getPauseMenu(): PauseMenu | undefined { return this.pauseMenu; }
  getAudioEnabled(): boolean { return this.audioEnabled; }

  update(time: number, delta: number): void {
    if (this.paused) return;
    // ... 现有 update 逻辑 ...
  }
}
```

- [ ] **Step 5: 实现 — ForgottenSanityRunController.abandonRun**

```typescript
// src/forgottenSanity/ForgottenSanityRunController.ts — 新增
abandonRun(): void {
  // 按"死亡"处理：本局战利品全丢，仓库不变
  this.scene.runDeathSettlement(this.inventory);
}
```

- [ ] **Step 6: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/forgottenSanity/ui/PauseMenu.ts src/forgottenSanity/ForgottenSanityScene.ts src/forgottenSanity/ForgottenSanityRunController.ts src/tests/forgottenSanity/forgotten-sanity-scene.test.ts
git commit -m "feat(forgottenSanity): M8 ESC pause menu (resume/abandon/settings)"
```

---

### Task 15: M11 soulCapture excludeKinds + 排除复制体

**Files:**
- Modify: `src/forgottenSanity/weapons/WeaponRegistry.ts:325`
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（killRandomEnemyInRadiusExcluding）
- Test: `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts 追加
describe('M11 soulCapture excludeKinds + isDuplicate', () => {
  it('does not target yangYunRed', () => {
    const cm = createCombatManager();
    cm.spawnEnemyInternal({ id: 'e1', kind: 'yangYunRed', x: 50, y: 50, hp: 100, dead: false });
    const killed = cm.killRandomEnemyInRadiusExcluding(0, 0, 200, ['yangYunRed', 'danYuxuanBody']);
    expect(killed).toBeNull();
  });

  it('does not target danYuxuanBody', () => {
    const cm = createCombatManager();
    cm.spawnEnemyInternal({ id: 'e1', kind: 'danYuxuanBody', x: 50, y: 50, hp: 1, dead: false });
    const killed = cm.killRandomEnemyInRadiusExcluding(0, 0, 200, ['yangYunRed', 'danYuxuanBody']);
    expect(killed).toBeNull();
  });

  it('does not target isDuplicate', () => {
    const cm = createCombatManager();
    cm.spawnEnemyInternal({ id: 'e1', kind: 'butYuxuanHead', x: 50, y: 50, hp: 100, dead: false, isDuplicate: true });
    const killed = cm.killRandomEnemyInRadiusExcluding(0, 0, 200, ['yangYunRed', 'danYuxuanBody']);
    expect(killed).toBeNull();
  });

  it('targets normal enemy', () => {
    const cm = createCombatManager();
    cm.spawnEnemyInternal({ id: 'e1', kind: 'butYuxuanHead', x: 50, y: 50, hp: 100, dead: false, isDuplicate: false });
    const killed = cm.killRandomEnemyInRadiusExcluding(0, 0, 200, ['yangYunRed', 'danYuxuanBody']);
    expect(killed).toBe('e1');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 — WeaponRegistry excludeKinds**

```typescript
// src/forgottenSanity/weapons/WeaponRegistry.ts:325 — 修改 soulBanner ultimate
ultimate: {
  kind: 'soulCapture',
  cooldownMs: 120_000,
  excludeKinds: ['yangYunRed', 'danYuxuanBody'],
  // 移除 excludeHpLe: 1
  // ... 其他字段 ...
}
```

- [ ] **Step 4: 实现 — killRandomEnemyInRadiusExcluding 排除 isDuplicate**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — killRandomEnemyInRadiusExcluding
private killRandomEnemyInRadiusExcluding(
  originX: number, originY: number, radius: number,
  excludeKinds: readonly string[]
): string | null {
  const candidates = this.enemies.filter(e =>
    !e.dead &&
    !excludeKinds.includes(e.kind) &&
    !e.isDuplicate &&
    (e.x - originX) ** 2 + (e.y - originY) ** 2 <= radius * radius
  );
  if (candidates.length === 0) return null;
  const idx = Math.floor(this.rng.float(0, candidates.length));
  const target = candidates[idx]!;
  target.kill();
  return target.id;
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/forgottenSanity/weapons/WeaponRegistry.ts src/forgottenSanity/combat/CombatManager.ts src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts
git commit -m "fix(forgottenSanity): M11 soulCapture excludeKinds + isDuplicate"
```

---

### Task 16: M14 多身体 spec 同步

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` §5.9

- [ ] **Step 1: 修改 spec §5.9**

将"对局内最多 2 个身体"改为"对局内最多 1 个身体"。代码不改。

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md
git commit -m "docs(spec#1): M14 §5.9 最多 1 个身体（代码已实现）"
```

---

### Task 17: M15/M16 spec §11.5 深度层级重排

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` §11.5

- [ ] **Step 1: 重排 §11.5**

将深度层级列表重排为：`floor=0, walls=1, chest=3, door=6, label=7, hitArea=8, player=10, UI=1000+`。

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md
git commit -m "docs(spec#1): M16 §11.5 深度层级顺序重排"
```

---

### Task 18: 4.3 宝箱回退红色闪烁

**Files:**
- Modify: `src/forgottenSanity/loot/ChestDecrypt.ts:164-224`
- Test: `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts 追加
describe('4.3 decayProgress red flash', () => {
  it('sets progressArcColor to red on decay', () => {
    const cd = createChestDecrypt();
    cd.advance(1000, true); // 推进到 0.4
    cd.advance(100, false); // decay
    expect(cd.getProgressArcColor()).toBe(0xff4444);
  });

  it('restores progressArcColor to gold after 200ms', () => {
    const cd = createChestDecrypt();
    cd.advance(1000, true);
    cd.advance(100, false);
    // 等待 200ms（通过 advance 模拟）
    cd.advance(200, true);
    expect(cd.getProgressArcColor()).toBe(0xffd700);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 — decayProgress 触发红闪**

```typescript
// src/forgottenSanity/loot/ChestDecrypt.ts — 修改 render 逻辑
const RED_FLASH_COLOR = 0xff4444;
const GOLD_COLOR = 0xffd700;
const RED_FLASH_DURATION_MS = 200;

private progressArcColor = GOLD_COLOR;
private redFlashRemainingMs = 0;

// 在 decayProgress 触发时（render 调用前）：
private onDecayTriggered(): void {
  this.redFlashRemainingMs = RED_FLASH_DURATION_MS;
}

// 在 update/render 中推进：
private updateRedFlash(deltaMs: number): void {
  if (this.redFlashRemainingMs > 0) {
    this.redFlashRemainingMs -= deltaMs;
    this.progressArcColor = RED_FLASH_COLOR;
    if (this.redFlashRemainingMs <= 0) {
      this.progressArcColor = GOLD_COLOR;
    }
  }
}

getProgressArcColor(): number { return this.progressArcColor; }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/loot/ChestDecrypt.ts src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts
git commit -m "feat(forgottenSanity): 4.3 chest decrypt decay red flash 200ms"
```

---

### Task 19: 4.4 vault door toast 自动消失

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts:733-744`
- Modify: `src/forgottenSanity/ForgottenSanityScene.ts`（showToast 实现）

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/forgotten-sanity-scene.test.ts 追加
describe('4.4 toast auto-dismiss', () => {
  it('showToast removes toast after 2000ms', async () => {
    const scene = createForgottenSanityScene();
    scene.showToast('test message');
    expect(scene.getVisibleToasts().length).toBe(1);
    // 模拟 2000ms 推进（scene.time.delayedCall）
    await scene.advanceTime(2000);
    expect(scene.getVisibleToasts().length).toBe(0);
  });

  it('showToast accepts custom durationMs', async () => {
    const scene = createForgottenSanityScene();
    scene.showToast('test', 500);
    await scene.advanceTime(500);
    expect(scene.getVisibleToasts().length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 — showToast with durationMs**

```typescript
// src/forgottenSanity/ForgottenSanityScene.ts — 新增 showToast
showToast(message: string, durationMs: number = 2000): void {
  const text = this.add.text(640, 100, message, applyPixelTextStyle({ fontSize: '16px' })).setOrigin(0.5);
  text.setDepth(2000);
  this.time.delayedCall(durationMs, () => text.destroy());
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/ForgottenSanityScene.ts src/tests/forgottenSanity/forgotten-sanity-scene.test.ts
git commit -m "feat(forgottenSanity): 4.4 showToast auto-dismiss with durationMs"
```

---

### Task 20: 2.6 chestDecrypt forceOpen() 公开方法

**Files:**
- Modify: `src/forgottenSanity/loot/chestDecryptState.ts`
- Modify: `src/forgottenSanity/loot/ChestDecrypt.ts:112-117`

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts 追加
describe('2.6 forceOpen()', () => {
  it('sets phase to opened', () => {
    const state = new ChestDecryptState();
    state.forceOpen();
    expect(state.phase).toBe('opened');
  });

  it('resets openElapsedMs to 0', () => {
    const state = new ChestDecryptState();
    state.forceOpen();
    expect(state.getOpenElapsedMs()).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 — forceOpen 公开方法**

```typescript
// src/forgottenSanity/loot/chestDecryptState.ts — 新增
export class ChestDecryptState {
  // ... 现有字段 ...
  forceOpen(): void {
    this.phase = 'opened';
    this.openElapsedMs = 0;
  }
  getOpenElapsedMs(): number { return this.openElapsedMs; }
}
```

- [ ] **Step 4: 实现 — ChestDecrypt isVaultChest 调用 forceOpen**

```typescript
// src/forgottenSanity/loot/ChestDecrypt.ts:112-117 — 修改 isVaultChest 分支
if (isVaultChest) {
  this.state.forceOpen(); // 替代 as unknown as 强制写
  this.handleOpenStart();
  return;
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/forgottenSanity/loot/chestDecryptState.ts src/forgottenSanity/loot/ChestDecrypt.ts src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts
git commit -m "refactor(forgottenSanity): 2.6 forceOpen() public method"
```

---

### Task 21: 1.2 farRoomAccumMs 清理

**Files:**
- Modify: `src/forgottenSanity/combat/CombatManager.ts`（handleDeadEnemies）

- [ ] **Step 1: 写失败测试**

```typescript
// src/tests/forgottenSanity/combat/combat-manager.test.ts 追加
describe('1.2 farRoomAccumMs cleanup', () => {
  it('deletes enemy from farRoomAccumMs on death', () => {
    const cm = createCombatManager();
    const enemy = { id: 'e1', x: 0, y: 0, hp: 1, dead: false };
    cm.spawnEnemyInternal(enemy);
    cm.setFarRoomAccumMs('e1', 250); // 模拟远房累计
    enemy.hp = 0;
    enemy.dead = true;
    cm.handleDeadEnemies();
    expect(cm.hasFarRoomAccumMs('e1')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 — handleDeadEnemies 同步 delete**

```typescript
// src/forgottenSanity/combat/CombatManager.ts — handleDeadEnemies
private handleDeadEnemies(): void {
  for (let i = this.enemies.length - 1; i >= 0; i--) {
    const e = this.enemies[i]!;
    if (!e.dead) continue;
    this.farRoomAccumMs.delete(e.id); // 新增
    this.enemies.splice(i, 1);
    // ... 现有死亡处理 ...
  }
}

hasFarRoomAccumMs(enemyId: string): boolean { return this.farRoomAccumMs.has(enemyId); }
setFarRoomAccumMs(enemyId: string, ms: number): void { this.farRoomAccumMs.set(enemyId, ms); }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/forgottenSanity/combat/combat-manager.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/forgottenSanity/combat/CombatManager.ts src/tests/forgottenSanity/combat/combat-manager.test.ts
git commit -m "fix(forgottenSanity): 1.2 farRoomAccumMs cleanup on enemy death"
```

---

### Task 22: 220px 三处定义合并

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` §5.10 / §9.3 / §11.x

- [ ] **Step 1: 修改 spec — §5.10 为主定义**

§5.10 保留 `RED_EDGE_VISIBILITY_RADIUS_PX = 220` 作为唯一定义。

§9.3 改为"视野缩减为 §5.10 定义的 `RED_EDGE_VISIBILITY_RADIUS_PX`（220px）"。

§11.x 数值表对应行改为"红边击杀后视野 | 见 §5.10（220px）"。

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md
git commit -m "docs(spec#1): 220px 三处定义合并至 §5.10"
```

---

## Phase 4：E2E + 文档同步（3 tasks）

### Task 23: 3 个 E2E spec 真实化

**Files:**
- Modify: `tests/e2e/forgotten-sanity-vault-door.spec.ts`
- Modify: `tests/e2e/forgotten-sanity-elite-defeat.spec.ts`
- Create: `tests/e2e/forgotten-sanity-fog-of-war.spec.ts`

- [ ] **Step 1: 实现 RunController 的 *ForTest 公开方法**

```typescript
// src/forgottenSanity/ForgottenSanityRunController.ts — 新增公开方法
handleEliteDefeated(): void { this.handleEliteDefeatedInternal(); } // 暴露为 public

giveVaultKeyForTest(): void {
  this.inventory.add('material.vaultKey', 1);
}

movePlayerToVaultDoorForTest(): void {
  const vaultDoor = this.mapRenderer.getVaultDoorHitArea();
  if (vaultDoor) {
    this.playerCombat.setPosition(vaultDoor.x, vaultDoor.y);
  }
}

spawnChestForTest(roomId: string, isVaultChest: boolean): void {
  const room = this.manifest.rooms.find(r => r.id === roomId);
  if (room) {
    this.spawnChestInternal(room.bounds.x + room.bounds.width / 2, room.bounds.y + room.bounds.height / 2, isVaultChest);
  }
}

getInventorySummaryForTest(): { items: Record<string, number>; vaultKey: number } {
  return {
    items: this.inventory.toRecord(),
    vaultKey: this.inventory.getQuantity('material.vaultKey'),
  };
}

getCombatSummaryForTest(): { enemyCount: number; duplicateCount: number; farRoomCount: number } {
  const enemies = this.combatManager.getEnemies();
  return {
    enemyCount: enemies.length,
    duplicateCount: enemies.filter(e => e.isDuplicate).length,
    farRoomCount: enemies.filter(e => e.currentRoomId !== this.combatManager.getPlayerRoomId()).length,
  };
}

getVaultStateForTest(): { doorUnlocked: boolean; chestsOpened: number } {
  return {
    doorUnlocked: this.mapRenderer.isVaultDoorUnlocked(),
    chestsOpened: this.vaultChestsOpenedCount,
  };
}

getExploredCellsForTest(): number[] {
  return [...this.exploredCells];
}

movePlayerToForTest(roomId: string): void {
  const room = this.manifest.rooms.find(r => r.id === roomId);
  if (room) {
    this.playerCombat.setPosition(room.bounds.x + room.bounds.width / 2, room.bounds.y + room.bounds.height / 2);
  }
}
```

- [ ] **Step 2: 真实化 forgotten-sanity-vault-door.spec.ts**

```typescript
// tests/e2e/forgotten-sanity-vault-door.spec.ts — 完整重写
import { expect, test } from '@playwright/test';
import type { SceneDebugState } from '../../src/game/scaffoldState';

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: {
      __testTriggerEliteDefeat?: () => void;
      __testGetInventorySummary?: () => { items: Record<string, number>; vaultKey: number };
      __testMovePlayerToVaultDoor?: () => void;
      __testSpawnChest?: (roomId: string, isVaultChest: boolean) => void;
      __testGetVaultState?: () => { doorUnlocked: boolean; chestsOpened: number };
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

test('vault door flow: elite defeat → key drop → unlock → free chest', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // 进入 ForgottenSanityScene
  await clickGamePoint(page, 640, 440);
  await expect.poll(async () => (await readState(page))?.forgottenSanity?.scene, { timeout: 15_000 }).toBe('run');

  // 触发精英击杀
  await page.evaluate(() => {
    const w = window as GameWindow;
    w.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  });

  // 断言钥匙已发放
  const inv = await page.evaluate(() => window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetInventorySummary?.();
  expect(inv?.vaultKey ?? 0).toBeGreaterThanOrEqual(1);

  // 瞬移到 vault door
  await page.evaluate(() => {
    const w = window as GameWindow;
    w.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerToVaultDoor?.();
  });

  // 按 H 解锁
  await page.keyboard.press('H');
  const vaultState1 = await page.evaluate(() => window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetVaultState?.();
  expect(vaultState1?.doorUnlocked).toBe(true);

  // 在 vault 房间生成宝箱
  await page.evaluate(() => {
    const w = window as GameWindow;
    w.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testSpawnChest?.('vault', true);
  });

  // 按 H 开宝箱
  await page.keyboard.press('H');
  const vaultState2 = await page.evaluate(() => window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetVaultState?.();
  expect(vaultState2?.chestsOpened).toBe(1);
});
```

注：因 page.evaluate 返回 Promise，实际代码需 `await page.evaluate(() => ...)`，上面伪代码仅示意结构，实施时按 Playwright API 正确调用。

- [ ] **Step 3: 真实化 forgotten-sanity-elite-defeat.spec.ts**

类似 vault-door，按 spec §3.2.2 步骤实施。

- [ ] **Step 4: 新建 forgotten-sanity-fog-of-war.spec.ts**

按 spec §3.2.3 步骤实施。

- [ ] **Step 5: 运行 E2E**

```bash
npx playwright install chromium
npm run e2e
```
Expected: 28 原 + 3 新 = 31 全部通过

- [ ] **Step 6: 提交**

```bash
git add tests/e2e/forgotten-sanity-vault-door.spec.ts tests/e2e/forgotten-sanity-elite-defeat.spec.ts tests/e2e/forgotten-sanity-fog-of-war.spec.ts src/forgottenSanity/ForgottenSanityRunController.ts
git commit -m "test(e2e): forgotten sanity 3 E2E specs real implementation"
```

---

### Task 24: S1/S3/S4 spec 文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`

- [ ] **Step 1: S1 — §11.3 loot manifest 数量**

将 §11.3 "46 个 loot manifest 条目"改为"49 个 loot manifest 条目（48 碎片 + 1 仓库钥匙）"。

- [ ] **Step 2: S3 — §3.2 玩家碰撞几何**

§3.2 末尾补述："玩家碰撞用 8×8 像素点检测（中心点判定）。"

- [ ] **Step 3: S4 — §5.9 B 复活计时器清除**

§5.9 B "身体死亡 → 清场所有绑定头颅"后补述："复活计时器随之清除（boundHeads 清空，deadHeads 不再复活）。"

- [ ] **Step 4: 其他 spec 补述**

- §3.2 补述："fistDash 无敌期免疫伤害数值，但 debuff（slow/stun/burn 等）仍应用。"
- §3.4 补述："burn DPS 累加，duration 取 max。"
- §7.4 补述："回退时进度弧红色闪烁 200ms。"
- §9.2 补述 ESC 行为优先级 + 暂停菜单 3 项 + 放弃对局按死亡处理 + 设置子菜单内容。
- §9.3 补述："遮罩期间敌人冻结。"
- §10.2 补述："rollIndependent 模式：每个稀有度独立掷骰，可返回 0-4 件。"
- §8.2 补述："可卖：任意（除 `material.vaultKey` 等标记 `sellable:false` 的物品）。"

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md
git commit -m "docs(spec#1): S1/S3/S4 + 多项补述同步"
```

---

### Task 25: M7 三态机测试覆盖

**Files:**
- Create: `src/tests/forgottenSanity/combat/enemies/state-machine.test.ts`

- [ ] **Step 1: 写三态转换矩阵测试**

```typescript
// src/tests/forgottenSanity/combat/enemies/state-machine.test.ts — 新建
import { describe, it, expect } from 'vitest';
import { createTestEnemy } from '../helpers/createTestEnemy';

describe('M7 three-state machine transitions', () => {
  it('idle → alert when player enters vision', () => {
    const enemy = createTestEnemy({ perception: { visionRange: 200, visionAngle: Math.PI / 2 } });
    enemy.update(16, { playerVisible: true, playerX: 100, playerY: 0 });
    expect(enemy.getAiState()).toBe('alert');
  });

  it('alert → chase when player position confirmed', () => {
    const enemy = createTestEnemy({ perception: { visionRange: 200, visionAngle: Math.PI / 2 } });
    enemy.setAiState('alert');
    enemy.update(ALERT_CONFIRM_MS + 1, { playerVisible: true, playerX: 100, playerY: 0 });
    expect(enemy.getAiState()).toBe('chase');
  });

  it('chase → search when player out of sight', () => {
    const enemy = createTestEnemy();
    enemy.setAiState('chase');
    enemy.update(LOSE_SIGHT_MS + 1, { playerVisible: false, playerX: 1000, playerY: 1000 });
    expect(enemy.getAiState()).toBe('search');
  });

  it('search → alert when player re-visible', () => {
    const enemy = createTestEnemy();
    enemy.setAiState('search');
    enemy.update(16, { playerVisible: true, playerX: 100, playerY: 0 });
    expect(enemy.getAiState()).toBe('alert');
  });

  it('search → idle when search timeout', () => {
    const enemy = createTestEnemy();
    enemy.setAiState('search');
    enemy.update(SEARCH_TIMEOUT_MS + 1, { playerVisible: false, playerX: 1000, playerY: 1000 });
    expect(enemy.getAiState()).toBe('idle');
  });

  it('chase → idle when player dead/evacuated', () => {
    const enemy = createTestEnemy();
    enemy.setAiState('chase');
    enemy.update(16, { playerVisible: false, playerDead: true });
    expect(enemy.getAiState()).toBe('idle');
  });

  // 对 8 种普通敌人重复上述矩阵
  for (const kind of ['butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone', 'bloodHand', 'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye']) {
    it(`${kind}: idle → alert → chase → search → alert → idle`, () => {
      const enemy = createTestEnemy({ kind });
      // ... 完整转换链 ...
    });
  }
});
```

- [ ] **Step 2: 运行测试验证（部分应已通过，部分需补实现）**

Run: `npx vitest run src/tests/forgottenSanity/combat/enemies/state-machine.test.ts`
Expected: 部分通过，部分可能需要补充 enemy AI 实现

- [ ] **Step 3: 补充测试覆盖到所有 8 种敌人**

对每种敌人验证：状态字段、tint、头顶图标、AI 行为（移动方向/速度）。

- [ ] **Step 4: 运行完整测试套件**

```bash
npm run test:run
npm run typecheck
```
Expected: 全部通过

- [ ] **Step 5: 运行 E2E**

```bash
npm run e2e
```
Expected: 31 specs 全部通过

- [ ] **Step 6: 运行 verify**

```bash
npm run verify
```
Expected: 通过

- [ ] **Step 7: 提交**

```bash
git add src/tests/forgottenSanity/combat/enemies/state-machine.test.ts
git commit -m "test(forgottenSanity): M7 three-state machine transition matrix for 8 enemy types"
```

---

## 自验收

执行完所有 25 个 task 后，运行以下命令验证：

```bash
npm run typecheck    # TypeScript strict 通过
npm run test:run     # 单元测试全通过（原 21 + 新增 ~40 = ~61）
npm run e2e          # E2E 31 specs 全通过（原 28 + 新增 3）
npm run verify       # 证据管线通过
```

spec#2 §8 原"31 specs 全部通过"门槛字面达成。
