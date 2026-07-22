# 被遗忘的理智 — 遗落的纸条（Lost Notes）设计

**Date:** 2026-07-22
**Mode:** 被遗忘的理智（Forgotten Sanity roguelike sub-mode）
**Status:** Draft, pending user review

## 0. 目标与范围

为「被遗忘的理智」roguelike 模式新增「遗落的纸条」可交互实体：

- 每局运行时在程序生成地图上**纯随机**刷新 **2–5 张**纸条。
- 纸条**不可拾取**，靠近后按 H 可交互阅读。
- 阅读时弹出**全屏**正文覆盖层，**无标题**（连水印也不要）。
- 共 9 条内容。**每张纸条实例在首次阅读时锁定其内容**：按全局顺序分配（第 1 张被读到的纸条=内容 1，下一张不同纸条=内容 2，以此类推）。重读同一张纸条仍显示其锁定内容，不推进。
- 当玩家已看完全部 9 条后，新纸条实例的内容改为从 9 条中**均匀随机**。
- **无论何时都不向玩家显示任何编号**（内容序号 / 纸条实例序号 / 已读计数）。
- 阅读纸条**无任何机制收益**（无理智值、无战利品、无 flag），纯剧情碎片。
- 阅读进度**跨局持久化**（meta-state）。

## 1. 归属与刷新时机

### 归属
本特性归属于「被遗忘的理智」roguelike 子模式（`ForgottenSanityScene`），**非第一幕剧情**。不涉及 `PlayScene` / `EventEngine` / `NarrativeUIManager` / 主线 `SaveState`。

### 刷新时机
**每局运行**刷新。每当玩家进入 `ForgottenSanityScene` 触发新地图生成时，由地图生成器在生成宝箱的同时生成 2–5 张纸条刷新点，写入 `manifest.notes`。本局内纸条不重生；下一局重新生成。

### 数量
`noteCount = 2 + floor(rng() * 4)`，均匀分布在 {2, 3, 4, 5}（各 25%）。`rng()` 为生成器已有的 `mulberry32` 流，与宝箱分配共用同一 RNG 序列（在 `distributeChests` 之后调用 `distributeNotes`，以保持可复现性）。

## 2. 放置规则

### 房间筛选
允许放置纸条的房间 kind：`classroom` / `trap` / `dark` / `switchRoom` / `hall`。排除 `entrance` / `exit` / `vault`（与宝箱野生刷新同源约束）。

### 坐标
- 取候选房间 `spawnPoint`，加抖动 `jitterX = (rng()*2-1)*80`、`jitterY = (rng()*2-1)*80`。
- 结果必须落在该房间 `walkableBounds` 内；若超出则重试（最多 8 次），仍失败则换下一个候选房间。
- 候选房间按 `room.id` 升序遍历，跳过已放满的房间。

### 去重
- 不与同房间内任何 `manifest.chests[*].bounds` 重叠（最小间距 60px，按中心点欧氏距离）。
- 不与已生成的其他纸条刷新点重叠（最小间距 120px）。

### 容错
若本局合法位置不足以放下 `noteCount` 张，则**放多少算多少**（可少于 `noteCount`，可为 0）。生成器不抛错，运行时按实际生成数量创建交互区。

### 数据结构
在 `forgottenSanityMapState.ts` 新增：

```ts
export interface ForgottenSanityNoteSpawn {
  readonly id: string;          // 如 "note-0", "note-1"
  readonly roomId: string;
  readonly bounds: MapRectangle; // { x, y, width: 48, height: 48 }，中心点为放置坐标
}
```

在 `ForgottenSanityMapManifest` 新增字段：

```ts
readonly notes: readonly ForgottenSanityNoteSpawn[];
```

### 生成器入口
在 `ForgottenSanityMapGenerator.ts` 新增纯函数 `distributeNotes(rng, rooms, chests)`，返回 `ForgottenSanityNoteSpawn[]`。在 `generateForgottenSanityMap` 的 `distributeChests` 之后调用，写入 `manifest.notes`。该函数为纯函数，无 Phaser 依赖，可单测。

