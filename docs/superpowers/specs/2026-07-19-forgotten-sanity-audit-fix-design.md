# 被遗忘的理智 — 审核修复设计

**生成日期**：2026-07-19
**对照 spec**：
- `2026-07-17-tomb-raid-mode-design.md`（设计 spec，下称 spec#1）
- `2026-07-18-forgotten-sanity-spec-compliance-fix-design.md`（修复 spec，下称 spec#2）

**性质**：基于 2026-07-19 代码审核报告，修复 spec#2 部分修复项 + 高风险盲区 + 中风险盲区 + spec 文档同步，共 25 项。

## §1 总体方法

### §1.1 修复原则
- **spec 字面对齐**：spec 已明确的数值/规则按 spec 字面实现
- **spec 补全**：spec 缺失的（ESC 暂停、雾战冻结、burn 叠加等）按本 spec 决策实现并同步修订 spec#1
- **TDD 强制**：每项修复先写失败测试（RED）→ 实现（GREEN）→ E2E 暴露（SURFACE）
- **零侵入剧情模式**：改动限于 `src/forgottenSanity/` + `src/data/assets.ts` + spec 文档

### §1.2 决策矩阵速查

| 类别 | 项 | 决策 |
|------|----|------|
| E2E 驱动 | 钩子 vs 真实游玩 | Debug 钩子注入（`__test*` 方法） |
| LootTable itemCount | min 值 | 严格按 spec：min=1 |
| rollIndependent 语义 | 加权多选 vs 独立掷骰 | 严格按 spec：每稀有度独立掷骰，可返回 0-4 件 |
| 红边保底 | 全空时是否兜底 | 不保底（接受 32% 空掉落） |
| 复制体掉落 | 保留/跳过/cap | 严格按 spec：保留掉落，无 cap |
| localStorage 校验 | clamp/拒绝/不校验 | 拒绝+重置（整 schema 返回 fallback） |
| schemaVersion | 框架/bump/不加 | 加 migrate 框架（v1 不变，预留 v1→v2） |
| localStorage 原子性 | 多 key 事务/单 key try/不处理 | 多 key 事务+回滚 |
| currentRoomId 赋值 | 点在矩形/跨门/距离 | 每帧点在矩形检测 |
| 战斗实体上限 | 硬上限/软上限/不设 | 不设上限 |
| 二阶段 CD | multiplier/各字段/覆盖 | cdMultiplier 字段 |
| spawnWallHitFx | 程序粒子/复用/跳过 | 3 粒子程序绘制 |
| fistDash 去重 | hitSet/路径优先/不修 | hitSet 去重 |
| 大地图雾战 | 同过滤/显示全部/半透明 | 同过滤 |
| vaultKey 不可售卖 | sellable 字段/集合/硬编码 | sellable 字段 |
| 雾战冻结 AI | 冻结全部/仅复制体/不冻结 | 冻结全部 2s |
| ESC 暂停 | 暂停菜单（3 项：继续/放弃/设置） | 完整菜单 |
| burn 叠加 | max/累加/覆盖 | 累加 DPS |
| soulCapture 排除 | excludeKinds/excludeHpLe/双重 | excludeKinds + 排除复制体 |
| spec 同步 | 直接修改/errata/本 spec | 直接修改 spec#1 |
| 无敌期 debuff | 应用/免疫/暂停 | 应用 debuff |
| M14 多身体 | 1 个/2 个 | 保持 1 个 + 修订 spec §5.9 |
| M16 深度层级 | 重排/不改 | 重排 spec §11.5 |
| 宝箱回退反馈 | 红闪/不加 | 红色闪烁 200ms |
| vault door toast | 加超时/不加 | 加 durationMs=2000 |
| forceOpen 重构 | 公开方法/保持强制写 | forceOpen() 公开方法 |
| farRoomAccumMs 清理 | delete/不改 | handleDeadEnemies 中 delete |
| 220px 合并 | 合并/不改 | spec §5.10 为主，其他引用 |

### §1.3 不修项（明确决策为"不修"）
- M1/M2 战斗实体上限（信任 #7 远房降级 + 浏览器承受）
- M3 复制体掉落（严格按 spec，接受经济通胀）
- S2 跨房间搜索距离限制（怪物 idle 态本来就全图乱逛可串房间，search 态更严格违反直觉）

## §2 spec#2 收尾（5 项）

### §2.1 偏差 #3 fistDash 命中防护

**位置**：`src/forgottenSanity/weapons/WeaponCombatAdapter.ts:257-273`

**修复**：路径命中后记录 `enemy.id` 到 `hitSet: Set<string>`，末端 `damageEnemiesInCircle` 增加 `excludeIds?: Set<string>` 参数，命中前 `if (excludeIds?.has(enemy.id)) continue`。

