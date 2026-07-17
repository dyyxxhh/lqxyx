import { describe, expect, it } from 'vitest';

import { ChalkDustEnemy, registerChalkDust } from '../../../../tombraid/combat/enemies/ChalkDust';
import type {
  EnemyUpdateContext,
  PlayerNoiseEvent,
} from '../../../../tombraid/combat/Enemy';
import { createCombatRng } from '../../../../tombraid/combat/Enemy';
import type { DamageInstance } from '../../../../tombraid/combat/DamageType';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  return {
    playerPosition: opts.playerPos ?? { x: 0, y: 100 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: () => undefined,
    spawnZone: () => undefined,
    spawnEnemy: () => null,
    isWalkable: () => true,
  };
}

// 粉笔尘云 perception（spec §5.11.6 ⑦）：
// 视野 250 / 静止 360° (175px) / 噪声 1.0 / 即转 / 5s / 5s / 7s / 静物
describe('ChalkDustEnemy 基础数值 + perception (spec §5.1⑦ / §5.11.6 ⑦)', () => {
  registerChalkDust();

  it('HP150 / contact5 / speed30 / 程序绘制', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    expect(e.maxHp).toBe(150);
    expect(e.contactDamage).toBe(5);
    expect(e.speed).toBe(30);
    expect(e.textureKey).toBeNull();
    expect(e.proceduralKind).toBe('chalkDust');
  });

  it('perception 字段匹配 spec §5.11.6 ⑦', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    expect(e.perception.visionRange).toBe(250);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(1.0);
    expect(e.perception.alertToChaseMs).toBe('instant');
    expect(e.perception.chaseToSearchMs).toBe(5000);
    expect(e.perception.searchToAlertMs).toBe(5000);
    expect(e.perception.alertToIdleMs).toBe(7000);
    expect(e.perception.patrolKind).toBe('static');
    expect(e.perception.static360Vision).toBe(true);
  });
});

describe('ChalkDustEnemy 伤害倍率 (spec §5.1⑦)', () => {
  it('melee 伤害减半', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    const dmg: DamageInstance = { amount: 20, category: 'melee' };
    e.applyDamage(dmg);
    expect(e.hp).toBe(150 - 10);
  });

  it('aoe 伤害 1.5 倍', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    const dmg: DamageInstance = { amount: 20, category: 'aoe' };
    e.applyDamage(dmg);
    expect(e.hp).toBe(150 - 30);
  });

  it('dot 伤害不变', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    const dmg: DamageInstance = { amount: 20, category: 'dot' };
    e.applyDamage(dmg);
    expect(e.hp).toBe(150 - 20);
  });
});

describe('ChalkDustEnemy 静止 360° 视野规则 (spec §5.11.2)', () => {
  // 粉笔尘云静物类，idle/alert 态静止 → 360°，半径 = 250 × 0.7 = 175
  it('idle 态玩家在 360° 内（175px 内）锥外 → 即转 chase', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('chase'); // 即转
  });

  it('idle 态玩家在 360° 外 → 保持 idle', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 250, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });
});

describe('ChalkDustEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('chase → search 当脱离视野 5s', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 5s 无新刺激', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 7s 无新刺激', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(7000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('ChalkDustEnemy 静物巡逻 (spec §5.11.4 静物类)', () => {
  it('idle 态不移动', () => {
    const e = new ChalkDustEnemy('e1', 100, 100);
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 10; i++) {
      e.update(1500, farCtx);
    }
    expect(e.x).toBe(100);
    expect(e.y).toBe(100);
  });
});

describe('ChalkDustEnemy 攻击 (spec §5.1⑦ 持续接触)', () => {
  it('chase 态缓慢漂向玩家（接触 DoT 由 CombatManager 处理）', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(1000, ctxStub({ playerPos: { x: 150, y: 0 } }));
    expect(e.x).toBeGreaterThan(0);
  });

  it('idle 态不移动', () => {
    const e = new ChalkDustEnemy('e1', 0, 0);
    e.update(1000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });
});
