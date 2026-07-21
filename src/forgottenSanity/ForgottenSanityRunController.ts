// src/forgottenSanity/ForgottenSanityRunController.ts
// 被遗忘的理智 对局装配器：把 Plan 2-6 所有底层系统串到 ForgottenSanityScene 上。
// 逐行审核编写，每个调用都有 API 依据。
// spec §1.2/§1.3/§2/§3/§4/§5/§6/§7/§8/§9，grill 2026-07-17。
import Phaser from 'phaser';

import {
  PLAYER_BASE_SPEED,
  PLAYER_RUN_SPEED,
  STAMINA_MAX,
} from './combat/DamageType';
import type { DamageInstance } from './combat/DamageType';
import { PlayerCombat } from './combat/PlayerCombat';
import {
  CombatManager,
  type IsWalkableFn,
  type CombatCallbacks,
  type PlayerProjectile,
  type PlayerZone,
} from './combat/CombatManager';
import {
  Enemy,
  type EnemyKind,
  type EnemyConstructorOpts,
  createEnemy,
} from './combat/Enemy';
import {
  ForgottenSanityMapRenderer,
} from './map/ForgottenSanityMapRenderer';
import {
  generateForgottenSanityMap,
  createRng,
  type Rng,
} from './map/ForgottenSanityMapGenerator';
import type {
  ForgottenSanityMapManifest,
  ForgottenSanityChestSpawn,
} from './map/forgottenSanityMapState';
import { rectContains } from './map/forgottenSanityMapState';
import { WeaponCombatAdapter } from './weapons/WeaponCombatAdapter';
import { WeaponCooldowns } from './weapons/WeaponCooldowns';
import { getWeapon, type WeaponDef } from './weapons/WeaponRegistry';
import { Inventory } from './loot/Inventory';
import {
  rollLootTable,
  SILENT_ONE_LOOT_TABLE,
  YANG_YUN_RED_LOOT_TABLE,
  NORMAL_CHEST_LOOT_TABLE,
  GILDED_CHEST_LOOT_TABLE,
} from './loot/LootTable';
import type { LootItem } from './loot/LootItem';
import { ChestDecrypt } from './loot/ChestDecrypt';
import {
  loadStash,
  storeStash,
} from './meta/StashManager';
import {
  loadUpgradesState,
} from './state/forgottenSanityState';
import { getUpgradeEffects } from './meta/UpgradeManager';
import {
  consumeLoadoutFromStash,
  UNARMED_ID,
  type Loadout,
} from './meta/LoadoutManager';
import type { ForgottenSanityScene } from './ForgottenSanityScene';
import type { HudSnapshot } from './ui/ForgottenSanityHUD';
import type { MinimapUpdate } from './ui/Minimap';
// M6: 红边击杀后雾战遮罩激活期间冻结敌人 AI（2s）
import { RED_EDGE_MASK_DURATION_MS } from './ui/RedEdgeFogOverlay';

const PLAYER_SPRITE_DEPTH = 10;
const CHEST_INTERACT_DISTANCE = 80;
const EXIT_INTERACT_DISTANCE = 60;
const ENEMY_SPAWN_PER_ROOM_MIN = 1;
const ENEMY_SPAWN_PER_ROOM_MAX = 3;

/**
 * 对局装配器。由 ForgottenSanityScene.create 实例化。
 * 职责：生成地图 → 渲染 → 创建玩家 + 战斗管理器 + 武器适配器 + 背包 → spawn 初始怪物 →
 *       接入输入 → 在 update 中驱动 CombatManager + 同步 HUD/Minimap + 处理宝箱/撤离/死亡。
 */
export class ForgottenSanityRunController {
  private readonly scene: ForgottenSanityScene & Phaser.Scene;
  private readonly renderer: ForgottenSanityMapRenderer;
  private readonly manifest: ForgottenSanityMapManifest;
  private readonly rng: Rng;
  private readonly player: PlayerCombat;
  private readonly inventory: Inventory;
  private readonly combatManager: CombatManager;
  private readonly weaponCooldowns: WeaponCooldowns;
  private readonly weaponAdapter: WeaponCombatAdapter;
  private readonly loadout: Loadout;
  private readonly upgradeEffects: ReturnType<typeof getUpgradeEffects>;

