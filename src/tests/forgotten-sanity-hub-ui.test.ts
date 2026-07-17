import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HubUI, HUB_PANELS } from '../forgottenSanity/ui/HubUI';

// 复用 narrative-ui.test.ts 的 mock scene 模式
function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color: number, alpha?: number) => {
        const o = chainable({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, interactive: false, origin: 0 });
        objects.push(o);
        return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chainable({ x, y, text, _kind: 'text', depth: 0, visible: true, origin: 0 });
        objects.push(o);
        return o;
      }),
      container: vi.fn((x: number, y: number) => {
        const o = chainable({ x, y, _kind: 'container', depth: 0, visible: true });
        o.add = vi.fn(() => o);
        o.removeAll = vi.fn(() => o);
        objects.push(o);
        return o;
      }),
    },
    input: { on: vi.fn(), keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() } },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
    scene: { start: vi.fn(), get: vi.fn(() => null) },
  };
  return { scene, objects };
}

function chainable(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition']) {
    o[m] = vi.fn((..._args: any[]) => o);
  }
  // setText 实际更新 text 字段，便于断言
  o.setText = vi.fn((newText: string) => { o.text = newText; return o; });
  o.disableInteractive = vi.fn(() => o);
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  return o;
}

describe('HubUI panels', () => {
  it('pins 5 panel ids in display order', () => {
    expect(HUB_PANELS.map((p) => p.id)).toEqual(['stash', 'shop', 'loadout', 'upgrades', 'enter']);
    expect(HUB_PANELS.map((p) => p.label)).toEqual(['仓库', '商城', '起配', '永久升级', '进入墓穴']);
  });
});

describe('HubUI lifecycle', () => {
  beforeEach(() => localStorage.clear());

  it('create renders 5 panel buttons + back button + active panel title', () => {
    const env = createMockScene();
    const onEnter = vi.fn();
    const onBack = vi.fn();
    const hub = new HubUI(env.scene, { onEnter, onBack });
    hub.create();
    // 5 panel 按钮 + 1 返回按钮 + 标题文字
    const rects = env.objects.filter((o) => o._kind === 'rectangle');
    expect(rects.length).toBeGreaterThanOrEqual(6);
    const texts = env.objects.filter((o) => o._kind === 'text');
    expect(texts.some((t) => t.text === '仓库')).toBe(true);
    expect(texts.some((t) => t.text === '进入墓穴')).toBe(true);
    expect(texts.some((t) => t.text === '返回')).toBe(true);
  });

  it('switching panel updates active panel title', () => {
    const env = createMockScene();
    const hub = new HubUI(env.scene, { onEnter: vi.fn(), onBack: vi.fn() });
    hub.create();
    hub.switchPanel('upgrades');
    const texts = env.objects.filter((o) => o._kind === 'text');
    expect(texts.some((t) => t.text === '永久升级')).toBe(true);
  });

  it('clicking enter panel triggers onEnter callback', () => {
    const env = createMockScene();
    const onEnter = vi.fn();
    const hub = new HubUI(env.scene, { onEnter, onBack: vi.fn() });
    hub.create();
    hub.handlePanelClick('enter');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('clicking back triggers onBack', () => {
    const env = createMockScene();
    const onBack = vi.fn();
    const hub = new HubUI(env.scene, { onEnter: vi.fn(), onBack });
    hub.create();
    hub.handleBack();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
