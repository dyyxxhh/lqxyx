// src/tombraid/ui/MobileControls.ts
// 摸金模式移动端 4 动作按钮：普攻J / 大招K / 交互H / 消耗品F，与桌面端功能对等。
// 复用 InputManager 摇杆层（950/951）之上的 depth 952。
// 仅 import type Phaser —— 编译期擦除，jsdom 测试无需 Phaser runtime。
// spec §11.4，plan 6 Task 10。
import type Phaser from 'phaser';

import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const MOBILE_ACTION_DEPTH = 952; // 复用 InputManager 摇杆层 (950/951) 之上

export interface MobileActionDef {
  readonly id: 'basicAttack' | 'ultimate' | 'interact' | 'consumable';
  readonly label: string;
  readonly key: string;
}

export const MOBILE_ACTION_BUTTONS: readonly MobileActionDef[] = [
  { id: 'basicAttack', label: '普攻', key: 'J' },
  { id: 'ultimate', label: '大招', key: 'K' },
  { id: 'interact', label: '交互', key: 'H' },
  { id: 'consumable', label: '消耗品', key: 'F' },
];

export interface MobileControlsCallbacks {
  readonly onBasicAttack: () => void;
  readonly onUltimate: () => void;
  readonly onInteract: () => void;
  readonly onConsumable: () => void;
}

const BUTTON_RADIUS = 44;
// 右侧 4 按钮：普攻上、大招中、交互下、消耗品左下（环绕拇指可达区）
const BUTTON_POSITIONS: Readonly<Record<MobileActionDef['id'], { readonly x: number; readonly y: number }>> = {
  basicAttack: { x: 1140, y: 460 },
  ultimate:    { x: 1200, y: 580 },
  interact:    { x: 1100, y: 660 },
  consumable:  { x: 980,  y: 620 },
};

export class MobileControls {
  private buttons: Map<MobileActionDef['id'], Phaser.GameObjects.Arc> = new Map();
  private labels: Map<MobileActionDef['id'], Phaser.GameObjects.Text> = new Map();
  private visible = true;

  constructor(private scene: Phaser.Scene, private callbacks: MobileControlsCallbacks) {}

  create(): void {
    for (const def of MOBILE_ACTION_BUTTONS) {
      const pos = BUTTON_POSITIONS[def.id];
      const btn = this.scene.add.circle(
        pos.x, pos.y, BUTTON_RADIUS, UI_THEME.colors.accent, UI_THEME.alpha.control,
      )
        .setScrollFactor(0).setDepth(MOBILE_ACTION_DEPTH)
        .setInteractive({ useHandCursor: true });
      applyPixelStrokeStyle(btn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
      btn.on('pointerdown', () => {
        btn.setFillStyle(UI_THEME.colors.accentPressed, UI_THEME.alpha.controlActive);
      });
      btn.on('pointerup', () => {
        btn.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.control);
        this.handleButtonPress(def.id);
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(UI_THEME.colors.accent, UI_THEME.alpha.control);
      });
      this.buttons.set(def.id, btn);

      const label = applyPixelTextStyle(this.scene.add.text(
        pos.x, pos.y, def.label,
        {
          align: 'center',
          color: UI_THEME.colors.text,
          fontFamily: UI_THEME.font.ui,
          fontSize: '16px',
          fontStyle: 'bold',
        },
      ))
        .setOrigin(0.5).setScrollFactor(0).setDepth(MOBILE_ACTION_DEPTH + 1);
      this.labels.set(def.id, label);
    }
  }

  handleButtonPress(id: MobileActionDef['id']): void {
    switch (id) {
      case 'basicAttack': this.callbacks.onBasicAttack(); break;
      case 'ultimate':    this.callbacks.onUltimate(); break;
      case 'interact':    this.callbacks.onInteract(); break;
      case 'consumable':  this.callbacks.onConsumable(); break;
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const btn of this.buttons.values()) btn.setVisible(visible);
    for (const label of this.labels.values()) label.setVisible(visible);
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    for (const btn of this.buttons.values()) btn.destroy();
    for (const label of this.labels.values()) label.destroy();
    this.buttons.clear();
    this.labels.clear();
  }
}
