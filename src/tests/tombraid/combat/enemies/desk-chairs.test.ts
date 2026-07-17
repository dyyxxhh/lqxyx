import { describe, expect, it } from 'vitest';

import { DeskChairsEnemy, registerDeskChairs } from '../../../../tombraid/combat/enemies/DeskChairs';
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

// 桌椅 perception（spec §5.11.6 ③）：
// 视野 180 / 静止 360° (126px) / 噪声 0.7 / 2s / 4s / 4s / 6s / 静物
describe('DeskChairsEnemy 基础数值 + perception (spec §5.1③ / §5.11.6 ③)', () => {
  registerDeskChairs();

  it('HP120 / contact15 / speed40 / textureKey', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    expect(e.maxHp).toBe(120);
    expect(e.contactDamage).toBe(15);
    expect(e.speed).toBe(40);
    expect(e.textureKey).toBe('sprite.deskChairs');
  });

  it('perception 字段匹配 spec §5.11.6 ③', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    expect(e.perception.visionRange).toBe(180);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(0.7);
    expect(e.perception.alertToChaseMs).toBe(2000);
    expect(e.perception.chaseToSearchMs).toBe(4000);
    expect(e.perception.searchToAlertMs).toBe(4000);
    expect(e.perception.alertToIdleMs).toBe(6000);
    expect(e.perception.patrolKind).toBe('static');
    expect(e.perception.static360Vision).toBe(true);
  });
});

describe('DeskChairsEnemy 静止 360° 视野规则 (spec §5.11.2)', () => {
  it('idle 态玩家在锥外但 360° 内 → 感知 → alert', () => {
    // 敌人 (0,0) 朝下 (0,1)；玩家 (100,0) 在 90° 方向（锥外 60° 半角）
    // 静止 360° 半径 = 180 × 0.7 = 126；dist 100 ≤ 126 → 命中
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('idle 态玩家在 360° 外 → 保持 idle', () => {
    // dist 200 > 126 → 不命中
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('chase 态恢复 120° 锥（玩家在锥外但 360° 内不感知）', () => {
    // 先进入 chase
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // alert
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // chase
    expect(e.aiState).toBe('chase');
    // 玩家移到正后方（锥外），dist 在 126 内但锥外
    // 敌人此时朝向 (1,0)（追击方向），玩家在 (0, 50) 是 90° 方向
    e.setFacing(1, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 50 }, playerNoise: null }));
    // chase 态 cone vision，玩家在锥外 → lostPlayerTimerMs 累加但不立刻转 search
    expect(e.aiState).toBe('chase');
  });
});

describe('DeskChairsEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('alert → chase 当 2000ms 持续感知', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // idle→alert
    expect(e.aiState).toBe('alert');
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // alert→chase
    expect(e.aiState).toBe('chase');
  });

  it('chase → search 当脱离视野 4s', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // alert
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null })); // chase
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 4s 无新刺激', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 6s 无新刺激', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(6000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('DeskChairsEnemy 静物巡逻 (spec §5.11.4 静物类)', () => {
  it('idle 态不移动（定点待机）', () => {
    const e = new DeskChairsEnemy('d1', 100, 100);
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 10; i++) {
      e.update(1500, farCtx);
    }
    expect(e.x).toBe(100);
    expect(e.y).toBe(100);
  });
});

describe('DeskChairsEnemy 攻击 (spec §5.1③，仅 chase 态)', () => {
  it('chase 态 6s 间隔触发翻桌（6木屑+椅子障碍+无敌1.2s）', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    const proj: Projectile[] = [];
    const zones: ZoneEffect[] = [];
    // 进入 chase: idle→alert (16ms) → chase (2000ms)
    e.update(16, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 100, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('chase');
    // 攻击: 6s 间隔
    e.update(6000, ctxStub({ playerPos: { x: 100, y: 0 }, proj, zones }));
    expect(proj).toHaveLength(6);
    expect(proj[0]!.damage).toBe(10);
    expect(proj[0]!.proceduralKind).toBe('woodChip');
    expect(e.invulnMs).toBe(1200);
    // 椅子障碍 zone
    const chairZone = zones.find((z) => z.proceduralKind === 'chairObstacle');
    expect(chairZone).toBeDefined();
    expect(chairZone!.remainingMs).toBe(8000);
  });

  it('idle 态不攻击', () => {
    const e = new DeskChairsEnemy('d1', 0, 0);
    const proj: Projectile[] = [];
    const zones: ZoneEffect[] = [];
    e.update(6000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null, proj, zones }));
    expect(proj).toHaveLength(0);
  });
});
