// src/forgottenSanity/run/RunLifecycle.ts
// 对局生命周期子模块（spec#5 §5.1 拆分）。
// 职责：构造器 14 步装配（地图→渲染→升级→PlayerCombat→CombatManager→spawn→交互绑定）+
//       update 主循环 + 撤离 / 放弃 / 死亡 / 精英击杀回调 + spawn + HUD/Minimap 同步 + 销毁。
// 持有全部共享状态（implements RunSharedState），并把引用注入 InteractionHandler / TestHooks。
import Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { STAMINA_MAX } from '../combat/DamageType';
import { PlayerCombat } from '../combat/PlayerCombat';
import {
  CombatManager,
  type IsWalkableFn,
  type CombatCallbacks,
} from '../combat/CombatManager';
import {
  Enemy,
  type EnemyKind,
  type EnemyConstructorOpts,
  createEnemy,
} from '../combat/Enemy';
import { makeEnemyOpts } from '../combat/enemyDefaults';
import {
  ForgottenSanityMapRenderer,
} from '../map/ForgottenSanityMapRenderer';
import {
  generateForgottenSanityMap,
  createRng,
  type Rng,
} from '../map/ForgottenSanityMapGenerator';
import type { ForgottenSanityMapManifest } from '../map/forgottenSanityMapState';
import { rectContains } from '../map/forgottenSanityMapState';
import { WeaponCombatAdapter } from '../weapons/WeaponCombatAdapter';
import { WeaponCooldowns } from '../weapons/WeaponCooldowns';
import { getWeapon, type WeaponDef } from '../weapons/WeaponRegistry';
import { Inventory } from '../loot/Inventory';
import {
  rollLootTable,
  SILENT_ONE_LOOT_TABLE,
  YANG_YUN_RED_LOOT_TABLE,
} from '../loot/LootTable';
import {
  loadStash,
  storeStash,
} from '../meta/StashManager';
import {
  loadUpgradesState,
  loadNotesState,
} from '../state/forgottenSanityState';
import { NoteOverlay } from '../ui/NoteOverlay';
import { getUpgradeEffects } from '../meta/UpgradeManager';
import {
  consumeLoadoutFromStash,
  UNARMED_ID,
  type Loadout,
} from '../meta/LoadoutManager';
import type { ForgottenSanityScene } from '../ForgottenSanityScene';
import type { HudSnapshot } from '../ui/ForgottenSanityHUD';
import type { MinimapUpdate } from '../ui/Minimap';
// M6: 红边击杀后雾战遮罩激活期间冻结敌人 AI（2s）
import { RED_EDGE_MASK_DURATION_MS } from '../ui/RedEdgeFogOverlay';
import type { RunSharedState } from './runTypes';
import { RunInteractionHandler } from './RunInteractionHandler';
import { RunTestHooks } from './RunTestHooks';

const PLAYER_SPRITE_DEPTH = 10;
const ENEMY_SPAWN_PER_ROOM_MIN = 1;
const ENEMY_SPAWN_PER_ROOM_MAX = 3;

/**
 * 对局生命周期装配器。由 ForgottenSanityRunController（门面）实例化，
 * 负责对局的创建 / 主循环 / 销毁，并通过 RunSharedState 把状态共享给
 * InteractionHandler 与 TestHooks 两个兄弟子模块。
 */
export class RunLifecycle implements RunSharedState {
  // ── 只读依赖 ──
  public readonly scene: ForgottenSanityScene & Phaser.Scene;
  public readonly renderer: ForgottenSanityMapRenderer;
  public readonly manifest: ForgottenSanityMapManifest;
  public readonly rng: Rng;
  public readonly player: PlayerCombat;
  public readonly inventory: Inventory;
  public readonly combatManager: CombatManager;
  public readonly weaponCooldowns: WeaponCooldowns;
  public readonly weaponAdapter: WeaponCombatAdapter;
  public readonly loadout: Loadout;
  public readonly upgradeEffects: ReturnType<typeof getUpgradeEffects>;

  // ── 玩家世界坐标 / 朝向 / 运动状态 ──
  public playerX: number;
  public playerY: number;
  public facingX = 0;
  public facingY = 1; // 默认朝下
  public isRunning = false;
  public isMoving = false;