**测试**：`src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts` 补充：
- 路径命中 enemyA + 末端命中 enemyA → enemyA 总伤 40（非 80）
- 路径命中 enemyA + 末端命中 enemyB → enemyA 40 + enemyB 40

### §2.2 偏差 #4 rangedPiercing 敌侧墙检测 + spawnWallHitFx

**位置**：`src/forgottenSanity/combat/CombatManager.ts:688-732` 敌侧 `updateProjectiles` + 新增 `spawnWallHitFx`

**修复**：
- 敌侧 `updateProjectiles` 子步进循环补 `isWalkable` 检测，撞墙 → `spawnWallHitFx` + 移除
- `spawnWallHitFx(x, y)` 生成 3 个 1px 粒子，随机方向 50px/s，200ms 渐隐，color=0xffffff
- 新增 `wallHitParticles: WallHitParticle[]` 数组 + `updateWallHitParticles(deltaMs)` 推进
- 新文件 `src/forgottenSanity/combat/WallHitRenderer.ts` 用 `scene.add.rectangle(x, y, 2, 2, color)` 绘制，alpha = `life/maxLife`

**测试**：`src/tests/forgottenSanity/combat/combat-manager.test.ts` 补充：
- 敌侧投射物撞墙时停止推进
- 敌侧投射物撞墙时生成 3 个粒子
- 粒子 200ms 后销毁

### §2.3 偏差 #6 杨云红边二阶段全 CD 减半

**位置**：`src/forgottenSanity/combat/enemies/YangYunRed.ts`

**修复**：
- 新增 `private cdMultiplier = 1`
- `enterPhase2()` 设置 `this.cdMultiplier = 0.5`
- 所有 CD 读取处 `interval * this.cdMultiplier`：
  - `CHARGE_INTERVAL_MS * cdMultiplier`
  - `CHARGE_WINDUP_MS * cdMultiplier`
  - `CHARGE_DURATION_MS * cdMultiplier`
  - `CRACK_INTERVAL_MS * cdMultiplier`
  - `CRACK_WINDUP_MS * cdMultiplier`

**测试**：`src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts` 补充：
- phase2 时 charge windup = 500ms（原 1000 × 0.5）
- phase2 时 charge duration = 350ms（原 700 × 0.5）
- phase2 时 crack windup = 300ms（原 600 × 0.5）
- phase1 时 cdMultiplier = 1（所有 CD 原值）

### §2.4 偏差 #7 Enemy.currentRoomId 赋值

**位置**：`src/forgottenSanity/combat/Enemy.ts:218` + `src/forgottenSanity/combat/CombatManager.ts:548-564`

**修复**：`CombatManager.update(deltaMs, ctx)` 顶部、双路更新前先更新所有 enemy.currentRoomId：

```ts
for (const enemy of this.enemies) {
  if (enemy.dead) continue;
  const room = this.manifest.rooms.find(r =>
    enemy.x >= r.bounds.x && enemy.x <= r.bounds.x + r.bounds.width &&
    enemy.y >= r.bounds.y && enemy.y <= r.bounds.y + r.bounds.height
  );
  if (room) enemy.currentRoomId = room.id;
}
```

**测试**：`src/tests/forgottenSanity/combat/combat-manager.test.ts` 补充：
- enemy 在房间 A 内 → currentRoomId = A.id
- enemy 走到房间 B → currentRoomId 更新为 B.id
- enemy 在走廊（无房间） → currentRoomId 保持上次值
- 远房敌人走 4Hz 降级路径（依赖 currentRoomId 正确赋值）

### §2.5 偏差 #10 大地图雾战过滤

**位置**：`src/forgottenSanity/ui/Minimap.ts:176-196` `bigMapMarkers`

**修复**：复用小地图 L137-166 的过滤逻辑，渲染 chest/exit/body 前检查 `exploredSet.has(cellIdx)`，未探索跳过。

**测试**：`src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts` 扩展现有雾战过滤测试：
- 未探索 cell 内宝箱在大地图也不显示
- 已探索 cell 内宝箱在大地图显示

### §2.6 偏差 #11 LootTable + Inventory vaultKey

**位置**：`src/forgottenSanity/loot/LootTable.ts:88,106,146-155` + `src/forgottenSanity/loot/LootItem.ts` + `src/forgottenSanity/loot/Inventory.ts` + `src/forgottenSanity/meta/ShopManager.ts`

**修复**：
- `NORMAL_CHEST_LOOT_TABLE.itemCount = { min: 1, max: 5 }`
- `GILDED_CHEST_LOOT_TABLE.itemCount = { min: 1, max: 5 }`
- `rollIndependent` 实现真正"每稀有度独立判定"：4 次独立掷骰，每次 `rng*100 < weight` 决定该稀有度是否掉 1 件。可返回 0-4 件
- `LootItem` 接口增加 `sellable?: boolean`（默认 true）
- `material.vaultKey` 设 `sellable: false`
- `ShopManager.canSell(itemId)` 检查 `item.sellable !== false`
- `ShopManager.sell()` 失败原因增加 `'unsellable'`
- `loot-table.test.ts:126-133, 135-142` 修正为 `1-5` 范围

