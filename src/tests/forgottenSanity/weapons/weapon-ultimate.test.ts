import { describe, expect, it, vi } from 'vitest';

import { CombatManager } from '../../../forgottenSanity/combat/CombatManager';
import { PlayerCombat } from '../../../forgottenSanity/combat/PlayerCombat';
import {
  Enemy,
  registerEnemyKind,
  type EnemyConstructorOpts,
  type EnemyKind,
  type EnemyPerceptionParams,
  type EnemyUpdateContext,
} from '../../../forgottenSanity/combat/Enemy';
import { WeaponCooldowns } from '../../../forgottenSanity/weapons/WeaponCooldowns';
import { WeaponCombatAdapter, type CombatPort } from '../../../forgottenSanity/weapons/WeaponCombatAdapter';

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

function makeEnemy(x: number, y: number, hp: number, kind: EnemyKind = 'butYuxuanHead'): DummyEnemy {
  const opts: EnemyConstructorOpts = {
    id: `e${x}-${y}-${hp}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24,
  };
  const e = new DummyEnemy(opts);
  (e as { kind: EnemyKind }).kind = kind;
  return e;
}

function makeAdapter(): {
  adapter: WeaponCombatAdapter;
  manager: CombatManager;
  player: PlayerCombat;
  onVisual: ReturnType<typeof vi.fn>;
} {
  const player = new PlayerCombat();
  const manager = new CombatManager(player);
  const cooldowns = new WeaponCooldowns();
  const onVisual = vi.fn();
  const adapter = new WeaponCombatAdapter(manager as unknown as CombatPort, cooldowns, onVisual);
  return { adapter, manager, player, onVisual };
}

describe('performUltimate — CD 门控', () => {
  it('CD 内返回 false', () => {
    const { adapter, player } = makeAdapter();
    player.weaponId = 'weapon.ruler';
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(true);
    expect(adapter.performUltimate({ x: 1, y: 0 }, 1000)).toBe(false);
  });

  it('未知 weaponId 返回 false', () => {
    const { adapter, player } = makeAdapter();
    player.weaponId = 'weapon.unarmed';
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(false);
  });
});

describe('performUltimate — 断尺 scatterShards', () => {
  it('生成 6 枚尺屑投射物', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.brokenRuler';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerProjectiles).toHaveLength(6);
    expect(manager.playerProjectiles[0]!.damage).toBe(4);
  });
});

describe('performUltimate — 粉笔 chalkBombAoe', () => {
  it('在玩家前方生成爆弹区域，burst 25 伤', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.chalk';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(80, 0, 100);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerZones).toHaveLength(1);
    manager.update(100); // 区域 burst
    expect(e.hp).toBe(75);
  });
});

describe('performUltimate — 尺子 rulerStorm', () => {
  it('生成跟随玩家的风暴区域', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.ruler';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 999);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerZones).toHaveLength(1);
    expect(manager.playerZones[0]!.followPlayer).toBe(true);
    manager.update(2000); // 2s dps 15 → 30 伤
    expect(e.hp).toBeLessThan(999);
  });
});

describe('performUltimate — 灵刃 bladeArray', () => {
  it('生成 8 个方向的投射物', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.spiritBlade';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerProjectiles).toHaveLength(8);
    const angles = manager.playerProjectiles.map((p) => Math.atan2(p.vy, p.vx).toFixed(3));
    expect(new Set(angles).size).toBe(8);
  });
});

describe('performUltimate — 拳套 fistDash 无敌', () => {
  it('玩家进入无敌态', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(player.isInvincible()).toBe(true);
  });

  it('无敌期间 takeDamage 不扣血', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    const before = player.hp;
    player.takeDamage({ amount: 99, category: 'melee' });
    expect(player.hp).toBe(before);
  });

  it('不生成 followPlayer DoT 区域 — 改用 dash 状态机', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerZones).toHaveLength(0);
  });
});

describe('performUltimate — 锁链 chainCrush', () => {
  it('群拉 + root + DoT 区域', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.chain';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(150, 0, 999);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(e.x).toBeLessThan(150); // 被拉近
    expect(e.isRooted()).toBe(true); // root 2s
    expect(manager.playerZones).toHaveLength(1);
  });
});

describe('performUltimate — 血镰 bloodWheel', () => {
  it('生成跟随玩家的血轮区域，dps 50', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.bloodScythe';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(50, 0, 9999);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerZones).toHaveLength(1);
    const z = manager.playerZones[0]!;
    expect(z.damagePerSecond).toBe(50);
    expect(z.remainingMs).toBe(3000);
    manager.update(1000); // 1s → 50 伤
    expect(e.hp).toBeLessThan(9999);
  });
});

describe('performUltimate — 万魂幡 soulCapture', () => {
  it('秒杀范围内一个非精英敌人', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.soulBanner';
    manager.setPlayerPosition(0, 0);
    const a = makeEnemy(50, 0, 999, 'butYuxuanHead');
    const elite = makeEnemy(60, 0, 320, 'yangYunRed');
    manager.addEnemy(a); manager.addEnemy(elite);
    const orig = Math.random;
    Math.random = () => 0; // 选第一个
    try {
      adapter.performUltimate({ x: 1, y: 0 }, 0);
    } finally {
      Math.random = orig;
    }
    expect(a.dead).toBe(true);
    expect(elite.dead).toBe(false);
  });

  it('范围内只有精英时 CD 仍消耗（返回 true）', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.soulBanner';
    manager.setPlayerPosition(0, 0);
    const elite = makeEnemy(50, 0, 320, 'yangYunRed');
    manager.addEnemy(elite);
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(true);
    expect(elite.dead).toBe(false);
    // CD 120s
    expect(adapter.performUltimate({ x: 1, y: 0 }, 100000)).toBe(false);
  });
});

describe('performUltimate — 视觉事件', () => {
  it('触发 ultimateFired 事件', () => {
    const { adapter, manager, player, onVisual } = makeAdapter();
    player.weaponId = 'weapon.ruler';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(onVisual).toHaveBeenCalled();
    const event = onVisual.mock.calls[0]![0];
    expect(event.kind).toBe('ultimateFired');
    expect(event.weaponId).toBe('weapon.ruler');
  });
});

describe('fistDash 路径伤害与末端伤害 (spec §4.7/§3.2)', () => {
  it('路径伤害 40 — 沿冲刺方向 250px 内最近敌', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(100, 0, 100);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(60);
  });

  it('末端伤害 40 — 冲刺结束点 r=60 内圆形 AOE', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    // 冲刺终点 (250, 0)；敌人 (300, 50) 距终点 ≈70.7 ≤ 60+contactRadius(24)=84（末端 AOE 内）
    // 距原点 ≈304 > 250+contactRadius(24)=274（路径扇形外）→ 仅受末端伤害 40
    const e = makeEnemy(300, 50, 100);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(60);
  });

  it('路径外的敌人不受路径伤害', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    // 敌人在 y=200，路径半角 22.5° 不覆盖（atan(200/100)≈63° > 22.5°）
    const e = makeEnemy(100, 200, 100);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(100);
  });
});

describe('#3 fistDash hitSet 去重 — 路径+末端同敌只算一次', () => {
  it('路径+末端命中同一敌人 → 仅 40 伤害（非 80）', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    // 冲刺方向 (1,0)：路径扇形从 (0,0) range=250 半角 22.5°；末端圆心 (250,0) r=60
    // 敌人 (200,0)：
    //   - 距原点 200 ≤ 274 (250+contactRadius24)，角度 0 ≤ 22.5° → 路径命中
    //   - 距终点 (250,0) 50 ≤ 84 (60+24)              → 末端命中
    // → 路径+末端均命中同一敌人；去重后应仅扣 40
    const e = makeEnemy(200, 0, 1000);
    manager.addEnemy(e);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(960); // 1000 - 40（非 920 = 1000 - 80）
  });

  it('路径命中 enemyA + 末端命中 enemyB → A 仅 40（去重），B 40', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    // enemyA (200,0)：路径+末端均命中（去重 → 仅 40）
    // enemyB (310,0)：距原点 310 > 274（路径外），距终点 60 ≤ 84（末端内）→ 仅末端 40
    const a = makeEnemy(200, 0, 1000);
    const b = makeEnemy(310, 0, 1000);
    manager.addEnemy(a);
    manager.addEnemy(b);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(a.hp).toBe(960); // 路径 40（末端被 excludeIds 排除）
    expect(b.hp).toBe(960); // 末端 40
  });
});
