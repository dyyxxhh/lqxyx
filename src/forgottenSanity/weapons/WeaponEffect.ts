// src/forgottenSanity/weapons/WeaponEffect.ts
// 程序绘制武器特效（Phaser Graphics + UI_THEME 配色）。
// import type Phaser 为类型导入，编译期擦除，不影响 jsdom 测试。
import type Phaser from 'phaser';

import { UI_THEME } from '../../ui/uiTheme';
import type {
  MeleeFlashKind,
  WeaponProjectileKind,
  WeaponZoneKind,
} from './WeaponRegistry';

type Graphics = Phaser.GameObjects.Graphics;

// UI_THEME 中字符串色（text 等）无法直接用于 Graphics（需数字）；用数字色。
const CHALK_WHITE = 0xf4efe6; // 镜像 UI_THEME.colors.text 的数值

// Graphics 上 fillPath 可能存在；运行时探测以兼容 mock。
interface GraphicsWithOptionalFillPath {
  fillPath?(): void;
}

// ---------------------------------------------------------------------------
// 投射物绘制
// ---------------------------------------------------------------------------
export function drawWeaponProjectile(
  g: Graphics,
  kind: WeaponProjectileKind,
  x: number,
  y: number,
  angle: number,
  radius: number,
): void {
  g.clear();
  switch (kind) {
    case 'bladeCrescent': {
      g.fillStyle(UI_THEME.colors.borderBlue, 0.85);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, CHALK_WHITE, 0.7);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.borderBlue, 0.8);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * radius * 2.2, y + Math.sin(angle) * radius * 2.2);
      g.strokePath();
      break;
    }
    case 'chalkThrow': {
      g.fillStyle(CHALK_WHITE, 0.9);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.6);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'rulerShard': {
      g.fillStyle(UI_THEME.colors.gold, 0.9);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.accent, 0.8);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.7);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * radius * 2, y + Math.sin(angle) * radius * 2);
      g.strokePath();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 区域绘制
// ---------------------------------------------------------------------------
export function drawWeaponZone(
  g: Graphics,
  kind: WeaponZoneKind,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  g.clear();
  switch (kind) {
    case 'bloodWheel': {
      g.fillStyle(UI_THEME.colors.accent, alpha * 0.4);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.accentHover, alpha * 0.8);
      g.strokeCircle(x, y, radius * 0.7);
      break;
    }
    case 'rulerStorm': {
      g.fillStyle(UI_THEME.colors.gold, alpha * 0.3);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.gold, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, alpha * 0.6);
      g.strokeCircle(x, y, radius * 0.5);
      break;
    }
    case 'soulCapture': {
      g.fillStyle(UI_THEME.colors.accent, alpha * 0.2);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, alpha * 0.7);
      g.strokeCircle(x, y, radius * 0.4);
      break;
    }
    case 'chalkBomb': {
      g.fillStyle(CHALK_WHITE, alpha * 0.35);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.borderMuted, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'fistDash': {
      g.fillStyle(UI_THEME.colors.gold, alpha * 0.4);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'chainCrush': {
      g.fillStyle(UI_THEME.colors.border, alpha * 0.35);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.gold, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 近战闪光绘制（扇形弧线 + 填充三角）
// ---------------------------------------------------------------------------
export function drawMeleeFlash(
  g: Graphics,
  kind: MeleeFlashKind,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  range: number,
  halfAngle: number,
  progress: number, // 0..1 动画进度
): void {
  g.clear();
  const color = meleeFlashColor(kind);
  const alpha = 0.7 * (1 - progress);
  g.fillStyle(color, alpha * 0.3);
  g.lineStyle(UI_THEME.stroke.medium, color, alpha);
  const baseAngle = Math.atan2(dirY, dirX);
  const a1 = baseAngle - halfAngle;
  const a2 = baseAngle + halfAngle;
  g.beginPath();
  g.moveTo(originX, originY);
  g.arc(originX, originY, range, a1, a2);
  g.lineTo(originX, originY);
  // 兼容 mock（无 fillPath）与真实 Graphics（有 fillPath）
  const maybeFill = g as unknown as GraphicsWithOptionalFillPath;
  if (typeof maybeFill.fillPath === 'function') {
    maybeFill.fillPath();
  }
  g.strokePath();
}

function meleeFlashColor(kind: MeleeFlashKind): number {
  switch (kind) {
    case 'brokenRulerSlash':
    case 'rulerSlash':
    case 'fistCombo':
      return UI_THEME.colors.gold;
    case 'chainWhip':
      return UI_THEME.colors.border;
    case 'bloodScytheSlash':
    case 'soulBannerSlash':
      return UI_THEME.colors.accent;
  }
}
