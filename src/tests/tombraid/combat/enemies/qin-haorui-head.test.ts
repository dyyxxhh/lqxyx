import { describe, expect, it } from 'vitest';

import { QinHaoruiHeadEnemy, registerQinHaoruiHead } from '../../../../tombraid/combat/enemies/QinHaoruiHead';
import type {
  EnemyUpdateContext,
  PlayerNoiseEvent,
  Projectile,
  ZoneEffect,
} from '../../../../tombraid/combat/Enemy';
import { createCombatRng } from '../../../../tombraid/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  proj?: Projectile[];
  zones?: ZoneEffect[];
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

// 秦浩睿头颅 perception（spec §5.11.6 ②）：
// 视野 320 / 120° 锥（非 360°）/ 噪声 1.0 / instant / 3s / 3s / 5s / 游走
describe('QinHaoruiHeadEnemy 基础数值 + perception (spec §5.1② / §5.11.6 ②)', () => {
  registerQinHaoruiHead();

  it('HP55 / contact8 / speed50 / textureKey', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    expect(e.maxHp).toBe(55);
    expect(e.contactDamage).toBe(8);
    expect(e.speed).toBe(50);
    expect(e.textureKey).toBe('sprite.qinHaorui.headPart');
  });

  it('perception 字段匹配 spec §5.11.6 ②', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    expect(e.perception.visionRange).toBe(320);
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
    expect(e.perception.static360Vision).toBeFalsy();
  });
});

describe('QinHaoruiHeadEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('idle → chase（instant）当玩家在视野锥内', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } }));
    expect(e.aiState).toBe('chase');
  });

  it('idle 保持 idle 当玩家在锥外且无噪声', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('idle → chase 当噪声到达（即使玩家在锥外）', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({
      playerPos: { x: 150, y: 0 },
      playerNoise: { x: 150, y: 0, radius: 200 },
    }));
    expect(e.aiState).toBe('chase');
  });

  it('chase → search 当脱离视野 3s', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } }));
    expect(e.aiState).toBe('chase');
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当到达目击点 + 3s 无新刺激', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } }));
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 5s 无新刺激', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 100 } }));
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });
});

describe('QinHaoruiHeadEnemy 攻击 (spec §5.1②，仅 chase 态)', () => {
  it('chase 态 5s 间隔触发尖叫波 zone', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(5000, ctxStub({ playerPos: { x: 0, y: 100 }, zones }));
    expect(zones).toHaveLength(1);
    const z = zones[0]!;
    expect(z.shape).toBe('circle');
    expect(z.radius).toBe(150);
    expect(z.burstDamage).toBe(18);
    expect(z.proceduralKind).toBe('screamWave');
    expect(z.debuff).toBeDefined();
    expect(z.debuff?.type).toBe('slow');
    if (z.debuff?.type === 'slow') {
      expect(z.debuff.multiplier).toBeCloseTo(0.4);
      expect(z.debuff.remainingMs).toBe(2000);
    }
  });

  it('idle 态不攻击', () => {
    const e = new QinHaoruiHeadEnemy('q1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(5000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null, zones }));
    expect(zones).toHaveLength(0);
  });
});

describe('QinHaoruiHeadEnemy 巡逻 (spec §5.11.4 游走类)', () => {
  it('idle 态在出生点周边 80px 内游走', () => {
    const e = new QinHaoruiHeadEnemy('q1', 100, 100);
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 20; i++) {
      e.update(1500, farCtx);
    }
    const dx = e.x - 100;
    const dy = e.y - 100;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeLessThan(120);
  });
});
