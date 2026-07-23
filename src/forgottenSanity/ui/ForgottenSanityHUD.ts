// src/forgottenSanity/ui/ForgottenSanityHUD.ts
// 被遗忘的理智对局 HUD：HP 条 + 体力条 + 武器图标/大招 CD 环 + 碎片计数 + 计时器 + 理智/基准线 + 消耗品槽 + 理智比率。
// 仅 import type Phaser —— 编译期擦除，jsdom 测试可 mock phaser 后导入。
// spec §9.1（HUD 布局） / §3.1（HP/stamina/武器占位），plan 6 Task 6。
import type Phaser from 'phaser';

import { GAME_WIDTH } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const HUD_BASE_DEPTH = 1000;
export const HUD_TEXT_DEPTH = 1001;
export const HUD_OVERLAY_DEPTH = 1002;

/**
 * HUD 单帧快照。各字段来源：
 * - hp/maxHp/weaponId ← PlayerCombat（plan 3）
 * - stamina/maxStamina/isFatigued ← PlayerCombat.stamina 状态机
 * - ultCooldownRemaining/ultCooldownTotal ← WeaponCooldowns.getUltimateCooldownRemaining + weapon.ultimate.cooldownMs
 * - sanity/baseline ← 本局 Inventory.totalSanityValue + mapManifest.baselineSanity
 * - fragmentCount ← Inventory.entries 总件数
 * - elapsedMs ← 场景计时器（对局开始累计）
 * - consumableSlots ← 当前 loadout 的消耗品槽
 * - stashSanity ← StashManager.loadStash().sanity（理智比率用）
 */
export interface HudSnapshot {
  readonly hp: number;
  readonly maxHp: number;
  readonly stamina: number;
  readonly maxStamina: number;
  readonly isFatigued: boolean;
  readonly weaponId: string;
  readonly weaponName: string;
  readonly ultCooldownRemaining: number;
  readonly ultCooldownTotal: number;
  readonly sanity: number;
  readonly baseline: number;
  readonly fragmentCount: number;
  readonly elapsedMs: number;
  readonly consumableSlots: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly stashSanity: number;
}

export interface HudUpdateResult {
  readonly ultCooldownFraction: number;
  readonly ultReady: boolean;
  readonly sanityAtBaseline: boolean;
  readonly staminaFraction: number;
  readonly isFatigued: boolean;
  readonly timerText: string;
}

// 布局常量（spec §9.1：左上 HP+武器+CD / 上中 理智+基准 / 下中 消耗品 / 左下 比率）
const HP_BAR_X = 40;
const HP_BAR_Y = 36;
const HP_BAR_WIDTH = 220;
const HP_BAR_HEIGHT = 14;
const STAMINA_BAR_Y = 56;
const STAMINA_BAR_HEIGHT = 8;
const ULT_RING_X = 290;
const ULT_RING_Y = 48;
const ULT_RING_RADIUS = 22;
const WEAPON_TEXT_Y = 78;
const SANITY_TEXT_X = GAME_WIDTH / 2;
const SANITY_TEXT_Y = 32;
const TIMER_X = GAME_WIDTH / 2;
const TIMER_Y = 60;
const FRAGMENT_X = GAME_WIDTH / 2;
const FRAGMENT_Y = 84;
const CONSUMABLE_Y = 690;
const RATIO_X = 80;
const RATIO_Y = 660;

