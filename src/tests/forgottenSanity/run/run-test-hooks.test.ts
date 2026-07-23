// src/tests/forgottenSanity/run/run-test-hooks.test.ts
// RunTestHooks 子模块单测（spec#5 §7.1 / plan#5 Task 15）。
// RunTestHooks 仅依赖 RunSharedState + RunInteractionHandler，无 Phaser runtime import，
// 故可用真实 Inventory/PlayerCombat/CombatManager + mock scene/renderer 注入。
import { describe, expect, it, vi } from 'vitest';

import { RunTestHooks } from '../../../forgottenSanity/run/RunTestHooks';
import type { RunSharedState } from '../../../forgottenSanity/run/runTypes';
import type { RunInteractionHandler } from '../../../forgottenSanity/run/RunInteractionHandler';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';
import { CombatManager } from '../../../forgottenSanity/combat/CombatManager';
import { Inventory } from '../../../forgottenSanity/loot/Inventory';
import {
  generateForgottenSanityMap,
  createRng,
} from '../../../forgottenSanity/map/ForgottenSanityMapGenerator';
import type { ForgottenSanityMapRenderer } from '../../../forgottenSanity/map/ForgottenSanityMapRenderer';
import type { NoteOverlay } from '../../../forgottenSanity/ui/NoteOverlay';
import {
  UNARMED_ID,
  type Loadout,
} from '../../../forgottenSanity/meta/LoadoutManager';
import {
  WeaponCooldowns,
} from '../../../forgottenSanity/weapons/WeaponCooldowns';
import {
  WeaponCombatAdapter,
} from '../../../forgottenSanity/weapons/WeaponCombatAdapter';
import { getUpgradeEffects } from '../../../forgottenSanity/meta/UpgradeManager';

// ───────────────────────────────────────────────────────────────────────────
// 构造最小 RunSharedState mock：真实 Inventory / PlayerCombat / CombatManager +
// mock scene.add.zone / renderer / noteOverlay。其余字段填默认值。
// ───────────────────────────────────────────────────────────────────────────
function makeMockState(manifest = generateForgottenSanityMap(12345)): RunSharedState {
  const rng = createRng(67890);
  const player = new PlayerCombat();
  const inventory = new Inventory();
  const combatManager = new CombatManager(player, {}, () => true);
  const weaponCooldowns = new WeaponCooldowns();
  const weaponAdapter = new WeaponCombatAdapter(combatManager, weaponCooldowns, null);
  const loadout: Loadout = { weaponId: UNARMED_ID, consumables: [] };
  const upgradeEffects = getUpgradeEffects({
    physique: 0,
    swift: 0,
    pickup: 0,
    sharp: 0,
    lucky: 0,
    armory: 0,
  });
  const renderer = {
    getCollisionZones: () => [],
    vaultUnlocked: false,
    unlockVaultDoor: vi.fn(),
    createVaultDoorInteraction: vi.fn(() => ({ x: 0, y: 0 })),
  } as unknown as ForgottenSanityMapRenderer;
  const noteOverlay = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    create: vi.fn(),
    destroy: vi.fn(),
  } as unknown as NoteOverlay;
  const scene = {
    add: {
      zone: vi.fn(() => ({ setInteractive: vi.fn(() => ({})) })),
    },
  } as unknown as RunSharedState['scene'];

  const makeKey = () => ({ isDown: false, on: vi.fn() });
  const cursors = {
    left: { isDown: false },
    right: { isDown: false },
    up: { isDown: false },
    down: { isDown: false },
  } as unknown as RunSharedState['cursors'];

  const entrance = manifest.rooms.find((r) => r.id === manifest.entranceRoomId)!;

  return {
    scene,
    renderer,
    manifest,
    rng,
    player,
    inventory,
    combatManager,
    weaponCooldowns,
    weaponAdapter,
    loadout,
    upgradeEffects,
    playerX: entrance.spawnPoint.x,
    playerY: entrance.spawnPoint.y,
    facingX: 0,
    facingY: 1,
    isRunning: false,
    isMoving: false,
    knockbackVx: 0,
    knockbackVy: 0,
    knockbackRemainingMs: 0,
    dashLockState: null,
    exploredCells: new Set<number>(),
    chestDecrypts: new Map(),
    openedChests: new Set(),
    activeChestId: null,
    chestHitAreas: new Map(),
    noteHitAreas: new Map(),
    readNoteInstancesThisRun: new Map(),
    noteOverlay,
    noteOverlayActive: false,
    notesState: { schemaVersion: 1, nextSequentialIndex: 0 },
    exitX: 0,
    exitY: 0,
    exitDiscovered: false,
    exitZone: null,
    vaultDoorX: 0,
    vaultDoorY: 0,
    elapsedMs: 0,
    startTime: 0,
    cursors,
    keyJ: makeKey(),
    keyK: makeKey(),
    keyH: makeKey(),
    keyShift: makeKey(),
    playerSprite: { setPosition: vi.fn() } as unknown as RunSharedState['playerSprite'],
  };
}

// RunInteractionHandler 仅用作 RunTestHooks 构造器形参；多数 *ForTest 方法不调用它。
// 用最小 mock 对象（cast 为 RunInteractionHandler）即可。
function makeMockInteraction(): RunInteractionHandler {
  return {
    startChestDecrypt: vi.fn(),
    findNearestNote: vi.fn(() => null),
    startReadNote: vi.fn(),
    closeNoteOverlay: vi.fn(),
  } as unknown as RunInteractionHandler;
}

