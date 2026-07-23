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
import { YangYunRedEnemy, registerYangYunRed } from '../../../forgottenSanity/combat/enemies/YangYunRed';
import { DanYuxuanBodyEnemy, registerDanYuxuanBody } from '../../../forgottenSanity/combat/enemies/DanYuxuanBody';
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

  it('createEnemy 未注册 kind 抛错', () => {
    expect(() => createEnemy('invalidKind' as EnemyKind, { id: 'f2', x: 0, y: 0, maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 0 })).toThrow(/not registered/);
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

describe('Enemy burn debuff — M5 accumulation (Task 12)', () => {
  it('first burn sets dps and duration', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 1000, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 2000 });
    expect(e.getStatusBurn()?.dps).toBe(10);
    expect(e.getStatusBurn()?.remainingMs).toBe(2000);
  });

  it('accumulates DPS from multiple burn sources', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 1000, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 2000 });
    e.applyDebuff({ type: 'burn', dps: 3, remainingMs: 2000 });
    expect(e.getStatusBurn()?.dps).toBe(13); // 10 + 3
  });

  it('takes max duration (does not shorten)', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 1000, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 2000 });
    e.applyDebuff({ type: 'burn', dps: 5, remainingMs: 3000 });
    expect(e.getStatusBurn()?.remainingMs).toBe(3000); // max(2000, 3000)
  });

  it('accumulates DPS and takes max duration together', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 1000, speed: 0, contactDamage: 0, contactRadius: 0 });
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 2000 });
    e.applyDebuff({ type: 'burn', dps: 5, remainingMs: 3000 });
    expect(e.getStatusBurn()?.dps).toBe(15); // 10 + 5
    expect(e.getStatusBurn()?.remainingMs).toBe(3000); // max(2000, 3000)
  });
});

// spec#5 §4.2：Enemy 基类声明可选钩子，取代 CombatManager duck-typing。
// 子类按需实现；基类实例调用未实现的钩子必须 undefined 安全（?. 短路）。
describe('Enemy base class — 可选钩子 (spec#5 §4.2)', () => {
  it('基类 Enemy 实例 aggroState 默认 undefined', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(e.aggroState).toBeUndefined();
  });

  it('基类 Enemy 实例调用未实现的钩子不抛错（undefined 安全）', () => {
    const e = new TestEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    expect(() => e.enrage?.()).not.toThrow();
    expect(() => e.tickSummonTimer?.(16)).not.toThrow();
    expect(() => e.onBodyDied?.()).not.toThrow();
    expect(() => e.onBoundHeadDied?.(e, 0)).not.toThrow();
    expect(() => e.tickHeadRevive?.(0, () => null)).not.toThrow();
    expect(e.getChargeKnockback?.()).toBeUndefined();
  });

  it('YangYunRed 非冲撞状态 getChargeKnockback 返回 null', () => {
    registerYangYunRed();
    const elite = new YangYunRedEnemy('elite-c1', 0, 0);
    expect(elite.getChargeKnockback?.()).toBeNull();
  });

  it('YangYunRed 冲撞中 getChargeKnockback 返回方向向量', () => {
    registerYangYunRed();
    const elite = new YangYunRedEnemy('elite-c2', 0, 0);
    // 反射设置冲撞状态（private 字段，测试可观察性模式）
    const internal = elite as unknown as {
      chargeState: 'idle' | 'windup' | 'charging';
      chargeDirX: number;
      chargeDirY: number;
    };
    internal.chargeState = 'charging';
    internal.chargeDirX = 1;
    internal.chargeDirY = 0;
    expect(elite.getChargeKnockback?.()).toEqual({ vx: 1, vy: 0 });
  });

  it('YangYunRed 实例 aggroState 初始 neutral 且 enrage 为函数', () => {
    registerYangYunRed();
    const elite = new YangYunRedEnemy('elite-1', 0, 0);
    expect(elite.aggroState).toBe('neutral');
    expect(typeof elite.enrage).toBe('function');
    elite.enrage();
    expect(elite.aggroState).toBe('hostile');
  });

  it('DanYuxuanBody 实例实现 tickSummonTimer/onBodyDied/onBoundHeadDied/tickHeadRevive', () => {
    registerDanYuxuanBody();
    const body = new DanYuxuanBodyEnemy('body-1', 0, 0);
    expect(typeof body.tickSummonTimer).toBe('function');
    expect(typeof body.onBodyDied).toBe('function');
    expect(typeof body.onBoundHeadDied).toBe('function');
    expect(typeof body.tickHeadRevive).toBe('function');
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
