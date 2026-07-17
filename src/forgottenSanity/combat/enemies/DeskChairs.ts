// src/forgottenSanity/combat/enemies/DeskChairs.ts
// ③ 桌椅：翻桌扇形+木屑 + 静物三态机（spec §5.1③ / §5.11，grill 2026-07-17 重写感知）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
import type { DamageCategory } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type Projectile,
  type ZoneEffect,
  registerEnemyKind,
} from '../Enemy';

// spec §5.1③ / §5.11.6 ③
const DESK_MAX_HP = 120;
const DESK_CONTACT_DAMAGE = 15;
const DESK_SPEED = 40;
const DESK_CONTACT_RADIUS = 24;
const DESK_TEXTURE_KEY = 'sprite.deskChairs';

const DESK_VISION_RANGE = 180;
const DESK_VISION_HALF_ANGLE_DEG = 60;
const DESK_NOISE_SENSITIVITY = 0.7;
const DESK_ALERT_TO_CHASE_MS = 2000;
const DESK_CHASE_TO_SEARCH_MS = 4000;
const DESK_SEARCH_TO_ALERT_MS = 4000;
const DESK_ALERT_TO_IDLE_MS = 6000;
const DESK_STATIC_360_VISION = true;
const DESK_STATIC_360_RADIUS_FACTOR = 0.7; // spec §5.11.2

const DESK_ATTACK_INTERVAL_MS = 6000;
const DESK_FAN_HALF_ANGLE_DEG = 45; // 翻桌扇形 90°
const DESK_WOODCHIP_COUNT = 6;
const DESK_WOODCHIP_DAMAGE = 10;
const DESK_WOODCHIP_SPEED = 200;
const DESK_WOODCHIP_LIFETIME_MS = 600; // 120 / 200
const DESK_WOODCHIP_RADIUS = 6;
const DESK_INVULN_MS = 1200;
const DESK_CHAIR_OBSTACLE_MS = 8000;
const DESK_CHAIR_RADIUS = 16;

let deskProjCounter = 0;
let deskZoneCounter = 0;

function makeWoodChip(ownerId: string, x: number, y: number, vx: number, vy: number): Projectile {
  return {
    id: `desk-chip-${deskProjCounter++}`,
    x,
    y,
    vx,
    vy,
    speed: DESK_WOODCHIP_SPEED,
    damage: DESK_WOODCHIP_DAMAGE,
    category: 'melee' as DamageCategory,
    homingTarget: null,
    homingStrength: 0,
    remainingMs: DESK_WOODCHIP_LIFETIME_MS,
    radius: DESK_WOODCHIP_RADIUS,
    proceduralKind: 'woodChip',
    ownerId,
  };
}

function makeChairObstacle(ownerId: string, x: number, y: number): ZoneEffect {
  return {
    id: `desk-chair-${deskZoneCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: DESK_CHAIR_RADIUS,
    width: 0,
    height: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: DESK_CHAIR_RADIUS,
    windupMs: 0,
    burstDamage: 0,
    damagePerSecond: 0,
    category: 'melee' as DamageCategory,
    remainingMs: DESK_CHAIR_OBSTACLE_MS,
    applyDebuffOnce: false,
    debuffApplied: false,
    proceduralKind: 'chairObstacle',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class DeskChairsEnemy extends Enemy {
  readonly kind: EnemyKind = 'deskChairs';
  readonly textureKey: string | null = DESK_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = {
    visionRange: DESK_VISION_RANGE,
    visionHalfAngleDeg: DESK_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: DESK_NOISE_SENSITIVITY,
    alertToChaseMs: DESK_ALERT_TO_CHASE_MS,
    chaseToSearchMs: DESK_CHASE_TO_SEARCH_MS,
    searchToAlertMs: DESK_SEARCH_TO_ALERT_MS,
    alertToIdleMs: DESK_ALERT_TO_IDLE_MS,
    patrolKind: 'static',
    static360Vision: DESK_STATIC_360_VISION,
  };

  private attackTimerMs = 0;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: DESK_MAX_HP,
      speed: DESK_SPEED,
      contactDamage: DESK_CONTACT_DAMAGE,
      contactRadius: DESK_CONTACT_RADIUS,
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

    // 静物静止 360° 规则（spec §5.11.2）：idle/alert 态静止 → 360° 半径 ×0.7
    const stationary = this.aiState === 'idle' || this.aiState === 'alert';
    const use360 = this.perception.static360Vision === true && stationary;
    const effectiveRange = use360
      ? this.perception.visionRange * DESK_STATIC_360_RADIUS_FACTOR
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
        if (perceive.vision) {
          this.moveToward(ctx.playerPosition.x, ctx.playerPosition.y, this.speed * deltaSec);
        }
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= DESK_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= DESK_ATTACK_INTERVAL_MS;
          this.flipDesk(ctx);
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

  private flipDesk(ctx: EnemyUpdateContext): void {
    // 朝玩家方向 90° 扇形射出 6 个木屑
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const baseAng = Math.atan2(dy, dx);
    const halfRad = (DESK_FAN_HALF_ANGLE_DEG * Math.PI) / 180;
    for (let i = 0; i < DESK_WOODCHIP_COUNT; i++) {
      const t = i / (DESK_WOODCHIP_COUNT - 1);
      const offset = -halfRad + t * 2 * halfRad;
      const ang = baseAng + offset;
      const vx = Math.cos(ang) * DESK_WOODCHIP_SPEED;
      const vy = Math.sin(ang) * DESK_WOODCHIP_SPEED;
      ctx.spawnProjectile(makeWoodChip(this.id, this.x, this.y, vx, vy));
    }
    // 落地椅子障碍
    ctx.spawnZone(makeChairObstacle(this.id, this.x, this.y));
    // 翻桌无敌
    this.invulnMs = DESK_INVULN_MS;
  }
}

export function registerDeskChairs(): void {
  registerEnemyKind('deskChairs', (opts) => new DeskChairsEnemy(opts.id, opts.x, opts.y));
}
