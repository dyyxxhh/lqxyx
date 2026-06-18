# 数据层 — 地图 / 剧本类型 / 资产

**Scope:** `src/data/`

## STRUCTURE
```
src/data/
├── assets.ts          # 资产清单（42 条 FINAL + 6 条 APPROVED）+ 验证 + 生产关卡报告
├── assetUrls.ts       # 静态资产路径 → URL 映射（Vite / 开发环境）
├── maps.ts            # 学校地图数据（4F/5F 走廊 + 房间）
└── story.ts           # 剧本类型定义（19 种命令、检查点 A~I、分支 A-1/A-2/B-1/B-2）
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改楼层/走廊/房间尺寸 | `maps.ts` | `corridorBounds`、`room()` 工厂函数 |
| 改门位置/大小/朝向 | `maps.ts` | `roomDoor()` / `elevatorDoor()` / `backgroundDoor()` |
| 改地板单砖尺寸 | `maps.ts` | `floorTile = { tileWidth: 192, tileHeight: 192 }` |
| 改检查点/分支/命令 | `story.ts` | `StoryCheckpoint`、`StoryBranch`、`StoryCommand` 联合类型 |
| 加新资产 | `assets.ts` | 需填 `AssetManifestEntry`，路径必须在 `最终素材/` 下 |
| 改资产路径规则 | `assets.ts` | `validateAssetManifest()` 禁止含 `其他/` 的路径 |

## CONVENTIONS
- **地图坐标系**: 原点左上角，单位 "design-pixel-placeholder"，参考 `设计/楼道.jpg`。
- **走廊门**: 所有走廊门统一竖向 `24×128`（`DOOR_HEIGHT = 128`），紧贴 walkable bounds 边界（左门 x≈276，右门 x≈820）。
- **房间门**: 教室内门同样竖向 `24×128`，贴左右墙壁（x=96 或 x=840）。
- **地板平铺**: `floor.tile` 源图 384×384 含 2×2 砖；运行时取 frame `single-floor-tile-192`（192×192）重复平铺。
- **剧本命令**: `StoryCommand` 是 19 种命令的联合类型，所有命令可选 `condition?: StoryCommandCondition`。
  - 命令类型：checkpoint, gotoCheckpoint, task, dialogue, switchCharacter, setControl, wait, blackScreenDialogueWait, fade, blackScreen, deathFlash, branch, timer, awaitView, interaction, setFlag, switchView, ending, curtain
- **资产状态**: `FINAL_ASSET` = 已交付图；`APPROVED_PROGRAMMATIC` = 代码绘制；`APPROVED_REUSE` = 复用其他资产；`APPROVED_DERIVED` = 派生；`BLOCKER_FOR_FINAL_ART` = 阻塞。
- **资产 key 命名**: 点分隔层级，如 `sprite.yangYunBlue.right.step`、`prop.celery`、`portrait.danYuxuan`。
- **资产根目录**: `allowedAssetRoots = ['最终素材']`。`validateAssetManifest()` 拒绝任何含 `其他/` 的路径。
- **第一幕必需资产**: `requiredFirstActAssetKeys` 列表包含 19 个 key，覆盖地板、家具、立绘、角色动作、道具、门、通信设备等。
- **Door ID 命名**: `<floor>f-<room>-<position>`，如 `4f-gt2-front`、`5f-communication-control-back`。
- **blackScreenDialogueWait**: 固定 `durationMs: 500`，两阶段：500ms 黑屏 → 对话 → 500ms 等待。

## ANTI-PATTERNS
- **Never** 在 `assetManifest` 中使用 `其他/` 路径 — `validateAssetManifest` 会拒绝。
- **Never** 直接修改 `story.ts` 中的类型而忘记同步 `第一幕剧本.txt` 的叙述。
- **Never** 在 `maps.ts` 中硬编码新的 `AreaKind` 而不更新 `MapArea` 相关类型守卫。
