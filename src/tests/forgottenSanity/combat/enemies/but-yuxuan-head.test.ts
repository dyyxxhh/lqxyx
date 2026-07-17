import { describe, expect, it } from 'vitest';

import { ButYuxuanHeadEnemy, registerButYuxuanHead } from '../../../../forgottenSanity/combat/enemies/ButYuxuanHead';
import type { EnemyUpdateContext, Projectile, PlayerNoiseEvent } from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  proj?: Projectile[];
  zones?: unknown[];
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  const proj = opts.proj ?? [];
  const zones = opts.zones ?? [];
  return {
    playerPosition: opts.playerPos ?? { x: 0, y: 100 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: (p) => { proj.push(p); },
    spawnZone: (z) => { zones.push(z); },
    spawnEnemy: () => null,
    isWalkable: () => true,
  };
}

// 但宇轩头颅 perception（spec §5.11.6 ①）：
// 视野 350 / 120° 锥（非 360°）/ 噪声 1.0 / instant / 3s / 3s / 5s / 游走
describe('ButYuxuanHeadEnemy 基础数值 + perception (spec §5.1① / §5.11.6)', () => {
  registerButYuxuanHead();

  it('HP45 / contact8 / speed60 / textureKey', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    expect(e.maxHp).toBe(45);
    expect(e.contactDamage).toBe(8);
    expect(e.speed).toBe(60);
    expect(e.textureKey).toBe('sprite.danYuxuan.headPart');
  });

  it('perception 字段匹配 spec §5.11.6 ①', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    expect(e.perception.visionRange).toBe(350);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(1.0);
    expect(e.perception.alertToChaseMs).toBe('instant');
    expect(e.perception.chaseToSearchMs).toBe(3000);
    expect(e.perception.searchToAlertMs).toBe(3000);
    expect(e.perception.alertToIdleMs).toBe(5000);
    expect(e.perception.patrolKind).toBe('wander');
    expect(e.perception.patrolRadius).toBe(80);
    expect(e.perception.patrolSpeed).toBe(50);
    expect(e.perception.patrolSegmentMs).toBe(1500);
    expect(e.perception.static360Vision).toBeFalsy(); // 头颅类始终 120° 锥
  });
});

describe('ButYuxuanHeadEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('idle → chase（instant）当玩家在视野锥内', () => {
    // 敌人 (0,0) 默认朝下 (0,1)；玩家 (0,100) 在锥内，距离 100 ≤ 350
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } }));
    expect(e.aiState).toBe('chase');
  });

  it('idle 保持 idle 当玩家在锥外且无噪声', () => {
    // 敌人 (0,0) 朝下；玩家 (100,0) 在 90° 方向，超出 60° 半角
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('idle → chase 当噪声到达（即使玩家在锥外）', () => {
    // 玩家在锥外，但噪声半径 200 × 1.0 ≥ 距离 150
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({
      playerPos: { x: 150, y: 0 },
      playerNoise: { x: 150, y: 0, radius: 200 },
    }));
    expect(e.aiState).toBe('chase'); // 即转
  });

  it('chase → search 当脱离视野 3s', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } })); // idle→chase
    expect(e.aiState).toBe('chase');
    // 玩家远走，脱离视野
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → chase 当再次感知玩家', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // → search
    expect(e.aiState).toBe('search');
    // 玩家出现在 lastKnownPlayerPos 附近（敌人朝向已对准该点）
    const lkp = e.lastKnownPlayerPos!;
    e.setFacing(0, 1);
    e.update(16, ctxStub({ playerPos: { x: lkp.x, y: lkp.y + 50 }, playerNoise: null }));
    expect(e.aiState).toBe('chase');
  });

  it('search → alert 当到达目击点 + 3s 无新刺激', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // → search
    // search 态向 lastKnownPlayerPos 移动，3s 后到达且超时 → alert
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 5s 无新刺激', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // → search
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // → alert
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // → idle
    expect(e.aiState).toBe('idle');
  });
});

describe('ButYuxuanHeadEnemy 攻击 (spec §5.1①，仅 chase 态)', () => {
  it('chase 态 3s 间隔触发 2 发追踪弹', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    const proj: Projectile[] = [];
    // 玩家在锥内，update(3000) → idle→chase（instant）+ attackTimer 耗尽 → 触发
    e.update(3000, ctxStub({ playerPos: { x: 0, y: 100 }, proj }));
    expect(proj).toHaveLength(2);
    expect(proj[0]!.speed).toBe(120);
    expect(proj[0]!.damage).toBe(14);
    expect(proj[0]!.homingTarget).toBe('player');
    expect(proj[0]!.remainingMs).toBe(3000);
    expect(proj[0]!.proceduralKind).toBe('danYuxuanOrb');
  });

  it('idle 态不攻击', () => {
    const e = new ButYuxuanHeadEnemy('e1', 0, 0);
    const proj: Projectile[] = [];
    // 玩家在锥外，保持 idle
    e.update(3000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null, proj }));
    expect(proj).toHaveLength(0);
  });
});

describe('ButYuxuanHeadEnemy 巡逻 (spec §5.11.4 游走类)', () => {
  it('idle 态在出生点周边 80px 内游走', () => {
    const e = new ButYuxuanHeadEnemy('e1', 100, 100);
    // 玩家远离，保持 idle
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 20; i++) {
      e.update(1500, farCtx); // 多个巡逻段
    }
    const dx = e.x - 100;
    const dy = e.y - 100;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 巡逻半径 80，允许少许溢出（拉回机制）
    expect(dist).toBeLessThan(120);
  });
});
