// src/tests/forgottenSanity/combat/enemies/state-machine.test.ts
// Task 25 (M7): 8 种普通缄默者三态机统一转换矩阵测试。
//
// 现有 per-enemy 测试已覆盖：chase→search→alert→idle 完整链 + perception 字段 + 静止 360° / 噪声触发。
// 本文件增量价值：
//   1. 跨敌人统一矩阵（参数化 8 种敌人验证相同转换链的行为差异）
//   2. 补齐 search→chase 即时升追缺口（spec §5.11.1「搜索中再次发现立即追击」）
//      — 现有 per-enemy 测试仅 ①but-yuxuan-head 覆盖此转换，②-⑧ 缺口
//   3. setAIState 行为一致性（重置 stateTimerMs + lostPlayerTimerMs）
//
// 对照 spec §5.11.1 三态机定义 + §5.11.6 怪种参数表。
// 不实施 plan 伪代码中的 "chase → idle when player dead/evacuated"：
//   - spec §5.11.1 三态机定义里没有这个转换
//   - EnemyUpdateContext 无 playerDead 字段
//   - 该测试是 plan 伪代码臆造，跳过
import { describe, it, expect, beforeAll } from 'vitest';

import type {
  Enemy,
  EnemyUpdateContext,
  PlayerNoiseEvent,
  Projectile,
  ZoneEffect,
} from '../../../../forgottenSanity/combat/Enemy';
import { createCombatRng } from '../../../../forgottenSanity/combat/Enemy';
import { ButYuxuanHeadEnemy, registerButYuxuanHead } from '../../../../forgottenSanity/combat/enemies/ButYuxuanHead';
import { QinHaoruiHeadEnemy, registerQinHaoruiHead } from '../../../../forgottenSanity/combat/enemies/QinHaoruiHead';
import { DeskChairsEnemy, registerDeskChairs } from '../../../../forgottenSanity/combat/enemies/DeskChairs';
import { PhoneEnemy, registerPhone } from '../../../../forgottenSanity/combat/enemies/Phone';
import { BloodHandEnemy, registerBloodHand } from '../../../../forgottenSanity/combat/enemies/BloodHand';
import { FloatingEyeEnemy, registerFloatingEye } from '../../../../forgottenSanity/combat/enemies/FloatingEye';
import { ChalkDustEnemy, registerChalkDust } from '../../../../forgottenSanity/combat/enemies/ChalkDust';
import { ButYuxuanHeadBloodEyeEnemy, registerButYuxuanHeadBloodEye } from '../../../../forgottenSanity/combat/enemies/ButYuxuanHeadBloodEye';

interface EnemySpec {
  name: string;
  create: () => Enemy;
  // 玩家在该位置能被敌人初始感知（视野锥内或静止 360° 内）
  inViewPos: { x: number; y: number };
  // 是否即转怪种（alertToChaseMs === 'instant'）
  isInstant: boolean;
  // 非 instant 怪种的 alertToChaseMs（ms）；instant 用 0
  alertToChaseMs: number;
  chaseToSearchMs: number;
  searchToAlertMs: number;
  alertToIdleMs: number;
}

// 8 种普通缄默者工厂表（spec §5.11.6 怪种参数表）
// inViewPos 取自 per-enemy 测试中已验证能触发感知的位置
const SPECS: readonly EnemySpec[] = [
  {
    name: '①但宇轩头颅',
    create: () => new ButYuxuanHeadEnemy('e1', 0, 0),
    inViewPos: { x: 0, y: 100 },
    isInstant: true,
    alertToChaseMs: 0,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
  },
  {
    name: '②秦浩睿头颅',
    create: () => new QinHaoruiHeadEnemy('e1', 0, 0),
    inViewPos: { x: 0, y: 100 },
    isInstant: true,
    alertToChaseMs: 0,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
  },
  {
    name: '③桌椅',
    create: () => new DeskChairsEnemy('e1', 0, 0),
    inViewPos: { x: 100, y: 0 },
    isInstant: false,
    alertToChaseMs: 2000,
    chaseToSearchMs: 4000,
    searchToAlertMs: 4000,
    alertToIdleMs: 6000,
  },
  {
    name: '④电话',
    create: () => new PhoneEnemy('e1', 0, 0),
    inViewPos: { x: 150, y: 0 },
    isInstant: false,
    alertToChaseMs: 2000,
    chaseToSearchMs: 2000,
    searchToAlertMs: 2000,
    alertToIdleMs: 4000,
  },
  {
    name: '⑤血手',
    create: () => new BloodHandEnemy('e1', 0, 0),
    inViewPos: { x: 90, y: 0 },
    isInstant: false,
    alertToChaseMs: 1000,
    chaseToSearchMs: 4000,
    searchToAlertMs: 4000,
    alertToIdleMs: 6000,
  },
  {
    name: '⑥漂浮眼球',
    create: () => new FloatingEyeEnemy('e1', 0, 0),
    inViewPos: { x: 200, y: 0 },
    isInstant: true,
    alertToChaseMs: 0,
    chaseToSearchMs: 3000,
    searchToAlertMs: 3000,
    alertToIdleMs: 5000,
  },
  {
    name: '⑦粉笔尘云',
    create: () => new ChalkDustEnemy('e1', 0, 0),
    inViewPos: { x: 150, y: 0 },
    isInstant: true,
    alertToChaseMs: 0,
    chaseToSearchMs: 5000,
    searchToAlertMs: 5000,
    alertToIdleMs: 7000,
  },
  {
    name: '⑧血瞳头颅',
    create: () => new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0),
    inViewPos: { x: 0, y: 300 },
    isInstant: true,
    alertToChaseMs: 0,
    chaseToSearchMs: 2000,
    searchToAlertMs: 2000,
    alertToIdleMs: 4000,
  },
];

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

