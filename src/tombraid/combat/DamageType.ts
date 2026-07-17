// src/tombraid/combat/DamageType.ts
// 伤害/Debuff 类型系统 + DebuffTracker 状态机（纯 TS，无 Phaser import）。
// spec §3.2 / §3.4，grill 2026-07-17 补全玩家跑/体力常量

// ---------------------------------------------------------------------------
// 玩家常量 (spec §3.1，grill 2026-07-17 补全跑/体力)
// ---------------------------------------------------------------------------
export const PLAYER_MAX_HP = 100;
export const PLAYER_BASE_SPEED = 200;        // 走
export const PLAYER_RUN_SPEED = 320;         // 跑（Shift）
export const STAMINA_MAX = 100;              // 体力上限
export const STAMINA_DRAIN_PER_SEC = 33.3;   // 跑耗（3s 耗完）
export const STAMINA_REGEN_PER_SEC = 20;     // 走/静止回（5s 回满）
export const STAMINA_FATIGUE_LOCK_MS = 1000; // 体力耗尽后强制走 1s
export const WEAK_PUNCH_DAMAGE = 5;
export const PLACEHOLDER_WEAPON_ID = 'weapon.ruler';
export const PLAYER_CONTACT_DAMAGE_COOLDOWN_MS = 1000;

// ---------------------------------------------------------------------------
// 伤害类型枚举 (spec §3.2 / §3.4)
// ---------------------------------------------------------------------------
export type DamageType = 'physical' | 'burn' | 'slow' | 'stun' | 'fear' | 'root';
export type DamageCategory = 'melee' | 'aoe' | 'dot';
export type DebuffType = 'burn' | 'slow' | 'stun' | 'fear' | 'root';

export const DAMAGE_TYPES: readonly DamageType[] = [
  'physical', 'burn', 'slow', 'stun', 'fear', 'root',
];
export const DEBUFF_TYPES: readonly DebuffType[] = [
  'burn', 'slow', 'stun', 'fear', 'root',
];

// ---------------------------------------------------------------------------
// Debuff 判别联合 (spec §3.4)
// ---------------------------------------------------------------------------
export interface BurnDebuff {
  readonly type: 'burn';
  readonly dps: number;          // 每秒伤害
  remainingMs: number;           // 剩余时长
}
export interface SlowDebuff {
  readonly type: 'slow';
  readonly multiplier: number;   // 速度保留比例 (0.4 = 60% 减速)
  remainingMs: number;
}
export interface StunDebuff {
  readonly type: 'stun';
  remainingMs: number;
}
export interface FearDebuff {
  readonly type: 'fear';
  remainingMs: number;
  readonly sourceX: number;
  readonly sourceY: number;
}
export interface RootDebuff {
  readonly type: 'root';
  remainingMs: number;
}
export type Debuff =
  | BurnDebuff
  | SlowDebuff
  | StunDebuff
  | FearDebuff
  | RootDebuff;

// ---------------------------------------------------------------------------
// 伤害实例
// ---------------------------------------------------------------------------
export interface DamageInstance {
  readonly amount: number;          // 即时 HP 削减
  readonly category: DamageCategory; // 驱动粉笔尘云倍率
  readonly debuff?: Debuff;          // 可选 CC/DoT
}

// ---------------------------------------------------------------------------
// 移动覆盖（场景读取以决定玩家移动行为）
// ---------------------------------------------------------------------------
export interface MovementOverride {
  readonly locked: boolean;                          // stun/root → 不可移动
  readonly speedMultiplier: number;                  // 1 正常 / 0 锁定 / slow 倍率
  readonly fleeFrom: { readonly x: number; readonly y: number } | null; // fear 逃离源
}

// ---------------------------------------------------------------------------
// DebuffTracker 状态机
// ---------------------------------------------------------------------------
export class DebuffTracker {
  private burn: BurnDebuff | null = null;
  private slow: SlowDebuff | null = null;
  private stun: StunDebuff | null = null;
  private fear: FearDebuff | null = null;
  private root: RootDebuff | null = null;

  apply(debuff: Debuff): void {
    switch (debuff.type) {
      case 'burn':
        // burn 刷新 dps 与时长
        this.burn = { type: 'burn', dps: debuff.dps, remainingMs: debuff.remainingMs };
        break;
      case 'slow': {
        // 取最强减速（最低 multiplier）
        if (this.slow === null || debuff.multiplier < this.slow.multiplier) {
          this.slow = { type: 'slow', multiplier: debuff.multiplier, remainingMs: debuff.remainingMs };
        } else if (debuff.remainingMs > this.slow.remainingMs) {
          this.slow = { type: 'slow', multiplier: this.slow.multiplier, remainingMs: debuff.remainingMs };
        }
        break;
      }
      case 'stun':
        this.stun = { type: 'stun', remainingMs: debuff.remainingMs };
        break;
      case 'fear':
        this.fear = {
          type: 'fear',
          remainingMs: debuff.remainingMs,
          sourceX: debuff.sourceX,
          sourceY: debuff.sourceY,
        };
        break;
      case 'root':
        this.root = { type: 'root', remainingMs: debuff.remainingMs };
        break;
    }
  }

  has(type: DebuffType): boolean {
    return this.get(type) !== null;
  }

  get(type: DebuffType): Debuff | null {
    switch (type) {
      case 'burn': return this.burn;
      case 'slow': return this.slow;
      case 'stun': return this.stun;
      case 'fear': return this.fear;
      case 'root': return this.root;
    }
  }

  clear(): void {
    this.burn = null;
    this.slow = null;
    this.stun = null;
    this.fear = null;
    this.root = null;
  }

  /** 推进所有 debuff 计时器，返回本 tick 应结算的 burn 伤害。 */
  tick(deltaMs: number): { burnDamage: number } {
    let burnDamage = 0;
    if (this.burn !== null) {
      const seconds = deltaMs / 1000;
      burnDamage = this.burn.dps * seconds;
      this.burn.remainingMs -= deltaMs;
      if (this.burn.remainingMs <= 0) this.burn = null;
    }
    if (this.slow !== null) {
      this.slow.remainingMs -= deltaMs;
      if (this.slow.remainingMs <= 0) this.slow = null;
    }
    if (this.stun !== null) {
      this.stun.remainingMs -= deltaMs;
      if (this.stun.remainingMs <= 0) this.stun = null;
    }
    if (this.fear !== null) {
      this.fear.remainingMs -= deltaMs;
      if (this.fear.remainingMs <= 0) this.fear = null;
    }
    if (this.root !== null) {
      this.root.remainingMs -= deltaMs;
      if (this.root.remainingMs <= 0) this.root = null;
    }
    return { burnDamage };
  }

  getMovementOverride(): MovementOverride {
    if (this.stun !== null || this.root !== null) {
      return { locked: true, speedMultiplier: 0, fleeFrom: null };
    }
    const fleeFrom = this.fear !== null
      ? { x: this.fear.sourceX, y: this.fear.sourceY }
      : null;
    const speedMultiplier = this.slow !== null ? this.slow.multiplier : 1;
    return { locked: false, speedMultiplier, fleeFrom };
  }

  list(): Debuff[] {
    const list: Debuff[] = [];
    if (this.burn !== null) list.push(this.burn);
    if (this.slow !== null) list.push(this.slow);
    if (this.stun !== null) list.push(this.stun);
    if (this.fear !== null) list.push(this.fear);
    if (this.root !== null) list.push(this.root);
    return list;
  }
}
