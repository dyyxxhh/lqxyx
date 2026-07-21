import { describe, expect, it, vi } from 'vitest';

import { CombatManager, type IsWalkableFn, type CombatCallbacks } from '../../../forgottenSanity/combat/CombatManager';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';
import { Enemy, registerEnemyKind, type EnemyUpdateContext, type EnemyKind, type Projectile, type ZoneEffect, createCombatRng } from '../../../forgottenSanity/combat/Enemy';
import { WEAK_PUNCH_DAMAGE } from '../../../forgottenSanity/combat/DamageType';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  readonly perception = {
    visionRange: 350,
    visionHalfAngleDeg: 60,
    noiseSensitivity: 1.0,
    alertToChaseMs: 'instant' as const,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
    patrolKind: 'wander' as const,
  };
  lastSeenContext: EnemyUpdateContext | null = null;
  update(_deltaMs: number, ctx: EnemyUpdateContext): void {
    this.lastSeenContext = ctx;
  }
}

registerEnemyKind('butYuxuanHead', (opts) => new DummyEnemy(opts));

// 设计变更：模拟中立杨云红边（duck-typed aggroState/enrage），供 CombatManager 激怒检测测试。
// 不依赖 Task 14 的真实 YangYunRedEnemy，使 Task 4 即可独立验证激怒逻辑。
class FakeNeutralElite extends Enemy {
  readonly kind = 'yangYunRed' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  readonly perception = {
    visionRange: 350,
    visionHalfAngleDeg: 60,
    noiseSensitivity: 1.0,
    alertToChaseMs: 'instant' as const,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
    patrolKind: 'wander' as const,
  };
  aggroState: 'neutral' | 'hostile' = 'neutral';
  enragedCount = 0;
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
  enrage(): void { this.aggroState = 'hostile'; this.enragedCount++; }
}