  // ── 击退状态（spec §5.10）──
  public knockbackVx = 0;
  public knockbackVy = 0;
  public knockbackRemainingMs = 0;

  // ── fistDash 锁定向冲刺状态（spec §3.2）──
  public dashLockState: { activeMs: number; dirX: number; dirY: number } | null = null;

  // ── 雾战（spec §9.2）──
  public readonly exploredCells = new Set<number>();

  // ── 宝箱交互 ──
  public readonly chestDecrypts = new Map<string, import('../loot/ChestDecrypt').ChestDecrypt>();
  public readonly openedChests = new Set<string>();
  public activeChestId: string | null = null;
  public readonly chestHitAreas = new Map<string, Phaser.GameObjects.Zone>();

  // ── 遗落的纸条交互（spec §6 / §7）──
  public readonly noteHitAreas = new Map<string, Phaser.GameObjects.Zone>();
  public readonly readNoteInstancesThisRun = new Map<string, number>();
  public noteOverlay: NoteOverlay | null = null;
  public noteOverlayActive = false;
  public notesState: import('../state/forgottenSanityState').ForgottenSanityNotesState;

  // ── 撤离点 ──
  public exitX: number;
  public exitY: number;
  public exitDiscovered = false;
  public exitZone: Phaser.GameObjects.Zone | null = null;

  // ── spec §10.1: vault door 交互 ──
  public vaultDoorX = 0;
  public vaultDoorY = 0;

  // ── 计时 ──
  public elapsedMs = 0;
  public readonly startTime: number;

  // ── 输入 ──
  public readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  public readonly keyJ: Phaser.Input.Keyboard.Key;
  public readonly keyK: Phaser.Input.Keyboard.Key;
  public readonly keyH: Phaser.Input.Keyboard.Key;
  public readonly keyShift: Phaser.Input.Keyboard.Key;

  // ── 玩家精灵 ──
  public playerSprite: Phaser.GameObjects.Rectangle | null = null;

  // ── 兄弟子模块（构造器中期 / 末尾赋值）──
  public readonly interaction: RunInteractionHandler;
  public readonly testHooks: RunTestHooks;

  // ── Combat SFX hook (wired by the scene) ──
  private onCombatSfx: ((event: string) => void) | null = null;

  /** Register a callback for combat SFX events (playerHit, enemyHit, enemyKilled, etc.). */
  public setOnCombatSfxCallback(cb: (event: string) => void): void {
    this.onCombatSfx = cb;
  }

  constructor(scene: ForgottenSanityScene & Phaser.Scene) {
    this.scene = scene;

    // 1. 生成地图（spec §2，mulberry32 种子可复现）
    const seed = (Date.now() & 0xffffffff) >>> 0;
    this.manifest = generateForgottenSanityMap(seed);
    this.rng = createRng(seed ^ 0x5a5a5a5a);

    // 2. 渲染地图
    this.renderer = new ForgottenSanityMapRenderer(this.scene);
    this.renderer.render(this.manifest);

    // 2.5 构造交互子模块（manifest/renderer 已就绪，checkWalkable 可用）。
    //     onEvacuate 回调在运行期触发，此时 runEvacuation 已绑定到本实例。
    this.interaction = new RunInteractionHandler(this, {
      onEvacuate: () => this.runEvacuation(),
    });

    // 3. 读取存档：升级效果 + 起配
    const upgrades = loadUpgradesState().state;
    this.upgradeEffects = getUpgradeEffects(upgrades.tiers);
    const stash = loadStash();
    const built = consumeLoadoutFromStash(upgrades, stash, {
      weaponId: UNARMED_ID,
      consumables: [],
    });
    this.loadout = built.loadout;
    storeStash(built.stash); // 扣除起配消耗

    // 4. 创建玩家（应用升级 maxHpBonus）
    this.player = new PlayerCombat();
    // spec §8.4 physique：+4% maxHP per tier → maxHpBonus 已含
    (this.player as unknown as { maxHp: number }).maxHp = 100 + this.upgradeEffects.maxHpBonus;
    this.player.hp = this.player.maxHp;

    // 5. 玩家初始位置 = entrance 房间 spawnPoint
    const entrance = this.manifest.rooms.find((r) => r.id === this.manifest.entranceRoomId);
    if (entrance === undefined) {
      throw new Error('entrance room not found in manifest');
    }
    this.playerX = entrance.spawnPoint.x;
    this.playerY = entrance.spawnPoint.y;

    // 6. 撤离点 = exit 房间中心
    const exitRoom = this.manifest.rooms.find((r) => r.id === this.manifest.exitRoomId);
    if (exitRoom === undefined) {
      throw new Error('exit room not found in manifest');
    }
    this.exitX = (exitRoom.bounds.x + exitRoom.bounds.width / 2);
    this.exitY = (exitRoom.bounds.y + exitRoom.bounds.height / 2);

    // 7. 背包
    this.inventory = new Inventory();

    // 8. CombatManager + 武器适配器
    const isWalkable: IsWalkableFn = (x, y) => this.interaction.checkWalkable(x, y);
    const callbacks: CombatCallbacks = {
      onPlayerDied: () => this.handlePlayerDeath(),
      onPlayerDamaged: (_instance) => this.onCombatSfx?.('playerDamaged'),
      onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy),
      onEliteDefeated: () => this.handleEliteDefeated(),
      onMarkBodyOnMinimap: (bodyId, x, y) => this.scene.markBodyOnMinimap(bodyId, x, y),
      onKnockback: (vx, vy, durationMs) => this.interaction.applyKnockback(vx, vy, durationMs),
    };
    this.combatManager = new CombatManager(this.player, callbacks, isWalkable);
    this.weaponCooldowns = new WeaponCooldowns();
    this.weaponAdapter = new WeaponCombatAdapter(this.combatManager, this.weaponCooldowns, null);
    if (this.loadout.weaponId !== UNARMED_ID) {
      this.player.weaponId = this.loadout.weaponId;
    }

