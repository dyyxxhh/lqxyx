import { describe, expect, it } from 'vitest';

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
} {
  const player = new PlayerCombat();
  const manager = new CombatManager(player);
  const cooldowns = new WeaponCooldowns();
  const adapter = new WeaponCombatAdapter(manager as unknown as CombatPort, cooldowns, null);
  return { adapter, manager, player, cooldowns };
}

describe('Plan 4 集成冒烟 — 默认武器与 plan 3 平滑升级', () => {
  it('PlayerCombat 默认 weaponId === weapon.ruler（plan 3 PLACEHOLDER_WEAPON_ID）', () => {
    const { player } = makeAdapter();
    expect(player.weaponId).toBe('weapon.ruler');
  });
});

describe('Plan 4 集成冒烟 — 拾取替换链路', () => {
  it('equipWeapon 返回旧武器 ID 并切换到新武器', () => {
    const { adapter, player } = makeAdapter();
    expect(player.weaponId).toBe('weapon.ruler');
    const old = adapter.equipWeapon('weapon.bloodScythe');
    expect(old).toBe('weapon.ruler');
    expect(player.weaponId).toBe('weapon.bloodScythe');
  });

  it('equipWeapon 重置普攻/大招 CD（onWeaponSwap）', () => {
    const { adapter, cooldowns } = makeAdapter();
    // 先消耗大招 CD（尺子 20s）
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(true);
    expect(cooldowns.canUltimate(1000)).toBe(false);
    // 拾取血镰 → CD 重置
    adapter.equipWeapon('weapon.bloodScythe');
    expect(cooldowns.canUltimate(0)).toBe(true);
    expect(cooldowns.canBasicAttack(0)).toBe(true);
  });
});

describe('Plan 4 集成冒烟 — 普攻伤害链路', () => {
  it('尺子普攻打中扇形内敌人并扣血 15', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(999 - 15);
  });

  it('普攻 CD 门控：CD 内第二次普攻 no-op', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0); // 15 伤
    adapter.performAttack({ x: 1, y: 0 }, 0); // CD 内 no-op（尺子 1.5/s → CD≈666ms）
    expect(e.hp).toBe(999 - 15);
    // CD 解除后再次普攻
    adapter.performAttack({ x: 1, y: 0 }, 700);
    expect(e.hp).toBe(999 - 30);
  });

  it('扇形背后敌人不受伤害', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    const behind = makeEnemy(-50, 0, 999);
    manager.addEnemy(behind);
    adapter.performAttack({ x: 1, y: 0 }, 0); // 朝 +x，背后 -x 不在扇形
    expect(behind.hp).toBe(999);
  });
});

describe('Plan 4 集成冒烟 — 大招伤害链路', () => {
  it('血镰血轮：大招生成跟随区域，区域内敌人持续掉血', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.bloodScythe';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 9999);
    manager.addEnemy(e);
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(true);
    expect(manager.playerZones).toHaveLength(1);
    expect(manager.playerZones[0]!.followPlayer).toBe(true);
    manager.update(1000); // 1s → dps 50
    expect(e.hp).toBeLessThan(9999);
  });

  it('大招 CD 门控：CD 内返回 false，CD 解除返回 true', () => {
    const { adapter, manager } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(true); // 尺子 CD 20s
    expect(adapter.performUltimate({ x: 1, y: 0 }, 19999)).toBe(false);
    expect(adapter.performUltimate({ x: 1, y: 0 }, 20000)).toBe(true);
  });
});

describe('Plan 4 集成冒烟 — 血镰吸血全链路', () => {
  it('受伤 → 拾取血镰 → 普攻吸血回血 4', () => {
    const { adapter, manager, player } = makeAdapter();
    manager.setPlayerPosition(0, 0);
    player.takeDamage({ amount: 50, category: 'melee' });
    expect(player.hp).toBe(50);
    adapter.equipWeapon('weapon.bloodScythe');
    const e = makeEnemy(50, 0, 9999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0); // 40 伤 × 10% = 4 吸血
    expect(e.hp).toBe(9999 - 40);
    expect(player.hp).toBe(54); // 50 + 4
  });
});

describe('Plan 4 集成冒烟 — 未知武器 no-op', () => {
  it('未知 weaponId 普攻/大招均 no-op 不抛错', () => {
    const { adapter, player } = makeAdapter();
    player.weaponId = 'weapon.unknown';
    expect(() => adapter.performAttack({ x: 1, y: 0 }, 0)).not.toThrow();
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(false);
  });
});
