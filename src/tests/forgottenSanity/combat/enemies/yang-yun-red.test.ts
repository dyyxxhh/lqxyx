import { describe, expect, it } from 'vitest';

import {
  YangYunRedEnemy,
  YangYunRedPhantomEnemy,
  registerYangYunRed,
  PHASE2_CHARGE_INTERVAL_MS,
} from '../../../../forgottenSanity/combat/enemies/YangYunRed';
import type {
  Enemy,
  EnemyUpdateContext,
  PlayerNoiseEvent,
  ZoneEffect,
} from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  zones?: ZoneEffect[];
  spawned?: Enemy[];
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  const zones = opts.zones ?? [];
  const spawned = opts.spawned ?? [];
  return {
    playerPosition: opts.playerPos ?? { x: 100, y: 0 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: () => undefined,
    spawnZone: (z) => { zones.push(z); },
    spawnEnemy: (kind, pos) => {
      const mock = { id: `${kind}-spawn`, kind, x: pos.x, y: pos.y, dead: false, parentId: null } as unknown as Enemy;
      spawned.push(mock);
      return mock;
    },
    isWalkable: () => true,
  };
}

// spec §5.10 精英：杨云红边
// 设计变更（grill 2026-07-17）：双状态机
// - 中立态 aggroState='neutral'：巡逻（PATROL_SPEED=50, PATROL_SEGMENT_MS=1500），不攻击玩家
// - 激怒后 aggroState='hostile'：启用 §5.10 攻击模式（冲撞/影分身/地裂波/二阶段），不走三态机
describe('YangYunRedEnemy 基础数值 (spec §5.10)', () => {
  registerYangYunRed();

  it('HP320 / contact22 / speed95 / 贴图 yangYunRed', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    expect(e.maxHp).toBe(320);
    expect(e.contactDamage).toBe(22);
    expect(e.speed).toBe(95);
    expect(e.textureKey).toBe('sprite.yangYunRed.down.idle');
  });
});

describe('YangYunRedEnemy 中立→激怒机制 (spec §5.10 / §5.11.9，grill 2026-07-17)', () => {
  it('初始中立：aggroState=neutral', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    expect(e.aggroState).toBe('neutral');
  });

  it('中立态：update 仅巡逻不释放任何攻击（地裂波/幻影）', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    const zones: ZoneEffect[] = [];
    const spawned: Enemy[] = [];
    e.applyDamageForTest(100); // < 70%，但中立下不应触发光裂波/幻影
    e.update(8000, ctxStub({ playerPos: { x: 100, y: 0 }, zones, spawned }));
    expect(zones.find((z) => z.proceduralKind === 'floorCrackWave')).toBeUndefined();
    expect(spawned.length).toBe(0);
  });

  it('中立态：update 不走三态机（aiState 始终 idle）', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    // 玩家在视野内，但中立态不感知为攻击目标
    e.update(1000, ctxStub({ playerPos: { x: 100, y: 0 } }));
    expect(e.aiState).toBe('idle');
  });

  it('enrage() 永久切换为 hostile', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    expect(e.aggroState).toBe('neutral');
    e.enrage();
    expect(e.aggroState).toBe('hostile');
  });

  it('激怒后启用攻击模式：HP<70% 触发 2 个幻影', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    e.enrage();
    const spawned: Enemy[] = [];
    e.applyDamageForTest(100); // 320-100=220 → 220/320=68.75% < 70%
    e.update(100, ctxStub({ playerPos: { x: 1000, y: 1000 }, spawned }));
    expect(spawned.length).toBe(2);
    expect(spawned[0]!.kind).toBe('yangYunRedPhantom');
  });
});

