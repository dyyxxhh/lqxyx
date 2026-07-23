// src/forgottenSanity/combat/ProjectileSystem.ts
// spec#5 §5.2 拆分：投射物子系统 — 从 CombatManager 抽出。
// 纯 TS，无 Phaser import。负责敌侧 projectiles + 玩家侧 playerProjectiles 的生成 / 子步进推进 / 撞墙检测 / 命中结算。
// spec §3.2 / Task 6 (#4) / plan 4。
import type {
  DamageCategory,
  DamageInstance,
  Debuff,
} from './DamageType';
import type {
  Enemy,
  Projectile,
  ProceduralKind,
  Vec2,
} from './Enemy';
import type { PlayerCombat } from './PlayerCombat';
import type { IsWalkableFn } from './CombatManager';
import type { WallHitParticleSystem } from './WallHitParticleSystem';

// ---------------------------------------------------------------------------
// plan 4: 玩家侧投射物（武器系统）
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

/** Task 6 (#4): 敌侧投射物子步进最大步长（px），避免高速穿墙 */
const ENEMY_PROJECTILE_SUBSTEP_PX = 4;

/** ProjectileSystem 依赖上下文 — 由 CombatManager 门面注入。
 *  enemies / playerProjectiles 数组为共享引用（门面持有，子系统直写）。
 *  applyDamageInstanceToEnemy 委托回 EnemySystem（玩家投射物命中敌人时的伤害结算权威）。 */
export interface ProjectileSystemContext {
  readonly isWalkable: IsWalkableFn;
  readonly wallHitFx: WallHitParticleSystem;
  readonly enemies: Enemy[];
  readonly player: PlayerCombat;
  getPlayerPosition(): Vec2;
  applyDamageInstanceToEnemy(enemy: Enemy, instance: DamageInstance): number;
}

/** 投射物子系统：敌侧 projectiles（homing + 4px 子步进 + 撞墙生成粒子 + 命中玩家）
 *  + 玩家侧 playerProjectiles（8px 子步进 + 遇墙停止 + 穿透追踪命中敌人）。 */
export class ProjectileSystem {
  readonly projectiles: Projectile[] = [];
  readonly playerProjectiles: PlayerProjectile[] = [];
  // plan 4: 投射物命中追踪（每枚投射物仅命中同一敌人一次）
  private readonly projectileHitTracker = new Map<string, Set<string>>();

  constructor(private readonly ctx: ProjectileSystemContext) {}

  spawnProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  spawnPlayerProjectile(p: PlayerProjectile): void {
    this.playerProjectiles.push(p);
    this.projectileHitTracker.set(p.id, new Set());
  }

  /** 敌侧投射物推进（homing 转向 + 4px 子步进 + 撞墙生成 wallHit 粒子 + 命中玩家）。 */
  updateEnemyProjectiles(deltaMs: number): void {
    // Task 6 (#4): 子步进推进 — 避免高速投射物穿墙
    //   一帧内按 ENEMY_PROJECTILE_SUBSTEP_PX 分多步推进，每步先检查 isWalkable
    //   不可走 → 在当前（最后一个可走）位置生成 spawnWallHitFx 并移除投射物
    //   保留现有 homing 转向（一帧一次）与玩家碰撞逻辑（每步检查）
    const dead: number[] = [];
    const seconds = deltaMs / 1000;
    const playerPos = this.ctx.getPlayerPosition();
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i]!;
      // 追踪（保留：一帧一次转向）
      if (p.homingTarget === 'player') {
        const dx = playerPos.x - p.x;
        const dy = playerPos.y - p.y;
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
        if (!this.ctx.isWalkable(nx, ny)) {
          this.ctx.wallHitFx.spawn(p.x, p.y);
          removed = true;
          break;
        }
        p.x = nx;
        p.y = ny;
        p.remainingMs -= stepDt;
        // 碰撞玩家（保留现有逻辑）
        if (!this.ctx.player.isDead) {
          const ddx = p.x - playerPos.x;
          const ddy = p.y - playerPos.y;
          if (ddx * ddx + ddy * ddy <= (p.radius + 16) * (p.radius + 16)) {
            const instance: DamageInstance = {
              amount: p.damage,
              category: p.category,
              ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
            };
            this.ctx.player.takeDamage(instance);
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

  /** 玩家侧投射物推进（8px 子步进 + rangedPiercing 遇墙停止 + 穿透追踪命中敌人）。 */
  updatePlayerProjectiles(deltaMs: number): void {
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
        if (!this.ctx.isWalkable(nextX, nextY)) {
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
        for (const enemy of this.ctx.enemies) {
          if (enemy.dead) continue;
          if (p.pierceRemaining < 0) break;
          if (hitSet.has(enemy.id)) continue;
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist <= p.radius + enemy.contactRadius) {
            this.ctx.applyDamageInstanceToEnemy(enemy, {
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
}
