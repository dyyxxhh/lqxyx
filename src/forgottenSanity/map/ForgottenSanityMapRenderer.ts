// src/forgottenSanity/map/ForgottenSanityMapRenderer.ts
// 被遗忘的理智地图渲染器：把 ForgottenSanityMapManifest 渲染成 Phaser 场景对象。
// 复用剧情模式 floor.tile 的 single-floor-tile-192 frame（192×192）。
// import type Phaser —— 编译期擦除，jsdom 测试可 mock phaser 后导入。
import type Phaser from 'phaser';

import {
  FLOOR_TILE_SIZE,
  WALL_THICKNESS,
  type ForgottenSanityMapManifest,
  type ForgottenSanityRect,
  type ForgottenSanityDoorSpawn,
} from './forgottenSanityMapState';

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
const NOTE_SPRITE_KEY = 'note.遗落的纸条';
const NOTE_FILL_COLOR = 0xf5f0e1;
const NOTE_STROKE_COLOR = 0x3a2f25;
const NOTE_STROKE_WIDTH = 2;
const LABEL_COLOR = '#c9b89a';

// 深度层级（沿用剧情模式 MapRenderer）
const DEPTH_FLOOR = 0;
const DEPTH_WALL = 1;
const DEPTH_CHEST = 3;
const DEPTH_NOTE = 3;
const DEPTH_DOOR = 6;
const DEPTH_LABEL = 7;
// DEPTH_HITAREA = 8; // 预留，本 plan 暂不渲染 hitArea

interface RenderedObject {
  readonly destroy: () => void;
}

export class ForgottenSanityMapRenderer {
  private readonly scene: Phaser.Scene;
  private objects: RenderedObject[] = [];
  private collisionZones: ForgottenSanityRect[] = [];
  private _currentManifest: ForgottenSanityMapManifest | null = null;
  private floorFrameEnsured = false;
  private vaultDoorUnlocked = false;
  private vaultDoorZone: Phaser.GameObjects.Zone | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get currentManifest(): ForgottenSanityMapManifest | null {
    return this._currentManifest;
  }

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
  }

  render(manifest: ForgottenSanityMapManifest): void {
    this.clear();
    this._currentManifest = manifest;
    this.ensureFloorFrame();
    this.renderFloors(manifest);
    this.renderWalls(manifest);
    this.renderDoors(manifest);
    this.renderChests(manifest);
    this.renderNotes(manifest);
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

  getCollisionZones(): readonly ForgottenSanityRect[] {
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

  private renderFloors(manifest: ForgottenSanityMapManifest): void {
    if (!this.scene.textures.exists(FLOOR_TEXTURE_KEY)) return;
    const tile = manifest.floorTile;
    const areas: ForgottenSanityRect[] = [
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

  private renderWalls(manifest: ForgottenSanityMapManifest): void {
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

  private addWallRect(rect: ForgottenSanityRect): void {
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

  private renderDoors(manifest: ForgottenSanityMapManifest): void {
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

  private renderChests(manifest: ForgottenSanityMapManifest): void {
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

  private renderNotes(manifest: ForgottenSanityMapManifest): void {
    for (const note of manifest.notes) {
      const b = note.bounds;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (this.scene.textures.exists(NOTE_SPRITE_KEY)) {
        const sprite = this.scene.add.image(cx, cy, NOTE_SPRITE_KEY);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDisplaySize(b.width, b.height);
        sprite.setDepth(DEPTH_NOTE);
        this.objects.push(sprite as unknown as RenderedObject);
      } else {
        // fallback: 米色 48x48 矩形 + 暗边
        const gfx = this.scene.add.graphics();
        gfx.fillStyle(NOTE_FILL_COLOR, 1);
        gfx.fillRect(b.x, b.y, b.width, b.height);
        gfx.lineStyle(NOTE_STROKE_WIDTH, NOTE_STROKE_COLOR, 1);
        gfx.strokeRect(b.x, b.y, b.width, b.height);
        gfx.setDepth(DEPTH_NOTE);
        this.objects.push(gfx as unknown as RenderedObject);
      }
    }
  }

  private renderLabels(manifest: ForgottenSanityMapManifest): void {
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
