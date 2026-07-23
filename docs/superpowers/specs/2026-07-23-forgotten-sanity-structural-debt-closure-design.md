# 被遗忘的理智 — 结构债收口设计

**生成日期**：2026-07-23
**对照 spec**：
- `2026-07-17-tomb-raid-mode-design.md`（设计 spec，下称 spec#1）
- `2026-07-18-forgotten-sanity-spec-compliance-fix-design.md`（修复 spec，下称 spec#2）
- `2026-07-19-forgotten-sanity-audit-fix-design.md`（审核修复 spec，下称 spec#3）
- `2026-07-22-forgotten-sanity-lost-notes-design.md`（遗落纸条 spec，下称 spec#4）

**性质**：关闭 spec#2 §9 承诺的「结构性偏差 A-J 单独 spec」（自 2026-07-18 起悬空未创建）+ 收口 2026-07-23 代码审核发现的 P0/P1/P2 结构债。纯修复型 spec，零新功能。

## §1 背景与动机

### §1.1 悬空承诺
spec#2 §9 明确：「结构性偏差 A-J（类型契约、字段命名、模块拆分）：单独 spec。」核查 spec#3、spec#4，**该 spec 从未创建**。这是被显式承诺却彻底悬空的 TODO，是多个高风险问题的共同根因。

### §1.2 审核发现
2026-07-23 对 forgotten sanity 模式做完整审核（4 spec + 5 plan + 46 实现文件 + ~30 测试文件），确认 spec#2/#3/#4 功能均已落地，但实现过程累积结构债：

| 严重度 | 项 | 根因 |
|--------|----|------|
| P0 | `__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__` / `__HUB_ACTIVE__` 未在 Window 接口声明 | 违反 AGENTS.md 硬约定 |
| P0 | forgotten sanity 50+ 素材混入 assets.ts 扁平清单，缺失卡死整个游戏 | 破坏「零侵入剧情模式」承诺 |
| P0 | A-J 结构性偏差未关闭 | spec#2 §9 悬空承诺 |
| P1 | ForgottenSanityRunController.ts 1116 行 | 单文件职责过载 |
| P1 | CombatManager.ts 1083 行 | 单文件职责过载 |
| P1 | assets.ts 1587 行（项目最大文件） | 混合正传 + forgotten sanity |
| P1 | RunController 仅源码契约测试（fs.readFileSync + regex） | 运行时行为无单测保护 |
| P1 | `defaultEnemyOpts` 在 CombatManager 与 RunController 双源维护 | 漂移风险 |
| P2 | Minimap.ts 硬编码地图常量与 mapState 重复 | 漂移风险 |
| P2 | ForgottenSanityHubScene 未暴露 `scene: 'hub'` 调试状态 | E2E 断言缺口 |
| P2 | 220px 雾战采用简化实现（黑底+透明圆），BitmapMask 未落地 | plan#5 自承「留待 polish」 |
| P2 | WeaponCombatAdapter 模块级可变计数器 | 测试隔离风险 |
| P2 | `as unknown as` 双重 cast 绕过类型检查 | A-J 类型契约症状 |
| P3 | 硬编码视口尺寸（SOUL_CAPTURE/MobileControls/duplicateSilentOnes） | 与 GAME_WIDTH/HEIGHT 解耦 |
| P3 | `createEnemy` 未注册返回 null | 静默失败风险 |
| P3 | LootTable 多处 `fallback[...]!` 非空断言 | 空数组运行时 crash |

### §1.3 审核误报修正
2026-07-23 初版审核曾判定「YangYunRed 中立→激怒机制未入 spec」。复核 spec#1 §5.10（「初始中立：巡逻移动不攻击，视野 350px」「激怒条件：在杨云视野(350px)内攻击任何缄默者或杨云本人 → 永久敌对」）+ §5.11.9（「350px 激怒视野…永久激怒，激怒后启用 §5.10 攻击模式，不走三态机。激怒为单向不可逆」），**该机制已在 spec 中详细记录**。本 spec 不再涉及该机制的正名。

