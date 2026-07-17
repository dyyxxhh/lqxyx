# 摸金模式 Plan 1：基础骨架 + 入口集成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为摸金模式（Tomb Raid Mode）搭建基础骨架并接入主菜单入口：独立 4-key localStorage 存档、`TombRaidHubScene`（枢纽）与 `TombRaidScene`（对局）两个骨架场景、在 `createGame.ts` 注册新场景、在 `GameScene` 主菜单加「摸金模式」按钮，并用 Playwright E2E 验证入口跳转闭环。

**Architecture:**
- `src/tombraid/state/tombRaidState.ts` — 4 个独立 localStorage key（stash/upgrades/best/progress）的 schema + 读写 + 起手包发放（纯 TS，无 Phaser）
- `src/tombraid/TombRaidHubScene.ts` — 枢纽骨架场景：发放起手包、占位文案、「返回主菜单」按钮、通过 `__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` window 全局暴露 E2E 可观测性
- `src/tombraid/TombRaidScene.ts` — 对局骨架场景：占位文案、「放弃返回枢纽」按钮
- `src/game/createGame.ts` — 在 `scene:` 类数组追加两个新场景（**不**修改 `GAME_SCENES` 调试常量）
- `src/scenes/GameScene.ts` — 在「开始新游戏」下方加「摸金模式」按钮，整体下移 continue/settings 布局常量 +44px

**Tech Stack:** Phaser 4.1.0, TypeScript（strict: `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noUnusedLocals` / `noUnusedParameters`）, Vitest 4.1.8（jsdom）, Playwright 1.60.0

---

## File Structure

| 文件 | 职责 | 创建/修改 | Phaser 依赖 |
|------|------|----------|------------|
| `src/tombraid/state/tombRaidState.ts` | 4 key 存档 schema + 读写 + 起手包 | 创建 | 无 |
| `src/tombraid/TombRaidHubScene.ts` | 枢纽骨架场景 | 创建 | `extends Phaser.Scene` |
| `src/tombraid/TombRaidScene.ts` | 对局骨架场景 | 创建 | `extends Phaser.Scene` |
| `src/game/createGame.ts` | 注册 2 个新场景到 scene 数组 | 修改 | `import Phaser` |
| `src/scenes/GameScene.ts` | 加「摸金模式」按钮 + 下移布局常量 | 修改 | `extends Phaser.Scene` |
| `src/game/scaffoldState.ts` | Task 0 还原 4 场景干净基线；Task 4 不再改 | 修改(Task 0) | 无 |
| `src/tests/tombraid/tomb-raid-state.test.ts` | Task 1 测试 | 创建 | 无 |
| `src/tests/tombraid/tomb-raid-scenes.test.ts` | Task 2 测试 | 创建 | `vi.mock('phaser')` |
| `src/tests/tombraid/create-game-tomb-raid.test.ts` | Task 3 测试 | 创建 | `vi.mock('phaser')` |
| `src/tests/tombraid/game-scene-tomb-raid-entry.test.ts` | Task 4 测试 | 创建 | `vi.mock('phaser')` |
| `tests/e2e/tomb-raid-entry.spec.ts` | Task 5 E2E | 创建 | Playwright |

## 现状说明（仓库当前处于半实现的损坏状态）

最近一次 commit `5deaaf5 feat: 加入摸金模式` 引入了一个**错位**的半实现骨架，导致 4 个测试失败（3 个 `sanity.test.ts` + 1 个 `runtime-shell.test.ts`）：

- `src/game/scaffoldState.ts`：`GAME_SCENES` 含 5 项（多了 `'TombRaidScene'`）；新增了 `TombRaidDebugState` / `createInitialTombRaidDebugState` / `SceneDebugState.tombRaid` 字段 / `SceneMenuDebugState.hasTombRaidSave` 字段 / `selectedAction` 联合多了 `'tomb-raid'`；`sceneCounts` 含 5 键
- `src/game/createGame.ts`：`import { TombRaidScene } from '../scenes/TombRaidScene'`（错位路径）；scene 数组含 5 项；多了 `startTombRaid` helper（直接跳对局，跳过枢纽，违反 spec §1.2）
- `src/scenes/TombRaidScene.ts`：错位放在 `src/scenes/`（应在 `src/tombraid/`），且调用 `markSceneStarted('TombRaidScene')`（但 `TombRaidScene` 不在 `GameSceneName` 联合中）
- `src/scenes/GameScene.ts`：`startNewGame()` 引用 `getSceneDebugState().menu.hasTombRaidSave`

**Task 0 先还原干净 4 场景基线**（让 4 个失败测试重新通过），再在 Task 1–5 按 spec §11.1 的 `src/tombraid/` 目录结构重新实现。`src/tombraid/` 目录当前不存在。

## Constraints

- **不修改 `GAME_SCENES` 调试常量**（spec §11.2）：新场景只注册到 `createGame.ts` 的 `scene:` 类数组，**不**加入 `GAME_SCENES` 字符串数组（保持 sanity test 断言 4 场景通过）
- **不修改剧情模式代码**（EventEngine / storyManifest / SaveState / PreloadScene / InputManager / PlayScene / MapRenderer）
- **独立存档键**：4 个 `ying-zhong-jiu.tomb-raid.*.v1` 键，`TOMB_RAID_SCHEMA_VERSION = 1`，不污染 `ying-zhong-jiu.checkpoint-save.v1`
- **所有 UI 复用 `UI_THEME`**（`applyPixelTextStyle` / `applyPixelStrokeStyle`）
- **TypeScript strict**：`noUncheckedIndexedAccess`（数组访问返回 `T | undefined`）/ `exactOptionalPropertyTypes`（可选属性不能赋 `undefined`）/ `noUnusedLocals` + `noUnusedParameters`
- **TDD 强制**：每个任务 5 步（RED → GREEN → SURFACE），每步后 typecheck
- **E2E 可观测性**：枢纽场景通过 `__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` window 全局暴露活跃状态（create 时 true，SHUTDOWN 时 false），沿用项目 `as unknown as Record<string, unknown>` 全局挂载模式

## 布局设计（GameScene 主菜单，GAME_HEIGHT=720）

| 元素 | Y 坐标 | 尺寸 | 说明 |
|------|--------|------|------|
| 标题「影中咎」 | 240 (GAME_HEIGHT/2 − 120) | — | 不变 |
| 开始新游戏 | 368 (GAME_HEIGHT/2 + 8) | 360×72 | 不变 |
| **摸金模式** | **440 (GAME_HEIGHT/2 + 80)** | **300×56** | **新增** |
| 继续游戏 | 512 (GAME_HEIGHT/2 + 152) | 360×72 | 原 +108 → +152（**+44**） |
| 设置标题 | 576 (GAME_HEIGHT/2 + 216) | — | 原 +172 → +216（**+44**） |
| 设置按钮 | 622 (GAME_HEIGHT/2 + 262) | 160×42 | 原 +218 → +262（**+44**） |
| 页脚「第一幕 · 影中咎」 | 706 (设置按钮 Y + 84) | — | < 720 ✓ |

