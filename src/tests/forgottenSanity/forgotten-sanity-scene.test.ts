// src/tests/forgottenSanity/forgotten-sanity-scene.test.ts
// Plan 2026-07-19 Task 1：SceneDebugState forgottenSanity 子状态 + ForgottenSanityScene test hooks。
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

import { createInitialSceneDebugState, type SceneDebugState } from '../../game/scaffoldState';
import { ForgottenSanityScene } from '../../forgottenSanity/ForgottenSanityScene';

// ───────────────────────────────────────────────────────────────────────────
// 复用 forgotten-sanity-scenes.test.ts 的 capturing add 模式（精简版），
// 仅提供 ForgottenSanityScene.create() 走通所需的最小 scene-level mock。
// ───────────────────────────────────────────────────────────────────────────
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
    // 4.4 toast auto-dismiss：text.destroy() 是 Phaser GameObject 公开 API，
    // mock 中提供 no-op 实现，使 showToast 的 delayedCall 回调可在测试环境执行。
    obj.destroy = () => { /* no-op */ };
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

interface ForgottenSanityTestHooksShape {
  __testTriggerEliteDefeat?: () => void;
  __testGiveVaultKey?: () => void;
  __testMovePlayerToVaultDoor?: () => void;
  __testSpawnChest?: (roomId: string, isVaultChest: boolean) => void;
  __testGetInventorySummary?: () => { items: Record<string, number>; vaultKey: number };
  __testGetCombatSummary?: () => { enemyCount: number; duplicateCount: number; farRoomCount: number };
  __testGetVaultState?: () => { doorUnlocked: boolean; chestsOpened: number };
  __testGetExploredCells?: () => number[];
  __testMovePlayerTo?: (roomId: string) => void;
  __testTogglePause?: () => void;
}

function readSceneHooks(): ForgottenSanityTestHooksShape | undefined {
  return (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: ForgottenSanityTestHooksShape })
    .__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
}

function createSceneWithMocks(): { scene: ForgottenSanityScene; captor: ReturnType<typeof createCapturingAdd> } {
  const captor = createCapturingAdd();
  const scene = Object.create(ForgottenSanityScene.prototype) as ForgottenSanityScene & {
    add: CapturingAdd;
    scene: { start: (key: string) => void };
    cameras: {
      main: {
        setBackgroundColor: (c: unknown) => void;
        setBounds: (x: number, y: number, w: number, h: number) => void;
        scrollX: number;
        scrollY: number;
        width: number;
        height: number;
      };
    };
    sys: { game: { device: { input: { touch: boolean } } } };
    input: { keyboard: { on: (e: string, cb: () => void) => void; addKey: (k: string) => { isDown: boolean } } | null };
    events: { emit: (e: string, ...args: unknown[]) => void };
    time: { delayedCall: (ms: number, cb: () => void) => { remove: () => void } };
  };
  scene.add = captor.add;
  scene.scene = { start: vi.fn() };
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
  return { scene, captor };
}

describe('SceneDebugState forgottenSanity', () => {
  it('accepts forgottenSanity sub-state with all fields', () => {
    // 用 createInitialSceneDebugState 拿到完整基础状态，再追加 forgottenSanity 子状态。
    // currentScene 类型为 GameSceneName | null，'ForgottenSanityScene' 不在联合中，故用 null。
    const base = createInitialSceneDebugState();
    const state: SceneDebugState = {
      ...base,
      ready: true,
      forgottenSanity: {
        scene: 'run',
        inventory: { items: { 'material.vaultKey': 1 }, vaultKey: 1 },
        combat: { enemyCount: 5, duplicateCount: 2, farRoomCount: 1, playerRoomId: 'room-0' },
        exploredCells: [0, 1, 5],
        vaultDoorUnlocked: false,
        vaultChestsOpened: 0,
        paused: false,
      },
    };
    expect(state.forgottenSanity?.scene).toBe('run');
    expect(state.forgottenSanity?.combat?.duplicateCount).toBe(2);
    expect(state.forgottenSanity?.inventory?.vaultKey).toBe(1);
    expect(state.forgottenSanity?.exploredCells).toEqual([0, 1, 5]);
    expect(state.forgottenSanity?.vaultDoorUnlocked).toBe(false);
    expect(state.forgottenSanity?.vaultChestsOpened).toBe(0);
    expect(state.forgottenSanity?.paused).toBe(false);
  });

  it('allows forgottenSanity to be omitted (backward compat)', () => {
    const state: SceneDebugState = createInitialSceneDebugState();
    expect(state.forgottenSanity).toBeUndefined();
  });
});

