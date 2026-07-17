// src/forgottenSanity/ui/HubUI.ts
// 被遗忘的理智枢纽 5 面板 UI：仓库/商城/起配/永久升级/进入墓穴。
// 复用 UI_THEME（applyPixelTextStyle/applyPixelStrokeStyle）+ GameScene 按钮工厂模式。
// 仅 import type Phaser —— 编译期擦除，jsdom 测试可 mock phaser 后导入。
// spec §1.2 / §8 / §11.2，plan 6 Task 5。
import type Phaser from 'phaser';

import { GAME_WIDTH } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';
import {
  loadStash, storeStash,
} from '../meta/StashManager';
import {
  loadUpgradesState, saveUpgradesState,
  type ForgottenSanityUpgradeId,
} from '../state/forgottenSanityState';
import {
  UPGRADE_COSTS, UPGRADE_MAX_TIERS, canUpgrade, applyUpgrade, getUpgradeEffects,
} from '../meta/UpgradeManager';
import { getSellPrice, getBuyPrice, isBuyable, sell, buy } from '../meta/ShopManager';
import {
  getConsumableSlotCount, UNARMED_ID,
} from '../meta/LoadoutManager';
import { getLootItem, ALL_LOOT } from '../loot/LootItem';

export const HUD_BASE_DEPTH = 1000;
export const HUD_TEXT_DEPTH = 1001;
export const HUD_OVERLAY_DEPTH = 1002;

export interface HubPanelDef {
  readonly id: 'stash' | 'shop' | 'loadout' | 'upgrades' | 'enter';
  readonly label: string;
}
export const HUB_PANELS: readonly HubPanelDef[] = [
  { id: 'stash', label: '仓库' },
  { id: 'shop', label: '商城' },
  { id: 'loadout', label: '起配' },
  { id: 'upgrades', label: '永久升级' },
  { id: 'enter', label: '进入墓穴' },
];

export interface HubUICallbacks {
  readonly onEnter: () => void;
  readonly onBack: () => void;
}

const PANEL_BUTTON_WIDTH = 200;
const PANEL_BUTTON_HEIGHT = 48;
const PANEL_BUTTON_Y = 56;
const PANEL_GAP = 16;
const BACK_BUTTON_X = 80;
const BACK_BUTTON_Y = 690;

export class HubUI {
  private panelButtons: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private panelLabels: Map<string, Phaser.GameObjects.Text> = new Map();
  private titleText: Phaser.GameObjects.Text | null = null;
  private contentContainer: Phaser.GameObjects.Container | null = null;
  private activePanel: HubPanelDef['id'] = 'stash';

  constructor(private scene: Phaser.Scene, private callbacks: HubUICallbacks) {}

  create(): void {
    const totalWidth = HUB_PANELS.length * PANEL_BUTTON_WIDTH + (HUB_PANELS.length - 1) * PANEL_GAP;
    const startX = (GAME_WIDTH - totalWidth) / 2 + PANEL_BUTTON_WIDTH / 2;
    HUB_PANELS.forEach((panel, i) => {
      const x = startX + i * (PANEL_BUTTON_WIDTH + PANEL_GAP);
      const rect = this.scene.add.rectangle(x, PANEL_BUTTON_Y, PANEL_BUTTON_WIDTH, PANEL_BUTTON_HEIGHT, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
        .setOrigin(0.5).setDepth(HUD_BASE_DEPTH).setInteractive({ useHandCursor: true });
      applyPixelStrokeStyle(rect, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
      const label = applyPixelTextStyle(this.scene.add.text(x, PANEL_BUTTON_Y, panel.label,
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '20px' }))
        .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);
      rect.on('pointerup', () => this.handlePanelClick(panel.id));
      this.panelButtons.set(panel.id, rect);
      this.panelLabels.set(panel.id, label);
    });

    this.titleText = applyPixelTextStyle(this.scene.add.text(GAME_WIDTH / 2, 120, '仓库',
      { align: 'center', color: UI_THEME.colors.textGold, fontFamily: UI_THEME.font.ui, fontSize: '28px', fontStyle: 'bold' }))
      .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);

