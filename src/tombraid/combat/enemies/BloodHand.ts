// src/tombraid/combat/enemies/BloodHand.ts
// ⑤ 血手：伏击型抓取+换位 + 静物三态机（spec §5.1⑤ / §5.11，grill 2026-07-17 重写感知）
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

// spec §5.1⑤ / §5.11.6 ⑤
const BLOOD_MAX_HP = 70;
const BLOOD_CONTACT_DAMAGE = 16;
const BLOOD_SPEED = 0; // spec §5.1⑤：speed=0（无巡逻移动），靠抓取/换位技能位移接近玩家
const BLOOD_CONTACT_RADIUS = 26;

const BLOOD_VISION_RANGE = 150;
const BLOOD_VISION_HALF_ANGLE_DEG = 60;
const BLOOD_NOISE_SENSITIVITY = 1.0;
const BLOOD_ALERT_TO_CHASE_MS = 1000;
const BLOOD_CHASE_TO_SEARCH_MS = 4000;
const BLOOD_SEARCH_TO_ALERT_MS = 4000;
const BLOOD_ALERT_TO_IDLE_MS = 6000;
const BLOOD_STATIC_360_VISION = true;
const BLOOD_STATIC_360_RADIUS_FACTOR = 0.7; // spec §5.11.2

const BLOOD_ATTACK_INTERVAL_MS = 5000;
const BLOOD_GRAB_RADIUS = 100;
const BLOOD_GRAB_WINDUP_MS = 800;
const BLOOD_GRAB_DAMAGE = 25;
const BLOOD_GRAB_ROOT_MS = 1000;
const BLOOD_RELOCATE_MIN_DIST = 200;
const BLOOD_RELOCATE_RANGE = 400;

let bloodZoneCounter = 0;

function makeBloodGrab(ownerId: string, x: number, y: number): ZoneEffect {
  const debuff: Debuff = { type: 'root', remainingMs: BLOOD_GRAB_ROOT_MS };
  return {
    id: `blood-grab-${bloodZoneCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: BLOOD_GRAB_RADIUS,
    width: 0,
    height: 0,
    angle: 0,
    vx: 0,
    vy: 0,
    expandSpeed: 0,
    maxRadius: BLOOD_GRAB_RADIUS,
    windupMs: BLOOD_GRAB_WINDUP_MS,
    burstDamage: BLOOD_GRAB_DAMAGE,
    damagePerSecond: 0,
    category: 'melee' as DamageCategory,
    debuff,
    remainingMs: BLOOD_GRAB_WINDUP_MS + 200,
    applyDebuffOnce: true,
    debuffApplied: false,
    proceduralKind: 'bloodHand',
    ownerId,
  };
}

interface PerceptionResult {
  vision: boolean;
  noise: boolean;
}

export class BloodHandEnemy extends Enemy {
  readonly kind: EnemyKind = 'bloodHand';
  readonly textureKey: string | null = null;
  readonly proceduralKind = 'bloodHand';
  readonly perception: EnemyPerceptionParams = {
    visionRange: BLOOD_VISION_RANGE,
    visionHalfAngleDeg: BLOOD_VISION_HALF_ANGLE_DEG,
    noiseSensitivity: BLOOD_NOISE_SENSITIVITY,
    alertToChaseMs: BLOOD_ALERT_TO_CHASE_MS,
    chaseToSearchMs: BLOOD_CHASE_TO_SEARCH_MS,
    searchToAlertMs: BLOOD_SEARCH_TO_ALERT_MS,
    alertToIdleMs: BLOOD_ALERT_TO_IDLE_MS,
    patrolKind: 'static',
    static360Vision: BLOOD_STATIC_360_VISION,
  };

  private attackTimerMs = 0;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: BLOOD_MAX_HP,
      speed: BLOOD_SPEED,
      contactDamage: BLOOD_CONTACT_DAMAGE,
      contactRadius: BLOOD_CONTACT_RADIUS,
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

    // 静物 360° 规则（spec §5.11.2）：血手 speed=0 永远静止 → 永远 360°，半径 ×0.7
    const use360 = this.perception.static360Vision === true;
    const effectiveRange = use360
      ? this.perception.visionRange * BLOOD_STATIC_360_RADIUS_FACTOR
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

  private act(deltaMs: number, ctx: EnemyUpdateContext, _perceive: PerceptionResult): void {
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
        // 血手 speed=0，无连续移动；靠抓取+换位技能位移接近玩家
        this.attackTimerMs += deltaMs;
        if (this.attackTimerMs >= BLOOD_ATTACK_INTERVAL_MS) {
          this.attackTimerMs -= BLOOD_ATTACK_INTERVAL_MS;
          this.grab(ctx);
          this.relocate(ctx);
        }
        break;
      }
      case 'search': {
        // 静物：原地等待，不向 lastKnownPlayerPos 移动
        break;
      }
    }
  }

  private grab(ctx: EnemyUpdateContext): void {
    // 抓取区在玩家当前位置（伏击型近身技能）
    ctx.spawnZone(makeBloodGrab(this.id, ctx.playerPosition.x, ctx.playerPosition.y));
  }

  private relocate(ctx: EnemyUpdateContext): void {
    // 换位：在玩家 200px 外随机位置瞬移（技能位移非移动速度）
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = ctx.rng.next() * Math.PI * 2;
      const dist = BLOOD_RELOCATE_MIN_DIST + ctx.rng.next() * BLOOD_RELOCATE_RANGE;
      const nx = ctx.playerPosition.x + Math.cos(angle) * dist;
      const ny = ctx.playerPosition.y + Math.sin(angle) * dist;
      if (ctx.isWalkable(nx, ny)) {
        this.x = nx;
        this.y = ny;
        return;
      }
    }
  }
}

export function registerBloodHand(): void {
  registerEnemyKind('bloodHand', (opts) => new BloodHandEnemy(opts.id, opts.x, opts.y));
}