describe('ForgottenSanityScene test hooks', () => {
  beforeEach(() => {
    (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: unknown }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ = undefined;
  });

  it('exposes __test* hooks on window after create() in test env', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    expect(hooks).toBeDefined();
    expect(typeof hooks?.__testTriggerEliteDefeat).toBe('function');
    expect(typeof hooks?.__testGiveVaultKey).toBe('function');
    expect(typeof hooks?.__testMovePlayerToVaultDoor).toBe('function');
    expect(typeof hooks?.__testSpawnChest).toBe('function');
    expect(typeof hooks?.__testGetInventorySummary).toBe('function');
    expect(typeof hooks?.__testGetCombatSummary).toBe('function');
    expect(typeof hooks?.__testGetVaultState).toBe('function');
    expect(typeof hooks?.__testGetExploredCells).toBe('function');
    expect(typeof hooks?.__testMovePlayerTo).toBe('function');
    expect(typeof hooks?.__testTogglePause).toBe('function');
  });

  it('returns placeholder inventory summary when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    expect(hooks?.__testGetInventorySummary).toBeDefined();
    const summary = hooks!.__testGetInventorySummary!();
    expect(summary).toEqual({ items: {}, vaultKey: 0 });
  });

  it('returns placeholder combat summary when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    const summary = hooks!.__testGetCombatSummary!();
    expect(summary).toEqual({ enemyCount: 0, duplicateCount: 0, farRoomCount: 0 });
  });

  it('returns placeholder vault state when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    const vault = hooks!.__testGetVaultState!();
    expect(vault).toEqual({ doorUnlocked: false, chestsOpened: 0 });
  });

  it('returns placeholder explored cells when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    const cells = hooks!.__testGetExploredCells!();
    expect(cells).toEqual([]);
  });

  it('__testTogglePause does not throw when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    expect(() => hooks!.__testTogglePause!()).not.toThrow();
  });

  it('__testTriggerEliteDefeat does not throw when runController is absent', () => {
    const { scene } = createSceneWithMocks();
    scene.create();

    const hooks = readSceneHooks();
    expect(() => hooks!.__testTriggerEliteDefeat!()).not.toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Plan 2026-07-19 Task 14 (M8)：ESC 暂停菜单
// ESC 优先级：大地图可见 → 关闭大地图（不暂停）；否则 → togglePause()。
// 暂停时 combatManager.setFrozen(true) + update 顶部 if(paused) return。
// 暂停菜单 3 项：继续 / 放弃对局 / 设置（含音效开关 + 像素滤镜开关 + 返回）。
// ───────────────────────────────────────────────────────────────────────────
describe('M8 ESC pause menu', () => {
  beforeEach(() => {
    (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: unknown }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ = undefined;
  });

  it('ESC toggles pause when big map is hidden', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    expect(scene.isPaused()).toBe(false);
    scene.handleEsc();
    expect(scene.isPaused()).toBe(true);
    scene.handleEsc();
    expect(scene.isPaused()).toBe(false);
  });

  it('ESC closes big map without pausing when big map is visible', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    scene.getMinimap()!.toggleBigMap(); // 打开大地图
    expect(scene.getMinimap()!.isBigMapOpen()).toBe(true);
    scene.handleEsc();
    expect(scene.isPaused()).toBe(false);
    expect(scene.getMinimap()!.isBigMapOpen()).toBe(false);
  });

  it('pause menu has 3 items: resume/abandon/settings', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    scene.handleEsc(); // 打开暂停菜单
    const menu = scene.getPauseMenu();
    expect(menu).not.toBeNull();
    const items = menu!.getItems();
    expect(items.map((i) => i.id)).toEqual(['resume', 'abandon', 'settings']);
    expect(items.map((i) => i.label)).toEqual(['继续', '放弃对局', '设置']);
  });

  it('settings submenu toggles audio', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    scene.handleEsc(); // 打开暂停菜单
    const initialAudio = scene.getAudioEnabled();
    expect(initialAudio).toBe(true);
    scene.getPauseMenu()!.clickSettings();
    scene.getPauseMenu()!.clickAudioToggle();
    expect(scene.getAudioEnabled()).toBe(false);
    scene.getPauseMenu()!.clickAudioToggle();
    expect(scene.getAudioEnabled()).toBe(true);
  });

  it('settings submenu toggles pixel filter', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    scene.handleEsc();
    const initial = scene.getPauseMenu()!.isPixelFilterEnabled();
    expect(initial).toBe(true);
    scene.getPauseMenu()!.clickSettings();
    scene.getPauseMenu()!.clickPixelFilterToggle();
    expect(scene.getPauseMenu()!.isPixelFilterEnabled()).toBe(false);
  });

  it('togglePause freezes combatManager when set', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    const fakeCm = {
      setFrozen: vi.fn(),
      isFrozen: vi.fn(() => false),
    };
    scene.setCombatDeps(
      fakeCm as unknown as import('../../forgottenSanity/combat/CombatManager').CombatManager,
      {} as unknown as import('../../forgottenSanity/weapons/WeaponCombatAdapter').WeaponCombatAdapter,
    );
    scene.togglePause(); // pause
    expect(fakeCm.setFrozen).toHaveBeenCalledWith(true);
    scene.togglePause(); // unpause
    expect(fakeCm.setFrozen).toHaveBeenCalledWith(false);
  });

  it('togglePause shows/hides pause menu', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    expect(scene.getPauseMenu()!.isVisible()).toBe(false);
    scene.togglePause();
    expect(scene.getPauseMenu()!.isVisible()).toBe(true);
    scene.togglePause();
    expect(scene.getPauseMenu()!.isVisible()).toBe(false);
  });

  it('update is skipped when paused (runController.update not called)', () => {
    const { scene } = createSceneWithMocks();
    scene.create();
    const updateSpy = vi.fn();
    (scene as unknown as { runController: { update: typeof updateSpy } | null }).runController = { update: updateSpy };
    // 注入 mock combatManager 避免 wallHitRenderer.sync 在 mock 环境崩溃
    // 同时提供 setFrozen/isFrozen 以满足 togglePause 的冻结调用
    scene.setCombatDeps(
      {
        getWallHitParticles: () => [],
        setFrozen: vi.fn(),
        isFrozen: vi.fn(() => false),
      } as unknown as import('../../forgottenSanity/combat/CombatManager').CombatManager,
      {} as unknown as import('../../forgottenSanity/weapons/WeaponCombatAdapter').WeaponCombatAdapter,
    );
    scene.togglePause(); // pause
    scene.update(0, 16);
    expect(updateSpy).not.toHaveBeenCalled();
    scene.togglePause(); // unpause
    scene.update(0, 16);
    expect(updateSpy).toHaveBeenCalled();
  });
});

