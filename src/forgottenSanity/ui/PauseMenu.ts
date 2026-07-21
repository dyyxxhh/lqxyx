// src/forgottenSanity/ui/PauseMenu.ts
// 被遗忘的理智 ESC 暂停菜单（plan 2026-07-19 Task 14 / M8）。
// 半透明遮罩 + "已暂停" 标题 + 3 按钮（继续 / 放弃对局 / 设置）。
// 设置子菜单：音效开关 + 像素滤镜开关 + 返回上一级。
// spec §9.2 ESC 行为优先级 + 暂停菜单 3 项 + 放弃对局按死亡处理。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const PAUSE_MENU_DEPTH = 1999;

export interface PauseMenuItem {
  readonly id: 'resume' | 'abandon' | 'settings';
  readonly label: string;
}

/**
 * 暂停菜单 UI。由 ForgottenSanityScene.create 实例化。
 * show()/hide() 由 togglePause() 驱动；按钮回调通过构造函数注入。
 * 设置子菜单内置音效 / 像素滤镜开关状态，供 scene.getAudioEnabled() 读取。
 */
export class PauseMenu {
  private readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly onResume: () => void;
  private readonly onAbandon: () => void;
  private readonly items: PauseMenuItem[] = [
    { id: 'resume', label: '继续' },
    { id: 'abandon', label: '放弃对局' },
    { id: 'settings', label: '设置' },
  ];
  private audioEnabled = true;
  private pixelFilterEnabled = true;
  private visible = false;
  private currentView: 'main' | 'settings' = 'main';

  constructor(scene: Phaser.Scene, onResume: () => void, onAbandon: () => void) {
    this.scene = scene;
    this.onResume = onResume;
    this.onAbandon = onAbandon;
    this.container = scene.add.container(0, 0) as unknown as Phaser.GameObjects.Container;
    this.container.setDepth(PAUSE_MENU_DEPTH);
    this.container.setVisible(false);
    this.renderMain();
  }

  show(): void {
    this.visible = true;
    this.container.setVisible(true);
  }

  hide(): void {
    this.visible = false;
    this.container.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  getItems(): PauseMenuItem[] {
    return this.items;
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  isPixelFilterEnabled(): boolean {
    return this.pixelFilterEnabled;
  }

  // ── 测试用：程序化触发按钮（绕过 Phaser 输入事件）──
  clickSettings(): void {
    this.openSettings();
  }

  clickAudioToggle(): void {
    this.audioEnabled = !this.audioEnabled;
    if (this.currentView === 'settings') {
      this.openSettings();
    }
  }

  clickPixelFilterToggle(): void {
    this.pixelFilterEnabled = !this.pixelFilterEnabled;
    if (this.currentView === 'settings') {
      this.openSettings();
    }
  }

  clickBack(): void {
    this.renderMain();
  }

  // ── 内部渲染 ──
  private renderMain(): void {
    this.currentView = 'main';
    this.container.removeAll(true);

    const bg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      UI_THEME.colors.surface, 0.7,
    )
      .setOrigin(0.5).setScrollFactor(0);
    applyPixelStrokeStyle(bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    const title = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, '已暂停',
      {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      },
    )).setOrigin(0.5).setScrollFactor(0);

    this.container.add([bg, title]);

    this.items.forEach((item, i) => {
      const y = GAME_HEIGHT / 2 - 30 + i * 60;
      const btn = applyPixelTextStyle(this.scene.add.text(
        GAME_WIDTH / 2, y, item.label,
        {
          align: 'center',
          color: UI_THEME.colors.text,
          fontFamily: UI_THEME.font.ui,
          fontSize: '20px',
        },
      )).setOrigin(0.5).setScrollFactor(0);
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.handleClick(item.id));
      this.container.add([btn]);
    });
  }

  private openSettings(): void {
    this.currentView = 'settings';
    this.container.removeAll(true);

    const bg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT,
      UI_THEME.colors.surface, 0.7,
    )
      .setOrigin(0.5).setScrollFactor(0);
    applyPixelStrokeStyle(bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    const title = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, '设置',
      {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      },
    )).setOrigin(0.5).setScrollFactor(0);

    const audioBtn = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, `音效: ${this.audioEnabled ? '开' : '关'}`,
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
      },
    )).setOrigin(0.5).setScrollFactor(0);
    audioBtn.setInteractive({ useHandCursor: true });
    audioBtn.on('pointerdown', () => {
      this.audioEnabled = !this.audioEnabled;
      this.openSettings();
    });

    const pixelBtn = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `像素滤镜: ${this.pixelFilterEnabled ? '开' : '关'}`,
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
      },
    )).setOrigin(0.5).setScrollFactor(0);
    pixelBtn.setInteractive({ useHandCursor: true });
    pixelBtn.on('pointerdown', () => {
      this.pixelFilterEnabled = !this.pixelFilterEnabled;
      this.openSettings();
    });

    const backBtn = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, '返回',
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
      },
    )).setOrigin(0.5).setScrollFactor(0);
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.renderMain());

    this.container.add([bg, title, audioBtn, pixelBtn, backBtn]);
  }

  private handleClick(id: PauseMenuItem['id']): void {
    if (id === 'resume') {
      this.onResume();
    } else if (id === 'abandon') {
      this.onAbandon();
    } else if (id === 'settings') {
      this.openSettings();
    }
  }
}
