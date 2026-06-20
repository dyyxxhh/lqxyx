# 场景层 — Scenes

**Scope:** `src/scenes/`

## STRUCTURE
```
src/scenes/
├── BootScene.ts           # 空 boot，直接切 PreloadScene
├── PreloadScene.ts        # 加载资产 + 进度条 + 失败重试 + URL 参数强制失败
├── GameScene.ts           # 主菜单（开始新游戏 / 继续游戏 / 四位进度码设置）
├── PlayScene.ts           # 核心游戏场景（移动/交互/动画/剧情）
├── DeathFlashManager.ts   # 死亡闪屏（血黑/白底/黑底 + 贴图切换）
├── cameraView.ts          # 相机视野辅助
├── preloadState.ts        # 预加载调试状态
├── preloadDebugGate.ts    # 强制预加载失败调试用（URL 参数）
└── storyEntities.ts       # 剧情实体（尸体/道具）动态生成
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改玩家移动速度/碰撞 | `PlayScene.ts` | `PLAYER_SPEED = 200`，`clampToWalkable()` |
| 改角色动画更新 | `PlayScene.ts` | `updateCharacterAnimation()` — `time.now / 180` 切帧 |
| 改场景切换/菜单设置 | `GameScene.ts` / `PlayScene.ts` | `startNewGame()` → `clearSaveState()` → `scene.start('PlayScene')`；四位进度码导入成功后启用继续游戏 |
| 改死亡闪屏序列 | `DeathFlashManager.ts` | 按 `DeathFlashFrame[]` 顺序切换背景和贴图 |
| 改预加载 UI | `PreloadScene.ts` | 进度条 + 失败提示 + 重试按钮 |
| 改相机跟随 | `PlayScene.ts` | `cameras.main.centerOn(playerPosition)` |
| 改预加载故障注入 | `preloadDebugGate.ts` | URL 参数可强制任意 asset key 加载失败 |
| 改剧情实体可见性 | `storyEntities.ts` | `buildStoryEntityDebugEntries()` 按 flag 决定 sprite |

## CONVENTIONS
- **场景链**: Boot → Preload → GameScene（菜单）→ PlayScene（游戏）。
- **PlayScene 是核心**: 集成 MapRenderer、InputManager、NarrativeUIManager、EventEngine、CollisionManager。
- **窗口暴露**: PlayScene 将 `__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__` 挂到 `window`，含位置设置、最近门交互、死亡闪屏日志等调试用 API。
- **分支选择 UI**: `buildBranchChoices()` 在 `awaiting_branch` 时动态生成按钮；选项固定为 A-1/A-2/B-1/B-2 四种。
- **深度层级**: floor=0, walls=1, door surface=2, furniture=3, in-room door=4, corridor door=6, label=7, hitArea=8, player=10, UI=1000~2001。
- **预加载故障注入**: `preloadDebugGate.ts` 支持通过 URL 参数（如 `?preload-fail=floor.tile`）强制特定 asset 加载失败，用于测试失败 UI 流程。
- **剧情实体**: `storyEntities.ts` 中 `buildStoryEntityDebugEntries()` 根据 `storyFlags` 动态决定显示哪些 NPC sprite（站立、横躺有血、头部部件等）。
- **black overlay**: PlayScene 维护独立的 `blackOverlay`（depth 1500），用于 blackScreen 和 ending 时的全黑遮罩。

## ANTI-PATTERNS
- **Never** 在 `PlayScene` 中直接用 `yangYunRed` 硬编码作为默认角色；始终以 `saveState.controllableCharacterId` 为准。
- **Never** 跳过 `shutdown()` 中的清理 — 会泄漏事件监听器和 sprite。