**测试**：
- `rollIndependent_YangYunRed_AllEntriesFail_ReturnsEmptyArray`
- `rollIndependent_YangYunRed_AllEntriesSucceed_ReturnsFourItems`
- `canSell('material.vaultKey')` 返回 false
- `sell('material.vaultKey', 1)` 返回 `{ok:false, reason:'unsellable'}`

## §3 E2E 真实化（3 项）

### §3.1 前置基础设施

#### §3.1.1 SceneDebugState 扩展

**位置**：`src/game/scaffoldState.ts`

新增 `forgottenSanity` 子状态：
```ts
export interface SceneDebugState {
  // ... 现有字段 ...
  forgottenSanity?: {
    scene: 'hub' | 'run' | 'none';
    inventory?: { items: Record<string, number>; vaultKey: number };
    combat?: {
      enemyCount: number;
      duplicateCount: number;
      farRoomCount: number;
      playerRoomId: string | null;
    };
    exploredCells?: number[];
    vaultDoorUnlocked?: boolean;
    vaultChestsOpened?: number;
    paused?: boolean;
  };
}
```

#### §3.1.2 ForgottenSanityScene Debug 钩子

**位置**：`src/forgottenSanity/ForgottenSanityScene.ts`

暴露 `window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__`：
```ts
export interface ForgottenSanityTestHooks {
  __testTriggerEliteDefeat(): void;
  __testGiveVaultKey(): void;
  __testMovePlayerToVaultDoor(): void;
  __testSpawnChest(roomId: string, isVaultChest: boolean): void;
  __testGetInventorySummary(): { items: Record<string, number>; vaultKey: number };
  __testGetCombatSummary(): { enemyCount: number; duplicateCount: number; farRoomCount: number };
  __testGetVaultState(): { doorUnlocked: boolean; chestsOpened: number };
  __testGetExploredCells(): number[];
  __testMovePlayerTo(roomId: string): void;
  __testTogglePause(): void;
}
```

**gate**：`if (import.meta.env.DEV || process.env.NODE_ENV === 'test')` 才挂载，生产构建移除。

#### §3.1.3 Playwright 浏览器安装

CI 安装命令：`npx playwright install chromium`（CI=true 时自动）。

### §3.2 三个 E2E spec 实施

#### §3.2.1 `forgotten-sanity-vault-door.spec.ts`

**移除 `test.fixme`**，断言链：
1. `page.goto('/')` → GameScene ready
2. `clickGamePoint(640, 440)` → 进入 HubScene → ForgottenSanityScene
3. `__testTriggerEliteDefeat()` → 触发红边击杀副作用链
4. `__testGetInventorySummary()` → 断言 vaultKey ≥ 1
5. `__testMovePlayerToVaultDoor()` → 玩家瞬移到 vault door hitArea
6. `page.keyboard.press('H')` → 触发 onInteractPressed
7. `__testGetVaultState()` → 断言 doorUnlocked=true
8. `__testSpawnChest(vaultRoomId, true)` → 在 vault 房间生成宝箱
9. `page.keyboard.press('H')` → 触发 vault chest 开启（跳过破译）
10. `__testGetVaultState()` → 断言 chestsOpened=1

#### §3.2.2 `forgotten-sanity-elite-defeat.spec.ts`

**移除 `test.fixme`**，断言链：
1. `page.goto('/')` → GameScene ready
2. `clickGamePoint(640, 440)` → ForgottenSanityScene
3. `__testTriggerEliteDefeat()` → 触发红边击杀副作用链
4. `__testGetInventorySummary()` → 断言 vaultKey=1（红边必掉钥匙）
5. `__testGetCombatSummary()` → 断言 enemyCount 增加（复制 ×2）
6. `__testGetCombatSummary()` → 断言 duplicateCount = 复制前 ×2
7. 验证 fog overlay 激活：检查页面 DOM 含「理智正在消散」文字（2s 内）
8. 等待 2000ms → fog overlay 消失

#### §3.2.3 `forgotten-sanity-fog-of-war.spec.ts`（新建）

1. `page.goto('/')` → ForgottenSanityScene
2. 玩家初始位置 → `__testGetCombatSummary()` 记录 playerRoomId
3. `__testGetExploredCells()` → 断言初始仅当前 cell 探索
4. `page.keyboard.down('W')` 1000ms → 移动玩家
5. `__testGetExploredCells()` → 断言 cell 数量增加
6. `__testSpawnChest(farRoomId, false)` → 在远房生成宝箱
7. 通过 minimap 截图断言：远房 chest 不在小地图显示
8. `page.keyboard.press('M')` → 打开大地图
9. 断言：远房 chest 在大地图也不显示
10. `__testMovePlayerTo(farRoomId)` → 玩家瞬移到远房
11. `page.keyboard.press('M')` → 重新打开大地图
12. 断言：远房 chest 现在显示

