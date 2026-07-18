import { describe, it, expect, vi } from 'vitest';
import { Minimap, MINIMAP_DEPTH, BIG_MAP_DEPTH, BIG_MAP_TEXT_DEPTH } from '../forgottenSanity/ui/Minimap';
import type { MinimapUpdate } from '../forgottenSanity/ui/Minimap';

function createMockScene() {
  const objects: any[] = [];
  const keyboardKey = { isDown: false, on: vi.fn(), off: vi.fn() };
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
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
    },
    input: {
      keyboard: { addKey: vi.fn(() => keyboardKey), addCapture: vi.fn(), on: vi.fn(), off: vi.fn() },
      on: vi.fn(), off: vi.fn(),
    },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects, keyboardKey };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius', 'setBlendMode']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.destroy = vi.fn(() => o);
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  return o;
}

function update(over: Partial<MinimapUpdate> = {}): MinimapUpdate {
  return {
    playerX: 2500, playerY: 2000,
    // 包含所有默认标记所在 cell（player@cell12, chest/body@cell6, exit@cell19），
    // 以便既有测试聚焦验证标记渲染而非雾战过滤（spec §9.2 雾战过滤由独立测试覆盖）。
    exploredCells: [0, 1, 2, 6, 12, 19],
    chestMarkers: [{ id: 'chest-1', x: 1000, y: 1000, opened: false, kind: 'normal' }],
    bodyMarkers: [{ bodyId: 'body-1', x: 1500, y: 1500 }],
    exitDiscovered: true, exitX: 4500, exitY: 3500,
    ...over,
  };
}

describe('Minimap depth constants (spec §9.2 / §11.5)', () => {
  it('pins minimap < big map (1011 / 1980)', () => {
    expect(MINIMAP_DEPTH).toBe(1011);
    expect(BIG_MAP_DEPTH).toBe(1980);
    expect(BIG_MAP_TEXT_DEPTH).toBe(1981);
  });
});

describe('Minimap lifecycle', () => {
  it('create renders minimap background at top-right', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThan(0);
    const bg = rects[0];
    expect(bg.x).toBeGreaterThan(900); // 右上
    expect(bg.y).toBeLessThan(200);
  });

  it('update renders player dot + chest + exit + body markers (spec §9.2)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update());
    const circles = env.objects.filter((o) => o._kind === 'circle');
    // player(1) + chest(1) + exit(1) + body(1) = 4
    expect(circles.length).toBeGreaterThanOrEqual(4);
  });

  it('does NOT render enemy markers (spec §9.2: 缄默者不显示)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update());
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts.some((t: string) => t.includes('缄默者') || t.includes('enemy'))).toBe(false);
  });

  it('toggleBigMap opens and closes big map', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    expect(m.isBigMapOpen()).toBe(false);
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(true);
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(false);
  });

  it('handleEsc closes big map when open (ESC close fix)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.toggleBigMap();
    expect(m.isBigMapOpen()).toBe(true);
    const closed = m.handleEsc();
    expect(closed).toBe(true);          // ESC 被消费
    expect(m.isBigMapOpen()).toBe(false);
  });

  it('handleEsc returns false when big map closed (does not steal ESC)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    expect(m.isBigMapOpen()).toBe(false);
    expect(m.handleEsc()).toBe(false);
  });

  it('opened chest rendered with dim color (0x444444) vs unopened (spec §9.2)', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update({
      chestMarkers: [
        { id: 'c-open', x: 1000, y: 1000, opened: true, kind: 'normal' },
        { id: 'c-closed', x: 1200, y: 1200, opened: false, kind: 'normal' },
      ],
    }));
    const chestCircles = env.objects.filter((o: any) => o._kind === 'circle' && o.r === 3);
    // 2 chests + 1 body (all r=3) — 至少 2 个 chest 圆点
    expect(chestCircles.length).toBeGreaterThanOrEqual(2);
    const opened = chestCircles.find((c: any) => c.fillColor === 0x444444);
    expect(opened).toBeDefined();
  });

  it('destroy clears markers without throwing', () => {
    const env = createMockScene();
    const m = new Minimap(env.scene);
    m.create();
    m.update(update());
    expect(() => m.destroy()).not.toThrow();
  });
});
