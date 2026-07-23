// src/forgottenSanity/ForgottenSanityScene.ts
// 被遗忘的理智对局场景：接线 Plan 6 的 HUD + Minimap + RedEdgeFogOverlay + SettlementScreen + MobileControls，
// 并保留 Plan 1 的占位文案与"放弃返回枢纽"按钮（向后兼容 forgotten-sanity-scenes.test.ts）。
// 普攻路由：unarmed → Plan 3 CombatManager.playerAttack（弱拳 fallback）；其他武器 → Plan 4 WeaponCombatAdapter。
// spec §1.2 / §1.3 / §5.10 / §9.x / §11.x，plan 6 Task 11。
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH, getSceneDebugState } from '../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';
import { ForgottenSanityHUD, type HudSnapshot } from './ui/ForgottenSanityHUD';
import { Minimap, type MinimapUpdate } from './ui/Minimap';
import { PauseMenu } from './ui/PauseMenu';
import { RedEdgeFogOverlay } from './ui/RedEdgeFogOverlay';
import { SettlementScreen, type SettlementOutcome } from './ui/SettlementScreen';
import { MobileControls } from './ui/MobileControls';
import type { Inventory } from './loot/Inventory';
import type { CombatManager } from './combat/CombatManager';             // Plan 3：空手弱拳 fallback
import type { WeaponCombatAdapter } from './weapons/WeaponCombatAdapter'; // Plan 4：装备武器普攻
import type { Vec2 } from './combat/Enemy';                              // 共享方向类型
import { WallHitRenderer } from './combat/WallHitRenderer';              // Task 6 (#4)：撞墙粒子渲染
import { UNARMED_ID, type Loadout } from './meta/LoadoutManager';        // unarmed 路由常量 + loadout 类型
import { ForgottenSanityRunController } from './ForgottenSanityRunController';

const ABORT_BUTTON_Y = GAME_HEIGHT / 2 + 120;

/**
 * ForgottenSanityScene 测试钩子接口（plan 2026-07-19 Task 1）。
 * 仅在 DEV / test 环境挂载到 window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__，
 * 供 E2E 与手动 QA 驱动对局状态（精英怪击败、暂停、仓库钥匙、宝箱 spawn 等）。
 *
 * 当前 task 仅暴露钩子壳并返回占位值；完整 *ForTest 实现见 Task 23。
 */
export interface ForgottenSanityTestHooks {
  __testTriggerEliteDefeat(): void;
  __testGiveVaultKey(): void;
  __testMovePlayerToVaultDoor(): void;
  __testSpawnChest(roomId: string, isVaultChest: boolean): void;
  __testGetInventorySummary(): { items: Record<string, number>; vaultKey: number };
  __testGetCombatSummary(): { enemyCount: number; duplicateCount: number; farRoomCount: number };
  __testGetVaultState(): { doorUnlocked: boolean; chestsOpened: number };
  __testGetExploredCells(): number[];
  __testMovePlayerTo(roomId: string): void;
  __testTogglePause(): void;
  __testSpawnNote(roomId: string): void;
  __testGetNoteState(): { nextSequentialIndex: number; readThisRun: string[] };
  __testReadNearestNote(): boolean;
  __testIsNoteOverlayVisible(): boolean;
  __testMovePlayerToNote(): void;
  __testForceNotesState(nextSequentialIndex: number): void;
}

declare global {
  interface Window {
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: ForgottenSanityTestHooks;
  }
}

export class ForgottenSanityScene extends Phaser.Scene {
  private hud: ForgottenSanityHUD | null = null;
  private minimap: Minimap | null = null;
  private fogOverlay: RedEdgeFogOverlay | null = null;
  private settlement: SettlementScreen | null = null;
  private mobile: MobileControls | null = null;
  private isMobile = false;
  // ── 普攻路由依赖（由 setCombatDeps / setCurrentLoadout 注入）──
  private combatManager: CombatManager | null = null;
  private weaponAdapter: WeaponCombatAdapter | null = null;
  private currentLoadout: Loadout | null = null;
  private pendingBodyMarkers: MinimapUpdate['bodyMarkers'][number][] = [];
  // 4.4: 当前可见的 toast 文本（durationMs 到期后从数组中移除并 destroy）
  private toasts: Phaser.GameObjects.Text[] = [];
  // 对局装配器（create 时若真实 Phaser API 可用则实例化；mock 测试环境跳过）
  private runController: ForgottenSanityRunController | null = null;
  // Task 6 (#4): 撞墙粒子渲染器（与 CombatManager.wallHitParticles 同步）
  private wallHitRenderer: WallHitRenderer | null = null;
  // 暂停状态（Task 1 简单实现：仅切换布尔；Task 14 引入 PauseMenu 时扩展）
  private paused = false;
  // M8 ESC 暂停菜单（plan 2026-07-19 Task 14）
  private pauseMenu: PauseMenu | null = null;