  // 玩家世界坐标（PlayerCombat 不存位置，由 controller 维护）
  private playerX: number;
  private playerY: number;
  private facingX = 0;
  private facingY = 1; // 默认朝下
  private isRunning = false;
  private isMoving = false;

  // 击退状态（spec §5.10 杨云红边冲撞命中后的 200ms 推开效果）
  private knockbackVx = 0;
  private knockbackVy = 0;
  private knockbackRemainingMs = 0;

  // fistDash 锁定向冲刺状态（spec §3.2: 0.3s / 250px / 833px/s / 撞墙即停）
  private dashLockState: { activeMs: number; dirX: number; dirY: number } | null = null;

  // spec §9.2: 雾战 — 玩家走过的 cell 永久点亮（小地图过滤标记用）
  private readonly exploredCells = new Set<number>();

  // 宝箱交互
  private readonly chestDecrypts = new Map<string, ChestDecrypt>();
  private readonly openedChests = new Set<string>();
  private activeChestId: string | null = null;

  // 撤离点
  private exitX: number;
  private exitY: number;
  private exitDiscovered = false;

  // spec §10.1: vault door 交互
  private vaultDoorX = 0;
  private vaultDoorY = 0;

  // 计时
  private elapsedMs = 0;
  private readonly startTime: number;

  // 输入
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keyJ: Phaser.Input.Keyboard.Key;
  private readonly keyK: Phaser.Input.Keyboard.Key;
  private readonly keyH: Phaser.Input.Keyboard.Key;
  private readonly keyShift: Phaser.Input.Keyboard.Key;

  // 玩家精灵（简化：一个金色矩形代表玩家）
  private playerSprite: Phaser.GameObjects.Rectangle | null = null;
  // 宝箱交互 hitArea（按 chestId 索引）
  private readonly chestHitAreas = new Map<string, Phaser.GameObjects.Zone>();
  // 撤离点 hitArea
  private exitZone: Phaser.GameObjects.Zone | null = null;