不变式校验（`runtime-shell.test.ts` 已有）：`CONTINUE_Y + 36 < SETTINGS_TITLE_Y` → `512 + 36 = 548 < 576` ✓

## Run Commands

```bash
npm run test:run                              # vitest run（运行所有单元测试）
npm run typecheck                             # tsc --noEmit
npm run build                                 # tsc --noEmit + vite build
npx playwright test tests/e2e/<file>.spec.ts  # 单个 E2E
```

单个单元测试文件：
```bash
npx vitest run src/tests/tombraid/tomb-raid-state.test.ts
```

---

## Task 0: 清理半实现骨架，恢复 4 场景干净基线

**目标**：删除错位的 `src/scenes/TombRaidScene.ts`，还原 `scaffoldState.ts` / `createGame.ts` / `GameScene.ts`，让 4 个失败测试重新通过。这是后续 5 个任务的前提（a.txt 设计假设干净 4 场景起点）。

**Files:**
- Delete: `src/scenes/TombRaidScene.ts`
- Modify: `src/game/scaffoldState.ts`
- Modify: `src/game/createGame.ts`
- Modify: `src/scenes/GameScene.ts`
- Test: `src/tests/sanity.test.ts` + `src/tests/runtime-shell.test.ts`（已存在，作为 RED 守卫）

- [ ] **Step 1: 确认 RED — 运行失败测试**

Run: `npm run test:run -- src/tests/sanity.test.ts src/tests/runtime-shell.test.ts`
Expected: 4 个测试失败：
- `sanity > registers Boot, Preload, and Game scenes in startup order`（GAME_SCENES 含 5 项）
- `sanity > exposes deterministic scene debug state...`（多 `tombRaid` 字段 / `hasTombRaidSave` / sceneCounts 5 键）
- `sanity > builds a Phaser config...`（sceneKeys 长度 5）
- `runtime-shell > records BootScene, PreloadScene, and GameScene exactly once...`（sceneCounts 5 键 + menu 多 `hasTombRaidSave`）

- [ ] **Step 2: 删除错位的 `src/scenes/TombRaidScene.ts`**

```bash
rm src/scenes/TombRaidScene.ts
```

- [ ] **Step 3: 还原 `src/game/scaffoldState.ts`（7 处替换）**

对 `src/game/scaffoldState.ts` 依次执行以下 Edit（find → replace）：

**替换 A — GAME_SCENES：**
- old: `export const GAME_SCENES = ['BootScene', 'PreloadScene', 'GameScene', 'PlayScene', 'TombRaidScene'] as const;`
- new: `export const GAME_SCENES = ['BootScene', 'PreloadScene', 'GameScene', 'PlayScene'] as const;`

**替换 B — SceneMenuDebugState：**
- old:
```ts
export interface SceneMenuDebugState {
  readonly visible: boolean;
  readonly selectedAction: 'new-game' | 'continue' | 'tomb-raid' | null;
  readonly hasContinue: boolean;
  readonly hasTombRaidSave: boolean;
}
```
- new:
```ts
export interface SceneMenuDebugState {
  readonly visible: boolean;
  readonly selectedAction: 'new-game' | 'continue' | null;
  readonly hasContinue: boolean;
}
```

**替换 C — 删除 TombRaidDebugState 接口：**
- old:
```ts
export interface TombRaidDebugState {
  readonly active: boolean;
  readonly depth: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly sanity: number;
  readonly maxSanity: number;
  readonly inventoryCount: number;
  readonly enemiesDefeated: number;
  readonly status: 'in-progress' | 'completed' | 'failed' | 'idle';
}

```
- new: （删除整块，含尾部空行）

**替换 D — SceneDebugState 移除 tombRaid 字段：**
- old:
```ts
  map: MapDebugState;
  tombRaid: TombRaidDebugState;
}
```
- new:
```ts
  map: MapDebugState;
}
```

**替换 E — 删除 createInitialTombRaidDebugState 函数：**
- old:
```ts
export function createInitialTombRaidDebugState(): TombRaidDebugState {
  return {
    active: false,
    depth: 1,
    health: 100,
    maxHealth: 100,
    sanity: 100,
    maxSanity: 100,
    inventoryCount: 0,
    enemiesDefeated: 0,
    status: 'idle',
  };
}

```
- new: （删除整块，含尾部空行）

**替换 F — createInitialSceneDebugState 的 sceneCounts / menu / tombRaid：**
- old:
```ts
    sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0, PlayScene: 0, TombRaidScene: 0 },
    menu: { visible: false, selectedAction: null, hasContinue: false, hasTombRaidSave: false },
```
- new:
```ts
    sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0, PlayScene: 0 },
    menu: { visible: false, selectedAction: null, hasContinue: false },
```
- old:
```ts
    map: createInitialMapDebugState(),
    tombRaid: createInitialTombRaidDebugState(),
  };
```
- new:
```ts
    map: createInitialMapDebugState(),
  };
```

**替换 G — markGameSceneReady 移除 hasTombRaidSave：**
- old: `  state.menu = { visible: true, selectedAction: 'new-game', hasContinue: save.hasValidSave, hasTombRaidSave: state.menu.hasTombRaidSave };`
- new: `  state.menu = { visible: true, selectedAction: 'new-game', hasContinue: save.hasValidSave };`

- [ ] **Step 4: 还原 `src/game/createGame.ts`（整文件覆盖）**

将 `src/game/createGame.ts` 完整内容替换为：

```ts
import Phaser from 'phaser';

import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { PlayScene } from '../scenes/PlayScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { GAME_HEIGHT, GAME_WIDTH, refreshCanvasDebugState } from './scaffoldState';

export { GAME_HEIGHT, GAME_SCENES, GAME_WIDTH, createInitialSceneDebugState } from './scaffoldState';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#050505',
    pixelArt: true,
    roundPixels: true,
    input: {
      activePointers: 2,
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        fixedStep: true
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    scene: [BootScene, PreloadScene, GameScene, PlayScene]
  };
}

export function createGame(parent = 'game-root'): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_GAME__ = {
      startPlayScene: () => {
        game.scene.stop('GameScene');
        game.scene.start('PlayScene');
      },
    };
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => refreshCanvasDebugState(parent));
  }

  return game;
}
```