describe('M8 abandonRun source contract (plan Task 14)', () => {
  it('abandonRun calls runDeathSettlement without depositRunInventory', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const ctrlSrc = fs.readFileSync(
      path.resolve(__dirname, '../../forgottenSanity/ForgottenSanityRunController.ts'),
      'utf8',
    );
    // 匹配 abandonRun 方法体（可见性修饰符可选）
    const match = ctrlSrc.match(/^[ \t]*(?:private\s+|public\s+)?abandonRun\(\)[^{]*\{([\s\S]*?)\n  \}/m);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 必须调用 runDeathSettlement（按死亡处理：本局战利品全丢，仓库不变）
    expect(body).toMatch(/runDeathSettlement\s*\(/);
    // 不应调用 depositRunInventory（仓库不变）
    expect(body).not.toMatch(/depositRunInventory\s*\(/);
    // 不应调用 storeStash（仓库不变）
    expect(body).not.toMatch(/storeStash\s*\(/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Plan 2026-07-19 Task 19 (4.4)：vault door toast 自动消失
// showToast(message, durationMs=2000) 在屏幕上方显示一条文本，durationMs 后自动移除。
// 默认 2000ms；支持自定义 durationMs。供 ForgottenSanityRunController.tryUnlockVaultDoor
// 在「已解锁」/「需要仓库钥匙」分支调用。
//
// 测试策略：queue-based delayedCall mock —— 回调不立即执行，而是排队等待 advanceTime(ms)
// 推进虚拟时钟后再触发；这样可精确验证 1999ms 仍可见、2000ms 才消失的边界。
// ───────────────────────────────────────────────────────────────────────────

interface ToastMockScene extends ForgottenSanityScene {
  time: { delayedCall: (ms: number, cb: () => void) => { remove: () => void } };
}

function createSceneWithToastMocks(): {
  scene: ToastMockScene;
  advanceTime: (ms: number) => void;
} {
  const { scene: baseScene } = createSceneWithMocks();
  const scene = baseScene as ToastMockScene;
  // queue-based delayedCall：回调入队，advanceTime 推进虚拟时钟后才触发
  const pendingTimers: Array<{ fireAt: number; callback: () => void; fired: boolean }> = [];
  let virtualTime = 0;
  scene.time = {
    delayedCall: (durationMs: number, cb: () => void) => {
      const entry = { fireAt: virtualTime + durationMs, callback: cb, fired: false };
      pendingTimers.push(entry);
      return { remove: () => { entry.fired = true; } };
    },
  };
  const advanceTime = (ms: number): void => {
    virtualTime += ms;
    for (const t of pendingTimers) {
      if (!t.fired && t.fireAt <= virtualTime) {
        t.fired = true;
        t.callback();
      }
    }
  };
  return { scene, advanceTime };
}

describe('4.4 toast auto-dismiss', () => {
  it('showToast removes toast after 2000ms', () => {
    const { scene, advanceTime } = createSceneWithToastMocks();
    scene.create();
    scene.showToast('test message');
    expect(scene.getVisibleToasts().length).toBe(1);
    advanceTime(2000);
    expect(scene.getVisibleToasts().length).toBe(0);
  });

  it('showToast accepts custom durationMs', () => {
    const { scene, advanceTime } = createSceneWithToastMocks();
    scene.create();
    scene.showToast('test', 500);
    expect(scene.getVisibleToasts().length).toBe(1);
    advanceTime(500);
    expect(scene.getVisibleToasts().length).toBe(0);
  });

  it('showToast default durationMs is 2000', () => {
    const { scene, advanceTime } = createSceneWithToastMocks();
    scene.create();
    scene.showToast('test');
    advanceTime(1999);
    expect(scene.getVisibleToasts().length).toBe(1); // 还未消失
    advanceTime(1);
    expect(scene.getVisibleToasts().length).toBe(0);
  });
});