describe('RunTestHooks.giveVaultKeyForTest (spec §10.1)', () => {
  it('adds 1 material.vaultKey to inventory', () => {
    const state = makeMockState();
    const hooks = new RunTestHooks(state, makeMockInteraction());

    expect(state.inventory.has('material.vaultKey')).toBe(false);
    hooks.giveVaultKeyForTest();
    expect(state.inventory.quantity('material.vaultKey')).toBe(1);

    hooks.giveVaultKeyForTest();
    expect(state.inventory.quantity('material.vaultKey')).toBe(2);
  });
});

describe('RunTestHooks.movePlayerToForTest (语义别名解析)', () => {
  it("'entrance'/'exit'/'vault' 别名解析为 manifest 对应房间中心", () => {
    const state = makeMockState();
    const hooks = new RunTestHooks(state, makeMockInteraction());

    const entrance = state.manifest.rooms.find(
      (r) => r.id === state.manifest.entranceRoomId,
    )!;
    const exit = state.manifest.rooms.find(
      (r) => r.id === state.manifest.exitRoomId,
    )!;
    const vault = state.manifest.rooms.find(
      (r) => r.id === state.manifest.vaultRoomId,
    )!;

    hooks.movePlayerToForTest('entrance');
    expect(state.playerX).toBeCloseTo(
      entrance.bounds.x + entrance.bounds.width / 2,
      5,
    );
    expect(state.playerY).toBeCloseTo(
      entrance.bounds.y + entrance.bounds.height / 2,
      5,
    );

    hooks.movePlayerToForTest('exit');
    expect(state.playerX).toBeCloseTo(
      exit.bounds.x + exit.bounds.width / 2,
      5,
    );

    hooks.movePlayerToForTest('vault');
    expect(state.playerX).toBeCloseTo(
      vault.bounds.x + vault.bounds.width / 2,
      5,
    );
  });

  it('playerSprite.setPosition 同步被调用', () => {
    const state = makeMockState();
    const hooks = new RunTestHooks(state, makeMockInteraction());
    hooks.movePlayerToForTest('exit');
    expect(state.playerSprite?.setPosition).toHaveBeenCalled();
  });
});

describe('RunTestHooks 摘要查询方法返回正确结构', () => {
  it('getInventorySummaryForTest / getCombatSummaryForTest / getVaultStateForTest 返回 shape', () => {
    const state = makeMockState();
    const hooks = new RunTestHooks(state, makeMockInteraction());

    // 给背包加 1 把钥匙 + 1 件其他物品，验证 items/vaultKey 字段
    state.inventory.add('material.vaultKey', 1);
    state.inventory.add('material.chalkStub', 3);

    const inv = hooks.getInventorySummaryForTest();
    expect(inv).toEqual({
      items: { 'material.vaultKey': 1, 'material.chalkStub': 3 },
      vaultKey: 1,
    });

    const combat = hooks.getCombatSummaryForTest();
    expect(combat).toEqual({
      enemyCount: expect.any(Number),
      duplicateCount: expect.any(Number),
      farRoomCount: expect.any(Number),
    });
    expect(combat.enemyCount).toBeGreaterThanOrEqual(0);
    expect(combat.duplicateCount).toBe(0); // 初始无复制体

    const vault = hooks.getVaultStateForTest();
    expect(vault).toEqual({ doorUnlocked: false, chestsOpened: 0 });
  });

  it('getExploredCellsForTest 返回 exploredCells 数组副本', () => {
    const state = makeMockState();
    state.exploredCells.add(0);
    state.exploredCells.add(7);
    state.exploredCells.add(12);
    const hooks = new RunTestHooks(state, makeMockInteraction());

    const cells = hooks.getExploredCellsForTest();
    expect(cells.sort((a, b) => a - b)).toEqual([0, 7, 12]);
    // 副本独立性：修改返回值不影响原 Set
    cells.push(99);
    expect(state.exploredCells.has(99)).toBe(false);
  });
});

describe('RunTestHooks.spawnNoteForTest / movePlayerToNoteForTest (spec §11)', () => {
  it('spawnNoteForTest 在 manifest.notes 追加新纸条 + noteHitAreas 注册 zone', () => {
    const state = makeMockState();
    const initialNoteCount = state.manifest.notes.length;
    const hooks = new RunTestHooks(state, makeMockInteraction());

    hooks.spawnNoteForTest(state.manifest.entranceRoomId);

    // manifest.notes 长度 +1
    expect(state.manifest.notes.length).toBe(initialNoteCount + 1);
    // noteHitAreas 在 mock state 中初始为空 Map（未调 createNoteInteractions），
    // spawnNoteForTest 仅注册 1 个新 zone → size = 1
    expect(state.noteHitAreas.size).toBe(1);
    // scene.add.zone 被调用
    expect(state.scene.add.zone).toHaveBeenCalled();
  });

  it('movePlayerToNoteForTest 把玩家瞬移到 manifest.notes[0] 位置', () => {
    const state = makeMockState();
    const hooks = new RunTestHooks(state, makeMockInteraction());

    // 至少有一张纸条（generateForgottenSanityMap 调用 distributeNotes 保证 2-5 张）
    if (state.manifest.notes.length === 0) {
      // 极端种子退化路径：注入一张确保 movePlayerToNoteForTest 有目标
      hooks.spawnNoteForTest(state.manifest.entranceRoomId);
    }

    const firstNote = state.manifest.notes[0]!;
    const expectedX = firstNote.bounds.x + 24;
    const expectedY = firstNote.bounds.y + 24;

    hooks.movePlayerToNoteForTest();
    expect(state.playerX).toBeCloseTo(expectedX, 5);
    expect(state.playerY).toBeCloseTo(expectedY, 5);
  });
});