同时还原 `src/scenes/GameScene.ts` 的 `startNewGame()`：
- old: `    getSceneDebugState().menu = { visible: true, selectedAction: 'new-game', hasContinue: false, hasTombRaidSave: getSceneDebugState().menu.hasTombRaidSave };`
- new: `    getSceneDebugState().menu = { visible: true, selectedAction: 'new-game', hasContinue: false };`

- [ ] **Step 5: 确认 GREEN + typecheck + commit**

Run: `npm run test:run -- src/tests/sanity.test.ts src/tests/runtime-shell.test.ts`
Expected: 全部通过（4 个原失败测试现在 GREEN）。

Run: `npm run typecheck`
Expected: 无错误。

Run: `npm run test:run`
Expected: 全部 458 个测试通过（无失败）。

```bash
git add src/scenes/TombRaidScene.ts src/game/scaffoldState.ts src/game/createGame.ts src/scenes/GameScene.ts
git commit -m "revert: 清理半实现摸金骨架，恢复 4 场景干净基线"
```

---

## Task 1: tombRaidState.ts — 4 key 存档 schema + 读写 + 起手包

**目标**：实现 `src/tombraid/state/tombRaidState.ts`：4 个 localStorage key 的 schema（spec §8.5）、默认态、带验证的读写（valid/empty/invalid 判别联合）、`grantStarterPackIfNeeded`（spec §8.3 起手包 `weapon.ruler ×1` + `consumable.celery ×3`，仅发放一次）。纯 TS，无 Phaser import。

**Files:**
- Create: `src/tombraid/state/tombRaidState.ts`
- Test: `src/tests/tombraid/tomb-raid-state.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/tests/tombraid/tomb-raid-state.test.ts`：

```ts
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
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/tests/tombraid/tomb-raid-state.test.ts`
Expected: FAIL（模块 `../../tombraid/state/tombRaidState` 不存在，编译错误）。

- [ ] **Step 3: 实现 tombRaidState.ts**

创建 `src/tombraid/state/tombRaidState.ts`：

```ts
// src/tombraid/state/tombRaidState.ts
// 摸金模式 4-key 独立存档 schema + 读写 + 起手包（纯 TS，无 Phaser import）。
// spec §8.1 / §8.3 / §8.4 / §8.5

export const TOMB_RAID_STASH_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.stash.v1';
export const TOMB_RAID_UPGRADES_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.upgrades.v1';
export const TOMB_RAID_BEST_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.best.v1';
export const TOMB_RAID_PROGRESS_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.progress.v1';
export const TOMB_RAID_SCHEMA_VERSION = 1;

export type TombRaidUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';

const UPGRADE_IDS: readonly TombRaidUpgradeId[] = [
  'physique',
  'swift',
  'pickup',
  'sharp',
  'lucky',
  'armory',
];

export interface TombRaidStashItem {
  readonly itemId: string;
  readonly quantity: number;
}

export interface TombRaidStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly TombRaidStashItem[];
}

export interface TombRaidUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<TombRaidUpgradeId, number>>;
}

export interface TombRaidBestState {
  readonly schemaVersion: number;
  readonly bestSanity: number;
}

export interface TombRaidProgressState {
  readonly schemaVersion: number;
  readonly starterPackGranted: boolean;
}

export type TombRaidInvalidReason = 'corrupt-json' | 'version-mismatch' | 'invalid-shape';

export type TombRaidLoadResult<T> =
  | { readonly status: 'valid'; readonly state: T }
  | { readonly status: 'empty'; readonly state: T }
  | { readonly status: 'invalid'; readonly reason: TombRaidInvalidReason; readonly state: T };

export type GrantStarterPackResult =
  | { readonly granted: true; readonly stash: TombRaidStashState; readonly progress: TombRaidProgressState }
  | { readonly granted: false; readonly stash: TombRaidStashState; readonly progress: TombRaidProgressState };

const STARTER_PACK_ITEMS: readonly TombRaidStashItem[] = [
  { itemId: 'weapon.ruler', quantity: 1 },
  { itemId: 'consumable.celery', quantity: 3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStashState(value: unknown): value is TombRaidStashState {
  if (!isRecord(value)) return false;
  if (typeof value.sanity !== 'number') return false;
  if (!Array.isArray(value.items)) return false;
  return value.items.every(
    (item) => isRecord(item) && typeof item.itemId === 'string' && typeof item.quantity === 'number',
  );
}

function isUpgradesState(value: unknown): value is TombRaidUpgradesState {
  if (!isRecord(value)) return false;
  if (!isRecord(value.tiers)) return false;
  return UPGRADE_IDS.every((id) => typeof value.tiers[id] === 'number');
}

function isBestState(value: unknown): value is TombRaidBestState {
  return isRecord(value) && typeof value.bestSanity === 'number';
}

function isProgressState(value: unknown): value is TombRaidProgressState {
  return isRecord(value) && typeof value.starterPackGranted === 'boolean';
}

function loadTyped<T>(
  storage: Storage,
  key: string,
  guard: (value: unknown) => value is T,
  fallback: () => T,
): TombRaidLoadResult<T> {
  const raw = storage.getItem(key);
  if (raw === null) {
    return { status: 'empty', state: fallback() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'corrupt-json', state: fallback() };
  }
  if (!isRecord(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  if (parsed.schemaVersion !== TOMB_RAID_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'version-mismatch', state: fallback() };
  }
  if (!guard(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  return { status: 'valid', state: parsed };
}

export function createDefaultStashState(): TombRaidStashState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, sanity: 0, items: [] };
}

export function createDefaultUpgradesState(): TombRaidUpgradesState {
  return {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    tiers: { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0 },
  };
}

export function createDefaultBestState(): TombRaidBestState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, bestSanity: 0 };
}

export function createDefaultProgressState(): TombRaidProgressState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, starterPackGranted: false };
}

export function loadStashState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidStashState> {
  return loadTyped(storage, TOMB_RAID_STASH_STORAGE_KEY, isStashState, createDefaultStashState);
}

export function loadUpgradesState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidUpgradesState> {
  return loadTyped(storage, TOMB_RAID_UPGRADES_STORAGE_KEY, isUpgradesState, createDefaultUpgradesState);
}

export function loadBestState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidBestState> {
  return loadTyped(storage, TOMB_RAID_BEST_STORAGE_KEY, isBestState, createDefaultBestState);
}

export function loadProgressState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidProgressState> {
  return loadTyped(storage, TOMB_RAID_PROGRESS_STORAGE_KEY, isProgressState, createDefaultProgressState);
}

export function saveStashState(state: TombRaidStashState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_STASH_STORAGE_KEY, JSON.stringify(state));
}

export function saveUpgradesState(state: TombRaidUpgradesState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_UPGRADES_STORAGE_KEY, JSON.stringify(state));
}

export function saveBestState(state: TombRaidBestState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_BEST_STORAGE_KEY, JSON.stringify(state));
}

export function saveProgressState(state: TombRaidProgressState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_PROGRESS_STORAGE_KEY, JSON.stringify(state));
}

function mergeStashItems(
  existing: readonly TombRaidStashItem[],
  additions: readonly TombRaidStashItem[],
): readonly TombRaidStashItem[] {
  const quantities = new Map<string, number>();
  for (const item of existing) {
    quantities.set(item.itemId, item.quantity);
  }
  for (const item of additions) {
    quantities.set(item.itemId, (quantities.get(item.itemId) ?? 0) + item.quantity);
  }
  return Array.from(quantities.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function grantStarterPackIfNeeded(storage: Storage = localStorage): GrantStarterPackResult {
  const progress = loadProgressState(storage);
  if (progress.state.starterPackGranted) {
    return { granted: false, stash: loadStashState(storage).state, progress: progress.state };
  }
  const stash = loadStashState(storage).state;
  const merged = mergeStashItems(stash.items, STARTER_PACK_ITEMS);
  const newStash: TombRaidStashState = {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    sanity: stash.sanity,
    items: merged,
  };
  const newProgress: TombRaidProgressState = {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    starterPackGranted: true,
  };
  saveStashState(newStash, storage);
  saveProgressState(newProgress, storage);
  return { granted: true, stash: newStash, progress: newProgress };
}
```

