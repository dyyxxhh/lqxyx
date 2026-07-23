# 被遗忘的理智 — Spec 合规修复设计

> **来源**：基于 2026-07-18 spec 校验报告（11 项致命偏差 + 多项结构性偏差）
> **基线 spec**：`docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md`
> **范围**：修复 11 项致命偏差，使代码达到 spec 完整合规
> **交付策略**：单计划 / 单 PR

## §1 背景

2026-07-18 对 `src/forgottenSanity/` 全模块进行了 spec 校验，识别 11 项致命偏差：

| 优先级 | 编号 | 偏差 |
|--------|------|------|
| P0 玩法阻断 | #1 | 撤离成功分支双重入仓库（战利品×2） |
| P0 玩法阻断 | #2 | 宝箱破译 decayRate 完全未实现 |
| P0 玩法阻断 | #9 | spec §5.10/§9.3「理智刷新+100%」未实现 |
| P0 玩法阻断 | #11 | vault door 钥匙流程被简化为 `exitDiscovered=true` |
| P1 机制缺失 | #3 | fistDash 锁定向未实现，无实际冲刺 |
| P1 机制缺失 | #4 | rangedPiercing 不遇墙停止 |
| P1 机制缺失 | #5 | 但宇轩身体连座/复活 hack |
| P1 机制缺失 | #6 | 杨云红边冲撞伤害 22≠50，无击退 |
| P1 机制缺失 | #10 | 小地图雾战未过滤 |
| P2 系统层 | #7 | 远房 4Hz 降级未实现 |
| P2 系统层 | #8 | 三态玩家可见反馈完全缺失 |

数值层（HP/sanity/CD/价格/阶数等硬数值）已 100% 合规，本次修复聚焦机制/交互层。

## §2 总体方法

- **spec 字面对齐**：9 项已有 spec 明确数值/规则的，按 spec 字面实现
- **spec 补全**：2 项 spec 缺失的（#9 缄默者复制、#11 vault door 完整流程），按本次澄清决策实现并同步修订 spec
- **TDD 强制**：每项修复先写失败测试（RED）→ 实现（GREEN）→ 暴露给 E2E（SURFACE），与项目 §11.2 一致
- **零侵入剧情模式**：所有改动限于 `src/forgottenSanity/` 与必要的 `src/data/assets.ts` 增量

## §3 P0 玩法阻断修复（4 项）

### §3.1 双重入仓库修复（偏差 #1）

**偏差位置**：`src/forgottenSanity/ForgottenSanityRunController.ts:612-621`

**问题**：`runEvacuation` 在 `SettlementScreen.handleEvacuated` 已写入 stash 后再次调用 `depositRunInventory` + `storeStash`，致战利品×2、`stash.sanity` 翻倍，且与 `bestSanity` 数据不一致。

**修复**：删除 controller 中的重复写入分支，保留 `SettlementScreen.handleEvacuated` 作为唯一副作用入口。

```ts
private runEvacuation(): void {
  if (this.player.isDead) return;
  // spec §1.3：副作用统一由 SettlementScreen.handleEvacuated 完成
  this.scene.runEvacuationSettlement(this.inventory, this.manifest.baselineSanity);
}
```

**理由**：`SettlementScreen.handleEvacuated` 已正确实现 evacuated/refused/dead 三分支，且负责 UI 展示，把 stash 写入与其放一起更内聚。controller 仅作路由。

### §3.2 宝箱破译 decayRate（偏差 #2）

**偏差位置**：`src/forgottenSanity/loot/chestDecryptState.ts:2, 49-60`

**问题**：文件头注释「无回退」，`release()` 仅置 `holding=false`，`advance()` 在松开时对 progress 既不增也不减，与 spec §7.1/§7.2「松开后 100% 速率回退，回退到上一个已崩开锁扣处停止」直接对立。

**修复**：
- `decayRate = 1/2500 per ms`（与破译速率相同）
- 回退到上一个已崩开锁扣处停止：`Math.floor(progress * 4) / 4`（最小为 0）
- 锁扣里程碑 0.25/0.5/0.75/1.0 永久保留

```ts
private decayProgress(deltaMs: number): void {
  if (this.holding || this.phase !== 'decrypting') return;
  const lastLock = Math.floor(this.progress * 4) / 4;
  this.progress = Math.max(lastLock, this.progress - (deltaMs / CHEST_DECRYPT_TOTAL_MS));
}
```

**附加修复**：状态名 `'opening'` → `'opened'`（对齐 spec §7.2 字面）。

### §3.3 缄默者复制（替换「理智刷新+100%」）（偏差 #9）

