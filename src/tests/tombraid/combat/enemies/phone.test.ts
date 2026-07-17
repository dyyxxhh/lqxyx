import { describe, expect, it } from 'vitest';

import { PhoneEnemy, registerPhone } from '../../../../tombraid/combat/enemies/Phone';
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

// 电话 perception（spec §5.11.6 ④）：
// 视野 280 / 静止 360° (196px) / 噪声 1.3 / 2s / 2s / 2s / 4s / 静物
describe('PhoneEnemy 基础数值 + perception (spec §5.1④ / §5.11.6 ④)', () => {
  registerPhone();

  it('HP70 / contact10 / speed55 / textureKey', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    expect(e.maxHp).toBe(70);
    expect(e.contactDamage).toBe(10);
    expect(e.speed).toBe(55);
    expect(e.textureKey).toBe('sprite.phone');
  });

  it('perception 字段匹配 spec §5.11.6 ④', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    expect(e.perception.visionRange).toBe(280);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(1.3);
    expect(e.perception.alertToChaseMs).toBe(2000);
    expect(e.perception.chaseToSearchMs).toBe(2000);
    expect(e.perception.searchToAlertMs).toBe(2000);
    expect(e.perception.alertToIdleMs).toBe(4000);
    expect(e.perception.patrolKind).toBe('static');
    expect(e.perception.static360Vision).toBe(true);
  });
});

describe('PhoneEnemy 静止 360° 视野规则 (spec §5.11.2)', () => {
  it('idle 态玩家在锥外但 360° 内 → 感知 → alert', () => {
    // 敌人 (0,0) 朝下 (0,1)；玩家 (150,0) 在 90° 方向（锥外 60° 半角）
    // 静止 360° 半径 = 280 × 0.7 = 196；dist 150 ≤ 196 → 命中
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('idle 态玩家在 360° 外 → 保持 idle', () => {
    // dist 250 > 196 → 不命中
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 250, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });
});

describe('PhoneEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('alert → chase 当 2000ms 持续感知', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // alert
    e.update(2000, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    expect(e.aiState).toBe('chase');
  });

  it('chase → search 当脱离视野 2s', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 2s 无新刺激', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 4s 无新刺激', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null }));
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('PhoneEnemy 静物巡逻 (spec §5.11.4 静物类)', () => {
  it('idle 态不移动', () => {
    const e = new PhoneEnemy('p1', 100, 100);
    const farCtx = ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null });
    for (let i = 0; i < 10; i++) {
      e.update(1500, farCtx);
    }
    expect(e.x).toBe(100);
    expect(e.y).toBe(100);
  });
});

describe('PhoneEnemy 攻击 (spec §5.1④，仅 chase 态)', () => {
  it('chase 态 4.5s 间隔触发红圈爆炸+振铃区', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(16, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // alert
    e.update(2000, ctxStub({ playerPos: { x: 150, y: 0 }, playerNoise: null })); // chase
    e.update(4500, ctxStub({ playerPos: { x: 150, y: 0 }, zones }));
    // 红圈 zone（延迟爆炸）
    const redCircle = zones.find((z) => z.proceduralKind === 'phoneRedCircle');
    expect(redCircle).toBeDefined();
    expect(redCircle!.shape).toBe('circle');
    expect(redCircle!.radius).toBe(90);
    expect(redCircle!.windupMs).toBe(1200);
    expect(redCircle!.burstDamage).toBe(30);
    // 振铃区 zone（2s DoT，总 10 伤 = 5 dps）
    const ringing = zones.find((z) => z.proceduralKind === 'phoneRinging');
    expect(ringing).toBeDefined();
    expect(ringing!.remainingMs).toBe(2000);
    expect(ringing!.damagePerSecond).toBe(5);
  });

  it('idle 态不攻击', () => {
    const e = new PhoneEnemy('p1', 0, 0);
    const zones: ZoneEffect[] = [];
    e.update(4500, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null, zones }));
    expect(zones).toHaveLength(0);
  });
});
