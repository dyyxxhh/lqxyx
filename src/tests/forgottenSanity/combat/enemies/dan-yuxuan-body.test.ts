import { describe, expect, it } from 'vitest';

import { DanYuxuanBodyEnemy, registerDanYuxuanBody } from '../../../../forgottenSanity/combat/enemies/DanYuxuanBody';
import type { Enemy, EnemyUpdateContext } from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';

interface CtxOpts {
  playerPos?: { x: number; y: number };
  timeMs?: number;
  onSpawn?: (e: Enemy) => void;
}

function ctxStub(opts: CtxOpts = {}): EnemyUpdateContext {
  return {
    playerPosition: opts.playerPos ?? { x: 5000, y: 5000 },
    timeMs: opts.timeMs ?? 0,
    rng: createCombatRng(1),
    spawnProjectile: () => undefined,
    spawnZone: () => undefined,
    spawnEnemy: (kind, pos, parentId) => {
      const mock = {
        id: `bloodEye-${kind}-${Math.random()}`,
        kind,
        x: pos.x,
        y: pos.y,
        dead: false,
        parentId: parentId ?? null,
      } as unknown as Enemy;
      opts.onSpawn?.(mock);
      return mock;
    },
    isWalkable: () => true,
  };
}

// spec §5.9 召唤核心：HP1/contact0/speed0/贴图 lyingBloody
// 机制 A：30s 召唤血瞳头颅，玩家 200px 外，存活血瞳≥3 不召唤
// 机制 B：身体死亡 → 所有绑定头颅死亡
// 机制 C：头颅死亡 20s 后复活（身体存活）
// 机制 D：每杀一个头颅 30% 标记身体位置（CombatManager 处理）
// 召唤计时器与降级交互（grill 2026-07-17）：始终 1Hz 真实时间推进，不受 §5.11.7 4Hz 降级影响
describe('DanYuxuanBodyEnemy 基础数值 (spec §5.9 召唤核心)', () => {
  registerDanYuxuanBody();

  it('HP1 / contact0 / speed0 / 贴图 lyingBloody', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    expect(e.maxHp).toBe(1);
    expect(e.contactDamage).toBe(0);
    expect(e.speed).toBe(0);
    expect(e.textureKey).toBe('sprite.danYuxuan.lyingBloody');
  });

  it('不走三态机：aiState 始终 idle（非攻击性）', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    expect(e.aiState).toBe('idle');
    // update 后仍 idle
    e.update(30000, ctxStub());
    expect(e.aiState).toBe('idle');
  });
});

describe('DanYuxuanBodyEnemy 机制 A：30s 召唤血瞳头颅 (spec §5.9)', () => {
  it('30s 后召唤 1 个 butYuxuanHeadBloodEye，距玩家 ≥ 200px', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const spawned: Enemy[] = [];
    e.update(30000, ctxStub({ playerPos: { x: 5000, y: 5000 }, onSpawn: (m) => spawned.push(m) }));
    expect(spawned.length).toBe(1);
    expect(spawned[0]!.kind).toBe('butYuxuanHeadBloodEye');
    const dx = spawned[0]!.x - 5000;
    const dy = spawned[0]!.y - 5000;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(200);
  });

  it('存活血瞳 ≥3 时不召唤', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    // 模拟已有 3 个存活绑定头颅
    const heads = (e as unknown as { boundHeads: { head: Enemy; deadAtMs: number | null }[] }).boundHeads;
    for (let i = 0; i < 3; i++) {
      const head = { id: `h${i}`, dead: false, x: 0, y: 0 } as unknown as Enemy;
      heads.push({ head, deadAtMs: null });
    }
    const spawned: Enemy[] = [];
    e.update(30000, ctxStub({ playerPos: { x: 5000, y: 5000 }, onSpawn: (m) => spawned.push(m) }));
    expect(spawned.length).toBe(0);
  });

  it('召唤的头颅 parentId 设置为身体 id（机制 D 链路）', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const spawned: Enemy[] = [];
    e.update(30000, ctxStub({ playerPos: { x: 5000, y: 5000 }, onSpawn: (m) => spawned.push(m) }));
    expect(spawned[0]!.parentId).toBe('body1');
  });
});

describe('DanYuxuanBodyEnemy 机制 B：身体死亡 → 所有绑定头颅死亡 (spec §5.9)', () => {
  it('onBodyDied 清场所有绑定头颅', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const head1 = { id: 'h1', dead: false, x: 0, y: 0 } as unknown as Enemy;
    const head2 = { id: 'h2', dead: false, x: 0, y: 0 } as unknown as Enemy;
    const heads = (e as unknown as { boundHeads: { head: Enemy; deadAtMs: number | null }[] }).boundHeads;
    heads.push({ head: head1, deadAtMs: null }, { head: head2, deadAtMs: null });
    e.onBodyDied();
    expect(head1.dead).toBe(true);
    expect(head2.dead).toBe(true);
  });
});

describe('DanYuxuanBodyEnemy 机制 C：头颅死亡 20s 复活 (spec §5.9)', () => {
  it('头颅死亡 20s 后复活（身体存活，1Hz 真实时间推进）', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const head = { id: 'h1', dead: false, x: 100, y: 100, hp: 70, maxHp: 70 } as unknown as Enemy;
    const heads = (e as unknown as { boundHeads: { head: Enemy; deadAtMs: number | null; deathX: number; deathY: number }[] }).boundHeads;
    heads.push({ head, deadAtMs: null, deathX: 100, deathY: 100 });
    // CombatManager 在头颅死亡时设置 dead=true 后调用 onBoundHeadDied
    (head as unknown as { dead: boolean }).dead = true;
    (head as unknown as { hp: number }).hp = 0;
    e.onBoundHeadDied(head); // deadAtMs = 0（占位，死亡时刻 timeMs=0）
    // 时间推进 21s → timeMs 21000 - deadAtMs 0 = 21000 ≥ 20000 → 复活
    e.update(21000, ctxStub({ timeMs: 21000 }));
    expect(head.dead).toBe(false);
    expect((head as unknown as { hp: number }).hp).toBe(70);
  });

  it('头颅死亡 <20s 不复活', () => {
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const head = { id: 'h1', dead: false, x: 100, y: 100, hp: 70, maxHp: 70 } as unknown as Enemy;
    const heads = (e as unknown as { boundHeads: { head: Enemy; deadAtMs: number | null; deathX: number; deathY: number }[] }).boundHeads;
    heads.push({ head, deadAtMs: null, deathX: 100, deathY: 100 });
    (head as unknown as { dead: boolean }).dead = true;
    (head as unknown as { hp: number }).hp = 0;
    e.onBoundHeadDied(head); // deadAtMs = 0
    // timeMs 19000 - deadAtMs 0 = 19000 < 20000 → 不复活
    e.update(19000, ctxStub({ timeMs: 19000 }));
    expect(head.dead).toBe(true);
  });
});

describe('DanYuxuanBodyEnemy 召唤计时器不受降级影响 (spec §5.9 grill 补充)', () => {
  it('update 间隔不影响召唤总周期：30s 真实时间后召唤', () => {
    // 模拟远房 4Hz 降级：每 250ms 一次 update，共 120 次 = 30s
    const e = new DanYuxuanBodyEnemy('body1', 0, 0);
    const spawned: Enemy[] = [];
    let timeMs = 0;
    for (let i = 0; i < 120; i++) {
      timeMs += 250;
      e.update(250, ctxStub({ playerPos: { x: 5000, y: 5000 }, timeMs, onSpawn: (m) => spawned.push(m) }));
    }
    expect(spawned.length).toBe(1);
  });
});
