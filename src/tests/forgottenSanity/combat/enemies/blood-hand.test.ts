import { describe, expect, it } from 'vitest';

import { BloodHandEnemy, registerBloodHand } from '../../../../forgottenSanity/combat/enemies/BloodHand';
import type {
  EnemyUpdateContext,
  PlayerNoiseEvent,
  ZoneEffect,
} from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  zones?: ZoneEffect[];
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  const zones = opts.zones ?? [];
  return {
    playerPosition: opts.playerPos ?? { x: 100, y: 0 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: () => undefined,
    spawnZone: (z) => { zones.push(z); },
    spawnEnemy: () => null,
    isWalkable: () => true,
  };
}

// 血手 perception（spec §5.11.6 ⑤）：
// 视野 150 / 静止 360° (105px) / 噪声 1.0 / 1s / 4s / 4s / 6s / 静物
describe('BloodHandEnemy 基础数值 + perception (spec §5.1⑤ / §5.11.6 ⑤)', () => {
  registerBloodHand();

  it('HP70 / contact16 / speed0 / 程序绘制', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    expect(e.maxHp).toBe(70);
    expect(e.contactDamage).toBe(16);
    expect(e.speed).toBe(0);
    expect(e.textureKey).toBeNull();
    expect(e.proceduralKind).toBe('bloodHand');
  });

  it('perception 字段匹配 spec §5.11.6 ⑤', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    expect(e.perception.visionRange).toBe(150);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(1.0);
    expect(e.perception.alertToChaseMs).toBe(1000);
    expect(e.perception.chaseToSearchMs).toBe(4000);
    expect(e.perception.searchToAlertMs).toBe(4000);
    expect(e.perception.alertToIdleMs).toBe(6000);
    expect(e.perception.patrolKind).toBe('static');
    expect(e.perception.static360Vision).toBe(true);
  });
});

describe('BloodHandEnemy 静止 360° 视野规则 (spec §5.11.2)', () => {
  // 血手 speed=0 永远静止 → 永远 360°，半径 = 150 × 0.7 = 105
  it('idle 态玩家在 360° 内（105px 内）→ 感知 → alert', () => {
    // 玩家 (90,0)，敌人朝下 (0,1)，玩家在 90° 方向（锥外 60° 半角），但 360° 内
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('idle 态玩家在 360° 外 → 保持 idle', () => {
    // dist 200 > 105 → 不命中
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('idle 态玩家在锥外但噪声半径 ×1.0 ≥ 距离 → 感知', () => {
    // 玩家 (150,0) dist 150 > 105（360°外）；噪声 200 × 1.0 ≥ 150 → 命中
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({
      playerPos: { x: 150, y: 0 },
      playerNoise: { x: 150, y: 0, radius: 200 },
    }));
    expect(e.aiState).toBe('alert');
  });
});

describe('BloodHandEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('alert → chase 当持续感知 1s', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // alert
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // chase
    expect(e.aiState).toBe('chase');
  });

  it('chase → search 当脱离视野 4s', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // chase
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 4s 无新刺激', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // chase
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 6s 无新刺激', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // chase
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(6000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('BloodHandEnemy 静物巡逻 (spec §5.11.4 静物类)', () => {
  it('idle 态不移动（speed=0）', () => {
    const e = new BloodHandEnemy('e1', 100, 100);
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 10; i++) {
      e.update(1500, farCtx);
    }
    expect(e.x).toBe(100);
    expect(e.y).toBe(100);
  });
});

describe('BloodHandEnemy 攻击 (spec §5.1⑤，仅 chase 态)', () => {
  it('chase 态 5s 间隔触发抓取 zone windup0.8s burst25 + root1s r100', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    const zones: ZoneEffect[] = [];
    // 进入 chase
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('chase');
    // 5s 后触发抓取
    e.update(5000, ctxStub({ playerPos: { x: 90, y: 0 }, zones }));
    const grab = zones.find((z) => z.proceduralKind === 'bloodHand');
    expect(grab).toBeDefined();
    expect(grab!.shape).toBe('circle');
    expect(grab!.radius).toBe(100);
    expect(grab!.windupMs).toBe(800);
    expect(grab!.burstDamage).toBe(25);
    expect(grab!.debuff?.type).toBe('root');
    expect((grab!.debuff as { remainingMs: number }).remainingMs).toBe(1000);
  });

  it('攻击后换位（位置改变）', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    const startX = e.x;
    const startY = e.y;
    // 进入 chase 后触发攻击 + 换位
    e.update(16, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null }));
    e.update(1000, ctxStub({ playerPos: { x: 90, y: 0 }, playerNoise: null })); // chase
    e.update(5000, ctxStub({ playerPos: { x: 90, y: 0 } }));
    const moved = e.x !== startX || e.y !== startY;
    expect(moved).toBe(true);
  });

  it('idle 态不攻击', () => {
    const e = new BloodHandEnemy('e1', 0, 0);
    const zones: ZoneEffect[] = [];
    // 玩家在 360° 外，保持 idle
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null, zones }));
    expect(zones).toHaveLength(0);
  });
});
