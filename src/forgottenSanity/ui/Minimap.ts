// src/forgottenSanity/ui/Minimap.ts
// 被遗忘的理智小地图 + 大地图：雾战脚步点亮、玩家/出口/宝箱/身体标记、M 键或点击切换大地图、ESC 关闭修复。
// 仅 import type Phaser —— 编译期擦除；键码用字符串 'M'/'ESC' 避免 runtime 访问 Phaser 命名空间。
// spec §9.2（雾战+标记+大地图），plan 6 Task 7。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle } from '../../ui/uiTheme';

export const MINIMAP_DEPTH = 1011;
export const BIG_MAP_DEPTH = 1980;
export const BIG_MAP_TEXT_DEPTH = 1981;

export interface MinimapBodyMarker {
  readonly bodyId: string;
  readonly x: number;
  readonly y: number;
}

export interface MinimapUpdate {
  readonly playerX: number;
  readonly playerY: number;
  /** 已点亮的 cellIndex 列表（雾战：未点亮区域内的标记不显示）。 */
  readonly exploredCells: readonly number[];
  readonly chestMarkers: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly opened: boolean;
    readonly kind: 'normal' | 'gilded';
  }[];
  readonly bodyMarkers: readonly MinimapBodyMarker[];
  readonly exitDiscovered: boolean;
  readonly exitX: number;
  readonly exitY: number;
}

const MAP_WORLD_WIDTH = 5000;
const MAP_WORLD_HEIGHT = 4000;
const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 160;
const MINIMAP_X = GAME_WIDTH - MINIMAP_WIDTH / 2 - 16;
const MINIMAP_Y = MINIMAP_HEIGHT / 2 + 16;
const BIG_MAP_WIDTH = 880;
const BIG_MAP_HEIGHT = 560;

const COLOR_PLAYER = UI_THEME.colors.gold;
const COLOR_CHEST = 0x9c7a3a;
const COLOR_CHEST_GILDED = UI_THEME.colors.gold;
const COLOR_CHEST_OPENED = 0x444444;
const COLOR_EXIT = 0x6bff8f;
const COLOR_BODY = UI_THEME.colors.accent;

