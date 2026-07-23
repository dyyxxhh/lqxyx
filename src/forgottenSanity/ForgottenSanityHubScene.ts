// src/forgottenSanity/ForgottenSanityHubScene.ts
// 被遗忘的理智枢纽场景：发放起手包、hub 活跃全局、接线 HubUI 5 面板（仓库/商城/起配/升级/进入墓穴）。
// spec §1.2 / §8.3 / §11.1，plan 6 Task 5。
import Phaser from 'phaser';

import { getSceneDebugState } from '../game/scaffoldState';
import { UI_THEME } from '../ui/uiTheme';
import { grantStarterPackIfNeeded } from './state/forgottenSanityState';
import { HubUI } from './ui/HubUI';

export class ForgottenSanityHubScene extends Phaser.Scene {
  private hubUI: HubUI | null = null;

  public constructor() {
    super('ForgottenSanityHubScene');
  }

  public create(): void {
    getSceneDebugState().forgottenSanity = { scene: 'hub' };

    grantStarterPackIfNeeded();

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ = true;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      getSceneDebugState().forgottenSanity = { scene: 'none' };
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ = false;
      }
    });

    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);

    this.hubUI = new HubUI(this, {
      onEnter: () => this.scene.start('ForgottenSanityScene'),
      onBack: () => this.scene.start('GameScene'),
    });
    this.hubUI.create();
  }
}
