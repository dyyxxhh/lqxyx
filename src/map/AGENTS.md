# 地图系统 — MapRenderer / CollisionManager

**Scope:** `src/map/`

## STRUCTURE
```
src/map/
├── MapRenderer.ts        # 走廊/房间渲染、门交互、电梯过渡动画
├── CollisionManager.ts   # 碰撞检测、行走区、碰撞区
└── mapState.ts           # 地图调试状态
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改走廊/房间渲染 | `MapRenderer.ts` | `renderCorridor()` / `renderRoom()` |
| 改地板平铺逻辑 | `MapRenderer.ts` | `renderFloorTiles()` — 取 frame `single-floor-tile-192` |
| 改门渲染/交互 | `MapRenderer.ts` | `renderDoor()` — depth 6/7/8，hover 变色 |
| 改电梯过渡 | `MapRenderer.ts` | `startElevatorTransition()` — fadeOut → 切楼层 → fadeIn |
| 改碰撞检测 | `CollisionManager.ts` | `isWalkable()` / `getWalkableBounds()` |
| 改行走区边界 | `CollisionManager.ts` | `getWalkableZones()` / `getRoomWalkableZones()` |

## CONVENTIONS
- **走廊渲染**: `renderCorridor()` 绘制地板平铺 → 墙壁矩形（collisionZones, depth 1）→ 左右门表面（depth 2）→ 门（depth 6）→ 标签（depth 7）→ 交互 hitArea（depth 8）。
- **房间渲染**: `renderRoom()` 绘制地板平铺 → 四边墙壁（depth 2）→ 桌椅家具（depth 3，仅在 `classroom`）→ 室内门（depth 4）→ 交互目标（depth 3，如通信设备）。
- **地板平铺**: `renderFloorTiles()` 使用 `ensureFloorTileFrame()` 从 `floor.tile`（384×384）中提取单砖 frame `single-floor-tile-192`（192×192），按 `displayTileSize` 平铺。
- **走廊门**: 竖向 `24×128` 贴墙木条，左门 x≈276，右门 x≈820。`gfx.setDepth(6)`，标签 `depth 7`，hitArea `depth 8`。
- **室内门**: 同样竖向 `24×128`，贴左右墙壁（x=96 或 x=840）。`depth 4`。
- **电梯过渡**: `startElevatorTransition()` 使用 `cameras.main.fadeOut/fadeIn`，锁输入 `elevatorFade`，超时恢复 `ELEVATOR_TRANSITION_RECOVERY_MS=1200`。
- **深度层级**: floor=0, walls=1, door surface=2, furniture=3, in-room door=4, corridor door=6, label=7, hitArea=8, player=10。
- **门交互**: 门支持 `pointerover/pointerout` hover 效果（`DOOR_HOVER_COLOR = 0x8f6330`）和 `pointerdown` 触发过渡。
- **窗口暴露**: `MapRenderer` 通过 `(window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__` 动态获取 InputManager 以锁输入。

## ANTI-PATTERNS
- **Never** 使用 `setTimeout` 代替 Phaser 的 `time.delayedCall` — `transitionRecoveryTimeout` 应改用场景计时器。
- **Never** 硬编码楼层尺寸而不更新 `maps.ts` 中的 `corridorBounds` / `room()` 工厂函数。
