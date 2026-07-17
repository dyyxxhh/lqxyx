// src/tombraid/combat/enemies/QinHaoruiHead.ts
// ② 秦浩睿头颅：尖叫波 + 游走三态机（spec §5.1② / §5.11，grill 2026-07-17 重写感知）
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

// spec §5.1② / §5.11.6 ②
const QIN_MAX_HP = 55;
const QIN_CONTACT_DAMAGE = 8;
const QIN_SPEED = 50;
const QIN_CONTACT_RADIUS = 16;
const QIN_TEXTURE_KEY = 'sprite.qinHaorui.headPart';

const QIN_VISION_RANGE = 320;
const QIN_VISION_HALF_ANGLE_DEG = 60;
const QIN_NOISE_SENSITIVITY = 1.0;
const QIN_CHASE_TO_SEARCH_MS = 3000;
const QIN_SEARCH_TO_ALERT_MS = 3000;
const QIN_ALERT_TO_IDLE_MS = 5000;
const QIN_PATROL_RADIUS = 80;
const QIN_PATROL_SPEED = 50;
const QIN_PATROL_SEGMENT_MS = 1500;

const QIN_ATTACK_INTERVAL_MS = 5000;
const QIN_SCREAM_RADIUS = 150;
const QIN_SCREAM_DAMAGE = 18;
const QIN_SCREAM_SLOW_MULTIPLIER = 0.4; // 60% 减速
const QIN_SCREAM_SLOW_MS = 2000;
const QIN_SCREAM_ZONE_LIFETIME_MS = 200; // 短寿，burst 后清理
const QIN_SCREAM_WINDUP_MS = 1; // 接近瞬发（CombatManager 用 windup<=0 触发 burst）

let qinZoneCounter = 0;

function makeScreamZone(ownerId: string, x: number, y: number): ZoneEffect {
  const debuff: Debuff = {
    type: 'slow',
    multiplier: QIN_SCREAM_SLOW_MULTIPLIER,
    remainingMs: QIN_SCREAM_SLOW_MS,
  };
  return {
    id: `qin-scream-${qinZoneCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: QIN_SCREAM_RADIUS,
    width: 0,
    height: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: QIN_SCREAM_RADIUS,
    windupMs: QIN_SCREAM_WINDUP_MS,
    burstDamage: QIN_SCREAM_DAMAGE,
    damagePerSecond: 0,
    category: 'aoe' as DamageCategory,
    ...(debuff !== undefined ? { debuff } : {}),
    remainingMs: QIN_SCREAM_ZONE_LIFETIME_MS,
    applyDebuffOnce: true,
    debuffApplied: false,
    proceduralKind: 'screamWave',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class QinHaoruiHeadEnemy extends Enemy {
  readonly kind: EnemyKind = 'qinHaoruiHead';
  readonly textureKey: string | null = QIN_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = {
    visionRange: QIN_VISION_RANGE,
    visionHalfAngleDeg: QIN_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: QIN_NOISE_SENSITIVITY,
    alertToChaseMs: 'instant',
    chaseToSearchMs: QIN_CHASE_TO_SEARCH_MS,
    searchToAlertMs: QIN_SEARCH_TO_ALERT_MS,
    alertToIdleMs: QIN_ALERT_TO_IDLE_MS,
    patrolKind: 'wander',
    patrolRadius: QIN_PATROL_RADIUS,
    patrolSpeed: QIN_PATROL_SPEED,
    patrolSegmentMs: QIN_PATROL_SEGMENT_MS,
  };

  private attackTimerMs = 0;
  private patrolTargetX: number;
  private patrolTargetY: number;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: QIN_MAX_HP,
      speed: QIN_SPEED,
      contactDamage: QIN_CONTACT_DAMAGE,
      contactRadius: QIN_CONTACT_RADIUS,
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
        const segMs = this.perception.patrolSegmentMs ?? QIN_PATROL_SEGMENT_MS;
        if (this.patrolSegmentTimerMs >= segMs) {
          this.patrolSegmentTimerMs -= segMs;
          this.pickNewPatrolTarget(ctx);
        }
        this.moveToward(this.patrolTargetX, this.patrolTargetY, (this.perception.patrolSpeed ?? QIN_PATROL_SPEED) * deltaSec);
        break;
      }
      case 'alert': {
        break;
      }
      case 'chase': {
        if (perceive.vision) {
          this.moveToward(ctx.playerPosition.x, ctx.playerPosition.y, this.speed * deltaSec);
        }
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= QIN_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= QIN_ATTACK_INTERVAL_MS;
          ctx.spawnZone(makeScreamZone(this.id, this.x, this.y));
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
    const r = this.perception.patrolRadius ?? QIN_PATROL_RADIUS;
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
}

export function registerQinHaoruiHead(): void {
  registerEnemyKind('qinHaoruiHead', (opts) => new QinHaoruiHeadEnemy(opts.id, opts.x, opts.y));
}