**spec 修订**：spec §5.10 与 §9.3 的「理智刷新 +100%」替换为「缄默者复制 ×2」。

**触发时机**：击杀杨云红边后，与红边雾战遮罩同步触发（在 `ForgottenSanityRunController.handleEliteDefeated` 中）。

**复制范围**：仅复制 8 种普通缄默者（①但宇轩头颅/②秦浩睿头颅/③桌椅/④电话/⑤血手/⑥漂浮眼球/⑦粉笔尘云/⑧血瞳头颅）。但宇轩身体、杨云红边本人、杨云红边幻影不参与复制。

**复制数量**：现有缄默者数量 ×2，即每个原体生成 1 个复制体。

**复制体属性**：与原体完全一致（HP/接触伤/speed/攻击间隔/感知参数/攻击模式）。

**复制体出生位置**：玩家可见范围（视口 1280×720 + 100px buffer = 1480×920）外的随机房间内随机点。优先选择玩家当前所在房间的非邻接房间，避免立即遭遇。

**复制体掉落**：按原体同表 ×1.0（与原体行为一致，无需特殊 LootTable）。

**复制体标记**：`isDuplicate: true` 用于：
- 防止后续红边击杀递归复制（红边击杀本就一次性，标记仅作保险）
- 可选视觉 tint 标记（略暗红 `0xcc8888`，区分原体）

**实现**：
- `ForgottenSanityRunController.handleEliteDefeated` 在触发红边雾战遮罩后，调用 `CombatManager.duplicateSilentOnes(playerViewport)`
- `CombatManager.duplicateSilentOnes` 遍历当前所有 8 种普通缄默者子类实例，对每个原体调用 `cloneEnemy()`，新复制体出生位置由 `pickFarRoomPosition(playerViewport)` 决定

### §3.4 vault door 钥匙流程（偏差 #11）

**spec 补全**：spec §10.1 第 2 条「钥匙用途」扩展为完整流程。

**钥匙表示**：Inventory 物品 `material.vaultKey`（蓝阶材料类，sanityValue=0，effect=null，不可售卖）。

**钥匙发放**：杨云红边击杀后 100% 掉落，由 `CombatManager` 在 `onEliteDefeated` 回调中 `Inventory.add('material.vaultKey', 1)`（不进 LootTable，spec §10.1 第 1 条约束不变）。

**vault door 交互**：
- `ForgottenSanityMapRenderer` 在 vault door 上注册 H 键交互 hitArea
- 玩家按 H 时检查 `Inventory.has('material.vaultKey')`：
  - 有：消耗 1 把钥匙（`Inventory.remove('material.vaultKey', 1)`），vault door 永久解锁（视觉 swap 已开门贴图），玩家可进入 vault 房间
  - 无：UI 提示「需要仓库钥匙」

**vault 内宝箱**：`ChestDecrypt` 在 vault 房间内的宝箱构造时标记 `isVaultChest=true`：
- `isVaultChest` 跳过破译状态机，直接进入 `'opened'` 态并 `spawnLootCard`
- 不消耗 F 键，不产生破译噪声

## §4 P1 机制缺失修复（5 项）

### §4.1 fistDash 锁定向与实际冲刺（偏差 #3）

**偏差位置**：`src/forgottenSanity/weapons/WeaponCombatAdapter.ts:253-265`

**问题**：`lockDirection: true` 字段定义后从未被读取；`ultFistDash` 用 followPlayer DoT zone 近似，未做实际位移。

**修复**：

**冲刺锁定状态**：
- `ForgottenSanityRunController` 新增 `dashLockState: { activeMs: number; dirX: number; dirY: number } | null`
- `onUltimatePressed` 在 weapon=fistGauntlet 时：
  - 释放瞬间锁定当前 `facingX/facingY` 作为冲刺方向
  - 设置 `dashLockState = { activeMs: 300, dirX, dirY }`

**移动锁定**：
- `handleMovement` 在 dash 激活期间：
  - 忽略键盘输入，玩家位置按 `dirX*833, dirY*833` 推进（833 = 250px/0.3s）
  - `dashLockState.activeMs -= deltaMs`，归零后清除
  - 撞墙检测：推进过程中遇 `isWalkable=false` 立即停止，保留剩余无敌帧

**伤害分段**：
- `WeaponCombatAdapter.ultFistDash` 改为：
  - 不再创建 followPlayer zone
  - 路径命中（沿冲刺方向直线 250px 内最近敌）→ 40 伤
  - 末端命中（冲刺结束点 r=60 内最近敌）→ 40 伤
  - 释放期 `playerCombat.setInvincible(300)`
  - 重复命中防护：路径与末端若命中同一敌人，仅取首段伤害

