// src/forgottenSanity/combat/PlayerCombat.ts
// 玩家战斗状态（HP/Debuff/武器占位/死亡回调 + stamina 状态机 + 噪声暴露）。纯 TS，无 Phaser。
// spec §3.1 / §3.4，grill 2026-07-17 补全跑/体力/疲劳锁/噪声
import {
  DebuffTracker,
  PLACEHOLDER_WEAPON_ID,
  PLAYER_MAX_HP,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_FATIGUE_LOCK_MS,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SEC,
  type Debuff,
  type DamageInstance,
  type MovementOverride,
} from './DamageType';

export class PlayerCombat {
  hp: number = PLAYER_MAX_HP;
  readonly maxHp: number = PLAYER_MAX_HP;
  weaponId: string = PLACEHOLDER_WEAPON_ID; // plan 4 替换为真实武器系统
  private debuffs = new DebuffTracker();
  private _isDead = false;
  private invincibleMs = 0; // plan 4: 无敌态（拳套霸体冲拳）

  // stamina 状态机 (grill 2026-07-17)
  stamina: number = STAMINA_MAX;
  private _isFatigued = false;
  private fatigueLockMs = 0;

  // 噪声暴露 (grill 2026-07-17)：CombatManager 每帧读取并传给怪物三态机
  // 走 80 / 跑 200 / 普攻 150 / 大招 250 / 破译 120 / 静止 0（spec §5.11.3）
  lastNoiseRadius = 0;

  // 回调（场景/HUD 订阅）
  onDied: (() => void) | null = null;
  onHpChanged: ((hp: number) => void) | null = null;
  onDebuffApplied: ((debuff: Debuff) => void) | null = null;
  onDamaged: ((instance: DamageInstance) => void) | null = null;

  get isDead(): boolean {
    return this._isDead;
  }

  get isFatigued(): boolean {
    return this._isFatigued;
  }

  /** 当前能否跑：未死 + 未疲劳 + 体力>0 */
  canRun(): boolean {
    return !this._isDead && !this._isFatigued && this.stamina > 0;
  }

  /**
   * 推进 stamina 状态机。
   * @param deltaMs 帧间隔
   * @param isRunning 玩家本帧是否按住跑键（疲劳下被强制走，参数被忽略）
   */
  tickStamina(deltaMs: number, isRunning: boolean): void {
    if (this._isDead) return;
    if (this._isFatigued) {
      // 疲劳锁：倒数 1s，期间不耗不回，isRunning 被强制忽略
      this.fatigueLockMs -= deltaMs;
      if (this.fatigueLockMs <= 0) {
        this.fatigueLockMs = 0;
        this._isFatigued = false;
      }
      return;
    }
    if (isRunning) {
      this.stamina -= STAMINA_DRAIN_PER_SEC * (deltaMs / 1000);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this._isFatigued = true;
        this.fatigueLockMs = STAMINA_FATIGUE_LOCK_MS;
      }
    } else {
      this.stamina += STAMINA_REGEN_PER_SEC * (deltaMs / 1000);
      if (this.stamina > STAMINA_MAX) this.stamina = STAMINA_MAX;
    }
  }

  /** 设置本帧玩家噪声半径（spec §5.11.3 基准值由场景层调用传入） */
  setNoiseRadius(radius: number): void {
    this.lastNoiseRadius = radius;
  }

  takeDamage(instance: DamageInstance): void {
    if (this.invincibleMs > 0) return; // plan 4: 无敌态守卫
    if (this._isDead || instance.amount <= 0) return;
    this.hp = Math.max(0, this.hp - instance.amount);
    if (this.onDamaged !== null) this.onDamaged(instance);
    if (this.onHpChanged !== null) this.onHpChanged(this.hp);
    if (instance.debuff !== undefined) {
      this.debuffs.apply(instance.debuff);
      if (this.onDebuffApplied !== null) this.onDebuffApplied(instance.debuff);
    }
    if (this.hp <= 0) {
      this._isDead = true;
      if (this.onDied !== null) this.onDied();
    }
  }

  applyDebuff(debuff: Debuff): void {
    if (this._isDead) return;
    this.debuffs.apply(debuff);
    if (this.onDebuffApplied !== null) this.onDebuffApplied(debuff);
  }

  clearDebuffs(): void {
    this.debuffs.clear();
  }

  heal(amount: number): void {
    if (this._isDead || amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    if (this.onHpChanged !== null) this.onHpChanged(this.hp);
  }

  tick(deltaMs: number): void {
    if (this._isDead) return;
    if (this.invincibleMs > 0) {
      this.invincibleMs = Math.max(0, this.invincibleMs - deltaMs);
    }
    const { burnDamage } = this.debuffs.tick(deltaMs);
    if (burnDamage > 0) {
      this.hp = Math.max(0, this.hp - burnDamage);
      if (this.onHpChanged !== null) this.onHpChanged(this.hp);
      if (this.hp <= 0) {
        this._isDead = true;
        if (this.onDied !== null) this.onDied();
      }
    }
  }

  getMovementOverride(): MovementOverride {
    return this.debuffs.getMovementOverride();
  }

  getEffectiveSpeed(baseSpeed: number): number {
    const mo = this.debuffs.getMovementOverride();
    if (mo.locked) return 0;
    return baseSpeed * mo.speedMultiplier;
  }

  get activeDebuffs(): readonly Debuff[] {
    return this.debuffs.list();
  }

  // plan 4: 无敌态（拳套霸体冲拳）
  setInvincible(ms: number): void {
    this.invincibleMs = Math.max(this.invincibleMs, ms);
  }

  isInvincible(): boolean {
    return this.invincibleMs > 0;
  }
}
