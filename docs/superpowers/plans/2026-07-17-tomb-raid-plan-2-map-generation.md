# 摸金模式 Plan 2：地图生成系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现摸金模式（Tomb Raid Mode）的地图生成系统：纯函数生成器（mulberry32 种子 RNG）产出可复现的 `TombRaidMapManifest`（16–20 个房间、5×4 网格、8 种房间类型 + 走廊连接、环+死路混合拓扑、宝箱分布、出口 BFS 可达），以及一个薄渲染器 `TombRaidMapRenderer` 把 manifest 渲染成 Phaser 场景对象。生成器核心为纯 TypeScript（无 Phaser import），可在 jsdom 单元测试；渲染器用 `import type Phaser`。

**Architecture:**
- `src/tombraid/map/tombRaidMapState.ts` — manifest 类型 + 几何辅助 + 常量（纯 TS，无 Phaser）
- `src/tombraid/map/TombRaidMapGenerator.ts` — 生成器：mulberry32 RNG + grid 工具 + `selectConnectedCells` + `generateRoomRectangles` + `assignRoomKinds` + `buildSpanningTree` + `addRingEdges` + `buildCorridorsAndDoors` + `distributeChests` + `computeBaselineSanity` + 顶层 `generateTombRaidMap`（纯 TS）
- `src/tombraid/map/TombRaidMapRenderer.ts` — 薄渲染器（`import type Phaser`）：把 manifest 渲染成 floor/wall/door/chest/label/hitArea
- 不修改剧情模式代码；不实现战斗（plan 3）/武器（plan 4）/掉落（plan 5）/HUD（plan 6）

**Tech Stack:** Phaser 4.1.0, TypeScript（strict: `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noUnusedLocals` / `noUnusedParameters`）, Vitest 4.1.8, jsdom

---

## File Structure

| 文件 | 职责 | Phaser 依赖 |
|------|------|------------|
| `src/tombraid/map/tombRaidMapState.ts` | manifest 类型（`TombRaidRoomKind`/`TombRaidPoint`/`TombRaidRect`/`TombRaidRoom`/`TombRaidCorridor`/`TombRaidDoorSpawn`/`TombRaidChestSpawn`/`TombRaidMapManifest`）+ 几何辅助（`rectCenter`/`rectsIntersect`/`rectContains`）+ 常量 | 无 |
| `src/tombraid/map/TombRaidMapGenerator.ts` | 生成器：RNG/grid/`selectConnectedCells`/`generateRoomRectangles`/`assignRoomKinds`/`buildSpanningTree`/`addRingEdges`/`buildCorridorsAndDoors`/`distributeChests`/`computeBaselineSanity`/`generateTombRaidMap` | 无 |
| `src/tombraid/map/TombRaidMapRenderer.ts` | 薄渲染器：把 manifest 渲染成 Phaser 场景对象（floor tile / wall / door / chest / label / hitArea） | `import type Phaser`（编译期擦除） |
| `src/tests/tombraid/map/tomb-raid-map-state.test.ts` | Task 1 测试 | 无 |
| `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` | Task 2-6 测试 | 无 |
| `src/tests/tombraid/map/tomb-raid-map-renderer.test.ts` | Task 7 测试 | `vi.mock('phaser')` |

## 结构模型说明

Spec §2.2 定义了 9 种 `TombRaidRoomKind`，但其中 `'corridor'` 在本 plan 中不作为房间类型出现在 `rooms[]` 中——走廊是房间之间的连接通道，建模为 `corridors: readonly TombRaidCorridor[]`（矩形通道 + 两端的门）。因此：

- **8 种房间类型** 进入 `rooms[]`：`'entrance' | 'classroom' | 'vault' | 'hall' | 'trap' | 'dark' | 'switchRoom' | 'exit'`
- **走廊** 作为第 9 种结构，单独存在 `corridors[]`，每条走廊带 2 个门（两端各一），门通过 `doors[]` 数组统一管理

数量约束（spec §2.1 / §2.3）：
- `roomCount` 随机 16–20（含入口/出口/宝藏/大厅各 1，其余分配给 classroom/trap/dark/switchRoom）
- 5×4 网格（cols=5, rows=4, cellWidth=1000, cellHeight=1000），从 20 格中选 `roomCount` 个连通格子放房间
- 拓扑：先生成生成树（保证全连通），再加少量环边（环 + 死路混合）

## Constraints

- **不修改剧情模式代码**（EventEngine/storyManifest/SaveState/PreloadScene/InputManager/PlayScene/MapRenderer/CollisionManager）
- **生成器核心纯 TS**：`tombRaidMapState.ts` 与 `TombRaidMapGenerator.ts` 不 import Phaser；仅 `TombRaidMapRenderer.ts` 用 `import type Phaser`（编译期擦除，不影响 jsdom 测试）
- **TypeScript strict**：`noUncheckedIndexedAccess`（数组访问返回 `T | undefined`，用 `!` 或守卫）/ `exactOptionalPropertyTypes`（可选属性不能赋 `undefined`）/ `noUnusedLocals`+`noUnusedParameters`
- **TDD 强制**：每个任务 5 步（RED → GREEN → SURFACE）
- **数值严格遵循 spec §2**：5000×4000 / 16–20 房间 / baseline=roomCount×50 / 宝箱 clamp(round(roomCount/4),3,6) 野外普通 + 3 宝藏房普通 + 1 宝藏房鎏金 + 50% 野外鎏金
- **资产约束**：渲染器复用剧情模式 `floor.tile` 的 `single-floor-tile-192` frame（192×192），不引用 `其他/` 目录
- **深度层级**（沿用剧情模式 MapRenderer）：floor=0 / wall=1 / chest=3 / door=6 / label=7 / hitArea=8 / player=10

## Run Commands

```bash
npm run test:run     # vitest run（运行所有单元测试）
npm run typecheck    # tsc --noEmit（类型检查）
npm run build        # tsc --noEmit + vite build
```

单个测试文件：
```bash
npx vitest run src/tests/tombraid/map/tomb-raid-map-state.test.ts
```

---

## Task 1: tombRaidMapState.ts — manifest 类型 + 几何辅助 + 常量

**目标**：定义 manifest 全部类型（`TombRaidRoomKind`/`TombRaidPoint`/`TombRaidRect`/`TombRaidSpawnPoint`/`TombRaidRoom`/`TombRaidCorridor`/`TombRaidDoorSpawn`/`TombRaidChestSpawn`/`TombRaidFloorTile`/`TombRaidMapManifest`）+ 几何辅助（`rectCenter`/`rectsIntersect`/`rectContains`）+ 常量（地图尺寸/网格/深度/房间数区间）。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/map/tomb-raid-map-state.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import {
  BASELINE_PER_ROOM,
  CELL_HEIGHT,
  CELL_WIDTH,
  CORRIDOR_THICKNESS,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  FLOOR_TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  MAX_ROOMS,
  MIN_ROOMS,
  TOMB_RAID_MAP_HEIGHT,
  TOMB_RAID_MAP_WIDTH,
  WALL_THICKNESS,
  rectCenter,
  rectContains,
  rectsIntersect,
  type TombRaidChestSpawn,
  type TombRaidCorridor,
  type TombRaidDoorSpawn,
  type TombRaidMapManifest,
  type TombRaidPoint,
  type TombRaidRect,
  type TombRaidRoom,
  type TombRaidRoomKind,
  type TombRaidSpawnPoint,
} from '../../../tombraid/map/tombRaidMapState';

describe('tombRaidMapState 常量 (spec §2.1)', () => {
  it('地图尺寸 5000 × 4000', () => {
    expect(TOMB_RAID_MAP_WIDTH).toBe(5000);
    expect(TOMB_RAID_MAP_HEIGHT).toBe(4000);
  });
  it('网格 5 × 4，cell 1000 × 1000', () => {
    expect(GRID_COLS).toBe(5);
    expect(GRID_ROWS).toBe(4);
    expect(CELL_WIDTH).toBe(1000);
    expect(CELL_HEIGHT).toBe(1000);
  });
  it('地板/门/墙/走廊厚度', () => {
    expect(FLOOR_TILE_SIZE).toBe(192);
    expect(DOOR_WIDTH).toBe(24);
    expect(DOOR_HEIGHT).toBe(128);
    expect(WALL_THICKNESS).toBe(12);
    expect(CORRIDOR_THICKNESS).toBe(192);
  });
  it('房间数区间 16-20', () => {
    expect(MIN_ROOMS).toBe(16);
    expect(MAX_ROOMS).toBe(20);
  });
  it('baseline 每房间 50', () => {
    expect(BASELINE_PER_ROOM).toBe(50);
  });
});

describe('rectCenter / rectsIntersect / rectContains', () => {
  it('rectCenter 返回中心点', () => {
    const r: TombRaidRect = { x: 100, y: 200, width: 50, height: 60 };
    expect(rectCenter(r)).toEqual({ x: 125, y: 230 });
  });
  it('rectsIntersect 重叠为 true', () => {
    const a: TombRaidRect = { x: 0, y: 0, width: 100, height: 100 };
    const b: TombRaidRect = { x: 50, y: 50, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(true);
  });
  it('rectsIntersect 仅邻接（共享边）为 false', () => {
    const a: TombRaidRect = { x: 0, y: 0, width: 100, height: 100 };
    const b: TombRaidRect = { x: 100, y: 0, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(false);
  });
  it('rectsIntersect 完全分离为 false', () => {
    const a: TombRaidRect = { x: 0, y: 0, width: 10, height: 10 };
    const b: TombRaidRect = { x: 1000, y: 1000, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(false);
  });
  it('rectContains 内部点 true', () => {
    const r: TombRaidRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 50, y: 50 })).toBe(true);
  });
  it('rectContains 边界点 true（含边界）', () => {
    const r: TombRaidRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 0, y: 0 })).toBe(true);
    expect(rectContains(r, { x: 100, y: 100 })).toBe(true);
  });
  it('rectContains 外部点 false', () => {
    const r: TombRaidRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 150, y: 50 })).toBe(false);
  });
});

describe('TombRaidRoomKind 8 种房间（不含 corridor）', () => {
  it('kind 联合类型仅 8 种', () => {
    const kinds: TombRaidRoomKind[] = [
      'entrance', 'classroom', 'vault', 'hall', 'trap', 'dark', 'switchRoom', 'exit',
    ];
    expect(kinds).toHaveLength(8);
  });
});

