# 摸金模式 Plan 4：武器系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **前置依赖：Plan 3（战斗系统）必须已完成。**

**Goal:** 实现摸金模式（Tomb Raid Mode）的 8 把武器系统：武器注册表（数据/查表）、程序绘制特效、普攻/大招冷却状态机、普攻执行器（扇形/穿透/连击 + 吸血 + 恐惧触发）、8 种大招执行器（尺屑散射/粉笔爆弹/尺子风暴/万刃阵/霸体冲拳/万锁绞杀/血轮/拘魂）、玩家无敌态（拳套冲拳）、Enemy 状态追踪器（burn/stun/root/fear）、CombatManager 玩家侧伤害 API（扇形/圆形/玩家投射物/玩家区域/群拉/即死）。对 plan 3 既有代码全部为**加法式**修改（零回归）。

**Architecture:**
- `weapons/WeaponRegistry.ts` — WeaponId 联合 + 8 把武器定义（判别联合）+ 特效种类 + 查表（纯 TS，无 Phaser）
- `weapons/WeaponEffect.ts` — 程序绘制特效（Phaser Graphics + UI_THEME，type-only Phaser import）
- `weapons/WeaponCooldowns.ts` — 普攻/大招冷却状态机（纯 TS）
- `weapons/WeaponCombatAdapter.ts` — CombatPort 接口 + WeaponVisualEvent + WeaponCombatAdapter（performAttack/performUltimate/equipWeapon，纯 TS）
- `combat/Enemy.ts`（plan 3，加法式）— Enemy 状态追踪器 + ProceduralKind 扩展 +9
- `combat/CombatManager.ts`（plan 3，加法式）— 玩家侧伤害 API + 玩家投射物/区域子系统 + 敌人 loop 状态门控
- `combat/PlayerCombat.ts`（plan 3，加法式）— 无敌态（invincibleMs / setInvincible / isInvincible）

**Tech Stack:** Phaser 4.1.0, TypeScript（strict: `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noUnusedLocals` / `noUnusedParameters`）, Vitest 4.1.8, jsdom

---

## File Structure

| 文件 | 职责 | Phaser 依赖 | 操作 |
|------|------|------------|------|
| `src/tombraid/weapons/WeaponRegistry.ts` | WeaponId + 8 武器定义 + 特效种类 + 查表 | 无 | 新建 |
| `src/tombraid/weapons/WeaponEffect.ts` | 程序绘制特效（投射物/区域/近战闪光） | `import type { Graphics }` + UI_THEME | 新建 |
| `src/tombraid/weapons/WeaponCooldowns.ts` | 冷却状态机 | 无 | 新建 |
| `src/tombraid/weapons/WeaponCombatAdapter.ts` | CombatPort + 执行器 + equipWeapon | 无 | 新建 |
| `src/tombraid/combat/Enemy.ts` | Enemy 状态追踪器 + ProceduralKind +9 | 无（plan 3 既有） | 加法式修改 |
| `src/tombraid/combat/CombatManager.ts` | 玩家侧伤害 API + 玩家投射物/区域 + 敌人 loop 门控 | 无（plan 3 既有） | 加法式修改 |
| `src/tombraid/combat/PlayerCombat.ts` | 无敌态 | 无（plan 3 既有） | 加法式修改 |
| `src/tests/tombraid/weapons/enemy-status.test.ts` | Task 1 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/combat-player-damage.test.ts` | Task 2 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-registry.test.ts` | Task 3 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-effect.test.ts` | Task 4 测试 | `import type { Graphics }` | 新建 |
| `src/tests/tombraid/weapons/player-invincibility.test.ts` | Task 5 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-cooldowns.test.ts` | Task 6 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-basic-attack.test.ts` | Task 7 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-ultimate.test.ts` | Task 8 测试 | 无 | 新建 |
| `src/tests/tombraid/weapons/weapon-integration.test.ts` | Task 9 测试 | 无 | 新建 |

## Constraints

- **不修改剧情模式代码**（EventEngine/storyManifest/SaveState/PreloadScene/InputManager/PlayScene/uiTheme）
- **对 plan 3 既有代码全部加法式**：Enemy 新状态方法在 plan 3 敌人无状态时 no-op；CombatManager 新玩家侧列表初始空、新 tick 空转；PlayerCombat 无敌态默认 0 → `isInvincible()` 恒 false
- **CombatManager.playerAttack 占位弱拳保留不替换**（plan 3 fallback）；WeaponCombatAdapter 是新的武器感知路径，由场景（plan 6）调用
- **空手状态由 plan 6 起配系统处理**（OUT of plan 4 scope）；adapter 对未知 weaponId no-op
- **核心武器逻辑纯 TS**：WeaponRegistry/WeaponCooldowns/WeaponCombatAdapter/CombatManager 新 API 不 import Phaser；仅 WeaponEffect 用 `import type { Graphics }`（编译期擦除）
- **TypeScript strict**：`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`（可选属性用条件展开 `...(cond ? { debuff } : {})`）/ `noUnusedLocals` + `noUnusedParameters`
- **TDD 强制**：每个任务 5 步（RED → GREEN → SURFACE）
- **数值严格遵循 spec §4**（含 grill 2026-07-17 补全的 §4.6 meleeFan 档位 / §4.7 大招具体参数）；spec 未给的大招伤害/范围在设计值清单中标注
- **素材 key**：尺子复用 `prop.ruler`；其余 7 把程序绘制（textureKey = null）

## 设计变更（grill 2026-07-17，权威性高于 plan 内既有代码）

> 本 plan 早于 spec §4.6/§4.7 的 grill 补全而写。Task 3 `WeaponRegistry.ts` 的 `MeleeFanBasic` / `WeaponUltimate` 各变体字段需按下列 spec 参数对齐。spec 为权威，plan 内冲突数值作废。

1. **meleeFan 3 档参数（spec §4.6）**：`MeleeFanBasic.halfAngle`（弧度）与 `range`（px）按武器所属档位设定：
   | 档位 | halfAngle（弧度） | range（px） | 适用武器 |
   |------|------------------|------------|----------|
   | 快攻型 | π/6（30°） | 90 | 断尺、拳套 |
   | 均衡型 | π/4（45°） | 120 | 尺子、万魂幡 |
   | 重型 | π/3（60°） | 180 | 锁链、血镰 |
   Task 3 既有 8 把武器定义的 `halfAngle`/`range` 需按此表校正。
2. **meleeFan 命中判定（spec §3.2）**：扇形仅命中**最近 1 敌**（单体近战）；拳套 `hitsPerAttack: 3` = 同一最近敌受 3 段（爆发）。Task 7 `WeaponCombatAdapter.performAttack` 的 meleeFan 分支需按此实现（原 plan 若写多目标 AoE 命中需改）。
3. **rangedPiercing 朝向（spec §3.2）**：朝玩家 8 方向射出（同移动方向，静止时用上次方向），遇墙停止。Task 7 rangedPiercing 分支需读取玩家 8 方向朝向。
4. **大招具体参数（spec §4.7）**：Task 8 各大招执行器参数按 spec §4.7 表对齐：
   - rulerStorm: r150, 3s, dps15（总45），持续型可移动可转向
   - bladeArray: 8 方向，每刃长180/宽20/18伤/pierce2/速400，遇墙消失
   - fistDash: 0.3s 冲刺距离250（速833），路径首敌40+末端40（总80），**无敌**+**锁定向不可转**
   - chainCrush: 拉扯≤200px（首敌拉到身边），root 2s + burn 10/s×3s
   - bloodWheel: r130, 3s, dps50（总150），lifesteal 10%，持续型可移动可转向
   - soulCapture: **屏幕可视范围**（1280×720 视口）内随机 1 只非精英即死，**排除但宇轩身体**（HP=1），不穿墙检测生效
   - scatterShards（断尺）: 6×4 碎片，每片 4 伤（总24）
   - chalkBombAoe（粉笔）: AoE 25 伤，r150，瞬发
5. **大招转向规则（spec §3.2）**：释放中可转向（持续型 rulerStorm/bloodWheel/bladeArray/chainCrush），fistDash 例外（冲刺方向释放瞬间锁定，0.3s 内不可转）。
6. **soulCapture 字段调整**：原 `captureRadius: 600` 改为 `captureMode: 'screenViewport'`（屏幕可视范围判定）+ `excludeHpLe: 1`（排除 HP≤1 的身体）。测试断言需同步更新。

## Run Commands

```bash
npm run test:run     # vitest run（运行所有单元测试）
npm run typecheck    # tsc --noEmit（类型检查）
npm run build        # tsc --noEmit + vite build
```

单个测试文件：
```bash
npx vitest run src/tests/tombraid/weapons/weapon-registry.test.ts
```

---

## Task 1: Enemy 状态追踪器（burn/stun/root/fear）— 加法式修改 Enemy.ts

**目标**：为 plan 3 的 `Enemy` 基类加法式新增武器 debuff 状态追踪（burn DoT / stun / root / fear），供 plan 4 武器（万魂幡恐惧、锁链缚身、燃烧投掷物等）使用。不修改既有 `applyDamage`（仅扣血）；新方法在 plan 3 敌人无状态时 no-op。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/enemy-status.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { Enemy, type EnemyConstructorOpts, type EnemyUpdateContext } from '../../../tombraid/combat/Enemy';

class StatusTestEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
}

function makeEnemy(maxHp = 100): StatusTestEnemy {
  const opts: EnemyConstructorOpts = {
    id: 'e1', x: 0, y: 0, maxHp, speed: 0, contactDamage: 0, contactRadius: 20,
  };
  return new StatusTestEnemy(opts);
}