## §4 高风险盲区（4 项）

### §4.1 H1 红边击杀不保底

**位置**：`src/forgottenSanity/loot/LootTable.ts:146-155`

**修复**：实现真正的"每稀有度独立判定"（与 §2.6 共用修复），4 次独立掷骰全空时返回空数组（接受 32% 空掉落）。spec §10.1 不改。

**测试**：`src/tests/forgottenSanity/loot/loot-table.test.ts` 补充 `rollIndependent_YangYunRed_AllEntriesFail_ReturnsEmptyArray`。

### §4.2 H2 schemaVersion 迁移框架

**位置**：`src/forgottenSanity/state/forgottenSanityState.ts:111-113`

**修复**：
- `loadTyped` 增加可选参数 `migrations: Map<number, MigrationFn<S>> = NO_MIGRATIONS`
- `version-mismatch` 时查 `migrations.get(parsed.schemaVersion)`，存在则迁移 + 二次 validate
- 调用方暂不传 migrations（v1→v1 identity），框架就绪

```ts
type MigrationFn<S> = (state: unknown) => S;
const NO_MIGRATIONS = new Map<number, MigrationFn<unknown>>();

function loadTyped<S>(
  key: string,
  currentVersion: number,
  validate: (s: unknown) => s is S,
  fallback: () => S,
  migrations: Map<number, MigrationFn<S>> = NO_MIGRATIONS as Map<number, MigrationFn<S>>
): LoadResult<S> {
  // parse ...
  if (parsed.schemaVersion !== currentVersion) {
    const migrate = migrations.get(parsed.schemaVersion);
    if (!migrate) return { status: 'invalid', reason: 'version-mismatch', state: fallback() };
    const migrated = migrate(parsed);
    if (!validate(migrated)) return { status: 'invalid', reason: 'migration-failed', state: fallback() };
    return { status: 'ok', state: migrated };
  }
  // validate ...
}
```

**测试**：`src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts` 补充：
- 4 个 key 无 migrations 参数时正常工作
- 注入 v0→v1 migration 函数后 v0 存档能迁移
- migration 函数抛错时返回 `'migration-failed'`

### §4.3 H3 雾战 E2E

与 §3.2.3 合并实施。

### §4.4 H4 localStorage 拒绝+重置

**位置**：`src/forgottenSanity/state/forgottenSanityState.ts:68-90` `isStashState` / `isUpgradesState`

**修复**：增加数值范围校验，非法值 → 整个 schema 返回 fallback 默认。

```ts
export function isStashState(s: unknown): s is ForgottenSanityStashState {
  if (typeof s !== 'object' || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return false;
  if (!Array.isArray(obj.items)) return false;
  for (const item of obj.items) {
    if (typeof item.itemId !== 'string') return false;
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity)) return false;
    if (item.quantity < 0) return false;  // 新增
    if (!Number.isInteger(item.quantity)) return false;  // 新增
  }
  return true;
}

export function isUpgradesState(s: unknown): s is ForgottenSanityUpgradesState {
  if (typeof s !== 'object' || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return false;
  if (typeof obj.tiers !== 'object' || obj.tiers === null) return false;
  const tiers = obj.tiers as Record<string, unknown>;
  const validIds: ForgottenSanityUpgradeId[] = ['physique','swift','pickup','sharp','lucky','armory'];
  for (const id of validIds) {
    const v = tiers[id];
    if (v === undefined) continue;  // 允许缺失（默认 0）
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
    if (!Number.isInteger(v)) return false;
    const max = id === 'armory' ? 3 : 5;
    if (v < 0 || v > max) return false;  // 新增
  }
  return true;
}
```

`loadTyped` 在 validate 失败时返回 `{ status: 'invalid', reason: 'invalid-shape', state: fallback() }`，调用方使用 fallback（默认空 stash / 默认 0 tiers）。

**测试**：`src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts` 补充：
- `isStashState({schemaVersion:1, items:[{itemId:'x', quantity:-1}]})` 返回 false
- `isStashState({schemaVersion:1, items:[{itemId:'x', quantity:1.5}]})` 返回 false
- `isUpgradesState({schemaVersion:1, tiers:{physique:999}})` 返回 false
- `isUpgradesState({schemaVersion:1, tiers:{physique:6}})` 返回 false
- `isUpgradesState({schemaVersion:1, tiers:{armory:4}})` 返回 false（max 3）
- 非法值加载时 `loadStashState()` 返回 fallback 默认

## §5 中风险盲区（11 项）

### §5.1 M1/M2 战斗实体上限 — 不修

