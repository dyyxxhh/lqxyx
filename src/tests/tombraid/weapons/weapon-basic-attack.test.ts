import { describe, expect, it, vi } from 'vitest';

import { CombatManager } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';
import {
  Enemy,
  registerEnemyKind,
  type EnemyConstructorOpts,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
} from '../../../tombraid/combat/Enemy';
import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { WeaponCombatAdapter, type CombatPort } from '../../../tombraid/weapons/WeaponCombatAdapter';

const DUMMY_PERCEPTION: EnemyPerceptionParams = {
  visionRange: 350,
  visionHalfAngleDeg: 60,
  noiseSensitivity: 1.0,
  alertToChaseMs: 'instant',
  chaseToSearchMs: 3000,
  searchToAlertMs: 3000,
  alertToIdleMs: 5000,
  patrolKind: 'wander',
  patrolRadius: 80,
  patrolSpeed: 50,
  patrolSegmentMs: 1500,
};

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  readonly perception: EnemyPerceptionParams = DUMMY_PERCEPTION;
  update(_d: number, _c: EnemyUpdateContext): void { /* noop */ }
}
registerEnemyKind('butYuxuanHead', (o) => new DummyEnemy(o));

function makeEnemy(x: number, y: number, hp: number): DummyEnemy {
  const opts: EnemyConstructorOpts = {
    id: `e${x}-${y}-${hp}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24,
  };
  return new DummyEnemy(opts);
}

function makeAdapter(): {
  adapter: WeaponCombatAdapter;
  manager: CombatManager;
  player: PlayerCombat;
  cooldowns: WeaponCooldowns;
  onVisual: ReturnType<typeof vi.fn>;
} {
  const player = new PlayerCombat();
  const manager = new CombatManager(player);
  const cooldowns = new WeaponCooldowns();
  const onVisual = vi.fn();
  const adapter = new WeaponCombatAdapter(manager as unknown as CombatPort, cooldowns, onVisual);
  return { adapter, manager, player, cooldowns, onVisual };
}

describe('WeaponCombatAdapter.equipWeapon (拾取替换)', () => {
  it('替换当前武器并返回旧武器 ID', () => {
    const { adapter, player } = makeAdapter();
    expect(player.weaponId).toBe('weapon.ruler'); // plan 3 占位 = 尺子
    const old = adapter.equipWeapon('weapon.chain');
    expect(old).toBe('weapon.ruler');
    expect(player.weaponId).toBe('weapon.chain');
  });

  it('换武器重置冷却', () => {
    const { adapter, cooldowns } = makeAdapter();
    cooldowns.recordBasicAttackCooldown(0.5, 0); // 锁 2000ms
    adapter.equipWeapon('weapon.bloodScythe');
    expect(cooldowns.canBasicAttack(0)).toBe(true);
    expect(cooldowns.canUltimate(0)).toBe(true);
  });
});

describe('performAttack — meleeFan (断尺/尺子/锁链/万魂幡)', () => {
  it('尺子普攻 15 伤扇形（grill: 仅命中最近 1 敌）', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(85);
  });

  it('尺子普攻不命中身后敌人', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const behind = makeEnemy(-50, 0, 100);
    manager.addEnemy(behind);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(behind.hp).toBe(100);
  });

  it('尺子普攻 CD 内重复调用 no-op', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0); // 15 伤
    adapter.performAttack({ x: 1, y: 0 }, 0); // CD 内 no-op
    expect(e.hp).toBe(85);
    // 时间推进过 CD
    adapter.performAttack({ x: 1, y: 0 }, 700); // CD ≈ 666ms
    expect(e.hp).toBe(70);
  });
});

describe('performAttack — 拳套 10×3 连击 (grill: hitsPerAttack=3, damage=10)', () => {
  it('对单体造成 30 总伤', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(40, 0, 999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(999 - 30); // 10 × 3
  });

  it('连击溢出转向扇形内其他敌人', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    const a = makeEnemy(40, 0, 5); // 1 击致死（10 > 5）
    const b = makeEnemy(45, 0, 999);
    manager.addEnemy(a);
    manager.addEnemy(b);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(a.hp).toBe(0);
    expect(b.hp).toBe(999 - 20); // 剩余 2 击 × 10
  });
});

describe('performAttack — 血镰吸血 10%', () => {
  it('命中后治疗玩家 10% 实际伤害', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.bloodScythe';
    player.takeDamage({ amount: 50, category: 'melee' }); // hp 50
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(999 - 40);
    expect(player.hp).toBe(50 + 4); // 40 * 10% = 4
  });

  it('吸血按实际伤害（敌人 hp 不足时）', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.bloodScythe';
    player.hp = 99;
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 5); // 只能打 5
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(0);
    expect(player.hp).toBe(100); // 5 * 10% = 0.5 → 向下取整不足 1 → heal(1)
  });
});

describe('performAttack — 万魂幡 20% 恐惧触发', () => {
  it('触发时附加 fear debuff', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.soulBanner';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0); // rng 默认 Math.random
    // 可能触发也可能不触发（20%）。断言不抛错 + 敌人受 20 伤
    expect(e.hp).toBe(80);
  });

  it('rng < 0.20 时确定触发恐惧', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.soulBanner';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    // 注入确定性 rng：覆盖 Math.random
    const orig = Math.random;
    Math.random = () => 0.10; // 10% < 20% → 触发
    try {
      adapter.performAttack({ x: 1, y: 0 }, 0);
    } finally {
      Math.random = orig;
    }
    expect(e.hp).toBe(80);
    expect(e.getFleeFrom()).toEqual({ x: 0, y: 0 });
  });

  it('rng >= 0.20 时不触发恐惧', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.soulBanner';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    const orig = Math.random;
    Math.random = () => 0.50; // 50% >= 20% → 不触发
    try {
      adapter.performAttack({ x: 1, y: 0 }, 0);
    } finally {
      Math.random = orig;
    }
    expect(e.hp).toBe(80);
    expect(e.getFleeFrom()).toBeNull();
  });
});

describe('performAttack — rangedPiercing (灵刃/粉笔)', () => {
  it('灵刃普攻生成穿透投射物', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.spiritBlade';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(200, 0, 100);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(manager.playerProjectiles).toHaveLength(1);
    expect(manager.playerProjectiles[0]!.pierceRemaining).toBe(Infinity);
    expect(e.hp).toBe(100); // 投射物尚未飞行到敌人
    manager.update(600); // 400 * 0.6 = 240 → 命中 x=200
    expect(e.hp).toBe(82);
  });

  it('粉笔普攻生成 pierce 1 投射物', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.chalk';
    manager.setPlayerPosition(0, 0);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(manager.playerProjectiles).toHaveLength(1);
    expect(manager.playerProjectiles[0]!.pierceRemaining).toBe(1);
  });
});

describe('performAttack — 视觉事件', () => {
  it('meleeFan 触发 meleeFlash 事件', () => {
    const { adapter, manager, onVisual } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(onVisual).toHaveBeenCalled();
    const event = onVisual.mock.calls[0]![0];
    expect(event.kind).toBe('meleeFlash');
  });

  it('rangedPiercing 触发 projectileSpawned 事件', () => {
    const { adapter, manager, player, onVisual } = makeAdapter();
    player.weaponId = 'weapon.spiritBlade';
    manager.setPlayerPosition(0, 0);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(onVisual).toHaveBeenCalled();
    const event = onVisual.mock.calls[0]![0];
    expect(event.kind).toBe('projectileSpawned');
  });
});

describe('performAttack — 未知 weaponId no-op', () => {
  it('空手/未知 weaponId 不抛错不造成伤害', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.unarmed';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 100);
    manager.addEnemy(e);
    expect(() => adapter.performAttack({ x: 1, y: 0 }, 0)).not.toThrow();
    expect(e.hp).toBe(100);
  });
});
