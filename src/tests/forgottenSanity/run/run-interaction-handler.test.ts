// src/tests/forgottenSanity/run/run-interaction-handler.test.ts
// RunInteractionHandler 子模块单测（spec#5 §7.1 / plan#5 Task 15）。
// RunInteractionHandler 仅依赖 RunSharedState + RunInteractionCallbacks，无 Phaser runtime import，
// 故可用真实 Inventory/PlayerCombat/CombatManager + mock scene/renderer/noteOverlay 注入。
//
// 覆盖 spec §6 / §10.1 / §1.3：onInteractPressed 优先级链路（note overlay → chest → note →
// vault door → exit）+ tryUnlockVaultDoor 钥匙消耗/已解锁/缺钥匙三分支。
// onInteractPressed / tryUnlockVaultDoor 为 private，通过 `as unknown as` 反射调用（项目特有
// E2E 可观察性模式，见 AGENTS.md「as unknown as 模式」）。
// findNearestChest / findNearestNote 为 public，用 vi.spyOn 隔离地图布局依赖。
import { describe, expect, it, vi } from 'vitest';

import { RunInteractionHandler } from '../../../forgottenSanity/run/RunInteractionHandler';
import type { RunSharedState } from '../../../forgottenSanity/run/runTypes';
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
// mock scene.add.zone / scene.showToast / renderer / noteOverlay。
// 玩家初始位置可由 caller 通过 playerX/playerY 覆盖，用于距离判定测试。
// ───────────────────────────────────────────────────────────────────────────
function makeMockState(overrides?: {
  playerX?: number;
  playerY?: number;
  vaultDoorX?: number;
  vaultDoorY?: number;
  exitX?: number;
  exitY?: number;
  vaultUnlocked?: boolean;
}): RunSharedState {
  const manifest = generateForgottenSanityMap(12345);
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
  const unlockVaultDoor = vi.fn();
  const renderer = {
    getCollisionZones: () => [],
    vaultUnlocked: overrides?.vaultUnlocked ?? false,
    unlockVaultDoor,
    createVaultDoorInteraction: vi.fn(() => ({ x: 0, y: 0 })),
  } as unknown as ForgottenSanityMapRenderer;
  const noteOverlay = {
    show: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
    create: vi.fn(),
    destroy: vi.fn(),
  } as unknown as NoteOverlay;
  const showToast = vi.fn();
  const scene = {
    add: {
      zone: vi.fn(() => ({ setInteractive: vi.fn(() => ({})) })),
    },
    showToast,
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
    playerX: overrides?.playerX ?? entrance.spawnPoint.x,
    playerY: overrides?.playerY ?? entrance.spawnPoint.y,
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
    exitX: overrides?.exitX ?? 0,
    exitY: overrides?.exitY ?? 0,
    exitDiscovered: false,
    exitZone: null,
    vaultDoorX: overrides?.vaultDoorX ?? 0,
    vaultDoorY: overrides?.vaultDoorY ?? 0,
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

// 反射调用 private onInteractPressed
function callOnInteractPressed(handler: RunInteractionHandler): void {
  (handler as unknown as { onInteractPressed: () => void }).onInteractPressed();
}

describe('RunInteractionHandler.onInteractPressed 优先级 (spec §6 / §10.1 / §1.3)', () => {
  it('noteOverlayActive 时优先调用 closeNoteOverlay，不触发其它交互', () => {
    const state = makeMockState();
    // 强制 note overlay 激活
    state.noteOverlayActive = true;
    // 同时把 vault/exit 都放在玩家身上（确保不是因距离不足而跳过）
    state.vaultDoorX = state.playerX;
    state.vaultDoorY = state.playerY;
    state.exitX = state.playerX;
    state.exitY = state.playerY;

    const onEvacuate = vi.fn();
    const handler = new RunInteractionHandler(state, { onEvacuate });
    // spy closeNoteOverlay（public 方法）以断言被路由到
    const closeSpy = vi.spyOn(handler, 'closeNoteOverlay');

    callOnInteractPressed(handler);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    // 进入 closeNoteOverlay 分支后立即 return，不应触发撤离/解锁
    expect(onEvacuate).not.toHaveBeenCalled();
    expect(state.renderer.unlockVaultDoor).not.toHaveBeenCalled();
    // closeNoteOverlay 副作用：noteOverlayActive 翻转为 false
    expect(state.noteOverlayActive).toBe(false);
  });

  it('vault door 在范围内且持钥匙 → unlockVaultDoor 被调用且钥匙被消耗', () => {
    const state = makeMockState({
      // 玩家位于 vault door 上（距离 0）
      playerX: 500,
      playerY: 500,
      vaultDoorX: 500,
      vaultDoorY: 500,
      // exit 故意远离，避免误命中
      exitX: 9999,
      exitY: 9999,
    });
    // 给玩家 1 把钥匙
    state.inventory.add('material.vaultKey', 1);
    expect(state.inventory.quantity('material.vaultKey')).toBe(1);

    const onEvacuate = vi.fn();
    const handler = new RunInteractionHandler(state, { onEvacuate });
    // 隔离地图布局依赖：强制 findNearestChest / findNearestNote 返回 null
    vi.spyOn(handler, 'findNearestChest').mockReturnValue(null);
    vi.spyOn(handler, 'findNearestNote').mockReturnValue(null);

    callOnInteractPressed(handler);

    // 钥匙被消耗
    expect(state.inventory.quantity('material.vaultKey')).toBe(0);
    // renderer.unlockVaultDoor 被调用
    expect(state.renderer.unlockVaultDoor).toHaveBeenCalledTimes(1);
    // 不应触发撤离
    expect(onEvacuate).not.toHaveBeenCalled();
  });

  it('vault door 在范围内但无钥匙 → showToast("需要仓库钥匙")，不消耗、不解锁、不撤离', () => {
    const state = makeMockState({
      playerX: 500,
      playerY: 500,
      vaultDoorX: 500,
      vaultDoorY: 500,
      exitX: 9999,
      exitY: 9999,
    });
    // 不给钥匙
    expect(state.inventory.has('material.vaultKey')).toBe(false);

    const showToast = state.scene.showToast as unknown as ReturnType<typeof vi.fn>;
    const onEvacuate = vi.fn();
    const handler = new RunInteractionHandler(state, { onEvacuate });
    vi.spyOn(handler, 'findNearestChest').mockReturnValue(null);
    vi.spyOn(handler, 'findNearestNote').mockReturnValue(null);

    callOnInteractPressed(handler);

    expect(showToast).toHaveBeenCalledWith('需要仓库钥匙');
    expect(state.renderer.unlockVaultDoor).not.toHaveBeenCalled();
    expect(onEvacuate).not.toHaveBeenCalled();
  });

  it('exit 在范围内但 vault door 超出范围 → 触发 onEvacuate 回调', () => {
    const state = makeMockState({
      playerX: 1000,
      playerY: 1000,
      // vault door 故意远离（> EXIT_INTERACT_DISTANCE=60）
      vaultDoorX: 9999,
      vaultDoorY: 9999,
      // exit 在玩家身上
      exitX: 1000,
      exitY: 1000,
    });

    const onEvacuate = vi.fn();
    const handler = new RunInteractionHandler(state, { onEvacuate });
    vi.spyOn(handler, 'findNearestChest').mockReturnValue(null);
    vi.spyOn(handler, 'findNearestNote').mockReturnValue(null);

    callOnInteractPressed(handler);

    expect(onEvacuate).toHaveBeenCalledTimes(1);
    expect(state.renderer.unlockVaultDoor).not.toHaveBeenCalled();
  });

  it('vault door 与 exit 均在范围内 → vault 优先（onEvacuate 不被调用）', () => {
    // 优先级链路：vault door 分支在 exit 之前，故同时命中时只走 vault 解锁
    const state = makeMockState({
      playerX: 1000,
      playerY: 1000,
      vaultDoorX: 1000,
      vaultDoorY: 1000,
      exitX: 1000,
      exitY: 1000,
    });
    // 给钥匙以走 unlock 分支
    state.inventory.add('material.vaultKey', 1);

    const onEvacuate = vi.fn();
    const handler = new RunInteractionHandler(state, { onEvacuate });
    vi.spyOn(handler, 'findNearestChest').mockReturnValue(null);
    vi.spyOn(handler, 'findNearestNote').mockReturnValue(null);

    callOnInteractPressed(handler);

    expect(state.renderer.unlockVaultDoor).toHaveBeenCalledTimes(1);
    expect(onEvacuate).not.toHaveBeenCalled();
  });
});

describe('RunInteractionHandler 距离判定方法', () => {
  it('distanceToVaultDoor / distanceToExit 返回玩家到对应点的欧氏距离', () => {
    const state = makeMockState({
      playerX: 100,
      playerY: 200,
      vaultDoorX: 100,
      vaultDoorY: 500, // 距离 300
      exitX: 220,
      exitY: 200, // 距离 120
    });
    const handler = new RunInteractionHandler(state, { onEvacuate: () => {} });

    expect(handler.distanceToVaultDoor()).toBeCloseTo(300, 5);
    expect(handler.distanceToExit()).toBeCloseTo(120, 5);
  });
});
