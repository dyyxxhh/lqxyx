// src/forgottenSanity/combat/CombatManager.ts
// 战斗管理器门面。纯 TS，无 Phaser import。
// spec#5 §5.2 拆分：原单体拆为 4 子系统 + 门面（本类）：
//   - WallHitParticleSystem.ts  撞墙粒子（生成 / 推进 / 查询）
//   - ProjectileSystem.ts       敌侧 + 玩家侧投射物（homing / 4px-8px 子步进 / 撞墙 / 命中）
//   - ZoneSystem.ts             敌侧 + 玩家侧区域（windup → burst → DoT）
//   - EnemySystem.ts            enemies 数组 + AI 调度 + 接触伤害 + 死亡清理 + 房间分配
// 本门面：组合 4 子系统 + update 总调度 + setFrozen + 实现 CombatPort + 转发玩家回调。
// 对外 API（含 CombatPort 11 方法、addEnemy/removeEnemy、setPlayerRoomId/setAdjacentRooms/
// setFarRoomAccumMs/hasFarRoomAccumMs/setRooms、canSpawnBody/registerBody/unregisterBody、
// playerAttack、duplicateSilentOnes、spawnProjectile/spawnZone、nextProjectileId/nextZoneId、
// getWallHitParticles/spawnWallHitFx、projectiles/playerProjectiles/zones/playerZones/enemies/player）
// 与拆分前完全兼容；子系统通过构造器注入共享数组引用 / context 回调。
// spec §3.1 / §3.3 / §5.9 / §5.10，grill 2026-07-17 补全噪声传递。
import {
  type DamageInstance,
  type Debuff,
} from './DamageType';
import {
  type CombatRng,
  Enemy,
  type EnemyKind,
  type Projectile,
  type ZoneEffect,
  createCombatRng,
  type Vec2,
} from './Enemy';
import { PlayerCombat } from './PlayerCombat';
import { WallHitParticleSystem, type WallHitParticle } from './WallHitParticleSystem';
import { ProjectileSystem, type PlayerProjectile } from './ProjectileSystem';
import { ZoneSystem, type PlayerZone } from './ZoneSystem';
import { EnemySystem } from './EnemySystem';
import type { CombatPort } from '../weapons/WeaponCombatAdapter';

// spec#5 §5.2 拆分：WallHitParticle / PlayerProjectile / PlayerZone 类型从子系统抽出，此处 re-export 保持向后兼容。
export type { WallHitParticle, PlayerProjectile, PlayerZone };

export type IsWalkableFn = (x: number, y: number) => boolean;

/** Task 8 (#7): 房间矩形 — 用于每帧点在矩形内更新 enemy.currentRoomId。
 *  与 map/forgottenSanityMapState.ts 的 ForgottenSanityRect/ForgottenSanityRoom 结构兼容，
 *  但本模块不引入 map/ 依赖（保持 combat 核心独立）。ForgottenSanityRunController 调用
 *  setRooms 时会传入 manifest.rooms 的子集（结构兼容）。 */
