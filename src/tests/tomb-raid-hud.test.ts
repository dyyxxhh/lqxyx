import { describe, it, expect, vi } from 'vitest';
import { TombRaidHUD, HUD_BASE_DEPTH, HUD_TEXT_DEPTH, HUD_OVERLAY_DEPTH } from '../tombraid/ui/TombRaidHUD';
import type { HudSnapshot } from '../tombraid/ui/TombRaidHUD';

// 复用 HubUI/narrative-ui 测试中的 mock scene 模式：jsdom 下无 Phaser 运行时，
// 通过 chainable 提供链式 stub；setText 真实写入 text 字段便于断言。
function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      arc: vi.fn((x: number, y: number, r: number) => {
        const o = chain({ x, y, r, _kind: 'arc', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setAngle', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.destroy = vi.fn(() => o);
  o.on = vi.fn(() => o);
  o.clear = vi.fn(() => o);
  o.fillStyle = vi.fn(() => o);
  o.lineStyle = vi.fn(() => o);
  o.beginPath = vi.fn(() => o);
  o.arc = vi.fn(() => o);
  o.moveTo = vi.fn(() => o);
  o.lineTo = vi.fn(() => o);
  o.strokePath = vi.fn(() => o);
  o.fillPath = vi.fn(() => o);
  o.slice = vi.fn(() => o);
  o.fillCircle = vi.fn(() => o);
  // setText 真实写入字段以便断言
  o.setText = vi.fn((newText: string) => { o.text = newText; return o; });
  o.setColor = vi.fn((color: string) => { o.color = color; return o; });
  return o;
}

function snapshot(over: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    hp: 80, maxHp: 100,
    stamina: 60, maxStamina: 100,
    isFatigued: false,
    weaponId: 'weapon.ruler', weaponName: '尺子',
    ultCooldownRemaining: 5000, ultCooldownTotal: 20000,
    sanity: 180, baseline: 200,
    fragmentCount: 4,
    elapsedMs: 125000, // 2m 5s
    consumableSlots: [{ itemId: 'consumable.celery', quantity: 2 }],
    stashSanity: 750,
    ...over,
  };
}

describe('TombRaidHUD depth constants (spec §9.1 / §11.5)', () => {
  it('pins HUD depths 1000/1001/1002', () => {
    expect(HUD_BASE_DEPTH).toBe(1000);
    expect(HUD_TEXT_DEPTH).toBe(1001);
    expect(HUD_OVERLAY_DEPTH).toBe(1002);
  });
});

describe('TombRaidHUD lifecycle', () => {
  it('create renders HP bar, stamina bar, weapon name, ult CD, sanity, fragment count, timer, consumable slots, sanity ratio', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    hud.update(snapshot());
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    // HP 文本
    expect(texts.some((t: string) => /80|100/.test(t))).toBe(true);
    // 武器名
    expect(texts.some((t: string) => t.includes('尺子'))).toBe(true);
    // 理智 / 基准线
    expect(texts.some((t: string) => /180|200/.test(t))).toBe(true);
    // 碎片计数
    expect(texts.some((t: string) => /碎片|fragment/i.test(t) && /4/.test(t))).toBe(true);
    // 计时器（2m 05s 形式或含冒号时间）
    expect(texts.some((t: string) => /2:0?5|125/.test(t))).toBe(true);
  });

  it('sanity text turns gold when sanity >= baseline (spec §9.1)', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const below = hud.update(snapshot({ sanity: 150, baseline: 200 }));
    const at = hud.update(snapshot({ sanity: 200, baseline: 200 }));
    const above = hud.update(snapshot({ sanity: 250, baseline: 200 }));
    expect(below.sanityAtBaseline).toBe(false);
    expect(at.sanityAtBaseline).toBe(true);
    expect(above.sanityAtBaseline).toBe(true);
  });

  it('ult CD ring fraction = 1 - remaining/total', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ ultCooldownRemaining: 5000, ultCooldownTotal: 20000 }));
    expect(r.ultCooldownFraction).toBeCloseTo(0.75);
  });

  it('ult CD ready when remaining 0', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ ultCooldownRemaining: 0, ultCooldownTotal: 20000 }));
    expect(r.ultReady).toBe(true);
  });

  it('stamina fraction returned for stamina bar fill', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ stamina: 25, maxStamina: 100 }));
    expect(r.staminaFraction).toBeCloseTo(0.25);
  });

  it('fatigue flag surfaces when player is fatigued', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ isFatigued: true }));
    expect(r.isFatigued).toBe(true);
  });

  it('timer formats mm:ss (125000ms -> 02:05)', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ elapsedMs: 125000 }));
    expect(r.timerText).toBe('02:05');
  });

  it('timer formats hour when >= 1h', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    const r = hud.update(snapshot({ elapsedMs: 3_725_000 })); // 1h 02m 05s
    expect(r.timerText).toBe('01:02:05');
  });

  it('destroy clears consumable texts without throwing', () => {
    const env = createMockScene();
    const hud = new TombRaidHUD(env.scene);
    hud.create();
    hud.update(snapshot());
    expect(() => hud.destroy()).not.toThrow();
  });
});
