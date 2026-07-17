// src/tombraid/ui/SettlementScreen.ts
// 摸金模式撤离/死亡结算：evacuated（达标入仓库+更新 best）/ refused（不达标拒绝）/ dead（全丢）。
// 仅 import type Phaser —— 编译期擦除，jsdom 测试无需 Phaser runtime。
// spec §1.3，plan 6 Task 9。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';
import type { Inventory } from '../loot/Inventory';
import type { TombRaidStashState } from '../state/tombRaidState';
import {
  loadStashState, saveStashState, loadBestState, saveBestState,
} from '../state/tombRaidState';
import { depositRunInventory } from '../meta/StashManager';

export const SETTLEMENT_DEPTH = 1996;
export const SETTLEMENT_TEXT_DEPTH = 1997;
export const SETTLEMENT_BTN_DEPTH = 1998;

export type SettlementOutcome =
  | { readonly kind: 'evacuated'; readonly totalValue: number; readonly bestSanity: number }
  | { readonly kind: 'refused'; readonly totalValue: number; readonly baseline: number }
  | { readonly kind: 'dead' };

export interface SettlementCallbacks {
  readonly onConfirm: () => void;
}

export class SettlementScreen {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private title: Phaser.GameObjects.Text | null = null;
  private body: Phaser.GameObjects.Text | null = null;
  private confirmBtn: Phaser.GameObjects.Rectangle | null = null;
  private confirmLabel: Phaser.GameObjects.Text | null = null;
  private visible = false;

  constructor(private scene: Phaser.Scene, private callbacks: SettlementCallbacks) {}

  create(): void {
    this.bg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 200, GAME_HEIGHT - 160,
      UI_THEME.colors.surface, 0.97,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_DEPTH).setVisible(false);
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    this.title = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, 140, '',
      {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);

    this.body = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, 260, '',
      {
        align: 'left',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);

    this.confirmBtn = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, 200, 48, UI_THEME.colors.accent,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_BTN_DEPTH)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    applyPixelStrokeStyle(this.confirmBtn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    this.confirmBtn.on('pointerup', () => {
      this.hide();
      this.callbacks.onConfirm();
    });

    this.confirmLabel = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, '返回枢纽',
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(SETTLEMENT_TEXT_DEPTH).setVisible(false);
  }

  showEvacuation(inventory: Inventory, baseline: number): SettlementOutcome {
    const total = inventory.totalSanityValue();
    if (total >= baseline) {
      return this.handleEvacuated(inventory, total);
    }
    return this.handleRefused(total, baseline);
  }

  showDeath(): SettlementOutcome {
    this.show('本局战利品全丢', '你死了。\n本局所有战利品已被黑暗吞噬。\n仓库未受影响。', UI_THEME.colors.textDanger);
    return { kind: 'dead' };
  }

  hide(): void {
    this.visible = false;
    this.bg?.setVisible(false);
    this.title?.setVisible(false);
    this.body?.setVisible(false);
    this.confirmBtn?.setVisible(false);
    this.confirmLabel?.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  private handleEvacuated(inventory: Inventory, total: number): SettlementOutcome {
    // 1. 并入仓库
    const stash: TombRaidStashState = loadStashState().state;
    const result = depositRunInventory(stash, inventory);
    saveStashState(result.stash);
    // 2. 更新 best
    const bestState = loadBestState().state;
    const newBest = Math.max(bestState.bestSanity, total);
    if (newBest !== bestState.bestSanity) {
      saveBestState({ schemaVersion: bestState.schemaVersion, bestSanity: newBest });
    }
    // 3. 展示
    const lines: string[] = ['撤离成功！', '', '本局战利品:'];
    for (const e of inventory.entries()) {
      lines.push(`  ${e.itemId} ×${e.quantity}`);
    }
    lines.push('', `总面值: ${total}`, `历史最高理智: ${newBest}`);
    this.show('撤离成功', lines.join('\n'), UI_THEME.colors.textGold);
    return { kind: 'evacuated', totalValue: total, bestSanity: newBest };
  }

  private handleRefused(total: number, baseline: number): SettlementOutcome {
    const lines: string[] = [
      '撤离被拒绝。',
      '',
      `本局总面值 ${total} < 基准线 ${baseline}`,
      '继续探索，收集更多记忆碎片后再来撤离。',
      '',
      '仓库未受影响。',
    ];
    this.show('撤离被拒绝', lines.join('\n'), UI_THEME.colors.textDanger);
    return { kind: 'refused', totalValue: total, baseline };
  }

  private show(title: string, body: string, titleColor: string): void {
    this.visible = true;
    this.bg?.setVisible(true);
    this.title?.setVisible(true).setText(title).setColor(titleColor);
    this.body?.setVisible(true).setText(body);
    this.confirmBtn?.setVisible(true);
    this.confirmLabel?.setVisible(true);
  }

  destroy(): void {
    this.bg?.destroy();
    this.title?.destroy();
    this.body?.destroy();
    this.confirmBtn?.destroy();
    this.confirmLabel?.destroy();
  }
}