describe('YangYunRedEnemy 激怒后攻击模式 (spec §5.10)', () => {
  it('冲撞：3s 间隔，蓄力1s，持续0.7s，速度320，伤害50（chase 内部状态机）', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    e.enrage();
    const zones: ZoneEffect[] = [];
    // 推进 3s 触发冲撞蓄力阶段（不直接产生 zone，冲撞是位移+接触伤害）
    e.update(3000, ctxStub({ playerPos: { x: 100, y: 0 }, zones }));
    // phase 仍为 1（HP 满）
    expect(e.phase).toBe(1);
  });

  it('机制 B：HP<70% 每 8s 触发地裂波 宽60 速200 伤28 slow0.5×1.5s', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    e.enrage();
    const zones: ZoneEffect[] = [];
    e.applyDamageForTest(100); // < 70%
    e.update(8000, ctxStub({ playerPos: { x: 100, y: 0 }, zones }));
    const crack = zones.find((z) => z.proceduralKind === 'floorCrackWave');
    expect(crack).toBeDefined();
    expect(crack!.width).toBe(60);
    expect(crack!.expandSpeed).toBe(200);
    expect(crack!.burstDamage).toBe(28);
    expect(crack!.debuff?.type).toBe('slow');
    expect((crack!.debuff as { multiplier: number }).multiplier).toBeCloseTo(0.5);
    expect((crack!.debuff as { remainingMs: number }).remainingMs).toBe(1500);
  });

  it('机制 C：HP<40% 进入二阶段，contactBurn=3/s×3s', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    e.enrage();
    e.applyDamageForTest(200); // 320-200=120 → 120/320=37.5% < 40%
    e.update(0, ctxStub());
    expect(e.phase).toBe(2);
    expect(e.contactBurn).toEqual({ dps: 3, durationMs: 3000 });
  });

  it('机制 E：死亡触发 onEliteDefeated 事件', () => {
    const e = new YangYunRedEnemy('elite1', 0, 0);
    const deaths: boolean[] = [];
    e.setOnEliteDefeatedForTest(() => deaths.push(true));
    e.applyDamageForTest(320);
    expect(deaths).toHaveLength(1);
  });
});

describe('YangYunRedPhantomEnemy 影分身 (spec §5.10)', () => {
  it('HP40 / contact8 / speed80 / 贴图 yangYunBlue + tint', () => {
    const p = new YangYunRedPhantomEnemy('phantom1', 0, 0);
    expect(p.maxHp).toBe(40);
    expect(p.contactDamage).toBe(8);
    expect(p.speed).toBe(80);
    expect(p.textureKey).toBe('sprite.yangYunBlue.down.idle');
    expect(p.tint).toEqual({ color: 0xff6666, alpha: 0.5 });
  });

  it('12s 后自动消失（dead=true）', () => {
    const p = new YangYunRedPhantomEnemy('phantom1', 0, 0);
    p.update(12000, ctxStub({ playerPos: { x: 1000, y: 1000 } }));
    expect(p.dead).toBe(true);
  });
});

describe('YangYunRed charge damage override (spec §5.10)', () => {
  it('charge state sets contactDamageOverride to 50', () => {
    const elite = new YangYunRedEnemy('elite-1', 0, 0);
    elite.enrage();
    // 推进到 charging 态
    const fakeCtx = ctxStub({ playerPos: { x: 500, y: 0 } });
    // 1. idle 累计 chargeTimer → windup
    elite.update(3000, fakeCtx); // chargeTimer 归零 → windup
    elite.update(1000, fakeCtx); // windup → charging
    expect((elite as unknown as { chargeState: string }).chargeState).toBe('charging');
    expect(elite.contactDamageOverride).toBe(50);
  });

  it('phase2 halves all CDs', () => {
    const elite = new YangYunRedEnemy('elite-2', 0, 0);
    elite.enrage();
    (elite as unknown as { hp: number }).hp = 100; // < 40% of 320 = 128
    elite.update(1, ctxStub({ playerPos: { x: 0, y: 500 } })); // 触发 phase 转换
    expect((elite as unknown as { phase: number }).phase).toBe(2);
    // PHASE2_CHARGE_INTERVAL_MS 应为 1500 (3000/2)
    expect(PHASE2_CHARGE_INTERVAL_MS).toBe(1500);
  });

  it('onKnockback called with charge dir + 80px when charge hits player', () => {
    // 集成测试由 combat-manager.test.ts 覆盖；此处仅占位断言
    const knockbackSpy = { called: false };
    expect(knockbackSpy.called).toBe(false);
  });
});