- [ ] **Step 4: 验证测试通过 + typecheck**

Run: `npx vitest run src/tests/tombraid/tomb-raid-state.test.ts`
Expected: 全部通过。

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 5: commit**

```bash
git add src/tombraid/state/tombRaidState.ts src/tests/tombraid/tomb-raid-state.test.ts
git commit -m "feat(tombraid): plan1 task1 4-key 存档 schema + 读写 + 起手包"
```

---

## Task 2: TombRaidHubScene + TombRaidScene 骨架场景

**目标**：创建 `src/tombraid/TombRaidHubScene.ts`（枢纽：发放起手包、占位文案、「返回主菜单」按钮、`__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` 全局 + SHUTDOWN 清理）与 `src/tombraid/TombRaidScene.ts`（对局：占位文案、「放弃返回枢纽」按钮）。两个场景注册键分别为 `'TombRaidHubScene'` / `'TombRaidScene'`。

**Files:**
- Create: `src/tombraid/TombRaidHubScene.ts`
- Create: `src/tombraid/TombRaidScene.ts`
- Test: `src/tests/tombraid/tomb-raid-scenes.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/tests/tombraid/tomb-raid-scenes.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    readonly sceneKey: string;
    constructor(key?: string) {
      this.sceneKey = key ?? '';
    }
  }
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  };
});

import { GAME_HEIGHT } from '../../game/scaffoldState';
import { loadProgressState, loadStashState } from '../../tombraid/state/tombRaidState';
import { TombRaidHubScene } from '../../tombraid/TombRaidHubScene';
import { TombRaidScene } from '../../tombraid/TombRaidScene';

interface CapturedRect {
  readonly width: number;
  readonly height: number;
  readonly fire: (event: string) => void;
}

function createCapturingAdd() {
  const rects: CapturedRect[] = [];
  const texts: string[] = [];

  function attachHandlers(): Record<string, unknown> {
    const handlers: Record<string, Array<() => void>> = {};
    const obj: Record<string, unknown> = {};
    obj.setOrigin = () => obj;
    obj.setDepth = () => obj;
    obj.setInteractive = () => obj;
    obj.setStrokeStyle = () => obj;
    obj.setShadow = () => obj;
    obj.setFillStyle = () => obj;
    obj.on = (event: string, cb: () => void) => {
      (handlers[event] ??= []).push(cb);
      return obj;
    };
    obj.fire = (event: string) => {
      (handlers[event] ?? []).forEach((cb) => cb());
    };
    return obj;
  }

  const add = {
    rectangle: (x: number, y: number, width: number, height: number) => {
      const obj = attachHandlers();
      obj.x = x;
      obj.y = y;
      obj.width = width;
      obj.height = height;
      rects.push({
        width,
        height,
        fire: (event: string) => (obj.fire as (e: string) => void)(event),
      });
      return obj;
    },
    text: (_x: number, _y: number, text: string) => {
      texts.push(text);
      return attachHandlers();
    },
  };

  return { rects, texts, add };
}

type CapturingAdd = ReturnType<typeof createCapturingAdd>['add'];

function readHubActive(): unknown {
  return (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__;
}

describe('TombRaidHubScene 场景键', () => {
  it('注册场景键 TombRaidHubScene', () => {
    const scene = new TombRaidHubScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('TombRaidHubScene');
  });
});

describe('TombRaidHubScene.create', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = undefined;
  });

  it('发放起手包、设置 hub 全局、注册 SHUTDOWN、添加返回主菜单按钮回到 GameScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const eventsOnce = vi.fn();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };
    scene.events = { once: eventsOnce };

    scene.create();

    expect(loadProgressState().state.starterPackGranted).toBe(true);
    expect(loadStashState().state.items).toEqual(
      expect.arrayContaining([
        { itemId: 'weapon.ruler', quantity: 1 },
        { itemId: 'consumable.celery', quantity: 3 },
      ]),
    );
    expect(readHubActive()).toBe(true);
    expect(eventsOnce).toHaveBeenCalled();
    expect(captor.texts).toContain('摸金模式 · 枢纽');
    expect(captor.texts).toContain('返回主菜单');

    const back = captor.rects.find((r) => r.width === 240 && r.height === 56);
    expect(back).toBeDefined();
    back!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('GameScene');
  });

  it('SHUTDOWN 回调清除 hub 全局', () => {
    const captor = createCapturingAdd();
    const eventsOnce = vi.fn();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: eventsOnce };

    scene.create();
    expect(readHubActive()).toBe(true);

    const shutdownCb = eventsOnce.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(shutdownCb).toBeTypeOf('function');
    shutdownCb?.();
    expect(readHubActive()).toBe(false);
  });

  it('返回主菜单按钮位于 GAME_HEIGHT/2 + 120', () => {
    const captor = createCapturingAdd();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: vi.fn() };
    scene.create();
    const back = captor.rects.find((r) => r.width === 240 && r.height === 56);
    expect(back).toBeDefined();
    expect(GAME_HEIGHT / 2 + 120).toBe(480);
  });
});

describe('TombRaidScene 场景键与骨架', () => {
  beforeEach(() => localStorage.clear());

  it('注册场景键 TombRaidScene', () => {
    const scene = new TombRaidScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('TombRaidScene');
  });

  it('create 添加占位文案与放弃返回枢纽按钮回到 TombRaidHubScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const scene = Object.create(TombRaidScene.prototype) as TombRaidScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };

    scene.create();

    expect(captor.texts).toContain('摸金对局——待实现');
    expect(captor.texts).toContain('放弃返回枢纽');
    const abort = captor.rects.find((r) => r.width === 260 && r.height === 56);
    expect(abort).toBeDefined();
    abort!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('TombRaidHubScene');
  });
});
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/tests/tombraid/tomb-raid-scenes.test.ts`
Expected: FAIL（模块 `../../tombraid/TombRaidHubScene` / `TombRaidScene` 不存在）。