## 3. 内容数据

### 文件
新建 `src/forgottenSanity/notes/noteContent.ts`，纯 TS 数据模块（无 Phaser 依赖）。

### 结构
```ts
export interface NoteContent {
  readonly id: string;   // "note-content-1" .. "note-content-9"
  readonly body: string; // 原文全文，无标题、无编号
}

export const NOTE_CONTENTS: readonly NoteContent[] = [ /* 9 条 */ ];
export const NOTE_CONTENT_COUNT = 9;
```

### 内容（按顺序，对应内容 1..9）
正文按用户提供的原文照存，不做拆分或重排。部分内容自带开头（如「天气晴」「敬爱的楚博士：」），部分为裸陈述——照原样保留：

1. `note-content-1`
   ```
   天气晴
   今天我上午去单位上班，把yokua波的持续观测搞定了，下午听说他妈的竟然敢这么干，我他妈的不干了。
   ```

2. `note-content-2`
   ```
   研究员 U497261 需要离开，预计原因为心脏骤停。
   ```

3. `note-content-3`
   ```
   已向***方位发送 yokua 波，正在持续观测。
   ```

4. `note-content-4`
   ```
   已造成严重影响，需要发射***。
   ```

5. `note-content-5`
   ```
   敬爱的楚博士：
   经过多日的观察，共发现一个实验体 185296 出现了「神迹」与严重的暴力倾向，借此向您询问后续方向。
   ```

6. `note-content-6`
   ```
   敬爱的楚博士：
   收到，正在持续监测。
   ```

7. `note-content-7`
   ```
   敬爱的楚博士：
   特殊实验体 185296 已自行完成分离，保留结果为 185296-2。
   ```

8. `note-content-8`
   ```
   实验体 185297 发生特殊变化，需要注意。
   ```

9. `note-content-9`
   ```
   实验体 185297 已确认遗失部分人类特征，无明显正面效果，yokua 负面案例已发现。
   ```

`body` 中的换行用 `\n`。多条正文（如内容 5/6/7）的「敬爱的楚博士：」与后续段落之间用单个 `\n`。

## 4. 内容分配逻辑

### 持久化状态
跨局 meta-state，仅一个数字：`nextSequentialIndex: number`（0–9）。其语义：
- `0 ≤ nextSequentialIndex < 9`：尚未看完全部，下一条新纸条实例分配 `NOTE_CONTENTS[nextSequentialIndex]`。
- `nextSequentialIndex >= 9`：已看完全部，下一条新纸条实例从 9 条中均匀随机。

「全部已看」由 `nextSequentialIndex >= 9` 派生，不单独存布尔标志。

### 分配算法（纯函数 `assignNoteContent`）
输入：`noteState`（含 `nextSequentialIndex`）、`rng`、`readNoteInstancesThisRun: Map<instanceId, contentIndex>`、`instanceId`。
输出：`{ contentIndex: number; newNextSequentialIndex: number }`。

```
if readNoteInstancesThisRun.has(instanceId):
    return { contentIndex: readNoteInstancesThisRun.get(instanceId), newNextSequentialIndex: nextSequentialIndex }  // 重读，不推进
if nextSequentialIndex >= NOTE_CONTENT_COUNT:
    contentIndex = floor(rng() * NOTE_CONTENT_COUNT)  // 随机阶段，不去重，不推进
    return { contentIndex, newNextSequentialIndex: nextSequentialIndex }
contentIndex = nextSequentialIndex
return { contentIndex, newNextSequentialIndex: nextSequentialIndex + 1 }  // 推进并持久化
```

注意：随机阶段（`nextSequentialIndex >= 9`）**不**持久化新值、**不**去重——同一张纸条实例在随机阶段被首次阅读时，仅本局锁定（写入 `readNoteInstancesThisRun`），下一张新纸条仍从 9 条均匀随机。

### 本局锁定
每局运行内维护 `readNoteInstancesThisRun: Map<string, number>`（`instanceId` → `contentIndex`），**仅存活于本局 RunController 实例**，不持久化。重读同一张纸条实例时直接返回其锁定内容，不调用 `assignNoteContent` 的推进分支。

