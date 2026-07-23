// src/forgottenSanity/combat/ZoneSystem.ts
// spec#5 §5.2 拆分：区域子系统 — 从 CombatManager 抽出。
// 纯 TS，无 Phaser import。负责敌侧 zones（windup → burst → DoT）+ 玩家侧 playerZones（跟随 / burst / DoT）。
// spec §5.10 / plan 4。
import type {
  DamageCategory,
  DamageInstance,
  Debuff,
} from './DamageType';
import type {
  ProceduralKind,
  Vec2,
  ZoneEffect,
} from './Enemy';
import type { PlayerCombat } from './PlayerCombat';

// ---------------------------------------------------------------------------
// plan 4: 玩家侧区域（武器系统）
// ---------------------------------------------------------------------------

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

/** ZoneSystem 依赖上下文 — 由 CombatManager 门面注入。
 *  damageEnemiesInCircle 委托回 EnemySystem（玩家区域 burst/DoT 的伤害结算权威）。 */
export interface ZoneSystemContext {
  readonly player: PlayerCombat;
  getPlayerPosition(): Vec2;
  damageEnemiesInCircle(
    cx: number, cy: number, radius: number, instance: DamageInstance,
    options?: { excludeIds?: Set<string>; source?: string },
  ): number;
}

/** 区域子系统：敌侧 zones（windup 结算 burst + DoT + 移动/扩展 + 玩家命中）
 *  + 玩家侧 playerZones（跟随玩家 + burst + DoT，伤害委托 EnemySystem.damageEnemiesInCircle）。 */
export class ZoneSystem {
  readonly zones: ZoneEffect[] = [];
  readonly playerZones: PlayerZone[] = [];

  constructor(private readonly ctx: ZoneSystemContext) {}

  spawnZone(z: ZoneEffect): void {
    this.zones.push(z);
  }

  spawnPlayerZone(z: PlayerZone): void {
    z.debuffApplied = false;
    this.playerZones.push(z);
  }

  /** 推进敌侧区域（移动 / 扩展 / windup 结算 burst / DoT 阶段命中玩家）。 */
  updateEnemyZones(deltaMs: number): void {
    const seconds = deltaMs / 1000;
    const playerPos = this.ctx.getPlayerPosition();
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
          if (z.burstDamage > 0 && !this.ctx.player.isDead && this.pointInZone(z, playerPos)) {
            const instance: DamageInstance = {
              amount: z.burstDamage,
              category: z.category,
              ...(z.debuff !== undefined ? { debuff: z.debuff } : {}),
            };
            this.ctx.player.takeDamage(instance);
            if (z.applyDebuffOnce) z.debuffApplied = true;
          }
        }
      } else {
        // DoT 阶段
        if (z.damagePerSecond > 0 && !this.ctx.player.isDead && this.pointInZone(z, playerPos)) {
          const dotInstance: DamageInstance = {
            amount: z.damagePerSecond * seconds,
            category: z.category,
            ...(z.debuff !== undefined && (!z.applyDebuffOnce || !z.debuffApplied) ? { debuff: z.debuff } : {}),
          };
          this.ctx.player.takeDamage(dotInstance);
          if (z.applyDebuffOnce && z.debuff !== undefined) z.debuffApplied = true;
        }
      }
      z.remainingMs -= deltaMs;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i]!.remainingMs <= 0) this.zones.splice(i, 1);
    }
  }

  /** 推进玩家区域（跟随玩家 / burst / DoT / debuff）。 */
  updatePlayerZones(deltaMs: number): void {
    const pos = this.ctx.getPlayerPosition();
    const seconds = deltaMs / 1000;
    for (const z of this.playerZones) {
      if (z.followPlayer) {
        z.x = pos.x;
        z.y = pos.y;
      }
      // burst 一次性
      if (!z.debuffApplied && (z.burstDamage > 0 || (z.applyDebuffOnce && z.debuff !== undefined))) {
        this.ctx.damageEnemiesInCircle(z.x, z.y, z.radius, {
          amount: z.burstDamage,
          category: z.category,
          ...(z.debuff !== undefined && z.applyDebuffOnce ? { debuff: z.debuff } : {}),
        });
        z.debuffApplied = true;
      }
      // DoT
      if (z.damagePerSecond > 0) {
        this.ctx.damageEnemiesInCircle(z.x, z.y, z.radius, {
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

  /** 玩家是否在敌侧区域内（circle / rect 旋转）。 */
  private pointInZone(z: ZoneEffect, playerPos: Vec2): boolean {
    const dx = z.x - playerPos.x;
    const dy = z.y - playerPos.y;
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
}
