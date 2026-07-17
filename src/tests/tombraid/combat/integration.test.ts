import { describe, expect, it, vi } from 'vitest';

// 注册全部 11 种敌人（10 个 register 函数覆盖 11 个 EnemyKind：registerYangYunRed 同时注册精英+幻影）
import { registerButYuxuanHead } from '../../../tombraid/combat/enemies/ButYuxuanHead';
import { registerQinHaoruiHead } from '../../../tombraid/combat/enemies/QinHaoruiHead';
import { registerDeskChairs } from '../../../tombraid/combat/enemies/DeskChairs';
import { registerPhone } from '../../../tombraid/combat/enemies/Phone';
import { registerBloodHand } from '../../../tombraid/combat/enemies/BloodHand';
import { registerFloatingEye } from '../../../tombraid/combat/enemies/FloatingEye';
import { registerChalkDust } from '../../../tombraid/combat/enemies/ChalkDust';
import { registerButYuxuanHeadBloodEye } from '../../../tombraid/combat/enemies/ButYuxuanHeadBloodEye';
import { registerDanYuxuanBody } from '../../../tombraid/combat/enemies/DanYuxuanBody';
import { registerYangYunRed, YangYunRedEnemy } from '../../../tombraid/combat/enemies/YangYunRed';

import {
  createCombatRng,
  createEnemy,
  isEnemyKindRegistered,
  type EnemyKind,
} from '../../../tombraid/combat/Enemy';
import { CombatManager, type CombatCallbacks } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';

// 触发全部注册
registerButYuxuanHead();
registerQinHaoruiHead();
registerDeskChairs();
registerPhone();
registerBloodHand();
registerFloatingEye();
registerChalkDust();
registerButYuxuanHeadBloodEye();
registerDanYuxuanBody();
registerYangYunRed();

const ALL_KINDS: EnemyKind[] = [
  'butYuxuanHead', 'qinHaoruiHead', 'deskChairs', 'phone', 'bloodHand',
  'floatingEye', 'chalkDust', 'butYuxuanHeadBloodEye', 'danYuxuanBody',
  'yangYunRed', 'yangYunRedPhantom',
];

// 与 CombatManager.defaultEnemyOpts 数值表一致（保持核心/插件解耦，测试自带镜像）
const KIND_OPTS: Record<EnemyKind, { maxHp: number; speed: number; contactDamage: number; contactRadius: number }> = {
  butYuxuanHead: { maxHp: 45, speed: 60, contactDamage: 8, contactRadius: 22 },
  qinHaoruiHead: { maxHp: 55, speed: 50, contactDamage: 8, contactRadius: 22 },
  deskChairs: { maxHp: 120, speed: 40, contactDamage: 15, contactRadius: 28 },
  phone: { maxHp: 70, speed: 55, contactDamage: 10, contactRadius: 22 },
  bloodHand: { maxHp: 70, speed: 0, contactDamage: 16, contactRadius: 26 },
  floatingEye: { maxHp: 35, speed: 80, contactDamage: 6, contactRadius: 20 },
  chalkDust: { maxHp: 150, speed: 30, contactDamage: 5, contactRadius: 40 },
  butYuxuanHeadBloodEye: { maxHp: 70, speed: 75, contactDamage: 12, contactRadius: 22 },
  danYuxuanBody: { maxHp: 1, speed: 0, contactDamage: 0, contactRadius: 30 },
  yangYunRed: { maxHp: 320, speed: 95, contactDamage: 22, contactRadius: 30 },
  yangYunRedPhantom: { maxHp: 40, speed: 80, contactDamage: 8, contactRadius: 24 },
};

describe('集成：11 种 factory 全注册', () => {
  it('所有 EnemyKind 已注册', () => {
    for (const kind of ALL_KINDS) {
      expect(isEnemyKindRegistered(kind)).toBe(true);
    }
  });

  it('createEnemy 每种都能产出实例', () => {
    for (const kind of ALL_KINDS) {
      const o = KIND_OPTS[kind];
      const enemy = createEnemy(kind, { id: `smoke-${kind}`, x: 0, y: 0, ...o });
      expect(enemy, `createEnemy(${kind}) 应返回实例`).not.toBeNull();
      expect(enemy!.kind).toBe(kind);
    }
  });
});

describe('集成：CombatManager 端到端 update 不崩溃', () => {
  it('spawn 11 种敌人 + update 60 帧无异常 + 玩家存活', () => {
    const player = new PlayerCombat();
    const callbacks: CombatCallbacks = {};
    const mgr = new CombatManager(player, callbacks, () => true, createCombatRng(42));
    // 玩家放在 (1000,1000)，敌人放在原点附近，避免一帧内立即接触致死
    mgr.setPlayerPosition(1000, 1000);

    for (const kind of ALL_KINDS) {
      const o = KIND_OPTS[kind];
      const enemy = createEnemy(kind, { id: `e2e-${kind}`, x: 0, y: 0, ...o });
      if (enemy === null) {
        throw new Error(`createEnemy(${kind}) 返回 null`);
      }
      mgr.addEnemy(enemy);
    }
    expect(mgr.enemies).toHaveLength(ALL_KINDS.length);

    // 推进 60 帧 × 16ms
    for (let i = 0; i < 60; i++) {
      mgr.update(16);
    }
    expect(player.isDead).toBe(false);
  });
});

describe('集成：精英死亡回调链路', () => {
  it('YangYunRed 死亡触发 CombatCallbacks.onEliteDefeated', () => {
    const player = new PlayerCombat();
    const onElite = vi.fn();
    const mgr = new CombatManager(player, { onEliteDefeated: onElite }, () => true, createCombatRng(1));
    mgr.setPlayerPosition(0, 0);
    const elite = new YangYunRedEnemy('elite1', 50, 0);
    mgr.addEnemy(elite);
    // 一击致命（applyDamageForTest 设置 dead=true，不依赖 CombatManager 伤害结算）
    elite.applyDamageForTest(320);
    expect(elite.dead).toBe(true);
    mgr.update(0); // handleDeadEnemies → onEliteDefeated
    expect(onElite).toHaveBeenCalledTimes(1);
  });
});

describe('集成：身体上限 (spec §5.9 最多 2)', () => {
  it('canSpawnBody 上限 2', () => {
    const player = new PlayerCombat();
    const mgr = new CombatManager(player, {}, () => true);
    expect(mgr.canSpawnBody()).toBe(true);
    mgr.registerBody();
    mgr.registerBody();
    expect(mgr.canSpawnBody()).toBe(false);
  });
});
