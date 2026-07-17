import { describe, expect, it } from 'vitest';

import { FloatingEyeEnemy, registerFloatingEye } from '../../../../tombraid/combat/enemies/FloatingEye';
import type {
  EnemyUpdateContext,
  PlayerNoiseEvent,
  ZoneEffect,
} from '../../../../tombraid/combat/Enemy';
import { createCombatRng } from '../../../../tombraid/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  zones?: ZoneEffect[];
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  const zones = opts.zones ?? [];
  return {
    playerPosition: opts.playerPos ?? { x: 0, y: 100 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: () => undefined,
    spawnZone: (z) => { zones.push(z); },
    spawnEnemy: () => null,
    isWalkable: () => true,
  };
}

// 漂浮眼球 perception（spec §5.11.6 ⑥）：
// 视野 400 / 静止 360° (280px) / 噪声 0.8 / 即转 / 3s / 3s / 5s / 游走
describe('FloatingEyeEnemy 基础数值 + perception (spec §5.1⑥ / §5.11.6 ⑥)', () => {
  registerFloatingEye();

  it('HP35 / contact6 / speed80 / 程序绘制', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    expect(e.maxHp).toBe(35);
    expect(e.contactDamage).toBe(6);
    expect(e.speed).toBe(80);
    expect(e.textureKey).toBeNull();
    expect(e.proceduralKind).toBe('floatingEye');
  });

  it('perception 字段匹配 spec §5.11.6 ⑥', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    expect(e.perception.visionRange).toBe(400);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(0.8);
    expect(e.perception.alertToChaseMs).toBe('instant');
    expect(e.perception.chaseToSearchMs).toBe(3000);
    expect(e.perception.searchToAlertMs).toBe(3000);
    expect(e.perception.alertToIdleMs).toBe(5000);
    expect(e.perception.patrolKind).toBe('wander');
    expect(e.perception.patrolRadius).toBe(80);
    expect(e.perception.patrolSpeed).toBe(50);
    expect(e.perception.patrolSegmentMs).toBe(1500);
    expect(e.perception.static360Vision).toBe(true);
  });
});

describe('FloatingEyeEnemy 静止 360° 视野规则 (spec §5.11.2)', () => {
  // 漂浮眼球游走类，idle 态静止 → 360°，半径 = 400 × 0.7 = 280
  it('idle 态玩家在 360° 内（280px 内）锥外 → 即转 chase', () => {
    // 敌人 (0,0) 朝下 (0,1)；玩家 (200,0) 在 90° 方向（锥外 60° 半角），但 360° 内 dist 200 ≤ 280
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('chase'); // 即转怪种
  });

  it('idle 态玩家在 360° 外 → 保持 idle', () => {
    // dist 350 > 280 → 不命中
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 350, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('idle 态玩家在锥外但噪声半径 ×0.8 ≥ 距离 → 感知', () => {
    // 玩家 (300,0) dist 300 > 280（360°外）；噪声 400 × 0.8 = 320 ≥ 300 → 命中
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({
      playerPos: { x: 300, y: 0 },
      playerNoise: { x: 300, y: 0, radius: 400 },
    }));
    expect(e.aiState).toBe('chase'); // 即转
  });
});

describe('FloatingEyeEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('chase → search 当脱离视野 3s', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 3s 无新刺激', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 5s 无新刺激', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null })); // chase
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(3000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(5000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('FloatingEyeEnemy 巡逻 (spec §5.11.4 游走类)', () => {
  it('idle 态在出生点周边 80px 内游走', () => {
    const e = new FloatingEyeEnemy('e1', 100, 100);
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

describe('FloatingEyeEnemy 攻击 (spec §5.1⑥，仅 chase 态)', () => {
  it('chase 态 4s 间隔触发激光 rect 宽20 windup1s burst20 + burn2/s×2s', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null })); // chase
    e.update(4000, ctxStub({ playerPos: { x: 200, y: 0 }, zones }));
    const laser = zones.find((z) => z.proceduralKind === 'laserBeam');
    expect(laser).toBeDefined();
    expect(laser!.shape).toBe('rect');
    expect(laser!.width).toBe(20);
    expect(laser!.windupMs).toBe(1000);
    expect(laser!.burstDamage).toBe(20);
    expect(laser!.debuff?.type).toBe('burn');
    expect((laser!.debuff as { dps: number }).dps).toBe(2);
    expect((laser!.debuff as { remainingMs: number }).remainingMs).toBe(2000);
  });

  it('idle 态不攻击', () => {
    const e = new FloatingEyeEnemy('e1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null, zones }));
    expect(zones).toHaveLength(0);
  });
});