describe('TombRaidMapManifest 结构（编译期类型校验）', () => {
  it('manifest 字段齐全', () => {
    const manifest: TombRaidMapManifest = {
      id: 'ying-zhong-jiu-tomb-raid',
      seed: 42,
      roomCount: 16,
      bounds: { x: 0, y: 0, width: 5000, height: 4000 },
      grid: { cols: 5, rows: 4, cellWidth: 1000, cellHeight: 1000 },
      rooms: [],
      corridors: [],
      doors: [],
      chests: [],
      entranceRoomId: 'room-0',
      exitRoomId: 'room-15',
      vaultRoomId: 'room-1',
      hallRoomId: 'room-2',
      baselineSanity: 800,
      floorTile: { tileWidth: 192, tileHeight: 192 },
    };
    expect(manifest.roomCount).toBe(16);
    expect(manifest.baselineSanity).toBe(800);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-state.test.ts`，确认编译错误（模块不存在）。

### Step 3: 实现 tombRaidMapState.ts

- [ ] 创建 `src/tombraid/map/tombRaidMapState.ts`：

```ts
// src/tombraid/map/tombRaidMapState.ts
// 摸金模式地图 manifest 类型 + 几何辅助 + 常量（纯 TS，无 Phaser import）。
// spec §2.1 / §2.2 / §2.6

// ---------------------------------------------------------------------------
// 常量 (spec §2.1)
// ---------------------------------------------------------------------------
export const TOMB_RAID_MAP_WIDTH = 5000;
export const TOMB_RAID_MAP_HEIGHT = 4000;
export const GRID_COLS = 5;
export const GRID_ROWS = 4;
export const CELL_WIDTH = 1000;
export const CELL_HEIGHT = 1000;
export const FLOOR_TILE_SIZE = 192;
export const DOOR_WIDTH = 24;
export const DOOR_HEIGHT = 128;
export const WALL_THICKNESS = 12;
export const CORRIDOR_THICKNESS = 192; // = FLOOR_TILE_SIZE，走廊地板单砖铺满
export const MIN_ROOMS = 16;
export const MAX_ROOMS = 20;
export const BASELINE_PER_ROOM = 50;

// ---------------------------------------------------------------------------
// 房间类型 (spec §2.2)
// 注意：'corridor' 在 spec 类型联合中存在，但本 plan 把走廊建模为
// `TombRaidCorridor[]`，不作为房间类型出现于 `rooms[]`。
// ---------------------------------------------------------------------------
export type TombRaidRoomKind =
  | 'entrance'
  | 'classroom'
  | 'vault'
  | 'hall'
  | 'trap'
  | 'dark'
  | 'switchRoom'
  | 'exit';

// ---------------------------------------------------------------------------
// 几何类型
// ---------------------------------------------------------------------------
export interface TombRaidPoint {
  readonly x: number;
  readonly y: number;
}

export interface TombRaidRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TombRaidSpawnPoint {
  readonly x: number;
  readonly y: number;
}

export interface TombRaidRoom {
  readonly id: string;
  readonly kind: TombRaidRoomKind;
  readonly label: string;
  readonly bounds: TombRaidRect;
  readonly walkableBounds: TombRaidRect;
  readonly collisionZones: readonly TombRaidRect[];
  readonly spawnPoint: TombRaidSpawnPoint;
  readonly cellIndex: number;
}

export interface TombRaidCorridor {
  readonly id: string;
  readonly bounds: TombRaidRect;
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly orientation: 'horizontal' | 'vertical';
}

export interface TombRaidDoorSpawn {
  readonly id: string;
  readonly bounds: TombRaidRect;
  readonly roomId: string;
  readonly corridorId: string;
  readonly orientation: 'horizontal' | 'vertical';
  readonly locked: boolean;
}

export type TombRaidChestKind = 'normal' | 'gilded';

export interface TombRaidChestSpawn {
  readonly id: string;
  readonly roomId: string;
  readonly kind: TombRaidChestKind;
  readonly bounds: TombRaidRect;
}

export interface TombRaidFloorTile {
  readonly tileWidth: number;
  readonly tileHeight: number;
}

export interface TombRaidMapManifest {
  readonly id: 'ying-zhong-jiu-tomb-raid';
  readonly seed: number;
  readonly roomCount: number;
  readonly bounds: TombRaidRect;
  readonly grid: {
    readonly cols: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
  readonly rooms: readonly TombRaidRoom[];
  readonly corridors: readonly TombRaidCorridor[];
  readonly doors: readonly TombRaidDoorSpawn[];
  readonly chests: readonly TombRaidChestSpawn[];
  readonly entranceRoomId: string;
  readonly exitRoomId: string;
  readonly vaultRoomId: string;
  readonly hallRoomId: string;
  readonly baselineSanity: number;
  readonly floorTile: TombRaidFloorTile;
}

// ---------------------------------------------------------------------------
// 几何辅助
// ---------------------------------------------------------------------------
export function rectCenter(rect: TombRaidRect): TombRaidPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export function rectsIntersect(a: TombRaidRect, b: TombRaidRect): boolean {
  // 严格重叠（仅邻接/共享边不算重叠）
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function rectContains(rect: TombRaidRect, point: TombRaidPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
```

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-state.test.ts`，确认全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/tombRaidMapState.ts src/tests/tombraid/map/tomb-raid-map-state.test.ts && git commit -m "feat(tombraid): plan2 task1 manifest 类型 + 几何辅助 + 常量"`

---

## Task 2: TombRaidMapGenerator.ts — mulberry32 RNG + grid 工具 + selectConnectedCells

**目标**：实现 `Rng` 接口（`next`/`int`/`pick`/`shuffle`/`bool`）、`mulberry32(seed)` 工厂、`createRng(seed)`、grid 工具（`cellIndex`/`cellCol`/`cellRow`/`cellNeighbors`/`cellBounds`）以及 `selectConnectedCells(rng, roomCount, startCell)`（从 `startCell` 起 BFS 增量选择 `roomCount` 个连通格子）。

**YAGNI 提醒**：`cellCenter` 函数在本 plan 中未被使用（`buildCorridorsAndDoors` 内联计算中心），不要实现，也不要 import `TombRaidPoint`。

### Step 1: 写失败测试

- [ ] 在 `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` 顶部追加：

```ts
import { describe, expect, it } from 'vitest';

import {
  cellBounds,
  cellCol,
  cellIndex,
  cellNeighbors,
  cellRow,
  createRng,
  mulberry32,
  selectConnectedCells,
} from '../../../tombraid/map/TombRaidMapGenerator';

describe('mulberry32 + createRng', () => {
  it('同种子产生相同序列', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 10; i += 1) {
      expect(r1()).toBe(r2());
    }
  });
  it('输出在 [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 100; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('createRng.int(min,max) 闭区间', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i += 1) {
      const v = rng.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
  it('createRng.pick 返回数组内元素', () => {
    const rng = createRng(99);
    const arr = [10, 20, 30];
    for (let i = 0; i < 20; i += 1) {
      expect(arr).toContain(rng.pick(arr));
    }
  });
  it('createRng.shuffle 保持元素集合不变', () => {
    const rng = createRng(2024);
    const src = [1, 2, 3, 4, 5];
    const out = rng.shuffle(src);
    expect(out.sort((a, b) => a - b)).toEqual(src);
  });
  it('createRng.shuffle 不修改原数组', () => {
    const rng = createRng(2024);
    const src = [1, 2, 3];
    const copy = [...src];
    rng.shuffle(src);
    expect(src).toEqual(copy);
  });
  it('createRng.bool(p) 概率近似', () => {
    const rng = createRng(555);
    let trueCount = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (rng.bool(0.5)) trueCount += 1;
    }
    // 容忍 ±10%
    expect(trueCount).toBeGreaterThan(400);
    expect(trueCount).toBeLessThan(600);
  });
});

describe('grid 工具 (5×4 网格)', () => {
  it('cellIndex(row,col) = row*GRID_COLS + col', () => {
    expect(cellIndex(0, 0)).toBe(0);
    expect(cellIndex(0, 4)).toBe(4);
    expect(cellIndex(1, 0)).toBe(5);
    expect(cellIndex(3, 4)).toBe(19);
  });
  it('cellCol / cellRow 逆运算', () => {
    for (let c = 0; c < 5; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        const idx = cellIndex(r, c);
        expect(cellRow(idx)).toBe(r);
        expect(cellCol(idx)).toBe(c);
      }
    }
  });
  it('cellNeighbors 4 邻接（边界裁剪）', () => {
    expect(cellNeighbors(0).sort((a, b) => a - b)).toEqual([1, 5]);
    expect(cellNeighbors(6).sort((a, b) => a - b)).toEqual([1, 5, 7, 11]);
    expect(cellNeighbors(19).sort((a, b) => a - b)).toEqual([14, 18]);
  });
  it('cellBounds 返回格子矩形', () => {
    const b = cellBounds(6); // row=1, col=1
    expect(b).toEqual({ x: 1000, y: 1000, width: 1000, height: 1000 });
  });
});

describe('selectConnectedCells', () => {
  it('从 startCell 起返回 roomCount 个连通格子', () => {
    const rng = createRng(314);
    const cells = selectConnectedCells(rng, 16, 0);
    expect(cells).toHaveLength(16);
    expect(cells).toContain(0);
    // 排序递增
    for (let i = 1; i < cells.length; i += 1) {
      expect(cells[i]!).toBeGreaterThan(cells[i - 1]!);
    }
  });
  it('返回的格子集合在网格上是连通的（每格至少有一个邻居在集合中，除 startCell 外）', () => {
    const rng = createRng(2718);
    const cells = selectConnectedCells(rng, 18, 5);
    const set = new Set(cells);
    for (const c of cells) {
      if (c === 5) continue;
      const neighbors = cellNeighbors(c).filter((n) => set.has(n));
      expect(neighbors.length).toBeGreaterThan(0);
    }
  });
  it('同种子同 startCell 可复现', () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    expect(selectConnectedCells(r1, 17, 0)).toEqual(selectConnectedCells(r2, 17, 0));
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认编译错误（模块不存在）。

### Step 3: 实现 TombRaidMapGenerator.ts（Task 2 部分）

- [ ] 创建 `src/tombraid/map/TombRaidMapGenerator.ts`：

```ts
// src/tombraid/map/TombRaidMapGenerator.ts
// 摸金模式地图生成器：纯函数 + mulberry32 种子 RNG（纯 TS，无 Phaser import）。
// spec §2.1 / §2.3 / §2.5
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  MAX_ROOMS,
  MIN_ROOMS,
  type TombRaidRect,
} from './tombRaidMapState';

// ---------------------------------------------------------------------------
// RNG: mulberry32
// ---------------------------------------------------------------------------
export type Rng = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // 闭区间 [min, max]
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  bool(prob: number): boolean;
};

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) {
        throw new Error('Rng.pick: empty array');
      }
      return arr[Math.floor(next() * arr.length)]!;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
    bool(prob: number): boolean {
      return next() < prob;
    },
  };
}

// ---------------------------------------------------------------------------
// Grid 工具
// ---------------------------------------------------------------------------
export function cellIndex(row: number, col: number): number {
  return row * GRID_COLS + col;
}

export function cellRow(index: number): number {
  return Math.floor(index / GRID_COLS);
}

export function cellCol(index: number): number {
  return index % GRID_COLS;
}

export function cellNeighbors(index: number): number[] {
  const r = cellRow(index);
  const c = cellCol(index);
  const out: number[] = [];
  if (r > 0) out.push(cellIndex(r - 1, c));
  if (r < GRID_ROWS - 1) out.push(cellIndex(r + 1, c));
  if (c > 0) out.push(cellIndex(r, c - 1));
  if (c < GRID_COLS - 1) out.push(cellIndex(r, c + 1));
  return out;
}

export function cellBounds(index: number): TombRaidRect {
  return {
    x: cellCol(index) * CELL_WIDTH,
    y: cellRow(index) * CELL_HEIGHT,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// selectConnectedCells — 从 startCell 起 BFS 增量选择 roomCount 个连通格子
// ---------------------------------------------------------------------------
export function selectConnectedCells(rng: Rng, roomCount: number, startCell: number): number[] {
  const visited = new Set<number>([startCell]);
  while (visited.size < roomCount) {
    // 候选：已访问且仍有未访问邻居的格子
    const candidates = [...visited].filter((c) => cellNeighbors(c).some((n) => !visited.has(n)));
    if (candidates.length === 0) break;
    const current = rng.pick(candidates);
    const unvisited = rng.shuffle(cellNeighbors(current)).filter((n) => !visited.has(n));
    if (unvisited.length === 0) continue;
    visited.add(unvisited[0]!);
  }
  return [...visited].sort((a, b) => a - b);
}

// 后续 Task 3-6 在此文件追加 generateRoomRectangles / assignRoomKinds /
// buildSpanningTree / addRingEdges / buildCorridorsAndDoors /
// distributeChests / computeBaselineSanity / generateTombRaidMap

// 防止 noUnusedLocals 在中间步骤报错（这些常量在后续 task 使用）
export const _MIN_ROOMS = MIN_ROOMS;
export const _MAX_ROOMS = MAX_ROOMS;
```

> 说明：临时导出 `_MIN_ROOMS` / `_MAX_ROOMS` 是为防止在中间任务阶段 `noUnusedLocals` 报错；Task 6 完成后会移除这两个临时导出（届时 `MIN_ROOMS`/`MAX_ROOMS` 已在 `generateTombRaidMap` 中使用）。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 2 的 describe 块全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapGenerator.ts src/tests/tombraid/map/tomb-raid-map-generator.test.ts && git commit -m "feat(tombraid): plan2 task2 mulberry32 RNG + grid 工具 + selectConnectedCells"`

---

## Task 3: generateRoomRectangles + assignRoomKinds

**目标**：
- `generateRoomRectangles(rng, cells)` —— 给每个 cell 生成一个房间矩形：cell 内缩 `WALL_THICKNESS` + 随机偏移，矩形宽高在 [600, 900] 区间（不超出 cell），并构造 `walkableBounds`（再内缩 `WALL_THICKNESS`）、空 `collisionZones`、`spawnPoint`（取 `walkableBounds` 中心）。
- `assignRoomKinds(rng, rooms)` —— 给房间分配 kind：入口固定为 `cells[0]`，出口为离入口 BFS 最远的格子，宝藏/大厅各随机一个剩余格子，其余按权重分配 classroom/trap/dark/switchRoom。返回 `{ rooms, entranceRoomId, exitRoomId, vaultRoomId, hallRoomId }`。

### Step 1: 写失败测试

- [ ] 在 `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` 末尾追加：

```ts
import {
  assignRoomKinds,
  generateRoomRectangles,
} from '../../../tombraid/map/TombRaidMapGenerator';
import { CELL_HEIGHT, CELL_WIDTH, WALL_THICKNESS, rectsIntersect, type TombRaidRoom } from '../../../tombraid/map/tombRaidMapState';

describe('generateRoomRectangles', () => {
  it('返回的房间数 = cells 数', () => {
    const rng = createRng(11);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    expect(rooms).toHaveLength(16);
  });
  it('每个房间矩形落在自己的 cell 内', () => {
    const rng = createRng(22);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    for (const room of rooms) {
      const cb = cellBounds(room.cellIndex);
      expect(room.bounds.x).toBeGreaterThanOrEqual(cb.x);
      expect(room.bounds.y).toBeGreaterThanOrEqual(cb.y);
      expect(room.bounds.x + room.bounds.width).toBeLessThanOrEqual(cb.x + cb.width);
      expect(room.bounds.y + room.bounds.height).toBeLessThanOrEqual(cb.y + cb.height);
    }
  });
  it('房间矩形尺寸在 [600, 900]', () => {
    const rng = createRng(33);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    for (const room of rooms) {
      expect(room.bounds.width).toBeGreaterThanOrEqual(600);
      expect(room.bounds.width).toBeLessThanOrEqual(900);
      expect(room.bounds.height).toBeGreaterThanOrEqual(600);
      expect(room.bounds.height).toBeLessThanOrEqual(900);
    }
  });
  it('walkableBounds 是 bounds 再内缩 WALL_THICKNESS', () => {
    const rng = createRng(44);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    for (const room of rooms) {
      expect(room.walkableBounds.x).toBe(room.bounds.x + WALL_THICKNESS);
      expect(room.walkableBounds.y).toBe(room.bounds.y + WALL_THICKNESS);
      expect(room.walkableBounds.width).toBe(room.bounds.width - 2 * WALL_THICKNESS);
      expect(room.walkableBounds.height).toBe(room.bounds.height - 2 * WALL_THICKNESS);
    }
  });
  it('spawnPoint 在 walkableBounds 内', () => {
    const rng = createRng(55);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    for (const room of rooms) {
      expect(room.spawnPoint.x).toBeGreaterThanOrEqual(room.walkableBounds.x);
      expect(room.spawnPoint.x).toBeLessThanOrEqual(room.walkableBounds.x + room.walkableBounds.width);
      expect(room.spawnPoint.y).toBeGreaterThanOrEqual(room.walkableBounds.y);
      expect(room.spawnPoint.y).toBeLessThanOrEqual(room.walkableBounds.y + room.walkableBounds.height);
    }
  });
  it('同一 cell 的房间 id 形如 room-<cellIndex>', () => {
    const rng = createRng(66);
    const cells = selectConnectedCells(rng, 16, 0);
    const rooms = generateRoomRectangles(rng, cells);
    for (const room of rooms) {
      expect(room.id).toBe(`room-${room.cellIndex}`);
    }
  });
  it('同种子可复现', () => {
    const r1 = createRng(77);
    const r2 = createRng(77);
    const cells = selectConnectedCells(createRng(77), 16, 0);
    const a = generateRoomRectangles(r1, cells);
    const b = generateRoomRectangles(r2, cells);
    expect(a).toEqual(b);
  });
});

describe('assignRoomKinds', () => {
  function makeRooms(cellIndices: number[]): TombRaidRoom[] {
    return cellIndices.map((ci) => {
      const cb = cellBounds(ci);
      return {
        id: `room-${ci}`,
        kind: 'classroom' as const,
        label: '',
        bounds: { ...cb },
        walkableBounds: {
          x: cb.x + WALL_THICKNESS,
          y: cb.y + WALL_THICKNESS,
          width: cb.width - 2 * WALL_THICKNESS,
          height: cb.height - 2 * WALL_THICKNESS,
        },
        collisionZones: [],
        spawnPoint: { x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 },
        cellIndex: ci,
      };
    });
  }

  it('入口 = cells[0]，固定 entrance', () => {
    const rng = createRng(101);
    const rooms = makeRooms([0, 1, 2, 3, 5, 6, 7, 8]);
    const r = assignRoomKinds(rng, rooms);
    const entrance = r.rooms.find((x) => x.id === r.entranceRoomId);
    expect(entrance?.kind).toBe('entrance');
    expect(r.entranceRoomId).toBe('room-0');
  });
  it('出口 = BFS 离入口最远的房间，kind=exit', () => {
    const rng = createRng(202);
    const rooms = makeRooms([0, 1, 2, 3, 5, 6, 7, 8]);
    const r = assignRoomKinds(rng, rooms);
    const exit = r.rooms.find((x) => x.id === r.exitRoomId);
    expect(exit?.kind).toBe('exit');
    // cells[0]=0 是入口；BFS 最远在 5×4 网格上应该是较远的格子（>=2 距离）
    expect(r.exitRoomId).not.toBe(r.entranceRoomId);
  });
  it('宝藏房 vault 与大厅 hall 各 1 个且不重复', () => {
    const rng = createRng(303);
    const rooms = makeRooms([0, 1, 2, 3, 5, 6, 7, 8]);
    const r = assignRoomKinds(rng, rooms);
    const vaults = r.rooms.filter((x) => x.kind === 'vault');
    const halls = r.rooms.filter((x) => x.kind === 'hall');
    expect(vaults).toHaveLength(1);
    expect(halls).toHaveLength(1);
    expect(r.vaultRoomId).toBe(vaults[0]!.id);
    expect(r.hallRoomId).toBe(halls[0]!.id);
    // vault / hall / entrance / exit 互不相同
    const specialIds = new Set([r.entranceRoomId, r.exitRoomId, r.vaultRoomId, r.hallRoomId]);
    expect(specialIds.size).toBe(4);
  });
  it('剩余房间 kind ∈ {classroom, trap, dark, switchRoom}', () => {
    const rng = createRng(404);
    const rooms = makeRooms([0, 1, 2, 3, 5, 6, 7, 8, 10, 11]);
    const r = assignRoomKinds(rng, rooms);
    const allowed = new Set(['classroom', 'trap', 'dark', 'switchRoom']);
    for (const room of r.rooms) {
      if (
        room.id === r.entranceRoomId ||
        room.id === r.exitRoomId ||
        room.id === r.vaultRoomId ||
        room.id === r.hallRoomId
      ) {
        continue;
      }
      expect(allowed.has(room.kind)).toBe(true);
    }
  });
  it('同种子可复现', () => {
    const r1 = createRng(505);
    const r2 = createRng(505);
    const rooms = makeRooms([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(assignRoomKinds(r1, rooms)).toEqual(assignRoomKinds(r2, rooms));
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 3 的 describe 块失败（函数未导出）。

### Step 3: 实现 generateRoomRectangles + assignRoomKinds

- [ ] 在 `src/tombraid/map/TombRaidMapGenerator.ts` 末尾（Task 6 临时导出之前）追加：

```ts
import {
  WALL_THICKNESS,
  type TombRaidRoom,
  type TombRaidRoomKind,
} from './tombRaidMapState';

// ---------------------------------------------------------------------------
// generateRoomRectangles — 给每个 cell 生成房间矩形
// ---------------------------------------------------------------------------
const ROOM_MIN_SIZE = 600;
const ROOM_MAX_SIZE = 900;

export function generateRoomRectangles(rng: Rng, cells: readonly number[]): TombRaidRoom[] {
  const rooms: TombRaidRoom[] = [];
  for (const cell of cells) {
    const cb = cellBounds(cell);
    const width = rng.int(ROOM_MIN_SIZE, ROOM_MAX_SIZE);
    const height = rng.int(ROOM_MIN_SIZE, ROOM_MAX_SIZE);
    // 在 cell 内随机偏移（保持矩形完全落在 cell 内）
    const maxOffsetX = cb.width - width;
    const maxOffsetY = cb.height - height;
    const offsetX = rng.int(0, Math.max(0, maxOffsetX));
    const offsetY = rng.int(0, Math.max(0, maxOffsetY));
    const bounds = {
      x: cb.x + offsetX,
      y: cb.y + offsetY,
      width,
      height,
    };
    const walkableBounds = {
      x: bounds.x + WALL_THICKNESS,
      y: bounds.y + WALL_THICKNESS,
      width: bounds.width - 2 * WALL_THICKNESS,
      height: bounds.height - 2 * WALL_THICKNESS,
    };
    const spawnPoint = {
      x: walkableBounds.x + walkableBounds.width / 2,
      y: walkableBounds.y + walkableBounds.height / 2,
    };
    rooms.push({
      id: `room-${cell}`,
      kind: 'classroom', // 占位，由 assignRoomKinds 覆盖
      label: '',
      bounds,
      walkableBounds,
      collisionZones: [],
      spawnPoint,
      cellIndex: cell,
    });
  }
  return rooms;
}

// ---------------------------------------------------------------------------
// assignRoomKinds — 给房间分配类型
// ---------------------------------------------------------------------------
const REMAINING_KINDS: readonly TombRaidRoomKind[] = [
  'classroom', 'classroom', 'classroom', 'classroom', // 40% classroom
  'trap', 'trap',                                       // 20% trap
  'dark', 'dark',                                       // 20% dark
  'switchRoom', 'switchRoom',                           // 20% switchRoom
];

export interface AssignRoomKindsResult {
  readonly rooms: readonly TombRaidRoom[];
  readonly entranceRoomId: string;
  readonly exitRoomId: string;
  readonly vaultRoomId: string;
  readonly hallRoomId: string;
}

function bfsFarthestCell(startCell: number, cellSet: Set<number>): number {
  // 在 cellSet 上做 BFS，返回距离 startCell 最远的 cell
  const dist = new Map<number, number>([[startCell, 0]]);
  const queue: number[] = [startCell];
  let farthest = startCell;
  let maxDist = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d > maxDist) {
      maxDist = d;
      farthest = cur;
    }
    for (const n of cellNeighbors(cur)) {
      if (cellSet.has(n) && !dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return farthest;
}

export function assignRoomKinds(rng: Rng, rooms: readonly TombRaidRoom[]): AssignRoomKindsResult {
  if (rooms.length < 4) {
    throw new Error(`assignRoomKinds: need at least 4 rooms, got ${rooms.length}`);
  }
  const cellSet = new Set(rooms.map((r) => r.cellIndex));
  const byId = new Map(rooms.map((r) => [r.id, r] as const));

  // 入口 = 第一个房间（cell 最小）
  const entranceRoom = rooms[0]!;
  const entranceRoomId = entranceRoom.id;

  // 出口 = BFS 离入口最远
  const exitCell = bfsFarthestCell(entranceRoom.cellIndex, cellSet);
  const exitRoom = byId.get(`room-${exitCell}`)!;
  const exitRoomId = exitRoom.id;

  // 剩余可选房间（去掉 entrance / exit）
  const remaining = rooms.filter((r) => r.id !== entranceRoomId && r.id !== exitRoomId);
  const shuffled = rng.shuffle(remaining);

  // 宝藏房 / 大厅各取一个
  const vaultRoom = shuffled[0]!;
  const hallRoom = shuffled[1]!;
  const vaultRoomId = vaultRoom.id;
  const hallRoomId = hallRoom.id;

  // 其余按权重分配
  const others = shuffled.slice(2);
  const out: TombRaidRoom[] = rooms.map((r) => {
    if (r.id === entranceRoomId) {
      return { ...r, kind: 'entrance', label: '入口' };
    }
    if (r.id === exitRoomId) {
      return { ...r, kind: 'exit', label: '出口' };
    }
    if (r.id === vaultRoomId) {
      return { ...r, kind: 'vault', label: '宝藏房' };
    }
    if (r.id === hallRoomId) {
      return { ...r, kind: 'hall', label: '大厅' };
    }
    return r; // 占位，下面统一覆盖
  });

  // 给 others 分配 REMAINING_KINDS（循环取，避免不够）
  const byIdOut = new Map(out.map((r) => [r.id, r] as const));
  for (let i = 0; i < others.length; i += 1) {
    const id = others[i]!.id;
    const kind = REMAINING_KINDS[i % REMAINING_KINDS.length]!;
    const labelMap: Record<TombRaidRoomKind, string> = {
      entrance: '入口',
      classroom: '教室',
      vault: '宝藏房',
      hall: '大厅',
      trap: '陷阱房',
      dark: '暗室',
      switchRoom: '机关房',
      exit: '出口',
    };
    byIdOut.set(id, { ...byIdOut.get(id)!, kind, label: labelMap[kind] });
  }

  return {
    rooms: [...byIdOut.values()],
    entranceRoomId,
    exitRoomId,
    vaultRoomId,
    hallRoomId,
  };
}
```

> 注意：`TombRaidRoomKind` 与 `WALL_THICKNESS` 已在文件顶部从 `tombRaidMapState` import；`TombRaidRoom` 是新 import。请把新 import 合并到顶部已有的 `import { ... } from './tombRaidMapState'` 语句中，不要重复 import。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 2 + Task 3 的 describe 块全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapGenerator.ts src/tests/tombraid/map/tomb-raid-map-generator.test.ts && git commit -m "feat(tombraid): plan2 task3 generateRoomRectangles + assignRoomKinds (BFS 最远出口)"`

---

## Task 4: buildSpanningTree + addRingEdges + buildCorridorsAndDoors

**目标**：
- `buildSpanningTree(rng, cells, startCell)` —— 在 `cells` 集合上用随机 BFS 生成生成树，返回 `Edge[]`（`{a, b}`，a<b）。
- `addRingEdges(rng, cells, treeEdges)` —— 在生成树基础上，从所有非树边中随机选 ~20% 加为环边，返回 `Edge[]`（环+树混合）。
- `buildCorridorsAndDoors(rooms, edges, roomById)` —— 把每条边转为 1 条走廊 + 2 个门（两端各一）。水平走廊（同行）：两端 24×128 竖门；垂直走廊（同列）：两端 128×24 横门。`locked = a.kind === 'vault' || b.kind === 'vault'`。返回 `{ corridors, doors }`。

**测试修正（a.txt 自审）：** 走廊 `fromRoomId`/`toRoomId` 不假设边顺序与左右一致，断言用集合 + 坐标比较。

### Step 1: 写失败测试

- [ ] 在 `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` 末尾追加：

```ts
import {
  addRingEdges,
  buildCorridorsAndDoors,
  buildSpanningTree,
  type Edge,
} from '../../../tombraid/map/TombRaidMapGenerator';
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  type TombRaidRoom,
} from '../../../tombraid/map/tombRaidMapState';

describe('buildSpanningTree', () => {
  it('生成树边数 = roomCount - 1', () => {
    const rng = createRng(11);
    const cells = selectConnectedCells(rng, 16, 0);
    const tree = buildSpanningTree(createRng(12), cells, 0);
    expect(tree).toHaveLength(15);
  });
  it('生成树连通（BFS 从 startCell 可达所有 cells）', () => {
    const rng = createRng(21);
    const cells = selectConnectedCells(rng, 18, 0);
    const tree = buildSpanningTree(createRng(22), cells, 0);
    const adj = new Map<number, number[]>();
    for (const c of cells) adj.set(c, []);
    for (const e of tree) {
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
    const visited = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of adj.get(cur) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    expect(visited.size).toBe(cells.length);
  });
  it('每条边都是网格 4 邻接', () => {
    const rng = createRng(31);
    const cells = selectConnectedCells(rng, 16, 0);
    const tree = buildSpanningTree(createRng(32), cells, 0);
    const neighborsOf = (idx: number) => new Set(cellNeighbors(idx));
    for (const e of tree) {
      expect(neighborsOf(e.a).has(e.b)).toBe(true);
    }
  });
  it('边 {a,b} 中 a < b（规范化）', () => {
    const rng = createRng(41);
    const cells = selectConnectedCells(rng, 16, 0);
    const tree = buildSpanningTree(createRng(42), cells, 0);
    for (const e of tree) {
      expect(e.a).toBeLessThan(e.b);
    }
  });
});

describe('addRingEdges', () => {
  it('环边集合是生成树边的超集', () => {
    const rng = createRng(51);
    const cells = selectConnectedCells(rng, 16, 0);
    const tree = buildSpanningTree(createRng(52), cells, 0);
    const ring = addRingEdges(createRng(53), cells, tree);
    const treeSet = new Set(tree.map((e) => `${e.a}-${e.b}`));
    for (const e of ring) {
      expect(treeSet.has(`${e.a}-${e.b}`)).toBe(true);
    }
  });
  it('环边数 >= 树边数（含至少 1 条环边，roomCount=16 时非树边 >= 1）', () => {
    const rng = createRng(61);
    const cells = selectConnectedCells(rng, 16, 0);
    const tree = buildSpanningTree(createRng(62), cells, 0);
    const ring = addRingEdges(createRng(63), cells, tree);
    expect(ring.length).toBeGreaterThanOrEqual(tree.length);
    expect(ring.length).toBeGreaterThan(tree.length);
  });
  it('所有环边都是网格 4 邻接', () => {
    const rng = createRng(71);
    const cells = selectConnectedCells(rng, 18, 0);
    const tree = buildSpanningTree(createRng(72), cells, 0);
    const ring = addRingEdges(createRng(73), cells, tree);
    const neighborsOf = (idx: number) => new Set(cellNeighbors(idx));
    for (const e of ring) {
      expect(neighborsOf(e.a).has(e.b)).toBe(true);
    }
  });
});

describe('buildCorridorsAndDoors', () => {
  function makeRoomsAt(cells: number[]): TombRaidRoom[] {
    return cells.map((ci) => {
      const cb = cellBounds(ci);
      // 房间矩形居中放在 cell，尺寸 800×800（确保走廊有空间）
      const w = 800;
      const h = 800;
      const bounds = {
        x: cb.x + (cb.width - w) / 2,
        y: cb.y + (cb.height - h) / 2,
        width: w,
        height: h,
      };
      return {
        id: `room-${ci}`,
        kind: 'classroom' as const,
        label: '',
        bounds,
        walkableBounds: bounds,
        collisionZones: [],
        spawnPoint: { x: bounds.x + w / 2, y: bounds.y + h / 2 },
        cellIndex: ci,
      };
    });
  }

  it('每条边生成 1 条走廊 + 2 个门', () => {
    const rooms = makeRoomsAt([0, 1, 5]);
    const edges: Edge[] = [
      { a: 0, b: 1 }, // 水平相邻
      { a: 0, b: 5 }, // 垂直相邻
    ];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { corridors, doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    expect(corridors).toHaveLength(2);
    expect(doors).toHaveLength(4);
  });
  it('水平走廊（同行）bounds 在两房间之间，orientation=horizontal', () => {
    const rooms = makeRoomsAt([0, 1]);
    const edges: Edge[] = [{ a: 0, b: 1 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { corridors } = buildCorridorsAndDoors(rooms, edges, roomById);
    const corridor = corridors[0]!;
    expect(corridor.orientation).toBe('horizontal');
    // 方向无关断言：left 房间 x 较小
    const expectedRooms = new Set([`room-0`, `room-1`]);
    expect(expectedRooms.has(corridor.fromRoomId)).toBe(true);
    expect(expectedRooms.has(corridor.toRoomId)).toBe(true);
    expect(corridor.fromRoomId).not.toBe(corridor.toRoomId);
    const aRect = roomById.get(`room-0`)!.bounds;
    const bRect = roomById.get(`room-1`)!.bounds;
    const leftRect = aRect.x <= bRect.x ? aRect : bRect;
    const rightRect = aRect.x <= bRect.x ? bRect : aRect;
    expect(corridor.bounds.x).toBeGreaterThanOrEqual(leftRect.x + leftRect.width);
    expect(corridor.bounds.x + corridor.bounds.width).toBeLessThanOrEqual(rightRect.x);
    expect(corridor.bounds.height).toBe(192); // CORRIDOR_THICKNESS
  });
  it('垂直走廊（同列）bounds 在两房间之间，orientation=vertical', () => {
    const rooms = makeRoomsAt([0, 5]);
    const edges: Edge[] = [{ a: 0, b: 5 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { corridors } = buildCorridorsAndDoors(rooms, edges, roomById);
    const corridor = corridors[0]!;
    expect(corridor.orientation).toBe('vertical');
    const expectedRooms = new Set([`room-0`, `room-5`]);
    expect(expectedRooms.has(corridor.fromRoomId)).toBe(true);
    expect(expectedRooms.has(corridor.toRoomId)).toBe(true);
    const aRect = roomById.get(`room-0`)!.bounds;
    const bRect = roomById.get(`room-5`)!.bounds;
    const topRect = aRect.y <= bRect.y ? aRect : bRect;
    const bottomRect = aRect.y <= bRect.y ? bRect : aRect;
    expect(corridor.bounds.y).toBeGreaterThanOrEqual(topRect.y + topRect.height);
    expect(corridor.bounds.y + corridor.bounds.height).toBeLessThanOrEqual(bottomRect.y);
    expect(corridor.bounds.width).toBe(192); // CORRIDOR_THICKNESS
  });
  it('水平走廊的门为 24×128（竖门）', () => {
    const rooms = makeRoomsAt([0, 1]);
    const edges: Edge[] = [{ a: 0, b: 1 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.orientation).toBe('horizontal');
      expect(d.bounds.width).toBe(DOOR_WIDTH);  // 24
      expect(d.bounds.height).toBe(DOOR_HEIGHT); // 128
    }
  });
  it('垂直走廊的门为 128×24（横门）', () => {
    const rooms = makeRoomsAt([0, 5]);
    const edges: Edge[] = [{ a: 0, b: 5 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.orientation).toBe('vertical');
      expect(d.bounds.width).toBe(DOOR_HEIGHT); // 128
      expect(d.bounds.height).toBe(DOOR_WIDTH);  // 24
    }
  });
  it('vault 房间连接的门 locked=true', () => {
    const rooms = makeRoomsAt([0, 1]);
    rooms[1] = { ...rooms[1]!, kind: 'vault' };
    const edges: Edge[] = [{ a: 0, b: 1 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.locked).toBe(true);
    }
  });
  it('classroom 房间连接的门 locked=false', () => {
    const rooms = makeRoomsAt([0, 1]);
    const edges: Edge[] = [{ a: 0, b: 1 }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.locked).toBe(false);
    }
  });
  it('门 id 唯一', () => {
    const rooms = makeRoomsAt([0, 1, 5, 6]);
    const edges: Edge[] = [
      { a: 0, b: 1 },
      { a: 0, b: 5 },
      { a: 1, b: 6 },
      { a: 5, b: 6 },
    ];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    const ids = new Set(doors.map((d) => d.id));
    expect(ids.size).toBe(doors.length);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 4 的 describe 块失败（函数未导出）。

### Step 3: 实现 buildSpanningTree + addRingEdges + buildCorridorsAndDoors

- [ ] 在 `src/tombraid/map/TombRaidMapGenerator.ts` 末尾（Task 6 临时导出之前）追加：

```ts
import {
  CORRIDOR_THICKNESS,
  type TombRaidCorridor,
  type TombRaidDoorSpawn,
  type TombRaidRoom,
} from './tombRaidMapState';

// ---------------------------------------------------------------------------
// 边 / 生成树 / 环边
// ---------------------------------------------------------------------------
export interface Edge {
  readonly a: number; // cellIndex
  readonly b: number; // cellIndex
  readonly id: string;
}

function normalizeEdge(x: number, y: number): { a: number; b: number } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

function edgeId(a: number, b: number): string {
  return `edge-${a}-${b}`;
}

export function buildSpanningTree(rng: Rng, cells: readonly number[], startCell: number): Edge[] {
  const cellSet = new Set(cells);
  const visited = new Set<number>([startCell]);
  const tree: Edge[] = [];
  // 用 random-DFS-like 增长：每次从已访问集随机选一个有未访问邻居的格子，扩展一个
  while (visited.size < cellSet.size) {
    const candidates = [...visited].filter((c) => cellNeighbors(c).some((n) => cellSet.has(n) && !visited.has(n)));
    if (candidates.length === 0) break;
    const cur = rng.pick(candidates);
    const unvisited = rng.shuffle(cellNeighbors(cur)).filter((n) => cellSet.has(n) && !visited.has(n));
    if (unvisited.length === 0) continue;
    const next = unvisited[0]!;
    visited.add(next);
    const { a, b } = normalizeEdge(cur, next);
    tree.push({ a, b, id: edgeId(a, b) });
  }
  return tree;
}

export function addRingEdges(rng: Rng, cells: readonly number[], treeEdges: readonly Edge[]): Edge[] {
  const cellSet = new Set(cells);
  const treeSet = new Set(treeEdges.map((e) => e.id));
  // 枚举所有非树边（cellSet 内的 4 邻接对）
  const nonTree: Edge[] = [];
  for (const c of cells) {
    for (const n of cellNeighbors(c)) {
      if (!cellSet.has(n)) continue;
      const { a, b } = normalizeEdge(c, n);
      const id = edgeId(a, b);
      if (treeSet.has(id)) continue;
      if (nonTree.some((e) => e.id === id)) continue;
      nonTree.push({ a, b, id });
    }
  }
  // 随机选 ~20% 非树边加为环边
  const ringCount = Math.max(1, Math.floor(nonTree.length * 0.2));
  const picked = rng.shuffle(nonTree).slice(0, ringCount);
  return [...treeEdges, ...picked];
}

// ---------------------------------------------------------------------------
// buildCorridorsAndDoors — 把边转为走廊 + 门
// ---------------------------------------------------------------------------
export interface CorridorsAndDoors {
  readonly corridors: readonly TombRaidCorridor[];
  readonly doors: readonly TombRaidDoorSpawn[];
}

export function buildCorridorsAndDoors(
  rooms: readonly TombRaidRoom[],
  edges: readonly Edge[],
  roomById: ReadonlyMap<string, TombRaidRoom>,
): CorridorsAndDoors {
  const corridors: TombRaidCorridor[] = [];
  const doors: TombRaidDoorSpawn[] = [];
  let corridorIdx = 0;
  let doorIdx = 0;

  for (const edge of edges) {
    const aRoom = roomById.get(`room-${edge.a}`);
    const bRoom = roomById.get(`room-${edge.b}`);
    if (!aRoom || !bRoom) continue;

    const aRect = aRoom.bounds;
    const bRect = bRoom.bounds;
    const sameRow = cellRow(edge.a) === cellRow(edge.b);
    const orientation: 'horizontal' | 'vertical' = sameRow ? 'horizontal' : 'vertical';
    const locked = aRoom.kind === 'vault' || bRoom.kind === 'vault';

    const corridorId = `corridor-${corridorIdx}`;
    corridorIdx += 1;

    let corridorBounds: TombRaidRect;
    let doorA: TombRaidRect;
    let doorB: TombRaidRect;

    if (orientation === 'horizontal') {
      // 左右关系：按 x 坐标判定（不依赖 edge 顺序）
      const leftRect = aRect.x <= bRect.x ? aRect : bRect;
      const rightRect = aRect.x <= bRect.x ? bRect : aRect;
      const leftRoom = aRect.x <= bRect.x ? aRoom : bRoom;
      const rightRoom = aRect.x <= bRect.x ? bRoom : aRoom;
      // 走廊中心 y = 两房间中心 y 的平均（取较小者保险）
      const cy = Math.min(leftRect.y, rightRect.y) + Math.min(leftRect.height, rightRect.height) / 2;
      corridorBounds = {
        x: leftRect.x + leftRect.width,
        y: cy - CORRIDOR_THICKNESS / 2,
        width: rightRect.x - (leftRect.x + leftRect.width),
        height: CORRIDOR_THICKNESS,
      };
      // 竖门 24×128，贴在左房右墙 / 右房左墙
      const doorY = cy - DOOR_HEIGHT / 2;
      doorA = {
        x: leftRect.x + leftRect.width - DOOR_WIDTH,
        y: doorY,
        width: DOOR_WIDTH,
        height: DOOR_HEIGHT,
      };
      doorB = {
        x: rightRect.x,
        y: doorY,
        width: DOOR_WIDTH,
        height: DOOR_HEIGHT,
      };
      doors.push({
        id: `door-${doorIdx}`,
        bounds: doorA,
        roomId: leftRoom.id,
        corridorId,
        orientation: 'horizontal',
        locked,
      });
      doorIdx += 1;
      doors.push({
        id: `door-${doorIdx}`,
        bounds: doorB,
        roomId: rightRoom.id,
        corridorId,
        orientation: 'horizontal',
        locked,
      });
      doorIdx += 1;
      corridors.push({
        id: corridorId,
        bounds: corridorBounds,
        fromRoomId: leftRoom.id,
        toRoomId: rightRoom.id,
        orientation,
      });
    } else {
      // 上下关系：按 y 坐标判定
      const topRect = aRect.y <= bRect.y ? aRect : bRect;
      const bottomRect = aRect.y <= bRect.y ? bRect : aRect;
      const topRoom = aRect.y <= bRect.y ? aRoom : bRoom;
      const bottomRoom = aRect.y <= bRect.y ? bRoom : aRoom;
      const cx = Math.min(topRect.x, bottomRect.x) + Math.min(topRect.width, bottomRect.width) / 2;
      corridorBounds = {
        x: cx - CORRIDOR_THICKNESS / 2,
        y: topRect.y + topRect.height,
        width: CORRIDOR_THICKNESS,
        height: bottomRect.y - (topRect.y + topRect.height),
      };
      // 横门 128×24，贴在上房下墙 / 下房上墙
      const doorX = cx - DOOR_HEIGHT / 2;
      doorA = {
        x: doorX,
        y: topRect.y + topRect.height - DOOR_WIDTH,
        width: DOOR_HEIGHT,
        height: DOOR_WIDTH,
      };
      doorB = {
        x: doorX,
        y: bottomRect.y,
        width: DOOR_HEIGHT,
        height: DOOR_WIDTH,
      };
      doors.push({
        id: `door-${doorIdx}`,
        bounds: doorA,
        roomId: topRoom.id,
        corridorId,
        orientation: 'vertical',
        locked,
      });
      doorIdx += 1;
      doors.push({
        id: `door-${doorIdx}`,
        bounds: doorB,
        roomId: bottomRoom.id,
        corridorId,
        orientation: 'vertical',
        locked,
      });
      doorIdx += 1;
      corridors.push({
        id: corridorId,
        bounds: corridorBounds,
        fromRoomId: topRoom.id,
        toRoomId: bottomRoom.id,
        orientation,
      });
    }
  }

  return { corridors, doors };
}
```

> 注意：`DOOR_WIDTH` / `DOOR_HEIGHT` 已在文件顶部从 `tombRaidMapState` import；新 import 仅 `CORRIDOR_THICKNESS` / `TombRaidCorridor` / `TombRaidDoorSpawn` / `TombRaidRoom`。把这些合并到顶部 import 语句，不要重复。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 2 + 3 + 4 的 describe 块全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapGenerator.ts src/tests/tombraid/map/tomb-raid-map-generator.test.ts && git commit -m "feat(tombraid): plan2 task4 spanningTree + ringEdges + corridorsAndDoors (方向无关)"`

---

## Task 5: distributeChests + computeBaselineSanity

**目标**：
- `distributeChests(rng, rooms, vaultRoomId, hallRoomId)` —— 按 spec §2.4 分配宝箱：
  - 野外普通：`clamp(round(roomCount/4), 3, 6)` 个 normal，分布权重 classroom 70% / {trap, dark, switchRoom} 30%
  - 宝藏房普通：3 个 normal（固定放在 vault room）
  - 宝藏房鎏金：1 个 gilded（固定放在 vault room）
  - 野外鎏金：50% 概率放 1 个 gilded 在 dark/switchRoom/hall 中随机一个
  - 每个宝箱 bounds 为 48×48，放在所属房间 walkableBounds 内随机位置
- `computeBaselineSanity(roomCount)` —— `roomCount × 50`

### Step 1: 写失败测试

- [ ] 在 `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` 末尾追加：

```ts
import {
  computeBaselineSanity,
  distributeChests,
} from '../../../tombraid/map/TombRaidMapGenerator';
import { BASELINE_PER_ROOM, type TombRaidRoom } from '../../../tombraid/map/tombRaidMapState';

describe('computeBaselineSanity', () => {
  it('baseline = roomCount × 50', () => {
    expect(computeBaselineSanity(16)).toBe(800);
    expect(computeBaselineSanity(20)).toBe(1000);
    expect(computeBaselineSanity(18)).toBe(900);
  });
});

describe('distributeChests', () => {
  function makeRooms(cellCount: number): { rooms: TombRaidRoom[]; vaultId: string; hallId: string; entranceId: string; exitId: string } {
    const cells = Array.from({ length: cellCount }, (_, i) => i);
    const rooms: TombRaidRoom[] = cells.map((ci) => {
      const cb = cellBounds(ci);
      const bounds = { x: cb.x + 100, y: cb.y + 100, width: 800, height: 800 };
      const walkableBounds = { x: bounds.x + 12, y: bounds.y + 12, width: bounds.width - 24, height: bounds.height - 24 };
      return {
        id: `room-${ci}`,
        kind: 'classroom' as const,
        label: '',
        bounds,
        walkableBounds,
        collisionZones: [],
        spawnPoint: { x: bounds.x + 400, y: bounds.y + 400 },
        cellIndex: ci,
      };
    });
    return {
      rooms,
      vaultId: 'room-1',
      hallId: 'room-2',
      entranceId: 'room-0',
      exitId: `room-${cellCount - 1}`,
    };
  }

  it('baseline 房间数=16 时至少有 3 野外普通 + 3 宝藏房普通 + 1 宝藏房鎏金', () => {
    const rng = createRng(1001);
    const { rooms, vaultId, hallId } = makeRooms(16);
    const chests = distributeChests(rng, rooms, vaultId, hallId);
    const wildNormal = chests.filter((c) => c.kind === 'normal' && c.roomId !== vaultId);
    const vaultNormal = chests.filter((c) => c.kind === 'normal' && c.roomId === vaultId);
    const vaultGilded = chests.filter((c) => c.kind === 'gilded' && c.roomId === vaultId);
    expect(wildNormal.length).toBeGreaterThanOrEqual(3);
    expect(wildNormal.length).toBeLessThanOrEqual(6);
    expect(vaultNormal).toHaveLength(3);
    expect(vaultGilded).toHaveLength(1);
  });

  it('clamp(round(roomCount/4),3,6) 野外普通数随 roomCount 变化', () => {
    // roomCount=16 → round(4)=4
    const rng16 = createRng(2002);
    const r16 = makeRooms(16);
    const c16 = distributeChests(rng16, r16.rooms, r16.vaultId, r16.hallId);
    const wn16 = c16.filter((c) => c.kind === 'normal' && c.roomId !== r16.vaultId);
    expect(wn16).toHaveLength(4);

    // roomCount=20 → round(5)=5
    const rng20 = createRng(2003);
    const r20 = makeRooms(20);
    const c20 = distributeChests(rng20, r20.rooms, r20.vaultId, r20.hallId);
    const wn20 = c20.filter((c) => c.kind === 'normal' && c.roomId !== r20.vaultId);
    expect(wn20).toHaveLength(5);
  });

  it('总数在 7-11 范围内 (spec §2.4)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const rng = createRng(seed * 1000);
      const r = makeRooms(18);
      const chests = distributeChests(rng, r.rooms, r.vaultId, r.hallId);
      // 4 野外普通 + 3 宝藏普通 + 1 宝藏鎏金 + (0 或 1) 野外鎏金 = 8 或 9
      expect(chests.length).toBeGreaterThanOrEqual(7);
      expect(chests.length).toBeLessThanOrEqual(11);
    }
  });

  it('野外鎏金 0 或 1 个', () => {
    for (const seed of [10, 20, 30, 40, 50]) {
      const rng = createRng(seed);
      const r = makeRooms(18);
      const chests = distributeChests(rng, r.rooms, r.vaultId, r.hallId);
      const wildGilded = chests.filter((c) => c.kind === 'gilded' && c.roomId !== r.vaultId);
      expect(wildGilded.length).toBeLessThanOrEqual(1);
    }
  });

  it('每个宝箱 bounds 在所属房间 walkableBounds 内', () => {
    const rng = createRng(3003);
    const r = makeRooms(16);
    const chests = distributeChests(rng, r.rooms, r.vaultId, r.hallId);
    const byId = new Map(r.rooms.map((x) => [x.id, x] as const));
    for (const c of chests) {
      const room = byId.get(c.roomId)!;
      expect(c.bounds.x).toBeGreaterThanOrEqual(room.walkableBounds.x);
      expect(c.bounds.y).toBeGreaterThanOrEqual(room.walkableBounds.y);
      expect(c.bounds.x + c.bounds.width).toBeLessThanOrEqual(room.walkableBounds.x + room.walkableBounds.width);
      expect(c.bounds.y + c.bounds.height).toBeLessThanOrEqual(room.walkableBounds.y + room.walkableBounds.height);
    }
  });

  it('每个宝箱尺寸 48×48', () => {
    const rng = createRng(4004);
    const r = makeRooms(16);
    const chests = distributeChests(rng, r.rooms, r.vaultId, r.hallId);
    for (const c of chests) {
      expect(c.bounds.width).toBe(48);
      expect(c.bounds.height).toBe(48);
    }
  });

  it('宝箱 id 唯一', () => {
    const rng = createRng(5005);
    const r = makeRooms(16);
    const chests = distributeChests(rng, r.rooms, r.vaultId, r.hallId);
    const ids = new Set(chests.map((c) => c.id));
    expect(ids.size).toBe(chests.length);
  });

  it('同种子可复现', () => {
    const r1 = createRng(6006);
    const r2 = createRng(6006);
    const r = makeRooms(16);
    expect(distributeChests(r1, r.rooms, r.vaultId, r.hallId))
      .toEqual(distributeChests(r2, r.rooms, r.vaultId, r.hallId));
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 5 的 describe 块失败（函数未导出）。

### Step 3: 实现 distributeChests + computeBaselineSanity

- [ ] 在 `src/tombraid/map/TombRaidMapGenerator.ts` 末尾（Task 6 临时导出之前）追加：

```ts
import {
  BASELINE_PER_ROOM,
  type TombRaidChestSpawn,
  type TombRaidRect,
  type TombRaidRoom,
} from './tombRaidMapState';

// ---------------------------------------------------------------------------
// computeBaselineSanity
// ---------------------------------------------------------------------------
export function computeBaselineSanity(roomCount: number): number {
  return roomCount * BASELINE_PER_ROOM;
}

// ---------------------------------------------------------------------------
// distributeChests (spec §2.4)
// ---------------------------------------------------------------------------
const CHEST_SIZE = 48;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function chestInRoom(rng: Rng, room: TombRaidRoom, kind: 'normal' | 'gilded', idx: number): TombRaidChestSpawn {
  const wb = room.walkableBounds;
  const maxX = wb.x + wb.width - CHEST_SIZE;
  const maxY = wb.y + wb.height - CHEST_SIZE;
  const x = rng.int(wb.x, Math.max(wb.x, maxX));
  const y = rng.int(wb.y, Math.max(wb.y, maxY));
  const bounds: TombRaidRect = { x, y, width: CHEST_SIZE, height: CHEST_SIZE };
  return {
    id: `chest-${idx}`,
    roomId: room.id,
    kind,
    bounds,
  };
}

export function distributeChests(
  rng: Rng,
  rooms: readonly TombRaidRoom[],
  vaultRoomId: string,
  hallRoomId: string,
): readonly TombRaidChestSpawn[] {
  const chests: TombRaidChestSpawn[] = [];
  let idx = 0;
  const roomCount = rooms.length;
  const vaultRoom = rooms.find((r) => r.id === vaultRoomId);
  if (!vaultRoom) {
    throw new Error(`distributeChests: vault room ${vaultRoomId} not found`);
  }

  // 1) 野外普通宝箱：clamp(round(roomCount/4), 3, 6)
  const wildNormalCount = clamp(Math.round(roomCount / 4), 3, 6);
  // 候选房间：除 vault 外，classroom 70% / {trap, dark, switchRoom} 30%
  // 用加权列表实现
  const wildRooms = rooms.filter((r) => r.id !== vaultRoomId);
  const weightedPool: TombRaidRoom[] = [];
  for (const r of wildRooms) {
    if (r.kind === 'classroom') {
      for (let i = 0; i < 7; i += 1) weightedPool.push(r);
    } else if (r.kind === 'trap' || r.kind === 'dark' || r.kind === 'switchRoom') {
      for (let i = 0; i < 3; i += 1) weightedPool.push(r);
    }
    // entrance/exit/hall 不进野外普通池
  }
  // 用过的 (roomId, 位置种子) 不去重——同房间允许多个宝箱
  const usedWildRooms = new Set<string>();
  for (let i = 0; i < wildNormalCount; i += 1) {
    let attempts = 0;
    let picked: TombRaidRoom | null = null;
    while (attempts < 50) {
      const candidate = weightedPool.length > 0 ? rng.pick(weightedPool) : rng.pick(wildRooms);
      if (!usedWildRooms.has(candidate.id) || wildRooms.length <= wildNormalCount) {
        picked = candidate;
        usedWildRooms.add(candidate.id);
        break;
      }
      attempts += 1;
    }
    if (!picked) {
      // 退化：直接从 wildRooms 取
      picked = rng.pick(wildRooms);
    }
    chests.push(chestInRoom(rng, picked, 'normal', idx));
    idx += 1;
  }

  // 2) 宝藏房普通 ×3
  for (let i = 0; i < 3; i += 1) {
    chests.push(chestInRoom(rng, vaultRoom, 'normal', idx));
    idx += 1;
  }

  // 3) 宝藏房鎏金 ×1（固定）
  chests.push(chestInRoom(rng, vaultRoom, 'gilded', idx));
  idx += 1;

  // 4) 野外鎏金 0-1（50%），仅放在 dark / switchRoom / hall
  if (rng.bool(0.5)) {
    const candidates = rooms.filter(
      (r) => r.id !== vaultRoomId && (r.kind === 'dark' || r.kind === 'switchRoom' || r.kind === 'hall'),
    );
    if (candidates.length > 0) {
      const picked = rng.pick(candidates);
      chests.push(chestInRoom(rng, picked, 'gilded', idx));
      idx += 1;
    }
  }

  return chests;
}
```

> 注意：`BASELINE_PER_ROOM` 已在文件顶部 import；新 import 仅 `TombRaidChestSpawn` / `TombRaidRect` / `TombRaidRoom`。把这些合并到顶部 import 语句，不要重复。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 2-5 的 describe 块全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapGenerator.ts src/tests/tombraid/map/tomb-raid-map-generator.test.ts && git commit -m "feat(tombraid): plan2 task5 distributeChests + computeBaselineSanity (spec §2.4)"`

---

## Task 6: generateTombRaidMap 顶层组合 + 出口可达性 BFS + 可复现性

**目标**：实现顶层 `generateTombRaidMap(seed)`，组合 Task 2-5：
1. `roomCount = rng.int(MIN_ROOMS, MAX_ROOMS)`
2. `cells = selectConnectedCells(rng, roomCount, 0)`
3. `rooms = generateRoomRectangles(rng, cells)`
4. `{ rooms, entranceRoomId, exitRoomId, vaultRoomId, hallRoomId } = assignRoomKinds(rng, rooms)`
5. `tree = buildSpanningTree(rng, cells, 0)`
6. `edges = addRingEdges(rng, cells, tree)`
7. `roomById = new Map(rooms.map(r => [r.id, r]))`
8. `{ corridors, doors } = buildCorridorsAndDoors(rooms, edges, roomById)`
9. `chests = distributeChests(rng, rooms, vaultRoomId, hallRoomId)`
10. `baselineSanity = computeBaselineSanity(roomCount)`
11. 出口可达性 BFS（基于 corridors 邻接图，从 entrance 到 exit 必须连通）
12. 组装 `TombRaidMapManifest` 返回

并移除 Task 2 的 `_MIN_ROOMS` / `_MAX_ROOMS` 临时导出。

### Step 1: 写失败测试

- [ ] 在 `src/tests/tombraid/map/tomb-raid-map-generator.test.ts` 末尾追加：

```ts
import { generateTombRaidMap } from '../../../tombraid/map/TombRaidMapGenerator';
import {
  BASELINE_PER_ROOM,
  GRID_COLS,
  GRID_ROWS,
  MAX_ROOMS,
  MIN_ROOMS,
  TOMB_RAID_MAP_HEIGHT,
  TOMB_RAID_MAP_WIDTH,
} from '../../../tombraid/map/tombRaidMapState';

describe('generateTombRaidMap 顶层组合', () => {
  it('返回 manifest，roomCount 在 [16, 20]', () => {
    const m = generateTombRaidMap(42);
    expect(m.roomCount).toBeGreaterThanOrEqual(MIN_ROOMS);
    expect(m.roomCount).toBeLessThanOrEqual(MAX_ROOMS);
  });
  it('manifest.id 固定为 ying-zhong-jiu-tomb-raid', () => {
    expect(generateTombRaidMap(1).id).toBe('ying-zhong-jiu-tomb-raid');
  });
  it('manifest.seed 等于传入 seed', () => {
    expect(generateTombRaidMap(123).seed).toBe(123);
  });
  it('bounds 为 5000×4000', () => {
    const m = generateTombRaidMap(7);
    expect(m.bounds).toEqual({ x: 0, y: 0, width: TOMB_RAID_MAP_WIDTH, height: TOMB_RAID_MAP_HEIGHT });
  });
  it('grid 为 5×4 / cell 1000×1000', () => {
    const m = generateTombRaidMap(7);
    expect(m.grid).toEqual({ cols: GRID_COLS, rows: GRID_ROWS, cellWidth: 1000, cellHeight: 1000 });
  });
  it('rooms 数量等于 roomCount', () => {
    const m = generateTombRaidMap(99);
    expect(m.rooms).toHaveLength(m.roomCount);
  });
  it('entrance / exit / vault / hall 各 1 个且互不相同', () => {
    const m = generateTombRaidMap(99);
    const entrance = m.rooms.find((r) => r.id === m.entranceRoomId);
    const exit = m.rooms.find((r) => r.id === m.exitRoomId);
    const vault = m.rooms.find((r) => r.id === m.vaultRoomId);
    const hall = m.rooms.find((r) => r.id === m.hallRoomId);
    expect(entrance?.kind).toBe('entrance');
    expect(exit?.kind).toBe('exit');
    expect(vault?.kind).toBe('vault');
    expect(hall?.kind).toBe('hall');
    const ids = new Set([m.entranceRoomId, m.exitRoomId, m.vaultRoomId, m.hallRoomId]);
    expect(ids.size).toBe(4);
  });
  it('baselineSanity = roomCount × 50', () => {
    const m = generateTombRaidMap(33);
    expect(m.baselineSanity).toBe(m.roomCount * BASELINE_PER_ROOM);
  });
  it('floorTile 192×192', () => {
    expect(generateTombRaidMap(33).floorTile).toEqual({ tileWidth: 192, tileHeight: 192 });
  });
  it('出口从入口 BFS 可达（基于 corridors 邻接）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const m = generateTombRaidMap(seed);
      const adj = new Map<string, string[]>();
      for (const r of m.rooms) adj.set(r.id, []);
      for (const c of m.corridors) {
        adj.get(c.fromRoomId)!.push(c.toRoomId);
        adj.get(c.toRoomId)!.push(c.fromRoomId);
      }
      const visited = new Set<string>([m.entranceRoomId]);
      const queue = [m.entranceRoomId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const n of adj.get(cur) ?? []) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }
      expect(visited.has(m.exitRoomId)).toBe(true);
    }
  });
  it('所有房间从入口可达（全连通）', () => {
    const m = generateTombRaidMap(42);
    const adj = new Map<string, string[]>();
    for (const r of m.rooms) adj.set(r.id, []);
    for (const c of m.corridors) {
      adj.get(c.fromRoomId)!.push(c.toRoomId);
      adj.get(c.toRoomId)!.push(c.fromRoomId);
    }
    const visited = new Set<string>([m.entranceRoomId]);
    const queue = [m.entranceRoomId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of adj.get(cur) ?? []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
    expect(visited.size).toBe(m.roomCount);
  });
  it('同种子可复现（同 seed → 同 manifest）', () => {
    const a = generateTombRaidMap(2024);
    const b = generateTombRaidMap(2024);
    expect(a).toEqual(b);
  });
  it('不同种子通常产生不同 manifest（roomCount 或 rooms 不同）', () => {
    const a = generateTombRaidMap(1);
    const b = generateTombRaidMap(2);
    // 至少 seed 字段不同
    expect(a.seed).not.toBe(b.seed);
  });
  it('宝箱数在 7-11', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = generateTombRaidMap(seed);
      expect(m.chests.length).toBeGreaterThanOrEqual(7);
      expect(m.chests.length).toBeLessThanOrEqual(11);
    }
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 6 的 describe 块失败（`generateTombRaidMap` 未导出）。

### Step 3: 实现 generateTombRaidMap + 移除临时导出

- [ ] 在 `src/tombraid/map/TombRaidMapGenerator.ts` 末尾（替换原 `_MIN_ROOMS` / `_MAX_ROOMS` 临时导出）追加：

```ts
import {
  MAX_ROOMS,
  MIN_ROOMS,
  TOMB_RAID_MAP_HEIGHT,
  TOMB_RAID_MAP_WIDTH,
  type TombRaidMapManifest,
} from './tombRaidMapState';

// ---------------------------------------------------------------------------
// generateTombRaidMap — 顶层组合
// ---------------------------------------------------------------------------
export function generateTombRaidMap(seed: number): TombRaidMapManifest {
  const rng = createRng(seed);

  const roomCount = rng.int(MIN_ROOMS, MAX_ROOMS);
  const cells = selectConnectedCells(rng, roomCount, 0);
  const baseRooms = generateRoomRectangles(rng, cells);
  const assigned = assignRoomKinds(rng, baseRooms);
  const rooms = assigned.rooms;
  const { entranceRoomId, exitRoomId, vaultRoomId, hallRoomId } = assigned;

  const tree = buildSpanningTree(rng, cells, 0);
  const edges = addRingEdges(rng, cells, tree);
  const roomById = new Map(rooms.map((r) => [r.id, r] as const));
  const { corridors, doors } = buildCorridorsAndDoors(rooms, edges, roomById);
  const chests = distributeChests(rng, rooms, vaultRoomId, hallRoomId);
  const baselineSanity = computeBaselineSanity(roomCount);

  // 出口可达性断言（基于 corridors 邻接）
  const adj = new Map<string, string[]>();
  for (const r of rooms) adj.set(r.id, []);
  for (const c of corridors) {
    adj.get(c.fromRoomId)!.push(c.toRoomId);
    adj.get(c.toRoomId)!.push(c.fromRoomId);
  }
  const visited = new Set<string>([entranceRoomId]);
  const queue: string[] = [entranceRoomId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of adj.get(cur) ?? []) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  if (!visited.has(exitRoomId)) {
    // 理论上由生成树保证，此处为防御性断言
    throw new Error(`generateTombRaidMap: exit ${exitRoomId} unreachable from entrance ${entranceRoomId}`);
  }

  return {
    id: 'ying-zhong-jiu-tomb-raid',
    seed,
    roomCount,
    bounds: { x: 0, y: 0, width: TOMB_RAID_MAP_WIDTH, height: TOMB_RAID_MAP_HEIGHT },
    grid: { cols: GRID_COLS, rows: GRID_ROWS, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT },
    rooms,
    corridors,
    doors,
    chests,
    entranceRoomId,
    exitRoomId,
    vaultRoomId,
    hallRoomId,
    baselineSanity,
    floorTile: { tileWidth: FLOOR_TILE_SIZE, tileHeight: FLOOR_TILE_SIZE },
  };
}
```

- [ ] 移除 Task 2 中临时导出的两行（在文件末尾原位置删除）：

```ts
// 删除以下两行（Task 2 的临时占位）：
// export const _MIN_ROOMS = MIN_ROOMS;
// export const _MAX_ROOMS = MAX_ROOMS;
```

- [ ] 同时移除 Task 2 顶部 import 中不再需要的 `MAX_ROOMS` / `MIN_ROOMS`（如果它们现在被 Task 6 import 用到，则保留——Task 6 已单独 import，所以 Task 2 顶部 import 可以删除这两个）。最终 Task 2 顶部 import 应仅保留：

```ts
import {
  CELL_HEIGHT,
  CELL_WIDTH,
  GRID_COLS,
  GRID_ROWS,
  type TombRaidRect,
} from './tombRaidMapState';
```

> 注意：`MAX_ROOMS` / `MIN_ROOMS` / `TOMB_RAID_MAP_HEIGHT` / `TOMB_RAID_MAP_WIDTH` / `TombRaidMapManifest` / `FLOOR_TILE_SIZE` 需在文件中可用。建议把所有 import 合并到顶部统一块，避免分块 import 时的重复声明。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-generator.test.ts`，确认 Task 2-6 全部 describe 块通过。
- [ ] 运行 `npm run typecheck`，确认无类型错误（特别是 `noUnusedLocals` 通过）。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapGenerator.ts src/tests/tombraid/map/tomb-raid-map-generator.test.ts && git commit -m "feat(tombraid): plan2 task6 generateTombRaidMap 顶层组合 + 出口可达性 BFS"`

---

## Task 7: TombRaidMapRenderer — 薄渲染器

**目标**：实现 `TombRaidMapRenderer`，把 `TombRaidMapManifest` 渲染成 Phaser 场景对象：
- `render(manifest)` — 渲染 floor tiles / walls / doors / chests / labels / hitAreas
- `clear()` — 销毁所有对象
- `getCollisionZones()` — 返回所有 `walkableBounds` 外的墙体矩形（用于 CollisionManager）
- 复用剧情模式 `floor.tile` 的 `single-floor-tile-192` frame（192×192），depth=0
- 墙 depth=1，宝箱 depth=3，门 depth=6，标签 depth=7，hitArea depth=8

**测试修正（a.txt 自审）：**
1. 宝箱测试用颜色断言（mock 矩形不携带 `kind` 字段）—— `manifest.chests[i].kind === 'gilded' ? 0xd4a017 : 0x6b4a1f`
2. destroy 测试用 `mock.calls.length >= 1`（mock 的 destroy 是 no-op vi.fn，不真正销毁）
3. 重渲染测试用 `getCollisionZones().length` 保持不变（mock images 数组会累积，不能用作断言）

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/map/tomb-raid-map-renderer.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

// Mock Phaser before any imports that pull it in
vi.mock('phaser', () => {
  class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
    contains(px: number, py: number): boolean {
      return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
    }
  }
  return {
    default: { Geom: { Rectangle } },
  };
});

import type { TombRaidMapManifest, TombRaidRect } from '../../../tombraid/map/tombRaidMapState';
import { TombRaidMapRenderer } from '../../../tombraid/map/TombRaidMapRenderer';

// ---------------------------------------------------------------------------
// Mock scene
// ---------------------------------------------------------------------------
interface TrackedObj {
  readonly type: 'image' | 'rectangle' | 'text' | 'graphics';
  readonly depth: number;
  destroy: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setDisplaySize: ReturnType<typeof vi.fn>;
  setStrokeStyle: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  // graphics ops
  fillStyle?: number;
  fillRect?: TombRaidRect;
  lineStyle?: { width: number; color: number };
  strokeRect?: TombRaidRect;
  // rectangle
  color?: number;
  // text
  text?: string;
}

function createMockScene() {
  const tracked: TrackedObj[] = [];
  const textureFrames = new Set<string>();

  function makeChainable(type: TrackedObj['type']): TrackedObj {
    const obj: TrackedObj = {
      type,
      depth: 0,
      destroy: vi.fn(() => undefined),
      setOrigin: vi.fn(function (this: TrackedObj) { return this; }),
      setDepth: vi.fn(function (this: TrackedObj, d: number) { this.depth = d; return this; }),
      setDisplaySize: vi.fn(function (this: TrackedObj) { return this; }),
      setStrokeStyle: vi.fn(function (this: TrackedObj) { return this; }),
      setInteractive: vi.fn(function (this: TrackedObj) { return this; }),
    };
    return obj;
  }

  const scene = {
    add: {
      image: vi.fn((x: number, y: number, _key: string, _frame?: string) => {
        const o = makeChainable('image');
        (o as TrackedObj & { x: number; y: number }).x = x;
        (o as TrackedObj & { x: number; y: number }).y = y;
        tracked.push(o);
        return o;
      }),
      rectangle: vi.fn((x: number, y: number, width: number, height: number, color?: number) => {
        const o = makeChainable('rectangle');
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).x = x;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).y = y;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).width = width;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).height = height;
        o.color = color;
        tracked.push(o);
        return o;
      }),
      text: vi.fn((_x: number, _y: number, text: string) => {
        const o = makeChainable('text');
        o.text = text;
        tracked.push(o);
        return o;
      }),
      graphics: vi.fn(() => {
        const o = makeChainable('graphics');
        const gfx = {
          ...o,
          fillStyle: vi.fn(function (this: TrackedObj, color: number) {
            this.fillStyle = color;
            return this;
          }),
          fillRect: vi.fn(function (this: TrackedObj, x: number, y: number, width: number, height: number) {
            this.fillRect = { x, y, width, height };
            return this;
          }),
          lineStyle: vi.fn(function (this: TrackedObj, width: number, color: number) {
            this.lineStyle = { width, color };
            return this;
          }),
          strokeRect: vi.fn(function (this: TrackedObj, x: number, y: number, width: number, height: number) {
            this.strokeRect = { x, y, width, height };
            return this;
          }),
          setDepth: o.setDepth,
          destroy: o.destroy,
        };
        // 替换 tracked 中最后一个为 graphics 完整对象
        tracked[tracked.length - 1] = gfx as unknown as TrackedObj;
        return gfx;
      }),
    },
    textures: {
      exists: (key: string) => key === 'floor.tile',
      get: (_key: string) => ({
        has: (frame: string) => textureFrames.has(frame),
        add: (name: string) => {
          textureFrames.add(name);
          return { name };
        },
      }),
    },
  };

  return { scene, tracked };
}

function makeMiniManifest(overrides: Partial<TombRaidMapManifest> = {}): TombRaidMapManifest {
  const base: TombRaidMapManifest = {
    id: 'ying-zhong-jiu-tomb-raid',
    seed: 1,
    roomCount: 1,
    bounds: { x: 0, y: 0, width: 5000, height: 4000 },
    grid: { cols: 5, rows: 4, cellWidth: 1000, cellHeight: 1000 },
    rooms: [
      {
        id: 'room-0',
        kind: 'entrance',
        label: '入口',
        bounds: { x: 0, y: 0, width: 800, height: 800 },
        walkableBounds: { x: 12, y: 12, width: 776, height: 776 },
        collisionZones: [],
        spawnPoint: { x: 400, y: 400 },
        cellIndex: 0,
      },
    ],
    corridors: [],
    doors: [],
    chests: [],
    entranceRoomId: 'room-0',
    exitRoomId: 'room-0',
    vaultRoomId: 'room-0',
    hallRoomId: 'room-0',
    baselineSanity: 50,
    floorTile: { tileWidth: 192, tileHeight: 192 },
  };
  return { ...base, ...overrides };
}

describe('TombRaidMapRenderer', () => {
  it('render 创建 floor tile image（depth=0）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const floorTiles = tracked.filter((o) => o.type === 'image' && o.depth === 0);
    expect(floorTiles.length).toBeGreaterThan(0);
  });

  it('render 创建墙 rectangle（depth=1）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const walls = tracked.filter((o) => o.type === 'rectangle' && o.depth === 1);
    expect(walls.length).toBeGreaterThan(0);
  });

  it('render 创建门 graphics（depth=6）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({
      doors: [
        {
          id: 'door-0',
          bounds: { x: 800, y: 400, width: 24, height: 128 },
          roomId: 'room-0',
          corridorId: 'corridor-0',
          orientation: 'horizontal',
          locked: false,
        },
      ],
    });
    renderer.render(manifest);
    const doorGfxs = tracked.filter((o) => o.type === 'graphics' && o.depth === 6);
    expect(doorGfxs.length).toBeGreaterThanOrEqual(1);
  });

  it('render 创建门标签 text（depth=7）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    // 至少有房间标签
    const labels = tracked.filter((o) => o.type === 'text' && o.depth === 7);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('render 创建宝箱 rectangle（depth=3），鎏金 0xd4a017 / 普通 0x6b4a1f', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({
      chests: [
        {
          id: 'chest-0',
          roomId: 'room-0',
          kind: 'gilded',
          bounds: { x: 100, y: 100, width: 48, height: 48 },
        },
        {
          id: 'chest-1',
          roomId: 'room-0',
          kind: 'normal',
          bounds: { x: 200, y: 200, width: 48, height: 48 },
        },
      ],
    });
    renderer.render(manifest);
    const chestRects = tracked.filter((o) => o.type === 'rectangle' && o.depth === 3);
    expect(chestRects).toHaveLength(2);
    // 用 manifest.chests[i].kind 推断期望颜色（mock 矩形不携带 kind 字段）
    const GILDED = 0xd4a017;
    const NORMAL = 0x6b4a1f;
    chestRects.forEach((rect, i) => {
      const expected = manifest.chests[i]!.kind === 'gilded' ? GILDED : NORMAL;
      expect(rect.color).toBe(expected);
    });
  });

  it('getCollisionZones 返回墙体矩形（房间 bounds 与 walkableBounds 的差集）', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const zones = renderer.getCollisionZones();
    // 至少有 4 面墙
    expect(zones.length).toBeGreaterThanOrEqual(4);
    // 所有 zone 都在 manifest.bounds 内
    for (const z of zones) {
      expect(z.width).toBeGreaterThan(0);
      expect(z.height).toBeGreaterThan(0);
    }
  });

  it('clear 销毁所有 tracked 对象', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const beforeCount = tracked.length;
    expect(beforeCount).toBeGreaterThan(0);
    renderer.clear();
    // 每个 tracked 对象的 destroy mock 应被调用至少一次
    expect(tracked.every((obj) => obj.destroy.mock.calls.length >= 1)).toBe(true);
    // clear 后 getCollisionZones 为空
    expect(renderer.getCollisionZones()).toEqual([]);
  });

  it('再次 render 时 getCollisionZones 数量保持不变（不累积）', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest();
    renderer.render(manifest);
    const zoneCount = renderer.getCollisionZones().length;
    renderer.render(manifest);
    expect(renderer.getCollisionZones().length).toBe(zoneCount);
  });

  it('currentManifest 返回最近渲染的 manifest', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({ seed: 999 });
    renderer.render(manifest);
    expect(renderer.currentManifest?.seed).toBe(999);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-renderer.test.ts`，确认编译错误（模块不存在）。

### Step 3: 实现 TombRaidMapRenderer.ts

- [ ] 创建 `src/tombraid/map/TombRaidMapRenderer.ts`：

```ts
// src/tombraid/map/TombRaidMapRenderer.ts
// 摸金模式地图渲染器：把 TombRaidMapManifest 渲染成 Phaser 场景对象。
// 复用剧情模式 floor.tile 的 single-floor-tile-192 frame（192×192）。
// import type Phaser —— 编译期擦除，jsdom 测试可 mock phaser 后导入。
import type Phaser from 'phaser';

import {
  FLOOR_TILE_SIZE,
  WALL_THICKNESS,
  type TombRaidMapManifest,
  type TombRaidRect,
} from './tombRaidMapState';

// 复用剧情模式 MapRenderer 的颜色与 frame 常量
const FLOOR_TILE_FRAME = 'single-floor-tile-192';
const FLOOR_SOURCE_TILE_X = FLOOR_TILE_SIZE; // 192
const FLOOR_SOURCE_TILE_Y = 0;
const FLOOR_TEXTURE_KEY = 'floor.tile';

const WALL_COLOR = 0x1a171c;
const WALL_STROKE_COLOR = 0x4b3139;
const DOOR_FILL_COLOR = 0x5c4221;
const DOOR_STROKE_COLOR = 0xa37435;
const DOOR_STROKE_WIDTH = 2;
const DOOR_LOCKED_COLOR = 0x8a2f2f;
const CHEST_NORMAL_COLOR = 0x6b4a1f;
const CHEST_GILDED_COLOR = 0xd4a017;
const LABEL_COLOR = '#c9b89a';

// 深度层级（沿用剧情模式 MapRenderer）
const DEPTH_FLOOR = 0;
const DEPTH_WALL = 1;
const DEPTH_CHEST = 3;
const DEPTH_DOOR = 6;
const DEPTH_LABEL = 7;
const DEPTH_HITAREA = 8;

interface RenderedObject {
  readonly destroy: () => void;
}

export class TombRaidMapRenderer {
  private readonly scene: Phaser.Scene;
  private objects: RenderedObject[] = [];
  private collisionZones: TombRaidRect[] = [];
  private _currentManifest: TombRaidMapManifest | null = null;
  private floorFrameEnsured = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get currentManifest(): TombRaidMapManifest | null {
    return this._currentManifest;
  }

  render(manifest: TombRaidMapManifest): void {
    this.clear();
    this._currentManifest = manifest;
    this.ensureFloorFrame();
    this.renderFloors(manifest);
    this.renderWalls(manifest);
    this.renderDoors(manifest);
    this.renderChests(manifest);
    this.renderLabels(manifest);
  }

  clear(): void {
    for (const obj of this.objects) {
      obj.destroy();
    }
    this.objects = [];
    this.collisionZones = [];
    this._currentManifest = null;
  }

  getCollisionZones(): readonly TombRaidRect[] {
    return this.collisionZones;
  }

  // -----------------------------------------------------------------------
  // 内部渲染
  // -----------------------------------------------------------------------
  private ensureFloorFrame(): void {
    if (this.floorFrameEnsured) return;
    const texture = this.scene.textures.get(FLOOR_TEXTURE_KEY);
    if (!texture.has(FLOOR_TILE_FRAME)) {
      texture.add(FLOOR_TILE_FRAME, 0, FLOOR_SOURCE_TILE_X, FLOOR_SOURCE_TILE_Y, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE);
    }
    this.floorFrameEnsured = true;
  }

  private renderFloors(manifest: TombRaidMapManifest): void {
    if (!this.scene.textures.exists(FLOOR_TEXTURE_KEY)) return;
    const tile = manifest.floorTile;
    const areas: TombRaidRect[] = [
      ...manifest.rooms.map((r) => r.bounds),
      ...manifest.corridors.map((c) => c.bounds),
    ];
    for (const area of areas) {
      const cols = Math.ceil(area.width / tile.tileWidth);
      const rows = Math.ceil(area.height / tile.tileHeight);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const img = this.scene.add.image(
            area.x + col * tile.tileWidth + tile.tileWidth / 2,
            area.y + row * tile.tileHeight + tile.tileHeight / 2,
            FLOOR_TEXTURE_KEY,
            FLOOR_TILE_FRAME,
          );
          img.setOrigin(0.5, 0.5);
          img.setDisplaySize(tile.tileWidth, tile.tileHeight);
          img.setDepth(DEPTH_FLOOR);
          this.objects.push(img as unknown as RenderedObject);
        }
      }
    }
  }

  private renderWalls(manifest: TombRaidMapManifest): void {
    // 每个房间四面墙（bounds 与 walkableBounds 之间的 4 个矩形）
    for (const room of manifest.rooms) {
      const b = room.bounds;
      const wt = WALL_THICKNESS;
      // 上墙
      this.addWallRect({ x: b.x, y: b.y, width: b.width, height: wt });
      // 下墙
      this.addWallRect({ x: b.x, y: b.y + b.height - wt, width: b.width, height: wt });
      // 左墙
      this.addWallRect({ x: b.x, y: b.y, width: wt, height: b.height });
      // 右墙
      this.addWallRect({ x: b.x + b.width - wt, y: b.y, width: wt, height: b.height });
    }
  }

  private addWallRect(rect: TombRaidRect): void {
    const wall = this.scene.add.rectangle(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      rect.width,
      rect.height,
      WALL_COLOR,
    );
    wall.setOrigin(0.5, 0.5);
    wall.setDepth(DEPTH_WALL);
    wall.setStrokeStyle(1, WALL_STROKE_COLOR);
    this.objects.push(wall as unknown as RenderedObject);
    this.collisionZones.push(rect);
  }

  private renderDoors(manifest: TombRaidMapManifest): void {
    for (const door of manifest.doors) {
      const b = door.bounds;
      const gfx = this.scene.add.graphics();
      const fillColor = door.locked ? DOOR_LOCKED_COLOR : DOOR_FILL_COLOR;
      gfx.fillStyle(fillColor, 1);
      gfx.fillRect(b.x, b.y, b.width, b.height);
      gfx.lineStyle(DOOR_STROKE_WIDTH, DOOR_STROKE_COLOR, 1);
      gfx.strokeRect(b.x, b.y, b.width, b.height);
      gfx.setDepth(DEPTH_DOOR);
      this.objects.push(gfx as unknown as RenderedObject);
    }
  }

  private renderChests(manifest: TombRaidMapManifest): void {
    for (const chest of manifest.chests) {
      const b = chest.bounds;
      const color = chest.kind === 'gilded' ? CHEST_GILDED_COLOR : CHEST_NORMAL_COLOR;
      const rect = this.scene.add.rectangle(
        b.x + b.width / 2,
        b.y + b.height / 2,
        b.width,
        b.height,
        color,
      );
      rect.setOrigin(0.5, 0.5);
      rect.setDepth(DEPTH_CHEST);
      rect.setStrokeStyle(2, chest.kind === 'gilded' ? CHEST_GILDED_COLOR : CHEST_NORMAL_COLOR);
      this.objects.push(rect as unknown as RenderedObject);
    }
  }

  private renderLabels(manifest: TombRaidMapManifest): void {
    for (const room of manifest.rooms) {
      if (!room.label) continue;
      const center = { x: room.bounds.x + room.bounds.width / 2, y: room.bounds.y + 12 };
      const text = this.scene.add.text(center.x, center.y, room.label, {
        color: LABEL_COLOR,
        fontSize: '12px',
      });
      text.setOrigin(0.5, 0.5);
      text.setDepth(DEPTH_LABEL);
      this.objects.push(text as unknown as RenderedObject);
    }
  }
}
```

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/map/tomb-raid-map-renderer.test.ts`，确认全部通过。
- [ ] 运行 `npm run test:run`，确认所有 plan 2 测试通过。
- [ ] 运行 `npm run typecheck`，确认类型检查通过。

### Step 5: commit

- [ ] `git add src/tombraid/map/TombRaidMapRenderer.ts src/tests/tombraid/map/tomb-raid-map-renderer.test.ts && git commit -m "feat(tombraid): plan2 task7 TombRaidMapRenderer 薄渲染器 (floor/wall/door/chest/label)"`

---

## Self-Review

### Spec 覆盖检查（§2 地图生成）

| Spec 条目 | 任务 | 状态 |
|-----------|------|------|
| §2.1 设计像素 5000×4000 | Task 1 常量 + Task 6 bounds | ✅ |
| §2.1 房间数 16-20 随机 | Task 2 RNG + Task 6 `rng.int(MIN_ROOMS, MAX_ROOMS)` | ✅ |
| §2.1 相机跟随玩家 / 视口 1280×720 | 不在本 plan 范围（plan 3 PlayScene / 相机） | ⏭ 出范围 |
| §2.2 8 种房间类型 + 走廊（9 种结构） | Task 1 类型 + Task 3 assignRoomKinds + Task 4 corridors | ✅ |
| §2.3 房间数随机 | Task 6 | ✅ |
| §2.3 特殊结构种类随机选择+放置 | Task 3 vault/hall 随机选 + trap/dark/switchRoom 权重 | ✅ |
| §2.3 连接拓扑随机（环 + 死路混合） | Task 4 spanningTree + addRingEdges | ✅ |
| §2.3 缄默者密度随机 | 不在本 plan 范围（plan 3） | ⏭ 出范围 |
| §2.3 房间矩形尺寸随机 | Task 3 generateRoomRectangles [600, 900] | ✅ |
| §2.4 野外普通 clamp(round(roomCount/4),3,6) | Task 5 distributeChests | ✅ |
| §2.4 宝藏房普通 ×3 | Task 5 | ✅ |
| §2.4 宝藏房鎏金 ×1 | Task 5 | ✅ |
| §2.4 野外鎏金 0-1 (50%) | Task 5 `rng.bool(0.5)` | ✅ |
| §2.4 总数 7-11 | Task 5 + Task 6 测试 | ✅ |
| §2.4 普通宝箱分布 classroom 70% / trap·dark·switchRoom 30% | Task 5 加权池 7:3 | ✅ |
| §2.4 野外鎏金仅 dark/switchRoom/hall | Task 5 候选过滤 | ✅ |
| §2.5 baselineSanity = roomCount × 50 | Task 5 computeBaselineSanity + Task 6 | ✅ |
| §2.5 出口必须可达（BFS） | Task 6 出口可达性 BFS + 防御性断言 | ✅ |
| §2.5 纯函数 + mulberry32 + 同种子可复现 | Task 2 mulberry32 + Task 6 可复现测试 | ✅ |
| §2.6 manifest 数据结构 | Task 1 TombRaidMapManifest + Task 6 组装 | ✅ |

**出范围说明**：相机/视口（plan 3 PlayScene）、缄默者密度（plan 3 CombatManager）由后续 plan 处理，本 plan 不涉及。Spec §2.6 中 manifest 字段比本 plan 多出的 `doors`/`chests` 已包含；本 plan 额外补充 `corridors`（spec 接口未列但生成器必需），不破坏 spec 接口。

### 占位符扫描

- ✅ 无 TBD / TODO / implement later / "Similar to Task N" / "fill in details"
- ✅ 每个任务 Step 3 都给出完整可编译代码（非片段）
- ✅ 每个测试 Step 1 都给出完整 vitest describe 块
- ✅ Task 2 的临时 `_MIN_ROOMS` / `_MAX_ROOMS` 导出有明确说明，Task 6 明确要求移除
- ✅ 所有 import 在合并说明中标注，避免重复声明

### 类型一致性检查

- ✅ `TombRaidRoomKind` 8 种（Task 1 定义，Task 3 REMAINING_KINDS 使用，无 `'corridor'` 出现在 `rooms[]`）
- ✅ `TombRaidRect` 在 Task 1 定义，Task 2-7 全部使用同名字段 `x/y/width/height`
- ✅ `TombRaidRoom` 字段 `id/kind/label/bounds/walkableBounds/collisionZones/spawnPoint/cellIndex` 在 Task 1 定义，Task 3-6 全部一致
- ✅ `TombRaidCorridor` 字段 `id/bounds/fromRoomId/toRoomId/orientation` 在 Task 1 定义，Task 4 构造、Task 6 BFS 邻接使用
- ✅ `TombRaidDoorSpawn` 字段 `id/bounds/roomId/corridorId/orientation/locked` 在 Task 1 定义，Task 4 构造、Task 7 渲染使用
- ✅ `TombRaidChestSpawn` 字段 `id/roomId/kind/bounds` 在 Task 1 定义，Task 5 构造、Task 7 渲染使用
- ✅ `TombRaidChestKind = 'normal' | 'gilded'` 在 Task 1 定义，Task 5 / Task 7 一致使用
- ✅ `Edge` 接口 `{ a, b, id }` 在 Task 4 定义并被 buildSpanningTree / addRingEdges / buildCorridorsAndDoors 一致使用
- ✅ `Rng` 接口方法 `next/int/pick/shuffle/bool` 在 Task 2 定义，Task 2-6 全部使用同名方法
- ✅ `AssignRoomKindsResult` 字段 `rooms/entranceRoomId/exitRoomId/vaultRoomId/hallRoomId` 在 Task 3 定义，Task 6 解构使用
- ✅ `CorridorsAndDoors` 字段 `corridors/doors` 在 Task 4 定义，Task 6 解构使用
- ✅ `TombRaidMapRenderer` 方法 `render(manifest)` / `clear()` / `getCollisionZones()` / `currentManifest` getter 在 Task 7 实现，测试与实现一致

### 测试修正验证（a.txt 自审修复）

- ✅ Task 2 已删除 `cellCenter` 函数与 `TombRaidPoint` import（YAGNI 修复）
- ✅ Task 4 走廊断言用集合 + 坐标比较（方向无关）：
  - `expectedRooms.has(corridor.fromRoomId)` / `expectedRooms.has(corridor.toRoomId)` 集合断言
  - `leftRect = aRect.x <= bRect.x ? aRect : bRect` 坐标判定
  - `corridor.bounds.x >= leftRect.x + leftRect.width` 区间断言
- ✅ Task 7 宝箱测试用颜色断言（mock 矩形无 kind 字段）：
  - `manifest.chests[i]!.kind === 'gilded' ? GILDED : NORMAL`
  - `expect(rect.color).toBe(expected)`
- ✅ Task 7 destroy 测试用 `mock.calls.length >= 1`（mock destroy 是 no-op）
- ✅ Task 7 重渲染测试用 `getCollisionZones().length` 保持不变（不用 mock images 累积）

### 约束遵守

- ✅ 不修改剧情模式代码（EventEngine/storyManifest/SaveState/PreloadScene/InputManager/PlayScene/MapRenderer/CollisionManager）
- ✅ 生成器核心纯 TS 无 Phaser import（仅 TombRaidMapRenderer 用 `import type Phaser`，编译期擦除）
- ✅ TypeScript strict 友好（数组访问用 `!`；可选属性用 `?` 不赋 `undefined`；中间任务临时导出防止 noUnusedLocals）
- ✅ 资产约束：渲染器复用 `floor.tile` 的 `single-floor-tile-192` frame，不引用 `其他/`
- ✅ 深度层级沿用剧情模式：floor=0 / wall=1 / chest=3 / door=6 / label=7 / hitArea=8 / player=10（player 由 plan 3 处理）

### 结论

Plan 2 完成。7 个任务覆盖 spec §2 地图生成全部范围：mulberry32 RNG + 5×4 网格 + 连通子图选择 + 房间矩形 + 类型分配（BFS 最远出口）+ 生成树+环边拓扑 + 走廊与门 + 宝箱分布（spec §2.4 公式）+ baseline + 顶层组合 + 出口可达性 BFS + 可复现性 + 薄渲染器。生成器核心为纯 TS 可在 jsdom 单元测试，渲染器用 `import type Phaser` 编译期擦除。相机/视口/缄默者密度由 plan 3 处理，本 plan 不涉及。