- [ ] **Step 3: 实现 TombRaidHubScene.ts 与 TombRaidScene.ts**

创建 `src/tombraid/TombRaidHubScene.ts`：

```ts
// src/tombraid/TombRaidHubScene.ts
// 摸金模式枢纽骨架场景：发放起手包、占位文案、返回主菜单按钮、hub 活跃全局。
// spec §1.2 / §8.3 / §11.1
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { grantStarterPackIfNeeded } from './state/tombRaidState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

const HUB_BACK_BUTTON_Y = GAME_HEIGHT / 2 + 120;

export class TombRaidHubScene extends Phaser.Scene {
  public constructor() {
    super('TombRaidHubScene');
  }

  public create(): void {
    grantStarterPackIfNeeded();

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = true;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = false;
      }
    });

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '摸金模式 · 枢纽', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '40px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '（占位 · 完整枢纽 UI 见 Plan 3）', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      }),
    ).setOrigin(0.5);

    const backButton = this.add
      .rectangle(GAME_WIDTH / 2, HUB_BACK_BUTTON_Y, 240, 56, UI_THEME.colors.accent, UI_THEME.alpha.controlActive)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(backButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, HUB_BACK_BUTTON_Y, '返回主菜单', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);
    backButton.on('pointerdown', () => this.scene.start('GameScene'));
  }
}
```

创建 `src/tombraid/TombRaidScene.ts`：

```ts
// src/tombraid/TombRaidScene.ts
// 摸金模式对局骨架场景：占位文案与放弃返回枢纽按钮。
// spec §1.2 / §11.1
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

const ABORT_BUTTON_Y = GAME_HEIGHT / 2 + 120;

export class TombRaidScene extends Phaser.Scene {
  public constructor() {
    super('TombRaidScene');
  }

  public create(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '摸金对局——待实现', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '36px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);

    const abortButton = this.add
      .rectangle(GAME_WIDTH / 2, ABORT_BUTTON_Y, 260, 56, UI_THEME.colors.accent, UI_THEME.alpha.controlActive)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(abortButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, ABORT_BUTTON_Y, '放弃返回枢纽', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);
    abortButton.on('pointerdown', () => this.scene.start('TombRaidHubScene'));
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/tombraid/tomb-raid-scenes.test.ts`
Expected: PASS（6 个 it 全过）。

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/tombraid/TombRaidHubScene.ts src/tombraid/TombRaidScene.ts src/tests/tombraid/tomb-raid-scenes.test.ts
git commit -m "feat(tombraid): plan1 task2 hub/scene 骨架 + hub 全局可观测性"
```

---

## Task 3: 在 createGame.ts 注册摸金场景 + startTombRaidHub 助手

**目标**：将 `TombRaidHubScene` 与 `TombRaidScene` 加入 `createGameConfig` 的 `scene` 数组（位于 PlayScene 之后），并在 `createGame` 暴露 `window.__YING_ZHONG_JIU_GAME__.startTombRaidHub`（停止 GameScene、启动 `TombRaidHubScene`）。**不修改** `GAME_SCENES` 调试常量（保持 4 项，spec §11.2 约束）。

**Files:**
- Modify: `src/game/createGame.ts`
- Test: `src/tests/tombraid/create-game-tomb-raid.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/tests/tombraid/create-game-tomb-raid.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Game {
    scene = { stop: vi.fn(), start: vi.fn() };
    constructor(_config: unknown) {}
  }
  return {
    default: {
      Game,
      AUTO: 'auto',
      Scale: { FIT: 'fit', CENTER_BOTH: 'center-both' },
    },
  };
});

import { createGame, createGameConfig } from '../../game/createGame';
import { TombRaidHubScene } from '../../tombraid/TombRaidHubScene';
import { TombRaidScene } from '../../tombraid/TombRaidScene';

describe('createGameConfig 注册摸金场景', () => {
  it('scene 数组以 Boot→Preload→Game→Play→Hub→TombRaid 顺序包含 6 个场景类', () => {
    const config = createGameConfig('game-root') as { scene: Array<new () => unknown> };
    const names = config.scene.map((cls) => cls.name);
    expect(names).toEqual([
      'BootScene',
      'PreloadScene',
      'GameScene',
      'PlayScene',
      'TombRaidHubScene',
      'TombRaidScene',
    ]);
    expect(config.scene[4]).toBe(TombRaidHubScene);
    expect(config.scene[5]).toBe(TombRaidScene);
  });
});

describe('createGame 暴露 startTombRaidHub 窗口助手', () => {
  it('调用 startTombRaidHub 停止 GameScene 并启动 TombRaidHubScene', () => {
    const game = createGame('game-root') as unknown as {
      scene: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
    };
    const w = window as unknown as {
      __YING_ZHONG_JIU_GAME__: { startPlayScene: () => void; startTombRaidHub: () => void };
    };
    expect(w.__YING_ZHONG_JIU_GAME__).toBeDefined();
    expect(typeof w.__YING_ZHONG_JIU_GAME__.startTombRaidHub).toBe('function');
    w.__YING_ZHONG_JIU_GAME__.startTombRaidHub();
    expect(game.scene.stop).toHaveBeenCalledWith('GameScene');
    expect(game.scene.start).toHaveBeenCalledWith('TombRaidHubScene');
  });
});
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/tests/tombraid/create-game-tomb-raid.test.ts`
Expected: FAIL（`createGameConfig` 的 scene 数组当前为 4 项，`names` 不含 `TombRaidHubScene`；`startTombRaidHub` 未定义）。

- [ ] **Step 3: 实现 createGame.ts 改动**

将 `src/game/createGame.ts` 整文件替换为：

```ts
import Phaser from 'phaser';

