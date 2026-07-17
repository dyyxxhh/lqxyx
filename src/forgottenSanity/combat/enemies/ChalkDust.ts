// src/forgottenSanity/combat/enemies/ChalkDust.ts
// ⑦ 粉笔尘云：持续接触 DoT + 静物三态机（spec §5.1⑦ / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import type { DamageInstance } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1⑦ / §5.11.6 ⑦
const DUST_MAX_HP = 150;
const DUST_CONTACT_DAMAGE_PER_SEC = 5; // 持续接触 DoT（CombatManager 读取此值 × deltaSec）
const DUST_SPEED = 30; // chase 态缓慢移动
const DUST_CONTACT_RADIUS = 40;

const DUST_VISION_RANGE = 250;
const DUST_VISION_HALF_ANGLE_DEG = 60;
const DUST_NOISE_SENSITIVITY = 1.0;
const DUST_CHASE_TO_SEARCH_MS = 5000;
const DUST_SEARCH_TO_ALERT_MS = 5000;
const DUST_ALERT_TO_IDLE_MS = 7000;
const DUST_STATIC_360_VISION = true;
const DUST_STATIC_360_RADIUS_FACTOR = 0.7; // spec §5.11.2

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class ChalkDustEnemy extends Enemy {
  readonly kind: EnemyKind = 'chalkDust';
  readonly textureKey: string | null = null;
  readonly proceduralKind = 'chalkDust';
  readonly perception: EnemyPerceptionParams = {
    visionRange: DUST_VISION_RANGE,
    visionHalfAngleDeg: DUST_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: DUST_NOISE_SENSITIVITY,
    alertToChaseMs: 'instant',
    chaseToSearchMs: DUST_CHASE_TO_SEARCH_MS,
    searchToAlertMs: DUST_SEARCH_TO_ALERT_MS,
    alertToIdleMs: DUST_ALERT_TO_IDLE_MS,
    patrolKind: 'static',
    static360Vision: DUST_STATIC_360_VISION,
  };

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: DUST_MAX_HP,
      speed: DUST_SPEED,
      contactDamage: DUST_CONTACT_DAMAGE_PER_SEC,
      contactRadius: DUST_CONTACT_RADIUS,
    });
  }

  // spec §5.1⑦：物理伤害减半 / AoE 1.5× / dot 不变
  override applyDamage(instance: DamageInstance): void {
    if (this.dead || this.invulnMs > 0 || instance.amount <= 0) return;
    let amount = instance.amount;
    if (instance.category === 'melee') amount *= 0.5;
    else if (instance.category === 'aoe') amount *= 1.5;
    // dot 不变
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.dead = true;
  }

  update(deltaMs: number, ctx: EnemyUpdateContext): void {
    const perceive = this.checkPerception(ctx);
    this.tickAI(deltaMs, ctx, perceive);
    this.act(deltaMs, ctx, perceive);
  }

  private checkPerception(ctx: EnemyUpdateContext): PerceptionResult {
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 静物静止 360° 规则（spec §5.11.2）：idle/alert 态静止 → 360° 半径 ×0.7
    // chase/search 态会移动 → 恢复 120° 锥 + 原始半径 250
    const stationary = this.aiState === 'idle' || this.aiState === 'alert';
    const use360 = this.perception.static360Vision === true && stationary;
    const effectiveRange = use360
      ? this.perception.visionRange * DUST_STATIC_360_RADIUS_FACTOR
      : this.perception.visionRange;

    let vision = false;
    if (dist > 0 && dist <= effectiveRange) {
      if (use360) {
        // 360° 全向：单射线 LOS
        vision = this.lineOfSight(ctx, this.x, this.y, ctx.playerPosition.x, ctx.playerPosition.y);
      } else {
        const ux = dx / dist;
        const uy = dy / dist;
        const dot = this.facingX * ux + this.facingY * uy;
        const cosHalf = Math.cos((this.perception.visionHalfAngleDeg * Math.PI) / 180);
        if (dot >= cosHalf) {
          vision = this.lineOfSight(ctx, this.x, this.y, ctx.playerPosition.x, ctx.playerPosition.y);
        }
      }
    }

    let noise = false;
    if (ctx.playerNoise !== null) {
      const ndx = ctx.playerNoise.x - this.x;
      const ndy = ctx.playerNoise.y - this.y;
      const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
      const effRadius = ctx.playerNoise.radius * this.perception.noiseSensitivity;
      if (ndist <= effRadius) noise = true;
    }
    return { vision, noise };
  }

  private lineOfSight(ctx: EnemyUpdateContext, x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / 16));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!ctx.isWalkable(x1 + dx * t, y1 + dy * t)) return false;
    }
    return true;
  }

  private tickAI(deltaMs: number, ctx: EnemyUpdateContext, perceive: PerceptionResult): void {
    const hit = perceive.vision || perceive.noise;
    switch (this.aiState) {
      case 'idle': {
        if (hit) {
          this.setLastKnownPlayerPos(ctx.playerPosition);
          this.setAIState('alert');
          if (this.perception.alertToChaseMs === 'instant') {
            this.setAIState('chase');
          }
        }
        break;
      }
      case 'alert': {
        if (hit) {
          this.setLastKnownPlayerPos(ctx.playerPosition);
          if (this.perception.alertToChaseMs === 'instant') {
            this.setAIState('chase');
          } else {
            this.stateTimerMs += deltaMs;
            if (this.stateTimerMs >= this.perception.alertToChaseMs) {
              this.setAIState('chase');
            }
          }
        } else {
          this.stateTimerMs += deltaMs;
          if (this.stateTimerMs >= this.perception.alertToIdleMs) {
            this.setAIState('idle');
          }
        }
        break;
      }
      case 'chase': {
        if (hit) {
          this.lostPlayerTimerMs = 0;
          this.setLastKnownPlayerPos(ctx.playerPosition);
        } else {
          this.lostPlayerTimerMs += deltaMs;
          if (this.lostPlayerTimerMs >= this.perception.chaseToSearchMs) {
            this.setAIState('search');
          }
        }
        break;
      }
      case 'search': {
        if (hit) {
          this.setLastKnownPlayerPos(ctx.playerPosition);
          this.setAIState('chase');
        } else {
          this.stateTimerMs += deltaMs;
          if (this.stateTimerMs >= this.perception.searchToAlertMs) {
            this.setAIState('alert');
          }
        }
        break;
      }
    }
  }

  private act(deltaMs: number, ctx: EnemyUpdateContext, perceive: PerceptionResult): void {
    const deltaSec = deltaMs / 1000;
    switch (this.aiState) {
      case 'idle': {
        // 静物：定点待机，不移动
        break;
      }
      case 'alert': {
        // 静物：原地扫描，不移动
        break;
      }
      case 'chase': {
        // chase 态缓慢漂向玩家（持续接触 DoT 由 CombatManager.applyContactDamage 处理，无冷却）
        if (perceive.vision) {
          this.moveToward(ctx.playerPosition.x, ctx.playerPosition.y, this.speed * deltaSec);
        }
        break;
      }
      case 'search': {
        if (this.lastKnownPlayerPos !== null) {
          this.moveToward(this.lastKnownPlayerPos.x, this.lastKnownPlayerPos.y, this.speed * deltaSec);
        }
        break;
      }
    }
  }

  private moveToward(tx: number, ty: number, maxStep: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return;
    const step = Math.min(maxStep, d);
    const ux = dx / d;
    const uy = dy / d;
    this.x += ux * step;
    this.y += uy * step;
    this.setFacing(ux, uy);
  }
}

export function registerChalkDust(): void {
  registerEnemyKind('chalkDust', (opts) => new ChalkDustEnemy(opts.id, opts.x, opts.y));
}