describe('Enemy 状态追踪器 (plan 4 加法式)', () => {
  it('初始无状态：isStunned/isRooted false, getFleeFrom null', () => {
    const e = makeEnemy();
    expect(e.isStunned()).toBe(false);
    expect(e.isRooted()).toBe(false);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('applyDebuff stun → isStunned true，tickStatus 后过期', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    expect(e.isStunned()).toBe(true);
    e.tickStatus(500);
    expect(e.isStunned()).toBe(true);
    e.tickStatus(500);
    expect(e.isStunned()).toBe(false);
  });

  it('applyDebuff root → isRooted true', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'root', remainingMs: 2000 });
    expect(e.isRooted()).toBe(true);
    e.tickStatus(2000);
    expect(e.isRooted()).toBe(false);
  });

  it('applyDebuff fear → getFleeFrom 返回源坐标，过期后 null', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'fear', remainingMs: 2000, sourceX: 100, sourceY: 200 });
    expect(e.getFleeFrom()).toEqual({ x: 100, y: 200 });
    e.tickStatus(1000);
    expect(e.getFleeFrom()).toEqual({ x: 100, y: 200 });
    e.tickStatus(1000);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('applyDebuff burn → tickStatus 每秒扣 dps 伤害', () => {
    const e = makeEnemy(100);
    e.applyDebuff({ type: 'burn', dps: 10, remainingMs: 1000 });
    e.tickStatus(500); // 5 伤
    expect(e.hp).toBe(95);
    e.tickStatus(500); // 5 伤，burn 过期
    expect(e.hp).toBe(90);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('burn 致死标记 dead', () => {
    const e = makeEnemy(10);
    e.applyDebuff({ type: 'burn', dps: 20, remainingMs: 1000 });
    e.tickStatus(1000); // 20 伤 > 10 hp
    expect(e.hp).toBe(0);
    expect(e.dead).toBe(true);
  });

  it('stun 取最强（最长时长）', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 500 });
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    expect(e.isStunned()).toBe(true);
    e.tickStatus(600);
    expect(e.isStunned()).toBe(true);
  });

  it('clearStatus 清除全部状态', () => {
    const e = makeEnemy();
    e.applyDebuff({ type: 'stun', remainingMs: 1000 });
    e.applyDebuff({ type: 'root', remainingMs: 1000 });
    e.applyDebuff({ type: 'fear', remainingMs: 1000, sourceX: 0, sourceY: 0 });
    e.clearStatus();
    expect(e.isStunned()).toBe(false);
    expect(e.isRooted()).toBe(false);
    expect(e.getFleeFrom()).toBeNull();
  });

  it('死亡后 applyDebuff/tickStatus no-op', () => {
    const e = makeEnemy(5);
    e.applyDamage({ amount: 5, category: 'melee' });
    expect(e.dead).toBe(true);
    e.applyDebuff({ type: 'burn', dps: 100, remainingMs: 1000 });
    e.tickStatus(1000);
    expect(e.hp).toBe(0);
  });

  it('tickStatus 不影响既有 invulnMs 敌人 burn', () => {
    const e = makeEnemy(100);
    e.invulnMs = 1000;
    e.applyDebuff({ type: 'burn', dps: 50, remainingMs: 1000 });
    e.tickStatus(1000); // invuln → burn 不扣血
    expect(e.hp).toBe(100);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/enemy-status.test.ts`，确认编译错误（`applyDebuff`/`tickStatus`/`isStunned` 等方法不存在于 Enemy）。

### Step 3: 加法式修改 Enemy.ts

- [ ] 在 `src/tombraid/combat/Enemy.ts` 的 `Enemy` 抽象基类中，`applyDamage` 方法之后、`distanceTo` 方法之前，**加法式插入**以下成员（不修改任何既有成员）：

```ts
  // ===========================================================================
  // plan 4: 武器 debuff 状态追踪（burn/stun/root/fear）— 加法式，plan 3 敌人无状态时 no-op
  // ===========================================================================
  private statusBurn: { dps: number; remainingMs: number } | null = null;
  private statusStunMs = 0;
  private statusRootMs = 0;
  private statusFear: { remainingMs: number; sourceX: number; sourceY: number } | null = null;

  /** 应用武器 debuff（burn DoT / stun / root / fear）。不修改既有 applyDamage 行为。 */
  applyDebuff(debuff: Debuff): void {
    if (this.dead) return;
    switch (debuff.type) {
      case 'burn':
        this.statusBurn = { dps: debuff.dps, remainingMs: debuff.remainingMs };
        break;
      case 'stun':
        this.statusStunMs = Math.max(this.statusStunMs, debuff.remainingMs);
        break;
      case 'root':
        this.statusRootMs = Math.max(this.statusRootMs, debuff.remainingMs);
        break;
      case 'fear':
        this.statusFear = {
          remainingMs: debuff.remainingMs,
          sourceX: debuff.sourceX,
          sourceY: debuff.sourceY,
        };
        break;
      case 'slow':
        // plan 4 敌人不使用 slow 移动门控（武器不含 enemy slow）；记录但无效果
        break;
    }
  }

  /** 推进状态计时器，结算 burn DoT。由 CombatManager 敌人 loop 在 enemy.update 前调用。 */
  tickStatus(deltaMs: number): void {
    if (this.dead) return;
    if (this.statusBurn !== null) {
      const seconds = deltaMs / 1000;
      const dmg = this.statusBurn.dps * seconds;
      if (dmg > 0 && this.invulnMs <= 0) {
        this.hp = Math.max(0, this.hp - dmg);
        if (this.hp <= 0) this.dead = true;
      }
      this.statusBurn.remainingMs -= deltaMs;
      if (this.statusBurn.remainingMs <= 0) this.statusBurn = null;
    }
    if (this.statusStunMs > 0) {
      this.statusStunMs = Math.max(0, this.statusStunMs - deltaMs);
    }
    if (this.statusRootMs > 0) {
      this.statusRootMs = Math.max(0, this.statusRootMs - deltaMs);
    }
    if (this.statusFear !== null) {
      this.statusFear.remainingMs -= deltaMs;
      if (this.statusFear.remainingMs <= 0) this.statusFear = null;
    }
  }

  isStunned(): boolean {
    return this.statusStunMs > 0;
  }

  isRooted(): boolean {
    return this.statusRootMs > 0;
  }

  getFleeFrom(): { x: number; y: number } | null {
    return this.statusFear === null ? null : { x: this.statusFear.sourceX, y: this.statusFear.sourceY };
  }

  clearStatus(): void {
    this.statusBurn = null;
    this.statusStunMs = 0;
    this.statusRootMs = 0;
    this.statusFear = null;
  }
```

> **说明**：`Debuff` 类型已在 plan 3 的 `Enemy.ts` 顶部 import（`import type { ..., Debuff } from './DamageType'`）。无需新增 import。所有新成员为 private/公开方法，plan 3 既有 `applyDamage` 不变 → 零回归。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/enemy-status.test.ts`，确认全部通过。
- [ ] 运行 `npx vitest run src/tests/tombraid/combat/`，确认 plan 3 既有测试无回归。

### Step 5: commit

- [ ] `git add src/tombraid/combat/Enemy.ts src/tests/tombraid/weapons/enemy-status.test.ts && git commit -m "feat(tombraid): plan4 task1 Enemy 状态追踪器 burn/stun/root/fear"`

---

## Task 2: ProceduralKind 扩展 +9 + CombatManager 玩家侧伤害 API — 加法式修改 Enemy.ts + CombatManager.ts

**目标**：(a) 在 `Enemy.ts` 的 `ProceduralKind` 联合加法式扩展 9 个武器特效种类（3 投射物 + 6 区域）。(b) 在 `CombatManager.ts` 加法式新增玩家侧伤害 API：`damageEnemiesInFan` / `damageEnemiesInCircle`（返回总伤害用于吸血）、`spawnPlayerProjectile` / `spawnPlayerZone` + 子步进 tick（避免穿透隧道）、`pullEnemiesToward` / `killRandomEnemyInRadiusExcluding` / `getTimeMs`，并在 `update()` 敌人 loop 插入状态门控（stun/root 跳过 AI、fear 逃离覆盖）+ 插入玩家投射物/区域 tick。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/combat-player-damage.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { CombatManager, type IsWalkableFn, type CombatCallbacks, type PlayerProjectile, type PlayerZone } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';
import { Enemy, registerEnemyKind, type EnemyConstructorOpts, type EnemyKind, type EnemyUpdateContext } from '../../../tombraid/combat/Enemy';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  update(_deltaMs: number, _ctx: EnemyUpdateContext): void { /* noop */ }
}
registerEnemyKind('butYuxuanHead', (opts) => new DummyEnemy(opts));

function makeEnemy(x: number, y: number, hp: number): DummyEnemy {
  const opts: EnemyConstructorOpts = { id: `e${x}-${y}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24 };
  return new DummyEnemy(opts);
}

function makeManager(callbacks: CombatCallbacks = {}, isWalkable: IsWalkableFn = () => true): CombatManager {
  return new CombatManager(new PlayerCombat(), callbacks, isWalkable);
}

describe('damageEnemiesInFan (plan 4)', () => {
  it('对扇形内敌人造成伤害并返回总伤害；不命中扇形外', () => {
    const m = makeManager();
    const inFan = makeEnemy(40, 0, 100);
    const behind = makeEnemy(-40, 0, 100);
    m.addEnemy(inFan);
    m.addEnemy(behind);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 15, category: 'melee' });
    expect(inFan.hp).toBe(85);
    expect(behind.hp).toBe(100);
    expect(dealt).toBe(15);
  });

  it('伤害上限不超过敌人 hp（返回实际扣血）', () => {
    const m = makeManager();
    const weak = makeEnemy(40, 0, 5);
    m.addEnemy(weak);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 99, category: 'melee' });
    expect(weak.hp).toBe(0);
    expect(dealt).toBe(5);
  });

  it('附带 debuff 时应用到命中敌人（万魂幡 fear）', () => {
    const m = makeManager();
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, {
      amount: 5, category: 'melee',
      debuff: { type: 'fear', remainingMs: 2000, sourceX: 0, sourceY: 0 },
    });
    expect(e.getFleeFrom()).toEqual({ x: 0, y: 0 });
  });

  it('amount 0 时仍应用 debuff（锁链 root）', () => {
    const m = makeManager();
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, {
      amount: 0, category: 'physical',
      debuff: { type: 'root', remainingMs: 2000 },
    });
    expect(dealt).toBe(0);
    expect(e.isRooted()).toBe(true);
  });

  it('玩家死亡时不造成伤害', () => {
    const m = makeManager();
    m.player.takeDamage({ amount: 999, category: 'melee' });
    const e = makeEnemy(40, 0, 100);
    m.addEnemy(e);
    const dealt = m.damageEnemiesInFan(0, 0, 1, 0, 80, Math.PI / 4, { amount: 15, category: 'melee' });
    expect(dealt).toBe(0);
    expect(e.hp).toBe(100);
  });
});

describe('damageEnemiesInCircle (plan 4)', () => {
  it('对圆形范围内敌人造成伤害', () => {
    const m = makeManager();
    const inside = makeEnemy(10, 0, 100);
    const outside = makeEnemy(200, 0, 100);
    m.addEnemy(inside);
    m.addEnemy(outside);
    const dealt = m.damageEnemiesInCircle(0, 0, 60, { amount: 20, category: 'aoe' });
    expect(inside.hp).toBe(80);
    expect(outside.hp).toBe(100);
    expect(dealt).toBe(20);
  });
});

describe('spawnPlayerProjectile — 玩家投射物伤害敌人不伤玩家', () => {
  it('hit-once (pierceRemaining 0) 命中后移除；玩家 hp 不变', () => {
    const m = makeManager();
    m.setPlayerPosition(0, 0);
    const enemy = makeEnemy(200, 0, 45);
    m.addEnemy(enemy);
    const p: PlayerProjectile = {
      id: 'pp1', x: 0, y: 0, vx: 200, vy: 0, speed: 200, damage: 18, category: 'melee',
      pierceRemaining: 0, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    };
    m.spawnPlayerProjectile(p);
    m.update(1000);
    expect(enemy.hp).toBe(45 - 18);
    expect(m.player.hp).toBe(100);
    expect(m.playerProjectiles).toHaveLength(0);
  });

  it('有限穿透 (pierceRemaining 1) 命中 2 个敌人后移除', () => {
    const m = makeManager();
    const e1 = makeEnemy(50, 0, 10);
    const e2 = makeEnemy(80, 0, 10);
    const e3 = makeEnemy(110, 0, 10);
    m.addEnemy(e1); m.addEnemy(e2); m.addEnemy(e3);
    m.spawnPlayerProjectile({
      id: 'pp2', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 10, category: 'melee',
      pierceRemaining: 1, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    });
    m.update(400);
    expect(e1.hp).toBe(0);
    expect(e2.hp).toBe(0);
    expect(e3.hp).toBe(10);
    expect(m.playerProjectiles).toHaveLength(0);
  });

  it('无限穿透 (Infinity) 命中沿途所有敌人，存活至过期', () => {
    const m = makeManager();
    const e1 = makeEnemy(50, 0, 10);
    const e2 = makeEnemy(110, 0, 10);
    m.addEnemy(e1); m.addEnemy(e2);
    m.spawnPlayerProjectile({
      id: 'pp3', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 10, category: 'melee',
      pierceRemaining: Infinity, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
    });
    m.update(500);
    expect(e1.hp).toBe(0);
    expect(e2.hp).toBe(0);
    expect(m.playerProjectiles).toHaveLength(1);
  });

  it('投射物附带 burn debuff', () => {
    const m = makeManager();
    const e = makeEnemy(50, 0, 100);
    m.addEnemy(e);
    m.spawnPlayerProjectile({
      id: 'pp4', x: 0, y: 0, vx: 300, vy: 0, speed: 300, damage: 5, category: 'melee',
      pierceRemaining: 0, remainingMs: 2000, radius: 12, proceduralKind: 'bladeCrescent',
      debuff: { type: 'burn', dps: 8, remainingMs: 1000 },
    });
    m.update(200);
    expect(e.hp).toBeLessThan(100); // 命中 5 + burn
  });
});

describe('spawnPlayerZone — 玩家区域伤害敌人', () => {
  it('burst + DoT 伤害范围内敌人；followPlayer 跟随', () => {
    const m = makeManager();
    const enemy = makeEnemy(20, 0, 100);
    m.addEnemy(enemy);
    m.setPlayerPosition(20, 0);
    const z: PlayerZone = {
      id: 'pz1', shape: 'circle', x: 0, y: 0, radius: 60, burstDamage: 20, damagePerSecond: 10,
      category: 'aoe', remainingMs: 1000, applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: 'bloodWheel',
    };
    m.spawnPlayerZone(z);
    m.update(500);
    expect(enemy.hp).toBe(100 - 20 - 5); // burst 20 + DoT 10*0.5
    m.update(500);
    expect(enemy.hp).toBe(100 - 20 - 10);
    expect(m.playerZones).toHaveLength(0);
  });

  it('不跟随玩家的区域（粉笔爆弹）在固定位置爆炸', () => {
    const m = makeManager();
    m.setPlayerPosition(0, 0);
    const enemy = makeEnemy(100, 0, 100);
    m.addEnemy(enemy);
    const z: PlayerZone = {
      id: 'pz2', shape: 'circle', x: 100, y: 0, radius: 50, burstDamage: 25, damagePerSecond: 0,
      category: 'aoe', remainingMs: 100, applyDebuffOnce: false, debuffApplied: false,
      followPlayer: false, proceduralKind: 'chalkBomb',
    };
    m.spawnPlayerZone(z);
    m.update(100);
    expect(enemy.hp).toBe(75);
    expect(m.playerZones).toHaveLength(0);
  });
});

describe('pullEnemiesToward (锁链万锁绞杀)', () => {
  it('将范围内敌人向中心拉近', () => {
    const m = makeManager();
    const e = makeEnemy(150, 0, 100);
    m.addEnemy(e);
    m.pullEnemiesToward(0, 0, 180, 80);
    expect(e.x).toBeLessThan(150);
    expect(e.x).toBe(70); // 150 - 80
  });

  it('不拉近范围外敌人', () => {
    const m = makeManager();
    const e = makeEnemy(500, 0, 100);
    m.addEnemy(e);
    m.pullEnemiesToward(0, 0, 180, 80);
    expect(e.x).toBe(500);
  });
});

describe('killRandomEnemyInRadiusExcluding (万魂幡拘魂)', () => {
  it('秒杀范围内一个非排除种类敌人', () => {
    const m = makeManager();
    const a = makeEnemy(50, 0, 999);
    const b = makeEnemy(60, 0, 999);
    (b as { kind: EnemyKind }).kind = 'yangYunRed';
    m.addEnemy(a); m.addEnemy(b);
    const killed = m.killRandomEnemyInRadiusExcluding(0, 0, 600, ['yangYunRed']);
    expect(killed).not.toBeNull();
    expect(killed).toBe(a);
    expect(a.dead).toBe(true);
    expect(b.dead).toBe(false);
  });

  it('范围内只有排除种类时返回 null', () => {
    const m = makeManager();
    const elite = makeEnemy(50, 0, 320);
    (elite as { kind: EnemyKind }).kind = 'yangYunRed';
    m.addEnemy(elite);
    const killed = m.killRandomEnemyInRadiusExcluding(0, 0, 600, ['yangYunRed']);
    expect(killed).toBeNull();
    expect(elite.dead).toBe(false);
  });
});

describe('update 敌人 loop 状态门控 (plan 4 加法式)', () => {
  it('rooted 敌人跳过 AI update', () => {
    const m = makeManager();
    const mover = makeEnemy(100, 0, 100);
    let moved = false;
    Object.defineProperty(mover, 'update', { value: () => { moved = true; } });
    m.addEnemy(mover);
    mover.applyDebuff({ type: 'root', remainingMs: 5000 });
    m.update(100);
    expect(moved).toBe(false);
  });

  it('feared 敌人逃离源（不调用 AI update）', () => {
    const m = makeManager();
    const fleer = makeEnemy(100, 0, 100);
    Object.defineProperty(fleer, 'speed', { value: 60 });
    let aiCalled = false;
    Object.defineProperty(fleer, 'update', { value: () => { aiCalled = true; } });
    m.addEnemy(fleer);
    fleer.applyDebuff({ type: 'fear', remainingMs: 2000, sourceX: 0, sourceY: 0 });
    m.update(1000);
    expect(aiCalled).toBe(false);
    expect(fleer.x).toBeGreaterThan(100); // 远离 (0,0) → +x
  });

  it('无状态敌人行为不变（plan 3 回归）', () => {
    const m = makeManager();
    const e = makeEnemy(100, 0, 100);
    let updated = false;
    Object.defineProperty(e, 'update', { value: () => { updated = true; } });
    m.addEnemy(e);
    m.update(100);
    expect(updated).toBe(true);
  });
});

describe('getTimeMs', () => {
  it('随 update 递增', () => {
    const m = makeManager();
    expect(m.getTimeMs()).toBe(0);
    m.update(500);
    expect(m.getTimeMs()).toBe(500);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/combat-player-damage.test.ts`，确认编译错误（`PlayerProjectile`/`PlayerZone`/`damageEnemiesInFan` 等不存在；`ProceduralKind` 不含 `'bladeCrescent'` 等）。

### Step 3a: 扩展 ProceduralKind（Enemy.ts）

- [ ] 在 `src/tombraid/combat/Enemy.ts` 的 `ProceduralKind` 联合末尾（`'chairObstacle'` 之后）**加法式追加** 9 个武器特效种类：

```ts
/** 程序绘制种类（EnemyViewRenderer 据此分派绘制） */
export type ProceduralKind =
  | 'bloodHand'
  | 'floatingEye'
  | 'chalkDust'
  | 'danYuxuanOrb'      // 但宇轩头颅追踪弹
  | 'bloodEyeOrb'       // 血瞳头颅追踪弹
  | 'woodChip'          // 桌椅木屑
  | 'phoneRedCircle'    // 电话红圈预警
  | 'phoneExplosion'    // 电话爆炸
  | 'phoneRinging'      // 电话振铃区
  | 'screamWave'        // 秦浩睿尖叫波
  | 'floorCrackWave'    // 杨云红边地裂波
  | 'laserBeam'         // 漂浮眼球激光
  | 'chairObstacle'     // 桌椅落地椅子障碍
  // plan 4 武器特效（玩家侧投射物 & 区域）
  | 'rulerShard'        // 断尺尺屑（投射物）
  | 'chalkThrow'        // 粉笔投掷（投射物）
  | 'bladeCrescent'     // 灵刃月牙剑气（投射物）
  | 'chalkBomb'         // 粉笔爆弹（区域）
  | 'rulerStorm'        // 尺子风暴（区域）
  | 'fistDash'          // 拳套冲拳（区域）
  | 'chainCrush'        // 锁链万锁绞杀（区域）
  | 'bloodWheel'        // 血镰血轮（区域）
  | 'soulCapture';      // 万魂幡拘魂（区域）
```

### Step 3b: 加法式修改 CombatManager.ts — 新增接口 + 字段 + 方法

- [ ] 在 `src/tombraid/combat/CombatManager.ts` 顶部 import 块中，将 `DamageType` 的 import **追加** `type DamageCategory`（若未导入）：

```ts
import {
  PLAYER_CONTACT_DAMAGE_COOLDOWN_MS,
  WEAK_PUNCH_DAMAGE,
  type DamageCategory,
  type DamageInstance,
  type Debuff,
} from './DamageType';
```

- [ ] 在 `IsWalkableFn` / `CombatCallbacks` 定义之后、`CombatManager` 类之前，**加法式插入**玩家侧投射物/区域接口：

```ts
// ---------------------------------------------------------------------------
// plan 4: 玩家侧投射物 & 区域（武器系统）
// ---------------------------------------------------------------------------

/** 玩家投射物（武器普攻/大招生成，伤害敌人） */
export interface PlayerProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  damage: number;
  category: DamageCategory;
  debuff?: Debuff;
  pierceRemaining: number;   // 剩余可穿透数；0 = 命中 1 个后消失；Infinity = 无限穿透
  remainingMs: number;
  radius: number;
  proceduralKind: ProceduralKind;  // WeaponProjectileKind 之一
}

/** 玩家区域（武器大招生成，跟随玩家或固定位置） */
export interface PlayerZone {
  id: string;
  shape: 'circle';
  x: number;
  y: number;
  radius: number;
  burstDamage: number;        // 生成时对范围内敌人一次性伤害
  damagePerSecond: number;    // 持续 DoT
  category: DamageCategory;
  debuff?: Debuff;
  remainingMs: number;
  applyDebuffOnce: boolean;
  debuffApplied: boolean;
  followPlayer: boolean;      // true = 每帧跟随玩家位置（血轮/尺子风暴/拳套冲拳/万锁绞杀）
  proceduralKind: ProceduralKind;  // WeaponZoneKind 之一
}
```

- [ ] 在 `CombatManager` 类中，`zones` 字段之后**加法式新增**字段：

```ts
  readonly playerProjectiles: PlayerProjectile[] = [];
  readonly playerZones: PlayerZone[] = [];
```

- [ ] 在 `spawnZone` 方法之后，**加法式新增**玩家侧 spawn 方法 + 伤害 API：

```ts
  // ===========================================================================
  // plan 4: 玩家侧伤害 API（加法式，不修改既有 playerAttack/spawnProjectile/spawnZone）
  // ===========================================================================

  spawnPlayerProjectile(p: PlayerProjectile): void {
    this.playerProjectiles.push(p);
  }

  spawnPlayerZone(z: PlayerZone): void {
    z.debuffApplied = false;
    this.playerZones.push(z);
  }

  getTimeMs(): number {
    return this.timeMs;
  }

  /** 对扇形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血（用于吸血）。 */
  damageEnemiesInFan(
    originX: number, originY: number,
    dirX: number, dirY: number,
    range: number, halfAngle: number,
    instance: DamageInstance,
  ): number {
    if (this.player.isDead) return 0;
    let totalDealt = 0;
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    if (len === 0) return 0;
    const ux = dirX / len;
    const uy = dirY / len;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - originX;
      const dy = enemy.y - originY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range + enemy.contactRadius) continue;
      if (dist === 0) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
        continue;
      }
      const dot = (dx / dist) * ux + (dy / dist) * uy;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (Math.abs(normalizeAngle(angle)) <= halfAngle) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
      }
    }
    this.handleDeadEnemies();
    return totalDealt;
  }

  /** 对圆形范围内敌人造成伤害 + 可选 debuff。返回实际总扣血。 */
  damageEnemiesInCircle(
    cx: number, cy: number, radius: number,
    instance: DamageInstance,
  ): number {
    if (this.player.isDead) return 0;
    let totalDealt = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - cx, enemy.y - cy);
      if (dist <= radius + enemy.contactRadius) {
        totalDealt += this.applyDamageInstanceToEnemy(enemy, instance);
      }
    }
    this.handleDeadEnemies();
    return totalDealt;
  }

  /** 将范围内敌人向中心拉近 pullDistance（不超过中心）。 */
  pullEnemiesToward(cx: number, cy: number, radius: number, pullDistance: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = cx - enemy.x;
      const dy = cy - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + enemy.contactRadius || dist === 0) continue;
      const step = Math.min(pullDistance, dist);
      enemy.x += (dx / dist) * step;
      enemy.y += (dy / dist) * step;
    }
  }

  /** 秒杀范围内一个随机非排除种类敌人。返回被杀敌人或 null。 */
  killRandomEnemyInRadiusExcluding(
    cx: number, cy: number, radius: number,
    excludeKinds: readonly EnemyKind[],
  ): Enemy | null {
    const eligible = this.enemies.filter(
      (e) => !e.dead
        && !excludeKinds.includes(e.kind)
        && Math.hypot(e.x - cx, e.y - cy) <= radius + e.contactRadius,
    );
    if (eligible.length === 0) return null;
    const idx = Math.floor(this.rng.next() * eligible.length);
    const target = eligible[idx]!;
    target.hp = 0;
    target.dead = true;
    this.handleDeadEnemies();
    return target;
  }

  /** 对单个敌人应用伤害实例（amount + debuff）。amount<=0 时仍应用 debuff。返回实际扣血。 */
  private applyDamageInstanceToEnemy(enemy: Enemy, instance: DamageInstance): number {
    if (enemy.dead) return 0;
    let dealt = 0;
    if (instance.amount > 0) {
      const before = enemy.hp;
      enemy.applyDamage(instance);
      dealt = before - enemy.hp;
    }
    if (instance.debuff !== undefined) {
      enemy.applyDebuff(instance.debuff);
    }
    return dealt;
  }

  /** 子步进推进玩家投射物（避免高速穿透隧道）。 */
  private updatePlayerProjectiles(deltaMs: number): void {
    const maxStep = 8; // px per sub-step
    for (const p of this.playerProjectiles) {
      if (p.speed <= 0) {
        p.remainingMs -= deltaMs;
        continue;
      }
      const totalDist = p.speed * (deltaMs / 1000);
      const steps = Math.max(1, Math.ceil(totalDist / maxStep));
      const stepDist = totalDist / steps;
      const stepDt = deltaMs / steps;
      const ux = p.vx / p.speed;
      const uy = p.vy / p.speed;
      for (let s = 0; s < steps; s++) {
        p.x += ux * stepDist;
        p.y += uy * stepDist;
        p.remainingMs -= stepDt;
        for (const enemy of this.enemies) {
          if (enemy.dead) continue;
          if (p.pierceRemaining < 0) break;
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist <= p.radius + enemy.contactRadius) {
            this.applyDamageInstanceToEnemy(enemy, {
              amount: p.damage,
              category: p.category,
              ...(p.debuff !== undefined ? { debuff: p.debuff } : {}),
            });
            if (p.pierceRemaining === Infinity) continue;
            p.pierceRemaining -= 1;
          }
        }
        if (p.pierceRemaining < 0 || p.remainingMs <= 0) break;
      }
    }
    for (let i = this.playerProjectiles.length - 1; i >= 0; i--) {
      const p = this.playerProjectiles[i]!;
      if (p.remainingMs <= 0 || p.pierceRemaining < 0) {
        this.playerProjectiles.splice(i, 1);
      }
    }
  }

  /** 推进玩家区域（跟随玩家 / burst / DoT / debuff）。 */
  private updatePlayerZones(deltaMs: number): void {
    const pos = this.playerPosition;
    const seconds = deltaMs / 1000;
    for (const z of this.playerZones) {
      if (z.followPlayer) {
        z.x = pos.x;
        z.y = pos.y;
      }
      // burst 一次性
      if (!z.debuffApplied && (z.burstDamage > 0 || (z.applyDebuffOnce && z.debuff !== undefined))) {
        this.damageEnemiesInCircle(z.x, z.y, z.radius, {
          amount: z.burstDamage,
          category: z.category,
          ...(z.debuff !== undefined && z.applyDebuffOnce ? { debuff: z.debuff } : {}),
        });
        z.debuffApplied = true;
      }
      // DoT
      if (z.damagePerSecond > 0) {
        this.damageEnemiesInCircle(z.x, z.y, z.radius, {
          amount: z.damagePerSecond * seconds,
          category: z.category,
          ...(z.debuff !== undefined && !z.applyDebuffOnce ? { debuff: z.debuff } : {}),
        });
      }
      z.remainingMs -= deltaMs;
    }
    for (let i = this.playerZones.length - 1; i >= 0; i--) {
      if (this.playerZones[i]!.remainingMs <= 0) {
        this.playerZones.splice(i, 1);
      }
    }
  }

  /** feared 敌人逃离源（覆盖 AI movement）。 */
  private moveEnemyFleeing(enemy: Enemy, deltaMs: number, fleeFrom: { x: number; y: number }): void {
    const dx = enemy.x - fleeFrom.x;
    const dy = enemy.y - fleeFrom.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) {
      // 与源重合，随机方向逃离
      enemy.x += enemy.speed * (deltaMs / 1000);
      return;
    }
    const step = enemy.speed * (deltaMs / 1000);
    enemy.x += (dx / dist) * step;
    enemy.y += (dy / dist) * step;
  }
```

- [ ] 在文件底部（类之后）**加法式新增**模块级辅助函数：

```ts
/** 归一化角度到 [-π, π]。 */
function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
```

### Step 3c: 修改 CombatManager.update() — 敌人 loop 状态门控 + 玩家侧 tick

- [ ] 在 `update(deltaMs)` 方法中，将既有敌人 loop（plan 3 步骤 2）：

```ts
    // 2. 敌人 AI 更新
    const ctx = this.makeContext();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.invulnMs > 0) enemy.invulnMs = Math.max(0, enemy.invulnMs - deltaMs);
      if (enemy.contactCooldownMs > 0) {
        enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
      }
      enemy.update(deltaMs, ctx);
    }
```

**替换为**（加法式插入状态门控）：

```ts
    // 2. 敌人 AI 更新（plan 4: 状态门控 — stun/root 跳过 AI，fear 逃离覆盖）
    const ctx = this.makeContext();
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (enemy.invulnMs > 0) enemy.invulnMs = Math.max(0, enemy.invulnMs - deltaMs);
      if (enemy.contactCooldownMs > 0) {
        enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs);
      }
      enemy.tickStatus(deltaMs);
      if (enemy.dead) continue;
      if (enemy.isStunned() || enemy.isRooted()) continue;
      const fleeFrom = enemy.getFleeFrom();
      if (fleeFrom !== null) {
        this.moveEnemyFleeing(enemy, deltaMs, fleeFrom);
        continue;
      }
      enemy.update(deltaMs, ctx);
    }
```

- [ ] 在 `update(deltaMs)` 的步骤 4 `this.updateZones(deltaMs);` 之后、步骤 5 `this.applyContactDamage(deltaMs);` 之前，**插入**：

```ts
    // 4b. plan 4: 玩家侧投射物 & 区域推进
    this.updatePlayerProjectiles(deltaMs);
    this.updatePlayerZones(deltaMs);
```

> **零回归保证**：plan 3 敌人无状态 → `tickStatus` no-op、`isStunned`/`isRooted` false、`getFleeFrom` null → 敌人 loop 行为与 plan 3 完全一致。`playerProjectiles`/`playerZones` 初始空 → `updatePlayerProjectiles`/`updatePlayerZones` 空转。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/combat-player-damage.test.ts`，确认全部通过。
- [ ] 运行 `npx vitest run src/tests/tombraid/combat/`，确认 plan 3 既有测试无回归。

### Step 5: commit

- [ ] `git add src/tombraid/combat/Enemy.ts src/tombraid/combat/CombatManager.ts src/tests/tombraid/weapons/combat-player-damage.test.ts && git commit -m "feat(tombraid): plan4 task2 ProceduralKind +9 + CombatManager 玩家侧伤害 API"`

---

## Task 3: WeaponRegistry.ts — 8 把武器定义 + 查表

**目标**：定义 `WeaponId`（8 值联合，不含 unarmed）、`WeaponRarity`、特效种类联合（`WeaponProjectileKind` / `WeaponZoneKind` / `MeleeFlashKind`）、`WeaponBasicAttack`（判别联合 meleeFan | rangedPiercing）、`WeaponUltimate`（判别联合 8 种）、`WeaponDef`、8 把武器定义、查表函数。纯 TS，无 Phaser。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-registry.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import {
  ALL_WEAPONS,
  WEAPON_IDS,
  getWeapon,
  listWeaponsByRarity,
  type WeaponDef,
  type WeaponId,
  type WeaponRarity,
} from '../../../tombraid/weapons/WeaponRegistry';

describe('WeaponRegistry — 8 把武器 (spec §4)', () => {
  it('ALL_WEAPONS 恰好 8 把', () => {
    expect(ALL_WEAPONS).toHaveLength(8);
  });

  it('WEAPON_IDS 恰好 8 个', () => {
    expect(WEAPON_IDS).toHaveLength(8);
  });

  it('稀有度计数：紫 2 / 绿 3 / 金 2 / 白 1', () => {
    expect(listWeaponsByRarity('purple')).toHaveLength(2);
    expect(listWeaponsByRarity('green')).toHaveLength(3);
    expect(listWeaponsByRarity('gold')).toHaveLength(2);
    expect(listWeaponsByRarity('white')).toHaveLength(1);
  });

  it('getWeapon 返回定义；未知 id 返回 null', () => {
    expect(getWeapon('weapon.ruler')).not.toBeNull();
    expect(getWeapon('weapon.unarmed' as WeaponId)).toBeNull();
  });

  it('断尺 weapon.brokenRuler (紫阶, sanity 85)', () => {
    const w = getWeapon('weapon.brokenRuler')!;
    expect(w.name).toBe('断尺');
    expect(w.rarity).toBe('purple');
    expect(w.sanityValue).toBe(85);
    expect(w.basic.kind).toBe('meleeFan');
    expect(w.basic.damage).toBe(8);
    expect(w.basic.attacksPerSecond).toBe(1.8);
    expect(w.ultimate.kind).toBe('scatterShards');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.shardCount).toBe(6);
    expect(w.ultimate.damage).toBe(4);
  });

  it('粉笔 weapon.chalk (紫阶, sanity 70, ranged pierce 1)', () => {
    const w = getWeapon('weapon.chalk')!;
    expect(w.name).toBe('粉笔');
    expect(w.sanityValue).toBe(70);
    expect(w.basic.kind).toBe('rangedPiercing');
    expect(w.basic.damage).toBe(6);
    expect(w.basic.attacksPerSecond).toBe(2);
    expect(w.basic.pierceCount).toBe(1);
    expect(w.ultimate.kind).toBe('chalkBombAoe');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.damage).toBe(25);
  });

  it('尺子 weapon.ruler (绿阶, sanity 130, textureKey prop.ruler)', () => {
    const w = getWeapon('weapon.ruler')!;
    expect(w.name).toBe('尺子');
    expect(w.rarity).toBe('green');
    expect(w.sanityValue).toBe(130);
    expect(w.textureKey).toBe('prop.ruler');
    expect(w.basic.kind).toBe('meleeFan');
    expect(w.basic.damage).toBe(15);
    expect(w.basic.attacksPerSecond).toBe(1.5);
    expect(w.ultimate.kind).toBe('rulerStorm');
    expect(w.ultimate.cooldownMs).toBe(20000);
  });

  it('灵刃 weapon.spiritBlade (绿阶, sanity 200, ranged pierce Infinity)', () => {
    const w = getWeapon('weapon.spiritBlade')!;
    expect(w.name).toBe('灵刃');
    expect(w.sanityValue).toBe(200);
    expect(w.basic.kind).toBe('rangedPiercing');
    expect(w.basic.damage).toBe(18);
    expect(w.basic.attacksPerSecond).toBe(1.2);
    expect(w.basic.pierceCount).toBe(Infinity);
    expect(w.ultimate.kind).toBe('bladeArray');
    expect(w.ultimate.cooldownMs).toBe(25000);
  });

  it('拳套 weapon.fistGauntlet (绿阶, sanity 170, meleeFan 10×3, fistDash 无敌)', () => {
    const w = getWeapon('weapon.fistGauntlet')!;
    expect(w.name).toBe('拳套');
    expect(w.sanityValue).toBe(170);
    expect(w.basic.kind).toBe('meleeFan');
    expect(w.basic.damage).toBe(3);
    expect(w.basic.hitsPerAttack).toBe(10);
    expect(w.basic.attacksPerSecond).toBe(2);
    expect(w.ultimate.kind).toBe('fistDash');
    expect(w.ultimate.cooldownMs).toBe(22000);
    expect(w.ultimate.totalDamage).toBe(80);
    expect(w.ultimate.invincibleMs).toBeGreaterThan(0);
  });

  it('锁链 weapon.chain (金阶, sanity 420, meleeFan 25 大范围, chainCrush root)', () => {
    const w = getWeapon('weapon.chain')!;
    expect(w.name).toBe('锁链');
    expect(w.rarity).toBe('gold');
    expect(w.sanityValue).toBe(420);
    expect(w.basic.damage).toBe(25);
    expect(w.basic.attacksPerSecond).toBe(1);
    expect(w.ultimate.kind).toBe('chainCrush');
    expect(w.ultimate.cooldownMs).toBe(25000);
    expect(w.ultimate.rootMs).toBe(2000);
  });

  it('血镰 weapon.bloodScythe (金阶, sanity 550, lifesteal 10%, bloodWheel)', () => {
    const w = getWeapon('weapon.bloodScythe')!;
    expect(w.name).toBe('血镰');
    expect(w.sanityValue).toBe(550);
    expect(w.basic.damage).toBe(40);
    expect(w.basic.attacksPerSecond).toBe(0.8);
    expect(w.basic.lifestealPercent).toBe(10);
    expect(w.ultimate.kind).toBe('bloodWheel');
    expect(w.ultimate.cooldownMs).toBe(25000);
    expect(w.ultimate.damagePerSecond).toBe(50);
    expect(w.ultimate.durationMs).toBe(3000);
  });

  it('万魂幡 weapon.soulBanner (白阶, sanity 1200, fear 20%, soulCapture CD 120s)', () => {
    const w = getWeapon('weapon.soulBanner')!;
    expect(w.name).toBe('万魂幡');
    expect(w.rarity).toBe('white');
    expect(w.sanityValue).toBe(1200);
    expect(w.basic.damage).toBe(20);
    expect(w.basic.fearProcPercent).toBe(20);
    expect(w.basic.fearDurationMs).toBe(2000);
    expect(w.ultimate.kind).toBe('soulCapture');
    expect(w.ultimate.cooldownMs).toBe(120000);
    expect(w.ultimate.captureRadius).toBe(600);
    expect(w.ultimate.excludeKinds).toContain('yangYunRed');
  });

  it('所有武器 id 唯一', () => {
    const ids = ALL_WEAPONS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('尺子有贴图，其余 7 把 textureKey null（程序绘制）', () => {
    const ruler = getWeapon('weapon.ruler')!;
    expect(ruler.textureKey).toBe('prop.ruler');
    const others = ALL_WEAPONS.filter((w) => w.id !== 'weapon.ruler');
    for (const w of others) {
      expect(w.textureKey).toBeNull();
    }
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-registry.test.ts`，确认模块不存在。

### Step 3: 实现 WeaponRegistry.ts

- [ ] 创建 `src/tombraid/weapons/WeaponRegistry.ts`：

```ts
// src/tombraid/weapons/WeaponRegistry.ts
// 8 把武器定义 + 查表。纯 TS，无 Phaser import。
// spec §4
import type { DamageCategory } from '../combat/DamageType';
import type { EnemyKind, ProceduralKind } from '../combat/Enemy';

// ---------------------------------------------------------------------------
// WeaponId & WeaponRarity
// ---------------------------------------------------------------------------
export type WeaponId =
  | 'weapon.brokenRuler'
  | 'weapon.chalk'
  | 'weapon.ruler'
  | 'weapon.spiritBlade'
  | 'weapon.fistGauntlet'
  | 'weapon.chain'
  | 'weapon.bloodScythe'
  | 'weapon.soulBanner';

export type WeaponRarity = 'purple' | 'green' | 'gold' | 'white';

// ---------------------------------------------------------------------------
// 特效种类（ProceduralKind 子集 + 近战闪光独立种类）
// ---------------------------------------------------------------------------
export type WeaponProjectileKind = 'rulerShard' | 'chalkThrow' | 'bladeCrescent';
export type WeaponZoneKind =
  | 'chalkBomb' | 'rulerStorm' | 'fistDash' | 'chainCrush' | 'bloodWheel' | 'soulCapture';
export type MeleeFlashKind =
  | 'brokenRulerSlash' | 'rulerSlash' | 'fistCombo'
  | 'chainWhip' | 'bloodScytheSlash' | 'soulBannerSlash';

// ---------------------------------------------------------------------------
// 普攻（判别联合）
// ---------------------------------------------------------------------------
export interface MeleeFanBasic {
  readonly kind: 'meleeFan';
  readonly damage: number;
  readonly attacksPerSecond: number;
  readonly range: number;
  readonly halfAngle: number;       // 弧度
  readonly hitsPerAttack: number;   // 拳套 10，其余 1
  readonly category: DamageCategory;
  readonly lifestealPercent: number;  // 血镰 10，其余 0
  readonly fearProcPercent: number;   // 万魂幡 20，其余 0
  readonly fearDurationMs: number;    // 万魂幡 2000，其余 0
  readonly effectKind: MeleeFlashKind;
}

export interface RangedPiercingBasic {
  readonly kind: 'rangedPiercing';
  readonly damage: number;
  readonly attacksPerSecond: number;
  readonly range: number;           // 投射物射程
  readonly pierceCount: number;     // 粉笔 1，灵刃 Infinity
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly category: DamageCategory;
  readonly effectKind: WeaponProjectileKind;
}

export type WeaponBasicAttack = MeleeFanBasic | RangedPiercingBasic;

// ---------------------------------------------------------------------------
// 大招（判别联合 8 种）
// ---------------------------------------------------------------------------
export interface ScatterShardsUlt {
  readonly kind: 'scatterShards';    // 断尺尺屑散射
  readonly cooldownMs: number;
  readonly shardCount: number;
  readonly damage: number;
  readonly spreadHalfAngle: number;  // 弧度
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly effectKind: WeaponProjectileKind;
}

export interface ChalkBombAoeUlt {
  readonly kind: 'chalkBombAoe';     // 粉笔爆弹
  readonly cooldownMs: number;
  readonly damage: number;
  readonly radius: number;
  readonly effectKind: WeaponZoneKind;
}

export interface RulerStormUlt {
  readonly kind: 'rulerStorm';       // 尺子风暴
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly damagePerSecond: number;
  readonly radius: number;
  readonly effectKind: WeaponZoneKind;
}

export interface BladeArrayUlt {
  readonly kind: 'bladeArray';       // 灵刃万刃阵
  readonly cooldownMs: number;
  readonly damage: number;
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly pierceCount: number;
  readonly effectKind: WeaponProjectileKind;
}

export interface FistDashUlt {
  readonly kind: 'fistDash';         // 拳套霸体冲拳
  readonly cooldownMs: number;
  readonly totalDamage: number;
  readonly durationMs: number;
  readonly radius: number;
  readonly invincibleMs: number;
  readonly effectKind: WeaponZoneKind;
}

export interface ChainCrushUlt {
  readonly kind: 'chainCrush';       // 锁链万锁绞杀
  readonly cooldownMs: number;
  readonly pullRadius: number;
  readonly pullDistance: number;
  readonly rootMs: number;
  readonly durationMs: number;
  readonly damagePerSecond: number;
  readonly effectKind: WeaponZoneKind;
}

export interface BloodWheelUlt {
  readonly kind: 'bloodWheel';       // 血镰血轮
  readonly cooldownMs: number;
  readonly durationMs: number;
  readonly damagePerSecond: number;
  readonly radius: number;
  readonly effectKind: WeaponZoneKind;
}

export interface SoulCaptureUlt {
  readonly kind: 'soulCapture';      // 万魂幡拘魂
  readonly cooldownMs: number;
  readonly captureRadius: number;
  readonly excludeKinds: readonly EnemyKind[];
  readonly effectKind: WeaponZoneKind;
}

export type WeaponUltimate =
  | ScatterShardsUlt
  | ChalkBombAoeUlt
  | RulerStormUlt
  | BladeArrayUlt
  | FistDashUlt
  | ChainCrushUlt
  | BloodWheelUlt
  | SoulCaptureUlt;

// ---------------------------------------------------------------------------
// WeaponDef
// ---------------------------------------------------------------------------
export interface WeaponDef {
  readonly id: WeaponId;
  readonly name: string;
  readonly rarity: WeaponRarity;
  readonly sanityValue: number;
  readonly textureKey: string | null;   // null = 程序绘制
  readonly basic: WeaponBasicAttack;
  readonly ultimate: WeaponUltimate;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// 8 把武器定义 (spec §4)
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;

export const ALL_WEAPONS: readonly WeaponDef[] = [
  // -- 紫阶 (2) --
  {
    id: 'weapon.brokenRuler',
    name: '断尺',
    rarity: 'purple',
    sanityValue: 85,
    textureKey: null,
    basic: {
      kind: 'meleeFan', damage: 8, attacksPerSecond: 1.8, range: 60, halfAngle: 45 * DEG,
      hitsPerAttack: 1, category: 'physical', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'brokenRulerSlash',
    },
    ultimate: {
      kind: 'scatterShards', cooldownMs: 22000, shardCount: 6, damage: 4,
      spreadHalfAngle: 60 * DEG, projectileSpeed: 320, projectileRadius: 8,
      effectKind: 'rulerShard',
    },
    description: '断裂的塑料尺，挥砍如刃。大招散射六枚尺屑。',
  },
  {
    id: 'weapon.chalk',
    name: '粉笔',
    rarity: 'purple',
    sanityValue: 70,
    textureKey: null,
    basic: {
      kind: 'rangedPiercing', damage: 6, attacksPerSecond: 2, range: 320, pierceCount: 1,
      projectileSpeed: 320, projectileRadius: 8, category: 'physical', effectKind: 'chalkThrow',
    },
    ultimate: {
      kind: 'chalkBombAoe', cooldownMs: 22000, damage: 25, radius: 90, effectKind: 'chalkBomb',
    },
    description: '投掷粉笔穿透一人。大招引爆粉笔爆弹。',
  },
  // -- 绿阶 (3) --
  {
    id: 'weapon.ruler',
    name: '尺子',
    rarity: 'green',
    sanityValue: 130,
    textureKey: 'prop.ruler',
    basic: {
      kind: 'meleeFan', damage: 15, attacksPerSecond: 1.5, range: 80, halfAngle: 50 * DEG,
      hitsPerAttack: 1, category: 'physical', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'rulerSlash',
    },
    ultimate: {
      kind: 'rulerStorm', cooldownMs: 20000, durationMs: 2000, damagePerSecond: 30,
      radius: 110, effectKind: 'rulerStorm',
    },
    description: '完整的尺子，扇形挥砍。大招召唤尺子风暴。',
  },
  {
    id: 'weapon.spiritBlade',
    name: '灵刃',
    rarity: 'green',
    sanityValue: 200,
    textureKey: null,
    basic: {
      kind: 'rangedPiercing', damage: 18, attacksPerSecond: 1.2, range: 400, pierceCount: Infinity,
      projectileSpeed: 380, projectileRadius: 14, category: 'physical', effectKind: 'bladeCrescent',
    },
    ultimate: {
      kind: 'bladeArray', cooldownMs: 25000, damage: 18, projectileSpeed: 380,
      projectileRadius: 14, pierceCount: Infinity, effectKind: 'bladeCrescent',
    },
    description: '灵力凝成的月牙剑气，穿透一切。大招万刃阵八方向齐射。',
  },
  {
    id: 'weapon.fistGauntlet',
    name: '拳套',
    rarity: 'green',
    sanityValue: 170,
    textureKey: null,
    basic: {
      kind: 'meleeFan', damage: 3, attacksPerSecond: 2, range: 50, halfAngle: 45 * DEG,
      hitsPerAttack: 10, category: 'physical', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'fistCombo',
    },
    ultimate: {
      kind: 'fistDash', cooldownMs: 22000, totalDamage: 80, durationMs: 1200, radius: 70,
      invincibleMs: 1200, effectKind: 'fistDash',
    },
    description: '快速连击拳套，十连击。大招霸体冲拳无敌突进。',
  },
  // -- 金阶 (2) --
  {
    id: 'weapon.chain',
    name: '锁链',
    rarity: 'gold',
    sanityValue: 420,
    textureKey: null,
    basic: {
      kind: 'meleeFan', damage: 25, attacksPerSecond: 1, range: 120, halfAngle: 70 * DEG,
      hitsPerAttack: 1, category: 'physical', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'chainWhip',
    },
    ultimate: {
      kind: 'chainCrush', cooldownMs: 25000, pullRadius: 180, pullDistance: 80, rootMs: 2000,
      durationMs: 2000, damagePerSecond: 25, effectKind: 'chainCrush',
    },
    description: '中距离链鞭大范围挥击。大招万锁绞杀群拉缚身。',
  },
  {
    id: 'weapon.bloodScythe',
    name: '血镰',
    rarity: 'gold',
    sanityValue: 550,
    textureKey: null,
    basic: {
      kind: 'meleeFan', damage: 40, attacksPerSecond: 0.8, range: 110, halfAngle: 70 * DEG,
      hitsPerAttack: 1, category: 'physical', lifestealPercent: 10, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'bloodScytheSlash',
    },
    ultimate: {
      kind: 'bloodWheel', cooldownMs: 25000, durationMs: 3000, damagePerSecond: 50,
      radius: 130, effectKind: 'bloodWheel',
    },
    description: '大范围血镰挥斩，吸血 10%。大招血轮周身旋转。',
  },
  // -- 白阶 (1) --
  {
    id: 'weapon.soulBanner',
    name: '万魂幡',
    rarity: 'white',
    sanityValue: 1200,
    textureKey: null,
    basic: {
      kind: 'meleeFan', damage: 20, attacksPerSecond: 1, range: 90, halfAngle: 55 * DEG,
      hitsPerAttack: 1, category: 'physical', lifestealPercent: 0, fearProcPercent: 20,
      fearDurationMs: 2000, effectKind: 'soulBannerSlash',
    },
    ultimate: {
      kind: 'soulCapture', cooldownMs: 120000, captureRadius: 600,
      excludeKinds: ['yangYunRed'], effectKind: 'soulCapture',
    },
    description: '万魂幡挥斩，20% 概率恐惧。大招拘魂秒杀一敌。',
  },
];

export const WEAPON_IDS: readonly WeaponId[] = ALL_WEAPONS.map((w) => w.id);

// ---------------------------------------------------------------------------
// 查表
// ---------------------------------------------------------------------------
const WEAPON_MAP: ReadonlyMap<string, WeaponDef> = new Map(ALL_WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponDef | null {
  return WEAPON_MAP.get(id) ?? null;
}

export function listWeaponsByRarity(rarity: WeaponRarity): readonly WeaponDef[] {
  return ALL_WEAPONS.filter((w) => w.rarity === rarity);
}

// 类型守卫：判断 ProceduralKind 是否为武器投射物种类
export function isWeaponProjectileKind(kind: ProceduralKind): kind is WeaponProjectileKind {
  return kind === 'rulerShard' || kind === 'chalkThrow' || kind === 'bladeCrescent';
}

export function isWeaponZoneKind(kind: ProceduralKind): kind is WeaponZoneKind {
  return kind === 'chalkBomb' || kind === 'rulerStorm' || kind === 'fistDash'
    || kind === 'chainCrush' || kind === 'bloodWheel' || kind === 'soulCapture';
}
```

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-registry.test.ts`，确认全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/weapons/WeaponRegistry.ts src/tests/tombraid/weapons/weapon-registry.test.ts && git commit -m "feat(tombraid): plan4 task3 WeaponRegistry 8 把武器定义"`

---

## Task 4: WeaponEffect.ts — 程序绘制特效

**目标**：用 Phaser Graphics（type-only import，编译期擦除）+ UI_THEME 配色为每种武器特效种类提供程序绘制函数（3 投射物 + 6 区域 + 6 近战闪光）。测试用 mock Graphics 断言关键调用。

> **import 安全性**：`import type { Graphics } from 'phaser'` 为类型导入，运行时擦除。UI_THEME 来自 `src/ui/uiTheme.ts`，其顶部 `import Phaser from 'phaser'` 在 jsdom 下可加载——现有 `src/tests/narrative-ui.test.ts` 已 `import { UI_THEME }`（传递加载 Phaser）且为已合并的强制 TDD 测试，证明此模式可工作。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-effect.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Graphics } from 'phaser';

import { UI_THEME } from '../../ui/uiTheme';
import {
  drawWeaponProjectile,
  drawWeaponZone,
  drawMeleeFlash,
} from '../../../tombraid/weapons/WeaponEffect';

function makeMockGraphics(): Graphics & { calls: string[] } {
  const calls: string[] = [];
  const mock = {
    calls,
    clear: () => { calls.push('clear'); },
    lineStyle: (w: number, c: number, a?: number) => { calls.push(`lineStyle:${w},${c},${a}`); },
    fillStyle: (c: number, a?: number) => { calls.push(`fillStyle:${c},${a}`); },
    beginPath: () => { calls.push('beginPath'); },
    lineBetween: (x1: number, y1: number, x2: number, y2: number) => { calls.push(`lineBetween:${x1},${y1},${x2},${y2}`); },
    strokeCircle: (x: number, y: number, r: number) => { calls.push(`strokeCircle:${x},${y},${r}`); },
    fillCircle: (x: number, y: number, r: number) => { calls.push(`fillCircle:${x},${y},${r}`); },
    fillRect: (x: number, y: number, w: number, h: number) => { calls.push(`fillRect:${x},${y},${w},${h}`); },
    fillTriangle: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => { calls.push(`fillTriangle`); },
    strokePath: () => { calls.push('strokePath'); },
    arc: (x: number, y: number, r: number, s: number, e: number) => { calls.push(`arc:${x},${y},${r}`); },
    moveTo: (x: number, y: number) => { calls.push(`moveTo:${x},${y}`); },
    lineTo: (x: number, y: number) => { calls.push(`lineTo:${x},${y}`); },
  };
  return mock as unknown as Graphics & { calls: string[] };
}

describe('drawWeaponProjectile (plan 4)', () => {
  it('bladeCrescent 使用 borderBlue 配色 + fillCircle', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'bladeCrescent', 100, 200, 0, 14);
    expect(g.calls).toContain('clear');
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.borderBlue}`))).toBe(true);
    expect(g.calls.some((c) => c.startsWith('fillCircle:100,200,14'))).toBe(true);
  });

  it('chalkThrow 使用白色配色', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'chalkThrow', 0, 0, 0, 8);
    expect(g.calls.some((c) => c.startsWith('fillCircle:0,0,8'))).toBe(true);
  });

  it('rulerShard 使用 gold 配色', () => {
    const g = makeMockGraphics();
    drawWeaponProjectile(g, 'rulerShard', 50, 50, 1.5, 8);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.gold}`))).toBe(true);
  });
});