    // 9. 注入 scene
    this.scene.setCombatDeps(this.combatManager, this.weaponAdapter);
    this.scene.setCurrentLoadout(this.loadout);

    // 10. spawn 初始怪物（在非 entrance/exit/vault 的房间）
    this.spawnInitialEnemies();

    // 11. 但宇轩身体（最多 2，初始 1）
    this.spawnDanYuxuanBody();

    // 12. 创建玩家精灵 + 相机跟随
    this.playerSprite = this.scene.add.rectangle(
      this.playerX, this.playerY, 28, 28, 0x4a90e2, 1,
    );
    this.playerSprite.setDepth(PLAYER_SPRITE_DEPTH);
    this.scene.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);

    // 13. 宝箱交互 hitArea
    this.interaction.createChestInteractions();

    // 13b. 遗落的纸条交互 hitArea + overlay（spec §6 / §7）
    this.notesState = loadNotesState().state;
    this.interaction.createNoteInteractions();
    this.noteOverlay = new NoteOverlay(this.scene, { onClose: () => this.interaction.closeNoteOverlay() });
    this.noteOverlay.create();

    // 14. 撤离点 hitArea
    this.interaction.createExitInteraction();

    // 15. 输入
    const keyboard = this.scene.input.keyboard;
    if (keyboard === null) {
      throw new Error('keyboard input not available');
    }
    this.cursors = keyboard.createCursorKeys();
    this.keyJ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyH = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.keyShift = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // 攻击键单次触发（wiring 委托 interaction.bindInput）
    this.interaction.bindInput();

    // spec §5.11.7: 派生 adjacentRooms 并传入 CombatManager（远房 4Hz 降级判定）
    this.combatManager.setAdjacentRooms(this.deriveAdjacentRooms(this.manifest));
    // Task 8 (#7) / Task 23 接入：传入房间矩形清单，update() 每帧据此更新 enemy.currentRoomId
    this.combatManager.setRooms(this.manifest.rooms);

    // spec §10.1: vault door 交互 hitArea
    const vaultDoor = this.manifest.doors.find((d) => d.roomId === this.manifest.vaultRoomId);
    if (vaultDoor !== undefined) {
      const pos = this.renderer.createVaultDoorInteraction(vaultDoor);
      this.vaultDoorX = pos.x;
      this.vaultDoorY = pos.y;
    }

    // 16. 测试钩子子模块（state + interaction 均就绪）
    this.testHooks = new RunTestHooks(this, this.interaction);

    this.startTime = this.scene.time.now;
  }

  /** spec §5.11.7: 由 corridor 的 fromRoomId/toRoomId 派生双向邻接表。 */
  private deriveAdjacentRooms(manifest: ForgottenSanityMapManifest): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const c of manifest.corridors) {
      let s1 = map.get(c.fromRoomId);
      if (s1 === undefined) { s1 = new Set(); map.set(c.fromRoomId, s1); }
      s1.add(c.toRoomId);
      let s2 = map.get(c.toRoomId);
      if (s2 === undefined) { s2 = new Set(); map.set(c.toRoomId, s2); }
      s2.add(c.fromRoomId);
    }
    return map;
  }

  // ───────────────────────────────────────────────────────────────────
  // 主 update（由 ForgottenSanityRunController.update / ForgottenSanityScene.update 每帧调用）
  // ───────────────────────────────────────────────────────────────────
  update(time: number, deltaMs: number): void {
    if (this.player.isDead) return;

    this.elapsedMs = time - this.startTime;

    // 击退位移（spec §5.10 杨云红边冲撞命中后的 200ms 推开效果）
    if (this.knockbackRemainingMs > 0) {
      const stepMs = Math.min(deltaMs, this.knockbackRemainingMs);
      const remainBefore = this.knockbackRemainingMs;
      this.knockbackRemainingMs -= stepMs;
      const ratio = stepMs / remainBefore;
      const dx = this.knockbackVx * ratio;
      const dy = this.knockbackVy * ratio;
      if (this.interaction.checkWalkable(this.playerX + dx, this.playerY)) this.playerX += dx;
      if (this.interaction.checkWalkable(this.playerX, this.playerY + dy)) this.playerY += dy;
      this.knockbackVx -= dx;
      this.knockbackVy -= dy;
    }

    // 1. 输入 → 移动
    this.interaction.handleMovement(deltaMs);

    // spec §9.2: 雾战 — 玩家走过的 cell 永久点亮
    this.updateExploredCells();

    // 2. 同步玩家位置到 CombatManager
    this.combatManager.setPlayerPosition(this.playerX, this.playerY);

    // 3. 玩家噪声（走 80 / 跑 200 / 静止 0）
    const noiseRadius = this.isMoving
      ? (this.isRunning && this.player.canRun() ? 200 : 80)
      : 0;
    this.player.setNoiseRadius(noiseRadius);

    // 4. stamina tick
    this.player.tickStamina(deltaMs, this.isRunning && this.isMoving);

    // 5. CombatManager 主循环
    this.combatManager.update(deltaMs);

    // 6. 同步玩家精灵位置
    if (this.playerSprite !== null) {
      this.playerSprite.setPosition(this.playerX, this.playerY);
    }

    // 7. 宝箱破译 update（仅活动宝箱）
    if (this.activeChestId !== null) {
      const decrypt = this.chestDecrypts.get(this.activeChestId);
      if (decrypt !== undefined) {
        decrypt.update(deltaMs);
      }
    }

    // 8. 同步 HUD
    this.syncHud();

    // 9. 同步 Minimap
    this.syncMinimap();

    // 10. 撤离点检测
    this.checkExitProximity();
  }

  // ───────────────────────────────────────────────────────────────────
  // 雾战脚步点亮（spec §9.2）：玩家当前所在 cell 永久加入 exploredCells
  // ───────────────────────────────────────────────────────────────────
  private updateExploredCells(): void {
    const cellCols = 5;      // GRID_COLS (spec §2.1)
    const cellWidth = 1000;  // CELL_WIDTH
    const cellHeight = 1000; // CELL_HEIGHT
    const col = Math.floor(this.playerX / cellWidth);
    const row = Math.floor(this.playerY / cellHeight);
    if (col >= 0 && col < 5 && row >= 0 && row < 4) {
      this.exploredCells.add(row * cellCols + col);
    }
    // spec §5.11.7: 同步玩家当前房间 ID 给 CombatManager（远房降级判定）
    const currentRoom = this.manifest.rooms.find(
      (r) => rectContains(r.bounds, { x: this.playerX, y: this.playerY }),
    );
    this.combatManager.setPlayerRoomId(currentRoom?.id ?? null);
  }

  // ───────────────────────────────────────────────────────────────────
  // 初始怪物 spawn
  // ───────────────────────────────────────────────────────────────────
  private spawnInitialEnemies(): void {
    const spawnableKinds: EnemyKind[] = [
      'butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone',
      'bloodHand', 'floatingEye', 'chalkDust',
    ];
    for (const room of this.manifest.rooms) {
      if (room.id === this.manifest.entranceRoomId) continue;
      if (room.id === this.manifest.exitRoomId) continue;
      if (room.kind === 'vault') continue; // 宝藏房不 spawn 普通怪
      const count = this.rng.int(ENEMY_SPAWN_PER_ROOM_MIN, ENEMY_SPAWN_PER_ROOM_MAX);
      for (let i = 0; i < count; i++) {
        const kind = spawnableKinds[this.rng.int(0, spawnableKinds.length - 1)];
        if (kind === undefined) continue;
        const x = room.spawnPoint.x + (this.rng.next() - 0.5) * 200;
        const y = room.spawnPoint.y + (this.rng.next() - 0.5) * 200;
        this.spawnEnemy(kind, { x, y });
      }
    }
  }

  private spawnDanYuxuanBody(): void {
    // 初始 1 个身体，放在 hall 或随机非 entrance 房间
    const candidates = this.manifest.rooms.filter(
      (r) => r.id !== this.manifest.entranceRoomId && r.id !== this.manifest.exitRoomId,
    );
    if (candidates.length === 0) return;
    const room = candidates[this.rng.int(0, candidates.length - 1)];
    if (room === undefined) return;
    this.spawnEnemy('danYuxuanBody', { x: room.spawnPoint.x, y: room.spawnPoint.y });
  }

  private spawnEnemy(kind: EnemyKind, pos: { x: number; y: number }): Enemy | null {
    const id = `${kind}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const opts: EnemyConstructorOpts = makeEnemyOpts(kind, id, pos.x, pos.y);
    const enemy = createEnemy(kind, opts);
    this.combatManager.addEnemy(enemy);
    return enemy;
  }

  // ───────────────────────────────────────────────────────────────────
  // 怪物死亡 → 掉落
  // ───────────────────────────────────────────────────────────────────
  private handleEnemyKilled(enemy: Enemy): void {
    this.onCombatSfx?.('enemyKilled');
    // spec §10：普通缄默者掉落 SILENT_ONE_LOOT_TABLE
    if (enemy.kind === 'yangYunRed' || enemy.kind === 'yangYunRedPhantom') return; // 红边走 onEliteDefeated
    if (enemy.kind === 'danYuxuanBody') return; // 身体不掉落
    const loot = rollLootTable(SILENT_ONE_LOOT_TABLE, this.rng.next.bind(this.rng));
    for (const item of loot) {
      this.inventory.add(item.id, 1);
    }
  }

  // spec §5.10：杨云红边击杀奖励。Task 1 暂由 ForgottenSanityScene 测试钩子直接调用，
  // Task 23 会正式实现完整 *ForTest 方法包装器。
  handleEliteDefeated(): void {
    this.onCombatSfx?.('enemyKilled');
    // 1. 碎片掷骰（独立掷骰）
    const loot = rollLootTable(YANG_YUN_RED_LOOT_TABLE, this.rng.next.bind(this.rng));
    for (const item of loot) {
      this.inventory.add(item.id, 1);
    }
    // 2. 仓库钥匙 100% 掉落（spec §10.1）
    this.inventory.add('material.vaultKey', 1);
    // 3. 全屏遮罩 + 红边雾战视野 220px（spec §9.3）
    this.scene.triggerRedEdgeKill(this.playerX, this.playerY);
    // 4. 缄默者复制 ×2（spec §9.3 替换原"理智刷新+100%"）
    this.combatManager.duplicateSilentOnes({
      x: this.playerX - GAME_WIDTH / 2,  // 视口左上角 = 玩家中心 - 半宽
      y: this.playerY - GAME_HEIGHT / 2,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    });
    // 5. M6: 雾战遮罩激活期间冻结敌人 AI（2s）— 玩家视野缩减为 220px，
    //    期间敌人不移动、不攻击，仅视觉特效（wallHitParticles）推进。
    //    2s 后自动解冻，恢复敌人正常 AI。
    this.combatManager.setFrozen(true);
    this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
      this.combatManager.setFrozen(false);
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // 玩家死亡
  // ───────────────────────────────────────────────────────────────────
  private handlePlayerDeath(): void {
    this.scene.runDeathSettlement();
  }

  // ───────────────────────────────────────────────────────────────────
  // 放弃对局（plan 2026-07-19 Task 14 / M8）
  // 按死亡处理：本局战利品全丢，仓库不变。
  // 不调用 depositRunInventory / storeStash —— 由 SettlementScreen.showDeath
  // 决定 UI 表现（"本局战利品全丢"），仓库状态保持不变。
  // ───────────────────────────────────────────────────────────────────
  abandonRun(): void {
    this.scene.runDeathSettlement();
  }

  private runEvacuation(): void {
    if (this.player.isDead) return;
    // spec §1.3：撤离成功副作用（碎片入仓库 + best sanity 更新）由
    // SettlementScreen.handleEvacuated 统一负责。controller 仅路由到 settlement UI。
    // 删除原双重 depositRunInventory + storeStash 调用，避免战利品×2。
    this.scene.runEvacuationSettlement(this.inventory, this.manifest.baselineSanity);
  }

  // ───────────────────────────────────────────────────────────────────
  // 撤离点发现检测
  // ───────────────────────────────────────────────────────────────────
  private checkExitProximity(): void {
    // 玩家进入出口房间即发现撤离点
    if (!this.exitDiscovered) {
      const exitRoom = this.manifest.rooms.find((r) => r.id === this.manifest.exitRoomId);
      if (exitRoom !== undefined && rectContains(exitRoom.bounds, { x: this.playerX, y: this.playerY })) {
        this.exitDiscovered = true;
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // HUD 同步
  // ───────────────────────────────────────────────────────────────────
  private syncHud(): void {
    const weaponId = this.loadout.weaponId;
    const weapon: WeaponDef | null = weaponId === UNARMED_ID ? null : getWeapon(weaponId);
    const ultCdTotal = weapon?.ultimate.cooldownMs ?? 0;
    const ultCdRemaining = weapon !== null
      ? this.weaponCooldowns.getUltimateCooldownRemaining(this.combatManager.getTimeMs())
      : 0;
    const stash = loadStash();
    const snapshot: HudSnapshot = {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      stamina: this.player.stamina,
      maxStamina: STAMINA_MAX,
      isFatigued: this.player.isFatigued,
      weaponId: this.player.weaponId,
      weaponName: weapon?.name ?? '空手',
      ultCooldownRemaining: ultCdRemaining,
      ultCooldownTotal: ultCdTotal,
      sanity: this.inventory.totalSanityValue(),
      baseline: this.manifest.baselineSanity,
      fragmentCount: this.inventory.entries().length,
      elapsedMs: this.elapsedMs,
      consumableSlots: this.loadout.consumables,
      stashSanity: stash.sanity,
    };
    this.scene.updateHud(snapshot);
  }

  // ───────────────────────────────────────────────────────────────────
  // Minimap 同步
  // ───────────────────────────────────────────────────────────────────
  private syncMinimap(): void {
    const chestMarkers = this.manifest.chests.map((c) => {
      const opened = this.openedChests.has(c.id);
      return {
        id: c.id,
        x: c.bounds.x + c.bounds.width / 2,
        y: c.bounds.y + c.bounds.height / 2,
        opened,
        kind: c.kind,
      };
    });
    const bodyMarkers = this.scene.consumePendingBodyMarkers();
    const update: MinimapUpdate = {
      playerX: this.playerX,
      playerY: this.playerY,
      exploredCells: [...this.exploredCells], // spec §9.2 雾战
      chestMarkers,
      bodyMarkers,
      exitDiscovered: this.exitDiscovered,
      exitX: this.exitX,
      exitY: this.exitY,
    };
    this.scene.updateMinimap(update);
  }

  // ───────────────────────────────────────────────────────────────────
  // 销毁
  // ───────────────────────────────────────────────────────────────────
  destroy(): void {
    for (const decrypt of this.chestDecrypts.values()) {
      (decrypt as unknown as { destroy?: () => void }).destroy?.();
    }
    this.chestDecrypts.clear();
    this.noteOverlay?.destroy();
    this.noteOverlay = null;
    this.renderer.clear();
  }
}
