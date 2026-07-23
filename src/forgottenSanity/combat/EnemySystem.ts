// src/forgottenSanity/combat/EnemySystem.ts
// spec#5 §5.2 拆分：敌人子系统 — 从 CombatManager 抽出。
// 纯 TS，无 Phaser import。职责：
//   - enemies 数组持有 + 增删
//   - 房间分配（每帧根据坐标点在矩形内更新 enemy.currentRoomId，Task 8 #7）
//   - AI 调度（60Hz 近房 / 4Hz 远房，spec §5.11.7）
//   - 玩家占位普攻（弱拳 5 伤，spec §3.1）
//   - 杨云红边激怒检测（设计变更：中立→激怒，350px 视野）
//   - 缄默者复制 ×2（spec §9.3 duplicateSilentOnes）
//   - 接触伤害（spec §3.3 + §5.10 杨云红边冲撞击退）
//   - 粉笔尘云视野减益
//   - 死亡敌人清理（onBodyDied / onBoundHeadDied / onEliteDefeated / 30% 标记身体）
//   - 身体上限（spec §5.9 最多 2 个）
//   - 远房累计 + 房间清单 + 邻接表（spec §5.11.7）
// spec §3.1 / §3.3 / §5.9 / §5.10 / §5.11.7，grill 2026-07-17。
import {
  PLAYER_CONTACT_DAMAGE_COOLDOWN_MS,
  WEAK_PUNCH_DAMAGE,
  type DamageInstance,
} from './DamageType';
import {
  type CombatRng,
  Enemy,
  type EnemyKind,
  type EnemyUpdateContext,
  type Projectile,
  type ZoneEffect,
  createEnemy,
  type Vec2,
} from './Enemy';
import { makeEnemyOpts } from './enemyDefaults';
import type { PlayerCombat } from './PlayerCombat';
import type { CombatCallbacks, IsWalkableFn, RoomInfo } from './CombatManager';

const MAX_DAN_YUXUAN_BODIES = 2;
const PLAYER_ATTACK_RANGE = 64;
const PLAYER_ATTACK_HALF_ANGLE = Math.PI / 4; // 45° 半角 → 90° 扇形
// 设计变更：杨云红边中立→激怒。玩家攻击命中敌人时，350px 视野内的中立杨云红边永久激怒。
// EnemySystem 不 import 敌人子类（保持核心与插件解耦），故本地声明，数值与 YangYunRed.VISION_RANGE 一致。
const ELITE_AGGRO_VISION_RANGE = 350;

/** EnemySystem 依赖上下文 — 由 CombatManager 门面注入。
 *  共享状态通过 getter 回调读取（player/timeMs/playerPosition），避免重复存储与失同步。
 *  spawnProjectile / spawnZone 委托回 ProjectileSystem / ZoneSystem（EnemyUpdateContext 调用）。
 *  rng / callbacks / isWalkable / player 为引用共享（门面持有，子系统只读）。 */
export interface EnemySystemContext {
  readonly isWalkable: IsWalkableFn;
  readonly rng: CombatRng;
  readonly callbacks: CombatCallbacks;
  readonly player: PlayerCombat;
  getPlayerPosition(): Vec2;
  getTimeMs(): number;
  spawnProjectile(p: Projectile): void;
  spawnZone(z: ZoneEffect): void;
}

/** 敌人子系统：enemies 数组 + AI 调度 + 接触伤害 + 死亡清理 + 身体上限 + 房间分配。
 *
 *  CombatManager.update 调度顺序：
 *    1. enemySys.updateRoomAssignments() — Task 8 房间分配（frozen 状态下也调用）
 *    2. （frozen 检查 — 门面负责）
 *    3. enemySys.updateAI(deltaMs) — AI 调度（60Hz/4Hz + flee + summonTimer + headRevive）
 *    4. projSys.updateEnemyProjectiles / zoneSys.updateEnemyZones
 *    5. projSys.updatePlayerProjectiles / zoneSys.updatePlayerZones
 *    6. enemySys.applyContactDamage(deltaMs) — 接触伤害
 *    7. enemySys.updateVisionDebuff() — 粉笔尘云视野
 *    8. enemySys.handleDeadEnemies() — 死亡清理
 *
 *  damageEnemiesInFan / damageClosestEnemyInFan / damageClosestEnemyInFanWithHit /
 *  damageEnemiesInCircle / pullEnemiesToward / killRandomEnemyInRadiusExcluding /
 *  applyDamageInstanceToEnemy 由 CombatManager 门面委托（CombatPort 契约 + 子系统 context 注入）。 */
