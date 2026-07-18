// src/forgottenSanity/loot/ChestDecrypt.ts
// 宝箱破译 Phaser 薄层渲染：旋转码环 / 进度弧 / 粒子 + 贴图切换 + 全屏白闪 + 开盖金光柱 + 战利品卡飞出。
// 仅 `import type Phaser`（编译期擦除，运行时无 phaser 依赖；测试注入 fake scene）。
// 渲染参数 spec §7.3 grill 确认 2026-07-17（夸张视觉档）。
import type Phaser from 'phaser';

import { ChestDecryptState, type ChestDecryptSnapshot } from './chestDecryptState';
import type { LootItem, LootRarity } from './LootItem';

// === grill §7.3 渲染参数（权威性 2026-07-17，高于既有骨架常量）===
/** 旋转码环半径。 */
export const CODE_RING_RADIUS = 80;
/** 旋转码环角速度：1 圈/s = 2π rad/s。 */
export const CODE_RING_ROTATE_SPEED = 2 * Math.PI;
/** 旋转码环像素字符个数，均匀分布。 */
export const CODE_RING_CHAR_COUNT = 8;
/** 进度弧半径，0°→360° 随 progress 填充。 */
export const PROGRESS_ARC_RADIUS = 100;
/** 粒子数量。 */
export const PARTICLE_COUNT = 16;
/** 粒子最小漂浮半径。 */
export const PARTICLE_MIN_R = 120;
/** 粒子最大漂浮半径。 */
export const PARTICLE_MAX_R = 150;
/** 粒子寿命循环周期。 */
export const PARTICLE_LIFETIME_MS = 1000;
/** 破译中持续屏震最大幅度（progress=1 时）。 */
export const SHAKE_MAX_PX = 6;
/** 锁扣崩开瞬时震幅倍率（×3 = 18px）。 */
export const LOCK_BREAK_SHAKE_MULTIPLIER = 3;
/** 像素幅度 → Phaser camera.shake intensity 的换算因子。 */
export const SHAKE_PX_TO_INTENSITY = 1 / 1000;
/** 最后一扣全屏白闪时长（1 帧 ~16ms）。 */
export const FINAL_LOCK_FLASH_MS = 16;
/** 开盖金光柱宽度（半径）。 */
export const LIGHT_PILLAR_RADIUS = 150;
/** 开盖金光柱高度。 */
export const LIGHT_PILLAR_HEIGHT = 150;
/** 开盖金光柱渐隐持续时间。 */
export const LIGHT_PILLAR_DURATION_MS = 800;
/** 战利品卡尺寸（正方形边长）。 */
export const LOOT_CARD_SIZE = 64;
/** 战利品卡飞出距离。 */
export const LOOT_CARD_FLY_DISTANCE = 200;
/** 战利品卡悬停时长。 */
export const LOOT_CARD_HOVER_MS = 1500;
/** 战利品卡按稀有度的描边色（grill §7.3）。 */
export const LOOT_RARITY_BORDER_COLORS: Record<LootRarity, number> = {
  blue: 0x4a90e2,
  purple: 0xa155d1,
  green: 0x4caf50,
  gold: 0xffc107,
  white: 0xffffff,
};

const LOCK_BREAK_SHAKE_DURATION_MS = 80;
const ONGOING_SHAKE_DURATION_MS = 80;
const CABINET_TEXTURE_FRONT = 'prop.phoneCabinetFront';
const CABINET_TEXTURE_ANGLED = 'prop.phoneCabinetAngled';

export interface ChestDecryptConfig {
  readonly scene: Phaser.Scene;
  readonly x: number;
  readonly y: number;
  readonly lootItems: readonly LootItem[];
  readonly onLootCollected?: (item: LootItem) => void;
  readonly inputKey?: string;
  readonly isVaultChest?: boolean;
}

interface LootCardHandle {
  readonly container: Phaser.GameObjects.Container;
  readonly item: LootItem;
  readonly onClick: () => void;
}

export class ChestDecrypt {
  private readonly scene: Phaser.Scene;
  private readonly inputKey: string;
  private readonly onLootCollected: (item: LootItem) => void;
  private readonly lootItems: readonly LootItem[];
  private readonly state: ChestDecryptState;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cabinet: Phaser.GameObjects.Image;
  private readonly ringGraphics: Phaser.GameObjects.Graphics;
  private readonly arcGraphics: Phaser.GameObjects.Graphics;
  private readonly particleGraphics: Phaser.GameObjects.Graphics;
  private readonly lootCards: LootCardHandle[] = [];
  private destroyed = false;