### 何时持久化
仅在「顺序阶段首次阅读某纸条实例」时调用 `saveNotesState({ nextSequentialIndex: newIndex })`。重读、随机阶段阅读都**不**写盘。

## 5. 持久化（meta-state）

### 新 localStorage key
`ying-zhong-jiu.forgotten-sanity.notes.v1`

### Schema
```ts
interface ForgottenSanityNotesState {
  readonly schemaVersion: 1;
  readonly nextSequentialIndex: number;
}
```

### 守卫与读写
在 `forgottenSanityState.ts` 新增（复用现有 `loadTyped` / `atomicSaveMulti` 模式）：
- `isNotesState(value): value is ForgottenSanityNotesState` — 校验 `schemaVersion === 1` 且 `nextSequentialIndex` 为非负整数。
- `createDefaultNotesState(): ForgottenSanityNotesState` — `{ schemaVersion: 1, nextSequentialIndex: 0 }`。
- `loadNotesState(storage = localStorage): ForgottenSanityNotesState` — 用 `loadTyped` 加载，失败回退默认值。
- `saveNotesState(state, storage = localStorage): void` — 用 `atomicSaveMulti` 写入。

### 不污染现有 key
- 不改 `progress.v1`（保留给 `starterPackGranted`）。
- 不改 `stash.v1` / `upgrades.v1` / `best.v1`。
- 不改主线 `SaveState` schemaVersion（仍为 1）。

## 6. 交互

### 按键
**H**（被遗忘的理智惯例，非主线 F）。移动端 `MobileControls` 的 `interact` 动作复用同一路径。

### 交互分支
在 `ForgottenSanityRunController.onInteractPressed()` 现有优先级链中插入新分支。新分支位置：**在宝箱判定之后、金库门判定之前**。因纸条与宝箱/门空间上不重叠（生成时已去重），实际无歧义，但顺序仍按此约定以便测试可预测。

```
onInteractPressed():
  if player.isDead: return
  if noteOverlayActive: closeNoteOverlay(); return     // 0. 阅读中再按 H 关闭
  if activeChestId !== null: return                     // 1. 宝箱解密进行中
  chest = findNearestChest(); if chest: startChestDecrypt(chest); return  // 2. 最近宝箱
  note = findNearestNote(); if note: startReadNote(note); return          // 3. 新增：最近纸条
  if distanceToVaultDoor() <= EXIT_INTERACT_DISTANCE: tryUnlockVaultDoor(); return  // 4. 金库门
  if distanceToExit() <= EXIT_INTERACT_DISTANCE: runEvacuation()         // 5. 出口
```

### 距离常量
`NOTE_INTERACT_DISTANCE = 80`（与 `CHEST_INTERACT_DISTANCE` 一致）。

### 寻找最近纸条
`findNearestNote(): ForgottenSanityNoteSpawn | null` — 遍历 `manifest.notes`，按玩家中心点到 `note.bounds` 中心的欧氏距离，取 ≤ 80px 的最近一张。**不区分已读未读**（已读纸条可再次阅读，显示其锁定内容）。

### 关闭交互
阅读覆盖层打开时（`noteOverlayActive === true`）：
- **H** → 关闭覆盖层（新增分支 0，最高优先级）。
- **ESC** → 关闭覆盖层并**消费** ESC（不落入 `PauseMenu` 切换）。
- 点击「收起」按钮 → 关闭覆盖层。

`ForgottenSanityScene.handleEsc()` 在判 PauseMenu 之前先判 `noteOverlayActive`。

## 7. 全屏阅读覆盖层 `NoteOverlay`

### 文件
新建 `src/forgottenSanity/ui/NoteOverlay.ts`，类 `NoteOverlay`。

### 模板
仿 `SettlementScreen.ts`：所有对象 `setScrollFactor(0)`（屏幕空间），`setVisible(false)` 默认隐藏。

