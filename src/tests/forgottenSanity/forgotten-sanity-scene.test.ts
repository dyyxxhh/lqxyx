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
