// src/forgottenSanity/combat/enemies/YangYunRed.ts
// ⑩ 杨云红边（精英）+ ⑪ 影分身幻影（spec §5.10 / §5.11.9，grill 2026-07-17 双状态机）
// 核心 AI 逻辑纯 TS（无 Phaser import）。
// 双状态机：中立态走巡逻（PATROL_SPEED=50/PATROL_SEGMENT_MS=1500）；
// 激怒后 aggroState='hostile' 启用 §5.10 攻击模式（冲撞/影分身/地裂波/二阶段），不走三态机。
import type { DamageCategory, Debuff } from '../DamageType';
import {
  Enemy,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
  type ZoneEffect,
  type ContactBurn,
  registerEnemyKind,
} from '../Enemy';
import type { DamageInstance } from '../DamageType';

// spec §5.10
const MAX_HP = 320;
const SPEED = 95;
const CONTACT_DAMAGE = 22;
const CONTACT_RADIUS = 30;
const ELITE_TEXTURE_KEY = 'sprite.yangYunRed.down.idle';

// 冲撞
const CHARGE_INTERVAL_MS = 3000;
const CHARGE_WINDUP_MS = 1000;
const CHARGE_DURATION_MS = 700;
const CHARGE_SPEED = 320;
// spec §5.10 冲撞伤害 50：charging 态下由 CombatManager contact damage（contactDamage=22）
// + 击退效果实现；此处常量保留作为 spec 数值参考（实际接触伤害由 CombatManager 处理）。
const PHASE2_CHARGE_SPEED = 380;
const PHASE2_CHARGE_INTERVAL_MS = 1800;

// 幻影
const CLONE_HP_THRESHOLD = 0.7;
const PHANTOM_COUNT = 2;

// 地裂波
const CRACK_INTERVAL_MS = 8000;
const CRACK_WINDUP_MS = 600;
const CRACK_WIDTH = 60;
const CRACK_SPEED = 200;
const CRACK_DAMAGE = 28;
const CRACK_SLOW_MULTIPLIER = 0.5;
const CRACK_SLOW_MS = 1500;
const CRACK_MAX_RADIUS = 400;

// 二阶段
const PHASE2_HP_THRESHOLD = 0.4;
const PHASE2_BURN_DPS = 3;
const PHASE2_BURN_MS = 3000;

// 设计变更（spec §5.10 / §5.11.9，grill 2026-07-17）：杨云红边中立→激怒
// 激怒视野 350px（与但宇轩头颅同 R），玩家在视野内攻击任意目标（缄默者或杨云本人）
// 即永久激怒。CombatManager.ELITE_AGGRO_VISION_RANGE = 350 镜像此值。
export const VISION_RANGE = 350;
const PATROL_SPEED = 50;               // 中立巡逻移速（低于敌对 speed 95）
const PATROL_SEGMENT_MS = 1500;        // 巡逻方向切换间隔

// 激怒后非三态机；提供 trivial perception 满足基类 abstract 字段
const ELITE_PERCEPTION: EnemyPerceptionParams = {
  visionRange: VISION_RANGE,
  visionHalfAngleDeg: 60,
  noiseSensitivity: 1.0,
  alertToChaseMs: 'instant',
  chaseToSearchMs: 0,
  searchToAlertMs: 0,
  alertToIdleMs: 0,
  patrolKind: 'wander',
  patrolRadius: 80,
  patrolSpeed: PATROL_SPEED,
  patrolSegmentMs: PATROL_SEGMENT_MS,
};

export type ElitePhase = 1 | 2;
export type AggroState = 'neutral' | 'hostile';

let crackCounter = 0;

function makeFloorCrack(ownerId: string, x: number, y: number, angle: number): ZoneEffect {
  const debuff: Debuff = {
    type: 'slow',
    multiplier: CRACK_SLOW_MULTIPLIER,
    remainingMs: CRACK_SLOW_MS,
  };
  return {
    id: `elite-crack-${crackCounter++}`,
    shape: 'circle',
    x,
    y,
    radius: 0,
    width: CRACK_WIDTH,
    height: 0,
    angle,
    vx: 0,
    vy: 0,
    expandSpeed: CRACK_SPEED,
    maxRadius: CRACK_MAX_RADIUS,
    windupMs: CRACK_WINDUP_MS,
    burstDamage: CRACK_DAMAGE,
    damagePerSecond: 0,
    category: 'aoe' as DamageCategory,
    debuff,
    remainingMs: CRACK_WINDUP_MS + 1500,
    applyDebuffOnce: true,
    debuffApplied: false,
    proceduralKind: 'floorCrackWave',
    ownerId,
  };
}