export class Minimap {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private bigMapBg: Phaser.GameObjects.Rectangle | null = null;
  private markers: Phaser.GameObjects.Arc[] = [];
  private bigMapMarkers: Phaser.GameObjects.Arc[] = [];
  private bigMapOpen = false;
  private keyM: Phaser.Input.Keyboard.Key | null = null;
  private keyEsc: Phaser.Input.Keyboard.Key | null = null;
  private escPrevDown = false;
  private mPrevDown = false;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.bg = this.scene.add.rectangle(
      MINIMAP_X, MINIMAP_Y, MINIMAP_WIDTH, MINIMAP_HEIGHT,
      UI_THEME.colors.surface, UI_THEME.alpha.panel,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(MINIMAP_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    this.bg.on('pointerup', () => this.toggleBigMap());

    this.bigMapBg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, BIG_MAP_WIDTH, BIG_MAP_HEIGHT,
      UI_THEME.colors.surface, 0.96,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(BIG_MAP_DEPTH)
      .setVisible(false);
    applyPixelStrokeStyle(this.bigMapBg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);
    this.bigMapBg.setInteractive({ useHandCursor: true });
    this.bigMapBg.on('pointerup', () => this.toggleBigMap());

    if (this.scene.input.keyboard) {
      // 字串键码避免 runtime 访问 Phaser.Input.Keyboard.KeyCodes 命名空间（保持 import type）
      this.keyM = this.scene.input.keyboard.addKey('M');
      this.keyEsc = this.scene.input.keyboard.addKey('ESC');
    }
  }

  isBigMapOpen(): boolean {
    return this.bigMapOpen;
  }

  toggleBigMap(): void {
    this.bigMapOpen = !this.bigMapOpen;
    this.bigMapBg?.setVisible(this.bigMapOpen);
    if (!this.bigMapOpen) {
      for (const m of this.bigMapMarkers) m.destroy();
      this.bigMapMarkers = [];
    }
  }

  /** @returns true 表示 ESC 被消费（大地图已开并关闭），false 表示未消费。 */
  handleEsc(): boolean {
    if (this.bigMapOpen) {
      this.toggleBigMap();
      return true;
    }
    return false;
  }

  update(u: MinimapUpdate): void {
    for (const m of this.markers) m.destroy();
    this.markers = [];

    // spec §9.2: 雾战脚步点亮——仅绘制已探索 cell 内的宝箱/出口/身体标记。
    // 玩家点本身始终绘制（玩家所在 cell 必然已探索）。
    const exploredSet = new Set<number>(u.exploredCells);
    const cellCols = 5;      // GRID_COLS (spec §2.1)
    const cellWidth = 1000;  // CELL_WIDTH
    const cellHeight = 1000; // CELL_HEIGHT
    const cellIndexOf = (wx: number, wy: number): number => {
      const col = Math.floor(wx / cellWidth);
      const row = Math.floor(wy / cellHeight);
      return row * cellCols + col;
    };

    const px = this.worldToMinimapX(u.playerX);
    const py = this.worldToMinimapY(u.playerY);
    this.markers.push(this.scene.add.circle(px, py, 4, COLOR_PLAYER, 1)
      .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));

    for (const c of u.chestMarkers) {
      const cellIdx = cellIndexOf(c.x, c.y);
      if (!exploredSet.has(cellIdx)) continue;
      const cx = this.worldToMinimapX(c.x);
      const cy = this.worldToMinimapY(c.y);
      const color = c.opened
        ? COLOR_CHEST_OPENED
        : (c.kind === 'gilded' ? COLOR_CHEST_GILDED : COLOR_CHEST);
      this.markers.push(this.scene.add.circle(cx, cy, 3, color, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    if (u.exitDiscovered) {
      const exitCell = cellIndexOf(u.exitX, u.exitY);
      if (exploredSet.has(exitCell)) {
        const ex = this.worldToMinimapX(u.exitX);
        const ey = this.worldToMinimapY(u.exitY);
        this.markers.push(this.scene.add.circle(ex, ey, 4, COLOR_EXIT, 1)
          .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
      }
    }

    for (const b of u.bodyMarkers) {
      const cellIdx = cellIndexOf(b.x, b.y);
      if (!exploredSet.has(cellIdx)) continue;
      const bx = this.worldToMinimapX(b.x);
      const by = this.worldToMinimapY(b.y);
      this.markers.push(this.scene.add.circle(bx, by, 3, COLOR_BODY, 1)
        .setScrollFactor(0).setDepth(MINIMAP_DEPTH + 1));
    }

    if (this.bigMapOpen) {
      for (const m of this.bigMapMarkers) m.destroy();
      this.bigMapMarkers = [];
      const scale = BIG_MAP_WIDTH / MINIMAP_WIDTH;
      const ox = GAME_WIDTH / 2 - (MINIMAP_WIDTH * scale) / 2;
      const oy = GAME_HEIGHT / 2 - (MINIMAP_HEIGHT * scale) / 2;
      this.bigMapMarkers.push(this.scene.add.circle(ox + px * scale, oy + py * scale, 6, COLOR_PLAYER, 1)
        .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      // spec §9.2: 大地图复用小地图雾战过滤——未探索 cell 内的 chest/exit/body 不绘制。
      for (const c of u.chestMarkers) {
        const cellIdx = cellIndexOf(c.x, c.y);
        if (!exploredSet.has(cellIdx)) continue;
        const cx = this.worldToMinimapX(c.x);
        const cy = this.worldToMinimapY(c.y);
        const color = c.opened
          ? COLOR_CHEST_OPENED
          : (c.kind === 'gilded' ? COLOR_CHEST_GILDED : COLOR_CHEST);
        this.bigMapMarkers.push(this.scene.add.circle(ox + cx * scale, oy + cy * scale, 5, color, 1)
          .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      }
      if (u.exitDiscovered) {
        const exitCell = cellIndexOf(u.exitX, u.exitY);
        if (exploredSet.has(exitCell)) {
          const ex = this.worldToMinimapX(u.exitX);
          const ey = this.worldToMinimapY(u.exitY);
          this.bigMapMarkers.push(this.scene.add.circle(ox + ex * scale, oy + ey * scale, 6, COLOR_EXIT, 1)
            .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
        }
      }
      for (const b of u.bodyMarkers) {
        const cellIdx = cellIndexOf(b.x, b.y);
        if (!exploredSet.has(cellIdx)) continue;
        const bx = this.worldToMinimapX(b.x);
        const by = this.worldToMinimapY(b.y);
        this.bigMapMarkers.push(this.scene.add.circle(ox + bx * scale, oy + by * scale, 5, COLOR_BODY, 1)
          .setScrollFactor(0).setDepth(BIG_MAP_TEXT_DEPTH));
      }
    }
  }

  /** 每帧轮询 M/ESC 键（边缘触发）。 */
  pollKeyboard(): void {
    if (!this.keyM || !this.keyEsc) return;
    const mDown = this.keyM.isDown;
    if (mDown && !this.mPrevDown) this.toggleBigMap();
    this.mPrevDown = mDown;

    const escDown = this.keyEsc.isDown;
    if (escDown && !this.escPrevDown) this.handleEsc();
    this.escPrevDown = escDown;
  }

  private worldToMinimapX(worldX: number): number {
    return MINIMAP_X - MINIMAP_WIDTH / 2 + (worldX / MAP_WORLD_WIDTH) * MINIMAP_WIDTH;
  }

  private worldToMinimapY(worldY: number): number {
    return MINIMAP_Y - MINIMAP_HEIGHT / 2 + (worldY / MAP_WORLD_HEIGHT) * MINIMAP_HEIGHT;
  }

  destroy(): void {
    for (const m of this.markers) m.destroy();
    for (const m of this.bigMapMarkers) m.destroy();
    this.markers = [];
    this.bigMapMarkers = [];
  }
}

export { GAME_HEIGHT };