describe('drawWeaponZone (plan 4)', () => {
  it('bloodWheel 使用 accent 红色 + strokeCircle', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'bloodWheel', 0, 0, 130, 0.6);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.accent}`))).toBe(true);
    expect(g.calls.some((c) => c.startsWith('strokeCircle:0,0,130'))).toBe(true);
  });

  it('rulerStorm 使用 gold 配色', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'rulerStorm', 10, 20, 110, 0.5);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.gold}`))).toBe(true);
  });

  it('soulCapture 使用 accent + gold 双色', () => {
    const g = makeMockGraphics();
    drawWeaponZone(g, 'soulCapture', 0, 0, 600, 0.4);
    expect(g.calls.some((c) => c.startsWith(`fillStyle:${UI_THEME.colors.accent}`))).toBe(true);
  });

  it('chalkBomb / fistDash / chainCrush 均可绘制不抛错', () => {
    const g = makeMockGraphics();
    expect(() => drawWeaponZone(g, 'chalkBomb', 0, 0, 90, 0.7)).not.toThrow();
    expect(() => drawWeaponZone(g, 'fistDash', 0, 0, 70, 0.7)).not.toThrow();
    expect(() => drawWeaponZone(g, 'chainCrush', 0, 0, 180, 0.7)).not.toThrow();
  });
});

