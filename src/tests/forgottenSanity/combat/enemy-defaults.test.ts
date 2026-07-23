import { describe, it, expect } from 'vitest';
import { DEFAULT_ENEMY_OPTS, makeEnemyOpts } from '../../../forgottenSanity/combat/enemyDefaults';
import type { EnemyKind, EnemyConstructorOpts } from '../../../forgottenSanity/combat/Enemy';

const ALL_KINDS: EnemyKind[] = [
  'butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone',
  'bloodHand', 'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye',
  'danYuxuanBody', 'yangYunRed', 'yangYunRedPhantom',
];

describe('DEFAULT_ENEMY_OPTS', () => {
  it('覆盖全部 11 个 EnemyKind', () => {
    for (const kind of ALL_KINDS) {
      expect(DEFAULT_ENEMY_OPTS[kind]).toBeDefined();
    }
  });

  it('每个 kind 提供完整 maxHp/speed/contactDamage/contactRadius 四字段', () => {
    for (const kind of ALL_KINDS) {
      const entry = DEFAULT_ENEMY_OPTS[kind];
      expect(entry).toBeDefined();
      expect(typeof entry!.maxHp).toBe('number');
      expect(typeof entry!.speed).toBe('number');
      expect(typeof entry!.contactDamage).toBe('number');
      expect(typeof entry!.contactRadius).toBe('number');
    }
  });
});

describe('makeEnemyOpts', () => {
  it('返回带 id/x/y 的完整 EnemyConstructorOpts', () => {
    const opts: EnemyConstructorOpts = makeEnemyOpts('bloodHand', 'enemy-1', 100, 200);
    expect(opts.id).toBe('enemy-1');
    expect(opts.x).toBe(100);
    expect(opts.y).toBe(200);
    const ref = DEFAULT_ENEMY_OPTS.bloodHand;
    expect(opts.maxHp).toBe(ref.maxHp);
    expect(opts.speed).toBe(ref.speed);
    expect(opts.contactDamage).toBe(ref.contactDamage);
    expect(opts.contactRadius).toBe(ref.contactRadius);
  });

  it('与 CombatManager 单源表一致（yangYunRed / yangYunRedPhantom 关键数值）', () => {
    const red = makeEnemyOpts('yangYunRed', 'r', 0, 0);
    expect(red.maxHp).toBe(320);
    expect(red.contactRadius).toBe(30); // CombatManager 版本（RunController 曾为 26）
    const phantom = makeEnemyOpts('yangYunRedPhantom', 'p', 0, 0);
    expect(phantom.contactRadius).toBe(24); // CombatManager 版本（RunController 曾为 20）
  });
});