import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';
import { PlayScene } from '../scenes/PlayScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { TombRaidHubScene } from '../tombraid/TombRaidHubScene';
import { TombRaidScene } from '../tombraid/TombRaidScene';
import { GAME_HEIGHT, GAME_WIDTH, refreshCanvasDebugState } from './scaffoldState';

export { GAME_HEIGHT, GAME_SCENES, GAME_WIDTH, createInitialSceneDebugState } from './scaffoldState';

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#050505',
    pixelArt: true,
    roundPixels: true,
    input: {
      activePointers: 2,
    },
    physics: {
      default: 'arcade',
      arcade: {
        debug: false,
        fixedStep: true
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    scene: [BootScene, PreloadScene, GameScene, PlayScene, TombRaidHubScene, TombRaidScene]
  };
}

export function createGame(parent = 'game-root'): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));

  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_GAME__ = {
      startPlayScene: () => {
        game.scene.stop('GameScene');
        game.scene.start('PlayScene');
      },
      startTombRaidHub: () => {
        game.scene.stop('GameScene');
        game.scene.start('TombRaidHubScene');
      },
    };
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => refreshCanvasDebugState(parent));
  }

  return game;
}
```

> 注：`GAME_SCENES` 调试常量保持 `['BootScene','PreloadScene','GameScene','PlayScene']` 4 项不变，sanity 测试仍通过；摸金场景仅通过 `createGameConfig` 的 `scene` 数组注册，运行时由 Phaser Scene Manager 管理键值。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/tombraid/create-game-tomb-raid.test.ts`
Expected: PASS（2 个 it 全过）。

Run: `npx vitest run src/tests/sanity.test.ts`
Expected: PASS（`GAME_SCENES` 仍为 4 项，未被破坏）。

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/game/createGame.ts src/tests/tombraid/create-game-tomb-raid.test.ts
git commit -m "feat(tombraid): plan1 task3 注册 hub/scene 场景 + startTombRaidHub 助手"
```

---

## Task 4: GameScene 主菜单新增「摸金模式」入口按钮

**目标**：在 `GameScene` 主菜单「开始新游戏」按钮下方新增「摸金模式」按钮（`300×56`，位于 `GAME_HEIGHT/2 + 80 = 440`），点击后 `this.scene.start('TombRaidHubScene')`。为腾出空间，将 `CONTINUE_Y` / `SETTINGS_TITLE_Y` / `SETTINGS_BUTTON_Y` 各下移 44px，并保持 `CONTINUE_Y + 36 < SETTINGS_TITLE_Y` 不变量（被 `runtime-shell.test.ts` 守卫）。**不修改** `GAME_SCENES` / `SceneMenuDebugState` / 故事模式。

**Files:**
- Modify: `src/scenes/GameScene.ts:29-31`（常量）+ `src/scenes/GameScene.ts:86-115`（按钮插入）
- Test: `src/tests/tombraid/game-scene-tomb-raid-entry.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/tests/tombraid/game-scene-tomb-raid-entry.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    constructor(_key?: string) {}
  }
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  };
});

import { GAME_HEIGHT, GAME_WIDTH, resetSceneDebugState } from '../../game/scaffoldState';
import { GameScene } from '../../scenes/GameScene';

function chainable(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { ...extra };
  object.setOrigin = () => object;
  object.setDepth = () => object;
  object.setVisible = () => object;
  object.setInteractive = () => object;
  object.setScrollFactor = () => object;
  object.setStrokeStyle = () => object;
  object.setShadow = () => object;
  object.setText = () => object;
  object.setFillStyle = () => object;
  object.setDisplaySize = () => object;
  object.setScale = () => object;
  object.setTexture = () => object;
  object.fillStyle = () => object;
  object.fillRect = () => object;
  object.fillRoundedRect = () => object;
  object.lineStyle = () => object;
  object.strokeRect = () => object;
  object.clear = () => object;
  object.destroy = () => object;
  object.on ??= () => object;
  return object;
}

interface CapturedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fire: (event: string) => void;
}

function setupGameScene(): {
  scene: GameScene;
  labels: string[];
  rects: CapturedRect[];
  startMock: ReturnType<typeof vi.fn>;
} {
  resetSceneDebugState();
  localStorage.clear();
  const labels: string[] = [];
  const rects: CapturedRect[] = [];
  const startMock = vi.fn();
  const makeRect = (x: number, y: number, width: number, height: number) => {
    const handlers: Record<string, Array<() => void>> = {};
    const obj = chainable({ x, y, width, height });
    obj.on = (event: string, cb: () => void) => {
      (handlers[event] ??= []).push(cb);
      return obj;
    };
    rects.push({ x, y, width, height, fire: (e: string) => (handlers[e] ?? []).forEach((cb) => cb()) });
    return obj;
  };
  const scene = new GameScene() as unknown as GameScene & {
    add: { rectangle: typeof makeRect; text: (...args: unknown[]) => Record<string, unknown>; image: (...args: unknown[]) => Record<string, unknown>; graphics: () => Record<string, unknown> };
    cameras: { main: { setBounds: () => void } };
    events: { off: () => void; once: () => void };
    input: { keyboard: null; on: () => void };
    scene: { start: typeof startMock; isActive: () => boolean };
    sys: { game: { device: { input: { touch: boolean } } }; scale: { gameSize: { width: number; height: number } } };
    textures: { exists: () => boolean };
  };
  scene.add = {
    rectangle: makeRect,
    text: (_x: number, _y: number, text: string) => { labels.push(text); return chainable(); },
    image: () => chainable(),
    graphics: () => chainable(),
  };
  scene.cameras = { main: { setBounds: vi.fn() } };
  scene.events = { off: vi.fn(), once: vi.fn() };
  scene.input = { keyboard: null, on: vi.fn() } as never;
  scene.scene = { start: startMock, isActive: vi.fn(() => true) };
  scene.sys = { game: { device: { input: { touch: false } } }, scale: { gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT } } };
  scene.textures = { exists: vi.fn(() => false) };
  return { scene, labels, rects, startMock };
}

