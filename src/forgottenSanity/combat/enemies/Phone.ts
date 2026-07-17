// src/forgottenSanity/combat/enemies/Phone.ts
// ④ 电话：红圈延迟爆炸 + 振铃区 + 静物三态机（spec §5.1④ / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import type { DamageCategory } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type ZoneEffect,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1④ / §5.11.6 ④
const PHONE_MAX_HP = 70;
const PHONE_CONTACT_DAMAGE = 10;
const PHONE_SPEED = 55;
const PHONE_CONTACT_RADIUS = 22;
const PHONE_TEXTURE_KEY = 'sprite.phone';

const PHONE_VISION_RANGE = 280;
const PHONE_VISION_HALF_ANGLE_DEG = 60;
const PHONE_NOISE_SENSITIVITY = 1.3;
const PHONE_ALERT_TO_CHASE_MS = 2000;
const PHONE_CHASE_TO_SEARCH_MS = 2000;
const PHONE_SEARCH_TO_ALERT_MS = 2000;
const PHONE_ALERT_TO_IDLE_MS = 4000;
const PHONE_STATIC_360_VISION = true;
const PHONE_STATIC_360_RADIUS_FACTOR = 0.7; // spec §5.11.2

const PHONE_ATTACK_INTERVAL_MS = 4500;
const PHONE_RED_CIRCLE_RADIUS = 90;
const PHONE_RED_CIRCLE_WINDUP_MS = 1200;
const PHONE_RED_CIRCLE_BURST_DAMAGE = 30;
const PHONE_RED_CIRCLE_TOTAL_MS = 2000; // windup + 余寿
const PHONE_RINGING_MS = 2000;
const PHONE_RINGING_DPS = 5;

let phoneZoneCounter = 0;

function makeRedCircle(ownerId: string, x: number, y: number): ZoneEffect {
  return {
    id: `phone-redcircle-${phoneZoneCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: PHONE_RED_CIRCLE_RADIUS,
    width: 0,
    height: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: PHONE_RED_CIRCLE_RADIUS,
    windupMs: PHONE_RED_CIRCLE_WINDUP_MS,
    burstDamage: PHONE_RED_CIRCLE_BURST_DAMAGE,
    damagePerSecond: 0,
    category: 'aoe' as DamageCategory,
    remainingMs: PHONE_RED_CIRCLE_TOTAL_MS,
    applyDebuffOnce: false,
    debuffApplied: false,
    proceduralKind: 'phoneRedCircle',
    ownerId,
  };
}

function makePhoneRinging(ownerId: string, x: number, y: number): ZoneEffect {
  return {
    id: `phone-ringing-${phoneZoneCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: PHONE_RED_CIRCLE_RADIUS,
    width: 0,
    height: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: PHONE_RED_CIRCLE_RADIUS,
    windupMs: 0,
    burstDamage: 0,
    damagePerSecond: PHONE_RINGING_DPS,
    category: 'dot' as DamageCategory,
    remainingMs: PHONE_RINGING_MS,
    applyDebuffOnce: false,
    debuffApplied: false,
    proceduralKind: 'phoneRinging',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class PhoneEnemy extends Enemy {
  readonly kind: EnemyKind = 'phone';
  readonly textureKey: string | null = PHONE_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = {
    visionRange: PHONE_VISION_RANGE,
    visionHalfAngleDeg: PHONE_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: PHONE_NOISE_SENSITIVITY,
    alertToChaseMs: PHONE_ALERT_TO_CHASE_MS,
    chaseToSearchMs: PHONE_CHASE_TO_SEARCH_MS,
    searchToAlertMs: PHONE_SEARCH_TO_ALERT_MS,
    alertToIdleMs: PHONE_ALERT_TO_IDLE_MS,
    patrolKind: 'static',
    static360Vision: PHONE_STATIC_360_VISION,
  };

  private attackTimerMs = 0;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: PHONE_MAX_HP,
      speed: PHONE_SPEED,
      contactDamage: PHONE_CONTACT_DAMAGE,
      contactRadius: PHONE_CONTACT_RADIUS,
    });
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

    // 静物 360° 规则（spec §5.11.2）：电话从不移动 → 始终静止 → 始终 360° 全向，半径 ×0.7
    // （与 DeskChairs 不同：桌椅 chase 态会移动故仅 idle/alert 用 360°；电话全态静止）
    const use360 = this.perception.static360Vision === true;
    const effectiveRange = use360
      ? this.perception.visionRange * PHONE_STATIC_360_RADIUS_FACTOR
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
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= PHONE_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= PHONE_ATTACK_INTERVAL_MS;
          this.triggerPhoneBlast(ctx);
        }
        // 电话不主动移动（静物），仅原地释放爆炸区
        // perceive 仅用于满足签名一致性（chase 命中时不移动）
        void perceive;
        break;
      }
      case 'search': {
        // 静物：原地等待，不向 lastKnownPlayerPos 移动
        break;
      }
    }
  }

  private triggerPhoneBlast(ctx: EnemyUpdateContext): void {
    // 红圈延迟爆炸（在电话自身位置释放）
    ctx.spawnZone(makeRedCircle(this.id, this.x, this.y));
    // 振铃区（同步释放，2s DoT）
    ctx.spawnZone(makePhoneRinging(this.id, this.x, this.y));
  }
}

export function registerPhone(): void {
  registerEnemyKind('phone', (opts) => new PhoneEnemy(opts.id, opts.x, opts.y));
}