  public constructor() {
    super('ForgottenSanityScene');
  }

  public create(): void {
    // 显式初始化暂停状态（测试环境通过 Object.create(prototype) 绕过构造器，
    // 类字段初始化器不会执行，故在此重置以确保 isPaused() 初始返回 false）
    this.paused = false;
    // 4.4: 同理，toasts 字段初始化器在 Object.create 绕过构造器时不执行，
    // 需在 create() 显式重置，否则 showToast 调用会因 this.toasts 为 undefined 而崩溃。
    this.toasts = [];
    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);
    this.cameras.main.setBounds(0, 0, 5000, 4000);

    // Plan 1 占位文案 + 放弃返回枢纽按钮（保留以维持 forgotten-sanity-scenes.test.ts 向后兼容）
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '被遗忘的理智——待实现', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '36px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);

    const abortButton = this.add
      .rectangle(GAME_WIDTH / 2, ABORT_BUTTON_Y, 260, 56, UI_THEME.colors.accent, UI_THEME.alpha.controlActive)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(abortButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, ABORT_BUTTON_Y, '放弃返回枢纽', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      }),
    ).setOrigin(0.5);
    abortButton.on('pointerdown', () => this.scene.start('ForgottenSanityHubScene'));

    // ── Plan 6 UI 接线 ──
    this.hud = new ForgottenSanityHUD(this);
    this.hud.create();

    this.minimap = new Minimap(this);
    this.minimap.create();

    this.fogOverlay = new RedEdgeFogOverlay(this);
    this.fogOverlay.create();

    this.settlement = new SettlementScreen(this, {
      onConfirm: () => this.scene.start('ForgottenSanityHubScene'),
    });
    this.settlement.create();

    this.isMobile = this.sys.game.device.input.touch;
    if (this.isMobile) {
      this.mobile = new MobileControls(this, {
        onBasicAttack: () => this.emitCombatAction('basicAttack'),
        onUltimate:    () => this.emitCombatAction('ultimate'),
        onInteract:    () => this.emitCombatAction('interact'),
        onConsumable:  () => this.emitCombatAction('consumable'),
      });
      this.mobile.create();
    }

    // ESC 处理：优先关闭大地图，否则切换暂停菜单（plan Task 14 / M8）
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => {
        this.handleEsc();
      });
    }

    // M8 暂停菜单（plan 2026-07-19 Task 14）
    this.pauseMenu = new PauseMenu(
      this,
      () => this.togglePause(),
      () => this.runController?.abandonRun(),
    );

    // 装配对局 controller（feature-detection：mock 测试环境无 textures/add.zone 跳过）
    // 用 unknown cast 避免 TS 把 Phaser 类型当作 always-defined。
    const addZone = (this.add as unknown as { zone?: unknown }).zone;
    const textures = (this as unknown as { textures?: { exists?: (k: string) => boolean } }).textures;
    if (typeof addZone === 'function' && textures?.exists?.('floor.tile') === true) {
      this.runController = new ForgottenSanityRunController(this);
    }

    // Task 6 (#4): 撞墙粒子渲染器（feature-detection：mock 测试环境无 add.rectangle 跳过创建）
    const addRectangle = (this.add as unknown as { rectangle?: unknown }).rectangle;
    if (typeof addRectangle === 'function') {
      this.wallHitRenderer = new WallHitRenderer(this);
    }

    // ── 测试钩子（仅 DEV / test 环境挂载到 window）──
    // 所有 *ForTest 方法已在 ForgottenSanityRunController 门面上类型化暴露
    // （spec#5 §5.1 拆分后门面单行委托 RunTestHooks）；runController 为 null 时
    // （mock 测试环境）返回占位值，与原 duck-typing 行为一致。
    if (import.meta.env.DEV || process.env.NODE_ENV === 'test') {
      const hooks: ForgottenSanityTestHooks = {
        __testTriggerEliteDefeat: () => this.runController?.handleEliteDefeated(),
        __testGiveVaultKey: () => this.runController?.giveVaultKeyForTest(),
        __testMovePlayerToVaultDoor: () => this.runController?.movePlayerToVaultDoorForTest(),
        __testSpawnChest: (roomId, isVaultChest) => this.runController?.spawnChestForTest(roomId, isVaultChest),
        __testGetInventorySummary: () =>
          this.runController?.getInventorySummaryForTest() ?? { items: {}, vaultKey: 0 },
        __testGetCombatSummary: () =>
          this.runController?.getCombatSummaryForTest() ?? { enemyCount: 0, duplicateCount: 0, farRoomCount: 0 },
        __testGetVaultState: () =>
          this.runController?.getVaultStateForTest() ?? { doorUnlocked: false, chestsOpened: 0 },
        __testGetExploredCells: () => this.runController?.getExploredCellsForTest() ?? [],
        __testMovePlayerTo: (roomId) => this.runController?.movePlayerToForTest(roomId),
        __testSpawnNote: (roomId) => this.runController?.spawnNoteForTest(roomId),
        __testGetNoteState: () =>
          this.runController?.getNoteStateForTest() ?? { nextSequentialIndex: 0, readThisRun: [] },
        __testReadNearestNote: () => this.runController?.readNearestNoteForTest() ?? false,
        __testIsNoteOverlayVisible: () => this.runController?.isNoteOverlayActiveForTest() ?? false,
        __testMovePlayerToNote: () => this.runController?.movePlayerToNoteForTest(),
        __testForceNotesState: (nextSequentialIndex) =>
          this.runController?.forceNotesStateForTest(nextSequentialIndex),
        __testTogglePause: () => this.togglePause(),
      };
      window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ = hooks;
    }

    // Task 23: 标记 forgottenSanity 调试子状态（供 E2E 检测 run 场景就绪）。
    // 仅写 scene 字段；inventory/combat/exploredCells 等由 *ForTest 测试钩子按需读取。
    getSceneDebugState().forgottenSanity = { scene: 'run' };
    // feature-detection：mock 测试环境（Object.create 绕过构造器）无 events.once
    if (typeof this.events?.once === 'function') {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        const state = getSceneDebugState();
        state.forgottenSanity = { scene: 'none' };
      });
    }
  }

  /**
   * 切换对局暂停状态（plan 2026-07-19 Task 14 / M8）。
   * 暂停时冻结 combatManager + 显示 PauseMenu；恢复时反向。
   */
  public togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.combatManager?.setFrozen(true);
      this.pauseMenu?.show();
    } else {
      this.combatManager?.setFrozen(false);
      this.pauseMenu?.hide();
    }
  }

  /** 当前是否处于暂停状态（供测试钩子 / 后续 PauseMenu 读取）。 */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * ESC 行为优先级（plan Task 14 / spec §9.2 / spec §6）：
   * 1. note overlay 打开时 ESC 优先关闭，不落入 PauseMenu（spec §6）
   * 2. 大地图可见 → 关闭大地图（不暂停，消费 ESC）
   * 3. 否则 → togglePause()
   */
  public handleEsc(): void {
    // spec §6: note overlay 打开时 ESC 优先关闭，不落入 PauseMenu
    if (this.runController?.isNoteOverlayActiveForTest() === true) {
      this.runController.closeNoteOverlayForTest();
      return;
    }
    if (this.minimap?.isBigMapOpen()) {
      this.minimap.toggleBigMap();
      return;
    }
    this.togglePause();
  }

  public update(_time: number, _delta: number): void {
    // 暂停时跳过所有 update（plan Task 14 / M8）
    if (this.paused) return;
    this.minimap?.pollKeyboard();
    // 红边雾战跟随玩家
    if (this.fogOverlay?.isRedEdgeFogActive()) {
      const pos = this.getPlayerWorldPosition();
      this.fogOverlay.update(pos.x, pos.y);
    }
    // 注：普攻不在每帧自动触发；由攻击输入 handler（键鼠普攻键 / 摇杆 / 移动端
    // MobileControls.onBasicAttack）在玩家按下普攻时调用 performPlayerAttack(direction, time)。
    if (this.runController !== null) {
      this.runController.update(_time, _delta);
    }
    // Task 6 (#4): 同步撞墙粒子视图（combatManager 由 runController 装配时注入 setCombatDeps）
    if (this.wallHitRenderer !== null && this.combatManager !== null) {
      this.wallHitRenderer.sync(this.combatManager.getWallHitParticles());
    }
  }

  /** M8 暂停菜单实例 getter（供测试断言菜单项 / 设置子菜单状态）。 */
  public getPauseMenu(): PauseMenu | null {
    return this.pauseMenu;
  }

  /** M8 设置子菜单 — 音效开关状态（供测试断言）。 */
  public getAudioEnabled(): boolean {
    return this.pauseMenu?.isAudioEnabled() ?? true;
  }

  /** Minimap getter（供测试断言大地图开关状态）。 */
  public getMinimap(): Minimap | null {
    return this.minimap;
  }

  // ── 普攻路由（unarmed vs 武器）──
  // 'unarmed' → Plan 3 CombatManager.playerAttack()（5 伤弱拳 fallback，无 CD）
  //   （Plan 4 的 WeaponId 联合类型不含 'unarmed'，故空手必须走 Plan 3 fallback）
  // 其他武器 → Plan 4 WeaponCombatAdapter.performAttack(direction, timeMs)
  //   （受武器 CD/大招约束）
  public performPlayerAttack(direction: Vec2, timeMs: number): void {
    const weaponId = this.currentLoadout?.weaponId ?? UNARMED_ID;
    if (weaponId === UNARMED_ID) {
      this.combatManager?.playerAttack(direction);
    } else {
      this.weaponAdapter?.performAttack(direction, timeMs);
    }
  }

  /** 注入战斗依赖（Plan 3 CombatManager + Plan 4 WeaponCombatAdapter），由上层 bootstrap 调用。 */
  public setCombatDeps(combatManager: CombatManager, weaponAdapter: WeaponCombatAdapter): void {
    this.combatManager = combatManager;
    this.weaponAdapter = weaponAdapter;
  }

  /** 设置当前对局 loadout，performPlayerAttack 据此路由 unarmed vs 武器。 */
  public setCurrentLoadout(loadout: Loadout): void {
    this.currentLoadout = loadout;
  }

  // ── Plan 6 接线 API（供 CombatManager/MapRenderer 等上层调用）──

  public updateHud(snapshot: HudSnapshot): void {
    this.hud?.update(snapshot);
  }

  public updateMinimap(update: MinimapUpdate): void {
    this.minimap?.update(update);
  }

  /** CombatCallbacks.onMarkBodyOnMinimap → MinimapUpdate.bodyMarkers 桥接（plan 3 → plan 6） */
  public markBodyOnMinimap(bodyId: string, x: number, y: number): void {
    // 上层在每帧组装 MinimapUpdate 时应包含此 body 标记；
    // 此处提供一个便捷的累积缓存，便于上层 updateMinimap 时读取。
    this.pendingBodyMarkers.push({ bodyId, x, y });
  }

  /** 读取累积的 body 标记缓存（上层 updateMinimap 时合并进 MinimapUpdate.bodyMarkers）。 */
  public consumePendingBodyMarkers(): MinimapUpdate['bodyMarkers'][number][] {
    const out = this.pendingBodyMarkers;
    this.pendingBodyMarkers = [];
    return out;
  }

  /**
   * 4.4 vault door toast：在屏幕上方显示一条消息，durationMs 后自动 destroy。
   * 默认 2000ms。供 ForgottenSanityRunController.tryUnlockVaultDoor 在「已解锁」/
   * 「需要仓库钥匙」分支调用。多个 toast 可同时存在并各自计时移除。
   */
  public showToast(message: string, durationMs: number = 2000): void {
    const text = applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, 100, message, {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '16px',
      }),
    )
      .setOrigin(0.5)
      .setDepth(2000);
    this.toasts.push(text);
    this.time.delayedCall(durationMs, () => {
      text.destroy();
      const idx = this.toasts.indexOf(text);
      if (idx >= 0) {
        this.toasts.splice(idx, 1);
      }
    });
  }

  /** 当前可见的 toast 列表（供测试断言 auto-dismiss 行为）。 */
  public getVisibleToasts(): readonly Phaser.GameObjects.Text[] {
    return this.toasts;
  }

  public triggerRedEdgeKill(playerX: number, playerY: number): void {
    this.fogOverlay?.activate(playerX, playerY);
  }

  public isRedEdgeFogActive(): boolean {
    return this.fogOverlay?.isRedEdgeFogActive() ?? false;
  }

  public runEvacuationSettlement(inventory: Inventory, baseline: number): SettlementOutcome {
    const outcome = this.settlement?.showEvacuation(inventory, baseline);
    if (outcome?.kind === 'evacuated') {
      this.fogOverlay?.deactivate(); // 撤离成功清理红边雾战
    }
    return outcome ?? { kind: 'refused', totalValue: inventory.totalSanityValue(), baseline };
  }

  public runDeathSettlement(): SettlementOutcome {
    this.fogOverlay?.deactivate(); // 死亡清理红边雾战
    return this.settlement?.showDeath() ?? { kind: 'dead' };
  }

  public destroyPlan6Ui(): void {
    this.runController?.destroy();
    this.runController = null;
    this.wallHitRenderer?.destroy();
    this.wallHitRenderer = null;
    this.hud?.destroy();
    this.minimap?.destroy();
    this.fogOverlay?.destroy();
    this.settlement?.destroy();
    this.mobile?.destroy();
  }

  private emitCombatAction(action: string): void {
    this.events.emit('forgotten-sanity-combat-action', action);
  }

  private getPlayerWorldPosition(): { x: number; y: number } {
    // 由 plan 3 的 PlayerCombat/CombatManager 提供；此处回退到相机中心
    const cam = this.cameras.main;
    return { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
  }
}