    this.contentContainer = this.scene.add.container(0, 0).setDepth(HUD_OVERLAY_DEPTH);

    // 返回按钮
    const back = this.scene.add.rectangle(BACK_BUTTON_X, BACK_BUTTON_Y, 120, 40, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5).setDepth(HUD_BASE_DEPTH).setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(back, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    applyPixelTextStyle(this.scene.add.text(BACK_BUTTON_X, BACK_BUTTON_Y, '返回',
      { align: 'center', color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '18px' }))
      .setOrigin(0.5).setDepth(HUD_TEXT_DEPTH);
    back.on('pointerup', () => this.handleBack());

    this.renderActivePanel();
  }

  switchPanel(id: HubPanelDef['id']): void {
    this.activePanel = id;
    if (this.titleText) this.titleText.setText(HUB_PANELS.find((p) => p.id === id)?.label ?? '');
    this.renderActivePanel();
  }

  handlePanelClick(id: HubPanelDef['id']): void {
    if (id === 'enter') { this.callbacks.onEnter(); return; }
    this.switchPanel(id);
  }

  handleBack(): void {
    this.callbacks.onBack();
  }

  private renderActivePanel(): void {
    if (!this.contentContainer) return;
    this.contentContainer.removeAll(true);
    switch (this.activePanel) {
      case 'stash': this.renderStashPanel(); break;
      case 'shop': this.renderShopPanel(); break;
      case 'loadout': this.renderLoadoutPanel(); break;
      case 'upgrades': this.renderUpgradesPanel(); break;
      case 'enter': break;
    }
  }

