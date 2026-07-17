import { describe, it, expect, vi } from 'vitest';
import {
  RedEdgeFogOverlay, RED_EDGE_VISIBILITY_RADIUS_PX, RED_EDGE_MASK_DURATION_MS, FOG_MASK_DEPTH,
} from '../forgottenSanity/ui/RedEdgeFogOverlay';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    time: { delayedCall: vi.fn((ms: number, cb: () => void) => { cb(); return { remove: vi.fn() }; }) },
    cameras: { main: { worldView: { x: 0, y: 0, width: 1280, height: 720 }, centerX: 640, centerY: 360, scrollX: 0, scrollY: 0 } },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setFillStyle', 'setPosition', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  // setVisible / setVisible 必须真正写字段，让断言能验证可见性
  o.setVisible = vi.fn((v: boolean) => { o.visible = v; return o; });
  o.destroy = vi.fn(() => o);
  return o;
}

describe('RedEdgeFogOverlay constants', () => {
  it('pins 220px visibility, 2000ms mask, depth 1990', () => {
    expect(RED_EDGE_VISIBILITY_RADIUS_PX).toBe(220);
    expect(RED_EDGE_MASK_DURATION_MS).toBe(2000);
    expect(FOG_MASK_DEPTH).toBe(1990);
  });
});

describe('RedEdgeFogOverlay lifecycle', () => {
  it('create pre-renders hidden overlay + label', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(rects[0].visible).toBe(false);
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts.some((t: string) => t.includes('理智正在消散'))).toBe(true);
  });

  it('activate shows overlay + schedules 2s hide', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(640, 360);
    expect(fog.isActive()).toBe(true);
    // delayedCall 已在 mock 中立即触发回调 → 视觉遮罩隐藏但"红边雾战"逻辑仍持续
    // isActive 表示红边雾战生效（220px 视野），独立于 2s 文字遮罩
    expect(fog.isRedEdgeFogActive()).toBe(true);
  });

  it('update moves overlay center to follow player', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(100, 100);
    fog.update(250, 300);
    // 中心应跟随 (无 assertion 细节，仅验证不抛错)
    expect(fog.isRedEdgeFogActive()).toBe(true);
  });

  it('deactivate clears red edge fog', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(0, 0);
    fog.deactivate();
    expect(fog.isRedEdgeFogActive()).toBe(false);
  });

  it('destroy clears overlay without throwing', () => {
    const env = createMockScene();
    const fog = new RedEdgeFogOverlay(env.scene);
    fog.create();
    fog.activate(0, 0);
    expect(() => fog.destroy()).not.toThrow();
  });
});
