// src/forgottenSanity/weapons/WeaponCombatAdapter.ts
// 武器普攻/大招执行器。纯 TS，无 Phaser。
// 通过 CombatPort 接口调用 CombatManager 玩家侧 API；通过 onVisualEvent 回调触发视觉。
// grill 2026-07-17: meleeFan 单体近战原则（仅命中扇形内最近 1 敌）。
import type { DamageInstance, FearDebuff, RootDebuff } from '../combat/DamageType';
import type { Enemy, EnemyKind, Vec2 } from '../combat/Enemy';
import type { PlayerProjectile, PlayerZone } from '../combat/CombatManager';
import type { PlayerCombat } from '../combat/PlayerCombat';
import {
  getWeapon,
  type BladeArrayUlt,
  type BloodWheelUlt,
  type ChainCrushUlt,
  type ChalkBombAoeUlt,
  type FistDashUlt,
  type MeleeFlashKind,
  type RulerStormUlt,
  type ScatterShardsUlt,
  type SoulCaptureUlt,
  type WeaponDef,
  type WeaponId,
  type WeaponProjectileKind,
} from './WeaponRegistry';
import type { WeaponCooldowns } from './WeaponCooldowns';

// ---------------------------------------------------------------------------
// CombatPort — CombatManager 子集接口（适配器依赖的契约）
// ---------------------------------------------------------------------------
export interface CombatPort {
  readonly player: PlayerCombat;
  getPlayerPosition(): Vec2;
  /** grill: meleeFan 单体 — 仅命中扇形内最近 1 敌。 */
  damageClosestEnemyInFan(
    originX: number, originY: number, dirX: number, dirY: number,
    range: number, halfAngle: number, instance: DamageInstance,
  ): number;
  damageEnemiesInFan(
    originX: number, originY: number, dirX: number, dirY: number,
    range: number, halfAngle: number, instance: DamageInstance,
  ): number;
  damageEnemiesInCircle(cx: number, cy: number, radius: number, instance: DamageInstance): number;
  spawnPlayerProjectile(p: PlayerProjectile): void;
  spawnPlayerZone(z: PlayerZone): void;
  pullEnemiesToward(cx: number, cy: number, radius: number, pullDistance: number): void;
  killRandomEnemyInRadiusExcluding(
    cx: number, cy: number, radius: number, excludeKinds: readonly EnemyKind[],
    excludeHpLe?: number,
  ): Enemy | null;
  getTimeMs(): number;
}

// ---------------------------------------------------------------------------
// WeaponVisualEvent — 视觉事件（场景 plan 6 订阅，调用 WeaponEffect 绘制）
// ---------------------------------------------------------------------------
export type WeaponVisualEvent =
  | {
      kind: 'meleeFlash';
      effectKind: MeleeFlashKind;
      x: number; y: number; dirX: number; dirY: number;
      range: number; halfAngle: number;
    }
  | {
      kind: 'projectileSpawned';
      effectKind: WeaponProjectileKind;
      x: number; y: number; angle: number;
    }
  | {
      kind: 'zoneSpawned';
      x: number; y: number; radius: number;
      proceduralKind: string;
    }
  | {
      kind: 'ultimateFired';
      weaponId: string;
      x: number; y: number; dirX: number; dirY: number;
    };

// ---------------------------------------------------------------------------
// WeaponCombatAdapter
// ---------------------------------------------------------------------------
let playerProjectileCounter = 0;
let playerZoneCounter = 0;

/** grill §4.7: soulCapture captureMode='screenViewport' — 1280×720 视口半对角线 ≈ 735，取 800 覆盖全屏。 */
const SOUL_CAPTURE_SCREEN_RADIUS = 800;

export class WeaponCombatAdapter {
  constructor(
    private readonly combat: CombatPort,
    private readonly cooldowns: WeaponCooldowns,
    private readonly onVisualEvent: ((event: WeaponVisualEvent) => void) | null = null,
  ) {}

  /** grill §3.2: fistDash 锁定向 — 记录最近一次大招方向供 ultFistDash 复用。 */
  private lastDir: Vec2 = { x: 0, y: 1 };

