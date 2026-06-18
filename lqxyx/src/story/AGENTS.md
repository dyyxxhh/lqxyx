# 剧本引擎 — EventEngine

**Scope:** `src/story/`

## STRUCTURE
```
src/story/
├── EventEngine.ts    # 剧本命令执行器（状态机 + 输入锁）
└── eventState.ts     # 剧本运行时调试状态
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 加新命令类型 | `EventEngine.ts` | `executeCommand()` switch + `StoryCommand` 联合类型（`src/data/story.ts`） |
| 改对话推进逻辑 | `EventEngine.ts` | `advance()` — 仅 `awaiting_advance` 时推进 |
| 改角色切换提示 | `EventEngine.ts` | `handleSwitchCharacter()` — 调 `NarrativeUIManager.setRolePrompt()` |
| 改输入锁理由 | `EventEngine.ts` + `InputManager.ts` | `InputLockReason` 枚举需两边同步 |
| 改计时器/等待 | `EventEngine.ts` | `update()` 驱动 `gameTimers` 倒计时 |
| 改死亡闪屏 | `EventEngine.ts` | `handleDeathFlash()` → 调 `DeathFlashManager` |
| 改分支加载 | `EventEngine.ts` | `loadBranch()` + `selectBranch()` |
| 改存档同步 | `EventEngine.ts` | `persistSave()` → `localStorage` |
| 改剧情实体可见性 | `src/scenes/storyEntities.ts` | `buildStoryEntityDebugEntries()` 按 `storyFlags` 决定显示/隐藏 |

## CONVENTIONS
- **状态机**: `EngineState` 10 种状态（idle/executing/waiting/awaiting_advance/awaiting_branch/awaiting_interaction/awaiting_proximity/awaiting_view/awaiting_scripted_movement/completed）。
- **命令执行**: `executeNext()` 循环执行命令直到遇到阻塞命令（返回 true）。
- **输入锁**: 阻塞命令（dialogue/blackScreen/deathFlash 等）通过 `inputManager.lock(reason)` 锁定输入；解除由各自 handler 或 `restoreControlLock()` 控制。
- **角色切换阻塞**: `switchCharacter` 触发时，若 `NarrativeUIManager.isRolePromptBlocking()` 为 true，则锁 `rolePrompt` 2000ms，超时后自动隐藏并继续。
- **存档同步**: `handleCheckpoint()` 调 `persistSave()` 写 `localStorage`。`EngineMutable` 跟踪 checkpointId、floorId、roomId、controllableCharacterId、task、storyFlags、branchChoices、timers、triggeredEvents、position。
- **条件执行**: 所有 `StoryCommand` 可选 `condition?: { flag: string; equals: boolean }`，不满足时跳过。
- **blackScreenDialogueWait**: 固定 500ms 黑屏 → 对话 → 500ms 等待。
- **任务隐藏**: `task` 值为 `"无"` 或空字符串时 UI 不显示。
- **死亡闪屏**: `handleDeathFlash()` 调 `onDeathFlash` 回调，由 `DeathFlashManager` 按 `DeathFlashFrame[]` 序列播放（血黑/白底/黑底 + 芹菜/尺子贴图）。
- **近距交互**: `interaction` 命令的 `proximity` 模式要求玩家移动 ≥1px 后才触发（防止即时重触发）。
- **定时器视口门控**: `timer` 命令可设置 `visibilityTargetId`，仅在目标矩形在相机视野内时才倒计时。

## ANTI-PATTERNS
- **Never** 在 `awaiting_advance` 时自动推进 — 必须等玩家按 F 或点击。
- **Never** 在 locked 状态下放行非 dialogue 交互（`allowsLockedInteract` 仅限 dialogue）。
- **Never** 让 `advance()` 在未设置 `advanceGuard` 时重入。
- **Never** 跳过 `syncDebugState()` — E2E 和手动 QA 依赖 `window.__YING_ZHONG_JIU_SCENE_STATE__`。