## §2 修复原则
- **spec 字面对齐**：A-J 按 spec#2 §9 原承诺范围（类型契约、字段命名、模块拆分）
- **TDD 强制**：每项修复先写失败测试（RED）→ 实现（GREEN）→ 回归（SURFACE）
- **零侵入剧情模式**：改动限于 `src/forgottenSanity/` + `src/data/assets.ts` + `src/scenes/PreloadScene.ts`（仅清单拆分）+ spec 文档
- **功能冻结**：本 spec 实施期间不接受 forgotten sanity 新功能 spec，避免新功能在待重构结构上扩散
- **依赖顺序**：Phase 1（A-J 类型契约）→ Phase 2（拆分）→ Phase 3（BitmapMask + 低风险）→ Phase 4（测试 + 文档同步）

## §3 决策矩阵

| 类别 | 项 | 决策 |
|------|----|------|
| A-J 类型契约 | CombatPort cast 方式 | `CombatManager implements CombatPort`，取消 `as unknown as` |
| A-J 类型契约 | Enemy 钩子暴露方式 | 基类声明可选方法，取代 duck-typing |
| A-J 类型契约 | window 全局 | 补 `declare global { interface Window { ... } }` |
| A-J 字段命名 | defaultEnemyOpts 单源 | 抽到 `combat/enemyDefaults.ts` |
| A-J 字段命名 | Minimap 地图常量 | import 共享 `forgottenSanityMapState` 常量 |
| A-J 模块拆分 | RunController | → `RunLifecycle` + `RunInteractionHandler` + `RunTestHooks` |
| A-J 模块拆分 | CombatManager | → `EnemySystem` + `ProjectileSystem` + `ZoneSystem` + `ContactDamageSystem` |
| A-J 模块拆分 | assets.ts | → `mainGame.ts` + `forgottenSanity.ts` + `index.ts`，统一 preload 不变 |
| 素材隔离 | preload 架构 | 拆清单但仍统一 preload，forgotten sanity 缺失可独立降级（后续 polish） |
| 调试状态 | HubScene scene 标记 | 补 `scene: 'hub'`，shutdown 写 `scene: 'none'` |
| 雾战实现 | 220px 孔洞 | 升级 `Phaser.Display.Masks.BitmapMask`，简化版删除 |
| 测试策略 | RunController 单测 | 拆分后逐模块 mock scene 实例化单测，目标 8-12 个 |
| 低风险 | 视口硬编码 | 引用 `GAME_WIDTH/HEIGHT` |
| 低风险 | 模块级计数器 | 改实例字段 |
| 低风险 | createEnemy null | 改 throw |
| 低风险 | LootTable 非空断言 | 加空数组守卫 |
| 音频 | spec §7.3 悬空 | 本 spec §9 声明不做，spec#1 §7.3 标注「未规划」 |
| 验证门槛 | 自验收 | 完成后重跑完整审核，确认无 P0/P1 残留 |

## §4 Phase 1：A-J 类型契约（P0）

### §4.1 CombatManager implements CombatPort
**位置**：`src/forgottenSanity/combat/CombatManager.ts` + `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` 的 `CombatPort` 接口 + `src/forgottenSanity/ForgottenSanityRunController.ts` 的 `as unknown as` cast

**修复**：
- `CombatManager` 显式 `implements CombatPort`（CombatPort 已是 CombatManager 子集接口，仅声明对齐）
- RunController 中 `new CombatManager(...) as unknown as CombatPort` 改为 `new CombatManager(...)`（直接赋值给 `CombatPort` 类型字段）
- 移除 RunController 中所有对 CombatManager 的 `as unknown as` cast

**测试**：`src/tests/forgottenSanity/combat/combat-manager.test.ts` 补充：
- `CombatManager` 实例可赋值给 `CombatPort` 类型变量（编译期断言）
- RunController 构造后 `controller.combatManager` 类型为 `CombatManager`（非 `unknown`）

### §4.2 Enemy 基类声明可选钩子
**位置**：`src/forgottenSanity/combat/Enemy.ts` + `src/forgottenSanity/combat/CombatManager.ts` 的 duck-typing 探测