### §5.2 M3 复制体掉落 — 不修（严格按 spec）

### §5.3 M4 fistDash 无敌期 debuff

**位置**：`src/forgottenSanity/combat/PlayerCombat.ts:87-101`

**修复**：拆分 `takeDamage`：顶部先应用 debuff，再判 `invincibleMs` 跳过伤害数值。

```ts
takeDamage(instance: DamageInstance, timeMs: number): void {
  if (this.dead) return;
  // 应用 debuff（无敌期也应用）
  if (instance.debuff) {
    this.applyDebuff(instance.debuff, timeMs);
  }
  // 无敌期跳过伤害数值
  if (this.invincibleMs > 0) return;
  // ... 伤害计算 ...
}
```

**spec §3.2 修订**：补述"fistDash 无敌期免疫伤害数值，但 debuff（slow/stun/burn 等）仍应用"。

**测试**：`src/tests/forgottenSanity/combat/player-combat.test.ts` 补充：
- invincibleMs>0 时 takeDamage 不扣 HP
- invincibleMs>0 时 takeDamage 仍应用 debuff
- invincibleMs=0 时 takeDamage 扣 HP + 应用 debuff

### §5.4 M5 burn 累加 DPS

**位置**：`src/forgottenSanity/combat/Enemy.ts:280-303` `case 'burn'`

**修复**：`statusBurn.dps += newDps`，duration 取 max。

```ts
case 'burn': {
  const newDps = debuff.dps;
  const newDuration = debuff.duration;
  if (this.statusBurn === null) {
    this.statusBurn = { dps: newDps, remainingMs: newDuration };
  } else {
    this.statusBurn.dps += newDps;  // 累加
    this.statusBurn.remainingMs = Math.max(this.statusBurn.remainingMs, newDuration);
  }
  break;
}
```

**spec §3.4 修订**：补述"burn DPS 累加，duration 取 max"。

**测试**：`src/tests/forgottenSanity/combat/damage-type.test.ts` 或 `combat-manager.test.ts` 补充：
- burn 10/s 命中后 burn 3/s 命中 → DPS = 13/s（累加）
- burn 10/s duration 2s 命中后 burn 5/s duration 3s 命中 → duration = 3s（取两者最大值，不缩短）

### §5.5 M6 雾战遮罩冻结敌人 AI

**位置**：`src/forgottenSanity/combat/CombatManager.ts` 新增 `setFrozen(bool)` + `src/forgottenSanity/ForgottenSanityRunController.ts:647-652` `handleEliteDefeated` 调用

**修复**：
- `CombatManager.setFrozen(true)` 时 update 仅更新视觉（粒子/特效），不推进敌人 AI
- `handleEliteDefeated` 触发复制 ×2 后立即 `setFrozen(true)`，2s 后 `setFrozen(false)`
- 复用 `RED_EDGE_MASK_DURATION_MS = 2000` 常量

```ts
// CombatManager.ts
private frozen = false;
setFrozen(frozen: boolean): void { this.frozen = frozen; }
update(deltaMs: number, ctx: CombatContext): void {
  if (this.frozen) {
    this.updateVisualEffects(deltaMs);
    return;
  }
  // ... 现有逻辑 ...
}
```

**spec §9.3 修订**：补述"遮罩期间敌人冻结"。

**测试**：`src/tests/forgottenSanity/combat/combat-manager.test.ts` 补充：
- `setFrozen(true)` 后 update 不推进敌人位置
- `setFrozen(false)` 后 update 恢复正常

### §5.6 M7 三态机测试覆盖

**位置**：`src/tests/forgottenSanity/combat/enemies/*.test.ts`

补全三态转换矩阵测试：
- idle → alert（玩家进入视野）
- alert → chase（确认玩家位置）
- chase → search（失去视线 N 秒）
- search → alert（重新看到玩家）
- search → idle（搜索超时未找到）
- chase → idle（玩家死亡/撤离）

每转换断言：状态字段、tint、头顶图标、AI 行为（移动方向/速度）。

### §5.7 M8 ESC 暂停菜单（3 项）

**位置**：`src/forgottenSanity/ForgottenSanityScene.ts:105-109` + 新增 `src/forgottenSanity/ui/PauseMenu.ts`

ESC 行为优先级：
1. 大地图可见 → 关闭大地图
2. 否则 → 切换暂停菜单

**菜单项**（3 项）：
1. **继续** — `togglePause()` 关闭菜单 + `setFrozen(false)`
2. **放弃对局** — `runController.abandonRun()` 调用 `runDeathSettlement()`（按死亡处理：本局战利品全丢，仓库不变）+ 返回 HubScene
3. **设置** — 子菜单含：
   - 音效开关（toggle，默认开）
   - 像素滤镜开关（toggle，默认开）
   - 返回上一级

