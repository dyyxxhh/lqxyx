// src/forgottenSanity/run/runTypes.ts
// 对局装配器的共享状态契约（spec#5 §5.1 拆分）。
// RunLifecycle 在构造器中初始化全部字段，RunInteractionHandler / RunTestHooks
// 通过此接口按引用读写共享状态，避免状态重复持有。
import type Phaser from 'phaser';

import type { PlayerCombat } from '../combat/PlayerCombat';
import type { CombatManager } from '../combat/CombatManager';
import type { ForgottenSanityMapRenderer } from '../map/ForgottenSanityMapRenderer';
import type { Rng } from '../map/ForgottenSanityMapGenerator';
import type { ForgottenSanityMapManifest } from '../map/forgottenSanityMapState';
import type { WeaponCombatAdapter } from '../weapons/WeaponCombatAdapter';
import type { WeaponCooldowns } from '../weapons/WeaponCooldowns';
import type { Inventory } from '../loot/Inventory';
import type { ChestDecrypt } from '../loot/ChestDecrypt';
import type { ForgottenSanityNotesState } from '../state/forgottenSanityState';
import type { NoteOverlay } from '../ui/NoteOverlay';
import type { getUpgradeEffects } from '../meta/UpgradeManager';
import type { Loadout } from '../meta/LoadoutManager';
import type { ForgottenSanityScene } from '../ForgottenSanityScene';

/**
 * 对局共享状态。由 RunLifecycle 在构造器 14 步中逐字段初始化，
 * 三个子模块（Lifecycle / InteractionHandler / TestHooks）通过引用访问。
 * readonly 字段在构造器内一次性赋值；其余字段可被多个子模块读写。
 */
export interface RunSharedState {
  // ── 只读依赖（构造器内创建并固定）──
  readonly scene: ForgottenSanityScene & Phaser.Scene;
  readonly renderer: ForgottenSanityMapRenderer;
  readonly manifest: ForgottenSanityMapManifest;
  readonly rng: Rng;
  readonly player: PlayerCombat;
  readonly inventory: Inventory;
  readonly combatManager: CombatManager;
  readonly weaponCooldowns: WeaponCooldowns;
  readonly weaponAdapter: WeaponCombatAdapter;
  readonly loadout: Loadout;
  readonly upgradeEffects: ReturnType<typeof getUpgradeEffects>;

  // ── 玩家世界坐标 / 朝向 / 运动状态（PlayerCombat 不存位置）──
  playerX: number;
  playerY: number;
  facingX: number;
  facingY: number;
  isRunning: boolean;
  isMoving: boolean;

  // ── 击退状态（spec §5.10 杨云红边冲撞命中后的 200ms 推开效果）──
  knockbackVx: number;
  knockbackVy: number;
  knockbackRemainingMs: number;

  // ── fistDash 锁定向冲刺状态（spec §3.2: 0.3s / 250px / 833px/s / 撞墙即停）──
  dashLockState: { activeMs: number; dirX: number; dirY: number } | null;

  // ── 雾战（spec §9.2）：玩家走过的 cell 永久点亮 ──
  readonly exploredCells: Set<number>;

  // ── 宝箱交互 ──
  readonly chestDecrypts: Map<string, ChestDecrypt>;
  readonly openedChests: Set<string>;
  activeChestId: string | null;
  readonly chestHitAreas: Map<string, Phaser.GameObjects.Zone>;

  // ── 遗落的纸条交互（spec §6 / §7）──
  readonly noteHitAreas: Map<string, Phaser.GameObjects.Zone>;
  readonly readNoteInstancesThisRun: Map<string, number>;
  noteOverlay: NoteOverlay | null;
  noteOverlayActive: boolean;
  notesState: ForgottenSanityNotesState;

  // ── 撤离点 ──
  exitX: number;
  exitY: number;
  exitDiscovered: boolean;
  exitZone: Phaser.GameObjects.Zone | null;

  // ── spec §10.1: vault door 交互 ──
  vaultDoorX: number;
  vaultDoorY: number;

  // ── 计时 ──
  elapsedMs: number;
  readonly startTime: number;

  // ── 输入（构造器步骤 15 创建并固定）──
  readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  readonly keyJ: Phaser.Input.Keyboard.Key;
  readonly keyK: Phaser.Input.Keyboard.Key;
  readonly keyH: Phaser.Input.Keyboard.Key;
  readonly keyShift: Phaser.Input.Keyboard.Key;

  // ── 玩家精灵 / 撤离点 hitArea ──
  playerSprite: Phaser.GameObjects.Rectangle | null;
}

/**
 * RunInteractionHandler 与 RunLifecycle 之间的跨模块回调。
 * 用于打破构造期循环依赖：interaction 在 lifecycle 构造中期创建，
 * 通过回调在运行期反向调用 lifecycle.runEvacuation()。
 */
export interface RunInteractionCallbacks {
  /** 玩家在撤离点按下交互键时触发，由 lifecycle 处理撤离结算。 */
  onEvacuate: () => void;
}