describe('drawMeleeFlash (plan 4)', () => {
  it('rulerSlash 绘制扇形弧线', () => {
    const g = makeMockGraphics();
    drawMeleeFlash(g, 'rulerSlash', 0, 0, 1, 0, 80, Math.PI / 4, 0.5);
    expect(g.calls).toContain('clear');
    expect(g.calls.some((c) => c.startsWith(`lineStyle:`))).toBe(true);
  });

  it('所有近战闪光种类可绘制不抛错', () => {
    const g = makeMockGraphics();
    const kinds = ['brokenRulerSlash', 'rulerSlash', 'fistCombo', 'chainWhip', 'bloodScytheSlash', 'soulBannerSlash'] as const;
    for (const k of kinds) {
      expect(() => drawMeleeFlash(g, k, 0, 0, 1, 0, 60, Math.PI / 4, 0.5)).not.toThrow();
    }
  });

  it('bloodScytheSlash 使用 accent 配色', () => {
    const g = makeMockGraphics();
    drawMeleeFlash(g, 'bloodScytheSlash', 0, 0, 1, 0, 110, Math.PI / 3, 0.6);
    expect(g.calls.some((c) => c.startsWith(`lineStyle:`) && c.includes(`${UI_THEME.colors.accent}`))).toBe(true);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-effect.test.ts`，确认模块不存在。

### Step 3: 实现 WeaponEffect.ts

- [ ] 创建 `src/tombraid/weapons/WeaponEffect.ts`：

```ts
// src/tombraid/weapons/WeaponEffect.ts
// 程序绘制武器特效（Phaser Graphics + UI_THEME 配色）。
// import type { Graphics } 为类型导入，编译期擦除，不影响 jsdom 测试。
import type { Graphics } from 'phaser';

import { UI_THEME } from '../../ui/uiTheme';
import type {
  MeleeFlashKind,
  WeaponProjectileKind,
  WeaponZoneKind,
} from './WeaponRegistry';

// UI_THEME 中字符串色（text 等）无法直接用于 Graphics（需数字）；用数字色。
const CHALK_WHITE = 0xf4efe6; // 镜像 UI_THEME.colors.text 的数值

// ---------------------------------------------------------------------------
// 投射物绘制
// ---------------------------------------------------------------------------
export function drawWeaponProjectile(
  g: Graphics,
  kind: WeaponProjectileKind,
  x: number,
  y: number,
  angle: number,
  radius: number,
): void {
  g.clear();
  switch (kind) {
    case 'bladeCrescent': {
      g.fillStyle(UI_THEME.colors.borderBlue, 0.85);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, CHALK_WHITE, 0.7);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.borderBlue, 0.8);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * radius * 2.2, y + Math.sin(angle) * radius * 2.2);
      g.strokePath();
      break;
    }
    case 'chalkThrow': {
      g.fillStyle(CHALK_WHITE, 0.9);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.6);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'rulerShard': {
      g.fillStyle(UI_THEME.colors.gold, 0.9);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.accent, 0.8);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.7);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(angle) * radius * 2, y + Math.sin(angle) * radius * 2);
      g.strokePath();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 区域绘制
// ---------------------------------------------------------------------------
export function drawWeaponZone(
  g: Graphics,
  kind: WeaponZoneKind,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  g.clear();
  switch (kind) {
    case 'bloodWheel': {
      g.fillStyle(UI_THEME.colors.accent, alpha * 0.4);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.accentHover, alpha * 0.8);
      g.strokeCircle(x, y, radius * 0.7);
      break;
    }
    case 'rulerStorm': {
      g.fillStyle(UI_THEME.colors.gold, alpha * 0.3);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.gold, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, alpha * 0.6);
      g.strokeCircle(x, y, radius * 0.5);
      break;
    }
    case 'soulCapture': {
      g.fillStyle(UI_THEME.colors.accent, alpha * 0.2);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.thin, UI_THEME.colors.gold, alpha * 0.7);
      g.strokeCircle(x, y, radius * 0.4);
      break;
    }
    case 'chalkBomb': {
      g.fillStyle(CHALK_WHITE, alpha * 0.35);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.borderMuted, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'fistDash': {
      g.fillStyle(UI_THEME.colors.gold, alpha * 0.4);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.accent, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
    case 'chainCrush': {
      g.fillStyle(UI_THEME.colors.border, alpha * 0.35);
      g.fillCircle(x, y, radius);
      g.lineStyle(UI_THEME.stroke.medium, UI_THEME.colors.gold, alpha);
      g.strokeCircle(x, y, radius);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// 近战闪光绘制（扇形弧线 + 填充三角）
// ---------------------------------------------------------------------------
export function drawMeleeFlash(
  g: Graphics,
  kind: MeleeFlashKind,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  range: number,
  halfAngle: number,
  progress: number, // 0..1 动画进度
): void {
  g.clear();
  const color = meleeFlashColor(kind);
  const alpha = 0.7 * (1 - progress);
  g.fillStyle(color, alpha * 0.3);
  g.lineStyle(UI_THEME.stroke.medium, color, alpha);
  const baseAngle = Math.atan2(dirY, dirX);
  const a1 = baseAngle - halfAngle;
  const a2 = baseAngle + halfAngle;
  g.beginPath();
  g.moveTo(originX, originY);
  g.arc(originX, originY, range, a1, a2);
  g.lineTo(originX, originY);
  g.fillPath ? g.fillPath() : g.strokePath();
  g.strokePath();
}

function meleeFlashColor(kind: MeleeFlashKind): number {
  switch (kind) {
    case 'brokenRulerSlash':
    case 'rulerSlash':
      return UI_THEME.colors.gold;
    case 'fistDash':
    case 'fistCombo':
      return UI_THEME.colors.gold;
    case 'chainWhip':
      return UI_THEME.colors.border;
    case 'bloodScytheSlash':
      return UI_THEME.colors.accent;
    case 'soulBannerSlash':
      return UI_THEME.colors.accent;
  }
}
```

> **注意**：`g.fillPath()` 在 Phaser 4 Graphics 上存在；测试 mock 未提供时用 `g.fillPath ? g.fillPath() : g.strokePath()` 防御。实际场景传入真实 Graphics 时 `fillPath` 可用。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-effect.test.ts`，确认全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/weapons/WeaponEffect.ts src/tests/tombraid/weapons/weapon-effect.test.ts && git commit -m "feat(tombraid): plan4 task4 WeaponEffect 程序绘制特效"`

---

## Task 5: PlayerCombat 无敌态 — 加法式修改 PlayerCombat.ts

**目标**：为 plan 3 的 `PlayerCombat` 加法式新增无敌态（`invincibleMs` / `setInvincible` / `isInvincible`），供拳套霸体冲拳大招使用。在 `takeDamage` 顶部加 early-return 守卫；在 `tick` 中递减。默认 `invincibleMs = 0` → `isInvincible()` 恒 false → plan 3 零回归。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/player-invincibility.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { PLAYER_MAX_HP } from '../../../tombraid/combat/DamageType';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';

describe('PlayerCombat 无敌态 (plan 4 加法式)', () => {
  it('初始 isInvincible false', () => {
    const p = new PlayerCombat();
    expect(p.isInvincible()).toBe(false);
  });

  it('setInvincible 后 takeDamage 不扣血', () => {
    const p = new PlayerCombat();
    p.setInvincible(1200);
    expect(p.isInvincible()).toBe(true);
    p.takeDamage({ amount: 99, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP);
  });

  it('tick 递减 invincibleMs，过期后可受伤', () => {
    const p = new PlayerCombat();
    p.setInvincible(1000);
    p.tick(500);
    expect(p.isInvincible()).toBe(true);
    p.takeDamage({ amount: 30, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP); // 仍无敌
    p.tick(500);
    expect(p.isInvincible()).toBe(false);
    p.takeDamage({ amount: 30, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP - 30);
  });

  it('setInvincible 取最长（不缩短既有无敌）', () => {
    const p = new PlayerCombat();
    p.setInvincible(2000);
    p.setInvincible(500); // 不缩短
    p.tick(1000);
    expect(p.isInvincible()).toBe(true);
  });

  it('无敌态不阻止 heal', () => {
    const p = new PlayerCombat();
    p.takeDamage({ amount: 30, category: 'melee' });
    p.setInvincible(1000);
    p.heal(10);
    expect(p.hp).toBe(PLAYER_MAX_HP - 30 + 10);
  });

  it('无敌态不阻止 burn tick（仅 takeDamage 守卫）', () => {
    const p = new PlayerCombat();
    p.applyDebuff({ type: 'burn', dps: 5, remainingMs: 1000 });
    p.setInvincible(2000);
    p.tick(1000);
    // burn 仍结算（无敌仅守 takeDamage，不守 debuff tick）
    expect(p.hp).toBe(PLAYER_MAX_HP - 5);
  });

  it('plan 3 既有行为无回归：takeDamage 正常扣血', () => {
    const p = new PlayerCombat();
    const onHp = vi.fn();
    p.onHpChanged = onHp;
    p.takeDamage({ amount: 20, category: 'melee' });
    expect(p.hp).toBe(PLAYER_MAX_HP - 20);
    expect(onHp).toHaveBeenCalledWith(PLAYER_MAX_HP - 20);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/player-invincibility.test.ts`，确认 `setInvincible`/`isInvincible` 不存在。

### Step 3: 加法式修改 PlayerCombat.ts

- [ ] 在 `src/tombraid/combat/PlayerCombat.ts` 中：

**(a)** 在 `_isDead` 字段之后**新增**字段：

```ts
  private invincibleMs = 0; // plan 4: 无敌态（拳套霸体冲拳）
```

**(b)** 在 `takeDamage` 方法**最顶部**（`if (this._isDead || instance.amount <= 0) return;` 之前）**插入**守卫：

```ts
  takeDamage(instance: DamageInstance): void {
    if (this.invincibleMs > 0) return; // plan 4: 无敌态守卫
    if (this._isDead || instance.amount <= 0) return;
    // ... 既有逻辑不变
```

**(c)** 在 `tick` 方法中，`if (this._isDead) return;` 之后、debuff tick 之前**插入**无敌递减：

```ts
  tick(deltaMs: number): void {
    if (this._isDead) return;
    if (this.invincibleMs > 0) {
      this.invincibleMs = Math.max(0, this.invincibleMs - deltaMs);
    }
    // ... 既有 debuff tick 逻辑不变
```

**(d)** 在 `get activeDebuffs` getter之前**新增**公开方法：

```ts
  // plan 4: 无敌态
  setInvincible(ms: number): void {
    this.invincibleMs = Math.max(this.invincibleMs, ms);
  }

  isInvincible(): boolean {
    return this.invincibleMs > 0;
  }
```

> **零回归**：`invincibleMs` 默认 0 → `isInvincible()` 恒 false → `takeDamage` 守卫 `if (this.invincibleMs > 0) return;` 永不触发 → plan 3 行为不变。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/player-invincibility.test.ts`，确认全部通过。
- [ ] 运行 `npx vitest run src/tests/tombraid/combat/player-combat.test.ts`，确认 plan 3 既有测试无回归。

### Step 5: commit

- [ ] `git add src/tombraid/combat/PlayerCombat.ts src/tests/tombraid/weapons/player-invincibility.test.ts && git commit -m "feat(tombraid): plan4 task5 PlayerCombat 无敌态 拳套霸体冲拳"`

---

## Task 6: WeaponCooldowns.ts — 普攻/大招冷却状态机

**目标**：实现冷却状态机（基于绝对时间戳）：`canBasicAttack` / `recordBasicAttack` / `recordBasicAttackCooldown` / `canUltimate` / `recordUltimate` / `getBasicCooldownRemaining` / `getUltimateCooldownRemaining` / `onWeaponSwap`。纯 TS。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-cooldowns.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { getWeapon } from '../../../tombraid/weapons/WeaponRegistry';

describe('WeaponCooldowns (plan 4)', () => {
  it('初始可普攻可大招', () => {
    const cd = new WeaponCooldowns();
    expect(cd.canBasicAttack(0)).toBe(true);
    expect(cd.canUltimate(0)).toBe(true);
  });

  it('recordBasicAttack 按攻速锁 CD；CD 内不可普攻', () => {
    const cd = new WeaponCooldowns();
    const ruler = getWeapon('weapon.ruler')!;
    cd.recordBasicAttack(ruler, 0);
    // 尺子 1.5/s → CD = 1000/1.5 ≈ 666.67ms
    expect(cd.canBasicAttack(0)).toBe(false);
    expect(cd.canBasicAttack(600)).toBe(false);
    expect(cd.canBasicAttack(700)).toBe(true);
  });

  it('recordBasicAttackCooldown 直接用攻速（空手路径）', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0); // 2/s → 500ms
    expect(cd.canBasicAttack(400)).toBe(false);
    expect(cd.canBasicAttack(500)).toBe(true);
  });

  it('recordUltimate 按大招 CD 锁定', () => {
    const cd = new WeaponCooldowns();
    const ruler = getWeapon('weapon.ruler')!;
    cd.recordUltimate(ruler, 0);
    expect(cd.canUltimate(0)).toBe(false);
    expect(cd.canUltimate(19999)).toBe(false);
    expect(cd.canUltimate(20000)).toBe(true);
  });

  it('万魂幡大招 CD 120s', () => {
    const cd = new WeaponCooldowns();
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    expect(cd.canUltimate(119999)).toBe(false);
    expect(cd.canUltimate(120000)).toBe(true);
  });

  it('getBasicCooldownRemaining 返回剩余 ms', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0); // 500ms
    expect(cd.getBasicCooldownRemaining(0)).toBe(500);
    expect(cd.getBasicCooldownRemaining(200)).toBe(300);
    expect(cd.getBasicCooldownRemaining(500)).toBe(0);
  });

  it('getUltimateCooldownRemaining 返回剩余 ms', () => {
    const cd = new WeaponCooldowns();
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    expect(cd.getUltimateCooldownRemaining(0)).toBe(120000);
    expect(cd.getUltimateCooldownRemaining(60000)).toBe(60000);
    expect(cd.getUltimateCooldownRemaining(120000)).toBe(0);
  });

  it('onWeaponSwap 重置 CD（立即可普攻可大招）', () => {
    const cd = new WeaponCooldowns();
    cd.recordBasicAttackCooldown(2, 0);
    const banner = getWeapon('weapon.soulBanner')!;
    cd.recordUltimate(banner, 0);
    cd.onWeaponSwap();
    expect(cd.canBasicAttack(0)).toBe(true);
    expect(cd.canUltimate(0)).toBe(true);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-cooldowns.test.ts`，确认模块不存在。

### Step 3: 实现 WeaponCooldowns.ts

- [ ] 创建 `src/tombraid/weapons/WeaponCooldowns.ts`：

```ts
// src/tombraid/weapons/WeaponCooldowns.ts
// 普攻/大招冷却状态机（基于绝对时间戳）。纯 TS，无 Phaser。
import type { WeaponDef } from './WeaponRegistry';

export class WeaponCooldowns {
  private basicReadyAtMs = 0;
  private ultimateReadyAtMs = 0;

  canBasicAttack(timeMs: number): boolean {
    return timeMs >= this.basicReadyAtMs;
  }

  recordBasicAttack(weapon: WeaponDef, timeMs: number): void {
    this.recordBasicAttackCooldown(weapon.basic.attacksPerSecond, timeMs);
  }

  /** 直接用攻速记录普攻 CD（空手/未知武器路径）。 */
  recordBasicAttackCooldown(attacksPerSecond: number, timeMs: number): void {
    const cdMs = attacksPerSecond > 0 ? 1000 / attacksPerSecond : 0;
    this.basicReadyAtMs = timeMs + cdMs;
  }

  canUltimate(timeMs: number): boolean {
    return timeMs >= this.ultimateReadyAtMs;
  }

  recordUltimate(weapon: WeaponDef, timeMs: number): void {
    this.ultimateReadyAtMs = timeMs + weapon.ultimate.cooldownMs;
  }

  getBasicCooldownRemaining(timeMs: number): number {
    return Math.max(0, this.basicReadyAtMs - timeMs);
  }

  getUltimateCooldownRemaining(timeMs: number): number {
    return Math.max(0, this.ultimateReadyAtMs - timeMs);
  }

  /** 换武器时重置 CD（立即可普攻可大招）。 */
  onWeaponSwap(): void {
    this.basicReadyAtMs = 0;
    this.ultimateReadyAtMs = 0;
  }
}
```

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-cooldowns.test.ts`，确认全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/weapons/WeaponCooldowns.ts src/tests/tombraid/weapons/weapon-cooldowns.test.ts && git commit -m "feat(tombraid): plan4 task6 WeaponCooldowns 冷却状态机"`

---

## Task 7: executeBasicAttack — 普攻执行器（WeaponCombatAdapter.ts）

**目标**：实现 `WeaponCombatAdapter` 类 + `CombatPort` 接口 + `WeaponVisualEvent` 联合 + `equipWeapon`（返回旧武器 ID）+ `performAttack`（按普攻 kind 结算：meleeFan 扇形多段 + rangedPiercing 投射物 + 血镰吸血 + 万魂幡恐惧触发）。通过 `CombatPort` 调用 CombatManager 玩家侧 API，通过 `onVisualEvent` 回调触发视觉。纯 TS。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-basic-attack.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { CombatManager } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';
import { Enemy, registerEnemyKind, type EnemyConstructorOpts, type EnemyUpdateContext } from '../../../tombraid/combat/Enemy';
import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { WeaponCombatAdapter, type CombatPort } from '../../../tombraid/weapons/WeaponCombatAdapter';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  update(_d: number, _c: EnemyUpdateContext): void { /* noop */ }
}
registerEnemyKind('butYuxuanHead', (o) => new DummyEnemy(o));

function makeEnemy(x: number, y: number, hp: number): DummyEnemy {
  const opts: EnemyConstructorOpts = { id: `e${x}-${y}-${hp}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24 };
  return new DummyEnemy(opts);
}

function makeAdapter(): { adapter: WeaponCombatAdapter; manager: CombatManager; player: PlayerCombat; cooldowns: WeaponCooldowns; onVisual: ReturnType<typeof vi.fn> } {
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
  it('尺子普攻 15 伤扇形', () => {
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

describe('performAttack — 拳套 10×3 连击', () => {
  it('对单体造成 30 总伤', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    const e = makeEnemy(40, 0, 999);
    manager.addEnemy(e);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(e.hp).toBe(999 - 30);
  });

  it('连击溢出转向扇形内其他敌人', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    const a = makeEnemy(40, 0, 9); // 3 击致死
    const b = makeEnemy(45, 0, 999);
    manager.addEnemy(a); manager.addEnemy(b);
    adapter.performAttack({ x: 1, y: 0 }, 0);
    expect(a.hp).toBe(0);
    expect(b.hp).toBe(999 - 21); // 剩余 7 击 × 3
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
    manager.update(600); // 380 * 0.6 = 228 → 命中 x=200
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
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-basic-attack.test.ts`，确认模块不存在。

### Step 3: 实现 WeaponCombatAdapter.ts（performAttack + equipWeapon）

- [ ] 创建 `src/tombraid/weapons/WeaponCombatAdapter.ts`：

```ts
// src/tombraid/weapons/WeaponCombatAdapter.ts
// 武器普攻/大招执行器。纯 TS，无 Phaser。
// 通过 CombatPort 接口调用 CombatManager 玩家侧 API；通过 onVisualEvent 回调触发视觉。
import type { DamageCategory, DamageInstance, Debuff, FearDebuff } from '../combat/DamageType';
import type { Enemy, EnemyKind, Vec2 } from '../combat/Enemy';
import type { PlayerProjectile, PlayerZone } from '../combat/CombatManager';
import type { PlayerCombat } from '../combat/PlayerCombat';
import {
  getWeapon,
  type MeleeFlashKind,
  type WeaponDef,
  type WeaponId,
  type WeaponProjectileKind,
} from './WeaponRegistry';
import type { WeaponCooldowns } from './WeaponCooldowns';

// ---------------------------------------------------------------------------
// CombatPort — CombatManager 子集接口（适配器依赖的契约）
// ---------------------------------------------------------------------------
export interface CombatPort {
  readonly player: PlayerCombat;
  getPlayerPosition(): Vec2;
  damageEnemiesInFan(
    originX: number, originY: number, dirX: number, dirY: number,
    range: number, halfAngle: number, instance: DamageInstance,
  ): number;
  damageEnemiesInCircle(cx: number, cy: number, radius: number, instance: DamageInstance): number;
  spawnPlayerProjectile(p: PlayerProjectile): void;
  spawnPlayerZone(z: PlayerZone): void;
  pullEnemiesToward(cx: number, cy: number, radius: number, pullDistance: number): void;
  killRandomEnemyInRadiusExcluding(
    cx: number, cy: number, radius: number, excludeKinds: readonly EnemyKind[],
  ): Enemy | null;
  getTimeMs(): number;
}

// ---------------------------------------------------------------------------
// WeaponVisualEvent — 视觉事件（场景 plan 6 订阅，调用 WeaponEffect 绘制）
// ---------------------------------------------------------------------------
export type WeaponVisualEvent =
  | {
      kind: 'meleeFlash';
      effectKind: MeleeFlashKind;
      x: number; y: number; dirX: number; dirY: number;
      range: number; halfAngle: number;
    }
  | {
      kind: 'projectileSpawned';
      effectKind: WeaponProjectileKind;
      x: number; y: number; angle: number;
    }
  | {
      kind: 'zoneSpawned';
      x: number; y: number; radius: number;
      proceduralKind: string;
    }
  | {
      kind: 'ultimateFired';
      weaponId: string;
      x: number; y: number; dirX: number; dirY: number;
    };

// ---------------------------------------------------------------------------
// WeaponCombatAdapter
// ---------------------------------------------------------------------------
let playerProjectileCounter = 0;

export class WeaponCombatAdapter {
  constructor(
    private readonly combat: CombatPort,
    private readonly cooldowns: WeaponCooldowns,
    private readonly onVisualEvent: ((event: WeaponVisualEvent) => void) | null = null,
  ) {}

  /** 拾取替换武器：设置新武器，重置 CD，返回旧武器 ID（用于地面掉落）。 */
  equipWeapon(newId: WeaponId): string {
    const player = this.combat.player;
    const old = player.weaponId;
    player.weaponId = newId;
    this.cooldowns.onWeaponSwap();
    return old;
  }

  /** 普攻执行器：读当前武器 → 按攻击类型结算 → 伤害 → 视觉 → 强制 CD。 */
  performAttack(direction: Vec2, timeMs: number): void {
    const player = this.combat.player;
    if (player.isDead) return;
    const weapon = getWeapon(player.weaponId);
    if (weapon === null) return; // 空手/未知 → no-op（空手由 plan 6 起配系统处理）

    if (!this.cooldowns.canBasicAttack(timeMs)) return;
    this.cooldowns.recordBasicAttack(weapon, timeMs);

    const pos = this.combat.getPlayerPosition();
    const dir = normalizeDir(direction);

    switch (weapon.basic.kind) {
      case 'meleeFan':
        this.executeMeleeFan(weapon, pos, dir);
        break;
      case 'rangedPiercing':
        this.executeRangedPiercing(weapon, pos, dir);
        break;
    }
  }

  // -- meleeFan 普攻（断尺/尺子/拳套/锁链/血镰/万魂幡）--
  private executeMeleeFan(weapon: WeaponDef, pos: Vec2, dir: Vec2): void {
    const basic = weapon.basic;
    // 武器系统保证 basic.kind === 'meleeFan' 时为 MeleeFanBasic
    if (basic.kind !== 'meleeFan') return;
    const instance: DamageInstance = {
      amount: basic.damage,
      category: basic.category,
    };

    let totalDealt = 0;
    const hits = basic.hitsPerAttack;
    for (let i = 0; i < hits; i++) {
      totalDealt += this.combat.damageEnemiesInFan(
        pos.x, pos.y, dir.x, dir.y, basic.range, basic.halfAngle, instance,
      );
    }

    // 视觉
    this.emit({
      kind: 'meleeFlash', effectKind: basic.effectKind,
      x: pos.x, y: pos.y, dirX: dir.x, dirY: dir.y,
      range: basic.range, halfAngle: basic.halfAngle,
    });

    // 血镰吸血 10%
    if (basic.lifestealPercent > 0 && totalDealt > 0) {
      const healAmount = (totalDealt * basic.lifestealPercent) / 100;
      if (healAmount >= 1) {
        this.combat.player.heal(Math.floor(healAmount));
      } else if (healAmount > 0) {
        this.combat.player.heal(1);
      }
    }

    // 万魂幡恐惧触发（每攻击一次掷骰）
    if (basic.fearProcPercent > 0 && basic.fearDurationMs > 0) {
      const roll = Math.random() * 100;
      if (roll < basic.fearProcPercent) {
        const fear: FearDebuff = {
          type: 'fear', remainingMs: basic.fearDurationMs,
          sourceX: pos.x, sourceY: pos.y,
        };
        const fearInstance: DamageInstance = {
          amount: 0, category: basic.category, debuff: fear,
        };
        this.combat.damageEnemiesInFan(
          pos.x, pos.y, dir.x, dir.y, basic.range, basic.halfAngle, fearInstance,
        );
      }
    }
  }

  // -- rangedPiercing 普攻（灵刃/粉笔）--
  private executeRangedPiercing(weapon: WeaponDef, pos: Vec2, dir: Vec2): void {
    const basic = weapon.basic;
    if (basic.kind !== 'rangedPiercing') return;
    const angle = Math.atan2(dir.y, dir.x);
    const proj: PlayerProjectile = {
      id: `wproj-${playerProjectileCounter++}`,
      x: pos.x, y: pos.y,
      vx: dir.x * basic.projectileSpeed,
      vy: dir.y * basic.projectileSpeed,
      speed: basic.projectileSpeed,
      damage: basic.damage,
      category: basic.category,
      pierceRemaining: basic.pierceCount,
      remainingMs: (basic.range / basic.projectileSpeed) * 1000,
      radius: basic.projectileRadius,
      proceduralKind: basic.effectKind,
    };
    this.combat.spawnPlayerProjectile(proj);
    this.emit({
      kind: 'projectileSpawned', effectKind: basic.effectKind,
      x: pos.x, y: pos.y, angle,
    });
  }

  protected emit(event: WeaponVisualEvent): void {
    if (this.onVisualEvent !== null) this.onVisualEvent(event);
  }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------
function normalizeDir(dir: Vec2): Vec2 {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) return { x: 0, y: 1 };
  return { x: dir.x / len, y: dir.y / len };
}
```

> **说明**：`performUltimate` 在 Task 8 追加到此类。`emit` 为 protected 以便 Task 8 复用。`playerProjectileCounter` 为模块级计数器，Task 8 的大招投射物（断尺尺屑/灵刃万刃阵）复用之。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-basic-attack.test.ts`，确认全部通过。

### Step 5: commit

- [ ] `git add src/tombraid/weapons/WeaponCombatAdapter.ts src/tests/tombraid/weapons/weapon-basic-attack.test.ts && git commit -m "feat(tombraid): plan4 task7 executeBasicAttack 普攻执行器"`

---

## Task 8: executeUltimate — 8 种大招执行器（WeaponCombatAdapter.ts 追加）

**目标**：在 `WeaponCombatAdapter` 追加 `performUltimate(direction, timeMs): boolean`，按 8 种大招 kind 结算：scatterShards（6 尺屑散射）/ chalkBombAoe（粉笔爆弹）/ rulerStorm（尺子风暴跟随区域）/ bladeArray（8 方向万刃阵）/ fistDash（无敌冲拳区域）/ chainCrush（群拉+root+DoT 区域）/ bloodWheel（血轮跟随区域）/ soulCapture（拘魂即死）。通过 `CombatPort` 调用伤害/AoE/投射物/群拉/即死 API。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-ultimate.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';

import { CombatManager } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';
import { Enemy, registerEnemyKind, type EnemyConstructorOpts, type EnemyUpdateContext, type EnemyKind } from '../../../tombraid/combat/Enemy';
import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { WeaponCombatAdapter, type CombatPort } from '../../../tombraid/weapons/WeaponCombatAdapter';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
  update(_d: number, _c: EnemyUpdateContext): void { /* noop */ }
}
registerEnemyKind('butYuxuanHead', (o) => new DummyEnemy(o));

function makeEnemy(x: number, y: number, hp: number, kind: EnemyKind = 'butYuxuanHead'): DummyEnemy {
  const opts: EnemyConstructorOpts = { id: `e${x}-${y}-${hp}`, x, y, maxHp: hp, speed: 0, contactDamage: 0, contactRadius: 24 };
  const e = new DummyEnemy(opts);
  (e as { kind: EnemyKind }).kind = kind;
  return e;
}

function makeAdapter(): { adapter: WeaponCombatAdapter; manager: CombatManager; player: PlayerCombat; onVisual: ReturnType<typeof vi.fn> } {
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
    manager.update(2000); // 2s dps 30 → 60 伤
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

  it('生成跟随玩家的冲拳区域', () => {
    const { adapter, manager, player } = makeAdapter();
    player.weaponId = 'weapon.fistGauntlet';
    manager.setPlayerPosition(0, 0);
    adapter.performUltimate({ x: 1, y: 0 }, 0);
    expect(manager.playerZones).toHaveLength(1);
    expect(manager.playerZones[0]!.followPlayer).toBe(true);
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
    expect(z.durationMs).toBe(3000);
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
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-ultimate.test.ts`，确认 `performUltimate` 不存在。

### Step 3: 追加 performUltimate 到 WeaponCombatAdapter.ts

- [ ] 在 `src/tombraid/weapons/WeaponCombatAdapter.ts` 顶部 import 块**追加** `RootDebuff` 类型导入（合并到既有 DamageType import）：

```ts
import type { DamageCategory, DamageInstance, Debuff, FearDebuff, RootDebuff } from '../combat/DamageType';
```

- [ ] 在 `WeaponCombatAdapter` 类中 `performAttack` 方法之后、`private executeMeleeFan` 之前**插入** `performUltimate` + 8 种大招私有方法：

```ts
  /** 大招执行器：读武器大招 → 按类型结算 → 视觉 → 强制 CD。返回是否执行（false = CD 中/未知武器）。 */
  performUltimate(direction: Vec2, timeMs: number): boolean {
    const player = this.combat.player;
    if (player.isDead) return false;
    const weapon = getWeapon(player.weaponId);
    if (weapon === null) return false;
    if (!this.cooldowns.canUltimate(timeMs)) return false;
    this.cooldowns.recordUltimate(weapon, timeMs);

    const pos = this.combat.getPlayerPosition();
    const dir = normalizeDir(direction);
    const ult = weapon.ultimate;

    this.emit({
      kind: 'ultimateFired', weaponId: weapon.id,
      x: pos.x, y: pos.y, dirX: dir.x, dirY: dir.y,
    });

    switch (ult.kind) {
      case 'scatterShards':
        this.ultScatterShards(ult, pos, dir);
        break;
      case 'chalkBombAoe':
        this.ultChalkBomb(ult, pos, dir);
        break;
      case 'rulerStorm':
        this.ultRulerStorm(ult, pos);
        break;
      case 'bladeArray':
        this.ultBladeArray(ult, pos);
        break;
      case 'fistDash':
        this.ultFistDash(ult, pos);
        break;
      case 'chainCrush':
        this.ultChainCrush(ult, pos);
        break;
      case 'bloodWheel':
        this.ultBloodWheel(ult, pos);
        break;
      case 'soulCapture':
        this.ultSoulCapture(ult, pos);
        break;
    }
    return true;
  }

  // -- 断尺：6 枚尺屑扇形散射 --
  private ultScatterShards(
    ult: import('./WeaponRegistry').ScatterShardsUlt,
    pos: Vec2,
    dir: Vec2,
  ): void {
    const baseAngle = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < ult.shardCount; i++) {
      const t = ult.shardCount === 1 ? 0 : (i / (ult.shardCount - 1)) - 0.5;
      const angle = baseAngle + t * 2 * ult.spreadHalfAngle;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      this.combat.spawnPlayerProjectile({
        id: `wproj-${playerProjectileCounter++}`,
        x: pos.x, y: pos.y,
        vx: ux * ult.projectileSpeed,
        vy: uy * ult.projectileSpeed,
        speed: ult.projectileSpeed,
        damage: ult.damage,
        category: 'physical',
        pierceRemaining: 0,
        remainingMs: 2000,
        radius: ult.projectileRadius,
        proceduralKind: ult.effectKind,
      });
    }
    this.emit({
      kind: 'projectileSpawned', effectKind: ult.effectKind,
      x: pos.x, y: pos.y, angle: baseAngle,
    });
  }

  // -- 粉笔：前方固定位置爆弹 AoE --
  private ultChalkBomb(
    ult: import('./WeaponRegistry').ChalkBombAoeUlt,
    pos: Vec2,
    dir: Vec2,
  ): void {
    const cx = pos.x + dir.x * 120;
    const cy = pos.y + dir.y * 120;
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: cx, y: cy, radius: ult.radius,
      burstDamage: ult.damage, damagePerSecond: 0,
      category: 'aoe', remainingMs: 100,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: false, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: cx, y: cy, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 尺子：跟随玩家风暴区域 --
  private ultRulerStorm(
    ult: import('./WeaponRegistry').RulerStormUlt,
    pos: Vec2,
  ): void {
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.radius,
      burstDamage: 0, damagePerSecond: ult.damagePerSecond,
      category: 'aoe', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 灵刃：8 方向万刃阵 --
  private ultBladeArray(
    ult: import('./WeaponRegistry').BladeArrayUlt,
    pos: Vec2,
  ): void {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      this.combat.spawnPlayerProjectile({
        id: `wproj-${playerProjectileCounter++}`,
        x: pos.x, y: pos.y,
        vx: ux * ult.projectileSpeed,
        vy: uy * ult.projectileSpeed,
        speed: ult.projectileSpeed,
        damage: ult.damage,
        category: 'physical',
        pierceRemaining: ult.pierceCount,
        remainingMs: 2000,
        radius: ult.projectileRadius,
        proceduralKind: ult.effectKind,
      });
    }
    this.emit({ kind: 'projectileSpawned', effectKind: ult.effectKind, x: pos.x, y: pos.y, angle: 0 });
  }

  // -- 拳套：无敌冲拳（跟随玩家 DoT 区域 + 无敌态）--
  private ultFistDash(
    ult: import('./WeaponRegistry').FistDashUlt,
    pos: Vec2,
  ): void {
    this.combat.player.setInvincible(ult.invincibleMs);
    const dps = ult.durationMs > 0 ? (ult.totalDamage * 1000) / ult.durationMs : ult.totalDamage;
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.radius,
      burstDamage: 0, damagePerSecond: dps,
      category: 'melee', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 锁链：群拉 + root + DoT 区域 --
  private ultChainCrush(
    ult: import('./WeaponRegistry').ChainCrushUlt,
    pos: Vec2,
  ): void {
    this.combat.pullEnemiesToward(pos.x, pos.y, ult.pullRadius, ult.pullDistance);
    // root debuff 应用到拉到的敌人
    const root: RootDebuff = { type: 'root', remainingMs: ult.rootMs };
    this.combat.damageEnemiesInCircle(pos.x, pos.y, ult.pullRadius, {
      amount: 0, category: 'physical', debuff: root,
    });
    // DoT 区域
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.pullRadius,
      burstDamage: 0, damagePerSecond: ult.damagePerSecond,
      category: 'physical', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.pullRadius, proceduralKind: ult.effectKind });
  }

  // -- 血镰：跟随玩家血轮区域 dps 50 --
  private ultBloodWheel(
    ult: import('./WeaponRegistry').BloodWheelUlt,
    pos: Vec2,
  ): void {
    this.combat.spawnPlayerZone({
      id: `wzone-${playerZoneCounter++}`,
      shape: 'circle', x: pos.x, y: pos.y, radius: ult.radius,
      burstDamage: 0, damagePerSecond: ult.damagePerSecond,
      category: 'physical', remainingMs: ult.durationMs,
      applyDebuffOnce: false, debuffApplied: false,
      followPlayer: true, proceduralKind: ult.effectKind,
    });
    this.emit({ kind: 'zoneSpawned', x: pos.x, y: pos.y, radius: ult.radius, proceduralKind: ult.effectKind });
  }

  // -- 万魂幡：视野内即死一个非精英 --
  private ultSoulCapture(
    ult: import('./WeaponRegistry').SoulCaptureUlt,
    pos: Vec2,
  ): void {
    const killed = this.combat.killRandomEnemyInRadiusExcluding(
      pos.x, pos.y, ult.captureRadius, ult.excludeKinds,
    );
    this.emit({
      kind: 'soulCaptureResolved', x: pos.x, y: pos.y,
      captured: killed !== null,
    });
  }
}
```

> **说明**：`ultBloodWheel` 与 `ultRulerStorm` 结构相似（跟随玩家 DoT 区域），仅 dps/radius/duration 不同（数据来自 WeaponRegistry）。`ultSoulCapture` 通过 `CombatPort.killRandomEnemyInRadiusExcluding` 即死，`excludeKinds: ['yangYunRed']` 排除精英。即死目标不存在时仍返回 `true`（CD 已消耗），符合 spec §4.4「拘魂 CD 120s」语义。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-ultimate.test.ts`，确认全部通过。
- [ ] 运行 `npm run typecheck`，确认无类型错误。重点检查：
  - `RootDebuff` 导入已使用（`ultChainCrush` 内构造 `root` 实例）。
  - `playerProjectileCounter` / `playerZoneCounter` 模块级 `let`（Task 7 已声明 `playerProjectileCounter`；Task 8 追加声明 `playerZoneCounter`，不重复声明 `playerProjectileCounter`）。
  - 8 个 `case` 分支穷尽 `WeaponUltimate` 联合（switch 无 default，TS 穷尽性检查通过）。

### Step 5: 提交

- [ ] `git add src/tombraid/weapons/WeaponCombatAdapter.ts src/tests/tombraid/weapons/weapon-ultimate.test.ts`
- [ ] `git commit -m "feat(tomb-raid): add executeUltimate for all 8 weapon ultimates"`

---

## Task 9: 集成冒烟测试 — 全链路（拾取替换 / 普攻 / 大招 / CD 门控）

**目标**：跨 WeaponRegistry + WeaponCombatAdapter + WeaponCooldowns + CombatManager + PlayerCombat + Enemy 的端到端冒烟测试，验证 plan 4 全链路可用：默认武器（尺子，与 plan 3 `PLACEHOLDER_WEAPON_ID='weapon.ruler'` 平滑升级）、拾取替换（返回旧 ID + 重置 CD）、普攻伤害链路、大招伤害链路、CD 门控、血镰吸血。本任务仅新增测试文件，不修改任何实现（所有实现由 Task 1-8 完成）。

### Step 1: 写失败测试

- [ ] 创建 `src/tests/tombraid/weapons/weapon-integration.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

import { CombatManager } from '../../../tombraid/combat/CombatManager';
import { PlayerCombat } from '../../../tombraid/combat/PlayerCombat';
import {
  Enemy,
  registerEnemyKind,
  type EnemyConstructorOpts,
  type EnemyUpdateContext,
} from '../../../tombraid/combat/Enemy';
import { WeaponCooldowns } from '../../../tombraid/weapons/WeaponCooldowns';
import { WeaponCombatAdapter } from '../../../tombraid/weapons/WeaponCombatAdapter';

class DummyEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly textureKey = null;
  readonly proceduralKind = null;
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
  // CombatManager 已实现 CombatPort 全部成员（Task 2），无需 cast
  const adapter = new WeaponCombatAdapter(manager, cooldowns, null);
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
    player.weaponId = 'weapon.unknown' as never;
    expect(() => adapter.performAttack({ x: 1, y: 0 }, 0)).not.toThrow();
    expect(adapter.performUltimate({ x: 1, y: 0 }, 0)).toBe(false);
  });
});
```

### Step 2: 验证测试失败

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-integration.test.ts`，确认失败（原因：Task 1-8 尚未全部实现时模块缺失；若 Task 1-8 已实现则应直接通过——本任务为聚合冒烟测试，无新实现）。