### 深度
- 背景：`NOTE_BG_DEPTH = 1980`
- 正文：`NOTE_TEXT_DEPTH = 1982`
- 收起按钮：`NOTE_BTN_DEPTH = 1983`

在 HUD 之上、SettlementScreen（1996）之下，避免与结算页打架。

### 组成
1. `bg`：`scene.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH-200, GAME_HEIGHT-160, UI_THEME.colors.surface, 0.97)`，`setOrigin(0.5)`，金边 `applyPixelStrokeStyle`。
2. `bodyText`：`applyPixelTextStyle(scene.add.text(GAME_WIDTH/2, GAME_HEIGHT/2, '', {...}))`，`setOrigin(0.5)`，`UI_THEME.font.ui`，`wordWrap: { width: GAME_WIDTH - 320 }`，`align: 'left'`，行间距适当。
3. `closeBtn`：底部居中文字按钮「收起」，`setInteractive({ useHandCursor: true })`，`pointerup` → `hide()` + 回调。

**不显示任何标题、不显示纸条贴图、不显示编号、不显示「已读 X/9」之类提示。** 仅正文 + 收起按钮。

### 接口
```ts
class NoteOverlay {
  constructor(scene: Phaser.Scene)
  show(body: string): void
  hide(): void
  isVisible(): boolean
  destroy(): void
}
```

### 显示行为
- `show(body)` → `bodyText.setText(body)` + 全部 `setVisible(true)`。
- `hide()` → 全部 `setVisible(false)`。

### 战斗冻结
打开时 `combatManager.setFrozen(true)`（同 `PauseMenu` 暂停模式）；关闭时 `combatManager.setFrozen(false)`。同时 RunController 设 `noteOverlayActive = true`，门控移动、攻击、宝箱交互。

## 8. 地图渲染

### 渲染入口
`ForgottenSanityMapRenderer` 在渲染宝箱的同一段循环附近，遍历 `manifest.notes`，每点贴一张纸条贴图。

### 贴图
- 资产 key：`note.遗落的纸条`（独立前缀，详见 §9）。
- 缩放到 48×48（与 `note.bounds` 一致），`setOrigin(0.5)`，中心点为 `bounds` 中心。
- 深度：3（家具层，低于玩家 10，可被 RedEdgeFog 雾遮）。
- **fallback**：贴图缺失时用 `scene.add.graphics()` 画 48×48 米色矩形（`0xf5f0e1`）+ 暗边，与宝箱 fallback 一致。

### 不加交互区
渲染只负责贴图。交互区由 RunController 的 `createNoteInteractions()` 创建（仿 `createChestInteractions`），用 `scene.add.zone()` 不可见 hitArea。

## 9. 资产注册

### 新 manifest 条目
在 `src/data/assets.ts` `assetManifest` 数组新增（位置：loot 条目之后、缄默者之前）：

```ts
{
  key: "note.遗落的纸条",
  path: "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png",
  kind: "image",
  mimeType: "image/png",
  width: 512,
  height: 512,
  usage: "Forgotten Sanity mode lost note map sprite.",
  productionStatus: "FINAL_ASSET",
}
```

实测尺寸 512×512 RGBA PNG，已确认。

### 前缀选择
用独立 `note.*` 前缀，**不**复用 `loot.*`：
- 纸条非 LootItem（不入 `LootTable`、不入 `LOOT_SPRITE_KEY_MAP`、不入背包）。
- 避免污染 `loot-asset-keys.test.ts` 的 53 计数断言与 `LOOT_SPRITE_KEY_MAP` 交叉校验。

### 测试更新
- `assets.test.ts`：在 `expectedFinalAssetPaths` 加 `最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png`，并相应 bump manifest 计数断言。
- 新增独立 `note-asset-keys.test.ts`（或并入 `assets.test.ts`）：断言 `assetManifest` 恰好 1 个 `note.*` 条目。
- `production-art-gate.test.ts`：若该测试枚举所有 FINAL_ASSET 路径，需加新路径。

