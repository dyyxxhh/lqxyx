// src/tombraid/TombRaidScene.ts
// 摸金模式对局骨架场景：占位文案与放弃返回枢纽按钮。
// spec §1.2 / §11.1
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

const ABORT_BUTTON_Y = GAME_HEIGHT / 2 + 120;

export class TombRaidScene extends Phaser.Scene {
  public constructor() {
    super('TombRaidScene');
  }

  public create(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '摸金对局——待实现', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '36px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);

    const abortButton = this.add
      .rectangle(GAME_WIDTH / 2, ABORT_BUTTON_Y, 260, 56, UI_THEME.colors.accent, UI_THEME.alpha.controlActive)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(abortButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, ABORT_BUTTON_Y, '放弃返回枢纽', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);
    abortButton.on('pointerdown', () => this.scene.start('TombRaidHubScene'));
  }
}