**修复**：
- `Enemy` 基类声明可选方法：
  ```ts
  aggroState?: 'neutral' | 'hostile';
  enrage?(): void;
  tickSummonTimer?(deltaMs: number): void;
  tickHeadRevive?(deltaMs: number): void;
  ```
- CombatManager 中 `as unknown as { aggroState?: ...; enrage?(): void }` 改为直接调用 `enemy.enrage?.()` / `enemy.tickSummonTimer?.(deltaMs)` 等
- YangYunRed / DanYuxuanBody 子类显式实现这些方法（覆盖基类可选声明）

**测试**：`src/tests/forgottenSanity/combat/enemy-base.test.ts` 补充：
- 基类 Enemy 实例调用 `enemy.enrage?.()` 不抛错（undefined 安全）
- YangYunRed 实例 `aggroState === 'neutral'` 初始值
- DanYuxuanBody 实例 `tickSummonTimer` 为函数

### §4.3 window 全局 declare global
**位置**：新增 `src/forgottenSanity/types/globals.d.ts` 或在现有 `src/game/scaffoldState.ts` 的 Window 接口声明中追加

**修复**：
```ts
declare global {
  interface Window {
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: ForgottenSanityTestHooks;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
  }
}
```
- `ForgottenSanityTestHooks` 接口 export 自 `ForgottenSanityScene.ts`
- 与 `__YING_ZHONG_JIU_SCENE_STATE__` 对齐，仅 DEV/test 挂载

**测试**：`src/tests/forgottenSanity/types/globals.test.ts`（编译期类型断言）：
- `window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__` 类型为 `ForgottenSanityTestHooks | undefined`
- `window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__` 类型为 `boolean | undefined`

### §4.4 defaultEnemyOpts 单源化
**位置**：新增 `src/forgottenSanity/combat/enemyDefaults.ts` + `src/forgottenSanity/combat/CombatManager.ts` + `src/forgottenSanity/ForgottenSanityRunController.ts`

**修复**：
- 抽取 `enemyDefaults.ts`，export `DEFAULT_ENEMY_OPTS: Record<EnemyKind, EnemyOpts>` 常量
- CombatManager 与 RunController 均 `import { DEFAULT_ENEMY_OPTS }`，删除各自本地表
- `createEnemy(kind, opts?)` 默认参数引用 `DEFAULT_ENEMY_OPTS[kind]`

**测试**：`src/tests/forgottenSanity/combat/enemy-defaults.test.ts`：
- `DEFAULT_ENEMY_OPTS` 覆盖全部 11 个 EnemyKind
- CombatManager 与 RunController 不再持有本地 `defaultEnemyOpts` 字段（源码契约：grep 0 命中）

### §4.5 Minimap 共享地图常量
**位置**：`src/forgottenSanity/ui/Minimap.ts` + `src/forgottenSanity/map/forgottenSanityMapState.ts`

**修复**：
- `forgottenSanityMapState.ts` 已 export `WORLD_WIDTH` / `WORLD_HEIGHT` / `GRID_COLS` / `GRID_ROWS` / `CELL_WIDTH` / `CELL_HEIGHT`
- Minimap.ts 删除顶部硬编码 `MAP_WORLD_WIDTH=5000` 等，改 `import { WORLD_WIDTH, GRID_COLS, CELL_WIDTH, ... } from '../map/forgottenSanityMapState'`
- Minimap 内部引用全部改用 import 的常量

**测试**：`src/tests/forgottenSanity/forgotten-sanity-minimap.test.ts` 补充：
- Minimap 渲染坐标计算基于 import 的常量（间接验证，行为不变即可）

### §4.6 HubScene 调试状态标记
**位置**：`src/forgottenSanity/ForgottenSanityHubScene.ts`

**修复**：
- `create()` 中追加 `getSceneDebugState().forgottenSanity = { scene: 'hub' }`
- `shutdown()` 中追加 `getSceneDebugState().forgottenSanity = { scene: 'none' }`（与 RunScene 对齐）

**测试**：`src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts` 补充：
- HubScene.create 后 `getSceneDebugState().forgottenSanity.scene === 'hub'`
- HubScene.shutdown 后 `=== 'none'`

