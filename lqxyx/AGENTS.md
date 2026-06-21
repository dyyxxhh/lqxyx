# PROJECT KNOWLEDGE BASE — 影中咎

**Generated:** 2026-06-17
**Commit:** 920c49d
**Branch:** master

## OVERVIEW
影中咎（第一幕）— 基于 Phaser 4 + TypeScript 的像素风横版剧情冒险游戏。玩家操控杨云（蓝边/红边双人格）在 4F/5F 楼道与教室之间移动，触发对话、分支选择与死亡闪屏。

## STRUCTURE
```
.
├── src/
│   ├── main.ts               # 入口，挂载 #game-root
│   ├── characters/           # 角色状态 + 行走动画配置
│   ├── data/                 # 地图、剧本、素材清单
│   ├── game/                 # GameConfig + scaffoldState（全局调试状态）
│   ├── input/                # InputManager（键鼠/摇杆/全屏/横屏）
│   ├── map/                  # MapRenderer + CollisionManager
│   ├── scenes/               # Boot → Preload → GameScene（菜单）→ PlayScene
│   ├── state/                # SaveState（localStorage）
│   ├── story/                # EventEngine（剧本命令执行器）
│   └── ui/                   # NarrativeUIManager（对话/任务/角色提示/计时器）
├── 最终素材/                 # 唯一允许的素材根目录
├── 设计/                     # 比例/UI 参考图
├── 第一幕剧本.txt             # 剧情对白与事件顺序依据
├── public/assets/final/      # 运行时加载的素材
├── tests/e2e/                # Playwright E2E（28 specs）
├── src/tests/                # Vitest 单元测试（21 files）
├── server/                   # 原生 Node.js 静态服务器（生产部署）
└── scripts/verify.mjs        # 证据管线验证脚本
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| 改地图/门/地板 | `src/data/maps.ts` + `src/map/MapRenderer.ts` | 门竖向贴墙 `24×128`（DOOR_HEIGHT=128），地板单砖 `192×192` |
| 改剧情/分支/检查点 | `src/data/story.ts`（数据）+ `src/story/EventEngine.ts`（执行） | checkpoint A~I，branch A-1/A-2/B-1/B-2 |
| 改角色初始位置/JSON 存档 | `src/state/saveState.ts` | 默认 4F 走廊中心 `560,920,down`，蓝边；JSON 存档包包含 SaveState 与杨云 replay buffer |
| 改角色动画/方向 | `src/characters/CharacterRegistry.ts` + `src/scenes/PlayScene.ts` | 8 方向移动，斜向取上下方向贴图 |
| 改 UI（对话/提示/计时器） | `src/ui/NarrativeUIManager.ts` | 角色提示全屏遮罩，阻塞 2 秒（ROLE_PROMPT_DURATION_MS=2000） |
| 改输入锁/交互 | `src/input/InputManager.ts` | lockReason: dialogue/rolePrompt/blackScreen/elevatorFade/scriptedMovement/ending |
| 改素材路径/清单 | `src/data/assets.ts` + `src/data/assetUrls.ts` | 禁止引用 `其他/` 目录 |
| 改预加载/失败注入 | `src/scenes/PreloadScene.ts` + `preloadDebugGate.ts` | URL 参数可强制预加载失败（调试用） |
| 改生产部署 | `server/static-server.js` + `ecosystem.config.cjs` | PM2 端口 8949，512MB 内存限制 |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `StoryCommand` | Union (19 variants) | `src/data/story.ts` | 剧本命令类型系统 |
| `EventEngine` | Class | `src/story/EventEngine.ts` | 剧本执行状态机（10 状态） |
| `PlayScene` | Class | `src/scenes/PlayScene.ts` | 核心游戏场景 |
| `InputManager` | Class | `src/input/InputManager.ts` | 输入 + 锁系统 |
| `MapRenderer` | Class | `src/map/MapRenderer.ts` | 地图渲染 + 门交互 |
| `NarrativeUIManager` | Class | `src/ui/NarrativeUIManager.ts` | 对话/任务/提示/计时器 UI |
| `SaveState` | Interface | `src/state/saveState.ts` | 存档 schema（localStorage） |
| `SchoolMapManifest` | Interface | `src/data/maps.ts` | 地图数据 schema |
| `AssetManifestEntry` | Interface | `src/data/assets.ts` | 资产清单条目 |
| `UI_THEME` | Const | `src/ui/uiTheme.ts` | 暗色像素恐怖主题 |

## CONVENTIONS
- **素材根目录唯一**: 只允许 `最终素材/`。`src/data/assets.ts` 的 `validateAssetManifest` 会拒绝含 `其他/` 的路径。`allowedAssetRoots = ['最终素材']`。
- **角色命名**: 内部 ID 区分 `yangYunBlue` / `yangYunRed`，显示名均为 `杨云`。蓝边=正常人格，红边=黑化人格。
- **行走动画**: 上下方向用 `leftLeg/rightLeg` 交替；左右方向用 `step/idle` 交替。`PlayScene.updateCharacterAnimation` 按 `time.now / 180` 切帧。
- **8 方向移动**: `InputManager` 支持 8 方向；`CharacterRegistry.resolveDirection` 斜向优先取上下方向。
- **门渲染**: 走廊门是竖向 `24×128` 贴墙木条（depth 6），标签 depth 7，交互 hitArea depth 8。`DOOR_HEIGHT = 128`。
- **地板拼接**: `floor.tile` 源图 384×384 含 2×2 四块砖；渲染时取单砖 frame `single-floor-tile-192`（192×192）并平铺。`floorTile = { tileWidth: 192, tileHeight: 192 }`。
- **角色提示阻塞**: `NarrativeUIManager.isRolePromptBlocking()` 返回 `true`；`EventEngine` 在 `switchCharacter` 时锁输入 `rolePrompt`，等待 `ROLE_PROMPT_DURATION_MS = 2000` 后自动隐藏。
- **存档**: 主存档 `localStorage` key `ying-zhong-jiu.checkpoint-save.v1`，schemaVersion = 1；导入/导出使用 JSON 存档包，包含完整 `SaveState` 与 `ying-zhong-jiu.replay-buffer.v1` 杨云 replay buffer。
- **深度层级**: floor=0, walls=1, door surface=2, furniture=3, in-room door=4, corridor door=6, label=7, hitArea=8, player=10, UI=1000~2001。
- **资产 key 命名**: 点分隔层级，如 `sprite.yangYunBlue.right.step`、`prop.celery`、`portrait.danYuxuan`。
- **任务隐藏**: `task` 值为 `"无"` 或空字符串时 UI 不显示。
- **无代码风格工具**: 本项目没有 ESLint、Biome、Prettier、.editorconfig。全靠 TypeScript strict 模式和手动约定。

## ANTI-PATTERNS (THIS PROJECT)
- **Never** 引用 `其他/` 目录作为生产素材来源。
- **Never** 在 `InputManager` 的 locked 状态下直接放行非 dialogue 交互（`allowsLockedInteract` 仅允许 dialogue）。
- **Never** 让 `EventEngine` 在 `awaiting_advance` 状态时自动推进 — 必须等玩家按 F 或点击。
- **Never** 在 `PlayScene` 中直接用 `yangYunRed` 硬编码作为默认角色；始终以 `saveState.controllableCharacterId` 为准。
- **Never** 删除/跳过失败测试来让构建通过。本项目强制 TDD（RED→GREEN→SURFACE）。
- **Never** 跳过 `syncDebugState()` — E2E 和手动 QA 依赖 `window.__YING_ZHONG_JIU_SCENE_STATE__`。
- **Never** 使用未声明的 window 全局 — 只有 `__YING_ZHONG_JIU_SCENE_STATE__` 在 `Window` 接口上有类型声明。

## UNIQUE STYLES
- **像素恐怖风格**: `UI_THEME` 使用暗色 surface + 金色边框 + 像素字体。所有 UI 元素通过 `applyPixelTextStyle` / `applyPixelStrokeStyle` 统一风格。
- **死亡闪屏**: `DeathFlashManager` 按剧本定义的顺序快速切换血黑/白底/黑底 + 芹菜/尺子贴图。
- **Debug 全局状态**: 全量调试状态挂在 `window.__YING_ZHONG_JIU_SCENE_STATE__`，E2E 与手动 QA 依赖此状态断言。`SceneDebugState` 聚合 save/input/story/ui/character/map/preload 7 个子状态。
- **窗口暴露**: 多个核心对象挂在 `window`（`__YING_ZHONG_JIU_INPUT_MANAGER__`、`__YING_ZHONG_JIU_EVENT_ENGINE__` 等），仅供 E2E 和调试。
- **`as unknown as` 模式**: 代码中使用 `as unknown as` 进行 window 全局挂载和 duck-typing（如 `EventEngine.ts:544` 探测 `isRolePromptBlocking`），是项目特有的 E2E 可观察性模式。

## COMMANDS
```bash
npm run dev          # Vite dev server (host 0.0.0.0)
npm run build        # tsc --noEmit + vite build
npm run typecheck    # tsc --noEmit
npm run test:run     # vitest run（21 个单元测试文件）
npm run e2e          # playwright test（28 个 E2E spec）
npm run verify       # node scripts/verify.mjs
```

## NOTES
- **剧本即代码**: `第一幕剧本.txt` 是剧情实现依据，但运行时剧本数据来自 `src/data/story.ts` 中的 `storyManifest`。修改剧情需同步两边。
- **初始位置依据剧本**: 剧本开头 "你现在是杨云（蓝边）" → `saveState.ts` 默认 `controllableCharacterId: 'yangYunBlue'`，位置在 4F 走廊中心。
- **E2E 依赖**: `tests/e2e/` 中的截图测试依赖素材文件存在；若素材缺失会导致 `preload` 失败测试报错。
- **Phaser 4**: 使用 `Phaser.AUTO`，`pixelArt: true`，`roundPixels: true`，物理引擎为 arcade。
- **TypeScript 严格**: `strict: true` + `noUnusedLocals` + `noUnusedParameters` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`。
- **预加载故障注入**: `preloadDebugGate.ts` 支持通过 URL 参数强制预加载失败（调试用）。
- **生产服务器**: `server/static-server.js` 是原生 Node.js HTTP 静态服务器（非 Express），支持 Brotli/Gzip、CSP、SPA fallback。