### 不入 requiredFirstActAssetKeys
`requiredFirstActAssetKeys` 是主线第一幕美术门控，纸条仅被遗忘理智模式用，不加入。

## 10. 纯粹风味

阅读纸条**无任何机制收益**：
- 不加/减理智值。
- 不入背包、不入 stash。
- 不触发 `storyFlags`、不改任何 meta-state（除 `nextSequentialIndex` 的阅读进度外）。
- 不影响敌人、不影响战斗、不影响结算。

## 11. 测试与可观测性（TDD）

### 单元测试
新建 `src/tests/forgottenSanity/notes/`：
- `note-content.test.ts`：`NOTE_CONTENTS` 恰 9 条；每条 `id`/`body` 非空；`body` 不含编号串（如「内容1」「1.」）；`id` 唯一。
- `distribute-notes.test.ts`：
  - 数量 ∈ {2,3,4,5} 且各 25%（用固定 seed 跑多次）。
  - 房间筛选正确（不落 entrance/exit/vault）。
  - 与宝箱 bounds 最小间距 60px。
  - 纸条之间最小间距 120px。
  - 落在 `walkableBounds` 内。
  - 容错：合法位置不足时少放，不抛错。
- `assign-note-content.test.ts`：
  - 顺序阶段：首读 instance A → contentIndex 0、`nextSequentialIndex` 0→1。
  - 重读 instance A → contentIndex 0、`nextSequentialIndex` 不变。
  - 顺序阶段：读 instance B → contentIndex 1、`nextSequentialIndex` 1→2。
  - 随机阶段（`nextSequentialIndex = 9`）：读 instance C → contentIndex ∈ [0,9)、`nextSequentialIndex` 不变。
  - 随机阶段重读 instance C → 返回 C 已锁定值。
- `notes-state.test.ts`：仿 `forgotten-sanity-state.test.ts`，用 `vi.stubGlobal('localStorage', ...)` 测 `loadNotesState` 守卫（坏 schemaVersion / 负数 / 非整数 → 回退默认）、`saveNotesState` 原子写、`atomicSaveMulti` 回滚。

### E2E 测试
新建 `tests/e2e/forgotten-sanity-notes.spec.ts`：
1. 导航到 run 场景（复用 `forgotten-sanity-vault-door.spec.ts` 的 `navigateToRunScene`）。
2. `__testSpawnNote(roomId)` 强制生成一张纸条实例。
3. `__testMovePlayerToNote()` 把玩家移到纸条旁。
4. `page.keyboard.press('H')` → 断言 `NoteOverlay` 出现（通过 `__testIsNoteOverlayVisible()`）。
5. 断言 `__testGetNoteState().nextSequentialIndex` 从 0 → 1。
6. 再按 H 关闭 → 断言 overlay 隐藏。
7. 再按 H 重读 → 断言 `nextSequentialIndex` 仍为 1（重读不推进）。
8. 跨局：abandonRun → 重进 run → `__testSpawnNote` + 读 → 断言 `nextSequentialIndex` 从 1 → 2（持久化生效）。

### 测试钩子
扩展 `ForgottenSanityTestHooks`（`ForgottenSanityScene.ts`）：
```ts
__testSpawnNote(roomId: string): void;
__testGetNoteState(): { nextSequentialIndex: number; readThisRun: string[] };
__testReadNearestNote(): boolean;       // 模拟按 H 读最近纸条，返回是否成功打开 overlay
__testIsNoteOverlayVisible(): boolean;
__testMovePlayerToNote(): void;
__testForceNotesState(nextSequentialIndex: number): void;  // 仅测试用，直接覆盖持久化状态
```
对应 `ForgottenSanityRunController` 加公开 `*ForTest` 方法，用 `as unknown as` duck-typing 挂到 `window.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__`（仅在 `DEV || NODE_ENV === 'test'`）。

### 可观测性（可选）
`ForgottenSanityDebugState`（`scaffoldState.ts:47`）可加 `notesReadThisRun: number`，便于 E2E 轮询。**不**暴露 `nextSequentialIndex`（那是 meta-state，E2E 用 `__testGetNoteState` 取）。

