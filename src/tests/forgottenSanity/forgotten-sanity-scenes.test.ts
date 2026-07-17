import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    readonly sceneKey: string;
    constructor(key?: string) {
      this.sceneKey = key ?? '';
    }
  }
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  };
});

import { loadProgressState, loadStashState } from '../../forgottenSanity/state/forgottenSanityState';
import { ForgottenSanityHubScene } from '../../forgottenSanity/ForgottenSanityHubScene';
import { ForgottenSanityScene } from '../../forgottenSanity/ForgottenSanityScene';

interface CapturedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fire: (event: string) => void;
}

function createCapturingAdd() {
  const rects: CapturedRect[] = [];
  const texts: string[] = [];

  function attachHandlers(): Record<string, unknown> {
    const handlers: Record<string, Array<() => void>> = {};
    const obj: Record<string, unknown> = {};
    obj.setOrigin = () => obj;
    obj.setDepth = () => obj;
    obj.setScrollFactor = () => obj;
    obj.setInteractive = () => obj;
    obj.setStrokeStyle = () => obj;
    obj.setShadow = () => obj;
    obj.setFillStyle = () => obj;
    obj.setVisible = () => obj;
    obj.setPosition = () => obj;
    obj.setRadius = () => obj;
    obj.setBlendMode = () => obj;
    obj.setStyle = () => obj;
    obj.disableInteractive = () => obj;
    obj.on = (event: string, cb: () => void) => {
      (handlers[event] ??= []).push(cb);
      return obj;
    };
    obj.fire = (event: string) => {
      (handlers[event] ?? []).forEach((cb) => cb());
    };
    return obj;
  }

  const add = {
    rectangle: (x: number, y: number, width: number, height: number) => {
      const obj = attachHandlers();
      obj.x = x;
      obj.y = y;
      obj.width = width;
      obj.height = height;
      rects.push({
        x,
        y,
        width,
        height,
        fire: (event: string) => (obj.fire as (e: string) => void)(event),
      });
      return obj;
    },
    text: (_x: number, _y: number, text: string) => {
      texts.push(text);
      return attachHandlers();
    },
    circle: (_x: number, _y: number, _r: number) => attachHandlers(),
    arc: (_x: number, _y: number, _r: number) => attachHandlers(),
    container: (_x: number, _y: number) => {
      const obj = attachHandlers();
      obj.add = () => obj;
      obj.removeAll = () => obj;
      return obj;
    },
  };

  return { rects, texts, add };
}

type CapturingAdd = ReturnType<typeof createCapturingAdd>['add'];

function readHubActive(): unknown {
  return (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__;
}

describe('ForgottenSanityHubScene 场景键', () => {
  it('注册场景键 ForgottenSanityHubScene', () => {
    const scene = new ForgottenSanityHubScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('ForgottenSanityHubScene');
  });
});

describe('ForgottenSanityHubScene.create', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ = undefined;
  });

  it('发放起手包、设置 hub 全局、注册 SHUTDOWN、HubUI 返回按钮回到 GameScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const eventsOnce = vi.fn();
    const scene = Object.create(ForgottenSanityHubScene.prototype) as ForgottenSanityHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
      cameras: { main: { setBackgroundColor: (color: unknown) => void } };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };
    scene.events = { once: eventsOnce };
    scene.cameras = { main: { setBackgroundColor: vi.fn() } };

    scene.create();

    expect(loadProgressState().state.starterPackGranted).toBe(true);
    expect(loadStashState().state.items).toEqual(
      expect.arrayContaining([
        { itemId: 'weapon.ruler', quantity: 1 },
        { itemId: 'consumable.celery', quantity: 3 },
      ]),
    );
    expect(readHubActive()).toBe(true);
    expect(eventsOnce).toHaveBeenCalled();
    expect(captor.texts).toContain('仓库');
    expect(captor.texts).toContain('进入墓穴');
    expect(captor.texts).toContain('返回');

    const back = captor.rects.find((r) => r.width === 120 && r.height === 40);
    expect(back).toBeDefined();
    back!.fire('pointerup');
    expect(startMock).toHaveBeenCalledWith('GameScene');
  });

  it('SHUTDOWN 回调清除 hub 全局', () => {
    const captor = createCapturingAdd();
    const eventsOnce = vi.fn();
    const scene = Object.create(ForgottenSanityHubScene.prototype) as ForgottenSanityHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
      cameras: { main: { setBackgroundColor: (color: unknown) => void } };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: eventsOnce };
    scene.cameras = { main: { setBackgroundColor: vi.fn() } };

    scene.create();
    expect(readHubActive()).toBe(true);

    const shutdownCb = eventsOnce.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(shutdownCb).toBeTypeOf('function');
    shutdownCb?.();
    expect(readHubActive()).toBe(false);
  });

  it('HubUI 返回按钮位于左下角固定位置 (80, 690) 尺寸 120×40', () => {
    const captor = createCapturingAdd();
    const scene = Object.create(ForgottenSanityHubScene.prototype) as ForgottenSanityHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
      cameras: { main: { setBackgroundColor: (color: unknown) => void } };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: vi.fn() };
    scene.cameras = { main: { setBackgroundColor: vi.fn() } };
    scene.create();
    const back = captor.rects.find((r) => r.width === 120 && r.height === 40 && r.x === 80 && r.y === 690);
    expect(back).toBeDefined();
  });
});

describe('ForgottenSanityScene 场景键与骨架', () => {
  beforeEach(() => localStorage.clear());

  it('注册场景键 ForgottenSanityScene', () => {
    const scene = new ForgottenSanityScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('ForgottenSanityScene');
  });

  it('create 添加占位文案与放弃返回枢纽按钮回到 ForgottenSanityHubScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const scene = Object.create(ForgottenSanityScene.prototype) as ForgottenSanityScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      cameras: { main: { setBackgroundColor: (c: unknown) => void; setBounds: (x: number, y: number, w: number, h: number) => void; scrollX: number; scrollY: number; width: number; height: number } };
      sys: { game: { device: { input: { touch: boolean } } } };
      input: { keyboard: { on: (e: string, cb: () => void) => void; addKey: (k: string) => { isDown: boolean } } | null };
      events: { emit: (e: string, ...args: unknown[]) => void };
      time: { delayedCall: (ms: number, cb: () => void) => { remove: () => void } };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };
    // Plan 6 接线所需的 scene-level mocks（cameras/sys/input/events/time）
    scene.cameras = {
      main: {
        setBackgroundColor: vi.fn(),
        setBounds: vi.fn(),
        scrollX: 0,
        scrollY: 0,
        width: 1280,
        height: 720,
      },
    };
    scene.sys = { game: { device: { input: { touch: false } } } };
    scene.input = {
      keyboard: { on: vi.fn(), addKey: vi.fn(() => ({ isDown: false })) },
    };
    scene.events = { emit: vi.fn() };
    scene.time = { delayedCall: vi.fn((_ms, cb) => { cb(); return { remove: vi.fn() }; }) };

    scene.create();

    expect(captor.texts).toContain('被遗忘的理智——待实现');
    expect(captor.texts).toContain('放弃返回枢纽');
    const abort = captor.rects.find((r) => r.width === 260 && r.height === 56);
    expect(abort).toBeDefined();
    abort!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('ForgottenSanityHubScene');
  });
});