export class YangYunRedEnemy extends Enemy {
  readonly kind: EnemyKind = 'yangYunRed';
  readonly textureKey: string | null = ELITE_TEXTURE_KEY;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = ELITE_PERCEPTION;
  phase: ElitePhase = 1;
  override contactBurn: ContactBurn | null = null;
  // 设计变更：初始中立，激怒后永久敌对（CombatManager 通过 duck-typing 读取/调用）
  aggroState: AggroState = 'neutral';

  private patrolTimer = 0;
  // patrolDirX/patrolDirY 沿用基类 Enemy 的 public 字段（grill 2026-07-17 重写）

  private chargeTimer = CHARGE_INTERVAL_MS;
  private chargeState: 'idle' | 'windup' | 'charging' = 'idle';
  private chargeElapsed = 0;
  private chargeDirX = 0;
  private chargeDirY = 0;
  private crackTimer = CRACK_INTERVAL_MS;
  private cloneTriggered = false;
  private onEliteDefeated: (() => void) | null = null;

  constructor(id: string, x: number, y: number) {
    super({
      id,
      x,
      y,
      maxHp: MAX_HP,
      speed: SPEED,
      contactDamage: CONTACT_DAMAGE,
      contactRadius: CONTACT_RADIUS,
    });
  }

  /** 激怒：中立 → 敌对（永久）。由 CombatManager 在玩家攻击命中其视野内目标时调用 */
  enrage(): void {
    this.aggroState = 'hostile';
  }

  /** 测试用：设置精英死亡回调 */
  setOnEliteDefeatedForTest(cb: () => void): void {
    this.onEliteDefeated = cb;
  }

  /** 测试用：直接扣血并触发阶段转换（绕过 applyDamage 的 dead 检查以测试回调） */
  applyDamageForTest(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.tickPhaseTransition();
    if (this.hp <= 0) {
      this.dead = true;
      if (this.onEliteDefeated !== null) this.onEliteDefeated();
    }
  }

  get effectiveSpeed(): number {
    return this.phase === 2 ? this.speed * 1.3 : this.speed;
  }

  override applyDamage(instance: DamageInstance): void {
    super.applyDamage(instance);
    this.tickPhaseTransition();
    if (this.dead && this.onEliteDefeated !== null) this.onEliteDefeated();
  }

  private tickPhaseTransition(): void {
    const ratio = this.hp / this.maxHp;
    if (this.phase === 1 && ratio < PHASE2_HP_THRESHOLD) {
      this.phase = 2;
      this.contactBurn = { dps: PHASE2_BURN_DPS, durationMs: PHASE2_BURN_MS };
    }
  }

  update(deltaMs: number, ctx: EnemyUpdateContext): void {
    // 设计变更：中立状态下仅巡逻，不攻击玩家，不走三态机
    if (this.aggroState === 'neutral') {
      this.updatePatrol(deltaMs, ctx);
      return;
    }
    // 激怒后使用 spec §5.10 原有攻击模式（不走普通三态机）
    this.tickPhaseTransition();
    const interval = this.phase === 2 ? PHASE2_CHARGE_INTERVAL_MS : CHARGE_INTERVAL_MS;
    const crackInterval = this.phase === 2 ? CRACK_INTERVAL_MS / 2 : CRACK_INTERVAL_MS;

    // 冲撞状态机
    this.updateCharge(deltaMs, ctx, interval);

    // 地裂波（HP<70% 起）
    if (this.hp / this.maxHp < CLONE_HP_THRESHOLD) {
      this.crackTimer -= deltaMs;
      if (this.crackTimer <= 0) {
        this.crackTimer = crackInterval;
        this.fireCrack(ctx);
      }
    }

    // 幻影（HP<70% 一次）
    if (!this.cloneTriggered && this.hp / this.maxHp < CLONE_HP_THRESHOLD) {
      this.cloneTriggered = true;
      this.spawnPhantoms(ctx);
    }
  }

  /** 中立巡逻：每隔 PATROL_SEGMENT_MS 随机选取方向低速移动，不朝向玩家、不释放任何攻击 */
  private updatePatrol(deltaMs: number, ctx: EnemyUpdateContext): void {
    this.patrolTimer -= deltaMs;
    if (this.patrolTimer <= 0) {
      this.patrolTimer = PATROL_SEGMENT_MS;
      const a = ctx.rng.next() * Math.PI * 2;
      this.patrolDirX = Math.cos(a);
      this.patrolDirY = Math.sin(a);
    }
    const seconds = deltaMs / 1000;
    this.x += this.patrolDirX * PATROL_SPEED * seconds;
    this.y += this.patrolDirY * PATROL_SPEED * seconds;
  }