### Step 3: 无新实现（聚合冒烟测试）

- [ ] 本任务**不修改任何实现文件**。所有被测模块（`WeaponRegistry` / `WeaponCombatAdapter` / `WeaponCooldowns` / `CombatManager` / `PlayerCombat` / `Enemy`）由 Task 1-8 完成。若 Step 2 失败，回到对应 Task 修复而非在本任务新增实现。

### Step 4: 验证测试通过

- [ ] 运行 `npx vitest run src/tests/tombraid/weapons/weapon-integration.test.ts`，确认全部通过。
- [ ] 运行 `npm run typecheck`，确认无类型错误。
- [ ] 运行 `npm run test:run`，确认 plan 4 全部 9 个测试文件通过且 plan 3 既有测试零回归。

### Step 5: 提交

- [ ] `git add src/tests/tombraid/weapons/weapon-integration.test.ts`
- [ ] `git commit -m "test(tomb-raid): add weapon system integration smoke test"`

---

## 附录 A：Spec §4 覆盖自检矩阵

> 验证 spec §4（武器系统）每条要求均有 Task 落地。✅ = 已覆盖。

### §4.1 紫阶（2 把）

| spec 要求 | 数值 | 落地 Task | 状态 |
|----------|------|----------|------|
| 断尺 `weapon.brokenRuler` sanityValue 85 | 85 | Task 3 (WeaponRegistry) | ✅ |
| 断尺普攻 meleeFan 8伤 1.8/s | dmg=8, aps=1.8 | Task 3 数据 + Task 7 执行 | ✅ |
| 断尺大招 6×4 碎片 CD 22s | shardCount=6, dmg=4, cd=22000 | Task 3 数据 + Task 8 `ultScatterShards` | ✅ |
| 粉笔 `weapon.chalk` sanityValue 70 | 70 | Task 3 | ✅ |
| 粉笔普攻 rangedPiercing 6伤 2/s pierce 1 | dmg=6, aps=2, pierce=1 | Task 3 数据 + Task 7 执行 | ✅ |
| 粉笔大招 AoE 25伤 CD 22s | dmg=25, cd=22000 | Task 3 数据 + Task 8 `ultChalkBomb` | ✅ |