  constructor(scene: ForgottenSanityScene & Phaser.Scene) {
    this.scene = scene;

    // 1. 生成地图（spec §2，mulberry32 种子可复现）
    const seed = (Date.now() & 0xffffffff) >>> 0;
    this.manifest = generateForgottenSanityMap(seed);
    this.rng = createRng(seed ^ 0x5a5a5a5a);

    // 2. 渲染地图
    this.renderer = new ForgottenSanityMapRenderer(this.scene);
    this.renderer.render(this.manifest);

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
    const isWalkable: IsWalkableFn = (x, y) => this.checkWalkable(x, y);
    const callbacks: CombatCallbacks = {
      onPlayerDied: () => this.handlePlayerDeath(),
      onEnemyKilled: (enemy) => this.handleEnemyKilled(enemy),
      onEliteDefeated: () => this.handleEliteDefeated(),
      onMarkBodyOnMinimap: (bodyId, x, y) => this.scene.markBodyOnMinimap(bodyId, x, y),
      onKnockback: (vx, vy, durationMs) => this.applyKnockback(vx, vy, durationMs),
    };
    this.combatManager = new CombatManager(this.player, callbacks, isWalkable);
    this.weaponCooldowns = new WeaponCooldowns();
    const combatPort = {
      player: this.player,
      getPlayerPosition: () => ({ x: this.playerX, y: this.playerY }),
      damageClosestEnemyInFan: (...args: readonly unknown[]) =>
        this.combatManager.damageClosestEnemyInFan(
          args[0] as number, args[1] as number,
          args[2] as number, args[3] as number,
          args[4] as number, args[5] as number,
          args[6] as DamageInstance,
        ),
      damageClosestEnemyInFanWithHit: (...args: readonly unknown[]) =>
        this.combatManager.damageClosestEnemyInFanWithHit(
          args[0] as number, args[1] as number,
          args[2] as number, args[3] as number,
          args[4] as number, args[5] as number,
          args[6] as DamageInstance,
        ),
      damageEnemiesInFan: (...args: readonly unknown[]) =>
        this.combatManager.damageEnemiesInFan(
          args[0] as number, args[1] as number,
          args[2] as number, args[3] as number,
          args[4] as number, args[5] as number,
          args[6] as DamageInstance,
        ),
      damageEnemiesInCircle: (...args: readonly unknown[]) =>
        this.combatManager.damageEnemiesInCircle(
          args[0] as number, args[1] as number, args[2] as number, args[3] as DamageInstance,
          args[4] as { excludeIds?: Set<string>; source?: string } | undefined,
        ),
      spawnPlayerProjectile: (p: PlayerProjectile) => this.combatManager.spawnPlayerProjectile(p),
      spawnPlayerZone: (z: PlayerZone) => this.combatManager.spawnPlayerZone(z),
      pullEnemiesToward: (cx: number, cy: number, radius: number, pullDistance: number) =>
        this.combatManager.pullEnemiesToward(cx, cy, radius, pullDistance),
      killRandomEnemyInRadiusExcluding: (
        cx: number, cy: number, radius: number,
        excludeKinds: readonly EnemyKind[], excludeHpLe?: number,
      ) => this.combatManager.killRandomEnemyInRadiusExcluding(cx, cy, radius, excludeKinds, excludeHpLe),
      getTimeMs: () => this.combatManager.getTimeMs(),
    };
    this.weaponAdapter = new WeaponCombatAdapter(combatPort, this.weaponCooldowns, null);
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
    this.createChestInteractions();

    // 14. 撤离点 hitArea
    this.createExitInteraction();

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

    // 攻击键单次触发
    this.keyJ.on('down', () => this.onAttackPressed());
    this.keyK.on('down', () => this.onUltimatePressed());
    this.keyH.on('down', () => this.onInteractPressed());

    // spec §5.11.7: 派生 adjacentRooms 并传入 CombatManager（远房 4Hz 降级判定）
    this.combatManager.setAdjacentRooms(this.deriveAdjacentRooms(this.manifest));

    // spec §10.1: vault door 交互 hitArea
    const vaultDoor = this.manifest.doors.find((d) => d.roomId === this.manifest.vaultRoomId);
    if (vaultDoor !== undefined) {
      const pos = this.renderer.createVaultDoorInteraction(vaultDoor);
      this.vaultDoorX = pos.x;
      this.vaultDoorY = pos.y;
    }

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
  // 主 update（由 ForgottenSanityScene.update 每帧调用）
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
      if (this.checkWalkable(this.playerX + dx, this.playerY)) this.playerX += dx;
      if (this.checkWalkable(this.playerX, this.playerY + dy)) this.playerY += dy;
      this.knockbackVx -= dx;
      this.knockbackVy -= dy;
    }

    // 1. 输入 → 移动
    this.handleMovement(deltaMs);

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
  // 击退（spec §5.10 杨云红边冲撞命中后由 CombatManager 触发）
  // ───────────────────────────────────────────────────────────────────
  private applyKnockback(vx: number, vy: number, durationMs: number): void {
    this.knockbackVx = vx;
    this.knockbackVy = vy;
    this.knockbackRemainingMs = durationMs;
  }

