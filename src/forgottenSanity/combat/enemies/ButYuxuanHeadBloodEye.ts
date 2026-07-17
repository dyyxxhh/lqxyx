// src/forgottenSanity/combat/enemies/ButYuxuanHeadBloodEye.ts
// ⑧ 但宇轩头颅·血瞳：增强追踪弹 + 游走三态机（spec §5.1⑧ / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。贴图 sprite.danYuxuan.headPart + 程序红眼叠加。
import type { DamageCategory } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type Projectile,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1⑧ / §5.11.6 ⑧
const BE_MAX_HP = 70;
const BE_CONTACT_DAMAGE = 12;
const BE_SPEED = 75;
const BE_CONTACT_RADIUS = 22;
const BE_TEXTURE_KEY = 'sprite.danYuxuan.headPart';

const BE_VISION_RANGE = 380;
const BE_VISION_HALF_ANGLE_DEG = 60;
const BE_NOISE_SENSITIVITY = 1.2;
const BE_CHASE_TO_SEARCH_MS = 2000;
const BE_SEARCH_TO_ALERT_MS = 2000;
const BE_ALERT_TO_IDLE_MS = 4000;
const BE_PATROL_RADIUS = 80;
const BE_PATROL_SPEED = 50;
const BE_PATROL_SEGMENT_MS = 1500;
// 血瞳头颅不 360°（spec §5.11.6 ⑧：始终 120° 锥，有背后盲区）

const BE_ATTACK_INTERVAL_MS = 2200;
const BE_PROJECTILE_SPEED = 140;
const BE_PROJECTILE_DAMAGE = 18;
const BE_PROJECTILE_LIFETIME_MS = 3000;
const BE_PROJECTILE_COUNT = 3;
const BE_PROJECTILE_HOMING_STRENGTH = Math.PI * 1.5; // 强追踪
const BE_PROJECTILE_RADIUS = 9;
const BE_PROJECTILE_SPREAD_RAD = 0.25;

let beProjectileCounter = 0;

function makeBloodEyeOrb(ownerId: string, x: number, y: number, vx: number, vy: number): Projectile {
  return {
    id: `be-orb-${beProjectileCounter++}`,
    x,
    y,
    vx,
    vy,
    speed: BE_PROJECTILE_SPEED,
    damage: BE_PROJECTILE_DAMAGE,
    category: 'aoe' as DamageCategory,
    homingTarget: 'player',
    homingStrength: BE_PROJECTILE_HOMING_STRENGTH,
    remainingMs: BE_PROJECTILE_LIFETIME_MS,
    radius: BE_PROJECTILE_RADIUS,
    proceduralKind: 'bloodEyeOrb',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class ButYuxuanHeadBloodEyeEnemy extends Enemy {
  readonly kind: EnemyKind = 'butYuxuanHeadBloodEye';
  readonly textureKey: string | null = BE_TEXTURE_KEY;
  readonly proceduralKind = null;
  override overlay: 'bloodEye' | null = 'bloodEye';
  readonly perception: EnemyPerceptionParams = {
    visionRange: BE_VISION_RANGE,
    visionHalfAngleDeg: BE_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: BE_NOISE_SENSITIVITY,
    alertToChaseMs: 'instant',
    chaseToSearchMs: BE_CHASE_TO_SEARCH_MS,
    searchToAlertMs: BE_SEARCH_TO_ALERT_MS,
    alertToIdleMs: BE_ALERT_TO_IDLE_MS,
    patrolKind: 'wander',
    patrolRadius: BE_PATROL_RADIUS,
    patrolSpeed: BE_PATROL_SPEED,
    patrolSegmentMs: BE_PATROL_SEGMENT_MS,
    // static360Vision 省略：血瞳头颅始终 120° 锥
  };

  private attackTimerMs = 0;
  private patrolTargetX: number;
  private patrolTargetY: number;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: BE_MAX_HP,
      speed: BE_SPEED,
      contactDamage: BE_CONTACT_DAMAGE,
      contactRadius: BE_CONTACT_RADIUS,
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

    // 血瞳头颅不 360°（spec §5.11.6 ⑧）：始终 120° 锥 + 原始半径 380
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
        const segMs = this.perception.patrolSegmentMs ?? BE_PATROL_SEGMENT_MS;
        if (this.patrolSegmentTimerMs >= segMs) {
          this.patrolSegmentTimerMs -= segMs;
          this.pickNewPatrolTarget(ctx);
        }
        this.moveToward(this.patrolTargetX, this.patrolTargetY, (this.perception.patrolSpeed ?? BE_PATROL_SPEED) * deltaSec);
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
        if (this.attackTimerMs >= BE_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= BE_ATTACK_INTERVAL_MS;
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
    const r = this.perception.patrolRadius ?? BE_PATROL_RADIUS;
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
    for (let i = 0; i < BE_PROJECTILE_COUNT; i++) {
      const offset = (i - (BE_PROJECTILE_COUNT - 1) / 2) * BE_PROJECTILE_SPREAD_RAD;
      const cos = Math.cos(offset);
      const sin = Math.sin(offset);
      const vx = (ux * cos - uy * sin) * BE_PROJECTILE_SPEED;
      const vy = (ux * sin + uy * cos) * BE_PROJECTILE_SPEED;
      ctx.spawnProjectile(makeBloodEyeOrb(this.id, this.x, this.y, vx, vy));
    }
  }
}

export function registerButYuxuanHeadBloodEye(): void {
  registerEnemyKind('butYuxuanHeadBloodEye', (opts) => new ButYuxuanHeadBloodEyeEnemy(opts.id, opts.x, opts.y));
}