### §4.2 绿阶（3 把）

| spec 要求 | 数值 | 落地 Task | 状态 |
|----------|------|----------|------|
| 尺子 `weapon.ruler` sanityValue 130 textureKey `prop.ruler` | 130, 'prop.ruler' | Task 3 (textureKey='prop.ruler') | ✅ |
| 尺子普攻 meleeFan 15伤 1.5/s | dmg=15, aps=1.5 | Task 3 数据 + Task 7 执行 | ✅ |
| 尺子大招 rulerStorm CD 20s | cd=20000, dps=30, dur=2000 | Task 3 数据 + Task 8 `ultRulerStorm` | ✅ |
| 灵刃 `weapon.spiritBlade` sanityValue 200 | 200 | Task 3 | ✅ |
| 灵刃普攻 rangedPiercing 18伤 1.2/s 穿透 | dmg=18, aps=1.2, pierce=Infinity | Task 3 数据 + Task 7 执行 | ✅ |
| 灵刃大招 8方向 bladeArray CD 25s | 8方向, cd=25000 | Task 3 数据 + Task 8 `ultBladeArray` | ✅ |
| 拳套 `weapon.fistGauntlet` sanityValue 170 | 170 | Task 3 | ✅ |
| 拳套普攻 meleeFan 10×3伤 2/s | dmg=3, hits=10, aps=2 | Task 3 数据 + Task 7 多段循环 | ✅ |
| 拳套大招 fistDash 无敌 总伤80 CD 22s | totalDmg=80, invincible, cd=22000 | Task 3 + Task 5(无敌态) + Task 8 `ultFistDash` | ✅ |