  /** 拾取替换武器：设置新武器，重置 CD，返回旧武器 ID（用于地面掉落）。 */
  equipWeapon(newId: WeaponId): string {
    const player = this.combat.player;
    const old = player.weaponId;
    player.weaponId = newId;
    this.cooldowns.onWeaponSwap();
    return old;
  }

  /** 普攻执行器：读当前武器 → 按攻击类型结算 → 伤害 → 视觉 → 强制 CD。 */
  performAttack(direction: Vec2, timeMs: number): void {
    const player = this.combat.player;
    if (player.isDead) return;
    const weapon = getWeapon(player.weaponId);
    if (weapon === null) return; // 空手/未知 → no-op

    if (!this.cooldowns.canBasicAttack(timeMs)) return;
    this.cooldowns.recordBasicAttack(weapon, timeMs);

    const pos = this.combat.getPlayerPosition();
    const dir = normalizeDir(direction);

    switch (weapon.basic.kind) {
      case 'meleeFan':
        this.executeMeleeFan(weapon, pos, dir);
        break;
      case 'rangedPiercing':
        this.executeRangedPiercing(weapon, pos, dir);
        break;
    }
  }

  /** 大招执行器：读武器大招 → 按类型结算 → 视觉 → 强制 CD。返回是否执行（false = CD 中/未知武器/玩家死亡）。 */
  performUltimate(direction: Vec2, timeMs: number): boolean {
    const player = this.combat.player;
    if (player.isDead) return false;
    const weapon = getWeapon(player.weaponId);
    if (weapon === null) return false;
    if (!this.cooldowns.canUltimate(timeMs)) return false;
    this.cooldowns.recordUltimate(weapon, timeMs);

    const pos = this.combat.getPlayerPosition();
    const dir = normalizeDir(direction);
    const ult = weapon.ultimate;
    this.lastDir = { x: dir.x, y: dir.y };

    this.emit({
      kind: 'ultimateFired', weaponId: weapon.id,
      x: pos.x, y: pos.y, dirX: dir.x, dirY: dir.y,
    });

    switch (ult.kind) {
      case 'scatterShards':
        this.ultScatterShards(ult, pos, dir);
        break;
      case 'chalkBombAoe':
        this.ultChalkBomb(ult, pos, dir);
        break;
      case 'rulerStorm':
        this.ultRulerStorm(ult, pos);
        break;
      case 'bladeArray':
        this.ultBladeArray(ult, pos);
        break;
      case 'fistDash':
        this.ultFistDash(ult, pos);
        break;
      case 'chainCrush':
        this.ultChainCrush(ult, pos);
        break;
      case 'bloodWheel':
        this.ultBloodWheel(ult, pos);
        break;
      case 'soulCapture':
        this.ultSoulCapture(ult, pos);
        break;
    }
    return true;
  }

