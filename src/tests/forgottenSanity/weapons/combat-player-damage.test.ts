import { describe, expect, it } from 'vitest';

import {
  CombatManager,
  type IsWalkableFn,
  type CombatCallbacks,
  type PlayerProjectile,
  type PlayerZone,
} from '../../../forgottenSanity/combat/CombatManager';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';
import {
  Enemy,
  registerEnemyKind,
  type EnemyConstructorOpts,
  type EnemyKind,
  type EnemyUpdateContext,
} from '../../../forgottenSanity/combat/Enemy';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
}
registerEnemyKind('butYuxuanHead', (opts) => new DummyEnemy(opts));

function makeEnemy(x: number, y: number, hp: number): DummyEnemy {
  const opts: EnemyConstructorOpts = { id: `e${x}-${y}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24 };
  return new DummyEnemy(opts);
}

function makeManager(callbacks: CombatCallbacks = {}, isWalkable: IsWalkableFn = () => true): CombatManager {
  return new CombatManager(new PlayerCombat(), callbacks, isWalkable);
}

describe('damageEnemiesInFan (plan 4)', () => {
  it('对扇形内敌人造成伤害并返回总伤害；不命中扇形外', () => {
    const m = makeManager();
    const inFan = makeEnemy(40, 0, 100);
    const behind = makeEnemy(-40, 0, 100);
    m.addEnemy(inFan);
    m.addEnemy(behind);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 15, category: 'melee' });
    expect(inFan.hp).toBe(85);
    expect(behind.hp).toBe(100);
    expect(dealt).toBe(15);
  });

  it('伤害上限不超过敌人 hp（返回实际扣血）', () => {
    const m = makeManager();
    const weak = makeEnemy(40, 0, 5);
    m.addEnemy(weak);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 99, category: 'melee' });
    expect(weak.hp).toBe(0);
    expect(dealt).toBe(5);
  });

  it('附带 debuff 时应用到命中敌人（万魂幡 fear）', () => {
    const m = makeManager();
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, {
      amount: 5, category: 'melee',
      debuff: { type: 'fear', remainingMs: 2000, sourceX: 0, sourceY: 0 },
    });
    expect(e.getFleeFrom()).toEqual({ x: 0, y: 0 });
  });

  it('amount 0 时仍应用 debuff（锁链 root）', () => {
    const m = makeManager();
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, {
      amount: 0, category: 'physical',
      debuff: { type: 'root', remainingMs: 2000 },
    });
    expect(dealt).toBe(0);
    expect(e.isRooted()).toBe(true);
  });

  it('玩家死亡时不造成伤害', () => {
    const m = makeManager();
    m.player.takeDamage({ amount: 999, category: 'melee' });
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 15, category: 'melee' });
    expect(dealt).toBe(0);
    expect(e.hp).toBe(100);
  });
});

describe('damageEnemiesInCircle (plan 4)', () => {
  it('对圆形范围内敌人造成伤害', () => {
    const m = makeManager();
    const inside = makeEnemy(10, 0, 100);
    const outside = makeEnemy(200, 0, 100);
    m.addEnemy(inside);
    m.addEnemy(outside);
    const dealt = m.damageEnemiesInCircle(0, 0, 60, { amount: 20, category: 'aoe' });
    expect(inside.hp).toBe(80);
    expect(outside.hp).toBe(100);
    expect(dealt).toBe(20);
  });
});

describe('spawnPlayerProjectile — 玩家投射物伤害敌人不伤玩家', () => {
  it('hit-once (pierceRemaining 0) 命中后移除；玩家 hp 不变', () => {
    const m = makeManager();
    m.setPlayerPosition(0, 0);
    const enemy = makeEnemy(200, 0, 45);
    m.addEnemy(enemy);
    const p: PlayerProjectile = {
      id: 'pp1', x: 0, y: 0, vx: 200, vy: 0, speed: 200, damage: 18, category: 'melee',
      pierceRemaining: 0, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    };
    m.spawnPlayerProjectile(p);
    m.update(1000);
    expect(enemy.hp).toBe(45 - 18);
    expect(m.player.hp).toBe(100);
    expect(m.playerProjectiles).toHaveLength(0);
  });

  it('有限穿透 (pierceRemaining 1) 命中 2 个敌人后移除', () => {
    const m = makeManager();
    const e1 = makeEnemy(50, 0, 10);
    const e2 = makeEnemy(80, 0, 10);
    const e3 = makeEnemy(110, 0, 10);
    m.addEnemy(e1); m.addEnemy(e2); m.addEnemy(e3);
    m.spawnPlayerProjectile({
      id: 'pp2', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 10, category: 'melee',
      pierceRemaining: 1, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    });
    m.update(400);
    expect(e1.hp).toBe(0);
    expect(e2.hp).toBe(0);
    expect(e3.hp).toBe(10);
    expect(m.playerProjectiles).toHaveLength(0);
  });

  it('无限穿透 (Infinity) 命中沿途所有敌人，存活至过期', () => {
    const m = makeManager();
    const e1 = makeEnemy(50, 0, 10);
    const e2 = makeEnemy(110, 0, 10);
    m.addEnemy(e1); m.addEnemy(e2);
    m.spawnPlayerProjectile({
      id: 'pp3', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 10, category: 'melee',
      pierceRemaining: Infinity, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    });
    m.update(500);
    expect(e1.hp).toBe(0);
    expect(e2.hp).toBe(0);
    expect(m.playerProjectiles).toHaveLength(1);
  });

  it('投射物附带 burn debuff', () => {
    const m = makeManager();
    const e = makeEnemy(50, 0, 100);
    m.addEnemy(e);
    m.spawnPlayerProjectile({
      id: 'pp4', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 5, category: 'melee',
      pierceRemaining: 0, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
      debuff: { type: 'burn', dps: 8, remainingMs: 1000 },
    });
    m.update(200);
    expect(e.hp).toBeLessThan(100); // 命中 5 + burn
  });
});

describe('spawnPlayerZone — 玩家区域伤害敌人', () => {
  it('burst + DoT 伤害范围内敌人；followPlayer 跟随', () => {
    const m = makeManager();
    const enemy = makeEnemy(20, 0, 100);
    m.addEnemy(enemy);
    m.setPlayerPosition(20, 0);
    const z: PlayerZone = {
      id: 'pz1', shape: 'circle', x: 0, y: 0, radius: 60, burstDamage: 20, damagePerSecond: 10,
      category: 'aoe', remainingMs: 1000, applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: 'bloodWheel',
    };
    m.spawnPlayerZone(z);
    m.update(500);
    expect(enemy.hp).toBe(100 - 20 - 5); // burst 20 + DoT 10*0.5
    m.update(500);
    expect(enemy.hp).toBe(100 - 20 - 10);
    expect(m.playerZones).toHaveLength(0);
  });

  it('不跟随玩家的区域（粉笔爆弹）在固定位置爆炸', () => {
    const m = makeManager();
    m.setPlayerPosition(0, 0);
    const enemy = makeEnemy(100, 0, 100);
    m.addEnemy(enemy);
    const z: PlayerZone = {
      id: 'pz2', shape: 'circle', x: 100, y: 0, radius: 50, burstDamage: 25, damagePerSecond: 0,
      category: 'aoe', remainingMs: 100, applyDebuffOnce: false, debuffApplied: false,
      followPlayer: false, proceduralKind: 'chalkBomb',
    };
    m.spawnPlayerZone(z);
    m.update(100);
    expect(enemy.hp).toBe(75);
    expect(m.playerZones).toHaveLength(0);
  });
});

describe('pullEnemiesToward (锁链万锁绞杀)', () => {
  it('将范围内敌人向中心拉近', () => {
    const m = makeManager();
    const e = makeEnemy(150, 0, 100);
    m.addEnemy(e);
    m.pullEnemiesToward(0, 0, 180, 80);
    expect(e.x).toBeLessThan(150);
    expect(e.x).toBe(70); // 150 - 80
  });

  it('不拉近范围外敌人', () => {
    const m = makeManager();
    const e = makeEnemy(500, 0, 100);
    m.addEnemy(e);
    m.pullEnemiesToward(0, 0, 180, 80);
    expect(e.x).toBe(500);
  });
});

describe('killRandomEnemyInRadiusExcluding (万魂幡拘魂)', () => {
  it('秒杀范围内一个非排除种类敌人', () => {
    const m = makeManager();
    const a = makeEnemy(50, 0, 999);
    const b = makeEnemy(60, 0, 999);
    (b as { kind: EnemyKind }).kind = 'yangYunRed';
    m.addEnemy(a); m.addEnemy(b);
    const killed = m.killRandomEnemyInRadiusExcluding(0, 0, 600, ['yangYunRed']);
    expect(killed).not.toBeNull();
    expect(killed).toBe(a);
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(false);
  });

  it('范围内只有排除种类时返回 null', () => {
    const m = makeManager();
    const elite = makeEnemy(50, 0, 320);
    (elite as { kind: EnemyKind }).kind = 'yangYunRed';
    m.addEnemy(elite);
    const killed = m.killRandomEnemyInRadiusExcluding(0, 0, 600, ['yangYunRed']);
    expect(killed).toBeNull();
    expect(elite.dead).toBe(false);
  });
});

describe('update 敌人 loop 状态门控 (plan 4 加法式)', () => {
  it('rooted 敌人跳过 AI update', () => {
    const m = makeManager();
    const mover = makeEnemy(100, 0, 100);
    let moved = false;
    Object.defineProperty(mover, 'update', { value: () => { moved = true; } });
    m.addEnemy(mover);
    mover.applyDebuff({ type: 'root', remainingMs: 5000 });
    m.update(100);
    expect(moved).toBe(false);
  });

  it('feared 敌人逃离源（不调用 AI update）', () => {
    const m = makeManager();
    const fleer = makeEnemy(100, 0, 100);
    Object.defineProperty(fleer, 'speed', { value: 60 });
    let aiCalled = false;
    Object.defineProperty(fleer, 'update', { value: () => { aiCalled = true; } });
    m.addEnemy(fleer);
    fleer.applyDebuff({ type: 'fear', remainingMs: 2000, sourceX: 0, sourceY: 0 });
    m.update(1000);
    expect(aiCalled).toBe(false);
    expect(fleer.x).toBeGreaterThan(100); // 远离 (0,0) → +x
  });

  it('无状态敌人行为不变（plan 3 回归）', () => {
    const m = makeManager();
    const e = makeEnemy(100, 0, 100);
    let updated = false;
    Object.defineProperty(e, 'update', { value: () => { updated = true; } });
    m.addEnemy(e);
    m.update(100);
    expect(updated).toBe(true);
  });
});

describe('getTimeMs', () => {
  it('随 update 递增', () => {
    const m = makeManager();
    expect(m.getTimeMs()).toBe(0);
    m.update(500);
    expect(m.getTimeMs()).toBe(500);
  });
});