### §4.3 金阶（2 把）

| spec 要求 | 数值 | 落地 Task | 状态 |
|----------|------|----------|------|
| 锁链 `weapon.chain` sanityValue 420 | 420 | Task 3 | ✅ |
| 锁链普攻 meleeFan 25伤 1/s 大范围 | dmg=25, aps=1, range=120 | Task 3 数据 + Task 7 执行 | ✅ |
| 锁链大招 chainCrush 群拉+root 2s+DoT CD 25s | rootMs=2000, cd=25000 | Task 3 + Task 1(root) + Task 8 `ultChainCrush` | ✅ |
| 血镰 `weapon.bloodScythe` sanityValue 550 | 550 | Task 3 | ✅ |
| 血镰普攻 meleeFan 40伤 0.8/s lifesteal 10% | dmg=40, aps=0.8, lifesteal=10 | Task 3 数据 + Task 7 吸血 | ✅ |
| 血镰大招 bloodWheel r130 dps 50×3s CD 25s | r=130, dps=50, dur=3000, cd=25000 | Task 3 数据 + Task 8 `ultBloodWheel` | ✅ |

### §4.4 白阶（1 把）

| spec 要求 | 数值 | 落地 Task | 状态 |
|----------|------|----------|------|
| 万魂幡 `weapon.soulBanner` sanityValue 1200 | 1200 | Task 3 | ✅ |
| 万魂幡普攻 meleeFan 20伤 1/s 20%概率fear 2s | dmg=20, aps=1, fearProc=20, fearDur=2000 | Task 3 + Task 1(fear) + Task 7 恐惧触发 | ✅ |
| 万魂幡大招 soulCapture 即死1个非精英 CD 120s | captureR=600, exclude=['yangYunRed'], cd=120000 | Task 3 + Task 2(即死API) + Task 8 `ultSoulCapture` | ✅ |