  private updateCharge(deltaMs: number, ctx: EnemyUpdateContext, interval: number): void {
    if (this.chargeState === 'idle') {
      // 普通移动朝向玩家
      this.moveTowardPlayer(deltaMs, ctx);
      this.chargeTimer -= deltaMs;
      if (this.chargeTimer <= 0) {
        this.chargeTimer = interval;
        this.chargeState = 'windup';
        this.chargeElapsed = 0;
        const dx = ctx.playerPosition.x - this.x;
        const dy = ctx.playerPosition.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.001) {
          this.chargeDirX = dx / dist;
          this.chargeDirY = dy / dist;
        }
      }
    } else if (this.chargeState === 'windup') {
      this.chargeElapsed += deltaMs;
      if (this.chargeElapsed >= CHARGE_WINDUP_MS) {
        this.chargeState = 'charging';
        this.chargeElapsed = 0;
      }
    } else {
      // charging
      const speed = this.phase === 2 ? PHASE2_CHARGE_SPEED : CHARGE_SPEED;
      const seconds = deltaMs / 1000;
      this.x += this.chargeDirX * speed * seconds;
      this.y += this.chargeDirY * speed * seconds;
      this.chargeElapsed += deltaMs;
      if (this.chargeElapsed >= CHARGE_DURATION_MS) {
        this.chargeState = 'idle';
      }
    }
  }

  private moveTowardPlayer(deltaMs: number, ctx: EnemyUpdateContext): void {
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.001) {
      const seconds = deltaMs / 1000;
      this.x += (dx / dist) * this.effectiveSpeed * seconds;
      this.y += (dy / dist) * this.effectiveSpeed * seconds;
    }
  }

  private fireCrack(ctx: EnemyUpdateContext): void {
    const angle = Math.atan2(ctx.playerPosition.y - this.y, ctx.playerPosition.x - this.x);
    ctx.spawnZone(makeFloorCrack(this.id, this.x, this.y, angle));
  }

  private spawnPhantoms(ctx: EnemyUpdateContext): void {
    for (let i = 0; i < PHANTOM_COUNT; i++) {
      const angle = (i / PHANTOM_COUNT) * Math.PI * 2;
      const px = this.x + Math.cos(angle) * 60;
      const py = this.y + Math.sin(angle) * 60;
      ctx.spawnEnemy('yangYunRedPhantom', { x: px, y: py });
    }
  }
}

export class YangYunRedPhantomEnemy extends Enemy {
  readonly kind: EnemyKind = 'yangYunRedPhantom';
  readonly textureKey: string | null = 'sprite.yangYunBlue.down.idle';
  readonly proceduralKind = null;
  override tint: { color: number; alpha: number } | null = { color: 0xff6666, alpha: 0.5 };
  // 影分身非攻击性主战单位；提供 trivial perception 满足基类 abstract 字段
  readonly perception: EnemyPerceptionParams = {
    visionRange: 0,
    visionHalfAngleDeg: 60,
    noiseSensitivity: 0,
    alertToChaseMs: 'instant',
    chaseToSearchMs: 0,
    searchToAlertMs: 0,
    alertToIdleMs: 0,
    patrolKind: 'static',
  };
  private lifetimeMs = 12000;

  constructor(id: string, x: number, y: number) {
    super({ id, x, y, maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 24 });
  }

  update(deltaMs: number, ctx: EnemyUpdateContext): void {
    this.lifetimeMs -= deltaMs;
    if (this.lifetimeMs <= 0) {
      this.dead = true;
      return;
    }
    const dx = ctx.playerPosition.x - this.x;
    const dy = ctx.playerPosition.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.001) {
      const seconds = deltaMs / 1000;
      this.x += (dx / dist) * this.speed * seconds;
      this.y += (dy / dist) * this.speed * seconds;
    }
  }
}

export function registerYangYunRed(): void {
  registerEnemyKind('yangYunRed', (opts) => new YangYunRedEnemy(opts.id, opts.x, opts.y));
  registerEnemyKind('yangYunRedPhantom', (opts) => new YangYunRedPhantomEnemy(opts.id, opts.x, opts.y));
}
