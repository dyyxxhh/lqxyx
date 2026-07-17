import { describe, expect, it } from 'vitest';

import {
  type CombatRng,
  type EnemyKind,
  type EnemyUpdateContext,
  type EnemyPerceptionParams,
  type EnemyAIState,
  type ContactBurn,
  type ProceduralKind,
  Enemy,
  createEnemy,
  registerEnemyKind,
  createCombatRng,
} from '../../../forgottenSanity/combat/Enemy';
import type { DamageInstance } from '../../../forgottenSanity/combat/DamageType';

class TestEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = 'sprite.test' as const;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = {
    visionRange: 350,
    visionHalfAngleDeg: 60,
    noiseSensitivity: 1.0,
    alertToChaseMs: 'instant',
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
    patrolKind: 'wander',
    patrolRadius: 80,
    patrolSpeed: 50,
    patrolSegmentMs: 1500,
  };
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
}

describe('Enemy base class', () => {
  it('构造函数设置基础属性', () => {
    const e = new TestEnemy({ id: 'e1', x: 10, y: 20, maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 24 });
    expect(e.id).toBe('e1');
    expect(e.x).toBe(10);
    expect(e.y).toBe(20);
    expect(e.hp).toBe(45);
    expect(e.maxHp).toBe(45);
    expect(e.speed).toBe(60);
    expect(e.contactDamage).toBe(8);
    expect(e.dead).toBe(false);
  });

  it('applyDamage 减少 HP 并标记死亡', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 24 });
    const dmg: DamageInstance = { amount: 20, category: 'melee' };
    e.applyDamage(dmg);
    expect(e.hp).toBe(25);
    e.applyDamage({ amount: 30, category: 'melee' });
    expect(e.hp).toBe(0);
    expect(e.dead).toBe(true);
  });

  it('死亡后不再受伤', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.applyDamage({ amount: 10, category: 'melee' });
    e.applyDamage({ amount: 50, category: 'melee' });
    expect(e.hp).toBe(0);
  });

  it('distanceTo 计算距离', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(e.distanceTo(3, 4)).toBeCloseTo(5, 5);
  });
});

describe('Enemy base class — grill 2026-07-17 三态机字段', () => {
  it('默认 aiState=idle', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(e.aiState).toBe('idle');
  });

  it('默认 lastKnownPlayerPos=null，朝向 (facingX,facingY)=(0,1)', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(e.lastKnownPlayerPos).toBeNull();
    expect(e.facingX).toBe(0);
    expect(e.facingY).toBe(1);
  });

  it('perception 字段由子类提供', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(e.perception.visionRange).toBe(350);
    expect(e.perception.alertToChaseMs).toBe('instant');
    expect(e.perception.patrolKind).toBe('wander');
  });

  it('setAIState 切换状态并重置对应计时器', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.setAIState('alert');
    expect(e.aiState).toBe('alert');
    e.setAIState('chase');
    expect(e.aiState).toBe('chase');
  });

  it('setLastKnownPlayerPos 记录最后目击点', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.setLastKnownPlayerPos({ x: 100, y: 200 });
    expect(e.lastKnownPlayerPos).toEqual({ x: 100, y: 200 });
  });

  it('setFacing 归一化朝向向量', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.setFacing(3, 4);
    expect(e.facingX).toBeCloseTo(0.6, 5);
    expect(e.facingY).toBeCloseTo(0.8, 5);
  });
});

describe('EnemyFactory registry', () => {
  it('registerEnemyKind + createEnemy 构造已注册类型', () => {
    registerEnemyKind('butYuxuanHead', (opts) => new TestEnemy(opts));
    const e = createEnemy('butYuxuanHead', { id: 'f1', x: 1, y: 2, maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 24 });
    expect(e).not.toBeNull();
    expect(e!.kind).toBe('butYuxuanHead');
    expect(e!.x).toBe(1);
  });

  it('createEnemy 未注册类型返回 null', () => {
    const e = createEnemy('yangYunRed', { id: 'f2', x: 0, y: 0, maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 0 });
    // yangYunRed 在 Task 14 才注册；此时应返回 null
    expect(e).toBeNull();
  });
});

describe('CombatRng (mulberry32)', () => {
  it('同种子可复现', () => {
    const a = createCombatRng(12345);
    const b = createCombatRng(12345);
    expect(a.next()).toBe(b.next());
    expect(a.next()).toBe(b.next());
  });

  it('int 在 [min,max] 范围内', () => {
    const rng = createCombatRng(1);
    for (let i = 0; i < 20; i++) {
      const v = rng.int(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('chance(1) 恒 true, chance(0) 恒 false', () => {
    const rng = createCombatRng(1);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(0)).toBe(false);
  });
});

// 静态类型断言（编译期检查）
const _kindCheck: EnemyKind = 'butYuxuanHead';
const _procCheck: ProceduralKind = 'danYuxuanOrb';
const _aiStateCheck: EnemyAIState = 'idle';
const _contactBurnCheck: ContactBurn = { dps: 3, durationMs: 3000 };
void _kindCheck;
void _procCheck;
void _aiStateCheck;
void _contactBurnCheck;