### §4.2 rangedPiercing 遇墙停止（偏差 #4）

**偏差位置**：`src/forgottenSanity/combat/CombatManager.ts:306-354`

**问题**：`updatePlayerProjectiles` 未调用 `isWalkable`，玩家投射物完全跳过墙体碰撞。spec §3.2 明文要求「遇墙停止」。

**修复**：在子步进推进循环中，每步检查 `isWalkable(p.x, p.y)`：

```ts
const stepX = p.dir.x * projectileSpeed * stepMs / 1000;
const stepY = p.dir.y * projectileSpeed * stepMs / 1000;
const nextX = p.x + stepX;
const nextY = p.y + stepY;
if (!this.isWalkable(nextX, nextY)) {
  this.spawnWallHitFx(p.x, p.y);
  deadIndices.push(i);
  continue;
}
p.x = nextX; p.y = nextY;
```

**敌侧同步**：敌侧投射物（`updateProjectiles`）同样补墙检测，与玩家侧对齐。

### §4.3 但宇轩身体连座 + 复活计时（偏差 #5）

**偏差位置**：`src/forgottenSanity/combat/enemies/DanYuxuanBody.ts:114-133`、`src/forgottenSanity/combat/CombatManager.ts:720-742`

**问题**：
- `onBodyDied()` 方法存在但 CombatManager 从未调用，身体死亡后绑定头颅仍存活
- `onBoundHeadDied` 将 `bh.deadAtMs=0` 占位，复活计时实际为「游戏开始 20s 后」而非「头颅死亡 20s 后」

**修复**：

**召唤关系绑定**：
- `DanYuxuanBody` 维护 `boundHeadIds: Set<string>`
- 每次 `trySummon` 召唤血眼时，把新头颅 id 加入 `boundHeadIds`

**身体死亡连座**：
- `CombatManager.handleDeadEnemies` 在身体死亡时调用 `body.onBodyDied()`：
  ```ts
  for (const headId of body.boundHeadIds) {
    const head = this.enemies.find(e => e.id === headId && !e.isDead);
    if (head) head.kill();
  }
  body.boundHeadIds.clear();
  ```

**头颅死亡真实计时**：
- 头颅死亡时记录真实时间戳：
  ```ts
  // DanYuxuanBody.onBoundHeadDied(headId, timeMs, spawnX, spawnY)
  boundHeadIds.delete(headId);
  deadHeads.set(headId, { diedAtMs: timeMs, spawnX, spawnY });
  ```
- `tickAI` 中检查每个 deadHead：`timeMs - diedAtMs >= REVIVE_MS(20000) && bodyAlive → 在原位 (spawnX, spawnY) 复活`
- 复活时重新加入 `boundHeadIds`，从 `deadHeads` 移除

### §4.4 杨云红边冲撞伤害 50 + 击退（偏差 #6）

**偏差位置**：`src/forgottenSanity/combat/enemies/YangYunRed.ts:30-31, 33`

**问题**：注释自承 `CHARGE_DAMAGE 未使用`，实际冲撞伤害=接触伤 22；`onKnockback` 回调声明但从未调用；二阶段 `PHASE2_CHARGE_INTERVAL_MS=1800` ≠ spec「所有 CD 减半」应为 1500。

**修复**：

**冲撞伤害**：
- `YangYunRed` charge 状态期间设置 `contactDamageOverride = CHARGE_DAMAGE (50)`
- charge 命中玩家时调用 `ctx.onKnockback(playerId, chargeDirX, chargeDirY, knockbackPx=80)`

**击退实现**：
- `ForgottenSanityRunController` 实现 `onKnockback`：在玩家位置施加 `dirX*80, dirY*80` 的瞬时位移，并短暂锁输入 200ms（`lockReason='knockback'`）

**二阶段 CD 减半修正**：
- 二阶段（HP<40%）所有 CD 减半：
  - `charge interval: 3000 → 1500`
  - `charge windup: 1000 → 500`
  - `charge duration: 700 → 350`
  - `crack interval: 8000 → 4000`
  - `crack windup: 600 → 300`
- 修正 `YangYunRed.ts:33` `PHASE2_CHARGE_INTERVAL_MS` 从 1800 改为 1500
- 二阶段切换时在 `enterPhase2()` 中应用所有 CD 减半

### §4.5 小地图雾战过滤（偏差 #10）

**偏差位置**：`src/forgottenSanity/ui/Minimap.ts:120-121`

**问题**：`void u.exploredCells;` 显式忽略字段，未探索区域内的宝箱/出口/身体标记全部暴露。

**修复**：

