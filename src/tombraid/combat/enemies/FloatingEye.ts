// src/tombraid/combat/enemies/FloatingEye.ts
// ⑥ 漂浮眼球：风筝+激光 + 游走三态机（spec §5.1⑥ / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import type { DamageCategory, Debuff } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type ZoneEffect,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1⑥ / §5.11.6 ⑥
const EYE_MAX_HP = 35;
const EYE_CONTACT_DAMAGE = 6;
const EYE_SPEED = 80; // chase 态风筝移动速度
const EYE_CONTACT_RADIUS = 20;

const EYE_VISION_RANGE = 400;
const EYE_VISION_HALF_ANGLE_DEG = 60;
const EYE_NOISE_SENSITIVITY = 0.8;
const EYE_CHASE_TO_SEARCH_MS = 3000;
const EYE_SEARCH_TO_ALERT_MS = 3000;
const EYE_ALERT_TO_IDLE_MS = 5000;
const EYE_STATIC_360_VISION = true;
const EYE_STATIC_360_RADIUS_FACTOR = 0.7; // spec §5.11.2
const EYE_PATROL_RADIUS = 80;
const EYE_PATROL_SPEED = 50;
const EYE_PATROL_SEGMENT_MS = 1500;

const EYE_ATTACK_INTERVAL_MS = 4000;
const EYE_LASER_WIDTH = 20;
const EYE_LASER_LENGTH = 5000; // 近似无限射程
const EYE_LASER_WINDUP_MS = 1000;
const EYE_LASER_DAMAGE = 20;
const EYE_LASER_BURN_DPS = 2;
const EYE_LASER_BURN_MS = 2000;
const EYE_KITE_MIN = 250;
const EYE_KITE_MAX = 350;

let eyeZoneCounter = 0;

function makeLaser(ownerId: string, x: number, y: number, angle: number): ZoneEffect {
  const debuff: Debuff = { type: 'burn', dps: EYE_LASER_BURN_DPS, remainingMs: EYE_LASER_BURN_MS };
  return {
    id: `eye-laser-${eyeZoneCounter++}`,
    shape: 'rect',
    x: x + Math.cos(angle) * (EYE_LASER_LENGTH / 2),
    y: y + Math.sin(angle) * (EYE_LASER_LENGTH / 2),
    radius: 0,
    width: EYE_LASER_WIDTH,
    height: EYE_LASER_LENGTH,
    angle,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: 0,
    windupMs: EYE_LASER_WINDUP_MS,
    burstDamage: EYE_LASER_DAMAGE,
    damagePerSecond: 0,
    category: 'aoe' as DamageCategory,
    debuff,
    remainingMs: EYE_LASER_WINDUP_MS + 300,
    applyDebuffOnce: true,
    debuffApplied: false,
    proceduralKind: 'laserBeam',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class FloatingEyeEnemy extends Enemy {
  readonly kind: EnemyKind = 'floatingEye';
  readonly textureKey: string | null = null;
  readonly proceduralKind = 'floatingEye';
  readonly perception: EnemyPerceptionParams = {
    visionRange: EYE_VISION_RANGE,
    visionHalfAngleDeg: EYE_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: EYE_NOISE_SENSITIVITY,
    alertToChaseMs: 'instant',
    chaseToSearchMs: EYE_CHASE_TO_SEARCH_MS,
    searchToAlertMs: EYE_SEARCH_TO_ALERT_MS,
    alertToIdleMs: EYE_ALERT_TO_IDLE_MS,
    patrolKind: 'wander',
    patrolRadius: EYE_PATROL_RADIUS,
    patrolSpeed: EYE_PATROL_SPEED,
    patrolSegmentMs: EYE_PATROL_SEGMENT_MS,
    static360Vision: EYE_STATIC_360_VISION,
  };

  private attackTimerMs = 0;
  private patrolTargetX: number;
  private patrolTargetY: number;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: EYE_MAX_HP,
      speed: EYE_SPEED,
      contactDamage: EYE_CONTACT_DAMAGE,
      contactRadius: EYE_CONTACT_RADIUS,
    });
    this.patrolTargetX = x;
    this.patrolTargetY = y;
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

    // 静止 360° 规则（spec §5.11.2）：眼球游走类，idle/alert 态静止 → 360°，半径 ×0.7
    // chase/search 态移动 → 恢复 120° 锥 + 原始半径 400
    const stationary = this.aiState === 'idle' || this.aiState === 'alert';
    const use360 = this.perception.static360Vision === true && stationary;
    const effectiveRange = use360
      ? this.perception.visionRange * EYE_STATIC_360_RADIUS_FACTOR
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
        this.patrolSegmentTimerMs += deltaMs;
        const segMs = this.perception.patrolSegmentMs ?? EYE_PATROL_SEGMENT_MS;
        if (this.patrolSegmentTimerMs >= segMs) {
          this.patrolSegmentTimerMs -= segMs;
          this.pickNewPatrolTarget(ctx);
        }
        this.moveToward(this.patrolTargetX, this.patrolTargetY, (this.perception.patrolSpeed ?? EYE_PATROL_SPEED) * deltaSec);
        break;
      }
      case 'alert': {
        // 警觉原地扫描，不移动
        break;
      }
      case 'chase': {
        // 风筝：太近远离，太远靠近，保持 250-350px
        if (perceive.vision) {
          this.kitePlayer(deltaSec, ctx);
        }
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= EYE_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= EYE_ATTACK_INTERVAL_MS;
          this.fireLaser(ctx);
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

  private pickNewPatrolTarget(ctx: EnemyUpdateContext): void {
    const r = this.perception.patrolRadius ?? EYE_PATROL_RADIUS;
    const ang = ctx.rng.next() * Math.PI * 2;
    const rad = ctx.rng.next() * r;
    this.patrolTargetX = this.spawnX + Math.cos(ang) * rad;
    this.patrolTargetY = this.spawnY + Math.sin(ang) * rad;
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

  private kitePlayer(deltaSec: number, ctx: EnemyUpdateContext): void {
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) return;
    const ux = dx / dist;
    const uy = dy / dist;
    if (dist < EYE_KITE_MIN) {
      // 太近：远离玩家
      this.x -= ux * this.speed * deltaSec;
      this.y -= uy * this.speed * deltaSec;
    } else if (dist > EYE_KITE_MAX) {
      // 太远：靠近玩家
      this.x += ux * this.speed * deltaSec;
      this.y += uy * this.speed * deltaSec;
    }
    this.setFacing(ux, uy);
  }

  private fireLaser(ctx: EnemyUpdateContext): void {
    // 激光朝玩家方向，无限射程（由 CombatManager 的 rect zone 不穿墙判定）
    const angle = Math.atan2(ctx.playerPosition.y - this.y, ctx.playerPosition.x - this.x);
    ctx.spawnZone(makeLaser(this.id, this.x, this.y, angle));
  }
}

export function registerFloatingEye(): void {
  registerEnemyKind('floatingEye', (opts) => new FloatingEyeEnemy(opts.id, opts.x, opts.y));
}
