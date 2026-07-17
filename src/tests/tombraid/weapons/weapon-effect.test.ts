import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';

import { UI_THEME } from '../../../ui/uiTheme';
import {
  drawWeaponProjectile,
  drawWeaponZone,
  drawMeleeFlash,
} from '../../../tombraid/weapons/WeaponEffect';

type Graphics = Phaser.GameObjects.Graphics;

function makeMockGraphics(): Graphics & { calls: string[] } {
  const calls: string[] = [];
  const mock = {
    calls,
    clear: () => { calls.push('clear'); },
    lineStyle: (w: number, c: number, a?: number) => { calls.push(`lineStyle:${w},${c},${a}`); },
    fillStyle: (c: number, a?: number) => { calls.push(`fillStyle:${c},${a}`); },
    beginPath: () => { calls.push('beginPath'); },
    lineBetween: (x1: number, y1: number, x2: number, y2: number) => { calls.push(`lineBetween:${x1},${y1},${x2},${y2}`); },
    strokeCircle: (x: number, y: number, r: number) => { calls.push(`strokeCircle:${x},${y},${r}`); },
    fillCircle: (x: number, y: number, r: number) => { calls.push(`fillCircle:${x},${y},${r}`); },
    fillRect: (x: number, y: number, w: number, h: number) => { calls.push(`fillRect:${x},${y},${w},${h}`); },
    fillTriangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => { calls.push('fillTriangle'); },
    strokePath: () => { calls.push('strokePath'); },
    arc: (x: number, y: number, r: number, s: number, e: number) => { calls.push(`arc:${x},${y},${r}`); },
    moveTo: (x: number, y: number) => { calls.push(`moveTo:${x},${y}`); },
    lineTo: (x: number, y: number) => { calls.push(`lineTo:${x},${y}`); },
  };
  return mock as unknown as Graphics & { calls: string[] };
}

describe('drawWeaponProjectile (plan 4)', () => {
  it('bladeCrescent 使用 borderBlue 配色 + fillCircle', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'bladeCrescent', 100, 200, 0, 14);
    expect(g.calls).toContain('clear');
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.borderBlue}`))).toBe(true);
    expect(g.calls.some((c) => c.startsWith('fillCircle:100,200,14'))).toBe(true);
  });

  it('chalkThrow 使用白色配色', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'chalkThrow', 0, 0, 0, 8);
    expect(g.calls.some((c) => c.startsWith('fillCircle:0,0,8'))).toBe(true);
  });

  it('rulerShard 使用 gold 配色', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'rulerShard', 50, 50, 1.5, 8);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.gold}`))).toBe(true);
  });
});

describe('drawWeaponZone (plan 4)', () => {
  it('bloodWheel 使用 accent 红色 + strokeCircle', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'bloodWheel', 0, 0, 130, 0.6);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.accent}`))).toBe(true);
    expect(g.calls.some((c) => c.startsWith('strokeCircle:0,0,130'))).toBe(true);
  });

  it('rulerStorm 使用 gold 配色', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'rulerStorm', 10, 20, 110, 0.5);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.gold}`))).toBe(true);
  });

  it('soulCapture 使用 accent + gold 双色', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'soulCapture', 0, 0, 600, 0.4);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.accent}`))).toBe(true);
  });

  it('chalkBomb / fistDash / chainCrush 均可绘制不抛错', () => {
    const g = makeMockGraphics();
    expect(() => drawWeaponZone(g, 'chalkBomb', 0, 0, 90, 0.7)).not.toThrow();
    expect(() => drawWeaponZone(g, 'fistDash', 0, 0, 70, 0.7)).not.toThrow();
    expect(() => drawWeaponZone(g, 'chainCrush', 0, 0, 180, 0.7)).not.toThrow();
  });
});

describe('drawMeleeFlash (plan 4)', () => {
  it('rulerSlash 绘制扇形弧线', () => {
    const g = makeMockGraphics();
    drawMeleeFlash(g, 'rulerSlash', 0, 0, 1, 0, 80, Math.PI / 4, 0.5);
    expect(g.calls).toContain('clear');
    expect(g.calls.some((c) => c.startsWith(`lineStyle:`))).toBe(true);
  });

  it('所有近战闪光种类可绘制不抛错', () => {
    const g = makeMockGraphics();
    const kinds = ['brokenRulerSlash', 'rulerSlash', 'fistCombo', 'chainWhip', 'bloodScytheSlash', 'soulBannerSlash'] as const;
    for (const k of kinds) {
      expect(() => drawMeleeFlash(g, k, 0, 0, 1, 0, 60, Math.PI / 4, 0.5)).not.toThrow();
    }
  });

  it('bloodScytheSlash 使用 accent 配色', () => {
    const g = makeMockGraphics();
    drawMeleeFlash(g, 'bloodScytheSlash', 0, 0, 1, 0, 110, Math.PI / 3, 0.6);
    expect(g.calls.some((c) => c.startsWith(`lineStyle:`) && c.includes(`${UI_THEME.colors.accent}`))).toBe(true);
  });
});