export class EnemySystem {
  readonly enemies: Enemy[] = [];

  // spec §5.11.7: 远房 4Hz 降级 — 玩家当前房间 + 邻接表 + 远房累计毫秒
  private playerRoomId: string | null = null;
  private adjacentRooms: Map<string, Set<string>> = new Map();
  private readonly farRoomAccumMs = new Map<string, number>();
  // Task 8 (#7): 房间矩形清单 — 用于每帧点在矩形内更新 enemy.currentRoomId。
  // 默认空数组；setRooms 未调用时 enemy.currentRoomId 永不更新（向后兼容现有测试与未集成场景）。
  private rooms: readonly RoomInfo[] = [];
  // 身体上限（spec §5.9 最多 2 个但宇轩身体）
  private bodyCount = 0;
  // 敌人 id 计数器（spawnEnemyAt / duplicateSilentOnes 使用）
  private enemyCounter = 0;

  constructor(private readonly ctx: EnemySystemContext) {}

  // ─── 增删 ─────────────────────────────────────────────────────────────
  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
  }

  removeEnemy(enemy: Enemy): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  // ─── spec §5.11.7 房间 API（门面委托） ─────────────────────────────────
  /** 设置玩家当前所在房间 ID（用于远房 4Hz 降级判定）。 */
  setPlayerRoomId(roomId: string | null): void {
    this.playerRoomId = roomId;
  }

  /** 设置房间邻接表（key=房间 ID，value=邻接房间 ID 集合，双向）。 */
  setAdjacentRooms(map: Map<string, Set<string>>): void {
    this.adjacentRooms = map;
  }

  /** 远房累计测试 helper：直接写入 enemy 远房累计毫秒，模拟远房 4Hz 降级场景。
   *  仅供测试使用 — 运行时由 updateAI() 自然累积。 */
  setFarRoomAccumMs(enemyId: string, ms: number): void {
    this.farRoomAccumMs.set(enemyId, ms);
  }

  /** 远房累计测试 helper：查询 enemy 是否仍有远房累计条目。
   *  仅供测试使用 — 用于断言 handleDeadEnemies 是否清理了 dead 敌人的残留条目。 */
  hasFarRoomAccumMs(enemyId: string): boolean {
    return this.farRoomAccumMs.has(enemyId);
  }

  /** Task 8 (#7): 设置房间矩形清单，updateRoomAssignments() 每帧据此更新 enemy.currentRoomId。 */
  setRooms(rooms: readonly RoomInfo[]): void {
    this.rooms = rooms;
  }

  /** Task 8 (#7): 每帧顶部据坐标更新所有非死亡敌人 currentRoomId。
   *  frozen 状态下也调用（敌人位置可被外部修改），但走廊（无房间匹配）保持上次值。
   *  含边界（>= / <=）；dead 敌人跳过。 */
  updateRoomAssignments(): void {
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
  }

  // ─── 身体上限 (spec §5.9 最多 2 个但宇轩身体) ──────────────────────────
  canSpawnBody(): boolean {
    return this.bodyCount < MAX_DAN_YUXUAN_BODIES;
  }
  registerBody(): void {
    this.bodyCount++;
  }
  unregisterBody(): void {
    if (this.bodyCount > 0) this.bodyCount--;
  }

  // ─── 玩家占位普攻 (spec §3.1 弱拳 5 伤) ───────────────────────────────
  playerAttack(direction: Vec2): void {
    if (this.ctx.player.isDead) return;
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
    const playerPos = this.ctx.getPlayerPosition();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - playerPos.x;
      const dy = enemy.y - playerPos.y;
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

  // ─── CombatPort 玩家侧伤害 API（门面委托） ─────────────────────────────

  /** 对扇形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血（用于吸血）。 */
  damageEnemiesInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    if (this.ctx.player.isDead) return 0;
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
    if (this.ctx.player.isDead) return { damage: 0, enemyId: null };
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
    if (this.ctx.player.isDead) return 0;
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
    const idx = Math.floor(this.ctx.rng.next() * eligible.length);
    const target = eligible[idx]!;
    target.hp = 0;
    target.dead = true;
    this.handleDeadEnemies();
    return target;
  }

  /** 对单个敌人应用伤害实例（amount + debuff）。amount<=0 时仍应用 debuff。返回实际扣血。
   *  公开（public）以便 CombatManager 门面构造 ProjectileSystemContext 时注入回调
   *  （玩家投射物命中敌人时的伤害结算权威）。 */
  applyDamageInstanceToEnemy(enemy: Enemy, instance: DamageInstance): number {
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

  // ─── 主循环分段（CombatManager.update 调用） ──────────────────────────

  /** AI 推进 — CombatManager.update 在 frozen 检查通过后调用。
   *  负责：invulnMs/contactCooldownMs 倒数、tickStatus、tickSummonTimer/tickHeadRevive、
   *  flee 覆盖移动、近房 60Hz / 远房 4Hz AI 调度（spec §5.11.7）。 */
  updateAI(deltaMs: number): void {
    const ctx = this.makeContext();
    const timeMs = this.ctx.getTimeMs();
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
      // spec#5 §4.2：通过 Enemy 基类可选钩子 tickSummonTimer 访问（取代 duck-typing）
      enemy.tickSummonTimer?.(deltaMs);
      // spec §5.9 C: 头颅复活检查也始终按真实 timeMs 推进（远房降级例外）
      enemy.tickHeadRevive?.(timeMs, (kind, x, y, parentId) => {
        return this.spawnEnemyAt(kind, x, y, parentId);
      });

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
  }

  /** 接触伤害 — CombatManager.update 在 projSys/zoneSys 推进后调用。
   *  中立杨云红边跳过；粉笔尘云 DoT 无冷却；普通敌人 1s 冷却；
   *  杨云红边冲撞期间 contactDamageOverride=50 + 击退回调。 */
  applyContactDamage(deltaMs: number): void {
    if (this.ctx.player.isDead) return;
    const playerPos = this.ctx.getPlayerPosition();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      // 设计变更：中立杨云红边不攻击玩家（含接触伤害）
      // spec#5 §4.2：通过 Enemy 基类可选钩子 aggroState 访问（取代 duck-typing）
      if (enemy.kind === 'yangYunRed') {
        if (enemy.aggroState === 'neutral') continue;
      }
      const dist = enemy.distanceTo(playerPos.x, playerPos.y);
      if (dist > enemy.contactRadius + 16) continue;
      // 粉笔尘云：持续 DoT 接触（5/s），无冷却
      if (enemy.kind === 'chalkDust') {
        const dotInstance: DamageInstance = {
          amount: enemy.contactDamage * (deltaMs / 1000),
          category: 'dot',
        };
        this.ctx.player.takeDamage(dotInstance);
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
      this.ctx.player.takeDamage(instance);
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
          this.ctx.callbacks.onKnockback?.(
            elite.chargeDirX * knockbackPx,
            elite.chargeDirY * knockbackPx,
            200,
          );
        }
      }
    }
  }

  /** 粉笔尘云视野减益 — CombatManager.update 在 applyContactDamage 后调用。
   *  玩家在任意 chalkDust 敌人 contactRadius+40 内时回调 onVisionReduced(0.3, true)。 */
  updateVisionDebuff(): void {
    let inChalk = false;
    const playerPos = this.ctx.getPlayerPosition();
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.kind !== 'chalkDust') continue;
      const dist = enemy.distanceTo(playerPos.x, playerPos.y);
      if (dist <= enemy.contactRadius + 40) {
        inChalk = true;
        break;
      }
    }
    this.ctx.callbacks.onVisionReduced?.(0.3, inChalk);
  }

  /** 死亡敌人清理 — CombatManager.update 在 updateVisionDebuff 后调用。
   *  也由 damageEnemiesInFan / damageClosestEnemyInFanWithHit / damageEnemiesInCircle /
   *  killRandomEnemyInRadiusExcluding / playerAttack 在结算后调用。
   *  负责：通知身体（onBoundHeadDied）、30% 标记身体、onBodyDied 清场、onEliteDefeated、
   *  onEnemyKilled、清理远房累计条目、splice 出 enemies 数组。 */
  handleDeadEnemies(): void {
    const timeMs = this.ctx.getTimeMs();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i]!;
      if (!enemy.dead) continue;
      // 通知身体：绑定头颅死亡（spec §5.9 B/C）
      // spec#5 §4.2：通过 Enemy 基类可选钩子 onBoundHeadDied 访问（取代 duck-typing）
      if (enemy.parentId !== null) {
        const body = this.enemies.find((e) => e.id === enemy.parentId && !e.dead);
        body?.onBoundHeadDied?.(enemy, timeMs);
        // 30% 标记身体位置
        if (this.ctx.rng.chance(0.3)) {
          this.ctx.callbacks.onMarkBodyOnMinimap?.(enemy.parentId, body?.x ?? 0, body?.y ?? 0);
        }
      }
      // 身体死亡 → 通知 onBodyDied（spec §5.9 B 机制 B：清场所有绑定头颅）
      // spec#5 §4.2：通过 Enemy 基类可选钩子 onBodyDied 访问（取代 duck-typing）
      if (enemy.kind === 'danYuxuanBody') {
        enemy.onBodyDied?.();
      }
      // 精英死亡事件
      if (enemy.kind === 'yangYunRed') {
        this.ctx.callbacks.onEliteDefeated?.();
      }
      this.ctx.callbacks.onEnemyKilled?.(enemy);
      // Task 21 (1.2): 清理 dead 敌人的远房累计计时器，避免残留泄漏
      this.farRoomAccumMs.delete(enemy.id);
      this.enemies.splice(i, 1);
    }
  }

  // ─── 缄默者复制 (spec §9.3) ──────────────────────────────────────────

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
        nx = this.ctx.rng.int(0, 5000);
        ny = this.ctx.rng.int(0, 4000);
        const inBuffer = nx >= vx0 && nx <= vx1 && ny >= vy0 && ny <= vy1;
        if (!inBuffer && this.ctx.isWalkable(nx, ny)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const id = `enemy-${this.enemyCounter++}`;
      const opts = makeEnemyOpts(orig.kind, id, nx, ny);
      const clone = createEnemy(orig.kind, opts);
      clone.hp = orig.hp;
      clone.parentId = orig.parentId;
      clone.isDuplicate = true;
      this.enemies.push(clone);
      duplicated += 1;
    }
    return duplicated;
  }

  // ─── 私有辅助 ─────────────────────────────────────────────────────────

  private makeContext(): EnemyUpdateContext {
    // grill 2026-07-17：把 PlayerCombat.lastNoiseRadius 转为玩家位置上的噪声事件
    const playerPos = this.ctx.getPlayerPosition();
    const noise = this.ctx.player.lastNoiseRadius > 0
      ? { x: playerPos.x, y: playerPos.y, radius: this.ctx.player.lastNoiseRadius }
      : null;
    return {
      playerPosition: playerPos,
      timeMs: this.ctx.getTimeMs(),
      rng: this.ctx.rng,
      playerNoise: noise,
      spawnProjectile: (p) => this.ctx.spawnProjectile(p),
      spawnZone: (z) => this.ctx.spawnZone(z),
      spawnEnemy: (kind, pos, parentId) => this.spawnEnemyInternal(kind, pos, parentId),
      isWalkable: this.ctx.isWalkable,
    };
  }

  private spawnEnemyInternal(kind: EnemyKind, pos: Vec2, parentId?: string): Enemy | null {
    const timeMs = this.ctx.getTimeMs();
    const id = `${kind}-${timeMs}-${Math.floor(this.ctx.rng.next() * 100000)}`;
    const opts = makeEnemyOpts(kind, id, pos.x, pos.y);
    const enemy = createEnemy(kind, opts);
    if (parentId !== undefined) enemy.parentId = parentId;
    this.addEnemy(enemy);
    return enemy;
  }

  /** spec §5.9 C: 在指定位置生成绑定身体的头颅（由 DanYuxuanBodyEnemy.tickHeadRevive 调用）。 */
  private spawnEnemyAt(kind: EnemyKind, x: number, y: number, parentId: string): Enemy | null {
    const id = `enemy-${this.enemyCounter++}`;
    const opts = makeEnemyOpts(kind, id, x, y);
    const enemy = createEnemy(kind, opts);
    enemy.parentId = parentId;
    this.enemies.push(enemy);
    return enemy;
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

  // 设计变更：杨云红边中立→激怒机制。
  // 玩家攻击命中任何敌人时，所有处于中立状态、且距被命中敌人 ≤350px 视野内的杨云红边永久激怒。
  // 命中杨云红边本人时（距离 0）其自身亦激怒。
  // spec#5 §4.2：通过 Enemy 基类可选钩子 aggroState/enrage 访问（取代 duck-typing）。
  private applyEliteAggro(hitEnemies: readonly Enemy[]): void {
    if (hitEnemies.length === 0) return;
    const rangeSq = ELITE_AGGRO_VISION_RANGE * ELITE_AGGRO_VISION_RANGE;
    for (const target of hitEnemies) {
      for (const e of this.enemies) {
        if (e.dead || e.kind !== 'yangYunRed') continue;
        if (e.aggroState !== 'neutral') continue;
        const ddx = e.x - target.x;
        const ddy = e.y - target.y;
        if (ddx * ddx + ddy * ddy <= rangeSq) {
          e.enrage?.();
        }
      }
    }
  }
}

/** 归一化角度到 [-π, π]。 */
function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