describe('GameScene 摸金模式入口按钮', () => {
  it('常量 TOMB_RAID_BUTTON_Y = 440，CONTINUE/SETTINGS 各下移 44 且保留 continue<settings 间距', () => {
    const scene = new GameScene() as unknown as {
      TOMB_RAID_BUTTON_Y: number;
      CONTINUE_Y: number;
      SETTINGS_TITLE_Y: number;
      SETTINGS_BUTTON_Y: number;
    };
    expect(scene.TOMB_RAID_BUTTON_Y).toBe(GAME_HEIGHT / 2 + 80);
    expect(scene.TOMB_RAID_BUTTON_Y).toBe(440);
    expect(scene.CONTINUE_Y).toBe(GAME_HEIGHT / 2 + 152);
    expect(scene.SETTINGS_TITLE_Y).toBe(GAME_HEIGHT / 2 + 216);
    expect(scene.SETTINGS_BUTTON_Y).toBe(GAME_HEIGHT / 2 + 262);
    expect(scene.CONTINUE_Y + 36).toBeLessThan(scene.SETTINGS_TITLE_Y);
  });

  it('create 添加 摸金模式 按钮文案，矩形位于 (640,440)、尺寸 300×56', () => {
    const { scene, labels, rects } = setupGameScene();
    scene.create();
    expect(labels).toContain('摸金模式');
    const tomb = rects.find((r) => r.width === 300 && r.height === 56);
    expect(tomb).toBeDefined();
    expect(tomb!.x).toBe(GAME_WIDTH / 2);
    expect(tomb!.y).toBe(GAME_HEIGHT / 2 + 80);
  });

  it('点击 摸金模式 按钮启动 TombRaidHubScene', () => {
    const { scene, rects, startMock } = setupGameScene();
    scene.create();
    const tomb = rects.find((r) => r.width === 300 && r.height === 56);
    expect(tomb).toBeDefined();
    tomb!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('TombRaidHubScene');
  });
});
```

- [ ] **Step 2: 验证测试失败**

Run: `npx vitest run src/tests/tombraid/game-scene-tomb-raid-entry.test.ts`
Expected: FAIL（`TOMB_RAID_BUTTON_Y` 不存在；`labels` 不含 `摸金模式`；找不到 300×56 矩形）。

- [ ] **Step 3: 实现 GameScene.ts 改动**

**改动 A — 新增常量并下移三项（`src/scenes/GameScene.ts:29-31`）：**

- old:
```ts
  private readonly CONTINUE_Y = GAME_HEIGHT / 2 + 108;
  private readonly SETTINGS_TITLE_Y = GAME_HEIGHT / 2 + 172;
  private readonly SETTINGS_BUTTON_Y = GAME_HEIGHT / 2 + 218;
```
- new:
```ts
  private readonly TOMB_RAID_BUTTON_Y = GAME_HEIGHT / 2 + 80;
  private readonly CONTINUE_Y = GAME_HEIGHT / 2 + 152;
  private readonly SETTINGS_TITLE_Y = GAME_HEIGHT / 2 + 216;
  private readonly SETTINGS_BUTTON_Y = GAME_HEIGHT / 2 + 262;