  constructor(config: ChestDecryptConfig) {
    this.scene = config.scene;
    this.inputKey = config.inputKey ?? 'F';
    this.onLootCollected = config.onLootCollected ?? (() => {});
    this.lootItems = config.lootItems;

    this.state = new ChestDecryptState({
      onLockBroken: (i) => this.handleLockBroken(i),
      onOpenStart: () => this.handleOpenStart(),
      onCompleted: () => this.handleCompleted(),
    });

    this.container = config.scene.add.container(config.x, config.y);
    this.cabinet = config.scene.add
      .image(0, 0, CABINET_TEXTURE_FRONT)
      .setDisplaySize(96, 144);
    this.ringGraphics = config.scene.add.graphics();
    this.arcGraphics = config.scene.add.graphics();
    this.particleGraphics = config.scene.add.graphics();
    this.container.add([this.cabinet, this.ringGraphics, this.arcGraphics, this.particleGraphics]);

    if (config.isVaultChest === true) {
      // spec §10.1: vault chest 免费破译 — 跳过 decrypting 阶段，直接进入 opened 态
      (this.state as unknown as { phase: 'idle' | 'decrypting' | 'opened' | 'completed' }).phase = 'opened';
      this.handleOpenStart();
      return; // 不调用 wireInput（无需 F 键）
    }
    this.wireInput();
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.state.advance(deltaMs);
    this.render();
  }

  snapshot(): ChestDecryptSnapshot {
    return this.state.snapshot();
  }

  cabinetTextureKey(): string {
    return (
      (this.cabinet as unknown as { textureKey?: string }).textureKey ??
      (this.cabinet.texture as unknown as { key: string } | null)?.key ??
      ''
    );
  }

  clickAllLootCards(): void {
    for (const card of [...this.lootCards]) card.onClick();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.destroy();
    this.lootCards.length = 0;
  }

  private wireInput(): void {
    const kb = this.scene.input.keyboard;
    if (kb === null) return;
    kb.on(`keydown-${this.inputKey}`, () => this.onKeyDown());
    kb.on(`keyup-${this.inputKey}`, () => this.state.release());
  }

  private onKeyDown(): void {
    if (this.destroyed) return;
    const snap = this.state.snapshot();
    if (snap.phase === 'idle') this.state.start();
    else this.state.hold();
  }

  private render(): void {
    const snap = this.state.snapshot();

    // 进度弧 r100，0°→360° 随 progress 填充，金色描边。
    this.arcGraphics.clear();
    if (snap.phase === 'decrypting' || snap.phase === 'opened') {
      this.arcGraphics.lineStyle(4, 0xffd700, 1);
      this.arcGraphics.beginPath();
      this.arcGraphics.arc(
        0,
        0,
        PROGRESS_ARC_RADIUS,
        -Math.PI / 2,
        -Math.PI / 2 + snap.progress * Math.PI * 2,
      );
      this.arcGraphics.strokePath();
    }

    // 旋转码环 r80，1 圈/s，8 字符均匀分布。
    this.ringGraphics.clear();
    if (snap.phase === 'decrypting') {
      const ringAngle = (snap.elapsedMs / 1000) * CODE_RING_ROTATE_SPEED;
      this.ringGraphics.lineStyle(2, 0x88aacc, 0.6);
      this.ringGraphics.beginPath();
      this.ringGraphics.arc(0, 0, CODE_RING_RADIUS, ringAngle, ringAngle + Math.PI * 1.5);
      this.ringGraphics.strokePath();
      for (let i = 0; i < CODE_RING_CHAR_COUNT; i++) {
        const a = ringAngle + (i / CODE_RING_CHAR_COUNT) * Math.PI * 2;
        const cx = Math.cos(a) * CODE_RING_RADIUS;
        const cy = Math.sin(a) * CODE_RING_RADIUS;
        this.ringGraphics.fillStyle(0x88aacc, 0.6);
        this.ringGraphics.beginPath();
        this.ringGraphics.arc(cx, cy, 4, 0, Math.PI * 2);
        this.ringGraphics.fillPath();
      }
    }

    // 粒子 16 个，r120-150 漂浮，1s 寿命循环。
    this.particleGraphics.clear();
    if (snap.phase === 'decrypting' || snap.phase === 'opened') {
      const cycle = (snap.elapsedMs % PARTICLE_LIFETIME_MS) / PARTICLE_LIFETIME_MS;
      const spin = cycle * Math.PI * 2;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const drift = 0.5 + 0.5 * Math.sin(spin + i);
        const r = PARTICLE_MIN_R + (PARTICLE_MAX_R - PARTICLE_MIN_R) * drift;
        const px = Math.cos(baseAngle + spin) * r;
        const py = Math.sin(baseAngle + spin) * r;
        this.particleGraphics.fillStyle(0xffe082, 0.5);
        this.particleGraphics.beginPath();
        this.particleGraphics.arc(px, py, 3, 0, Math.PI * 2);
        this.particleGraphics.fillPath();
      }
    }