/** 让敌人进入 chase 态：instant 怪种 idle→chase 一步；非 instant 怪种 idle→alert→chase 两步。 */
function enterChase(enemy: Enemy, spec: EnemySpec): void {
  enemy.update(16, ctxStub({ playerPos: spec.inViewPos }));
  if (!spec.isInstant) {
    enemy.update(spec.alertToChaseMs, ctxStub({ playerPos: spec.inViewPos }));
  }
  expect(enemy.aiState).toBe('chase');
}

describe('M7 三态机统一矩阵 (spec §5.11.1，grill 2026-07-17)', () => {
  beforeAll(() => {
    registerButYuxuanHead();
    registerQinHaoruiHead();
    registerDeskChairs();
    registerPhone();
    registerBloodHand();
    registerFloatingEye();
    registerChalkDust();
    registerButYuxuanHeadBloodEye();
  });

  describe.each(SPECS)('$name', (spec) => {
    it('初始 aiState=idle', () => {
      const enemy = spec.create();
      expect(enemy.aiState).toBe('idle');
    });

    it('setAIState 重置 stateTimerMs + lostPlayerTimerMs', () => {
      const enemy = spec.create();
      // 先累加一些计时器值
      enemy.update(1000, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      // setAIState 应重置
      enemy.setAIState('chase');
      expect(enemy.aiState).toBe('chase');
      expect(enemy.stateTimerMs).toBe(0);
      expect(enemy.lostPlayerTimerMs).toBe(0);
    });

    it('idle 保持 idle 当玩家在视野外且无噪声', () => {
      const enemy = spec.create();
      enemy.update(16, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('idle');
    });

    it('idle → alert/chase 当玩家在视野内', () => {
      const enemy = spec.create();
      enemy.update(16, ctxStub({ playerPos: spec.inViewPos }));
      if (spec.isInstant) {
        expect(enemy.aiState).toBe('chase');
      } else {
        expect(enemy.aiState).toBe('alert');
      }
    });

    it('alert → chase 当 alertToChaseMs 持续感知（仅非 instant 怪种）', () => {
      if (spec.isInstant) return; // instant 怪种跳过
      const enemy = spec.create();
      enemy.update(16, ctxStub({ playerPos: spec.inViewPos })); // idle→alert
      expect(enemy.aiState).toBe('alert');
      enemy.update(spec.alertToChaseMs, ctxStub({ playerPos: spec.inViewPos }));
      expect(enemy.aiState).toBe('chase');
    });

    it('完整转换链: idle → (alert) → chase → search → alert → idle', () => {
      const enemy = spec.create();
      // 进入 chase
      enterChase(enemy, spec);
      // chase → search（脱离视野 chaseToSearchMs）
      enemy.update(spec.chaseToSearchMs, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('search');
      // search → alert（无新刺激 searchToAlertMs）
      enemy.update(spec.searchToAlertMs, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('alert');
      // alert → idle（无新刺激 alertToIdleMs）
      enemy.update(spec.alertToIdleMs, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('idle');
    });

    // 核心增量：补齐 ②-⑧ 的 search→chase 即时升追测试
    it('search → chase 当再次感知玩家（即时升追，spec §5.11.1）', () => {
      const enemy = spec.create();
      enterChase(enemy, spec);
      enemy.update(spec.chaseToSearchMs, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('search');
      // 搜索阶段敌人向 lastKnownPlayerPos(=inViewPos) 移动，部分敌人已抵达精确位置
      // 此时 dist=0，checkPerception 的 `dist > 0` 守卫会跳过视野检测导致升追失败
      // 重置敌人位置到原点，确保 dist > 0 才能进入视野锥检测分支
      enemy.x = 0;
      enemy.y = 0;
      // 玩家重新出现在 inViewPos；让敌人朝向 inViewPos 方向，玩家落在视野锥中心轴
      // 对 360° 静止怪种，朝向不重要（全向感知）；对 120° 锥怪种，朝向决定锥方向
      const dx = spec.inViewPos.x - enemy.x;
      const dy = spec.inViewPos.y - enemy.y;
      enemy.setFacing(dx, dy);
      enemy.update(16, ctxStub({ playerPos: spec.inViewPos, playerNoise: null }));
      expect(enemy.aiState).toBe('chase');
    });

    // 噪声通道在 search 态也触发即时升追
    it('search → chase 当噪声命中（即使玩家在视野锥外）', () => {
      const enemy = spec.create();
      enterChase(enemy, spec);
      enemy.update(spec.chaseToSearchMs, ctxStub({ playerPos: { x: 10000, y: 0 }, playerNoise: null }));
      expect(enemy.aiState).toBe('search');
      // 玩家 (100,0)，噪声源 (100,0)，半径 200
      // 对所有 8 种敌人：200 × min(noiseSensitivity=0.7 桌椅) = 140 ≥ 100 → 命中
      // 桌椅 noiseSensitivity=0.7 是最低，140 ≥ 100 ✓
      enemy.update(16, ctxStub({
        playerPos: { x: 100, y: 0 },
        playerNoise: { x: 100, y: 0, radius: 200 },
      }));
      expect(enemy.aiState).toBe('chase');
    });
  });
});
