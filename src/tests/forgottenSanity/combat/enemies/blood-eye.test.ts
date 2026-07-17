import { describe, expect, it } from 'vitest';

import { ButYuxuanHeadBloodEyeEnemy, registerButYuxuanHeadBloodEye } from '../../../../forgottenSanity/combat/enemies/ButYuxuanHeadBloodEye';
import type {
  EnemyUpdateContext,
  PlayerNoiseEvent,
  Projectile,
} from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  playerNoise?: PlayerNoiseEvent | null;
  proj?: Projectile[];
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  const proj = opts.proj ?? [];
  return {
    playerPosition: opts.playerPos ?? { x: 0, y: 100 },
    timeMs: 0,
    rng: createCombatRng(1),
    playerNoise: opts.playerNoise === undefined ? null : opts.playerNoise,
    spawnProjectile: (p) => { proj.push(p); },
    spawnZone: () => undefined,
    spawnEnemy: () => null,
    isWalkable: () => true,
  };
}

// 血瞳头颅 perception（spec §5.11.6 ⑧）：
// 视野 380 / 不 360° / 噪声 1.2 / 即转 / 2s / 2s / 4s / 游走
describe('ButYuxuanHeadBloodEyeEnemy 基础数值 + perception (spec §5.1⑧ / §5.11.6 ⑧)', () => {
  registerButYuxuanHeadBloodEye();

  it('HP70 / contact12 / speed75 / 贴图+血瞳叠加', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    expect(e.maxHp).toBe(70);
    expect(e.contactDamage).toBe(12);
    expect(e.speed).toBe(75);
    expect(e.textureKey).toBe('sprite.danYuxuan.headPart');
    expect(e.overlay).toBe('bloodEye');
  });

  it('perception 字段匹配 spec §5.11.6 ⑧', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    expect(e.perception.visionRange).toBe(380);
    expect(e.perception.visionHalfAngleDeg).toBe(60);
    expect(e.perception.noiseSensitivity).toBeCloseTo(1.2);
    expect(e.perception.alertToChaseMs).toBe('instant');
    expect(e.perception.chaseToSearchMs).toBe(2000);
    expect(e.perception.searchToAlertMs).toBe(2000);
    expect(e.perception.alertToIdleMs).toBe(4000);
    expect(e.perception.patrolKind).toBe('wander');
    expect(e.perception.patrolRadius).toBe(80);
    expect(e.perception.patrolSpeed).toBe(50);
    expect(e.perception.patrolSegmentMs).toBe(1500);
    expect(e.perception.static360Vision).toBeFalsy(); // 血瞳头颅不 360°
  });
});

describe('ButYuxuanHeadBloodEyeEnemy 120° 锥视野规则 (spec §5.11.2)', () => {
  it('idle → chase 当玩家在锥内（朝下）', () => {
    // 敌人 (0,0) 默认朝下 (0,1)；玩家 (0,300) 在锥内，dist 300 ≤ 380
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 300 } }));
    expect(e.aiState).toBe('chase'); // 即转
  });

  it('idle 保持 idle 当玩家在锥外且无噪声', () => {
    // 玩家 (200,0) 在 90° 方向，超出 60° 半角
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('idle');
  });

  it('idle → chase 当噪声半径 ×1.2 ≥ 距离（即使锥外）', () => {
    // 玩家 (200,0) dist 200 在锥外；噪声 200 × 1.2 = 240 ≥ 200 → 命中
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({
      playerPos: { x: 200, y: 0 },
      playerNoise: { x: 200, y: 0, radius: 200 },
    }));
    expect(e.aiState).toBe('chase');
  });
});

describe('ButYuxuanHeadBloodEyeEnemy 三态机 (spec §5.11，grill 2026-07-17 重写)', () => {
  it('chase → search 当脱离视野 2s', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 300 } })); // chase
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('search');
  });

  it('search → alert 当 2s 无新刺激', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 300 } })); // chase
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
    expect(e.aiState).toBe('alert');
  });

  it('alert → idle 当 4s 无新刺激', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    e.update(16, ctxStub({ playerPos: { x: 0, y: 300 } })); // chase
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // search
    e.update(2000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // alert
    e.update(4000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null })); // idle
    expect(e.aiState).toBe('idle');
  });
});

describe('ButYuxuanHeadBloodEyeEnemy 攻击 (spec §5.1⑧，仅 chase 态)', () => {
  it('chase 态 2.2s 间隔触发 3 发追踪弹 弹速140 伤18 强追踪', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    const proj: Projectile[] = [];
    // 玩家在锥内，update(2200) → idle→chase（instant）+ attackTimer 耗尽 → 触发
    e.update(2200, ctxStub({ playerPos: { x: 0, y: 300 }, proj }));
    expect(proj).toHaveLength(3);
    expect(proj[0]!.speed).toBe(140);
    expect(proj[0]!.damage).toBe(18);
    expect(proj[0]!.homingTarget).toBe('player');
    expect(proj[0]!.homingStrength).toBeGreaterThan(Math.PI); // 强追踪
    expect(proj[0]!.proceduralKind).toBe('bloodEyeOrb');
  });

  it('idle 态不攻击', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    const proj: Projectile[] = [];
    // 玩家在锥外，保持 idle
    e.update(2200, ctxStub({ playerPos: { x: 200, y: 0 }, playerNoise: null, proj }));
    expect(proj).toHaveLength(0);
  });
});

describe('ButYuxuanHeadBloodEyeEnemy 巡逻 (spec §5.11.4 游走类)', () => {
  it('idle 态在出生点周边 80px 内游走', () => {
    const e = new ButYuxuanHeadBloodEyeEnemy('e1', 100, 100);
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