  // -- 断尺：6 枚尺屑扇形散射 (grill §4.7) --
  private ultScatterShards(ult: ScatterShardsUlt, pos: Vec2, dir: Vec2): void {
    const baseAngle = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < ult.shardCount; i++) {
      const t = ult.shardCount === 1 ? 0 : (i / (ult.shardCount - 1)) - 0.5;
      const angle = baseAngle + t * 2 * ult.spreadHalfAngle;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      this.combat.spawnPlayerProjectile({
        id: `wproj-${playerProjectileCounter++}`,
        x: pos.x, y: pos.y,
        vx: ux * ult.projectileSpeed,
        vy: uy * ult.projectileSpeed,
        speed: ult.projectileSpeed,
        damage: ult.damage,
        category: 'melee',
        pierceRemaining: 0,
        remainingMs: 2000,
        radius: ult.projectileRadius,
        proceduralKind: ult.effectKind,
      });
    }
    this.emit({
      kind: 'projectileSpawned', effectKind: ult.effectKind,
      x: pos.x, y: pos.y, angle: baseAngle,
    });
  }

  // -- 粉笔：前方固定位置爆弹 AoE (grill §4.7: r150) --
  private ultChalkBomb(ult: ChalkBombAoeUlt, pos: Vec2, dir: Vec2): void {
    const cx = pos.x + dir.x * 120;
    const cy = pos.y + dir.y * 120;
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: cx, y: cy, radius: ult.radius,
      burstDamage: ult.damage, damagePerSecond: 0,
      category: 'aoe', remainingMs: 100,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: false, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: cx, y: cy, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 尺子：跟随玩家风暴区域 (grill §4.7: r150 / 3s / dps15) --
  private ultRulerStorm(ult: RulerStormUlt, pos: Vec2): void {
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.radius,
      burstDamage: 0, damagePerSecond: ult.damagePerSecond,
      category: 'aoe', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 灵刃：8 方向万刃阵 (grill §4.7: 8-dir / 18伤 / pierce2 / 速400) --
  private ultBladeArray(ult: BladeArrayUlt, pos: Vec2): void {
    for (let i = 0; i < ult.directionCount; i++) {
      const angle = (i * Math.PI * 2) / ult.directionCount;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      this.combat.spawnPlayerProjectile({
        id: `wproj-${playerProjectileCounter++}`,
        x: pos.x, y: pos.y,
        vx: ux * ult.projectileSpeed,
        vy: uy * ult.projectileSpeed,
        speed: ult.projectileSpeed,
        damage: ult.damage,
        category: 'melee',
        pierceRemaining: ult.pierceCount,
        remainingMs: 2000,
        radius: ult.projectileRadius,
        proceduralKind: ult.effectKind,
      });
    }
    this.emit({ kind: 'projectileSpawned', effectKind: ult.effectKind, x: pos.x, y: pos.y, angle: 0 });
  }

  // -- 拳套：无敌冲拳（实际冲刺 + 路径首敌 + 末端命中）(grill §4.7/§3.2: 0.3s / 250px / 无敌 / 锁定向) --
  private ultFistDash(ult: FistDashUlt, pos: Vec2): void {
    // 1. 玩家无敌 300ms
    this.combat.player.setInvincible(ult.invincibleMs);
    // 2. 锁定向 + 实际冲刺由 ForgottenSanityRunController 监听 ultimateFired 事件后设置 dashLockState
    //    （performUltimate 已 emit ultimateFired，此处不重复 emit）
    // 3. 路径伤害 40（沿冲刺方向直线 250px 内最近敌，半角 22.5° 扇形）
    const dir = this.lastDir;
    this.combat.damageClosestEnemyInFan(
      pos.x, pos.y, dir.x, dir.y,
      250, Math.PI / 8,
      { amount: 40, category: 'melee' },
    );
    // 4. 末端伤害 40（冲刺结束点 r=60 内圆形 AOE）
    const endX = pos.x + dir.x * 250;
    const endY = pos.y + dir.y * 250;
    this.combat.damageEnemiesInCircle(endX, endY, 60, { amount: 40, category: 'melee' });
  }

  // -- 锁链：群拉 + root + burn DoT 区域 (grill §4.7: 拉扯≤200px / root2s / burn10/s×3s) --
  private ultChainCrush(ult: ChainCrushUlt, pos: Vec2): void {
    this.combat.pullEnemiesToward(pos.x, pos.y, ult.pullRadius, ult.pullDistance);
    const root: RootDebuff = { type: 'root', remainingMs: ult.rootMs };
    this.combat.damageEnemiesInCircle(pos.x, pos.y, ult.pullRadius, {
      amount: 0, category: 'aoe', debuff: root,
    });
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.pullRadius,
      burstDamage: 0, damagePerSecond: ult.burnDps,
      category: 'aoe', remainingMs: ult.burnMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.pullRadius, proceduralKind: ult.effectKind });
  }

  // -- 血镰：跟随玩家血轮区域 (grill §4.7: r130 / 3s / dps50) --
  private ultBloodWheel(ult: BloodWheelUlt, pos: Vec2): void {
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.radius,
      burstDamage: 0, damagePerSecond: ult.damagePerSecond,
      category: 'aoe', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 万魂幡：屏幕范围内即死一个非精英 (grill §4.7: screenViewport + excludeHpLe=1) --
  private ultSoulCapture(ult: SoulCaptureUlt, pos: Vec2): void {
    this.combat.killRandomEnemyInRadiusExcluding(
      pos.x, pos.y, SOUL_CAPTURE_SCREEN_RADIUS, ult.excludeKinds, ult.excludeHpLe,
    );
  }

  // -- meleeFan 普攻（断尺/尺子/拳套/锁链/血镰/万魂幡）--
  // grill: 单体近战 — 每段命中扇形内最近 1 敌；拳套 hitsPerAttack=3 对同一最近敌多段。
  private executeMeleeFan(weapon: WeaponDef, pos: Vec2, dir: Vec2): void {
    const basic = weapon.basic;
    if (basic.kind !== 'meleeFan') return;
    const instance: DamageInstance = {
      amount: basic.damage,
      category: basic.category,
    };

    let totalDealt = 0;
    const hits = basic.hitsPerAttack;
    for (let i = 0; i < hits; i++) {
      totalDealt += this.combat.damageClosestEnemyInFan(
        pos.x, pos.y, dir.x, dir.y, basic.range, basic.halfAngle, instance,
      );
    }

    // 视觉
    this.emit({
      kind: 'meleeFlash', effectKind: basic.effectKind,
      x: pos.x, y: pos.y, dirX: dir.x, dirY: dir.y,
      range: basic.range, halfAngle: basic.halfAngle,
    });

    // 血镰吸血 10%
    if (basic.lifestealPercent > 0 && totalDealt > 0) {
      const healAmount = (totalDealt * basic.lifestealPercent) / 100;
      if (healAmount >= 1) {
        this.combat.player.heal(Math.floor(healAmount));
      } else if (healAmount > 0) {
        this.combat.player.heal(1);
      }
    }

    // 万魂幡恐惧触发（每攻击一次掷骰；grill 单体 → 仅命中最近敌）
    if (basic.fearProcPercent > 0 && basic.fearDurationMs > 0) {
      const roll = Math.random() * 100;
      if (roll < basic.fearProcPercent) {
        const fear: FearDebuff = {
          type: 'fear', remainingMs: basic.fearDurationMs,
          sourceX: pos.x, sourceY: pos.y,
        };
        const fearInstance: DamageInstance = {
          amount: 0, category: basic.category, debuff: fear,
        };
        this.combat.damageClosestEnemyInFan(
          pos.x, pos.y, dir.x, dir.y, basic.range, basic.halfAngle, fearInstance,
        );
      }
    }
  }

  // -- rangedPiercing 普攻（灵刃/粉笔）--
  // grill: 朝玩家 8 方向之一射出（同移动方向），pierce=N 穿 N 敌后消失。
  private executeRangedPiercing(weapon: WeaponDef, pos: Vec2, dir: Vec2): void {
    const basic = weapon.basic;
    if (basic.kind !== 'rangedPiercing') return;
    const angle = Math.atan2(dir.y, dir.x);
    const proj: PlayerProjectile = {
      id: `wproj-${playerProjectileCounter++}`,
      x: pos.x, y: pos.y,
      vx: dir.x * basic.projectileSpeed,
      vy: dir.y * basic.projectileSpeed,
      speed: basic.projectileSpeed,
      damage: basic.damage,
      category: basic.category,
      pierceRemaining: basic.pierceCount,
      remainingMs: (basic.range / basic.projectileSpeed) * 1000,
      radius: basic.projectileRadius,
      proceduralKind: basic.effectKind,
    };
    this.combat.spawnPlayerProjectile(proj);
    this.emit({
      kind: 'projectileSpawned', effectKind: basic.effectKind,
      x: pos.x, y: pos.y, angle,
    });
  }

  protected emit(event: WeaponVisualEvent): void {
    if (this.onVisualEvent !== null) this.onVisualEvent(event);
  }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------
function normalizeDir(dir: Vec2): Vec2 {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) return { x: 0, y: 1 };
  return { x: dir.x / len, y: dir.y / len };
}
