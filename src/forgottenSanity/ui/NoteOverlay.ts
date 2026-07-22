// src/forgottenSanity/ui/NoteOverlay.ts
// 遗落的纸条全屏阅读覆盖层（spec §7）。
// 仿 SettlementScreen：屏幕空间（setScrollFactor(0)），默认隐藏。
// 不显示任何标题、贴图、编号。仅正文 + 「收起」按钮。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const NOTE_BG_DEPTH = 1980;
export const NOTE_TEXT_DEPTH = 1982;
export const NOTE_BTN_DEPTH = 1983;

export interface NoteOverlayCallbacks {
  readonly onClose: () => void;
}

export class NoteOverlay {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private bodyText: Phaser.GameObjects.Text | null = null;
  private closeBtn: Phaser.GameObjects.Rectangle | null = null;
  private closeLabel: Phaser.GameObjects.Text | null = null;
  private visible = false;

  constructor(private scene: Phaser.Scene, private callbacks: NoteOverlayCallbacks) {}

  create(): void {
    this.bg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 200, GAME_HEIGHT - 160,
      UI_THEME.colors.surface, 0.97,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_BG_DEPTH).setVisible(false);
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    this.bodyText = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '',
      {
        align: 'left',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
        wordWrap: { width: GAME_WIDTH - 320 },
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_TEXT_DEPTH).setVisible(false);

    this.closeBtn = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, 160, 44, UI_THEME.colors.accent,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_BTN_DEPTH)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    applyPixelStrokeStyle(this.closeBtn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    this.closeBtn.on('pointerup', () => {
      this.hide();
      this.callbacks.onClose();
    });

    this.closeLabel = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, '收起',
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_TEXT_DEPTH).setVisible(false);
  }

  show(body: string): void {
    this.visible = true;
    this.bg?.setVisible(true);
    this.bodyText?.setVisible(true).setText(body);
    this.closeBtn?.setVisible(true);
    this.closeLabel?.setVisible(true);
  }

  hide(): void {
    this.visible = false;
    this.bg?.setVisible(false);
    this.bodyText?.setVisible(false);
    this.closeBtn?.setVisible(false);
    this.closeLabel?.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.bg?.destroy();
    this.bodyText?.destroy();
    this.closeBtn?.destroy();
    this.closeLabel?.destroy();
    this.bg = null;
    this.bodyText = null;
    this.closeBtn = null;
    this.closeLabel = null;
  }
}
