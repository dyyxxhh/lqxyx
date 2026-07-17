// src/forgottenSanity/combat/enemies/ButYuxuanHead.ts
// ① 但宇轩头颅：追踪弹 + 游走三态机（spec §5.1① / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import type { DamageCategory } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type Projectile,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1① / §5.11.6 ①
const BUT_MAX_HP = 45;
const BUT_CONTACT_DAMAGE = 8;
const BUT_SPEED = 60;
const BUT_CONTACT_RADIUS = 16;
const BUT_TEXTURE_KEY = 'sprite.danYuxuan.headPart';

const BUT_VISION_RANGE = 350;
const BUT_VISION_HALF_ANGLE_DEG = 60;
const BUT_NOISE_SENSITIVITY = 1.0;
const BUT_CHASE_TO_SEARCH_MS = 3000;
const BUT_SEARCH_TO_ALERT_MS = 3000;
const BUT_ALERT_TO_IDLE_MS = 5000;
const BUT_PATROL_RADIUS = 80;
const BUT_PATROL_SPEED = 50;
const BUT_PATROL_SEGMENT_MS = 1500;

const BUT_ATTACK_INTERVAL_MS = 3000;
const BUT_PROJECTILE_SPEED = 120;
const BUT_PROJECTILE_DAMAGE = 14;
const BUT_PROJECTILE_LIFETIME_MS = 3000;
const BUT_PROJECTILE_COUNT = 2;
const BUT_PROJECTILE_HOMING_STRENGTH = 2.0; // rad/s
const BUT_PROJECTILE_RADIUS = 8;
const BUT_PROJECTILE_SPREAD_RAD = 0.2; // 双弹轻微散布

let butProjectileCounter = 0;

function makeButOrb(ownerId: string, x: number, y: number, vx: number, vy: number): Projectile {
  return {
    id: `but-orb-${butProjectileCounter++}`,
    x,
    y,
    vx,
    vy,
    speed: BUT_PROJECTILE_SPEED,
    damage: BUT_PROJECTILE_DAMAGE,
    category: 'aoe' as DamageCategory,
    homingTarget: 'player',
    homingStrength: BUT_PROJECTILE_HOMING_STRENGTH,
    remainingMs: BUT_PROJECTILE_LIFETIME_MS,
    radius: BUT_PROJECTILE_RADIUS,
    proceduralKind: 'danYuxuanOrb',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class ButYuxuanHeadEnemy extends Enemy {
  readonly kind: EnemyKind = 'butYuxuanHead';
  readonly textureKey: string | null = BUT_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = {
    visionRange: BUT_VISION_RANGE,
    visionHalfAngleDeg: BUT_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: BUT_NOISE_SENSITIVITY,
    alertToChaseMs: 'instant',
    chaseToSearchMs: BUT_CHASE_TO_SEARCH_MS,
    searchToAlertMs: BUT_SEARCH_TO_ALERT_MS,
    alertToIdleMs: BUT_ALERT_TO_IDLE_MS,
    patrolKind: 'wander',
    patrolRadius: BUT_PATROL_RADIUS,
    patrolSpeed: BUT_PATROL_SPEED,
    patrolSegmentMs: BUT_PATROL_SEGMENT_MS,
    // static360Vision 省略：头颅类始终 120° 锥
  };

  private attackTimerMs = 0;
  private patrolTargetX: number;
  private patrolTargetY: number;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: BUT_MAX_HP,
      speed: BUT_SPEED,
      contactDamage: BUT_CONTACT_DAMAGE,
      contactRadius: BUT_CONTACT_RADIUS,
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

    let vision = false;
    if (dist > 0 && dist <= this.perception.visionRange) {
      const ux = dx / dist;
      const uy = dy / dist;
      const dot = this.facingX * ux + this.facingY * uy;
      const cosHalf = Math.cos((this.perception.visionHalfAngleDeg * Math.PI) / 180);
      if (dot >= cosHalf) {
        vision = this.lineOfSight(ctx, this.x, this.y, ctx.playerPosition.x, ctx.playerPosition.y);
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

  /** 3 射线简化为沿连线采样 16px 步长做 isWalkable 检测（不穿墙）。 */
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
        const segMs = this.perception.patrolSegmentMs ?? BUT_PATROL_SEGMENT_MS;
        if (this.patrolSegmentTimerMs >= segMs) {
          this.patrolSegmentTimerMs -= segMs;
          this.pickNewPatrolTarget(ctx);
        }
        this.moveToward(this.patrolTargetX, this.patrolTargetY, (this.perception.patrolSpeed ?? BUT_PATROL_SPEED) * deltaSec);
        break;
      }
      case 'alert': {
        // 警觉原地扫描，不移动
        break;
      }
      case 'chase': {
        if (perceive.vision) {
          this.moveToward(ctx.playerPosition.x, ctx.playerPosition.y, this.speed * deltaSec);
        }
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= BUT_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= BUT_ATTACK_INTERVAL_MS;
          this.fireOrbs(ctx);
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
    const r = this.perception.patrolRadius ?? BUT_PATROL_RADIUS;
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

  private fireOrbs(ctx: EnemyUpdateContext): void {
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    for (let i = 0; i < BUT_PROJECTILE_COUNT; i++) {
      const offset = (i - (BUT_PROJECTILE_COUNT - 1) / 2) * BUT_PROJECTILE_SPREAD_RAD;
      const cos = Math.cos(offset);
      const sin = Math.sin(offset);
      const vx = (ux * cos - uy * sin) * BUT_PROJECTILE_SPEED;
      const vy = (ux * sin + uy * cos) * BUT_PROJECTILE_SPEED;
      ctx.spawnProjectile(makeButOrb(this.id, this.x, this.y, vx, vy));
    }
  }
}

export function registerButYuxuanHead(): void {
  registerEnemyKind('butYuxuanHead', (opts) => new ButYuxuanHeadEnemy(opts.id, opts.x, opts.y));
}