## 12. 不做的事（YAGNI）

- **不**做纸条收集/图鉴系统（"已读 5/9" 之类 UI）。
- **不**做纸条按内容分类（如「楚博士信件」「实验记录」分组）。
- **不**做纸条之间的剧情解锁依赖（读 A 才能读 B）。
- **不**做纸条贴图的多种变体（仅一张贴图，靠内容文本区分）。
- **不**做阅读时的音效/粒子/震屏。
- **不**做纸条被敌人/玩家攻击销毁。
- **不**做纸条在 minimap 标记。
- **不**做纸条与宝箱/出口/金库门的任何联动。
- **不**做「读完全部 9 条」的成就/解锁/特殊提示——玩家读完即静默进入随机阶段，无任何反馈。

## 13. 受影响文件清单

### 新增
- `src/forgottenSanity/notes/noteContent.ts`
- `src/forgottenSanity/notes/assignNoteContent.ts`（纯函数）
- `src/forgottenSanity/ui/NoteOverlay.ts`
- `src/tests/forgottenSanity/notes/note-content.test.ts`
- `src/tests/forgottenSanity/notes/distribute-notes.test.ts`
- `src/tests/forgottenSanity/notes/assign-note-content.test.ts`
- `src/tests/forgottenSanity/notes/notes-state.test.ts`
- `tests/e2e/forgotten-sanity-notes.spec.ts`

### 修改
- `src/data/assets.ts` — 加 `note.遗落的纸条` 条目
- `src/data/assets.test.ts` — 加路径、bump 计数
- `src/forgottenSanity/map/forgottenSanityMapState.ts` — 加 `ForgottenSanityNoteSpawn` + `manifest.notes`
- `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts` — 加 `distributeNotes` + 接入 `generateForgottenSanityMap`
- `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` — 加纸条贴图渲染
- `src/forgottenSanity/state/forgottenSanityState.ts` — 加 `isNotesState` / `createDefaultNotesState` / `loadNotesState` / `saveNotesState`
- `src/forgottenSanity/ForgottenSanityRunController.ts` — 加 `createNoteInteractions` / `findNearestNote` / `startReadNote` / `closeNoteOverlay` / `onInteractPressed` 分支 / `noteOverlayActive` / `readNoteInstancesThisRun` / `*ForTest` 方法
- `src/forgottenSanity/ForgottenSanityScene.ts` — 扩展 `ForgottenSanityTestHooks` + 挂钩；`handleEsc` 加纸条优先消费
- `src/game/scaffoldState.ts` — 可选：`ForgottenSanityDebugState.notesReadThisRun`

## 14. 风险与边界

- **RNG 顺序**：`distributeNotes` 必须在 `distributeChests` 之后调用，且不复用 chest 已消费的随机数。若未来调整生成器内函数顺序，需同步更新 `forgotten-sanity-map-generator.test.ts` 的固定 seed 期望值。
- **持久化竞态**：阅读纸条时 `saveNotesState` 用 `atomicSaveMulti`，避免半写状态。`abandonRun` / 退出场景时不触发额外写盘（仅阅读瞬间写）。
- **E2E 素材依赖**：`forgotten-sanity-notes.spec.ts` 依赖 `note.遗落的纸条` 贴图存在于 `public/assets/final/`，否则 PreloadScene 失败。需确保构建管线把源文件拷到 public（见 `assetUrls.ts` 的 `sourcePathToPublicAssetPath` 映射）。
- **贴图回退**：若运行时贴图未加载（如预加载失败注入测试），渲染 fallback 到 graphics 矩形，交互仍可用——不阻塞核心流程。
- **Strict TS**：所有新代码遵守 `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`。`readNoteInstancesThisRun.get()` 返回值需 `!` 或守卫。
- **不破坏现有测试**：`loot-asset-keys.test.ts` 的 53 计数不动；`forgotten-sanity-map-generator.test.ts` 可能需更新（因 `distributeNotes` 改变 RNG 消费序列）——若其断言了宝箱分布的固定 seed 期望，需重算。
