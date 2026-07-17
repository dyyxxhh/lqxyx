// src/forgottenSanity/ui/RedEdgeFogOverlay.ts
// 杨云红边击杀全屏遮罩：触发后全屏"理智正在消散"持续 2s，玩家视野缩减为 220px，理智刷新 +100%。
// 仅 import type Phaser —— 编译期擦除，jsdom 测试无需 Phaser runtime。
// spec §5.10 / §9.3，plan 6 Task 8。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelTextStyle } from '../../ui/uiTheme';

export const RED_EDGE_VISIBILITY_RADIUS_PX = 220;
export const RED_EDGE_MASK_DURATION_MS = 2000;
export const FOG_MASK_DEPTH = 1990;
export const FOG_TEXT_DEPTH = 1991;

const FULLSCREEN_ALPHA = 0.92;

export class RedEdgeFogOverlay {
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private visionCircle: Phaser.GameObjects.Arc | null = null;
  private label: Phaser.GameObjects.Text | null = null;
  private textMaskTimer: Phaser.Time.TimerEvent | null = null;
  private redEdgeFogActive = false;
  private textMaskActive = false;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, FULLSCREEN_ALPHA,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(FOG_MASK_DEPTH).setVisible(false);

    // 视野孔：用透明圆叠加在全屏遮罩之上做简化"反向遮罩"近似（孔外黑，孔内透明）。
    this.visionCircle = this.scene.add.circle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, RED_EDGE_VISIBILITY_RADIUS_PX, 0x000000, 0,
    )
      .setScrollFactor(0).setDepth(FOG_MASK_DEPTH + 1).setVisible(false);

    this.label = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, '理智正在消散',
      {
        align: 'center',
        color: UI_THEME.colors.textDanger,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(FOG_TEXT_DEPTH).setVisible(false);
  }

  /** 红边雾战是否生效（220px 视野，持续到撤离/死亡）。 */
  isActive(): boolean {
    return this.redEdgeFogActive;
  }

  isRedEdgeFogActive(): boolean {
    return this.redEdgeFogActive;
  }

  /** 是否处于 2s 全屏文字遮罩期。 */
  isTextMaskActive(): boolean {
    return this.textMaskActive;
  }

  activate(playerX: number, playerY: number): void {
    this.redEdgeFogActive = true;
    this.textMaskActive = true;
    this.overlay?.setVisible(true).setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.visionCircle?.setVisible(true).setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
    this.label?.setVisible(true);

    if (this.textMaskTimer) this.textMaskTimer.remove();
    // 2s 后隐藏文字与全屏遮罩，但保留 220px 视野（红边雾战持续到撤离/死亡）
    this.textMaskTimer = this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
      this.textMaskActive = false;
      this.label?.setVisible(false);
      this.overlay?.setVisible(false);
    });
  }

  update(playerX: number, playerY: number): void {
    if (!this.redEdgeFogActive) return;
    this.visionCircle?.setPosition(this.worldToScreenX(playerX), this.worldToScreenY(playerY));
  }

  deactivate(): void {
    this.redEdgeFogActive = false;
    this.textMaskActive = false;
    this.overlay?.setVisible(false);
    this.visionCircle?.setVisible(false);
    this.label?.setVisible(false);
    if (this.textMaskTimer) { this.textMaskTimer.remove(); this.textMaskTimer = null; }
  }

  private worldToScreenX(worldX: number): number {
    const cam = this.scene.cameras.main;
    return worldX - cam.scrollX;
  }

  private worldToScreenY(worldY: number): number {
    const cam = this.scene.cameras.main;
    return worldY - cam.scrollY;
  }

  destroy(): void {
    this.deactivate();
    this.overlay?.destroy();
    this.visionCircle?.destroy();
    this.label?.destroy();
    this.overlay = null;
    this.visionCircle = null;
    this.label = null;
  }
}