**暂停时**：
- `combatManager.setFrozen(true)` 复用 §5.5 frozen 机制
- `ForgottenSanityScene.update` 顶部 `if (this.paused) return`
- 半透明黑色遮罩 0x000000 alpha 0.7 + 标题"已暂停" + 3 按钮

**abandonRun 实现**：
```ts
// ForgottenSanityRunController.ts
abandonRun(): void {
  // 按"死亡"处理：本局战利品全丢，仓库不变
  this.scene.runDeathSettlement(this.inventory);
}
```

**spec §9.2 修订**：补述 ESC 行为优先级 + 暂停菜单 3 项 + 放弃对局按死亡处理 + 设置子菜单内容。

**测试**：`src/tests/forgottenSanity/forgotten-sanity-scene.test.ts` 或新文件：
- 大地图可见时 ESC 关闭大地图不暂停
- 非大地图时 ESC 进入暂停 + frozen=true
- 暂停时再按 ESC 继续 + frozen=false
- 放弃对局调用 runDeathSettlement 不调用 depositRunInventory
- 设置子菜单可切换音效/像素滤镜
- 暂停时 update 跳过

### §5.8 M9 localStorage 原子性

**位置**：`src/forgottenSanity/state/forgottenSanityState.ts` 新增 `atomicSaveMulti`

**修复**：封装 `atomicSaveMulti(entries: Array<{key, value, oldValue}>)`：先备份旧值 → 逐个 setItem → 任一失败回滚全部。

```ts
function atomicSaveMulti(
  entries: Array<{ key: string; value: string; oldValue: string | null }>
): boolean {
  const saved: Array<{ key: string; value: string | null }> = [];
  try {
    for (const e of entries) {
      saved.push({ key: e.key, value: localStorage.getItem(e.key) });
      localStorage.setItem(e.key, e.value);
    }
    return true;
  } catch (err) {
    for (const s of saved) {
      try {
        if (s.value === null) localStorage.removeItem(s.key);
        else localStorage.setItem(s.key, s.value);
      } catch { /* 回滚失败只能记录 */ }
    }
    return false;
  }
}
```

`grantStarterPackIfNeeded` 改用 `atomicSaveMulti` 同时写 stash + progress。

**测试**：
- 全部成功返回 true
- 模拟第二个 setItem 抛 QuotaExceededError → 第一个 setItem 回滚 + 返回 false
- 回滚失败时记录 console.error 但不抛

### §5.9 M10 ESC 暂停菜单测试 — 与 §5.7 合并

### §5.10 M11 soulCapture 排除规则

**位置**：`src/forgottenSanity/weapons/WeaponRegistry.ts:325`

**修复**：`excludeKinds: ['yangYunRed', 'danYuxuanBody']`，移除 `excludeHpLe:1`。`CombatManager.killRandomEnemyInRadiusExcluding` 同时过滤 `isDuplicate=true`（保守排除复制体）。

```ts
// WeaponRegistry.ts soulBanner ultimate
ultimate: {
  kind: 'soulCapture',
  cooldownMs: 120_000,
  excludeKinds: ['yangYunRed', 'danYuxuanBody'],
  // ... 其他字段 ...
}

// CombatManager.killRandomEnemyInRadiusExcluding
private killRandomEnemyInRadiusExcluding(
  originX: number, originY: number, radius: number,
  excludeKinds: readonly string[]
): string | null {
  const candidates = this.enemies.filter(e =>
    !e.dead &&
    !excludeKinds.includes(e.kind) &&
    !e.isDuplicate &&  // 复制体保守排除
    this.distance(e.x, e.y, originX, originY) <= radius
  );
  if (candidates.length === 0) return null;
  const target = candidates[Math.floor(this.rng.float(0, candidates.length))];
  target.kill();
  return target.id;
}
```

**测试**：`src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts` 或 `weapon-registry.test.ts` 补充：
- soulCapture 不命中 yangYunRed
- soulCapture 不命中 danYuxuanBody
- soulCapture 不命中 isDuplicate 复制体
- soulCapture 命中其他普通敌人

### §5.11 其他次要中风险（4 项）

#### §5.11.1 M14 多身体 — 保持 1 个 + 修订 spec §5.9

`src/forgottenSanity/ForgottenSanityRunController.ts:577-586` 不改，spec §5.9 改为"对局内最多 1 个身体"。

#### §5.11.2 M15/M16 spec §11.5 深度层级重排

spec §11.5 重排为 `floor=0, walls=1, chest=3, door=6, label=7, hitArea=8, player=10, UI=1000+`。代码无改动。

#### §5.11.3 4.3 宝箱回退红色闪烁

**位置**：`src/forgottenSanity/loot/ChestDecrypt.ts:164-224`

**修复**：`decayProgress` 触发时进度弧颜色变红 0xff4444 持续 200ms，恢复 0xffd700。

