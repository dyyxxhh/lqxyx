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
