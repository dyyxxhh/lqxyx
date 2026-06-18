# 输入系统 — InputManager

**Scope:** `src/input/`

## STRUCTURE
```
src/input/
├── InputManager.ts    # 输入管理（键鼠/摇杆/全屏/横屏）+ 锁系统
└── inputState.ts      # 输入调试状态
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改输入锁理由 | `InputManager.ts` | `InputLockReason` 类型 — dialogue/rolePrompt/blackScreen/elevatorFade/scriptedMovement/ending |
| 改键位绑定 | `InputManager.ts` | `setupDesktopKeyboard()` — WASD + 方向键 + F + Q |
| 改摇杆行为 | `InputManager.ts` | `onPointerDown/Move/Up()` — 8 方向量化 |
| 改全屏提示 | `InputManager.ts` | `setupFullscreenPrompt()` — 进入/暂不/重入按钮 |
| 改横屏检测 | `InputManager.ts` | `setupOrientationHandling()` — 竖屏遮罩 |
| 改移动端交互 | `InputManager.ts` | `pressMobileInteract()` — 120ms debounce |

## CONVENTIONS
- **输入锁**: `lock(reason: InputLockReason)` 锁定所有移动和交互；`unlock()` 解除。`getMovementVector()` 在 locked 时返回 `{0,0}`。
- **锁理由**: `dialogue` / `rolePrompt` / `blackScreen` / `elevatorFade` / `scriptedMovement` / `ending`。只有 `dialogue` 允许 `consumeInteract()` 在 locked 时返回有效交互。
- **8 方向量化**: `quantizeTo8Directions(angle)` 将角度映射到 `[0, 45, 90, 135, 180, 225, 270, 315]`，再转为 `{x: -1/0/1, y: -1/0/1}`。
- **移动端**: 左侧摇杆区（`x < 400`）控制移动，右侧交互区（`x > 880`）触发交互。摇杆 thumb 跟随手指，限制半径 80px。
- **全屏提示**: 进入时显示 "建议进入全屏模式" 横幅，含 "全屏"/"暂不" 按钮。"暂不" 后显示右上角 "全屏" 重入按钮。
- **横屏检测**: 竖屏时显示全屏不透明遮罩（`请旋转设备至横屏`）。
- **debounce**: 移动端交互按钮 `MOBILE_INTERACT_DEBOUNCE_MS = 120`。
- **对话点击区**: 桌面端点击对话区域（`280 ≤ x ≤ 1000, 560 ≤ y ≤ 710`）视为 F 键交互。
- **窗口暴露**: `InputManager` 将自身挂到 `window.__YING_ZHONG_JIU_INPUT_MANAGER__`。

## ANTI-PATTERNS
- **Never** 在 locked 状态下放行非 dialogue 交互（`allowsLockedInteract` 仅限 dialogue）。
- **Never** 跳过 `resetJoystick()` 在页面隐藏/失焦/方向变化时的调用 — 会导致输入卡住。
- **Never** 使用 `setTimeout` 代替 Phaser 计时器 — `fullscreenFallbackTimeout` 应改用场景计时器。