    // 屏震幅度 progress × 6px（progress=1 时最大 6px），仅破译中持续。
    if (snap.phase === 'decrypting') {
      const shakePx = snap.progress * SHAKE_MAX_PX;
      this.scene.cameras.main.shake(ONGOING_SHAKE_DURATION_MS, shakePx * SHAKE_PX_TO_INTENSITY);
    }
  }

  private handleLockBroken(_lockIndex: number): void {
    // 锁扣崩开震幅 ×3（即 18px 瞬时震）。
    const amplitudePx = SHAKE_MAX_PX * LOCK_BREAK_SHAKE_MULTIPLIER;
    this.scene.cameras.main.shake(
      LOCK_BREAK_SHAKE_DURATION_MS,
      amplitudePx * SHAKE_PX_TO_INTENSITY,
    );
  }

  private handleOpenStart(): void {
    // 最后一扣全屏白闪 1 帧（~16ms），alpha=1.0 后立即归零。
    this.scene.cameras.main.flash(FINAL_LOCK_FLASH_MS, 255, 255, 255);
    // 切贴图 prop.phoneCabinetFront → prop.phoneCabinetAngled。
    this.cabinet.setTexture(CABINET_TEXTURE_ANGLED);
    // 开盖金光柱 r150 高150，从宝箱中心向上，800ms 渐隐。
    this.spawnLightPillar();
  }

  private spawnLightPillar(): void {
    const pillar = this.scene.add.graphics();
    pillar.fillStyle(0xffe066, 0.85);
    pillar.fillRect(
      -LIGHT_PILLAR_RADIUS / 2,
      -LIGHT_PILLAR_HEIGHT,
      LIGHT_PILLAR_RADIUS,
      LIGHT_PILLAR_HEIGHT,
    );
    this.container.add(pillar);
    this.scene.tweens.add({
      targets: pillar,
      alpha: 0,
      duration: LIGHT_PILLAR_DURATION_MS,
      ease: 'Cubic.out',
    });
  }

  private handleCompleted(): void {
    this.lootItems.forEach((item, index) => this.spawnLootCard(item, index));
  }

  private spawnLootCard(item: LootItem, index: number): void {
    const total = this.lootItems.length;
    const spread = LOOT_CARD_SIZE + 16;
    const offsetX = (index - (total - 1) / 2) * spread;
    const card = this.scene.add.container(
      this.container.x + offsetX,
      this.container.y,
    );
    const icon = this.scene.add
      .image(0, 0, item.spriteKey)
      .setDisplaySize(LOOT_CARD_SIZE, LOOT_CARD_SIZE);
    const borderColor = LOOT_RARITY_BORDER_COLORS[item.rarity] ?? 0xffffff;
    const border = this.scene.add.graphics();
    border.lineStyle(3, borderColor, 1);
    border.strokeRect(
      -LOOT_CARD_SIZE / 2,
      -LOOT_CARD_SIZE / 2,
      LOOT_CARD_SIZE,
      LOOT_CARD_SIZE,
    );
    card.add([icon, border]);
    card.setSize(LOOT_CARD_SIZE, LOOT_CARD_SIZE);
    card.setInteractive({ useHandCursor: true });
    const onClick = (): void => {
      this.onLootCollected(item);
      const idx = this.lootCards.findIndex((h) => h.item === item);
      if (idx >= 0) this.lootCards.splice(idx, 1);
      card.destroy();
    };
    card.on('pointerdown', onClick);
    // 战利品卡从宝箱飞出 200px 距离，悬停 1.5s 可拾取。
    this.scene.tweens.add({
      targets: card,
      y: card.y - LOOT_CARD_FLY_DISTANCE,
      duration: LOOT_CARD_HOVER_MS,
      ease: 'Cubic.out',
    });
    this.lootCards.push({ container: card, item, onClick });
  }
}