## §5 Phase 2：三大文件拆分

### §5.1 ForgottenSanityRunController 拆分
**位置**：`src/forgottenSanity/ForgottenSanityRunController.ts`（1116 行）

**拆分目标**：
- `RunLifecycle.ts`（~400 行）：构造器 14 步（地图生成 → 渲染 → 升级注入 → PlayerCombat → CombatManager → spawn → 交互绑定）+ `update(time, delta)` + `runEvacuation()` + `abandonRun()` + `handleEliteDefeated()`
- `RunInteractionHandler.ts`（~300 行）：`onInteractPressed` / `onAttackPressed` / `onUltimatePressed` / `handleMovement` / `applyKnockback` / `checkWalkable` / 交互优先级（note → vault → chest → exit）
- `RunTestHooks.ts`（~200 行）：11 个 `*ForTest` 方法 + `ForgottenSanityTestHooks` 接口实现
- `ForgottenSanityRunController.ts` 保留为门面（~200 行）：组合上述三者，对外暴露统一 API

**约束**：
- 对外 API 不变（ForgottenSanityScene 调用的方法签名不变）
- E2E 钩子接口不变（`__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__` 暴露的方法不变）
- 三个子模块通过构造器注入共享状态（manifest / inventory / combatManager / playerCombat / scene）

**测试**：拆分后每个子模块独立单测（见 §7）

### §5.2 CombatManager 拆分
**位置**：`src/forgottenSanity/combat/CombatManager.ts`（1083 行）

**拆分目标**：
- `EnemySystem.ts`：enemies 数组 + AI 调度（近 60Hz / 远 4Hz）+ `applyEliteAggro` + `duplicateSilentOnes` + `handleDeadEnemies` + 接触伤害
- `ProjectileSystem.ts`：projectiles + playerProjectiles + 4px substepping + 撞墙检测 + `spawnWallHitFx`
- `ZoneSystem.ts`：zones + playerZones + windup-burst-dot 区域
- `WallHitParticleSystem.ts`：wallHitParticles + `updateWallHitParticles`
- `CombatManager.ts` 保留为门面：组合上述 + `update(deltaMs)` 总调度 + `setFrozen` + `playerAttack` + 实现 `CombatPort`

**约束**：
- `CombatPort` 接口不变（WeaponCombatAdapter 调用的方法签名不变）
- `setFrozen` 仍由门面统一调度到各子系统
- 子系统通过构造器注入共享 enemies/projectiles/zones 数组引用

### §5.3 assets.ts 拆分
**位置**：`src/data/assets.ts`（1587 行）

**拆分目标**：
- `src/data/assets/mainGameAssets.ts`：正传素材清单（floor.tile / prop.* / sprite.* / portrait.* / doors.* / officeFurniture.* 等）
- `src/data/assets/forgottenSanityAssets.ts`：forgotten sanity 素材清单（loot.* / note.* / sprite.forgottenSanity.* / ui.rarityFrame.* / ui.skillFrame / fx.bloodEye / fx.lockpick.* 等）
- `src/data/assets/index.ts`：`export const assetManifest = [...mainGameAssets, ...forgottenSanityAssets]` + `validateAssetManifest` + `allowedAssetRoots` + `approvedProgrammaticAssets` + `getMissingAssetBlockers`
- `src/data/assets.ts` 改为 re-export `from './assets/index'`（保持现有 import 路径不变，向后兼容）

**约束**：
- `assetManifest` 最终内容不变（顺序可能变，但条目集合不变）
- `assets.test.ts` 的 `expectedFinalAssetPaths` 断言不变
- PreloadScene.ts 不改动（仍 `import { getStaticAssetEntries } from '../data/assetUrls'`，统一 preload）
- **故障隔离**：后续 polish 可让 PreloadScene 区分 `requiredFirstActAssetKeys`（正传必需）与 `optionalForgottenSanityKeys`（缺失时降级），本 spec 不实现降级逻辑，仅完成清单拆分

## §6 Phase 3：BitmapMask + 低风险打包

### §6.1 RedEdgeFogOverlay 升级 BitmapMask
**位置**：`src/forgottenSanity/ui/RedEdgeFogOverlay.ts`

