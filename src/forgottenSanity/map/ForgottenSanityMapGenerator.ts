// src/forgottenSanity/map/ForgottenSanityMapGenerator.ts
// 被遗忘的理智地图生成器：纯函数 + mulberry32 种子 RNG（纯 TS，无 Phaser import）。
// spec §2.1 / §2.3 / §2.5
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
  FORGOTTEN_SANITY_MAP_HEIGHT,
  FORGOTTEN_SANITY_MAP_WIDTH,
  WALL_THICKNESS,
  type ForgottenSanityChestSpawn,
  type ForgottenSanityCorridor,
  type ForgottenSanityDoorSpawn,
  type ForgottenSanityMapManifest,
  type ForgottenSanityRect,
  type ForgottenSanityRoom,
  type ForgottenSanityRoomKind,
} from './forgottenSanityMapState';

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

export function cellBounds(index: number): ForgottenSanityRect {
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

// 后续 Task 4-6 在此文件追加 buildSpanningTree / addRingEdges /
// buildCorridorsAndDoors / distributeChests / computeBaselineSanity /
// generateForgottenSanityMap

// ---------------------------------------------------------------------------
// generateRoomRectangles — 给每个 cell 生成房间矩形
// ---------------------------------------------------------------------------
const ROOM_MIN_SIZE = 600;
const ROOM_MAX_SIZE = 900;

export function generateRoomRectangles(rng: Rng, cells: readonly number[]): ForgottenSanityRoom[] {
  const rooms: ForgottenSanityRoom[] = [];
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
const REMAINING_KINDS: readonly ForgottenSanityRoomKind[] = [
  'classroom', 'classroom', 'classroom', 'classroom', // 40% classroom
  'trap', 'trap',                                       // 20% trap
  'dark', 'dark',                                       // 20% dark
  'switchRoom', 'switchRoom',                           // 20% switchRoom
];

export interface AssignRoomKindsResult {
  readonly rooms: readonly ForgottenSanityRoom[];
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

export function assignRoomKinds(rng: Rng, rooms: readonly ForgottenSanityRoom[]): AssignRoomKindsResult {
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
  const out: ForgottenSanityRoom[] = rooms.map((r) => {
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
    const labelMap: Record<ForgottenSanityRoomKind, string> = {
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
  readonly corridors: readonly ForgottenSanityCorridor[];
  readonly doors: readonly ForgottenSanityDoorSpawn[];
}

export function buildCorridorsAndDoors(
  _rooms: readonly ForgottenSanityRoom[],
  edges: readonly Edge[],
  roomById: ReadonlyMap<string, ForgottenSanityRoom>,
): CorridorsAndDoors {
  const corridors: ForgottenSanityCorridor[] = [];
  const doors: ForgottenSanityDoorSpawn[] = [];
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

    let corridorBounds: ForgottenSanityRect;
    let doorA: ForgottenSanityRect;
    let doorB: ForgottenSanityRect;

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

function chestInRoom(rng: Rng, room: ForgottenSanityRoom, kind: 'normal' | 'gilded', idx: number): ForgottenSanityChestSpawn {
  const wb = room.walkableBounds;
  const maxX = wb.x + wb.width - CHEST_SIZE;
  const maxY = wb.y + wb.height - CHEST_SIZE;
  const x = rng.int(wb.x, Math.max(wb.x, maxX));
  const y = rng.int(wb.y, Math.max(wb.y, maxY));
  const bounds: ForgottenSanityRect = { x, y, width: CHEST_SIZE, height: CHEST_SIZE };
  return {
    id: `chest-${idx}`,
    roomId: room.id,
    kind,
    bounds,
  };
}

export function distributeChests(
  rng: Rng,
  rooms: readonly ForgottenSanityRoom[],
  vaultRoomId: string,
  hallRoomId: string,
): readonly ForgottenSanityChestSpawn[] {
  const chests: ForgottenSanityChestSpawn[] = [];
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
  const weightedPool: ForgottenSanityRoom[] = [];
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
    let picked: ForgottenSanityRoom | null = null;
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

  // hallRoomId 透传给上层 manifest 用，本函数不直接消费；防止 noUnusedLocals
  void hallRoomId;

  return chests;
}

// ---------------------------------------------------------------------------
// generateForgottenSanityMap — 顶层组合
// ---------------------------------------------------------------------------
export function generateForgottenSanityMap(seed: number): ForgottenSanityMapManifest {
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
    throw new Error(`generateForgottenSanityMap: exit ${exitRoomId} unreachable from entrance ${entranceRoomId}`);
  }

  return {
    id: 'ying-zhong-jiu-forgotten-sanity',
    seed,
    roomCount,
    bounds: { x: 0, y: 0, width: FORGOTTEN_SANITY_MAP_WIDTH, height: FORGOTTEN_SANITY_MAP_HEIGHT },
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
