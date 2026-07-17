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

import { GAME_HEIGHT } from '../../game/scaffoldState';
import { loadProgressState, loadStashState } from '../../tombraid/state/tombRaidState';
import { TombRaidHubScene } from '../../tombraid/TombRaidHubScene';
import { TombRaidScene } from '../../tombraid/TombRaidScene';

interface CapturedRect {
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
    obj.setInteractive = () => obj;
    obj.setStrokeStyle = () => obj;
    obj.setShadow = () => obj;
    obj.setFillStyle = () => obj;
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
  };

  return { rects, texts, add };
}

type CapturingAdd = ReturnType<typeof createCapturingAdd>['add'];

function readHubActive(): unknown {
  return (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__;
}

describe('TombRaidHubScene 场景键', () => {
  it('注册场景键 TombRaidHubScene', () => {
    const scene = new TombRaidHubScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('TombRaidHubScene');
  });
});

describe('TombRaidHubScene.create', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ = undefined;
  });

  it('发放起手包、设置 hub 全局、注册 SHUTDOWN、添加返回主菜单按钮回到 GameScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const eventsOnce = vi.fn();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };
    scene.events = { once: eventsOnce };

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
    expect(captor.texts).toContain('摸金模式 · 枢纽');
    expect(captor.texts).toContain('返回主菜单');

    const back = captor.rects.find((r) => r.width === 240 && r.height === 56);
    expect(back).toBeDefined();
    back!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('GameScene');
  });

  it('SHUTDOWN 回调清除 hub 全局', () => {
    const captor = createCapturingAdd();
    const eventsOnce = vi.fn();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: eventsOnce };

    scene.create();
    expect(readHubActive()).toBe(true);

    const shutdownCb = eventsOnce.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(shutdownCb).toBeTypeOf('function');
    shutdownCb?.();
    expect(readHubActive()).toBe(false);
  });

  it('返回主菜单按钮位于 GAME_HEIGHT/2 + 120', () => {
    const captor = createCapturingAdd();
    const scene = Object.create(TombRaidHubScene.prototype) as TombRaidHubScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
      events: { once: (event: string, cb: () => void) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: vi.fn() };
    scene.events = { once: vi.fn() };
    scene.create();
    const back = captor.rects.find((r) => r.width === 240 && r.height === 56);
    expect(back).toBeDefined();
    expect(GAME_HEIGHT / 2 + 120).toBe(480);
  });
});

describe('TombRaidScene 场景键与骨架', () => {
  beforeEach(() => localStorage.clear());

  it('注册场景键 TombRaidScene', () => {
    const scene = new TombRaidScene() as unknown as { sceneKey: string };
    expect(scene.sceneKey).toBe('TombRaidScene');
  });

  it('create 添加占位文案与放弃返回枢纽按钮回到 TombRaidHubScene', () => {
    const captor = createCapturingAdd();
    const startMock = vi.fn();
    const scene = Object.create(TombRaidScene.prototype) as TombRaidScene & {
      add: CapturingAdd;
      scene: { start: (key: string) => void };
    };
    scene.add = captor.add;
    scene.scene = { start: startMock };

    scene.create();

    expect(captor.texts).toContain('摸金对局——待实现');
    expect(captor.texts).toContain('放弃返回枢纽');
    const abort = captor.rects.find((r) => r.width === 260 && r.height === 56);
    expect(abort).toBeDefined();
    abort!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('TombRaidHubScene');
  });
});
