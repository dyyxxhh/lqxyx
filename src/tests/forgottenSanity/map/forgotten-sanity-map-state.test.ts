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
  FORGOTTEN_SANITY_MAP_HEIGHT,
  FORGOTTEN_SANITY_MAP_WIDTH,
  WALL_THICKNESS,
  rectCenter,
  rectContains,
  rectsIntersect,
  type ForgottenSanityMapManifest,
  type ForgottenSanityRect,
  type ForgottenSanityRoomKind,
} from '../../../forgottenSanity/map/forgottenSanityMapState';

describe('forgottenSanityMapState 常量 (spec §2.1)', () => {
  it('地图尺寸 5000 × 4000', () => {
    expect(FORGOTTEN_SANITY_MAP_WIDTH).toBe(5000);
    expect(FORGOTTEN_SANITY_MAP_HEIGHT).toBe(4000);
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
    const r: ForgottenSanityRect = { x: 100, y: 200, width: 50, height: 60 };
    expect(rectCenter(r)).toEqual({ x: 125, y: 230 });
  });
  it('rectsIntersect 重叠为 true', () => {
    const a: ForgottenSanityRect = { x: 0, y: 0, width: 100, height: 100 };
    const b: ForgottenSanityRect = { x: 50, y: 50, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(true);
  });
  it('rectsIntersect 仅邻接（共享边）为 false', () => {
    const a: ForgottenSanityRect = { x: 0, y: 0, width: 100, height: 100 };
    const b: ForgottenSanityRect = { x: 100, y: 0, width: 100, height: 100 };
    expect(rectsIntersect(a, b)).toBe(false);
  });
  it('rectsIntersect 完全分离为 false', () => {
    const a: ForgottenSanityRect = { x: 0, y: 0, width: 10, height: 10 };
    const b: ForgottenSanityRect = { x: 1000, y: 1000, width: 10, height: 10 };
    expect(rectsIntersect(a, b)).toBe(false);
  });
  it('rectContains 内部点 true', () => {
    const r: ForgottenSanityRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 50, y: 50 })).toBe(true);
  });
  it('rectContains 边界点 true（含边界）', () => {
    const r: ForgottenSanityRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 0, y: 0 })).toBe(true);
    expect(rectContains(r, { x: 100, y: 100 })).toBe(true);
  });
  it('rectContains 外部点 false', () => {
    const r: ForgottenSanityRect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectContains(r, { x: 150, y: 50 })).toBe(false);
  });
});

describe('ForgottenSanityRoomKind 8 种房间（不含 corridor）', () => {
  it('kind 联合类型仅 8 种', () => {
    const kinds: ForgottenSanityRoomKind[] = [
      'entrance', 'classroom', 'vault', 'hall', 'trap', 'dark', 'switchRoom', 'exit',
    ];
    expect(kinds).toHaveLength(8);
  });
});

describe('ForgottenSanityMapManifest 结构（编译期类型校验）', () => {
  it('manifest 字段齐全', () => {
    const manifest: ForgottenSanityMapManifest = {
      id: 'ying-zhong-jiu-forgotten-sanity',
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


