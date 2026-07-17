// src/tombraid/weapons/WeaponCooldowns.ts
// 普攻/大招冷却状态机（基于绝对时间戳）。纯 TS，无 Phaser。
import type { WeaponDef } from './WeaponRegistry';

export class WeaponCooldowns {
  private basicReadyAtMs = 0;
  private ultimateReadyAtMs = 0;

  canBasicAttack(timeMs: number): boolean {
    return timeMs >= this.basicReadyAtMs;
  }

  recordBasicAttack(weapon: WeaponDef, timeMs: number): void {
    this.recordBasicAttackCooldown(weapon.basic.attacksPerSecond, timeMs);
  }

  /** 直接用攻速记录普攻 CD（空手/未知武器路径）。 */
  recordBasicAttackCooldown(attacksPerSecond: number, timeMs: number): void {
    const cdMs = attacksPerSecond > 0 ? 1000 / attacksPerSecond : 0;
    this.basicReadyAtMs = timeMs + cdMs;
  }

  canUltimate(timeMs: number): boolean {
    return timeMs >= this.ultimateReadyAtMs;
  }

  recordUltimate(weapon: WeaponDef, timeMs: number): void {
    this.ultimateReadyAtMs = timeMs + weapon.ultimate.cooldownMs;
  }

  getBasicCooldownRemaining(timeMs: number): number {
    return Math.max(0, this.basicReadyAtMs - timeMs);
  }

  getUltimateCooldownRemaining(timeMs: number): number {
    return Math.max(0, this.ultimateReadyAtMs - timeMs);
  }

  /** 换武器时重置 CD（立即可普攻可大招）。 */
  onWeaponSwap(): void {
    this.basicReadyAtMs = 0;
    this.ultimateReadyAtMs = 0;
  }
}