  // ───────────────────────────────────────────────────────────────────
  // 移动
  // ───────────────────────────────────────────────────────────────────
  private handleMovement(deltaMs: number): void {
    // spec §3.2: fistDash 冲刺期间忽略键盘输入，按锁定方向推进（250px / 0.3s = 833 px/s）
    if (this.dashLockState !== null) {
      const dash = this.dashLockState;
      const dashSpeed = 833;
      const stepMs = Math.min(deltaMs, dash.activeMs);
      const dx = dash.dirX * dashSpeed * (stepMs / 1000);
      const dy = dash.dirY * dashSpeed * (stepMs / 1000);
      if (this.checkWalkable(this.playerX + dx, this.playerY)) {
        this.playerX += dx;
      } else {
        this.dashLockState = null; // 撞墙立即停止
      }
      if (this.dashLockState !== null && this.checkWalkable(this.playerX, this.playerY + dy)) {
        this.playerY += dy;
      } else if (this.dashLockState !== null) {
        this.dashLockState = null;
      }
      dash.activeMs -= stepMs;
      if (dash.activeMs <= 0) this.dashLockState = null;
      // 朝向仍按冲刺方向（用于攻击/视觉）
      this.facingX = dash.dirX;
      this.facingY = dash.dirY;
      // 地图边界钳制
      this.playerX = Math.max(0, Math.min(this.manifest.bounds.width, this.playerX));
      this.playerY = Math.max(0, Math.min(this.manifest.bounds.height, this.playerY));
      this.isMoving = true;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown) dx -= 1;
    if (this.cursors.right.isDown) dx += 1;
    if (this.cursors.up.isDown) dy -= 1;
    if (this.cursors.down.isDown) dy += 1;

    this.isRunning = this.keyShift.isDown;
    this.isMoving = dx !== 0 || dy !== 0;

    if (!this.isMoving) {
      return;
    }

    // 归一化
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    // 朝向（攻击方向）
    this.facingX = dx;
    this.facingY = dy;

    // 速度（升级 swift +4%/tier × tier）
    const base = PLAYER_BASE_SPEED;
    const speed = this.isRunning && this.player.canRun()
      ? PLAYER_RUN_SPEED
      : base;
    const effective = this.player.getEffectiveSpeed(speed) * this.upgradeEffects.moveSpeedMultiplier;

    const stepX = dx * effective * (deltaMs / 1000);
    const stepY = dy * effective * (deltaMs / 1000);

    // 碰撞检测：分轴
    if (this.checkWalkable(this.playerX + stepX, this.playerY)) {
      this.playerX += stepX;
    }
    if (this.checkWalkable(this.playerX, this.playerY + stepY)) {
      this.playerY += stepY;
    }

    // 地图边界钳制
    this.playerX = Math.max(0, Math.min(this.manifest.bounds.width, this.playerX));
    this.playerY = Math.max(0, Math.min(this.manifest.bounds.height, this.playerY));
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
  // 可走性检测：玩家中心点必须在某个房间/走廊的 walkableBounds 内，且不在 collisionZone 内
  // ───────────────────────────────────────────────────────────────────
  private checkWalkable(x: number, y: number): boolean {
    // 在任一房间或走廊的 walkableBounds 内
    let inWalkable = false;
    for (const room of this.manifest.rooms) {
      if (rectContains(room.walkableBounds, { x, y })) {
        inWalkable = true;
        break;
      }
    }
    if (!inWalkable) {
      for (const corridor of this.manifest.corridors) {
        if (rectContains(corridor.bounds, { x, y })) {
          inWalkable = true;
          break;
        }
      }
    }
    if (!inWalkable) return false;

    // 不在 collisionZone 内（墙壁）
    for (const zone of this.renderer.getCollisionZones()) {
      if (rectContains(zone, { x, y })) return false;
    }
    return true;
  }

  // ───────────────────────────────────────────────────────────────────
  // 攻击输入
  // ───────────────────────────────────────────────────────────────────
  private onAttackPressed(): void {
    if (this.player.isDead) return;
    const dir = { x: this.facingX, y: this.facingY };
    const timeMs = this.combatManager.getTimeMs();
    this.scene.performPlayerAttack(dir, timeMs);
  }

  private onUltimatePressed(): void {
    if (this.player.isDead) return;
    const dir = { x: this.facingX, y: this.facingY };
    const timeMs = this.combatManager.getTimeMs();
    this.weaponAdapter.performUltimate(dir, timeMs);
    // spec §3.2: fistDash 锁定向 + 250px/0.3s 实际冲刺（833 px/s）
    if (this.loadout.weaponId === 'weapon.fistGauntlet') {
      this.dashLockState = { activeMs: 300, dirX: dir.x, dirY: dir.y };
    }
  }

  private onInteractPressed(): void {
    if (this.player.isDead) return;
    // 优先：正在破译的宝箱 → 推进；否则：附近宝箱 → 开始破译；否则：vault door；否则：撤离点
    if (this.activeChestId !== null) {
      // ChestDecrypt 自带 F 键 wiring，这里不重复处理
      return;
    }
    // 找最近未开启宝箱
    const chest = this.findNearestChest();
    if (chest !== null) {
      this.startChestDecrypt(chest);
      return;
    }
    // spec §10.1: vault door
    if (this.distanceToVaultDoor() <= EXIT_INTERACT_DISTANCE) {
      this.tryUnlockVaultDoor();
      return;
    }
    // 撤离点
    if (this.distanceToExit() <= EXIT_INTERACT_DISTANCE) {
      this.runEvacuation();
    }
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
    const opts: EnemyConstructorOpts = this.defaultEnemyOpts(kind, id, pos.x, pos.y);
    const enemy = createEnemy(kind, opts);
    if (enemy === null) return null;
    this.combatManager.addEnemy(enemy);
    return enemy;
  }

  private defaultEnemyOpts(kind: EnemyKind, id: string, x: number, y: number): EnemyConstructorOpts {
    const table: Record<EnemyKind, { maxHp: number; speed: number; contactDamage: number; contactRadius: number }> = {
      butYuxuanHead: { maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 22 },
      qinHaoruiHead: { maxHp: 55, speed: 50, contactDamage: 8, contactRadius: 22 },
      deskChairs: { maxHp: 120, speed: 40, contactDamage: 15, contactRadius: 28 },
      phone: { maxHp: 70, speed: 55, contactDamage: 10, contactRadius: 22 },
      bloodHand: { maxHp: 70, speed: 0, contactDamage: 16, contactRadius: 26 },
      floatingEye: { maxHp: 35, speed: 80, contactDamage: 6, contactRadius: 20 },
      chalkDust: { maxHp: 150, speed: 30, contactDamage: 5, contactRadius: 40 },
      butYuxuanHeadBloodEye: { maxHp: 70, speed: 75, contactDamage: 12, contactRadius: 22 },
      danYuxuanBody: { maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 30 },
      yangYunRed: { maxHp: 320, speed: 95, contactDamage: 22, contactRadius: 26 },
      yangYunRedPhantom: { maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 20 },
    };
    const t = table[kind];
    return {
      id,
      x, y,
      maxHp: t.maxHp,
      speed: t.speed,
      contactDamage: t.contactDamage,
      contactRadius: t.contactRadius,
    };
  }

  // ───────────────────────────────────────────────────────────────────
  // 怪物死亡 → 掉落
  // ───────────────────────────────────────────────────────────────────
  private handleEnemyKilled(enemy: Enemy): void {
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
      x: this.playerX - 640,  // 视口左上角 = 玩家中心 - 半宽
      y: this.playerY - 360,
      width: 1280,
      height: 720,
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
  public abandonRun(): void {
    this.scene.runDeathSettlement();
  }

  // ───────────────────────────────────────────────────────────────────
  // 宝箱交互
  // ───────────────────────────────────────────────────────────────────
  private createChestInteractions(): void {
    for (const chest of this.manifest.chests) {
      const cx = chest.bounds.x + chest.bounds.width / 2;
      const cy = chest.bounds.y + chest.bounds.height / 2;
      const zone = this.scene.add.zone(cx, cy, CHEST_INTERACT_DISTANCE * 2, CHEST_INTERACT_DISTANCE * 2);
      zone.setInteractive();
      this.chestHitAreas.set(chest.id, zone);
    }
  }

  private findNearestChest(): ForgottenSanityChestSpawn | null {
    let nearest: ForgottenSanityChestSpawn | null = null;
    let nearestDist = Infinity;
    for (const chest of this.manifest.chests) {
      if (this.openedChests.has(chest.id)) continue;
      const cx = chest.bounds.x + chest.bounds.width / 2;
      const cy = chest.bounds.y + chest.bounds.height / 2;
      const dist = Math.sqrt((cx - this.playerX) ** 2 + (cy - this.playerY) ** 2);
      if (dist < CHEST_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = chest;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private startChestDecrypt(chest: ForgottenSanityChestSpawn): void {
    if (this.chestDecrypts.has(chest.id)) return;
    // spec §7.4：普通宝箱 NORMAL_CHEST_LOOT_TABLE / 鎏金 GILDED_CHEST_LOOT_TABLE
    const table = chest.kind === 'gilded' ? GILDED_CHEST_LOOT_TABLE : NORMAL_CHEST_LOOT_TABLE;
    const loot = rollLootTable(table, this.rng.next.bind(this.rng));
    const cx = chest.bounds.x + chest.bounds.width / 2;
    const cy = chest.bounds.y + chest.bounds.height / 2;
    const isVaultChest = chest.roomId === this.manifest.vaultRoomId;
    const decrypt = new ChestDecrypt({
      scene: this.scene,
      x: cx,
      y: cy,
      lootItems: loot,
      onLootCollected: (item: LootItem) => {
        this.inventory.add(item.id, 1);
      },
      isVaultChest,
    });
    this.chestDecrypts.set(chest.id, decrypt);
    this.activeChestId = chest.id;
  }

  // ───────────────────────────────────────────────────────────────────
  // 撤离点
  // ───────────────────────────────────────────────────────────────────
  private createExitInteraction(): void {
    this.exitZone = this.scene.add.zone(
      this.exitX, this.exitY,
      EXIT_INTERACT_DISTANCE * 2, EXIT_INTERACT_DISTANCE * 2,
    );
    this.exitZone.setInteractive();
  }

  private distanceToExit(): number {
    return Math.sqrt((this.exitX - this.playerX) ** 2 + (this.exitY - this.playerY) ** 2);
  }

  // spec §10.1: vault door 距离判定
  private distanceToVaultDoor(): number {
    return Math.sqrt((this.vaultDoorX - this.playerX) ** 2 + (this.vaultDoorY - this.playerY) ** 2);
  }

  private tryUnlockVaultDoor(): void {
    if (this.renderer.vaultUnlocked) {
      (this.scene as unknown as { showToast?: (msg: string) => void }).showToast?.('已解锁');
      return;
    }
    if (!this.inventory.has('material.vaultKey')) {
      (this.scene as unknown as { showToast?: (msg: string) => void }).showToast?.('需要仓库钥匙');
      return;
    }
    this.inventory.remove('material.vaultKey', 1);
    this.renderer.unlockVaultDoor();
  }

  private checkExitProximity(): void {
    // 玩家进入出口房间即发现撤离点
    if (!this.exitDiscovered) {
      const exitRoom = this.manifest.rooms.find((r) => r.id === this.manifest.exitRoomId);
      if (exitRoom !== undefined && rectContains(exitRoom.bounds, { x: this.playerX, y: this.playerY })) {
        this.exitDiscovered = true;
      }
    }
  }

  private runEvacuation(): void {
    if (this.player.isDead) return;
    // spec §1.3：撤离成功副作用（碎片入仓库 + best sanity 更新）由
    // SettlementScreen.handleEvacuated 统一负责。controller 仅路由到 settlement UI。
    // 删除原双重 depositRunInventory + storeStash 调用，避免战利品×2。
    this.scene.runEvacuationSettlement(this.inventory, this.manifest.baselineSanity);
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
    this.renderer.clear();
  }
}
