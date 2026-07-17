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
// DEPTH_HITAREA = 8; // 预留，本 plan 暂不渲染 hitArea

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