### §4.5 武器数据结构 + 跨节约束

| spec 要求 | 落地 Task | 状态 |
|----------|----------|------|
| `WeaponBasicAttack` 判别联合（meleeFan / rangedPiercing） | Task 3 (`MeleeFanBasic \| RangedPiercingBasic`) | ✅ |
| `Weapon` 接口（id/name/rarity/sanityValue/spriteKey/proceduralDraw/basic/ultimate） | Task 3 (`WeaponDef`，textureKey 替代 spriteKey+proceduralDraw) | ✅ |
| 武器伤害类型对接 plan 3 DamageType（物理/灼烧/恐惧/定身） | Task 1 (Enemy burn/stun/root/fear) + Task 7/8 (DamageInstance 构造) | ✅ |
| 武器大招对接 plan 3 CombatManager（注册伤害源/AoE/投射物） | Task 2 (playerProjectile/playerZone/fan/circle/pull/kill API) + Task 8 调用 | ✅ |
| 素材 key 命名：尺子复用 `prop.ruler`，其余程序绘制 | Task 3 (ruler.textureKey='prop.ruler', 其余=null) + Task 4 (WeaponEffect) | ✅ |
| 武器与 PlayerCombat 集成（持有武器ID，普攻/大招查表执行） | Task 5(无敌态) + Task 7/8(adapter 读 player.weaponId 查表) | ✅ |
| PlayerCombat 占位 ID `weapon.ruler` 平滑升级为真实 WeaponId | Task 3 (WeaponId 含 'weapon.ruler') + Task 9 集成测试验证 | ✅ |
| CombatManager.playerAttack 占位弱拳保留不替换 | Constraints 明示 + Task 7 adapter 为新路径（不修改 playerAttack） | ✅ |
| 不渲染 UI（plan 6） | Constraints 明示；WeaponVisualEvent 仅回调，不绘制 | ✅ |
| 不涉及掉落（plan 5） | Constraints 明示；equipWeapon 仅返回旧 ID 供场景掉落 | ✅ |
| 不修改剧情模式代码 | Constraints 明示；仅改 src/tombraid/* 与 src/tests/tombraid/* | ✅ |
| TS strict（noUncheckedIndexedAccess/exactOptionalPropertyTypes/noUnusedLocals/noUnusedParameters） | Constraints 明示；条件展开 `...(cond?{debuff}:{})` 处理 exactOptional | ✅ |
| TDD 强制（每任务 5 步 RED→GREEN→SURFACE） | Task 1-9 均为 5 步 | ✅ |
| 程序绘制特效用 Phaser Graphics + UI_THEME 配色 | Task 4 (`import type { Graphics }` + UI_THEME) | ✅ |
| 对 plan 3 既有代码全部加法式（零回归） | Task 1/2/5 加法式；plan 3 敌人无状态时新方法 no-op | ✅ |

---

## 附录 B：设计值清单（spec 未给定的数值）

> spec §4 仅给出武器 sanityValue、普攻伤害/攻速/机制、大招 CD/机制。以下数值为 plan 4 设计决策（spec 未指定），已嵌入 WeaponRegistry 数据。

| 武器 | 字段 | 设计值 | 依据 |
|------|------|--------|------|
| 断尺 | 普攻 range / halfAngle | 60 / 45° | 短武器，弱于尺子 |
| 断尺 | 大招 spreadHalfAngle / projSpeed / projRadius / remainingMs | 30° / 280 / 8 / 2000 | 6 发扇形散射 |
| 粉笔 | 普攻 range / projSpeed / projRadius | 320 / 320 / 8 | 中程投掷 |
| 粉笔 | 大招 radius / remainingMs | 90 / 100 | 爆弹瞬时 AoE |
| 尺子 | 普攻 range / halfAngle | 80 / 50° | 标准近战 |
| 尺子 | 大招 dps / radius / durationMs | 30 / 110 / 2000 | 旋转风暴 |
| 灵刃 | 普攻 range / projSpeed / projRadius | 400 / 380 / 14 | 远程月牙 |
| 灵刃 | 大招 projSpeed / projRadius / pierceCount / remainingMs | 380 / 14 / Infinity / 2000 | 8 方向穿透 |
| 拳套 | 普攻 range / halfAngle / hitsPerAttack / hitDelayMs | 50 / 45° / 10 / 0 | 短连击（瞬时结算） |
| 拳套 | 大招 totalDamage / durationMs / radius / invincibleMs | 80 / 1200 / 70 / 1200 | 无敌冲拳 |
| 锁链 | 普攻 range / halfAngle | 120 / 70° | 中距离大范围 |
| 锁链 | 大招 pullRadius / pullDistance / rootMs / dps / durationMs | 180 / 80 / 2000 / 25 / 2000 | 群拉缚身 |
| 血镰 | 普攻 range / halfAngle / lifestealPercent | 110 / 70° / 10 | 大范围吸血 |
| 血镰 | 大招 radius / dps / durationMs | 130 / 50 / 3000 | 周身血轮 |
| 万魂幡 | 普攻 range / halfAngle / fearProcPercent / fearDurationMs | 90 / 55° / 20 / 2000 | 中距离恐惧 |
| 万魂幡 | 大招 captureRadius / excludeKinds | 600 / ['yangYunRed'] | 视野内即死非精英 |
| 空手 | 弱拳 dmg / aps / range / halfAngle | 5 / 2 / 64 / 50° | spec §3.1 WEAK_PUNCH_DAMAGE=5 |

---

## 附录 C：a.txt 自检修正落实清单

> 撰写过程中对照 `a.txt` 思考日志的自检发现，逐条落实到此 plan。

| a.txt 自检发现 | 落实位置 | 状态 |
|---------------|----------|------|
| `applyDamageInstanceToEnemy` 在 amount<=0 时仍需应用 debuff（万魂幡恐惧/锁链 root 用 amount=0 实例） | Task 2 `applyDamageInstanceToEnemy` 实现（amount<=0 跳过伤害但应用 debuff） | ✅ |
| 玩家投射物需 sub-stepping 避免穿透隧道（maxStep=8px） | Task 2 `updatePlayerProjectiles` 子步进 | ✅ |
| Task 2 测试 1 用 `pierceRemaining: 0`（命中即移除）而非 Infinity | Task 2 投射物测试 1 | ✅ |
| Task 2 fear 测试用 remainingMs 2000 + update 1000（避免 tick 后过期） | Task 2 fear 测试 | ✅ |
| 移除未使用 import（PlayerProjectile/PlayerZone in Task 6、DamageInstance in Task 7） | Task 6/7 import 仅含已用符号 | ✅ |
| 空手路径用 `recordBasicAttackCooldown(2, timeMs)` 而非 `as unknown as WeaponDef` cast | Task 6 `recordBasicAttackCooldown` + Task 7 调用 | ✅ |
| `WeaponExecutionContext.timeMs` 可变（移除 readonly，scene 每帧推进） | Task 6 `WeaponExecutionContext` 定义 | ✅ |
| Task 9 测试移除 `.valueOf()`（boolean 原型无此方法） | Task 9 测试 `expect(...).toBe(true)` | ✅ |
| 每任务追加 import 必须在同任务内使用（noUnusedLocals） | Task 6/7/8 各自 import 均同任务内使用 | ✅ |
| 现有 narrative-ui.test.ts 已 import UI_THEME（传递加载 Phaser）且为已合并 TDD 测试 → jsdom 下可行 | Task 4 `WeaponEffect` 引用 UI_THEME 无加载风险 | ✅ |
| `PLACEHOLDER_WEAPON_ID = 'weapon.ruler'`（plan 3 line 228）巧合 → plan 4 平滑升级 | Task 3 WeaponId 含 'weapon.ruler' + Task 9 集成测试验证 | ✅ |
| CombatManager.playerAttack 占位弱拳保留不替换（adapter 为新路径） | Constraints + Task 7 adapter 独立路径 | ✅ |

---

**Plan 4 完。** 共 9 个 Task × 5 步 TDD = 45 步，覆盖 spec §4 全部 8 把武器 + 数据结构 + 跨节约束。对 plan 3 既有代码全部加法式修改，零回归。