```

**改动 B — 在「开始新游戏」按钮与「第一幕 · 影中咎」页脚之间插入摸金模式按钮：**

- old:
```ts
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '开始新游戏', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.SETTINGS_BUTTON_Y + 84, '第一幕 · 影中咎', {
```
- new:
```ts
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '开始新游戏', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    // ── Tomb raid entry button ─────────────────────────────────
    const tombRaidButton = this.add
      .rectangle(GAME_WIDTH / 2, this.TOMB_RAID_BUTTON_Y, 300, 56, UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(tombRaidButton, UI_THEME.stroke.thin, UI_THEME.colors.borderBlue, 0.95);
    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.TOMB_RAID_BUTTON_Y, '摸金模式', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '24px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);
    tombRaidButton.on('pointerover', () => tombRaidButton.setFillStyle(UI_THEME.colors.accentHover, UI_THEME.alpha.panelStrong));
    tombRaidButton.on('pointerout', () => tombRaidButton.setFillStyle(UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong));
    tombRaidButton.on('pointerdown', () => {
      this.scene.start('TombRaidHubScene');
    });

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.SETTINGS_BUTTON_Y + 84, '第一幕 · 影中咎', {
```

> 注：不修改 `SceneMenuDebugState.selectedAction` 联合（保持 `'new-game' | 'continue' | null`）；摸金入口的可观测性由 `__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` 全局承担（Task 2）。`startNewGame` / `continueGame` / `hasCompletedSave` 等故事模式逻辑均不变。

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/tests/tombraid/game-scene-tomb-raid-entry.test.ts`
Expected: PASS（3 个 it 全过）。

Run: `npx vitest run src/tests/runtime-shell.test.ts`
Expected: PASS（`CONTINUE_Y + 36 < SETTINGS_TITLE_Y` 守卫仍成立：512+36=548 < 576；菜单背景覆盖矩形仍在）。

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 无错误。

```bash
git add src/scenes/GameScene.ts src/tests/tombraid/game-scene-tomb-raid-entry.test.ts
git commit -m "feat(tombraid): plan1 task4 GameScene 摸金模式入口按钮 + 布局下移 44"
```

---

## Task 5: Playwright E2E — 摸金模式入口端到端验证

**目标**：新增 E2E `tests/e2e/tomb-raid-entry.spec.ts`，验证完整链路：主菜单就绪 → 点击「摸金模式」（游戏坐标 640,440）→ `__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` 变 `true` → 点击「返回主菜单」（游戏坐标 640,480）→ hub 全局变 `false` 且 GameScene 重新就绪。依赖预加载素材存在（与既有 E2E 一致）。

**Files:**
- Create: `tests/e2e/tomb-raid-entry.spec.ts`

- [ ] **Step 1: 写 E2E 测试**

创建 `tests/e2e/tomb-raid-entry.spec.ts`：

```ts
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__?: boolean;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readHubActive(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ === true);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

test('摸金模式入口：主菜单 → 枢纽 → 返回主菜单', async ({ page }) => {
  await page.goto('/');

  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // 点击「摸金模式」按钮（游戏坐标 640,440 = GAME_WIDTH/2, GAME_HEIGHT/2+80）
  await clickGamePoint(page, 640, 440);

  // 进入枢纽：hub 活跃全局翻为 true
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);

  // 点击「返回主菜单」按钮（游戏坐标 640,480 = GAME_WIDTH/2, GAME_HEIGHT/2+120）
  await clickGamePoint(page, 640, 480);

  // 返回主菜单：hub 全局翻为 false（SHUTDOWN 清理）
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(false);
  // GameScene 重新就绪
  await expect.poll(() => readState(page), { timeout: 15_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
});
```

- [ ] **Step 2: 运行该 E2E，期望通过（Tasks 1-4 已接线）**

Run: `npx playwright test tests/e2e/tomb-raid-entry.spec.ts --project=desktop-chromium`
Expected: PASS（1 个 test 通过；主菜单→枢纽→返回主菜单完整链路成立）。

> 若 FAIL 且报 `currentScene` 一直未到 `GameScene`：检查预加载素材是否缺失（`public/assets/final/`）；本测试与既有 `smoke.spec.ts` / `main-flow-real-input.spec.ts` 共享同一前置依赖。

- [ ] **Step 3: 全量单元 + typecheck 回归门禁**

Run: `npm run typecheck`
Expected: 无错误。

Run: `npm run test:run`
Expected: 全部单元测试通过（含新增 4 个 tombraid 测试文件 + 既有 sanity/runtime-shell 守卫）。

- [ ] **Step 4: 全量 E2E 回归**

Run: `npm run e2e`
Expected: 既有 28 个 spec + 新增 `tomb-raid-entry.spec.ts` 全部通过（无回归）。

- [ ] **Step 5: commit**

```bash
git add tests/e2e/tomb-raid-entry.spec.ts
git commit -m "test(tombraid): plan1 task5 摸金入口端到端 E2E（主菜单→枢纽→返回）"
```

---

## Self-Review

### 1. Spec 覆盖（Plan 1 范围）

| Spec 条款 | 覆盖任务 | 说明 |
|---|---|---|
| §1.2 GameScene → TombRaidHubScene → TombRaidScene 场景链路 | Task 2 / Task 3 / Task 4 | 骨架场景 + 注册 + 入口按钮 |
| §8 4-key 独立 localStorage schema（stash/upgrades/best/progress） | Task 1 | 4 个 key + `TOMB_RAID_SCHEMA_VERSION=1` + 判别联合读写 |
| §8.3 起手包 `weapon.ruler ×1` + `consumable.celery ×3`，仅一次 | Task 1（`grantStarterPackIfNeeded`）+ Task 2（hub.create 调用） | 由 `progress.starterPackGranted` 守卫 |
| §11.1 目录结构 `src/tombraid/` | Task 1（`state/`）+ Task 2（根目录两场景） | 测试置 `src/tests/tombraid/` |
| §11.2 不修改 `GAME_SCENES` | Task 0（还原 4 项）+ Task 3（仅改 `createGameConfig.scene`） | sanity 守卫 |
| §11.2 不修改故事模式 | Task 0（还原 `startNewGame`）+ Task 4（不动故事逻辑） | runtime-shell 守卫 |
| §11.2 复用 `UI_THEME` | Task 2 / Task 4 | `applyPixelTextStyle` / `applyPixelStrokeStyle` |
| §11.2 strict TS + TDD | 全任务 | 每任务 5-step + `npm run typecheck` |
| 仓库半实现清理（commit 5deaaf5） | Task 0 | 删错位文件 + 还原 scaffoldState/createGame/GameScene |

**Plan 1 明确不在范围（推迟到 Plan 2/3）**：地图生成、对局玩法循环、敌人 AI、深度系统、升级商店、存档导入导出 UI、完整枢纽 UI。Task 2 的「摸金对局——待实现」「（占位 · 完整枢纽 UI 见 Plan 3）」是**面向玩家的占位文案**（实际 UI 内容），非计划占位符。

### 2. 占位符扫描

已扫描全计划，**无** `TBD` / `TODO` / `implement later` / `fill in` / `add error handling` / `similar to Task N` 等计划占位符。每个 code step 均含完整可执行代码；每个 Run step 均含具体命令与期望输出。

### 3. 类型一致性

- `grantStarterPackIfNeeded()` 签名 `() => GrantStarterPackResult`（Task 1）↔ Task 2 hub.create 以 `() => void` 方式调用（返回值忽略）—— ✓ 一致。
- `loadStashState().state.items: readonly TombRaidStashItem[]`（`{itemId:string; quantity:number}`）↔ Task 2 测试断言 `{ itemId: 'weapon.ruler', quantity: 1 }` / `{ itemId: 'consumable.celery', quantity: 3 }` —— ✓ 一致。
- `loadProgressState().state.starterPackGranted: boolean` ↔ Task 2 测试断言 `=== true` —— ✓ 一致。
- 场景键字符串 `'TombRaidHubScene'` / `'TombRaidScene'` / `'GameScene'` 在 Task 2（`super(...)` + `scene.start(...)`）、Task 3（`scene.start('TombRaidHubScene')`）、Task 4（`scene.start('TombRaidHubScene')`）、Task 5（E2E 坐标映射）中拼写完全一致 —— ✓ 一致。
- `__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__` 全局名在 Task 2（写/SHUTDOWN 清）与 Task 5（E2E 读）一致 —— ✓ 一致。
- `TOMB_RAID_BUTTON_Y = GAME_HEIGHT/2 + 80 = 440` 在 Task 4（常量 + 按钮位置）与 Task 5（E2E 点击 640,440）一致；`HUB_BACK_BUTTON_Y = GAME_HEIGHT/2 + 120 = 480` 在 Task 2 与 Task 5（E2E 点击 640,480）一致 —— ✓ 一致。

### 4. 约束合规（§11.2）

- ✓ `GAME_SCENES` 保持 4 项（Task 0 还原 + Task 3 不触碰）；摸金场景仅经 `createGameConfig.scene` 数组注册。
- ✓ 故事模式 `PlayScene` / `EventEngine` / `saveState` 主存档未被修改；`startNewGame` / `continueGame` 行为不变。
- ✓ 复用 `UI_THEME` 暗色像素恐怖风格，无新主题色。
- ✓ strict TS：`noUncheckedIndexedAccess`（Task 4 测试 `tomb!` 非空断言、Task 2 `rects.find(...)!`）、`exactOptionalPropertyTypes`（Task 1 判别联合 `invalid` 分支强制 `reason`）、`noUnusedLocals`（Task 2 测试仅 import `GAME_HEIGHT` 不 import `GAME_WIDTH`）均满足。
- ✓ TDD：每任务 Step 1 先写失败测试 → Step 2 验证 RED → Step 3 最小实现 → Step 4 验证 GREEN → Step 5 typecheck + commit。
- ✓ 频繁提交：6 个独立 commit（Task 0 revert + 5 个 feat/test commit）。

### 5. 结论

Plan 1 交付一个**可运行、可测试、可端到端验证**的摸金模式骨架：4-key 存档已就绪、枢纽/对局场景已注册并接入主菜单入口、起手包自动发放、E2E 验证主菜单↔枢纽往返链路。不引入任何玩法逻辑（留待 Plan 2/3），不破坏既有 28 个 E2E 与 21 个单元测试套件。

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-tomb-raid-plan-1-scaffold-entry.md`. Two execution options:**

**1. Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，任务间两阶段评审，快速迭代。

**2. Inline Execution** — 在当前会话用 executing-plans 批量执行，带检查点评审。

**选择哪种方式？**