// spec §5.11.7 远房 4Hz 降级测试用：支持 roomId/kind 覆盖的 fake enemy
class FakeRoomEnemy extends Enemy {
  readonly kind: EnemyKind;
  readonly textureKey = null;
  readonly proceduralKind = null;
  readonly perception = {
    visionRange: 350,
    visionHalfAngleDeg: 60,
    noiseSensitivity: 1.0,
    alertToChaseMs: 'instant' as const,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
    patrolKind: 'wander' as const,
  };
  updateCalls: number[] = [];
  constructor(
    id: string, x: number, y: number,
    kindOverride: EnemyKind = 'butYuxuanHead',
    roomId: string | null = null,
  ) {
    super({ id, x, y, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    this.kind = kindOverride;
    this.currentRoomId = roomId;
  }
  update(deltaMs: number, _ctx: EnemyUpdateContext): void {
    this.updateCalls.push(deltaMs);
  }
}

// spec §9.3 duplicateSilentOnes 测试用：为 7 种普通缄默者（除 butYuxuanHead 已注册 DummyEnemy 外）
// 注册 FakeRoomEnemy 工厂，使 createEnemy 在复制时能成功构造。
for (const k of [
  'qinHaoruiHead', 'deskChairs', 'phone', 'bloodHand',
  'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye',
] as const) {
  registerEnemyKind(k, (opts) => new FakeRoomEnemy(opts.id, opts.x, opts.y, k));
}

function makeManager(callbacks: CombatCallbacks = {}, isWalkable: IsWalkableFn = () => true): CombatManager {
  const player = new PlayerCombat();
  return new CombatManager(player, callbacks, isWalkable);
}

describe('CombatManager 玩家占位普攻 (spec §3.1 弱拳 5 伤)', () => {
  it('playerAttack 对扇形内敌人造成 5 伤', () => {
    const mgr = makeManager();
    const enemy = new DummyEnemy({ id: 'e1', x: 50, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 });
    expect(enemy.hp).toBe(100 - WEAK_PUNCH_DAMAGE);
  });

  it('playerAttack 不命中扇形外敌人', () => {
    const mgr = makeManager();
    const enemy = new DummyEnemy({ id: 'e1', x: -50, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // 朝右，敌人在左
    expect(enemy.hp).toBe(100);
  });
});

describe('CombatManager 接触伤害', () => {
  it('敌人接触玩家造成 contactDamage，1s 冷却', () => {
    const onDamaged = vi.fn();
    const mgr = makeManager({ onPlayerDamaged: onDamaged });
    const enemy = new DummyEnemy({ id: 'e1', x: 0, y: 0, maxHp: 100, speed: 0, contactDamage: 8, contactRadius: 30 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(10, 0);
    mgr.update(500); // 首次接触，触发 cooldown=1000
    expect(onDamaged).toHaveBeenCalledTimes(1);
    expect(mgr.player.hp).toBe(92);
    mgr.update(500); // 累计 1s，cooldown 仍剩 500ms，不触发
    expect(onDamaged).toHaveBeenCalledTimes(1);
    mgr.update(500); // 累计 1.5s，cooldown 归零，再次触发
    expect(onDamaged).toHaveBeenCalledTimes(2);
    expect(mgr.player.hp).toBe(84);
  });

  it('玩家死亡触发 onPlayerDied', () => {
    const onDied = vi.fn();
    const mgr = makeManager({ onPlayerDied: onDied });
    const enemy = new DummyEnemy({ id: 'e1', x: 0, y: 0, maxHp: 100, speed: 0, contactDamage: 200, contactRadius: 30 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(10, 0);
    mgr.update(100);
    expect(mgr.player.isDead).toBe(true);
    expect(onDied).toHaveBeenCalledTimes(1);
  });
});

describe('CombatManager 弹幕推进', () => {
  it('spawnProjectile 后 update 推进位置', () => {
    const mgr = makeManager();
    mgr.setPlayerPosition(1000, 1000);
    const p: Projectile = {
      id: 'p1', x: 0, y: 0, vx: 100, vy: 0, speed: 100,
      damage: 10, category: 'aoe', homingTarget: null, homingStrength: 0,
      remainingMs: 5000, radius: 10, proceduralKind: 'danYuxuanOrb', ownerId: 'e1',
    };
    mgr.spawnProjectile(p);
    mgr.update(1000); // 1s → x += 100
    expect(mgr.projectiles[0]!.x).toBeCloseTo(100, 5);
  });

  it('追踪弹向玩家转向', () => {
    const mgr = makeManager();
    mgr.setPlayerPosition(0, 100);
    const p: Projectile = {
      id: 'p1', x: 0, y: 0, vx: 100, vy: 0, speed: 100,
      damage: 10, category: 'aoe', homingTarget: 'player', homingStrength: Math.PI,
      remainingMs: 5000, radius: 10, proceduralKind: 'danYuxuanOrb', ownerId: 'e1',
    };
    mgr.spawnProjectile(p);
    mgr.update(100); // 短帧：转向但未触达玩家
    // 强追踪（PI rad/s）应使 vy > 0（向玩家）
    expect(mgr.projectiles[0]!.vy).toBeGreaterThan(0);
  });

  it('弹幕命中玩家造成伤害并消失', () => {
    const mgr = makeManager();
    mgr.setPlayerPosition(15, 0);
    const p: Projectile = {
      id: 'p1', x: 0, y: 0, vx: 100, vy: 0, speed: 100,
      damage: 14, category: 'aoe', homingTarget: null, homingStrength: 0,
      remainingMs: 5000, radius: 10, proceduralKind: 'danYuxuanOrb', ownerId: 'e1',
    };
    mgr.spawnProjectile(p);
    mgr.update(100);
    expect(mgr.player.hp).toBe(100 - 14);
    expect(mgr.projectiles).toHaveLength(0);
  });
});

describe('CombatManager 区域效果', () => {
  it('windup 期间无伤害，windup 结算 burstDamage', () => {
    const mgr = makeManager();
    mgr.setPlayerPosition(50, 0);
    const z: ZoneEffect = {
      id: 'z1', shape: 'circle', x: 50, y: 0, radius: 60, width: 0, height: 0, angle: 0,
      vx: 0, vy: 0, expandSpeed: 0, maxRadius: 60, windupMs: 1200, burstDamage: 30,
      damagePerSecond: 0, category: 'aoe', remainingMs: 1300, applyDebuffOnce: false,
      debuffApplied: false, proceduralKind: 'phoneExplosion', ownerId: 'e1',
    };
    mgr.spawnZone(z);
    mgr.update(1000); // windup 中
    expect(mgr.player.hp).toBe(100);
    mgr.update(300); // windup 结束 → burst
    expect(mgr.player.hp).toBe(70);
  });

  it('DoT 持续伤害', () => {
    const mgr = makeManager();
    mgr.setPlayerPosition(0, 0);
    const z: ZoneEffect = {
      id: 'z1', shape: 'circle', x: 0, y: 0, radius: 50, width: 0, height: 0, angle: 0,
      vx: 0, vy: 0, expandSpeed: 0, maxRadius: 50, windupMs: 0, burstDamage: 0,
      damagePerSecond: 5, category: 'dot', remainingMs: 2000, applyDebuffOnce: false,
      debuffApplied: false, proceduralKind: 'phoneRinging', ownerId: 'e1',
    };
    mgr.spawnZone(z);
    mgr.update(1000); // 5/s * 1s = 5
    expect(mgr.player.hp).toBe(95);
  });
});

describe('CombatManager 身体上限 (spec §5.9)', () => {
  it('canSpawnBody 初始 true，registerBody 后 false，unregisterBody 恢复', () => {
    const mgr = makeManager();
    expect(mgr.canSpawnBody()).toBe(true);
    mgr.registerBody();
    mgr.registerBody();
    expect(mgr.canSpawnBody()).toBe(false); // 达上限 2
    mgr.unregisterBody();
    expect(mgr.canSpawnBody()).toBe(true);
  });
});

describe('CombatManager 敌人死亡回调', () => {
  it('onEnemyKilled 在敌人死亡时触发', () => {
    const onKill = vi.fn();
    const mgr = makeManager({ onEnemyKilled: onKill });
    const enemy = new DummyEnemy({ id: 'e1', x: 50, y: 0, maxHp: 5, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // 5 伤致死
    mgr.update(0);
    expect(onKill).toHaveBeenCalledTimes(1);
    expect(onKill.mock.calls[0]![0].id).toBe('e1');
  });
});

// 设计变更：杨云红边中立→激怒机制（CombatManager 检测）
describe('CombatManager 杨云红边激怒检测 (设计变更)', () => {
  it('玩家攻击命中敌人时，350px 视野内中立杨云红边激怒', () => {
    const mgr = makeManager();
    const target = new DummyEnemy({ id: 't1', x: 50, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    const elite = new FakeNeutralElite({ id: 'elite1', x: 200, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(target);
    mgr.addEnemy(elite);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // 命中 target(50,0)；elite(200,0) 距 target 150 ≤ 350
    expect(elite.aggroState).toBe('hostile');
    expect(elite.enragedCount).toBe(1);
  });

  it('350px 视野外的中立杨云红边不激怒', () => {
    const mgr = makeManager();
    const target = new DummyEnemy({ id: 't1', x: 50, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    const elite = new FakeNeutralElite({ id: 'elite1', x: 500, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(target);
    mgr.addEnemy(elite);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // elite 距 target 450 > 350
    expect(elite.aggroState).toBe('neutral');
    expect(elite.enragedCount).toBe(0);
  });

  it('玩家直接攻击杨云红边本人 → 自身激怒', () => {
    const mgr = makeManager();
    const elite = new FakeNeutralElite({ id: 'elite1', x: 50, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(elite);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // 直接命中 elite 本人（距离 0 ≤ 350）
    expect(elite.aggroState).toBe('hostile');
  });

  it('未命中任何敌人时不激怒', () => {
    const mgr = makeManager();
    const elite = new FakeNeutralElite({ id: 'elite1', x: 500, y: 0, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    mgr.addEnemy(elite);
    mgr.setPlayerPosition(0, 0);
    mgr.playerAttack({ x: 1, y: 0 }); // elite 太远，攻击落空
    expect(elite.aggroState).toBe('neutral');
  });

  it('中立杨云红边不造成接触伤害', () => {
    const onDamaged = vi.fn();
    const mgr = makeManager({ onPlayerDamaged: onDamaged });
    const elite = new FakeNeutralElite({ id: 'elite1', x: 10, y: 0, maxHp: 100, speed: 0, contactDamage: 22, contactRadius: 30 });
    mgr.addEnemy(elite);
    mgr.setPlayerPosition(0, 0);
    mgr.update(1000); // 中立下应跳过接触伤害
    expect(onDamaged).not.toHaveBeenCalled();
  });
});

// grill 2026-07-17：CombatManager 把 PlayerCombat.lastNoiseRadius 传给怪物 update context
describe('CombatManager 噪声传递 (grill 2026-07-17，供怪物三态机)', () => {
  it('玩家 lastNoiseRadius>0 时 ctx.playerNoise 包含玩家位置与半径', () => {
    const mgr = makeManager();
    const enemy = new DummyEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(100, 200);
    mgr.player.setNoiseRadius(150); // 普攻噪声
    mgr.update(16);
    expect(enemy.lastSeenContext).not.toBeNull();
    expect(enemy.lastSeenContext!.playerNoise).not.toBeNull();
    expect(enemy.lastSeenContext!.playerNoise!.x).toBe(100);
    expect(enemy.lastSeenContext!.playerNoise!.y).toBe(200);
    expect(enemy.lastSeenContext!.playerNoise!.radius).toBe(150);
  });

  it('玩家 lastNoiseRadius=0 时 ctx.playerNoise=null', () => {
    const mgr = makeManager();
    const enemy = new DummyEnemy({ id: 'e1', x: 0, y: 0, maxHp: 10, speed: 0, contactDamage: 0, contactRadius: 0 });
    mgr.addEnemy(enemy);
    mgr.setPlayerPosition(100, 200);
    // 默认 lastNoiseRadius=0
    mgr.update(16);
    expect(enemy.lastSeenContext!.playerNoise).toBeNull();
  });
});

describe('player projectile wall collision (spec §3.2 rangedPiercing 遇墙停止)', () => {
  it('projectile is removed when next step is not walkable', () => {
    const isWalkable = (x: number, _y: number): boolean => x < 200;
    const cm = new CombatManager(new PlayerCombat(), {}, isWalkable, createCombatRng(1));
    cm.setPlayerPosition(0, 0);
    cm.spawnPlayerProjectile({
      id: 'p1', x: 100, y: 0,
      vx: 400, vy: 0, speed: 400,
      damage: 10, category: 'melee',
      pierceRemaining: 1, remainingMs: 100000, radius: 8,
      proceduralKind: 'rulerShard',
    });
    cm.update(16);
    // 投射物推进 ~6.4px → 仍 walkable (106.4 < 200)
    cm.update(16);
    // 多帧推进直到 x ≥ 200
    for (let i = 0; i < 100; i++) cm.update(16);
    // 投射物应已被墙消除（remainingMs 仍有大量余额，证明是墙导致消除而非超时）
    expect(cm.playerProjectiles.length).toBe(0);
  });
});

// spec §5.11.7 远房 4Hz 降级：当前/邻接房间 60Hz，远房 4Hz（每 250ms 推进 250ms deltaMs）。
// 召唤核心的召唤计时器（tickSummonTimer）与头颅复活检查（tickHeadRevive）始终按真实时间。
describe('far-room 4Hz downgrade (spec §5.11.7)', () => {
  it('enemy in non-adjacent room only advances every 250ms', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition(0, 0);
    cm.setAdjacentRooms(new Map([['r1', new Set<string>(['r2'])]]));
    cm.setPlayerRoomId('r1');
    const enemy = new FakeRoomEnemy('e1', 5000, 5000, 'butYuxuanHead', 'r9'); // 远房
    cm.addEnemy(enemy);
    cm.update(100); // < 250ms → 累计但未推进
    expect(enemy.updateCalls.length).toBe(0);
    cm.update(150); // 累计 250ms → 推进一次 250ms
    expect(enemy.updateCalls.length).toBe(1);
    expect(enemy.updateCalls[0]).toBe(250);
  });

  it('enemy in adjacent room advances every frame', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition(0, 0);
    cm.setAdjacentRooms(new Map([['r1', new Set<string>(['r2'])]]));
    cm.setPlayerRoomId('r1');
    const enemy = new FakeRoomEnemy('e2', 100, 100, 'butYuxuanHead', 'r2'); // 邻接
    cm.addEnemy(enemy);
    cm.update(16);
    expect(enemy.updateCalls.length).toBe(1);
    expect(enemy.updateCalls[0]).toBe(16);
  });

  it('enemy in current room advances every frame with real deltaMs', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition(0, 0);
    cm.setAdjacentRooms(new Map());
    cm.setPlayerRoomId('r1');
    const enemy = new FakeRoomEnemy('e3', 0, 0, 'butYuxuanHead', 'r1'); // 当前房
    cm.addEnemy(enemy);
    cm.update(33);
    expect(enemy.updateCalls.length).toBe(1);
    expect(enemy.updateCalls[0]).toBe(33);
  });

  it('dan yuxuan body summon timer always advances (real time)', async () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition(0, 0);
    cm.setAdjacentRooms(new Map());
    cm.setPlayerRoomId('r1');
    // 用 DanYuxuanBodyEnemy 实例（真实 tickSummonTimer）
    const { DanYuxuanBodyEnemy } = await import('../../../forgottenSanity/combat/enemies/DanYuxuanBody');
    const body = new DanYuxuanBodyEnemy('b1', 5000, 5000);
    body.currentRoomId = 'r9'; // 远房
    const tickSummonSpy = vi.spyOn(
      body as unknown as { tickSummonTimer: (ms: number) => void },
      'tickSummonTimer',
    );
    cm.addEnemy(body);
    cm.update(100);
    expect(tickSummonSpy).toHaveBeenCalledWith(100); // 真实 deltaMs，不受 4Hz 降级影响
  });
});

// spec §9.3 缄默者复制 ×2 — 红边击杀后复制 8 种普通缄默者（排除但宇轩身体、杨云红边、影分身）
describe('duplicateSilentOnes (spec §9.3 缄默者复制)', () => {
  it('duplicates count of normal silent ones only (excludes body/elite/phantom)', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.addEnemy(new FakeRoomEnemy('e1', 100, 100, 'butYuxuanHead'));
    cm.addEnemy(new FakeRoomEnemy('e2', 200, 100, 'qinHaoruiHead'));
    cm.addEnemy(new FakeRoomEnemy('b1', 300, 100, 'danYuxuanBody')); // 不复制
    cm.addEnemy(new FakeRoomEnemy('elite', 400, 100, 'yangYunRed')); // 不复制
    cm.addEnemy(new FakeRoomEnemy('phantom', 500, 100, 'yangYunRedPhantom')); // 不复制
    const before = cm.enemies.filter((e) => !e.isDuplicate).length;
    expect(before).toBe(5);
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    const duplicates = cm.enemies.filter((e) => e.isDuplicate);
    expect(duplicates.length).toBe(2); // 仅 2 个普通缄默者各复制 1 个
  });

  it('duplicate is born outside player viewport + 100px buffer', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.addEnemy(new FakeRoomEnemy('e1', 0, 0, 'butYuxuanHead'));
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    const dup = cm.enemies.find((e) => e.isDuplicate);
    expect(dup).toBeDefined();
    // 在视口+100 buffer 外
    const outside = dup!.x < -100 || dup!.x > 1380 || dup!.y < -100 || dup!.y > 820;
    expect(outside).toBe(true);
  });

  it('duplicate isDuplicate=true prevents recursive duplication', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.addEnemy(new FakeRoomEnemy('e1', 0, 0, 'butYuxuanHead'));
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    expect(cm.enemies.filter((e) => e.isDuplicate).length).toBe(1);
    // 再次调用不应复制 isDuplicate=true 的敌人
    cm.duplicateSilentOnes({ x: 0, y: 0, width: 1280, height: 720 });
    // e1 是原体（isDuplicate=false）会再复制 1 个，但已有 duplicate 不会再复制
    // 所以总数 = 1 原体 + 2 复制 = 3
    expect(cm.enemies.filter((e) => e.isDuplicate).length).toBe(2);
  });
});

// Task 6 (#4): 敌方投射物撞墙检测 + spawnWallHitFx 粒子（3 个 / 200ms 渐隐 / 白色 0xffffff）
describe('#4 enemy projectile wall collision + spawnWallHitFx (Task 6)', () => {
  function makeWallCm(): CombatManager {
    // 墙在 x>=100；投射物从 x=50 向 +x 推进必撞墙
    const isWalkable = (x: number, _y: number): boolean => x < 100;
    const cm = new CombatManager(new PlayerCombat(), {}, isWalkable, createCombatRng(1));
    cm.setPlayerPosition(0, 1000); // 玩家远离投射物，避免触发玩家碰撞
    return cm;
  }

  function spawnEnemyProjectile(cm: CombatManager): void {
    const p: Projectile = {
      id: 'p1', x: 50, y: 50, vx: 200, vy: 0, speed: 200,
      damage: 10, category: 'aoe', homingTarget: null, homingStrength: 0,
      remainingMs: 100000, radius: 10, proceduralKind: 'danYuxuanOrb', ownerId: 'e1',
    };
    cm.spawnProjectile(p);
  }

  it('stops enemy projectile on wall hit (sub-stepped, no tunneling)', () => {
    const cm = makeWallCm();
    spawnEnemyProjectile(cm);
    cm.update(16 * 20); // 320ms → 推进 64px → x≈114 应撞墙（x≥100）
    expect(cm.projectiles.length).toBe(0);
  });

  it('spawns 3 wall hit particles on wall collision', () => {
    const cm = makeWallCm();
    spawnEnemyProjectile(cm);
    cm.update(16 * 20); // 撞墙生成粒子
    const particles = cm.getWallHitParticles();
    expect(particles.length).toBe(3);
    // 粒子均为白色
    for (const p of particles) {
      expect(p.color).toBe(0xffffff);
      expect(p.maxLifeMs).toBe(200);
      expect(p.lifeMs).toBe(200); // 同帧生成的粒子尚未老化
    }
  });

  it('particles fade out after 200ms', () => {
    const cm = makeWallCm();
    spawnEnemyProjectile(cm);
    cm.update(16 * 20); // 撞墙生成粒子（updateWallHitParticles 先于 updateProjectiles，故未老化）
    expect(cm.getWallHitParticles().length).toBe(3);
    cm.update(200); // 推进 200ms → 粒子 lifeMs 归零
    expect(cm.getWallHitParticles().length).toBe(0);
  });

  it('enemy projectile that does not hit wall continues flying (no false removal)', () => {
    const cm = new CombatManager(new PlayerCombat(), {}, () => true, createCombatRng(1));
    cm.setPlayerPosition(0, 1000);
    spawnEnemyProjectile(cm);
    cm.update(16 * 20); // 全图可走，应继续推进
    expect(cm.projectiles.length).toBe(1);
    expect(cm.getWallHitParticles().length).toBe(0);
  });
});