**修复**：
- 简化版（黑底 rectangle + 透明 circle）替换为 `Phaser.Display.Masks.BitmapMask`
- mask 形状：以玩家为中心、半径 `RED_EDGE_VISIBILITY_RADIUS_PX=220` 的圆形可见孔洞
- mask 跟随玩家位置更新（`update(playerX, playerY)`）
- 2s 文字遮罩逻辑不变
- `activate()` / `deactivate()` / `isActive()` API 不变

**测试**：`src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts` 更新：
- 常量不变（`RED_EDGE_VISIBILITY_RADIUS_PX=220` / `RED_EDGE_MASK_DURATION_MS=2000` / `FOG_MASK_DEPTH=1990`）
- activate 后 `isActive()` true
- update 跟随玩家中心（mask 位置 = 玩家位置）
- deactivate 清除

### §6.2 硬编码视口尺寸
**位置**：
- `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` 的 `SOUL_CAPTURE_SCREEN_RADIUS=800`
- `src/forgottenSanity/ui/MobileControls.ts` 的 4 按钮坐标
- `src/forgottenSanity/ForgottenSanityRunController.ts` 的 `duplicateSilentOnes(1280, 720)`

**修复**：
- `import { GAME_WIDTH, GAME_HEIGHT } from '../../game/config'`（或现有 game config 路径）
- `SOUL_CAPTURE_SCREEN_RADIUS` 改为 `Math.ceil(Math.hypot(GAME_WIDTH, GAME_HEIGHT) / 2)` 或保留 800 但加注释引用 GAME_WIDTH/HEIGHT
- MobileControls 4 按钮坐标改为基于 `GAME_WIDTH - offset` / `GAME_HEIGHT - offset` 计算
- `duplicateSilentOnes` 视口参数改用 `GAME_WIDTH, GAME_HEIGHT`

**测试**：相关现有测试行为不变（参数化后值相同）

### §6.3 WeaponCombatAdapter 模块级计数器
**位置**：`src/forgottenSanity/weapons/WeaponCombatAdapter.ts` 第 88-89 行

**修复**：
- `let playerProjectileCounter = 0` / `let playerZoneCounter = 0` 改为 `WeaponCombatAdapter` 实例字段
- 构造器初始化 `this.playerProjectileCounter = 0`
- 所有引用改 `this.playerProjectileCounter`

**测试**：`src/tests/forgottenSanity/weapons/weapon-integration.test.ts` 补充：
- 两个 WeaponCombatAdapter 实例的计数器独立（实例 A 发射投射物不影响实例 B 计数）

### §6.4 createEnemy 未注册 throw
**位置**：`src/forgottenSanity/combat/Enemy.ts` 的 `createEnemy(kind, opts)` Factory

**修复**：
- 未注册 kind 从 `return null` 改为 `throw new Error(\`Enemy kind not registered: ${kind}\`)`
- 调用方（CombatManager / RunController）移除 null 检查

**测试**：`src/tests/forgottenSanity/combat/enemy-base.test.ts` 补充：
- `createEnemy('invalidKind' as EnemyKind)` 抛错
- 错误消息含 kind 名

### §6.5 LootTable 非空断言守卫
**位置**：`src/forgottenSanity/loot/LootTable.ts` 多处 `fallback[...]!`

**修复**：
- 每处 `fallback[Math.floor(rng() * fallback.length)]!` 前加 `if (fallback.length === 0) throw new Error('LootTable fallback empty')`
- 或提取 `pickFromFallback(arr, rng)` 工具函数统一守卫

**测试**：`src/tests/forgottenSanity/loot/loot-table.test.ts` 补充：
- 空 fallback 抛错（如构造异常配置）

## §7 Phase 4：测试补全 + 文档同步

### §7.1 RunController 拆分后模块单测
**目标**：8-12 个新单测，覆盖 RunLifecycle / RunInteractionHandler / RunTestHooks 各关键路径