export class ForgottenSanityHUD {
  private hpBarBg: Phaser.GameObjects.Rectangle | null = null;
  private hpBarFill: Phaser.GameObjects.Rectangle | null = null;
  private hpText: Phaser.GameObjects.Text | null = null;
  private staminaBarBg: Phaser.GameObjects.Rectangle | null = null;
  private staminaBarFill: Phaser.GameObjects.Rectangle | null = null;
  private weaponText: Phaser.GameObjects.Text | null = null;
  private ultRing: Phaser.GameObjects.Arc | null = null;
  private ultText: Phaser.GameObjects.Text | null = null;
  private sanityText: Phaser.GameObjects.Text | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private fragmentText: Phaser.GameObjects.Text | null = null;
  private consumableTexts: Phaser.GameObjects.Text[] = [];
  private ratioText: Phaser.GameObjects.Text | null = null;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    // HP 背景 + 填充（左上）
    this.hpBarBg = this.scene.add.rectangle(
      HP_BAR_X + HP_BAR_WIDTH / 2, HP_BAR_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT,
      UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH);
    applyPixelStrokeStyle(this.hpBarBg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.9);
    this.hpBarFill = this.scene.add.rectangle(HP_BAR_X, HP_BAR_Y, 0, HP_BAR_HEIGHT, UI_THEME.colors.accent)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH + 1);

    this.hpText = applyPixelTextStyle(
      this.scene.add.text(HP_BAR_X, HP_BAR_Y + 10, '',
        { color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
    ).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 体力条（HP 条下方）
    this.staminaBarBg = this.scene.add.rectangle(
      HP_BAR_X + HP_BAR_WIDTH / 2, STAMINA_BAR_Y, HP_BAR_WIDTH, STAMINA_BAR_HEIGHT,
      UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH);
    applyPixelStrokeStyle(this.staminaBarBg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.7);
    this.staminaBarFill = this.scene.add.rectangle(
      HP_BAR_X, STAMINA_BAR_Y, 0, STAMINA_BAR_HEIGHT, UI_THEME.colors.gold,
    )
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(HUD_BASE_DEPTH + 1);

    this.weaponText = applyPixelTextStyle(
      this.scene.add.text(HP_BAR_X, WEAPON_TEXT_Y, '',
        { color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
    ).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 大招 CD 环
    this.ultRing = this.scene.add.arc(
      ULT_RING_X, ULT_RING_Y, ULT_RING_RADIUS,
      UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel,
    )
      .setStrokeStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9)
      .setScrollFactor(0).setDepth(HUD_BASE_DEPTH);
    this.ultText = applyPixelTextStyle(
      this.scene.add.text(ULT_RING_X, ULT_RING_Y, 'K',
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 上中：理智 / 基准
    this.sanityText = applyPixelTextStyle(
      this.scene.add.text(SANITY_TEXT_X, SANITY_TEXT_Y, '',
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '22px', fontStyle: 'bold' }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 计时器（理智下方）
    this.timerText = applyPixelTextStyle(
      this.scene.add.text(TIMER_X, TIMER_Y, '',
        { align: 'center', color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '16px' }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 碎片计数（计时器下方）
    this.fragmentText = applyPixelTextStyle(
      this.scene.add.text(FRAGMENT_X, FRAGMENT_Y, '',
        { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
    ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);

    // 左下：理智比率
    this.ratioText = applyPixelTextStyle(
      this.scene.add.text(RATIO_X, RATIO_Y, '',
        { color: UI_THEME.colors.textMuted, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
    ).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);
  }

  update(s: HudSnapshot): HudUpdateResult {
    // HP
    const hpFraction = s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 0;
    if (this.hpBarFill) this.hpBarFill.width = HP_BAR_WIDTH * hpFraction;
    if (this.hpText) this.hpText.setText(`HP ${Math.max(0, Math.round(s.hp))}/${s.maxHp}`);

    // 体力
    const staminaFraction = s.maxStamina > 0
      ? Math.max(0, Math.min(1, s.stamina / s.maxStamina))
      : 0;
    if (this.staminaBarFill) {
      this.staminaBarFill.width = HP_BAR_WIDTH * staminaFraction;
      // 疲劳锁期间体力条变红警示
      this.staminaBarFill.setFillStyle(
        s.isFatigued ? UI_THEME.colors.accent : UI_THEME.colors.gold,
        UI_THEME.alpha.controlActive,
      );
    }

    // 武器
    if (this.weaponText) this.weaponText.setText(`武器: ${s.weaponName} (J普攻)`);

    // 大招 CD
    const ultReady = s.ultCooldownRemaining <= 0;
    const ultFraction = s.ultCooldownTotal > 0
      ? Math.max(0, Math.min(1, 1 - s.ultCooldownRemaining / s.ultCooldownTotal))
      : 1;
    if (this.ultRing) {
      this.ultRing.setFillStyle(
        ultReady ? UI_THEME.colors.gold : UI_THEME.colors.surfaceMuted,
        UI_THEME.alpha.panel,
      );
    }
    if (this.ultText) {
      this.ultText.setText(ultReady ? 'K' : `${Math.ceil(s.ultCooldownRemaining / 1000)}`);
    }

    // 理智 / 基准线（达标变金）
    const sanityAtBaseline = s.sanity >= s.baseline;
    if (this.sanityText) {
      this.sanityText.setText(`理智 ${s.sanity} / ${s.baseline}`);
      this.sanityText.setColor(sanityAtBaseline ? UI_THEME.colors.textGold : UI_THEME.colors.text);
    }

    // 计时器
    const timerText = formatElapsedMs(s.elapsedMs);
    if (this.timerText) this.timerText.setText(timerText);

    // 碎片计数
    if (this.fragmentText) this.fragmentText.setText(`碎片 ×${s.fragmentCount}`);

    // 消耗品槽（每帧重建）
    for (const t of this.consumableTexts) t.destroy();
    this.consumableTexts = [];
    const slotCount = Math.max(s.consumableSlots.length, 1);
    const slotWidth = 80;
    const startX = GAME_WIDTH / 2 - (slotCount * (slotWidth + 8)) / 2 + slotWidth / 2;
    s.consumableSlots.forEach((slot, i) => {
      const t = applyPixelTextStyle(
        this.scene.add.text(startX + i * (slotWidth + 8), CONSUMABLE_Y,
          `${slot.itemId.split('.')[1] ?? '?'}×${slot.quantity}`,
          { align: 'center', color: UI_THEME.colors.text, fontFamily: UI_THEME.font.ui, fontSize: '14px' }),
      ).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_TEXT_DEPTH);
      this.consumableTexts.push(t);
    });

    // 理智比率
    if (this.ratioText) {
      const ratio = s.stashSanity > 0 ? (s.sanity / s.stashSanity).toFixed(2) : '—';
      this.ratioText.setText(`理智比率(本局/仓库): ${ratio}`);
    }

    return {
      ultCooldownFraction: ultFraction,
      ultReady,
      sanityAtBaseline,
      staminaFraction,
      isFatigued: s.isFatigued,
      timerText,
    };
  }

  /** Red pulse flash on HP bar when player takes damage. */
  flashRedPulse(): void {
    if (this.hpBarFill) {
      this.scene.tweens.add({
        targets: this.hpBarFill,
        alpha: { from: 1, to: 0.3 },
        duration: 120,
        yoyo: true,
        repeat: 1,
      });
    }
  }

  destroy(): void {
    for (const t of this.consumableTexts) t.destroy();
    this.consumableTexts = [];
  }
}

/** Smoothly interpolate a bar value toward target (200ms feel). */
export function smoothBarValue(current: number, target: number, t: number): number {
  return current + (target - current) * t;
}

/** 格式化毫秒为 mm:ss 或 hh:mm:ss（≥1h 时）。 */
function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}
