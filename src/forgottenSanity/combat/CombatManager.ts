// src/forgottenSanity/combat/CombatManager.ts
// 战斗管理器主循环。纯 TS，无 Phaser import。
// spec §3.1 / §3.3 / §5.9 / §5.10，grill 2026-07-17 补全噪声传递
import {
  PLAYER_CONTACT_DAMAGE_COOLDOWN_MS,
  WEAK_PUNCH_DAMAGE,
  type DamageCategory,
  type DamageInstance,
  type Debuff,
} from './DamageType';
import {
  type CombatRng,
  Enemy,
  type EnemyKind,
  type EnemyUpdateContext,
  type Projectile,
  type ProceduralKind,
  type ZoneEffect,
  createCombatRng,
  createEnemy,
  type Vec2,
} from './Enemy';
import { PlayerCombat } from './PlayerCombat';

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

// ---------------------------------------------------------------------------
// plan 4: 玩家侧投射物 & 区域（武器系统）
// ---------------------------------------------------------------------------

/** 玩家投射物（武器普攻/大招生成，伤害敌人） */
export interface PlayerProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  damage: number;
  category: DamageCategory;
  debuff?: Debuff;
  pierceRemaining: number;   // 剩余可穿透数；0 = 命中 1 个后消失；Infinity = 无限穿透
  remainingMs: number;
  radius: number;
  proceduralKind: ProceduralKind;  // WeaponProjectileKind 之一
}

/** 玩家区域（武器大招生成，跟随玩家或固定位置） */
export interface PlayerZone {
  id: string;
  shape: 'circle';
  x: number;
  y: number;
  radius: number;
  burstDamage: number;        // 生成时对范围内敌人一次性伤害
  damagePerSecond: number;    // 持续 DoT
  category: DamageCategory;
  debuff?: Debuff;
  remainingMs: number;
  applyDebuffOnce: boolean;
  debuffApplied: boolean;
  followPlayer: boolean;      // true = 每帧跟随玩家位置（血轮/尺子风暴/拳套冲拳/万锁绞杀）
  proceduralKind: ProceduralKind;  // WeaponZoneKind 之一
}

// Task 6 (#4): 撞墙粒子 — 3 个 / 随机方向 50px/s / 200ms 渐隐 / 白色 0xffffff
export interface WallHitParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  color: number;
}

const MAX_DAN_YUXUAN_BODIES = 2;
const PLAYER_ATTACK_RANGE = 64;
const PLAYER_ATTACK_HALF_ANGLE = Math.PI / 4; // 45° 半角 → 90° 扇形
// 设计变更：杨云红边中立→激怒。玩家攻击命中敌人时，350px 视野内的中立杨云红边永久激怒。
// CombatManager 不 import 敌人子类（保持核心与插件解耦），故本地声明，数值与 YangYunRed.VISION_RANGE 一致。
const ELITE_AGGRO_VISION_RANGE = 350;
// Task 6 (#4): 撞墙粒子参数
const WALL_HIT_PARTICLE_COUNT = 3;
const WALL_HIT_PARTICLE_SPEED = 50;        // px/s
const WALL_HIT_PARTICLE_LIFE_MS = 200;
const WALL_HIT_PARTICLE_COLOR = 0xffffff;
// Task 6 (#4): 敌侧投射物子步进最大步长（px），避免高速穿墙
const ENEMY_PROJECTILE_SUBSTEP_PX = 4;

export class CombatManager {
  readonly player: PlayerCombat;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: ZoneEffect[] = [];
  // plan 4: 玩家侧（武器系统）投射物 & 区域
  readonly playerProjectiles: PlayerProjectile[] = [];
  readonly playerZones: PlayerZone[] = [];
  private playerPosition: Vec2 = { x: 0, y: 0 };
  private readonly isWalkable: IsWalkableFn;
  private readonly rng: CombatRng;
  private readonly callbacks: CombatCallbacks;
  private bodyCount = 0;
  private timeMs = 0;
  private projectileCounter = 0;
  private zoneCounter = 0;
  private enemyCounter = 0;
  // plan 4: 投射物命中追踪（每枚投射物仅命中同一敌人一次）
  private readonly projectileHitTracker = new Map<string, Set<string>>();
  // spec §5.11.7: 远房 4Hz 降级 — 玩家当前房间 + 邻接表 + 远房累计毫秒
  private playerRoomId: string | null = null;
  private adjacentRooms: Map<string, Set<string>> = new Map();
  private readonly farRoomAccumMs = new Map<string, number>();
  // Task 8 (#7): 房间矩形清单 — 用于每帧点在矩形内更新 enemy.currentRoomId。
  // 默认空数组；setRooms 未调用时 enemy.currentRoomId 永不更新（向后兼容现有测试与未集成场景）。
  private rooms: readonly RoomInfo[] = [];
  // Task 6 (#4): 撞墙粒子池（spawnWallHitFx 生成，updateWallHitParticles 推进）
  private readonly wallHitParticles: WallHitParticle[] = [];
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