**spec §7.4 修订**：补述"回退时进度弧红色闪烁 200ms"。

**测试**：`src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts` 或 `chest-decrypt.test.ts` 补充：
- decayProgress 触发时 progressArcColor = 0xff4444
- 200ms 后 progressArcColor = 0xffd700

#### §5.11.4 4.4 vault door toast 自动消失

**位置**：`src/forgottenSanity/ForgottenSanityRunController.ts:733-744`

**修复**：`showToast(msg, durationMs = 2000)` 默认 2000ms 自动消失。`scene.showToast` 实现需支持超时（若不存在则新增简单 toast 实现）。

**测试**：验证 toast 2000ms 后从 DOM 移除。

### §5.12 美化/重构（3 项）

#### §5.12.1 2.6 chestDecrypt forceOpen() 公开方法

**位置**：`src/forgottenSanity/loot/chestDecryptState.ts` + `src/forgottenSanity/loot/ChestDecrypt.ts:112-117`

**修复**：`ChestDecryptState` 暴露 `forceOpen(): void` 公开方法，内部 `this.phase = 'opened'` + 重置 openElapsedMs。`ChestDecrypt` isVaultChest 路径调用 `state.forceOpen()` 替代 `as unknown as` 强制写。

**测试**：`forceOpen()` 后 phase = 'opened'，openElapsedMs = 0。

#### §5.12.2 1.2 farRoomAccumMs 清理

**位置**：`src/forgottenSanity/combat/CombatManager.ts` `handleDeadEnemies`

**修复**：`enemies.splice(i, 1)` 时同步 `this.farRoomAccumMs.delete(enemy.id)`。

**测试**：敌人死亡后 `farRoomAccumMs.has(enemy.id)` 返回 false。

#### §5.12.3 spec §5.10 220px 三处定义合并

spec §5.10 为主定义 `RED_EDGE_VISIBILITY_RADIUS_PX=220`，§9.3 / §11.x 改为引用 §5.10。代码无改动。

## §6 spec 文档同步（3 项）

### §6.1 S1 loot manifest 数量

spec#1 §11.3 改为"49 个 loot manifest 条目（48 碎片 + 1 仓库钥匙）"。spec#1 §6「48 件」不变。

### §6.2 S3 玩家碰撞几何

spec#1 §3.2 补述"玩家碰撞用 8×8 像素点检测（中心点判定）"。代码已是点检测，仅文档同步。

### §6.3 S4 复活计时器清除

spec#1 §5.9 B 补述"身体死亡时复活计时器随之清除（boundHeads 清空，deadHeads 不再复活）"。代码 `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts:120-125` 已正确实现，仅文档同步。

## §7 实施顺序

### Phase 1：基础设施（无依赖）
1. SceneDebugState 扩展 + ForgottenSanityScene 钩子（§3.1）
2. H4 localStorage 校验（§4.4）
3. H2 schemaVersion 迁移框架（§4.2）
4. M9 localStorage 原子性（§5.8）

### Phase 2：spec#2 收尾（依赖 Phase 1 测试基础设施）
5. #3 fistDash hitSet（§2.1）
6. #4 敌侧墙检测 + spawnWallHitFx（§2.2）
7. #6 二阶段 cdMultiplier（§2.3）
8. #7 currentRoomId 赋值（§2.4）
9. #10 大地图雾战过滤（§2.5）
10. #11 LootTable + Inventory vaultKey（§2.6）

### Phase 3：中风险（依赖 Phase 2 战斗系统）
11. M4 无敌期 debuff（§5.3）
12. M5 burn 累加（§5.4）
13. M6 雾战冻结（§5.5）
14. M8 ESC 暂停菜单（§5.7）
15. M11 soulCapture 排除（§5.10）
16. M14 多身体（§5.11.1，仅 spec）
17. M15/M16 深度层级（§5.11.2，仅 spec）
18. 4.3 宝箱回退红闪（§5.11.3）
19. 4.4 toast 超时（§5.11.4）
20. 2.6 forceOpen（§5.12.1）
21. 1.2 farRoomAccumMs 清理（§5.12.2）
22. 220px 合并（§5.12.3，仅 spec）

### Phase 4：E2E + 文档同步（依赖 Phase 2/3）
23. 3 个 E2E spec 真实化（§3.2）
24. S1/S3/S4 spec 文档同步（§6）
25. M7 三态机测试覆盖（§5.6）
26. 验证 §5.7 ESC 暂停菜单测试已随 §5.7 实施完成（无独立步骤）

## §8 自验收门槛

| 类别 | 门槛 |
|------|------|
| TypeScript | `npm run typecheck` 通过 |
| 单元测试 | `npm run test:run` 通过（原 21 + 新增 ~40 = ~61） |
| E2E | `npm run e2e` 通过（原 28 + 新增 3 = 31，spec#2 §8 门槛达成） |
| verify | `npm run verify` 通过 |