**渲染过滤**：
- `Minimap.update` 接收 `exploredCells: readonly number[]`（已存在，scene 已传入）
- 渲染宝箱/出口/身体标记前，先检查该标记所在 cell 是否在 `exploredCells` 中
- 未探索 cell 内的标记跳过绘制
- 玩家点 + 已探索 cell 内的标记照常绘制

**exploredCells 维护**：
- `ForgottenSanityRunController` 在玩家移动时记录当前所在 cell index 到 `exploredCells`（去重）
- 玩家走过即永久点亮，不褪色
- `exploredCells` 由 `ForgottenSanityScene` 传入 `MinimapUpdate`

## §5 P2 系统层修复（2 项）

### §5.1 远房 4Hz 降级（偏差 #7）

**偏差位置**：`src/forgottenSanity/combat/CombatManager.ts:477-522`

**问题**：所有 enemies 用同一 deltaMs 调用，无房间邻接判定、无 4Hz 降级分支。

**修复**：

**双路更新**：
```ts
const now = ctx.timeMs;
for (const enemy of this.enemies) {
  const enemyRoomId = enemy.currentRoomId;
  if (enemyRoomId === playerRoomId || adjacentRooms.get(playerRoomId)?.has(enemyRoomId)) {
    // 当前 + 邻接：60Hz，按 deltaMs 推进
    enemy.update(deltaMs, ctx);
  } else {
    // 远房：4Hz，累积时间到 250ms 才推进一次
    const acc = (this.farRoomAccumMs.get(enemy.id) ?? 0) + deltaMs;
    if (acc >= 250) {
      enemy.update(250, ctx);
      this.farRoomAccumMs.set(enemy.id, acc - 250);
    } else {
      this.farRoomAccumMs.set(enemy.id, acc);
    }
  }
}
```

**邻接关系派生**：
- `ForgottenSanityMapGenerator` 已生成 `corridors[]`，CombatManager 在装配时派生 `adjacentRooms: Map<roomId, Set<roomId>>`
- `Enemy` 基类新增 `currentRoomId` 字段，由 AI 在跨门时更新

**召唤计时器例外**：
- 但宇轩身体召唤计时器（spec §5.9 A）始终按真实时间推进，不受远房降级影响
- `DanYuxuanBody.summonTimer` 单独在 CombatManager 60Hz 路径中 `tickSummonTimer(deltaMs)`，无论身体所在房间是否远房
- 头颅复活计时器（spec §5.9 C 20s）同此规则

### §5.2 三态玩家可见反馈（偏差 #8）

**偏差位置**：`src/forgottenSanity/combat/EnemyViewRenderer.ts:22-65`

**问题**：spec §5.11.8 要求的头顶图标 `?`/`!`/`…` 与 chase 红 tint 全部缺失。

**修复**：

**头顶图标**：
- `EnemyViewRenderer.renderEnemy` 接收 `aiState: EnemyAIState`，在敌人精灵上方渲染对应图标：
  - `idle`：无图标
  - `alert`：`?` 字符（白色，pixel 字体）
  - `chase`：`!` 字符（红色，pixel 字体）+ 精灵 `setTint(0xff8888)`（略红）
  - `search`：`…` 字符（白色，pixel 字体）

**视觉规范**：
- 图标 depth = 玩家上方（10 + 1 = 11，遵循 spec §11.5）
- 图标位置：敌人精灵上方 12px
- 字体大小 10px，描边黑色 2px（与 UI_THEME 一致）
- `chase` → 其他态转换时清除 tint（`clearTint()`）

## §6 数据流与文件改动清单

### §6.1 修改文件（17 个）

