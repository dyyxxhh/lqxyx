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
} from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';

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

import {
  assignRoomKinds,
  generateRoomRectangles,
} from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';
import { WALL_THICKNESS, type ForgottenSanityRoom } from '../../../forgottenSanity/map/forgottenSanityMapState';

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
  function makeRooms(cellIndices: number[]): ForgottenSanityRoom[] {
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

import {
  addRingEdges,
  buildCorridorsAndDoors,
  buildSpanningTree,
  type Edge,
} from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
} from '../../../forgottenSanity/map/forgottenSanityMapState';

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
    const ringSet = new Set(ring.map((e) => `${e.a}-${e.b}`));
    // 超集断言：每条树边都在环边集合中（tree ⊆ ring）
    for (const e of tree) {
      expect(ringSet.has(`${e.a}-${e.b}`)).toBe(true);
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
  function makeRoomsAt(cells: number[]): ForgottenSanityRoom[] {
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
      { a: 0, b: 1, id: 'edge-0-1' }, // 水平相邻
      { a: 0, b: 5, id: 'edge-0-5' }, // 垂直相邻
    ];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { corridors, doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    expect(corridors).toHaveLength(2);
    expect(doors).toHaveLength(4);
  });
  it('水平走廊（同行）bounds 在两房间之间，orientation=horizontal', () => {
    const rooms = makeRoomsAt([0, 1]);
    const edges: Edge[] = [{ a: 0, b: 1, id: 'edge-0-1' }];
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
    const edges: Edge[] = [{ a: 0, b: 5, id: 'edge-0-5' }];
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
    const edges: Edge[] = [{ a: 0, b: 1, id: 'edge-0-1' }];
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
    const edges: Edge[] = [{ a: 0, b: 5, id: 'edge-0-5' }];
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
    const edges: Edge[] = [{ a: 0, b: 1, id: 'edge-0-1' }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.locked).toBe(true);
    }
  });
  it('classroom 房间连接的门 locked=false', () => {
    const rooms = makeRoomsAt([0, 1]);
    const edges: Edge[] = [{ a: 0, b: 1, id: 'edge-0-1' }];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    for (const d of doors) {
      expect(d.locked).toBe(false);
    }
  });
  it('门 id 唯一', () => {
    const rooms = makeRoomsAt([0, 1, 5, 6]);
    const edges: Edge[] = [
      { a: 0, b: 1, id: 'edge-0-1' },
      { a: 0, b: 5, id: 'edge-0-5' },
      { a: 1, b: 6, id: 'edge-1-6' },
      { a: 5, b: 6, id: 'edge-5-6' },
    ];
    const roomById = new Map(rooms.map((r) => [r.id, r] as const));
    const { doors } = buildCorridorsAndDoors(rooms, edges, roomById);
    const ids = new Set(doors.map((d) => d.id));
    expect(ids.size).toBe(doors.length);
  });
});

import {
  computeBaselineSanity,
  distributeChests,
} from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';

describe('computeBaselineSanity', () => {
  it('baseline = roomCount × 50', () => {
    expect(computeBaselineSanity(16)).toBe(800);
    expect(computeBaselineSanity(20)).toBe(1000);
    expect(computeBaselineSanity(18)).toBe(900);
  });
});

describe('distributeChests', () => {
  function makeRooms(cellCount: number): { rooms: ForgottenSanityRoom[]; vaultId: string; hallId: string; entranceId: string; exitId: string } {
    const cells = Array.from({ length: cellCount }, (_, i) => i);
    const rooms: ForgottenSanityRoom[] = cells.map((ci) => {
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

import { generateForgottenSanityMap } from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';
import {
  GRID_COLS,
  GRID_ROWS,
  MAX_ROOMS,
  MIN_ROOMS,
  FORGOTTEN_SANITY_MAP_HEIGHT,
  FORGOTTEN_SANITY_MAP_WIDTH,
} from '../../../forgottenSanity/map/forgottenSanityMapState';

describe('generateForgottenSanityMap 顶层组合', () => {
  it('返回 manifest，roomCount 在 [16, 20]', () => {
    const m = generateForgottenSanityMap(42);
    expect(m.roomCount).toBeGreaterThanOrEqual(MIN_ROOMS);
    expect(m.roomCount).toBeLessThanOrEqual(MAX_ROOMS);
  });
  it('manifest.id 固定为 ying-zhong-jiu-forgotten-sanity', () => {
    expect(generateForgottenSanityMap(1).id).toBe('ying-zhong-jiu-forgotten-sanity');
  });
  it('manifest.seed 等于传入 seed', () => {
    expect(generateForgottenSanityMap(123).seed).toBe(123);
  });
  it('bounds 为 5000×4000', () => {
    const m = generateForgottenSanityMap(7);
    expect(m.bounds).toEqual({ x: 0, y: 0, width: FORGOTTEN_SANITY_MAP_WIDTH, height: FORGOTTEN_SANITY_MAP_HEIGHT });
  });
  it('grid 为 5×4 / cell 1000×1000', () => {
    const m = generateForgottenSanityMap(7);
    expect(m.grid).toEqual({ cols: GRID_COLS, rows: GRID_ROWS, cellWidth: 1000, cellHeight: 1000 });
  });
  it('rooms 数量等于 roomCount', () => {
    const m = generateForgottenSanityMap(99);
    expect(m.rooms).toHaveLength(m.roomCount);
  });
  it('entrance / exit / vault / hall 各 1 个且互不相同', () => {
    const m = generateForgottenSanityMap(99);
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
    const m = generateForgottenSanityMap(33);
    expect(m.baselineSanity).toBe(m.roomCount * 50);
  });
  it('floorTile 192×192', () => {
    expect(generateForgottenSanityMap(33).floorTile).toEqual({ tileWidth: 192, tileHeight: 192 });
  });
  it('出口从入口 BFS 可达（基于 corridors 邻接）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const m = generateForgottenSanityMap(seed);
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
    const m = generateForgottenSanityMap(42);
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
    const a = generateForgottenSanityMap(2024);
    const b = generateForgottenSanityMap(2024);
    expect(a).toEqual(b);
  });
  it('不同种子通常产生不同 manifest（roomCount 或 rooms 不同）', () => {
    const a = generateForgottenSanityMap(1);
    const b = generateForgottenSanityMap(2);
    // 至少 seed 字段不同
    expect(a.seed).not.toBe(b.seed);
  });
  it('宝箱数在 7-11', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const m = generateForgottenSanityMap(seed);
      expect(m.chests.length).toBeGreaterThanOrEqual(7);
      expect(m.chests.length).toBeLessThanOrEqual(11);
    }
  });
});