spec#2 §8 原"31 specs 全部通过"门槛字面达成（28 原 + 3 新 E2E）。

## §9 文件改动清单

### 新增
- `tests/e2e/forgotten-sanity-fog-of-war.spec.ts`
- `src/forgottenSanity/combat/WallHitRenderer.ts`（spawnWallHitFx 渲染）
- `src/forgottenSanity/ui/PauseMenu.ts`

### 修改（核心）
- `src/game/scaffoldState.ts`（SceneDebugState 扩展）
- `src/forgottenSanity/ForgottenSanityScene.ts`（钩子 + 暂停菜单）
- `src/forgottenSanity/ForgottenSanityRunController.ts`（abandonRun + handleEliteDefeated frozen）
- `src/forgottenSanity/combat/CombatManager.ts`（setFrozen + spawnWallHitFx + currentRoomId 更新 + farRoomAccumMs 清理）
- `src/forgottenSanity/combat/Enemy.ts`（burn 累加）
- `src/forgottenSanity/combat/PlayerCombat.ts`（无敌期 debuff）
- `src/forgottenSanity/combat/EnemyViewRenderer.ts`（WallHitRenderer 集成）
- `src/forgottenSanity/combat/enemies/YangYunRed.ts`（cdMultiplier）
- `src/forgottenSanity/loot/LootTable.ts`（itemCount + rollIndependent）
- `src/forgottenSanity/loot/LootItem.ts`（sellable 字段）
- `src/forgottenSanity/loot/Inventory.ts`（vaultKey 不可售卖检查）
- `src/forgottenSanity/loot/chestDecryptState.ts`（forceOpen）
- `src/forgottenSanity/loot/ChestDecrypt.ts`（红闪 + forceOpen 调用）
- `src/forgottenSanity/meta/ShopManager.ts`（canSell + unsellable）
- `src/forgottenSanity/state/forgottenSanityState.ts`（校验 + 迁移 + 原子性）
- `src/forgottenSanity/ui/Minimap.ts`（大地图过滤）
- `src/forgottenSanity/weapons/WeaponCombatAdapter.ts`（fistDash hitSet）
- `src/forgottenSanity/weapons/WeaponRegistry.ts`（soulCapture excludeKinds）

### 修改（测试）
- 现有 forgottenSanity 测试文件扩展：
  - `src/tests/forgottenSanity/weapons/weapon-ultimate.test.ts`（fistDash hitSet + soulCapture 排除）
  - `src/tests/forgottenSanity/combat/combat-manager.test.ts`（敌侧墙检测 + spawnWallHitFx + currentRoomId + setFrozen + farRoomAccumMs 清理）
  - `src/tests/forgottenSanity/combat/enemies/yang-yun-red.test.ts`（cdMultiplier 二阶段全 CD 减半）
  - `src/tests/forgottenSanity/loot/loot-table.test.ts`（itemCount 1-5 + rollIndependent 独立掷骰 + 0 件返回）
  - `src/tests/forgottenSanity/loot/chest-decrypt-state.test.ts`（forceOpen + 红闪断言）
  - `src/tests/forgottenSanity/forgotten-sanity-run-controller.test.ts`（大地图雾战过滤 + abandonRun）
- 新增测试文件：
  - `src/tests/forgottenSanity/state/forgotten-sanity-state.test.ts`（H4 校验 + H2 迁移 + M9 原子性）
  - `src/tests/forgottenSanity/combat/player-combat.test.ts`（无敌期 debuff）
  - `src/tests/forgottenSanity/combat/damage-type.test.ts`（burn 累加）
  - `src/tests/forgottenSanity/forgotten-sanity-scene.test.ts`（ESC 暂停菜单 + 设置子菜单）
  - `src/tests/forgottenSanity/meta/shop-manager.test.ts`（vaultKey 不可售卖）
  - `src/tests/forgottenSanity/combat/enemies/*-state-machine.test.ts`（三态机转换矩阵，覆盖 8 种敌人）

### 修改（spec 文档）
- `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`（S1/S3/S4 + M14/M15/M16 + 220px 合并 + 新增 ESC 暂停 + 雾战冻结 + burn 累加 + 玩家碰撞 + 无敌期 debuff + itemCount min=1 + rollIndependent + vaultKey 不可售卖 + 宝箱回退红闪 等补述）

## §10 不修项汇总

| 项 | 原因 |
|----|------|
| M1/M2 战斗实体上限 | 信任 #7 远房降级 + 浏览器承受能力 |
| M3 复制体掉落 | 严格按 spec，接受经济通胀 |
| S2 跨房间搜索距离 | 怪物 idle 态本来就全图乱逛可串房间，search 态加距离限制违反直觉 |
| 红边击杀保底 | 严格按 spec，接受 32% 空掉落 |
