# UI 系统 — NarrativeUIManager

**Scope:** `src/ui/`

## STRUCTURE
```
src/ui/
├── NarrativeUIManager.ts    # 对话/任务/角色提示/计时器/幕帘 UI 管理器
├── uiTheme.ts               # 暗色像素恐怖主题常量 + 样式辅助函数
└── uiState.ts               # UI 调试状态 + 角色名/立绘映射
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改对话框布局 | `NarrativeUIManager.ts` | `DIALOGUE_BG_WIDTH=720`, `DIALOGUE_BG_HEIGHT=132`, `DIALOGUE_BG_Y=628` |
| 改角色提示样式 | `NarrativeUIManager.ts` | `setRolePrompt()` — 全屏遮罩 + 中心卡片 |
| 改任务显示 | `NarrativeUIManager.ts` | `setTask()` — `"无"` 或空字符串时隐藏 |
| 改计时器显示 | `NarrativeUIManager.ts` | `setTimer()` — `MM:SS` 格式 |
| 改主题颜色/字体 | `uiTheme.ts` | `UI_THEME` — colors / alpha / font / stroke |
| 改角色立绘映射 | `uiState.ts` | `PORTRAIT_KEYS` / `getDialoguePortraitKey()` |
| 改角色显示名 | `uiState.ts` | `DISPLAY_NAMES` / `getDisplayName()` |

## CONVENTIONS
- **像素恐怖风格**: `UI_THEME` 使用暗色 surface + 金色边框 + 像素字体（`monospace`）。所有 UI 通过 `applyPixelTextStyle()` / `applyPixelStrokeStyle()` 统一风格。
- **角色提示**: `setRolePrompt()` 显示全屏遮罩（`0x050506, 0.94`）+ 中心卡片（`420×220`）+ "你现在是" 标题 + 角色名。深度 `CURTAIN_DEPTH + 10~12`（2010~2012）。
- **角色提示阻塞**: `isRolePromptBlocking()` 返回 `true`。`EventEngine` 在 `switchCharacter` 时锁输入 `rolePrompt`，等待 2000ms 后自动隐藏。
- **任务隐藏**: `setTask(text)` 中 `text === '' || text === '无'` 时隐藏 UI。
- **对话肖像**: `getDialoguePortraitKey(speaker, controllableCharacterId)` 根据说话人和当前可控角色解析立绘 key。
- **幕帘**: `setCurtain()` 用于章节过渡（"下一幕" / "敬请期待"）和 blackScreen。深度 `CURTAIN_DEPTH=2000`。
- **UI 深度层级**: `UI_BG_DEPTH=1000`, `UI_TEXT_DEPTH=1001`, `UI_OVERLAY_DEPTH=1002`, `CURTAIN_DEPTH=2000`, `CURTAIN_TEXT_DEPTH=2001`。
- **窗口暴露**: `NarrativeUIManager` 将自身挂到 `window.__YING_ZHONG_JIU_NARRATIVE_UI__`。

## ANTI-PATTERNS
- **Never** 跳过 `syncDebugState()` — E2E 依赖 `window.__YING_ZHONG_JIU_SCENE_STATE__.ui`。
- **Never** 直接操作 `Window` 接口未声明的全局变量 — 只有 `__YING_ZHONG_JIU_SCENE_STATE__` 有类型声明。
