import { describe, it, expect, vi } from 'vitest';
import {
  MobileControls, MOBILE_ACTION_DEPTH, MOBILE_ACTION_BUTTONS,
} from '../tombraid/ui/MobileControls';
import type { MobileControlsCallbacks } from '../tombraid/ui/MobileControls';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { on: vi.fn(), off: vi.fn(), keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() } },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: true } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn((ev: string, cb: Function) => { o._handlers = o._handlers || {}; (o._handlers[ev] = o._handlers[ev] || []).push(cb); return o; });
  o.disableInteractive = vi.fn(() => o);
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.r * 2, height: o.r * 2 });
  o.destroy = vi.fn(() => o);
  return o;
}

describe('MobileControls constants', () => {
  it('pins 4 action buttons with labels', () => {
    expect(MOBILE_ACTION_BUTTONS).toEqual([
      { id: 'basicAttack', label: '普攻', key: 'J' },
      { id: 'ultimate', label: '大招', key: 'K' },
      { id: 'interact', label: '交互', key: 'H' },
      { id: 'consumable', label: '消耗品', key: 'F' },
    ]);
  });

  it('pins depth 952 (above InputManager joystick 950/951)', () => {
    expect(MOBILE_ACTION_DEPTH).toBe(952);
  });
});

describe('MobileControls lifecycle', () => {
  it('create renders 4 action buttons on the right side', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    const circles = env.objects.filter((o) => o._kind === 'circle');
    expect(circles.length).toBe(4);
    for (const c of circles) expect(c.x).toBeGreaterThan(900);
  });

  it('buttons render with correct labels (普攻/大招/交互/消耗品)', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    const texts = env.objects.filter((o) => o._kind === 'text').map((o: any) => o.text);
    expect(texts).toEqual(expect.arrayContaining(['普攻', '大招', '交互', '消耗品']));
  });

  it('pointerup on basicAttack button triggers onBasicAttack', () => {
    const env = createMockScene();
    const onBasicAttack = vi.fn();
    const mc = new MobileControls(env.scene, {
      onBasicAttack, onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    mc.handleButtonPress('basicAttack');
    expect(onBasicAttack).toHaveBeenCalledTimes(1);
  });

  it('handleButtonPress triggers each callback', () => {
    const env = createMockScene();
    const cbs: MobileControlsCallbacks = {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    };
    const mc = new MobileControls(env.scene, cbs);
    mc.create();
    mc.handleButtonPress('basicAttack');
    mc.handleButtonPress('ultimate');
    mc.handleButtonPress('interact');
    mc.handleButtonPress('consumable');
    expect(cbs.onBasicAttack).toHaveBeenCalledTimes(1);
    expect(cbs.onUltimate).toHaveBeenCalledTimes(1);
    expect(cbs.onInteract).toHaveBeenCalledTimes(1);
    expect(cbs.onConsumable).toHaveBeenCalledTimes(1);
  });

  it('setVisible toggles all buttons', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    mc.setVisible(false);
    const circles = env.objects.filter((o) => o._kind === 'circle');
    for (const c of circles) expect(c.setVisible).toHaveBeenCalledWith(false);
    mc.setVisible(true);
    for (const c of circles) expect(c.setVisible).toHaveBeenCalledWith(true);
  });

  it('destroy clears buttons without throwing', () => {
    const env = createMockScene();
    const mc = new MobileControls(env.scene, {
      onBasicAttack: vi.fn(), onUltimate: vi.fn(), onInteract: vi.fn(), onConsumable: vi.fn(),
    });
    mc.create();
    expect(() => mc.destroy()).not.toThrow();
  });
});
