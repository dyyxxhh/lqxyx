// src/tombraid/TombRaidHubScene.ts
// 摸金模式枢纽场景：发放起手包、hub 活跃全局、接线 HubUI 5 面板（仓库/商城/起配/升级/进入墓穴）。
// spec §1.2 / §8.3 / §11.1，plan 6 Task 5。
import Phaser from 'phaser';

import { UI_THEME } from '../ui/uiTheme';
import { grantStarterPackIfNeeded } from './state/tombRaidState';
import { HubUI } from './ui/HubUI';

export class TombRaidHubScene extends Phaser.Scene {
  private hubUI: HubUI | null = null;

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

    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);

    this.hubUI = new HubUI(this, {
      onEnter: () => this.scene.start('TombRaidScene'),
      onBack: () => this.scene.start('GameScene'),
    });
    this.hubUI.create();
  }
}