    // 转发玩家回调
    this.player.onDied = () => this.callbacks.onPlayerDied?.();
    this.player.onDamaged = (i) => this.callbacks.onPlayerDamaged?.(i);
    this.player.onDebuffApplied = (d) => this.callbacks.onPlayerDebuffApplied?.(d);
  }

  setPlayerPosition(x: number, y: number): void {
    this.playerPosition = { x, y };
  }

  getPlayerPosition(): Vec2 {
    return this.playerPosition;
  }

  /** spec §5.11.7: 设置玩家当前所在房间 ID（用于远房 4Hz 降级判定）。 */
  setPlayerRoomId(roomId: string | null): void {
    this.playerRoomId = roomId;
  }

  /** spec §5.11.7: 设置房间邻接表（key=房间 ID，value=邻接房间 ID 集合，双向）。 */
  setAdjacentRooms(map: Map<string, Set<string>>): void {
    this.adjacentRooms = map;
  }

  /** spec §5.11.7 远房累计测试 helper：直接写入 enemy 远房累计毫秒，模拟远房 4Hz 降级场景。
   *  仅供测试使用 — 运行时由 update() 自然累积。 */
  setFarRoomAccumMs(enemyId: string, ms: number): void {
    this.farRoomAccumMs.set(enemyId, ms);
  }

  /** spec §5.11.7 远房累计测试 helper：查询 enemy 是否仍有远房累计条目。
   *  仅供测试使用 — 用于断言 handleDeadEnemies 是否清理了 dead 敌人的残留条目。 */
  hasFarRoomAccumMs(enemyId: string): boolean {
    return this.farRoomAccumMs.has(enemyId);
  }

  /** Task 8 (#7): 设置房间矩形清单，update() 每帧顶部据此更新 enemy.currentRoomId。
   *  与 map/forgottenSanityMapState.ts 的 ForgottenSanityRoom 结构兼容（仅需 id + bounds）。 */
  setRooms(rooms: readonly RoomInfo[]): void {
    this.rooms = rooms;
  }

  /** M6: 冻结/解冻敌人 AI。frozen=true 时 update() 仅推进视觉特效（wallHitParticles），
   *  跳过敌人 AI、弹幕、区域、接触伤害等。视觉特效不冻结以避免粒子卡死屏幕。 */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /** M6: 当前是否处于冻结状态。 */
  isFrozen(): boolean {
    return this.frozen;
  }

  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  removeEnemy(enemy: Enemy): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  spawnProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  spawnZone(z: ZoneEffect): void {
    this.zones.push(z);
  }

  // ===========================================================================
  // plan 4: 玩家侧伤害 API（加法式，不修改既有 playerAttack/spawnProjectile/spawnZone）
  // ===========================================================================

  spawnPlayerProjectile(p: PlayerProjectile): void {
    this.playerProjectiles.push(p);
    this.projectileHitTracker.set(p.id, new Set());
  }

  spawnPlayerZone(z: PlayerZone): void {
    z.debuffApplied = false;
    this.playerZones.push(z);
  }

  getTimeMs(): number {
    return this.timeMs;
  }

  /** 对扇形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血（用于吸血）。 */
  damageEnemiesInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    if (this.player.isDead) return 0;
    let totalDealt = 0;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) return 0;
    const ux = dirX / len;
    const uy = dirY / len;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - originX;
      const dy = enemy.y - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range + enemy.contactRadius) continue;
      if (dist === 0) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
        continue;
      }
      const dot = (dx / dist) * ux + (dy / dist) * uy;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (Math.abs(normalizeAngle(angle)) <= halfAngle) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
      }
    }
    this.handleDeadEnemies();
    return totalDealt;
  }

  /** 对扇形范围内最近的单个敌人造成伤害（grill: meleeFan 单体近战原则）。返回实际扣血。 */
  damageClosestEnemyInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    return this.damageClosestEnemyInFanWithHit(
      originX, originY, dirX, dirY, range, halfAngle, instance,
    ).damage;
  }

  /** #3 fistDash 去重：返回命中敌人 id（未命中返回 null），供路径+末端同敌去重使用。 */
  damageClosestEnemyInFanWithHit(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): { damage: number; enemyId: string | null } {
    if (this.player.isDead) return { damage: 0, enemyId: null };
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) return { damage: 0, enemyId: null };
    const ux = dirX / len;
    const uy = dirY / len;
    let closest: Enemy | null = null;
    let closestDist = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - originX;
      const dy = enemy.y - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range + enemy.contactRadius) continue;
      if (dist === 0) {
        if (dist < closestDist) {
          closest = enemy;
          closestDist = dist;
        }
        continue;
      }
      const dot = (dx / dist) * ux + (dy / dist) * uy;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (Math.abs(normalizeAngle(angle)) <= halfAngle && dist < closestDist) {
        closest = enemy;
        closestDist = dist;
      }
    }
    if (closest === null) return { damage: 0, enemyId: null };
    const dealt = this.applyDamageInstanceToEnemy(closest, instance);
    this.handleDeadEnemies();
    return { damage: dealt, enemyId: closest.id };
  }

  /** 对圆形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血。
   *  options.excludeIds：跳过已命中敌人 id（#3 fistDash 路径+末端去重）。
   *  options.source：调试/日志标识（当前实现未使用，保留以备将来扩展）。 */
  damageEnemiesInCircle(
    cx: number, cy: number, radius: number,
    instance: DamageInstance,
    options?: { excludeIds?: Set<string>; source?: string },
  ): number {
    if (this.player.isDead) return 0;
    const excludeIds = options?.excludeIds;
    let totalDealt = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (excludeIds !== undefined && excludeIds.has(enemy.id)) continue;
      const dist = Math.hypot(enemy.x - cx, enemy.y - cy);
      if (dist <= radius + enemy.contactRadius) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
      }
    }
    this.handleDeadEnemies();
    return totalDealt;
  }

  /** 将范围内敌人向中心拉近 pullDistance（不超过中心）。 */
  pullEnemiesToward(cx: number, cy: number, radius: number, pullDistance: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = cx - enemy.x;
      const dy = cy - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + enemy.contactRadius || dist === 0) continue;
      const step = Math.min(pullDistance, dist);
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
    }
  }

  /** 秒杀范围内一个随机非排除种类敌人。返回被杀敌人或 null。
   *  M11: excludeKinds 排除指定种类（万魂幡排除 yangYunRed + danYuxuanBody）；
   *       isDuplicate=true 的复制体也被保守排除（防止秒杀复制体绕过递归保护语义）。 */
  killRandomEnemyInRadiusExcluding(
    cx: number, cy: number, radius: number,
    excludeKinds: readonly EnemyKind[],
  ): Enemy | null {
    const eligible = this.enemies.filter(
      (e) => !e.dead
        && !e.isDuplicate
        && !excludeKinds.includes(e.kind)
        && Math.hypot(e.x - cx, e.y - cy) <= radius + e.contactRadius,
    );
    if (eligible.length === 0) return null;
    const idx = Math.floor(this.rng.next() * eligible.length);
    const target = eligible[idx]!;
    target.hp = 0;
    target.dead = true;
    this.handleDeadEnemies();
    return target;
  }

  /** 对单个敌人应用伤害实例（amount + debuff）。amount<=0 时仍应用 debuff。返回实际扣血。 */
  private applyDamageInstanceToEnemy(enemy: Enemy, instance: DamageInstance): number {
    if (enemy.dead) return 0;
    let dealt = 0;
    if (instance.amount > 0) {
      const before = enemy.hp;
      enemy.applyDamage(instance);
      dealt = before - enemy.hp;
    }
    if (instance.debuff !== undefined) {
      enemy.applyDebuff(instance.debuff);
    }
    return dealt;
  }

  /** 子步进推进玩家投射物（避免高速穿透隧道）。 */
  private updatePlayerProjectiles(deltaMs: number): void {
    const maxStep = 8; // px per sub-step
    for (const p of this.playerProjectiles) {
      if (p.speed <= 0) {
        p.remainingMs -= deltaMs;
        continue;
      }
      const totalDist = p.speed * (deltaMs / 1000);
      const steps = Math.max(1, Math.ceil(totalDist / maxStep));
      const stepDist = totalDist / steps;
      const stepDt = deltaMs / steps;
      const ux = p.vx / p.speed;
      const uy = p.vy / p.speed;
      for (let s = 0; s < steps; s++) {
        const nextX = p.x + ux * stepDist;
        const nextY = p.y + uy * stepDist;
        // spec §3.2: rangedPiercing 遇墙停止 — 下一步不可走则立即移除投射物
        if (!this.isWalkable(nextX, nextY)) {
          p.remainingMs = 0;
          break;
        }
        p.x = nextX;
        p.y = nextY;
        p.remainingMs -= stepDt;
        let hitSet = this.projectileHitTracker.get(p.id);
        if (hitSet === undefined) {
          hitSet = new Set();
          this.projectileHitTracker.set(p.id, hitSet);
        }
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          if (p.pierceRemaining < 0) break;
          if (hitSet.has(enemy.id)) continue;
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist <= p.radius + enemy.contactRadius) {
            this.applyDamageInstanceToEnemy(enemy, {
              amount: p.damage,
              category: p.category,
              ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
            });
            hitSet.add(enemy.id);
            if (p.pierceRemaining === Infinity) continue;
            p.pierceRemaining -= 1;
          }
        }
        if (p.pierceRemaining < 0 || p.remainingMs <= 0) break;
      }
    }
    for (let i = this.playerProjectiles.length - 1; i >= 0; i--) {
      const p = this.playerProjectiles[i]!;
      if (p.remainingMs <= 0 || p.pierceRemaining < 0) {
        this.projectileHitTracker.delete(p.id);
        this.playerProjectiles.splice(i, 1);
      }
    }
  }

  /** 推进玩家区域（跟随玩家 / burst / DoT / debuff）。 */
  private updatePlayerZones(deltaMs: number): void {
    const pos = this.playerPosition;
    const seconds = deltaMs / 1000;
    for (const z of this.playerZones) {
      if (z.followPlayer) {
        z.x = pos.x;
        z.y = pos.y;
      }
      // burst 一次性
      if (!z.debuffApplied && (z.burstDamage > 0 || (z.applyDebuffOnce && z.debuff !== undefined))) {
        this.damageEnemiesInCircle(z.x, z.y, z.radius, {
          amount: z.burstDamage,
          category: z.category,
          ...(z.debuff !== undefined && z.applyDebuffOnce ? { debuff: z.debuff } : {}),
        });
        z.debuffApplied = true;
      }
      // DoT
      if (z.damagePerSecond > 0) {
        this.damageEnemiesInCircle(z.x, z.y, z.radius, {
          amount: z.damagePerSecond * seconds,
          category: z.category,
          ...(z.debuff !== undefined && !z.applyDebuffOnce ? { debuff: z.debuff } : {}),
        });
      }
      z.remainingMs -= deltaMs;
    }
    for (let i = this.playerZones.length - 1; i >= 0; i--) {
      if (this.playerZones[i]!.remainingMs <= 0) {
        this.playerZones.splice(i, 1);
      }
    }
  }

  /** feared 敌人逃离源（覆盖 AI movement）。 */
  private moveEnemyFleeing(enemy: Enemy, deltaMs: number, fleeFrom: { x: number; y: number }): void {
    const dx = enemy.x - fleeFrom.x;
    const dy = enemy.y - fleeFrom.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      // 与源重合，随机方向逃离
      enemy.x += enemy.speed * (deltaMs / 1000);
      return;
    }
    const step = enemy.speed * (deltaMs / 1000);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
  }

  // -- 身体上限 (spec §5.9 最多 2 个) --
  canSpawnBody(): boolean {
    return this.bodyCount < MAX_DAN_YUXUAN_BODIES;
  }
  registerBody(): void {
    this.bodyCount++;
  }
  unregisterBody(): void {
    if (this.bodyCount > 0) this.bodyCount--;
  }

  // -- 玩家占位普攻 (spec §3.1 弱拳 5 伤) --
  playerAttack(direction: Vec2): void {
    if (this.player.isDead) return;
    let dirX = direction.x;
    let dirY = direction.y;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) {
      dirX = 0;
      dirY = 1; // 默认朝下
    } else {
      dirX /= len;
      dirY /= len;
    }
    const instance: DamageInstance = { amount: WEAK_PUNCH_DAMAGE, category: 'melee' };
    const hitEnemies: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - this.playerPosition.x;
      const dy = enemy.y - this.playerPosition.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > PLAYER_ATTACK_RANGE + enemy.contactRadius) continue;
      if (dist === 0) {
        enemy.applyDamage(instance);
        hitEnemies.push(enemy);
        continue;
      }
      const dot = (dx / dist) * dirX + (dy / dist) * dirY;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (angle <= PLAYER_ATTACK_HALF_ANGLE) {
        enemy.applyDamage(instance);
        hitEnemies.push(enemy);
      }
    }
    // 设计变更：玩家攻击命中 → 检查视野内中立杨云红边激怒
    this.applyEliteAggro(hitEnemies);
    this.handleDeadEnemies();
  }

  // 设计变更：杨云红边中立→激怒机制。
  // 玩家攻击命中任何敌人时，所有处于中立状态、且距被命中敌人 ≤350px 视野内的杨云红边永久激怒。
  // 命中杨云红边本人时（距离 0）其自身亦激怒。
  // 通过 duck-typing 访问 aggroState/enrage（项目 E2E 可观察性模式，与 onBoundHeadDied 探测一致）。
  private applyEliteAggro(hitEnemies: readonly Enemy[]): void {
    if (hitEnemies.length === 0) return;
    const rangeSq = ELITE_AGGRO_VISION_RANGE * ELITE_AGGRO_VISION_RANGE;
    for (const target of hitEnemies) {
      for (const e of this.enemies) {
        if (e.dead || e.kind !== 'yangYunRed') continue;
        const elite = e as unknown as { aggroState: 'neutral' | 'hostile'; enrage: () => void };
        if (elite.aggroState !== 'neutral') continue;
        const ddx = e.x - target.x;
        const ddy = e.y - target.y;
        if (ddx * ddx + ddy * ddy <= rangeSq) {
          elite.enrage();
        }
      }
    }
  }

  // -- 主循环 --
  update(deltaMs: number): void {
    this.timeMs += deltaMs;
    if (this.player.isDead) return;

    // Task 8 (#7): 更新所有敌人的 currentRoomId — 每帧根据坐标点在哪个房间矩形内
    // 走廊（无房间匹配）保持上次值；dead 敌人跳过；含边界（>= / <=）
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      for (const room of this.rooms) {
        const b = room.bounds;
        if (enemy.x >= b.x && enemy.x <= b.x + b.width
          && enemy.y >= b.y && enemy.y <= b.y + b.height) {
          enemy.currentRoomId = room.id;
          break;
        }
      }
    }

    // M6: 雾战遮罩冻结敌人 AI — frozen=true 时仅更新视觉特效，跳过敌人 AI/弹幕/区域/接触伤害。
    // 放在 currentRoomId 更新之后（Task 8 逻辑保留），敌人 AI 推进之前。
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

    // 2. 敌人 AI 更新 — spec §5.11.7 远房 4Hz 降级
    //    当前/邻接房间 60Hz；远房（非当前非邻接）4Hz（每 250ms 推进一次 250ms deltaMs）。
    //    但召唤核心的召唤计时器（tickSummonTimer）和头颅复活检查（tickHeadRevive）
    //    始终按真实时间推进（spec §5.9 A/C，远房降级例外）。
    const ctx = this.makeContext();
    const playerRoomId = this.playerRoomId;
    const adjacent = playerRoomId !== null
      ? (this.adjacentRooms.get(playerRoomId) ?? new Set<string>())
      : new Set<string>();

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.invulnMs > 0) enemy.invulnMs = Math.max(0, enemy.invulnMs - deltaMs);
      if (enemy.contactCooldownMs > 0) {
        enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
      }
      enemy.tickStatus(deltaMs);
      if (enemy.dead) continue;

      // spec §5.9 A: 召唤核心召唤计时器始终按真实时间推进（远房降级例外）
      const summonExt = enemy as unknown as { tickSummonTimer?: (ms: number) => void };
      if (typeof summonExt.tickSummonTimer === 'function') {
        summonExt.tickSummonTimer(deltaMs);
      }
      // spec §5.9 C: 头颅复活检查也始终按真实 timeMs 推进（远房降级例外）
      const reviveExt = enemy as unknown as {
        tickHeadRevive?: (nowMs: number, spawnFn: (kind: EnemyKind, x: number, y: number, parentId: string) => Enemy | null) => number;
      };
      if (typeof reviveExt.tickHeadRevive === 'function') {
        reviveExt.tickHeadRevive(this.timeMs, (kind, x, y, parentId) => {
          return this.spawnEnemyAt(kind, x, y, parentId);
        });
      }

      if (enemy.isStunned() || enemy.isRooted()) continue;
      const fleeFrom = enemy.getFleeFrom();
      if (fleeFrom !== null) {
        this.moveEnemyFleeing(enemy, deltaMs, fleeFrom);
        continue;
      }

      // 双路：当前/邻接 60Hz；远房 4Hz（250ms/帧）
      // playerRoomId 未设置（场景尚未同步房间）时按近房 60Hz 处理（向后兼容 + 首帧保护）
      const enemyRoomId = enemy.currentRoomId;
      const inNearRoom = playerRoomId === null
        || enemyRoomId === playerRoomId
        || (enemyRoomId !== null && adjacent.has(enemyRoomId));
      if (inNearRoom) {
        enemy.update(deltaMs, ctx);
      } else {
        const acc = (this.farRoomAccumMs.get(enemy.id) ?? 0) + deltaMs;
        if (acc >= 250) {
          enemy.update(250, ctx);
          this.farRoomAccumMs.set(enemy.id, acc - 250);
        } else {
          this.farRoomAccumMs.set(enemy.id, acc);
        }
      }
    }

    // 3. 弹幕推进
    this.updateProjectiles(deltaMs);

    // 4. 区域推进
    this.updateZones(deltaMs);

    // 4b. plan 4: 玩家侧投射物 & 区域推进
    this.updatePlayerProjectiles(deltaMs);
    this.updatePlayerZones(deltaMs);

    // 5. 接触伤害
    this.applyContactDamage(deltaMs);

    // 6. 粉笔尘云视野减益
    this.updateVisionDebuff();

    // 7. 清理死亡敌人（含 onBodyDied / onBoundHeadDied）
    this.handleDeadEnemies();
  }

  private makeContext(): EnemyUpdateContext {
    // grill 2026-07-17：把 PlayerCombat.lastNoiseRadius 转为玩家位置上的噪声事件
    const noise = this.player.lastNoiseRadius > 0
      ? { x: this.playerPosition.x, y: this.playerPosition.y, radius: this.player.lastNoiseRadius }
      : null;
    return {
      playerPosition: this.playerPosition,
      timeMs: this.timeMs,
      rng: this.rng,
      playerNoise: noise,
      spawnProjectile: (p) => this.spawnProjectile(p),
      spawnZone: (z) => this.spawnZone(z),
      spawnEnemy: (kind, pos, parentId) => this.spawnEnemyInternal(kind, pos, parentId),
      isWalkable: this.isWalkable,
    };
  }

  private spawnEnemyInternal(kind: EnemyKind, pos: Vec2, parentId?: string): Enemy | null {
    const id = `${kind}-${this.timeMs}-${Math.floor(this.rng.next() * 100000)}`;
    const opts = this.defaultEnemyOpts(kind, id, pos.x, pos.y);
    const enemy = createEnemy(kind, opts);
    if (enemy === null) return null;
    if (parentId !== undefined) enemy.parentId = parentId;
    this.addEnemy(enemy);
    return enemy;
  }

  /** spec §5.9 C: 在指定位置生成绑定身体的头颅（由 DanYuxuanBodyEnemy.tickHeadRevive 调用）。 */
  private spawnEnemyAt(kind: EnemyKind, x: number, y: number, parentId: string): Enemy | null {
    const id = `enemy-${this.enemyCounter++}`;
    const opts = this.defaultEnemyOpts(kind, id, x, y);
    const enemy = createEnemy(kind, opts);
    if (enemy === null) return null;
    enemy.parentId = parentId;
    this.enemies.push(enemy);
    return enemy;
  }

  /** spec §9.3: 缄默者复制 ×2 — 仅复制 8 种普通缄默者（排除但宇轩身体、杨云红边、影分身）。
   *  复制体出生位置在玩家视口 + 100px buffer 外的随机点。
   *  复制体属性与原体一致；isDuplicate=true 防止递归复制。
   *  返回复制的敌人数量。 */
  duplicateSilentOnes(playerViewport: { x: number; y: number; width: number; height: number }): number {
    const normalKinds: ReadonlySet<EnemyKind> = new Set<EnemyKind>([
      'butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone',
      'bloodHand', 'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye',
    ]);
    const originals = this.enemies.filter(
      (e) => !e.dead && !e.isDuplicate && normalKinds.has(e.kind),
    );
    let duplicated = 0;
    const buffer = 100;
    const vx0 = playerViewport.x - buffer;
    const vx1 = playerViewport.x + playerViewport.width + buffer;
    const vy0 = playerViewport.y - buffer;
    const vy1 = playerViewport.y + playerViewport.height + buffer;
    for (const orig of originals) {
      let nx = 0, ny = 0;
      let ok = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        nx = this.rng.int(0, 5000);
        ny = this.rng.int(0, 4000);
        const inBuffer = nx >= vx0 && nx <= vx1 && ny >= vy0 && ny <= vy1;
        if (!inBuffer && this.isWalkable(nx, ny)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const id = `enemy-${this.enemyCounter++}`;
      const opts = this.defaultEnemyOpts(orig.kind, id, nx, ny);
      const clone = createEnemy(orig.kind, opts);
      if (clone === null) continue;
      clone.hp = orig.hp;
      clone.parentId = orig.parentId;
      clone.isDuplicate = true;
      this.enemies.push(clone);
      duplicated += 1;
    }
    return duplicated;
  }

  private defaultEnemyOpts(kind: EnemyKind, id: string, x: number, y: number) {
    // 各敌人初始数值；与子类构造保持一致
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
      yangYunRed: { maxHp: 320, speed: 95, contactDamage: 22, contactRadius: 30 },
      yangYunRedPhantom: { maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 24 },
    };
    const s = table[kind];
    return { id, x, y, maxHp: s.maxHp, speed: s.speed, contactDamage: s.contactDamage, contactRadius: s.contactRadius };
  }

  private updateProjectiles(deltaMs: number): void {
    // Task 6 (#4): 子步进推进 — 避免高速投射物穿墙
    //   一帧内按 ENEMY_PROJECTILE_SUBSTEP_PX 分多步推进，每步先检查 isWalkable
    //   不可走 → 在当前（最后一个可走）位置生成 spawnWallHitFx 并移除投射物
    //   保留现有 homing 转向（一帧一次）与玩家碰撞逻辑（每步检查）
    const dead: number[] = [];
    const seconds = deltaMs / 1000;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i]!;
      // 追踪（保留：一帧一次转向）
      if (p.homingTarget === 'player') {
        const dx = this.playerPosition.x - p.x;
        const dy = this.playerPosition.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.001) {
          const desiredVx = (dx / dist) * p.speed;
          const desiredVy = (dy / dist) * p.speed;
          const turn = Math.min(1, p.homingStrength * seconds);
          p.vx = p.vx + (desiredVx - p.vx) * turn;
          p.vy = p.vy + (desiredVy - p.vy) * turn;
          // 归一化速度
          const vlen = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (vlen > 0.001) {
            p.vx = (p.vx / vlen) * p.speed;
            p.vy = (p.vy / vlen) * p.speed;
          }
        }
      }
      // 子步进推进
      const totalDist = Math.hypot(p.vx, p.vy) * seconds;
      const steps = Math.max(1, Math.ceil(totalDist / ENEMY_PROJECTILE_SUBSTEP_PX));
      const stepDt = deltaMs / steps;
      let removed = false;
      for (let s = 0; s < steps; s++) {
        const nx = p.x + p.vx * stepDt / 1000;
        const ny = p.y + p.vy * stepDt / 1000;
        // #4: 撞墙检测 — 下一步不可走则生成墙撞粒子并移除
        if (!this.isWalkable(nx, ny)) {
          this.spawnWallHitFx(p.x, p.y);
          removed = true;
          break;
        }
        p.x = nx;
        p.y = ny;
        p.remainingMs -= stepDt;
        // 碰撞玩家（保留现有逻辑）
        if (!this.player.isDead) {
          const ddx = p.x - this.playerPosition.x;
          const ddy = p.y - this.playerPosition.y;
          if (ddx * ddx + ddy * ddy <= (p.radius + 16) * (p.radius + 16)) {
            const instance: DamageInstance = {
              amount: p.damage,
              category: p.category,
              ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
            };
            this.player.takeDamage(instance);
            p.remainingMs = 0;
            removed = true;
            break;
          }
        }
        if (p.remainingMs <= 0) {
          removed = true;
          break;
        }
      }
      if (removed) dead.push(i);
    }
    // 清理过期 / 撞墙 / 命中玩家的投射物
    for (let i = dead.length - 1; i >= 0; i--) {
      this.projectiles.splice(dead[i]!, 1);
    }
  }

  // Task 6 (#4): 撞墙粒子 API — spawnWallHitFx 生成 3 个随机方向白色粒子
  //   WallHitRenderer.sync() 每帧读取 getWallHitParticles() 同步视图
  spawnWallHitFx(x: number, y: number): void {
    for (let i = 0; i < WALL_HIT_PARTICLE_COUNT; i++) {
      const angle = this.rng.next() * Math.PI * 2;
      this.wallHitParticles.push({
        x,
        y,
        vx: Math.cos(angle) * WALL_HIT_PARTICLE_SPEED,
        vy: Math.sin(angle) * WALL_HIT_PARTICLE_SPEED,
        lifeMs: WALL_HIT_PARTICLE_LIFE_MS,
        maxLifeMs: WALL_HIT_PARTICLE_LIFE_MS,
        color: WALL_HIT_PARTICLE_COLOR,
      });
    }
  }

  getWallHitParticles(): readonly WallHitParticle[] {
    return this.wallHitParticles;
  }

  private updateWallHitParticles(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (let i = this.wallHitParticles.length - 1; i >= 0; i--) {
      const p = this.wallHitParticles[i]!;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) this.wallHitParticles.splice(i, 1);
    }
  }

  /** M6: frozen 时仅推进视觉特效（不冻结粒子，避免屏幕残留）。 */
  private updateVisualEffects(deltaMs: number): void {
    this.updateWallHitParticles(deltaMs);
  }

  private updateZones(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    for (const z of this.zones) {
      // 移动
      z.x += z.vx * seconds;
      z.y += z.vy * seconds;
      // 扩展
      if (z.expandSpeed > 0 && z.radius < z.maxRadius) {
        z.radius = Math.min(z.maxRadius, z.radius + z.expandSpeed * seconds);
      }
      if (z.windupMs > 0) {
        z.windupMs -= deltaMs;
        if (z.windupMs <= 0) {
          // windup 结束 → 结算 burst
          if (z.burstDamage > 0 && !this.player.isDead && this.pointInZone(z)) {
            const instance: DamageInstance = {
              amount: z.burstDamage,
              category: z.category,
              ...(z.debuff !== undefined ? { debuff: z.debuff } : {}),
            };
            this.player.takeDamage(instance);
            if (z.applyDebuffOnce) z.debuffApplied = true;
          }
        }
      } else {
        // DoT 阶段
        if (z.damagePerSecond > 0 && !this.player.isDead && this.pointInZone(z)) {
          const dotInstance: DamageInstance = {
            amount: z.damagePerSecond * seconds,
            category: z.category,
            ...(z.debuff !== undefined && (!z.applyDebuffOnce || !z.debuffApplied) ? { debuff: z.debuff } : {}),
          };
          this.player.takeDamage(dotInstance);
          if (z.applyDebuffOnce && z.debuff !== undefined) z.debuffApplied = true;
        }
      }
      z.remainingMs -= deltaMs;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i]!.remainingMs <= 0) this.zones.splice(i, 1);
    }
  }

  private pointInZone(z: ZoneEffect): boolean {
    const dx = z.x - this.playerPosition.x;
    const dy = z.y - this.playerPosition.y;
    if (z.shape === 'circle') {
      return dx * dx + dy * dy <= z.radius * z.radius;
    }
    // rect 旋转
    const cos = Math.cos(-z.angle);
    const sin = Math.sin(-z.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= z.width / 2 && Math.abs(ly) <= z.height / 2;
  }

  private applyContactDamage(_deltaMs: number): void {
    if (this.player.isDead) return;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      // 设计变更：中立杨云红边不攻击玩家（含接触伤害）
      if (enemy.kind === 'yangYunRed') {
        const elite = enemy as unknown as { aggroState: 'neutral' | 'hostile' };
        if (elite.aggroState === 'neutral') continue;
      }
      const dist = enemy.distanceTo(this.playerPosition.x, this.playerPosition.y);
      if (dist > enemy.contactRadius + 16) continue;
      // 粉笔尘云：持续 DoT 接触（5/s），无冷却
      if (enemy.kind === 'chalkDust') {
        const dotInstance: DamageInstance = {
          amount: enemy.contactDamage * (_deltaMs / 1000),
          category: 'dot',
        };
        this.player.takeDamage(dotInstance);
        continue;
      }
      // 普通敌人：1s 冷却
      if (enemy.contactCooldownMs > 0) continue;
      // 杨云红边二阶段接触附加 burn
      const burnDebuff = enemy.contactBurn !== null
        ? { type: 'burn' as const, dps: enemy.contactBurn.dps, remainingMs: enemy.contactBurn.durationMs }
        : undefined;
      // spec §5.10 杨云红边冲撞期间 contactDamageOverride=50
      const effectiveDamage = enemy.contactDamageOverride ?? enemy.contactDamage;
      const instance: DamageInstance = burnDebuff !== undefined
        ? { amount: effectiveDamage, category: 'melee', debuff: burnDebuff }
        : { amount: effectiveDamage, category: 'melee' };
      this.player.takeDamage(instance);
      enemy.contactCooldownMs = PLAYER_CONTACT_DAMAGE_COOLDOWN_MS;
      // 击退（仅冲撞中的杨云红边触发）
      if (enemy.kind === 'yangYunRed' && enemy.contactDamageOverride !== null) {
        const elite = enemy as unknown as {
          chargeState: 'idle' | 'windup' | 'charging';
          chargeDirX: number;
          chargeDirY: number;
        };
        if (elite.chargeState === 'charging') {
          const knockbackPx = 80;
          this.callbacks.onKnockback?.(
            elite.chargeDirX * knockbackPx,
            elite.chargeDirY * knockbackPx,
            200,
          );
        }
      }
    }
  }

  private updateVisionDebuff(): void {
    let inChalk = false;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind !== 'chalkDust') continue;
      const dist = enemy.distanceTo(this.playerPosition.x, this.playerPosition.y);
      if (dist <= enemy.contactRadius + 40) {
        inChalk = true;
        break;
      }
    }
    this.callbacks.onVisionReduced?.(0.3, inChalk);
  }

  private handleDeadEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (!enemy.dead) continue;
      // 通知身体：绑定头颅死亡（spec §5.9 B/C）
      if (enemy.parentId !== null) {
        const body = this.enemies.find((e) => e.id === enemy.parentId && !e.dead);
        if (body !== undefined && typeof (body as unknown as { onBoundHeadDied?: (head: Enemy, timeMs: number) => void }).onBoundHeadDied === 'function') {
          (body as unknown as { onBoundHeadDied: (head: Enemy, timeMs: number) => void }).onBoundHeadDied(enemy, this.timeMs);
        }
        // 30% 标记身体位置
        if (this.rng.chance(0.3)) {
          this.callbacks.onMarkBodyOnMinimap?.(enemy.parentId, body?.x ?? 0, body?.y ?? 0);
        }
      }
      // 身体死亡 → 通知 onBodyDied（spec §5.9 B 机制 B：清场所有绑定头颅）
      if (enemy.kind === 'danYuxuanBody') {
        const body = enemy as unknown as { onBodyDied?: () => void };
        if (typeof body.onBodyDied === 'function') {
          body.onBodyDied();
        }
      }
      // 精英死亡事件
      if (enemy.kind === 'yangYunRed') {
        this.callbacks.onEliteDefeated?.();
      }
      this.callbacks.onEnemyKilled?.(enemy);
      // Task 21 (1.2): 清理 dead 敌人的远房累计计时器，避免残留泄漏
      this.farRoomAccumMs.delete(enemy.id);
      this.enemies.splice(i, 1);
    }
  }

  // 供子类/场景生成 id
  nextProjectileId(): string {
    return `proj-${this.projectileCounter++}`;
  }
  nextZoneId(): string {
    return `zone-${this.zoneCounter++}`;
  }
}

/** 归一化角度到 [-π, π]。 */
function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
