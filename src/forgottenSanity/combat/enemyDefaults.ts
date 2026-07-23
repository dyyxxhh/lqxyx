// src/forgottenSanity/combat/enemyDefaults.ts
// 各敌人初始数值单源表（spec#5 §4.4）。
// CombatManager 与 ForgottenSanityRunController 此前各持一份重复 defaultEnemyOpts，
// 两份在 yangYunRed / yangYunRedPhantom 的 contactRadius 上存在分歧
// （RunController 分别为 26 / 20，CombatManager 分别为 30 / 24）。
// 本模块以 CombatManager 版本为准单源化。
import type { EnemyKind, EnemyConstructorOpts } from './Enemy';

/** 单源敌人默认参数表（不含 id/x/y，由 makeEnemyOpts 拼装）。 */
export const DEFAULT_ENEMY_OPTS: Readonly<Record<EnemyKind, Omit<EnemyConstructorOpts, 'id' | 'x' | 'y'>>> = {
  butYuxuanHead: { maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 22 },
  qinHaoruiHead: { maxHp: 55, speed: 50, contactDamage: 8, contactRadius: 22 },
  deskChairs: { maxHp: 120, speed: 40, contactDamage: 15, contactRadius: 28 },
  phone: { maxHp: 70, speed: 55, contactDamage: 10, contactRadius: 22 },
  bloodHand: { maxHp: 70, speed: 0, contactDamage: 16, contactRadius: 26 },
  floatingEye: { maxHp: 35, speed: 80, contactDamage: 6, contactRadius: 20 },
  chalkDust: { maxHp: 150, speed: 30, contactDamage: 5, contactRadius: 40 },
  butYuxuanHeadBloodEye: { maxHp: 70, speed: 75, contactDamage: 12, contactRadius: 22 },
  danYuxuanBody: { maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 30 },
  yangYunRed: { maxHp: 320, speed: 95, contactDamage: 22, contactRadius: 30 },
  yangYunRedPhantom: { maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 24 },
};

/** 按种类拼装完整 EnemyConstructorOpts（合并单源默认表 + id/坐标）。 */
export function makeEnemyOpts(kind: EnemyKind, id: string, x: number, y: number): EnemyConstructorOpts {
  const s = DEFAULT_ENEMY_OPTS[kind];
  return {
    id,
    x,
    y,
    maxHp: s.maxHp,
    speed: s.speed,
    contactDamage: s.contactDamage,
    contactRadius: s.contactRadius,
  };
}
