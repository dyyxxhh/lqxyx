// src/tombraid/TombRaidScene.ts
// 摸金模式对局场景：接线 Plan 6 的 HUD + Minimap + RedEdgeFogOverlay + SettlementScreen + MobileControls，
// 并保留 Plan 1 的占位文案与"放弃返回枢纽"按钮（向后兼容 tomb-raid-scenes.test.ts）。
// 普攻路由：unarmed → Plan 3 CombatManager.playerAttack（弱拳 fallback）；其他武器 → Plan 4 WeaponCombatAdapter。
// spec §1.2 / §1.3 / §5.10 / §9.x / §11.x，plan 6 Task 11。
import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';
import { TombRaidHUD, type HudSnapshot } from './ui/TombRaidHUD';
import { Minimap, type MinimapUpdate } from './ui/Minimap';
import { RedEdgeFogOverlay } from './ui/RedEdgeFogOverlay';
import { SettlementScreen, type SettlementOutcome } from './ui/SettlementScreen';
import { MobileControls } from './ui/MobileControls';
import type { Inventory } from './loot/Inventory';
import type { CombatManager } from './combat/CombatManager';             // Plan 3：空手弱拳 fallback
import type { WeaponCombatAdapter } from './weapons/WeaponCombatAdapter'; // Plan 4：装备武器普攻
import type { Vec2 } from './combat/Enemy';                              // 共享方向类型
import { UNARMED_ID, type Loadout } from './meta/LoadoutManager';        // unarmed 路由常量 + loadout 类型

const ABORT_BUTTON_Y = GAME_HEIGHT / 2 + 120;

export class TombRaidScene extends Phaser.Scene {
  private hud: TombRaidHUD | null = null;
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

  public constructor() {
    super('TombRaidScene');
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(UI_THEME.colors.surface);
    this.cameras.main.setBounds(0, 0, 5000, 4000);

    // Plan 1 占位文案 + 放弃返回枢纽按钮（保留以维持 tomb-raid-scenes.test.ts 向后兼容）
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 1)
      .setOrigin(0.5);

    applyPixelTextStyle(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '摸金对局——待实现', {
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
    abortButton.on('pointerdown', () => this.scene.start('TombRaidHubScene'));

    // ── Plan 6 UI 接线 ──
    this.hud = new TombRaidHUD(this);
    this.hud.create();

    this.minimap = new Minimap(this);
    this.minimap.create();

    this.fogOverlay = new RedEdgeFogOverlay(this);
    this.fogOverlay.create();

    this.settlement = new SettlementScreen(this, {
      onConfirm: () => this.scene.start('TombRaidHubScene'),
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

    // ESC 处理：优先关闭大地图，否则交给上层
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', () => {
        if (this.minimap?.handleEsc()) return; // 大地图开则关闭，消费 ESC
      });
    }
  }

  public update(_time: number, _delta: number): void {
    this.minimap?.pollKeyboard();
    // 红边雾战跟随玩家
    if (this.fogOverlay?.isRedEdgeFogActive()) {
      const pos = this.getPlayerWorldPosition();
      this.fogOverlay.update(pos.x, pos.y);
    }
    // 注：普攻不在每帧自动触发；由攻击输入 handler（键鼠普攻键 / 摇杆 / 移动端
    // MobileControls.onBasicAttack）在玩家按下普攻时调用 performPlayerAttack(direction, time)。
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
    this.hud?.destroy();
    this.minimap?.destroy();
    this.fogOverlay?.destroy();
    this.settlement?.destroy();
    this.mobile?.destroy();
  }

  private emitCombatAction(action: string): void {
    this.events.emit('tomb-raid-combat-action', action);
  }

  private getPlayerWorldPosition(): { x: number; y: number } {
    // 由 plan 3 的 PlayerCombat/CombatManager 提供；此处回退到相机中心
    const cam = this.cameras.main;
    return { x: cam.scrollX + cam.width / 2, y: cam.scrollY + cam.height / 2 };
  }
}
