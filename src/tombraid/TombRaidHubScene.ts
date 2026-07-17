// src/tombraid/TombRaidHubScene.ts
// 摸金模式枢纽骨架场景：发放起手包、占位文案、返回主菜单按钮、hub 活跃全局。
// spec §1.2 / §8.3 / §11.1
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { grantStarterPackIfNeeded } from './state/tombRaidState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

const HUB_BACK_BUTTON_Y = GAME_HEIGHT / 2 + 120;

export class TombRaidHubScene extends Phaser.Scene {
  public constructor() {
    super('TombRaidHubScene');
  }

  public create(): void {
    grantStarterPackIfNeeded();

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = true;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = false;
      }
    });

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '摸金模式 · 枢纽', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '40px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '（占位 · 完整枢纽 UI 见 Plan 3）', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      }),
    ).setOrigin(0.5);

    const backButton = this.add
      .rectangle(GAME_WIDTH / 2, HUB_BACK_BUTTON_Y, 240, 56, UI_THEME.colors.accent, UI_THEME.alpha.controlActive)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(backButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, HUB_BACK_BUTTON_Y, '返回主菜单', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);
    backButton.on('pointerdown', () => this.scene.start('GameScene'));
  }
}
