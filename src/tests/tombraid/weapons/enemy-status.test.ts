import { describe, expect, it } from 'vitest';

import {
  Enemy,
  type EnemyConstructorOpts,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
} from '../../../tombraid/combat/Enemy';

const DUMMY_PERCEPTION: EnemyPerceptionParams = {
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

class StatusTestEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = DUMMY_PERCEPTION;
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
}

function makeEnemy(maxHp = 100): StatusTestEnemy {
  const opts: EnemyConstructorOpts = {
    id: 'e1', x: 0, y: 0, maxHp, speed: 0, contactDamage: 0, contactRadius: 20,
  };
  return new StatusTestEnemy(opts);
}

describe('Enemy 状态追踪器 (plan 4 加法式)', () => {
  it('初始无状态：isStunned/isRooted false, getFleeFrom null', () => {
    const e = makeEnemy();
    expect(e.isStunned()).toBe(false);
    expect(e.isRooted()).toBe(false);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('applyDebuff stun → isStunned true，tickStatus 后过期', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    expect(e.isStunned()).toBe(true);
    e.tickStatus(500);
    expect(e.isStunned()).toBe(true);
    e.tickStatus(500);
    expect(e.isStunned()).toBe(false);
  });

  it('applyDebuff root → isRooted true', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'root', remainingMs: 2000 });
    expect(e.isRooted()).toBe(true);
    e.tickStatus(2000);
    expect(e.isRooted()).toBe(false);
  });

  it('applyDebuff fear → getFleeFrom 返回源坐标，过期后 null', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'fear', remainingMs: 2000, sourceX: 100, sourceY: 200 });
    expect(e.getFleeFrom()).toEqual({ x: 100, y: 200 });
    e.tickStatus(1000);
    expect(e.getFleeFrom()).toEqual({ x: 100, y: 200 });
    e.tickStatus(1000);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('applyDebuff burn → tickStatus 每秒扣 dps 伤害', () => {
    const e = makeEnemy(100);
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 1000 });
    e.tickStatus(500); // 5 伤
    expect(e.hp).toBe(95);
    e.tickStatus(500); // 5 伤，burn 过期
    expect(e.hp).toBe(90);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('burn 致死标记 dead', () => {
    const e = makeEnemy(10);
    e.applyDebuff({ type: 'burn', dps: 20, remainingMs: 1000 });
    e.tickStatus(1000); // 20 伤 > 10 hp
    expect(e.hp).toBe(0);
    expect(e.dead).toBe(true);
  });

  it('stun 取最强（最长时长）', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 500 });
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    expect(e.isStunned()).toBe(true);
    e.tickStatus(600);
    expect(e.isStunned()).toBe(true);
  });

  it('clearStatus 清除全部状态', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    e.applyDebuff({ type: 'root', remainingMs: 1000 });
    e.applyDebuff({ type: 'fear', remainingMs: 1000, sourceX: 0, sourceY: 0 });
    e.clearStatus();
    expect(e.isStunned()).toBe(false);
    expect(e.isRooted()).toBe(false);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('死亡后 applyDebuff/tickStatus no-op', () => {
    const e = makeEnemy(5);
    e.applyDamage({ amount: 5, category: 'melee' });
    expect(e.dead).toBe(true);
    e.applyDebuff({ type: 'burn', dps: 100, remainingMs: 1000 });
    e.tickStatus(1000);
    expect(e.hp).toBe(0);
  });

  it('tickStatus 不影响既有 invulnMs 敌人 burn', () => {
    const e = makeEnemy(100);
    e.invulnMs = 1000;
    e.applyDebuff({ type: 'burn', dps: 50, remainingMs: 1000 });
    e.tickStatus(1000); // invuln → burn 不扣血
    expect(e.hp).toBe(100);
  });
});