**RunLifecycle 单测**（mock scene 实例化）：
- 构造器完成后 manifest / inventory / combatManager / playerCombat 字段非空
- `update(time, delta)` 调用 combatManager.update + minimap.update + hud.update
- `runEvacuation()` 委托 scene.runEvacuationSettlement，不直接 depositRunInventory
- `abandonRun()` 委托 scene.runDeathSettlement
- `handleEliteDefeated()` 调用 rollLootTable + inventory.add vaultKey + triggerRedEdgeKill + duplicateSilentOnes

**RunInteractionHandler 单测**：
- `onInteractPressed` 优先级：note overlay 激活时优先关闭 note
- vault door 在 distanceToVaultDoor 内且持钥匙 → unlockVaultDoor
- chest 在范围内 → 触发破译
- exit 在范围内且 sanity 达标 → runEvacuation

**RunTestHooks 单测**：
- `spawnNoteForTest` / `spawnChestForTest` / `movePlayerToNote` 等方法不抛错
- `getInventorySummary` / `getVaultState` / `getCombatSummary` 返回正确结构

### §7.2 文档同步
- spec#1 §7.3 标注：「音效：未规划，待音频管线就绪后单独 spec」（关闭 spec#2 §9 悬空承诺的音频部分）
- spec#2 §9 更新：「结构性偏差 A-J：由 spec#5（2026-07-23）关闭」
- spec#1 §5.10 / §5.11.9 无需改动（中立→激怒机制已有记录，审核误报已修正）

### §7.3 验证门槛
- `npm run typecheck` 全绿
- `npm run test:run` 全绿（含新增 8-12 个 RunController 模块单测）
- `npm run e2e` 全绿（5 个 forgotten-sanity-*.spec.ts 不回归）
- `npm run verify` 全绿
- 完成后重跑 2026-07-23 完整审核，确认无 P0/P1 残留

## §8 实施顺序

```
Phase 1（A-J 类型契约，P0）
  ├─ §4.1 CombatManager implements CombatPort
  ├─ §4.2 Enemy 基类声明可选钩子
  ├─ §4.3 window declare global
  ├─ §4.4 defaultEnemyOpts 单源化
  ├─ §4.5 Minimap 共享地图常量
  └─ §4.6 HubScene 调试状态标记
        ↓
Phase 2（三大文件拆分）
  ├─ §5.1 ForgottenSanityRunController → 3 子模块 + 门面
  ├─ §5.2 CombatManager → 4 子系统 + 门面
  └─ §5.3 assets.ts → 3 文件 + index
        ↓
Phase 3（BitmapMask + 低风险打包）
  ├─ §6.1 RedEdgeFogOverlay BitmapMask
  ├─ §6.2 硬编码视口尺寸
  ├─ §6.3 WeaponCombatAdapter 实例字段
  ├─ §6.4 createEnemy throw
  └─ §6.5 LootTable 空数组守卫
        ↓
Phase 4（测试补全 + 文档同步）
  ├─ §7.1 RunController 模块单测
  ├─ §7.2 文档同步
  └─ §7.3 验证门槛
```

## §9 不在范围

- **新功能**：本 spec 实施期间冻结 forgotten sanity 新功能开发
- **音频实现**：spec §7.3 音效设计不做，仅标注「未规划」
- **性能优化**：除 spec#3 已有的 far-room 4Hz 降级外不做额外优化
- **素材 preload 降级逻辑**：仅完成清单拆分，forgotten sanity 缺失时的独立降级留待后续 polish
- **中立→激怒机制**：spec#1 §5.10 + §5.11.9 已有记录，无需正名（审核误报已修正）

## §10 风险与回滚

- **Phase 2 拆分风险最高**：RunController 与 CombatManager 拆分可能引入回归。每步 TDD + E2E 回归保护。若拆分后 E2E 红，回滚该子模块拆分，保留 Phase 1 成果。
- **Phase 3 BitmapMask 风险**：Phaser 4 BitmapMask API 与文档可能存在差异。先写最小冒烟测试验证 API 可用，再替换简化版。
- **功能冻结期**：spec#5 实施期间若需紧急修复 forgotten sanity 线上 bug，可临时解冻，但需在解冻 commit 中标注「spec#5 实施期临时解冻」。