  private renderStashPanel(): void {
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `理智: ${stash.sanity}`, UI_THEME.colors.textGold);
    let y = 220;
    if (stash.items.length === 0) {
      this.addContentText(GAME_WIDTH / 2, y, '（仓库空）', UI_THEME.colors.textMuted);
      return;
    }
    for (const item of stash.items) {
      const def = getLootItem(item.itemId);
      const name = def?.name ?? item.itemId;
      const value = def ? def.sanityValue : 0;
      this.addContentText(GAME_WIDTH / 2, y, `${name} ×${item.quantity}   (${value}/件)`, UI_THEME.colors.text);
      y += 28;
    }
  }

  private renderShopPanel(): void {
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `理智: ${stash.sanity}`, UI_THEME.colors.textGold);
    let y = 220;
    this.addContentText(GAME_WIDTH / 2, y, '— 可买 (消耗品/武器) —', UI_THEME.colors.textMuted); y += 28;
    for (const item of ALL_LOOT) {
      if (!isBuyable(item)) continue;
      this.addContentText(GAME_WIDTH / 2 - 200, y, `${item.name} 买 ${getBuyPrice(item)}`, UI_THEME.colors.text);
      this.addBuyButton(GAME_WIDTH / 2 + 200, y, item.id);
      y += 28;
    }
    y += 12;
    this.addContentText(GAME_WIDTH / 2, y, '— 可卖 (仓库内) —', UI_THEME.colors.textMuted); y += 28;
    for (const entry of stash.items) {
      const def = getLootItem(entry.itemId);
      if (!def) continue;
      this.addContentText(GAME_WIDTH / 2 - 200, y, `${def.name} ×${entry.quantity} 卖 ${getSellPrice(def)}`, UI_THEME.colors.text);
      this.addSellButton(GAME_WIDTH / 2 + 200, y, entry.itemId);
      y += 28;
    }
  }

  private renderLoadoutPanel(): void {
    const upgrades = loadUpgradesState().state;
    const slotCount = getConsumableSlotCount(upgrades.tiers);
    const stash = loadStash();
    this.addContentText(GAME_WIDTH / 2, 180, `消耗品槽位: ${slotCount} (武备 ${upgrades.tiers.armory}/${UPGRADE_MAX_TIERS.armory})`, UI_THEME.colors.textGold);
    let y = 220;
    const hasWeapon = stash.items.some((i) => i.itemId.startsWith('weapon.'));
    this.addContentText(GAME_WIDTH / 2, y, `武器: ${hasWeapon ? '已配置' : '空手(unarmed)'}`, UI_THEME.colors.text); y += 28;
    this.addContentText(GAME_WIDTH / 2, y, '（在仓库/商城获取武器与消耗品后，进入墓穴前在此确认起配）', UI_THEME.colors.textMuted); y += 28;
    this.addContentText(GAME_WIDTH / 2, y, `空手 = ${UNARMED_ID}, 弱拳 5 伤`, UI_THEME.colors.textMuted);
  }

  private renderUpgradesPanel(): void {
    const upgrades = loadUpgradesState().state;
    const stash = loadStash();
    const labels: Record<ForgottenSanityUpgradeId, string> = {
      physique: '体魄 +4% maxHP', swift: '疾走 +4% moveSpeed', pickup: '拾取 +4% pickupRange',
      sharp: '锐利 +4% attackDamage', lucky: '幸运 +4% dropRate', armory: '武备 +1 消耗品槽',
    };
    let y = 180;
    (Object.keys(labels) as ForgottenSanityUpgradeId[]).forEach((id) => {
      const tier = upgrades.tiers[id];
      const max = UPGRADE_MAX_TIERS[id];
      const costs = UPGRADE_COSTS[id];
      const cost = tier < max ? costs[tier] : null;
      const status = cost === null ? '已满阶' : `${cost} 理智`;
      const canAfford = canUpgrade(upgrades, stash, id);
      this.addContentText(GAME_WIDTH / 2 - 240, y, `${labels[id]}  ${tier}/${max}`, UI_THEME.colors.text);
      this.addContentText(GAME_WIDTH / 2 + 80, y, status, UI_THEME.colors.textMuted);
      if (cost !== null) this.addUpgradeButton(GAME_WIDTH / 2 + 240, y, id, canAfford);
      y += 32;
    });
    const e = getUpgradeEffects(upgrades.tiers);
    y += 16;
    this.addContentText(GAME_WIDTH / 2, y, `当前效果: maxHP×${e.maxHpMultiplier.toFixed(2)} 速度×${e.moveSpeedMultiplier.toFixed(2)} 槽位${e.consumableSlotCount}`, UI_THEME.colors.textGold);
  }

  private addBuyButton(x: number, y: number, itemId: string): void {
    this.addActionButton(x, y, '买', () => {
      const item = getLootItem(itemId);
      if (!item) return;
      const result = buy(loadStash(), item, 1);
      if (result.ok) storeStash(result.stash);
      this.renderActivePanel();
    });
  }

  private addSellButton(x: number, y: number, itemId: string): void {
    this.addActionButton(x, y, '卖', () => {
      const item = getLootItem(itemId);
      if (!item) return;
      const result = sell(loadStash(), item, 1);
      if (result.ok) storeStash(result.stash);
      this.renderActivePanel();
    });
  }

  private addUpgradeButton(x: number, y: number, id: keyof typeof UPGRADE_COSTS, enabled: boolean): void {
    this.addActionButton(x, y, '升级', () => {
      if (!enabled) return;
      const upgrades = loadUpgradesState().state;
      const stash = loadStash();
      const next = applyUpgrade(upgrades, stash, id);
      saveUpgradesState(next.upgrades);
      storeStash(next.stash);
      this.renderActivePanel();
    }, enabled);
  }

  private addActionButton(x: number, y: number, label: string, onPointerUp: () => void, enabled = true): void {
    const rect = this.scene.add.rectangle(x, y, 80, 24, enabled ? UI_THEME.colors.accent : UI_THEME.colors.surfaceMuted, UI_THEME.alpha.control)
      .setOrigin(0.5).setInteractive({ useHandCursor: enabled });
    applyPixelStrokeStyle(rect, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(this.scene.add.text(x, y, label,
      { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }))
      .setOrigin(0.5);
    rect.on('pointerup', onPointerUp);
    if (!enabled) rect.disableInteractive();
    this.contentContainer?.add([rect]);
  }

  private addContentText(x: number, y: number, text: string, color: string): void {
    const t = applyPixelTextStyle(this.scene.add.text(x, y, text,
      { align: 'center', color, fontFamily: UI_THEME.font.ui, fontSize: '16px' }))
      .setOrigin(0.5);
    this.contentContainer?.add(t);
  }
}