export interface RoomBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Task 8 (#7): 房间信息 — 仅 id + bounds，最小必需字段。 */
export interface RoomInfo {
  readonly id: string;
  readonly bounds: RoomBounds;
}

export interface CombatCallbacks {
  onPlayerDamaged?: (instance: DamageInstance) => void;
  onPlayerDebuffApplied?: (debuff: Debuff) => void;
  onPlayerDied?: () => void;
  onEnemyKilled?: (enemy: Enemy) => void;
  onEliteDefeated?: () => void;                              // 杨云红边死亡 → 理智崩塌事件
  onMarkBodyOnMinimap?: (bodyId: string, x: number, y: number) => void; // 召唤核心 30% 标记
  onVisionReduced?: (ratio: number, active: boolean) => void; // 粉笔尘云视野减益
  onKnockback?: (vx: number, vy: number, durationMs: number) => void; // 冲撞击退
}

export class CombatManager implements CombatPort {
  readonly player: PlayerCombat;
  private playerPosition: Vec2 = { x: 0, y: 0 };
  private readonly isWalkable: IsWalkableFn;
  private readonly rng: CombatRng;
  private readonly callbacks: CombatCallbacks;
  private timeMs = 0;
  private projectileCounter = 0;
  private zoneCounter = 0;
  // spec#5 §5.2 拆分：4 子系统（WallHit / Projectile / Zone / Enemy）
  private readonly wallHitSys: WallHitParticleSystem;
  private readonly projSys: ProjectileSystem;
  private readonly zoneSys: ZoneSystem;
  private readonly enemySys: EnemySystem;
  // M6: 雾战遮罩冻结敌人 AI — frozen=true 时 update 仅更新视觉特效（wallHitParticles 等），
  //     不推进敌人 AI/移动/攻击。handleEliteDefeated 触发后激活 RED_EDGE_MASK_DURATION_MS。
  private frozen = false;

  constructor(
    player: PlayerCombat,
    callbacks: CombatCallbacks = {},
    isWalkable: IsWalkableFn = () => true,
    rng?: CombatRng,
  ) {
    this.player = player;
    this.callbacks = callbacks;
    this.isWalkable = isWalkable;
    this.rng = rng ?? createCombatRng(Date.now() & 0xffffffff);
    this.wallHitSys = new WallHitParticleSystem(this.rng);
    // EnemySystem 先于 projSys/zoneSys 构造 — 后两者需引用 enemySys.enemies 与伤害结算回调。
    // enemySys context 中的 spawnProjectile/spawnZone 为 lazy 箭头函数（运行时 this.projSys 已就绪）。
    this.enemySys = new EnemySystem({
      isWalkable: this.isWalkable,
      rng: this.rng,
      callbacks: this.callbacks,
      player: this.player,
      getPlayerPosition: () => this.playerPosition,
      getTimeMs: () => this.timeMs,
      spawnProjectile: (p) => this.projSys.spawnProjectile(p),
      spawnZone: (z) => this.zoneSys.spawnZone(z),
    });
    this.projSys = new ProjectileSystem({
      isWalkable: this.isWalkable,
      wallHitFx: this.wallHitSys,
      enemies: this.enemySys.enemies,
      player: this.player,
      getPlayerPosition: () => this.playerPosition,
      applyDamageInstanceToEnemy: (e, i) => this.enemySys.applyDamageInstanceToEnemy(e, i),
    });
    this.zoneSys = new ZoneSystem({
      player: this.player,
      getPlayerPosition: () => this.playerPosition,
      damageEnemiesInCircle: (cx, cy, r, inst, opts) => this.enemySys.damageEnemiesInCircle(cx, cy, r, inst, opts),
    });

    // 转发玩家回调
    this.player.onDied = () => this.callbacks.onPlayerDied?.();
    this.player.onDamaged = (i) => this.callbacks.onPlayerDamaged?.(i);
    this.player.onDebuffApplied = (d) => this.callbacks.onPlayerDebuffApplied?.(d);
  }

  // spec#5 §5.2 拆分：projectiles / playerProjectiles 数组由 ProjectileSystem 持有，此处 getter 暴露共享引用。
  get projectiles(): Projectile[] { return this.projSys.projectiles; }
  get playerProjectiles(): PlayerProjectile[] { return this.projSys.playerProjectiles; }
  // spec#5 §5.2 拆分：zones / playerZones 数组由 ZoneSystem 持有，此处 getter 暴露共享引用。
  get zones(): ZoneEffect[] { return this.zoneSys.zones; }
  get playerZones(): PlayerZone[] { return this.zoneSys.playerZones; }
  // spec#5 §5.2 拆分：enemies 数组由 EnemySystem 持有，此处 getter 暴露共享引用。
  get enemies(): Enemy[] { return this.enemySys.enemies; }

  setPlayerPosition(x: number, y: number): void {
    this.playerPosition = { x, y };
  }

  getPlayerPosition(): Vec2 {
    return this.playerPosition;
  }

  // ─── spec §5.11.7 房间 API（委托 EnemySystem） ─────────────────────────
  /** spec §5.11.7: 设置玩家当前所在房间 ID（用于远房 4Hz 降级判定）。 */
  setPlayerRoomId(roomId: string | null): void {
    this.enemySys.setPlayerRoomId(roomId);
  }

  /** spec §5.11.7: 设置房间邻接表（key=房间 ID，value=邻接房间 ID 集合，双向）。 */
  setAdjacentRooms(map: Map<string, Set<string>>): void {
    this.enemySys.setAdjacentRooms(map);
  }

  /** spec §5.11.7 远房累计测试 helper：直接写入 enemy 远房累计毫秒，模拟远房 4Hz 降级场景。
   *  仅供测试使用 — 运行时由 updateAI() 自然累积。 */
  setFarRoomAccumMs(enemyId: string, ms: number): void {
    this.enemySys.setFarRoomAccumMs(enemyId, ms);
  }

  /** spec §5.11.7 远房累计测试 helper：查询 enemy 是否仍有远房累计条目。
   *  仅供测试使用 — 用于断言 handleDeadEnemies 是否清理了 dead 敌人的残留条目。 */
  hasFarRoomAccumMs(enemyId: string): boolean {
    return this.enemySys.hasFarRoomAccumMs(enemyId);
  }

  /** Task 8 (#7): 设置房间矩形清单，updateRoomAssignments() 每帧据此更新 enemy.currentRoomId。
   *  与 map/forgottenSanityMapState.ts 的 ForgottenSanityRoom 结构兼容（仅需 id + bounds）。 */
  setRooms(rooms: readonly RoomInfo[]): void {
    this.enemySys.setRooms(rooms);
  }

  // ─── M6 雾战遮罩 ───────────────────────────────────────────────────────
  /** M6: 冻结/解冻敌人 AI。frozen=true 时 update() 仅推进视觉特效（wallHitParticles），
   *  跳过敌人 AI、弹幕、区域、接触伤害等。视觉特效不冻结以避免粒子卡死屏幕。 */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** M6: 当前是否处于冻结状态。 */
  isFrozen(): boolean {
    return this.frozen;
  }

  // ─── 敌人增删（委托 EnemySystem） ──────────────────────────────────────
  addEnemy(enemy: Enemy): void {
    this.enemySys.addEnemy(enemy);
  }

  removeEnemy(enemy: Enemy): void {
    this.enemySys.removeEnemy(enemy);
  }

  // ─── 投射物 / 区域生成（委托 ProjectileSystem / ZoneSystem） ───────────
  spawnProjectile(p: Projectile): void {
    this.projSys.spawnProjectile(p);
  }

  spawnZone(z: ZoneEffect): void {
    this.zoneSys.spawnZone(z);
  }

  // ===========================================================================
  // plan 4: 玩家侧伤害 API（加法式，不修改既有 playerAttack/spawnProjectile/spawnZone）
  // ===========================================================================

  spawnPlayerProjectile(p: PlayerProjectile): void {
    this.projSys.spawnPlayerProjectile(p);
  }

  spawnPlayerZone(z: PlayerZone): void {
    this.zoneSys.spawnPlayerZone(z);
  }

  getTimeMs(): number {
    return this.timeMs;
  }

  // ─── CombatPort 玩家侧伤害 API（委托 EnemySystem） ─────────────────────
  /** 对扇形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血（用于吸血）。 */
  damageEnemiesInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    return this.enemySys.damageEnemiesInFan(originX, originY, dirX, dirY, range, halfAngle, instance);
  }

  /** 对扇形范围内最近的单个敌人造成伤害（grill: meleeFan 单体近战原则）。返回实际扣血。 */
  damageClosestEnemyInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    return this.enemySys.damageClosestEnemyInFan(originX, originY, dirX, dirY, range, halfAngle, instance);
  }

  /** #3 fistDash 去重：返回命中敌人 id（未命中返回 null），供路径+末端同敌去重使用。 */
  damageClosestEnemyInFanWithHit(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): { damage: number; enemyId: string | null } {
    return this.enemySys.damageClosestEnemyInFanWithHit(
      originX, originY, dirX, dirY, range, halfAngle, instance,
    );
  }

  /** 对圆形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血。
   *  options.excludeIds：跳过已命中敌人 id（#3 fistDash 路径+末端去重）。
   *  options.source：调试/日志标识（当前实现未使用，保留以备将来扩展）。 */
  damageEnemiesInCircle(
    cx: number, cy: number, radius: number,
    instance: DamageInstance,
    options?: { excludeIds?: Set<string>; source?: string },
  ): number {
    return this.enemySys.damageEnemiesInCircle(cx, cy, radius, instance, options);
  }

  /** 将范围内敌人向中心拉近 pullDistance（不超过中心）。 */
  pullEnemiesToward(cx: number, cy: number, radius: number, pullDistance: number): void {
    this.enemySys.pullEnemiesToward(cx, cy, radius, pullDistance);
  }

  /** 秒杀范围内一个随机非排除种类敌人。返回被杀敌人或 null。
   *  M11: excludeKinds 排除指定种类（万魂幡排除 yangYunRed + danYuxuanBody）；
   *       isDuplicate=true 的复制体也被保守排除（防止秒杀复制体绕过递归保护语义）。 */
  killRandomEnemyInRadiusExcluding(
    cx: number, cy: number, radius: number,
    excludeKinds: readonly EnemyKind[],
  ): Enemy | null {
    return this.enemySys.killRandomEnemyInRadiusExcluding(cx, cy, radius, excludeKinds);
  }

  // ─── 身体上限 (spec §5.9 最多 2 个，委托 EnemySystem) ──────────────────
  canSpawnBody(): boolean {
    return this.enemySys.canSpawnBody();
  }
  registerBody(): void {
    this.enemySys.registerBody();
  }
  unregisterBody(): void {
    this.enemySys.unregisterBody();
  }

  // ─── 玩家占位普攻 (spec §3.1 弱拳 5 伤，委托 EnemySystem) ──────────────
  playerAttack(direction: Vec2): void {
    this.enemySys.playerAttack(direction);
  }

  /** spec §9.3: 缄默者复制 ×2（委托 EnemySystem）。 */
  duplicateSilentOnes(playerViewport: { x: number; y: number; width: number; height: number }): number {
    return this.enemySys.duplicateSilentOnes(playerViewport);
  }

  // ─── 主循环 ────────────────────────────────────────────────────────────
  update(deltaMs: number): void {
    this.timeMs += deltaMs;
    if (this.player.isDead) return;

    // Task 8 (#7): 更新所有敌人的 currentRoomId — 每帧根据坐标点在哪个房间矩形内
    // 走廊（无房间匹配）保持上次值；dead 敌人跳过；含边界（>= / <=）
    // frozen 状态下也调用（敌人位置可被外部修改）。
    this.enemySys.updateRoomAssignments();

    // M6: 雾战遮罩冻结敌人 AI — frozen=true 时仅更新视觉特效，跳过敌人 AI/弹幕/区域/接触伤害。
    // 视觉特效（wallHitParticles）不冻结，避免粒子卡死屏幕。
    if (this.frozen) {
      this.updateVisualEffects(deltaMs);
      return;
    }

    // 1. 玩家 debuff tick
    this.player.tick(deltaMs);
    if (this.player.isDead) return;

    // 1b. Task 6 (#4): 撞墙粒子老化 — 先于 updateProjectiles（同帧新生成的粒子不应被老化）
    this.updateWallHitParticles(deltaMs);

    // 2. 敌人 AI 更新 — spec#5 §5.2 拆分：委托到 EnemySystem.updateAI
    //    spec §5.11.7 远房 4Hz 降级：当前/邻接 60Hz；远房 4Hz（每 250ms 推进 250ms deltaMs）。
    //    召唤核心召唤计时器 / 头颅复活检查始终按真实时间推进（spec §5.9 A/C 例外）。
    this.enemySys.updateAI(deltaMs);

    // 3. 弹幕推进 — spec#5 §5.2 拆分：委托到 ProjectileSystem
    this.projSys.updateEnemyProjectiles(deltaMs);

    // 4. 区域推进 — spec#5 §5.2 拆分：委托到 ZoneSystem
    this.zoneSys.updateEnemyZones(deltaMs);

    // 4b. plan 4: 玩家侧投射物 & 区域推进 — 委托到 ProjectileSystem / ZoneSystem
    this.projSys.updatePlayerProjectiles(deltaMs);
    this.zoneSys.updatePlayerZones(deltaMs);

    // 5. 接触伤害 — 委托到 EnemySystem
    this.enemySys.applyContactDamage(deltaMs);

    // 6. 粉笔尘云视野减益 — 委托到 EnemySystem
    this.enemySys.updateVisionDebuff();

    // 7. 清理死亡敌人（含 onBodyDied / onBoundHeadDied）— 委托到 EnemySystem
    this.enemySys.handleDeadEnemies();
  }

  // ─── 撞墙粒子 API（委托 WallHitParticleSystem） ────────────────────────
  // Task 6 (#4): WallHitRenderer.sync() 每帧读取 getWallHitParticles() 同步视图
  spawnWallHitFx(x: number, y: number): void {
    this.wallHitSys.spawn(x, y);
  }

  getWallHitParticles(): readonly WallHitParticle[] {
    return this.wallHitSys.get();
  }

  private updateWallHitParticles(deltaMs: number): void {
    this.wallHitSys.update(deltaMs);
  }

  /** M6: frozen 时仅推进视觉特效（不冻结粒子，避免屏幕残留）。 */
  private updateVisualEffects(deltaMs: number): void {
    this.wallHitSys.update(deltaMs);
  }

  // 供子类/场景生成 id
  nextProjectileId(): string {
    return `proj-${this.projectileCounter++}`;
  }
  nextZoneId(): string {
    return `zone-${this.zoneCounter++}`;
  }
}