| 文件 | 改动概要 |
|------|----------|
| `src/forgottenSanity/ForgottenSanityRunController.ts` | 删除双重入仓库；新增 dashLock 状态、onKnockback、exploredCells 维护、handleEliteDefeated 调用 duplicateSilentOnes |
| `src/forgottenSanity/loot/chestDecryptState.ts` | 实现 decayProgress 与锁扣停止逻辑；状态名 `'opening'` → `'opened'` |
| `src/forgottenSanity/loot/ChestDecrypt.ts` | vault 房间内宝箱跳过破译直接 opened 态 |
| `src/forgottenSanity/loot/LootItem.ts` | 新增 `material.vaultKey`（蓝阶材料，sanityValue=0，不可售卖） |
| `src/forgottenSanity/loot/Inventory.ts` | vaultKey 加不可售卖标记 |
| `src/forgottenSanity/loot/lootAssetKeys.ts` | 注册 `material.vaultKey` → `loot.仓库钥匙` spriteKey |
| `src/forgottenSanity/loot/LootTable.ts` | itemCount min: 3/4 → 1（普通/鎏金宝箱）；rollIndependent 修正为每稀有度独立判定 |
| `src/data/assets.ts` | 注册 loot.仓库钥匙 manifest 条目 |
| `src/forgottenSanity/combat/CombatManager.ts` | 远房 4Hz 降级；调用 body.onBodyDied；新增 duplicateSilentOnes；rangedPiercing 遇墙停止；player projectiles 墙检测 |
| `src/forgottenSanity/combat/Enemy.ts` | 新增 currentRoomId 字段、isDuplicate 字段、contactDamageOverride 字段（供 YangYunRed charge 期间覆盖接触伤害） |
| `src/forgottenSanity/combat/enemies/DanYuxuanBody.ts` | 维护 boundHeadIds；onBodyDied 杀绑定头颅；onBoundHeadDied 记录真实死亡时间戳 |
| `src/forgottenSanity/combat/enemies/YangYunRed.ts` | charge 期间 contactDamageOverride=50；onKnockback 调用；二阶段所有 CD 减半修正 |
| `src/forgottenSanity/combat/EnemyViewRenderer.ts` | 三态头顶图标 + chase 红 tint |
| `src/forgottenSanity/weapons/WeaponCombatAdapter.ts` | ultFistDash 重写为实际冲刺 + 路径/末端两段命中 |
| `src/forgottenSanity/ui/Minimap.ts` | 实现雾战过滤（exploredCells 未覆盖的标记不绘制） |
| `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` | vault door 注册 H 键交互（检查钥匙、消耗、解锁） |
| `docs/superpowers/specs/2026-07-17-tomb-raid-mode-design.md` | §5.10/§9.3「理智刷新+100%」→「缄默者复制×2」；§10.1 钥匙用途扩展；§7.2 状态名 opened |

### §6.2 测试改动

**单元测试**（`src/tests/forgottenSanity/`）：
- `chestDecryptState.test.ts`：decayRate 与锁扣停止、状态名 opened
- `lootTable.test.ts`：rollIndependent 每稀有度独立、itemCount 范围 1-5
- `danYuxuanBody.test.ts`：boundHeadIds、onBodyDied 连座、真实复活计时 20s
- `yangYunRed.test.ts`：charge 伤害 50、二阶段所有 CD 减半
- `combatManager.test.ts`：远房 4Hz 降级、rangedPiercing 遇墙、duplicateSilentOnes 数量×2
- `forgottenSanityState.test.ts`：vaultKey 不可售卖
- `weaponCombatAdapter.test.ts`：fistDash 锁定向、路径+末端两段命中

**E2E 测试**（`tests/e2e/`）：
- `forgotten-sanity-vault-door.spec.ts`：钥匙发放 → vault door 解锁 → 免费破译
- `forgotten-sanity-elite-defeat.spec.ts`：红边击杀 → 雾战 + 缄默者复制 + 钥匙掉落
- `forgotten-sanity-fog-of-war.spec.ts`：小地图雾战过滤验证

## §7 错误处理

| 场景 | 行为 |
|------|------|
| `dashLock` 撞墙 | 遇 `isWalkable=false` 立即停止，保留剩余无敌帧，不抛错 |
| `duplicateSilentOnes` 无可复制目标 | 返回 0，不抛错 |
| vault door 无钥匙按 H | UI 提示「需要仓库钥匙」，不抛错 |
| `body.onBodyDied` 时头颅已被外力清除 | 跳过该 id，不抛错 |
| rangedPiercing 投射物出生即嵌入墙 | 立即移除并播放墙击粒子，不抛错 |
| 玩家在 vault door 已解锁后再次按 H | 提示「已解锁」，不再消耗钥匙 |

## §8 验证标准

修复完成后，spec 校验脚本（参考 2026-07-18 校验报告）应输出：
- 11 项致命偏差全部 ✅ 通过
- 数值层 100% 合规（已达成）
- 结构性偏差不在本次范围（后续单独 spec）

E2E 测试 28 → 31 specs 全部通过，单元测试 21 → 28 files 全部通过。

## §9 不在本次范围

- 结构性偏差 A-J（类型契约、字段命名、模块拆分）：单独 spec

> **2026-07-23 关闭（spec#5）**：结构性偏差 A-J 由 `2026-07-23-forgotten-sanity-structural-debt-closure-design.md`（spec#5）关闭。
- 性能优化：远房 4Hz 降级后需验证怪物数量上限不超 100，但本次不调优
- 音效：宝箱咔哒音、锁扣崩开音等音频资产不在本次范围（spec §7.3 提及但音频管线未就绪）
