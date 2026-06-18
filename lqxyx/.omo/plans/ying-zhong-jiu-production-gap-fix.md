# 影中咎第一幕生产交付差异修复计划

## TL;DR
> **Summary**: 当前项目素材基本齐全，但存在剧情机制未落地、真实输入不可玩、地图/视觉缺口和生产部署风险。本计划把第一幕修到可真实游玩、可验证、可生产托管的交付状态。
> **Deliverables**:
> - 修复 F/Q/手机交互推进对话、邻近触发、自动走位、条件分支、死亡闪烁等核心剧情机制
> - 补齐 5F 校长办公室、尸体/头部/立绘/通信设备等脚本视觉呈现
> - 优化前端整体美观性：启动/加载、对话框、任务栏、移动端控件、按钮反馈和视觉层级
> - 加固移动端、地图/家具、预加载失败恢复和电梯切楼稳定性
> - 加固生产构建、PM2、静态服务器、安全头、压缩、依赖锁定和证据重建
> **Effort**: Large
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 → Task 2/3/4/5 → Task 6/7/8 → Task 11/12 → Final Verification

## Context
### Original Request
用户要求找出当前项目与早期提示词不符的地方及不合理的地方，并制定修改计划。早期提示词要求《影中咎》最终是可交付给用户的生产成品：使用 `最终素材/`，不碰 `其他/`，参考 `设计/` 与 `第一幕剧本.txt`，支持手机和电脑，端口 `8949`，PM2 托管，启动预加载全部资源。

### Interview Summary
- 本计划只修复第一幕可交付问题；第二幕、第三幕保持结构预留，不新增正式剧情内容。
- 不修改、不依赖 `其他/`。
- 默认测试策略：tests-after。每个实现任务必须同时补自动化测试或可执行验证。
- 用户接受“建议可调整”，但最终必须告知修改方向；本计划将所有默认决策写死，执行者不再做判断。

### Metis Review (gaps addressed)
- 必须优先修复真实 F 交互推进对话，否则玩家无法自然推进剧情。
- 死亡闪烁不能继续用单一红色遮罩，必须使用 `story.ts` 中帧序列与素材生成/复用。
- 自动走位禁止扩成复杂全局寻路；采用固定目标点 tween，避免范围膨胀。
- H 点条件分支必须使用 story flag，不允许两个交互顺序覆盖。
- 每个任务必须有 agent-executable QA，禁止“人工确认”。

## Work Objectives
### Core Objective
把当前《影中咎》第一幕从“有交付文档但存在阻塞/简化/证据不可靠”修到“真实玩家可完成第一幕、关键剧本视觉落地、生产部署可复现、QA 证据一致”的状态。

### Deliverables
- 可真实按 F/Q/手机交互推进完整第一幕。
- 检查点 A-I、分支 A-1/A-2/B-1/B-2、三个结局按剧本和条件触发。
- 死亡闪烁、尸体/头部、立绘、校长办公室、通信设备等关键视觉可见。
- 前端整体观感达到可交付水平：加载页、全屏提示、任务栏、对话框、按钮/摇杆反馈、地图色调和像素风统一。
- 手机端全屏提示、八方向摇杆、统一交互键可用。
- 生产构建无公开 sourcemap，依赖可复现，PM2 与静态服务器符合生产要求。
- `.omo/evidence/` 重新生成为当前构建和测试的最新证据。

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` 通过，0 error。
- `npm run test:run` 通过，且包含新增剧情机制、地图、输入、生产配置测试。
- `npm run build` 通过，且 `dist/assets/*.map` 不存在。
- `npm run e2e` 通过所有 Playwright project；不得通过 `window.__YING_ZHONG_JIU_EVENT_ENGINE__.advance()` 替代真实 F/手机交互完成主流程测试。
- `pm2 start ecosystem.config.cjs` 后 `curl -I http://127.0.0.1:8949/` 返回 200，并包含安全头。
- `.omo/evidence/final-verification-summary.md` 汇总最新命令输出和截图/视频证据。

### Must Have
- 保持所有剧本文字含义不变；对话文本从 `第一幕剧本.txt` / `src/data/story.ts` 保持一致。
- 所有生产素材路径只允许来自 `public/assets/final/` / `最终素材/` 镜像。
- 每个任务都必须有 happy path 与 failure/edge case QA。
- 所有 UI/玩法验收必须由 Playwright、Vitest、Bash、curl、pm2 命令执行。

### Must NOT Have
- 不读取、不复制、不引用 `其他/`。
- 不新增第二幕/第三幕正式内容。
- 不新增音频、云存档、多语言、设置页、账号系统。
- 不把自动走位扩展成复杂 A* 或完整寻路系统；只做剧本所需固定点 tween。
- 不保留生产 sourcemap、debug preload URL 参数、依赖 `latest`。

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after + existing Vitest/Playwright/TypeScript/Vite/PM2
- QA policy: Every task has agent-executed scenarios
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: Task 1, 9, 10, 11, 12, 13 — input foundation + production foundation + reliability cleanup
Wave 2: Task 2, 4, 5, 7, 8 — story mechanics + map/visual foundations
Wave 3: Task 3, 6, 14 — death/corpse visuals + mobile/preload polish + evidence pipeline
Wave 4: Task 15 — front-end aesthetic polish after gameplay/visual foundations
Wave 5: Task 16 — full regression, stale evidence replacement, documentation update
Wave 6: Final Verification Wave F1-F4

### Dependency Matrix (full, all tasks)
| Task | Blocks | Blocked By |
|---|---|---|
| 1. Real interaction input | 2, 4, 5, 6, 15, 16 | none |
| 2. Proximity + scripted tween | 15, 16 | 1 |
| 3. Death flash frames | 15, 16 | none |
| 4. Checkpoint H flags | 15, 16 | 1 |
| 5. 5F principal office | 15, 16 | 1 |
| 6. Corpse/head/portrait visuals | 15, 16 | 1 |
| 7. Map/furniture/communication visual | 15, 16 | none |
| 8. Elevator transition/spawn | 16 | none |
| 9. Runtime leak/state cleanup | 16 | none |
| 10. Production build reproducibility | 14, 16 | none |
| 11. Static server hardening | 16 | none |
| 12. PM2 hardening | 16 | none |
| 13. E2E project/mobile config | 15, 16 | none |
| 14. Evidence pipeline | 16 | 10 |
| 15. Front-end aesthetic polish | 16 | 1, 2, 3, 4, 5, 6, 7, 13 |
| 16. Final delivery doc refresh | F1-F4 | 1-15 |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Count | Categories |
|---|---:|---|
| 1 | 6 | unspecified-high, visual-engineering, quick |
| 2 | 5 | unspecified-high, visual-engineering |
| 3 | 3 | visual-engineering, unspecified-high |
| 4 | 1 | visual-engineering |
| 5 | 1 | unspecified-high |
| 6 | 4 | oracle, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. 修复真实 F/Q/手机交互推进对话

  **What to do**: 修改 `src/input/InputManager.ts` 和 `src/scenes/PlayScene.ts`，让 dialogue lock 只锁移动，不阻止 F/Q/手机交互键推进 `awaiting_advance` 状态。保留普通场景交互、防重复触发、移动锁定语义。新增真实键盘与手机交互回归测试，禁止只用 `eventEngine.advance()` 绕过输入。
  **Must NOT do**: 不删除 input lock；不让玩家在对话中移动；不改变 F/Q/手机统一交互语义。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 涉及输入状态机、移动锁和 E2E 回归
  - Skills: [] - 无需额外技能
  - Omitted: [`visual-engineering`] - 此任务不是视觉实现

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [2, 4, 5, 6, 15, 16] | Blocked By: []

  **References**:
  - Pattern: `src/input/InputManager.ts` - `consumeInteract()` lock guard 是根因
  - Pattern: `src/scenes/PlayScene.ts` - `handleInteract` / `handleFInteract` 真实输入路径
  - Test: `tests/e2e/` - Playwright 真实键盘与手机交互模式
  - Evidence: 审计发现 E2E 当前使用 `window.__YING_ZHONG_JIU_EVENT_ENGINE__.advance()` 绕过真实输入

  **Acceptance Criteria**:
  - [ ] `npm run test:run` 通过，并包含 dialogue lock 下 interact 可推进的单元测试
  - [ ] `npm run e2e -- --project=desktop-chromium` 中至少一个测试通过真实 `page.keyboard.press('f')` 推进三句对话
  - [ ] 手机项目中统一交互按钮可推进同一段对话

  **QA Scenarios**:
  ```
  Scenario: F advances dialogue while movement remains locked
    Tool: Playwright
    Steps: Start game; reach first visible dialogue matching /皇上不好了/; press `f`; assert text changes to next dialogue; attempt arrow/WASD movement during dialogue; record player position before/after.
    Expected: F advances exactly one line per press; player position unchanged while dialogue visible.
    Evidence: .omo/evidence/task-1-dialogue-f-advance.png

  Scenario: Mobile interaction button advances dialogue without joystick movement
    Tool: Playwright mobile-landscape-chromium
    Steps: Start game with mobile project; tap right-side interaction button twice during dialogue; sample player position before/after.
    Expected: Dialogue advances two lines; player does not move from dialogue lock.
    Evidence: .omo/evidence/task-1-mobile-dialogue-advance.png
  ```

  **Commit**: YES | Message: `fix(input): allow dialogue advance while locked` | Files: [`src/input/InputManager.ts`, `src/scenes/PlayScene.ts`, `tests/e2e/*`, `src/**/*.test.ts`]

- [x] 2. 实现检查点 A 邻近触发与剧本固定点自动走位

  **What to do**: 在 `src/story/EventEngine.ts` / `src/scenes/PlayScene.ts` 增加 proximity 等待机制和固定目标 tween 自动走位。检查点 A 必须等玩家靠近但宇轩才触发“我要搓手”对白；杨云/董继豪自动走向秦浩睿尸体使用固定坐标 tween，路径失败时保底停在目标点附近。
  **Must NOT do**: 不实现完整 A* 寻路；不改变剧本文字；不让 proximity 命令立即通过。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 需要改事件引擎和场景状态同步
  - Skills: [] - 无需额外技能
  - Omitted: [`artistry`] - 不需要非常规方案

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [15, 16] | Blocked By: [1]

  **References**:
  - Pattern: `src/data/story.ts` - checkpoint A `input: "proximity"` 与 scripted control 命令
  - Pattern: `src/story/EventEngine.ts` - interaction/wait command handling
  - Pattern: `src/scenes/PlayScene.ts` - player position、update loop、Phaser tween

  **Acceptance Criteria**:
  - [ ] checkpoint A 在玩家未进入配置半径前不会触发 proximity 对话
  - [ ] scripted movement 显示 tween 动画且最终位置与目标点距离 ≤ 16px
  - [ ] `npm run test:run` 包含 proximity 状态机和 scripted move 完成测试

  **QA Scenarios**:
  ```
  Scenario: Checkpoint A waits until player is near Dan Yuxuan
    Tool: Playwright
    Steps: Enter GT1; keep player 200px away from Dan Yuxuan trigger for 2s; assert dialogue /我要搓手/ not visible; move within configured radius; wait 500ms.
    Expected: Dialogue appears only after entering proximity radius.
    Evidence: .omo/evidence/task-2-proximity-trigger.png

  Scenario: Scripted auto-walk reaches Qin Haorui body target
    Tool: Playwright
    Steps: Fast-forward to branch section that triggers scripted movement; record actor start position; wait for tween completion; read debug actor position.
    Expected: Actor visibly moves over time and ends within 16px of configured target; input locked during tween and unlocked afterward if story requires.
    Evidence: .omo/evidence/task-2-scripted-walk.webm
  ```

  **Commit**: YES | Message: `feat(story): add proximity and scripted movement` | Files: [`src/story/EventEngine.ts`, `src/scenes/PlayScene.ts`, `src/data/story.ts`, `tests/**`]

- [x] 3. 实现死亡闪烁帧序列渲染

  **What to do**: 新增或整合 `DeathFlashManager`，按 `src/data/story.ts` 中 celery/ruler death flash frame 数据渲染：血迹黑屏、黑白背景、芹菜/尺子素材、大小变化和精确 duration。芹菜黑白/放大变体从 `最终素材/芹菜（字面意思）.png` 派生；尺子复用 `尺子（字面意思）.png`。替换 `PlayScene` 当前 200ms 红色遮罩逻辑。
  **Must NOT do**: 不继续使用单一红色 overlay 代替；不新增外部素材；不在每帧创建未销毁对象。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: Phaser 视觉序列、帧捕获、素材变体
  - Skills: [] - 无需额外技能
  - Omitted: [`deep`] - 问题明确，不需深研

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [15, 16] | Blocked By: []

  **References**:
  - Pattern: `src/data/story.ts` - death flash frame definitions
  - Pattern: `src/story/EventEngine.ts` - `handleDeathFlash()` 当前只 wait
  - Pattern: `src/scenes/PlayScene.ts` - `updateBlackOverlay()` 当前红色遮罩
  - Asset: `最终素材/血迹黑屏.jpg`, `最终素材/芹菜（字面意思）.png`, `最终素材/尺子（字面意思）.png`

  **Acceptance Criteria**:
  - [ ] celery sequence 至少渲染 story 数据定义的全部帧，累计时长误差 ≤ 100ms
  - [ ] ruler sequence 显示尺子素材而非红色遮罩
  - [ ] `npm run test:run` 包含 frame schedule 测试；Playwright 生成视频证据

  **QA Scenarios**:
  ```
  Scenario: Celery death flash renders defined frames
    Tool: Playwright
    Steps: Trigger A-1 celery death flash; capture video; inspect exposed debug frame log containing frame keys and durations.
    Expected: Frame log matches story.ts order; video includes blood-black, black/white backgrounds, celery image frames.
    Evidence: .omo/evidence/task-3-celery-death-flash.webm

  Scenario: Death flash cleanup removes overlays after completion
    Tool: Vitest
    Steps: Instantiate manager with fake scene; play 2-frame flash; advance fake timers past total duration.
    Expected: Active overlay/image objects count returns to 0; input/story wait completes once.
    Evidence: .omo/evidence/task-3-death-flash-cleanup.log
  ```

  **Commit**: YES | Message: `feat(visual): render scripted death flash frames` | Files: [`src/scenes/PlayScene.ts`, `src/story/EventEngine.ts`, `src/**/*.ts`, `tests/**`]

- [x] 4. 实现 H 点通信状态条件分支

  **What to do**: 为 `EventEngine`/story interaction 增加 storyFlag 条件解析。H 点手机柜交互必须根据 `communicationDisabled` 或同义 flag 分辨“通信未开启”和“通信已开启”路径；执行 B-2 关闭学校通信后设置 flag；不再让两个 interaction 顺序覆盖。
  **Must NOT do**: 不硬编码只在 PlayScene 中吞掉一条分支；不改变 B-1/B-2/幸存结局文字。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 事件引擎、存档状态、分支条件
  - Skills: [] - 无需额外技能
  - Omitted: [`visual-engineering`] - 非视觉任务

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [15, 16] | Blocked By: [1]

  **References**:
  - Pattern: `src/data/story.ts` - checkpoint H consecutive communication interactions
  - Pattern: `src/story/EventEngine.ts` - interaction registration/resolution
  - Pattern: `src/state/saveState.ts` - story flag persistence/schema

  **Acceptance Criteria**:
  - [ ] 未关闭通信时，手机柜交互进入“提示信号屏蔽器/要求去五楼”路径
  - [ ] 已关闭通信时，手机柜交互进入 checkpoint I/“好了。”路径
  - [ ] save/load 后 communication flag 仍正确影响 H 点

  **QA Scenarios**:
  ```
  Scenario: H phone cabinet respects communication disabled flag
    Tool: Vitest
    Steps: Create engine state with communicationDisabled=false; resolve H cabinet interaction; repeat with communicationDisabled=true.
    Expected: false resolves to 未开启 path; true resolves to 已开启/checkpoint I path.
    Evidence: .omo/evidence/task-4-checkpoint-h-flag.log

  Scenario: Communication flag persists through save/load
    Tool: Playwright
    Steps: Trigger B-2 communication shutdown; save; reload page; interact with H cabinet.
    Expected: Reloaded state follows 已开启/disabled path and does not show 未开启 prompt.
    Evidence: .omo/evidence/task-4-communication-save-load.png
  ```

  **Commit**: YES | Message: `fix(story): gate checkpoint h interactions by flag` | Files: [`src/data/story.ts`, `src/story/EventEngine.ts`, `src/state/saveState.ts`, `tests/**`]

- [x] 5. 补齐 5F 校长办公室地图与 B-1 门口交互

  **What to do**: 在 `src/data/maps.ts` 增加 `principals-office-5f` room/door/spawn，并把 B-1 “五楼校长办公室门口” interaction 绑定到真实地图目标。固定决策：5F 校长办公室门放在左侧第 9 个门位，door id `principals-office-front-5f`，room id `principals-office-5f`，door label `校长办公室`；坐标规则为复用 5F 左侧第 8 门的 x/width/height，并将 y 设置为“第 8 门 y + 第 7/8 门 y 间距”，如果当前 corridor 高度不足则只扩展 5F corridor 高度和 walkableArea 底边到容纳该门，不移动右侧电梯/通信门。保持用户原要求“5 楼右侧前门删除、后门改学校通信”。
  **Must NOT do**: 不恢复 5F 右侧办公室前门；不覆盖 communication-control-5f 后门；不删除已有 GT 门。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: 地图门位、房间渲染和 Playwright 截图
  - Skills: [] - 无需额外技能
  - Omitted: [`deep`] - 规则明确

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [15, 16] | Blocked By: [1]

  **References**:
  - Pattern: `src/data/maps.ts` - floor/door/room schema
  - Pattern: `src/map/MapRenderer.ts` - roomDoor/backgroundDoor/elevator rendering
  - Story: `第一幕剧本.txt` - B-1 “前往五楼校长办公室”

  **Acceptance Criteria**:
  - [ ] 5F 地图存在 `principals-office-5f`，door id 固定为 `principals-office-front-5f`，左侧 order 固定为 9，且可从走廊门口进入/交互
  - [ ] 5F 右侧仍只有电梯和学校通信后门，无办公室前门
  - [ ] B-1 可走到校长办公室门口按 F 触发对应结局路径

  **QA Scenarios**:
  ```
  Scenario: B-1 principal office door exists and triggers interaction
    Tool: Playwright
    Steps: Fast-forward to B-1 objective; switch to 5F; navigate to principal office door; press F.
    Expected: Interaction text/ending path for 一分为二 begins; no missing target error.
    Evidence: .omo/evidence/task-5-principal-office-b1.png

  Scenario: 5F right-side door rule remains valid
    Tool: Vitest
    Steps: Inspect 5F corridor doors from map data.
    Expected: Right side has elevator plus communication-control back door only; no office front door.
    Evidence: .omo/evidence/task-5-5f-door-rules.log
  ```

  **Commit**: YES | Message: `fix(map): add principal office target for b1` | Files: [`src/data/maps.ts`, `src/data/story.ts`, `src/map/MapRenderer.ts`, `tests/**`]

- [x] 6. 渲染尸体、头部、非行走角色和对话立绘

  **What to do**: 添加 story flag 驱动的 world entity renderer：但宇轩站立/横躺有血/无血、秦浩睿横躺状态、头部拾取部件按 flag 显示/隐藏。把 `EventEngine.handleDialogue()` 的 speaker 映射到 `PORTRAIT_KEYS` 并传给 `NarrativeUIManager.setDialogue()`。未知 speaker 不显示立绘。
  **Must NOT do**: 不新增未提供角色素材；不把“红边/蓝边”泄露到玩家文本；不让 corpse sprite 阻挡不该阻挡的路径。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: 角色精灵渲染、图层、立绘 UI
  - Skills: [] - 无需额外技能
  - Omitted: [`artistry`] - 使用现有素材即可

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [15, 16] | Blocked By: [1]

  **References**:
  - Asset: `最终素材/角色动作/但宇轩-横躺有血.png`, `最终素材/角色动作/秦浩瑞-横躺有血.png`, head part assets
  - Asset: `最终素材/立绘/*`
  - Pattern: `src/ui/uiState.ts` - `PORTRAIT_KEYS`
  - Pattern: `src/ui/NarrativeUIManager.ts` - portrait parameter support
  - Pattern: `src/data/story.ts` - corpse/head story flags

  **Acceptance Criteria**:
  - [ ] 对话出现已知 speaker 时显示对应立绘
  - [ ] corpse/head flags 改变后世界中显示对应素材
  - [ ] corpse/head sprite 位置和图层不遮挡主角不可见，也不造成全图碰撞

  **QA Scenarios**:
  ```
  Scenario: Dialogue portraits appear for known speakers
    Tool: Playwright
    Steps: Trigger dialogue by 杨云 and 但宇轩; inspect screenshot and/or debug UI texture key.
    Expected: Portrait image key matches speaker mapping; unknown narration has no portrait.
    Evidence: .omo/evidence/task-6-dialogue-portraits.png

  Scenario: Corpse and head sprites follow story flags
    Tool: Vitest + Playwright
    Steps: Set qinHaoruiBodyBloodyOnGround and danYuxuanBodyProneAndBloody flags; render classroom; capture screenshot.
    Expected: Correct lying sprites visible at configured positions; clearing flag removes sprite.
    Evidence: .omo/evidence/task-6-corpse-rendering.png
  ```

  **Commit**: YES | Message: `feat(visual): render story entities and portraits` | Files: [`src/scenes/PlayScene.ts`, `src/ui/NarrativeUIManager.ts`, `src/ui/uiState.ts`, `src/data/story.ts`, `tests/**`]

- [x] 7. 调整地图视觉、家具缩放/碰撞和通信设备可见性

  **What to do**: 基于 `设计/楼道.jpg` 对当前 placeholder 坐标做最小生产校准：确保左侧 8 门顺序、右侧电梯/4F办公室/5F通信门规则正确。将 `桌椅.png` 预缩放或运行时目标高度调整到与人物约三分之一高的视觉比例，同时碰撞只覆盖下部阻挡区。为学校通信设备添加钢色程序绘制可见实体。
  **Must NOT do**: 不把整张桌椅图片都设为碰撞；不改变楼道/教室分离渲染原则；不引入 `其他/` 素材。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: 地图截图、比例、碰撞可视化
  - Skills: [] - 无需额外技能
  - Omitted: [`quick`] - 涉及多文件视觉验证

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [15, 16] | Blocked By: []

  **References**:
  - Design: `设计/楼道.jpg`
  - Pattern: `src/data/maps.ts` - coordinateSystem currently placeholder
  - Pattern: `src/map/MapRenderer.ts` - deskTargetHeight and door drawing
  - Pattern: `src/map/CollisionManager.ts` - furniture bottom collision behavior
  - Asset: `最终素材/桌椅.png`

  **Acceptance Criteria**:
  - [ ] 4F/5F 门数量、顺序、标签符合原提示词
  - [ ] 教室桌椅视觉高度约为人物高度 1/3，碰撞只阻挡下部区域
  - [ ] 通信控制房间可见通信设备，且可作为 F 交互目标

  **QA Scenarios**:
  ```
  Scenario: Corridor door rules match prompt
    Tool: Vitest
    Steps: Enumerate 4F and 5F corridor door data by side/order/type.
    Expected: Left side 8 class doors in required order; 4F right has elevator+office front/back; 5F right has elevator+communication back only.
    Evidence: .omo/evidence/task-7-door-rules.log

  Scenario: Furniture collision allows upper overlap and blocks lower body
    Tool: Playwright
    Steps: Enter classroom; move player behind upper visual region of desk; then attempt to cross lower blocking region.
    Expected: Upper overlap renders player partly under/behind furniture; lower region blocks movement.
    Evidence: .omo/evidence/task-7-furniture-collision.webm
  ```

  **Commit**: YES | Message: `fix(map): tune doors furniture and communication prop` | Files: [`src/data/maps.ts`, `src/map/MapRenderer.ts`, `src/map/CollisionManager.ts`, `tests/**`]

- [x] 8. 修复电梯切楼稳定性和出生点

  **What to do**: 修改 `src/map/MapRenderer.ts` 和 `src/scenes/PlayScene.ts`：电梯 fade 流程保留 0.5s 渐黑、切楼、0.5s 渐亮；增加 fade event 不触发时的 timeout fallback；切楼后使用 map spawnPoint 而非硬编码 y=1540 和保留 x。
  **Must NOT do**: 不缩短 fade duration；不让 transition flag 永久 stuck；不把玩家放到不可行走区域。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: Phaser camera fade、地图状态、边界 bug
  - Skills: [] - 无需额外技能
  - Omitted: [`visual-engineering`] - 视觉简单，核心是状态可靠性

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [16] | Blocked By: []

  **References**:
  - Pattern: `src/map/MapRenderer.ts` - `startElevatorTransition()` transitioning flag
  - Pattern: `src/scenes/PlayScene.ts` - elevator target floor and playerPosition assignment
  - Pattern: `src/data/maps.ts` - corridor spawnPoints

  **Acceptance Criteria**:
  - [ ] 电梯切楼总视觉流程为 0.5s fade out + 切换 + 0.5s fade in
  - [ ] fade event 不触发时 1.2s 内强制恢复 transitioning=false
  - [ ] 4F/5F 切换后玩家坐标等于目标楼层电梯 spawnPoint

  **QA Scenarios**:
  ```
  Scenario: Elevator uses target floor spawn point
    Tool: Vitest
    Steps: Trigger 4F→5F and 5F→4F transitions with map spawn fixtures.
    Expected: Player position equals target floor elevator spawn x/y; no hardcoded preserved x.
    Evidence: .omo/evidence/task-8-elevator-spawn.log

  Scenario: Elevator recovers when camera fade event never fires
    Tool: Vitest fake timers
    Steps: Start transition; suppress camerafadeincomplete; advance timers beyond fallback.
    Expected: transitioning=false and subsequent transition can start.
    Evidence: .omo/evidence/task-8-elevator-timeout.log
  ```

  **Commit**: YES | Message: `fix(map): harden elevator transitions` | Files: [`src/map/MapRenderer.ts`, `src/scenes/PlayScene.ts`, `tests/**`]

- [x] 9. 清理运行时泄漏、重复管理器和边界 bug

  **What to do**: 修复 `fullscreenerror` 匿名监听器、fullscreen fallback timeout、GameScene/PlayScene 双重创建 manager、`__WHITE` fallback、large delta teleport、0ms wait 同步递归、timer Map 迭代删除。每个 bug 添加最小测试。
  **Must NOT do**: 不重写整体场景架构；不破坏现有 window debug hooks，除非生产专门禁用。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 多个运行时稳定性修复和测试
  - Skills: [] - 无需额外技能
  - Omitted: [`visual-engineering`] - 主要是代码稳定性

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [16] | Blocked By: []

  **References**:
  - Pattern: `src/input/InputManager.ts` - fullscreen listener/timeout destroy
  - Pattern: `src/scenes/GameScene.ts`, `src/scenes/PlayScene.ts` - duplicate managers
  - Pattern: `src/story/EventEngine.ts` - wait/timer behavior
  - Pattern: `src/scenes/BootScene.ts` / `PlayScene.ts` - fallback texture

  **Acceptance Criteria**:
  - [ ] `destroy()` 移除 fullscreenerror listener 并 clear timeout
  - [ ] PlayScene restart 后不产生重复 manager/listener
  - [ ] delta capped，恢复 tab 后玩家不会穿墙瞬移
  - [ ] 0ms wait 使用 async microtask/timer，不递归爆栈

  **QA Scenarios**:
  ```
  Scenario: InputManager destroy cleans listeners and timers
    Tool: Vitest
    Steps: Create InputManager with mocked document; trigger fullscreen prompt; call destroy before timeout; advance timers.
    Expected: removeEventListener called for fullscreenerror; no stale callback mutates destroyed instance.
    Evidence: .omo/evidence/task-9-input-cleanup.log

  Scenario: Large delta does not teleport player through walls
    Tool: Vitest
    Steps: Simulate movement update with delta=30000ms toward a collision wall.
    Expected: Effective delta capped; final position remains within allowed movement step and collision respected.
    Evidence: .omo/evidence/task-9-delta-cap.log
  ```

  **Commit**: YES | Message: `fix(runtime): clean managers timers and fallbacks` | Files: [`src/input/InputManager.ts`, `src/scenes/*.ts`, `src/story/EventEngine.ts`, `tests/**`]

- [x] 10. 加固生产构建可复现性

  **What to do**: 将 `vite.config.ts` 生产 sourcemap 设为 `false`；移除或生产禁用 `preloadFailAsset` URL 参数；把 `package.json` 中所有 `latest` 依赖固定到当前 lockfile/installed 的具体版本；新增 `.gitignore` 覆盖 `node_modules/`, `dist/`, `.env`, `.omo/evidence/`, `.playwright-mcp/`, `test-results/`, `*.log`。
  **Must NOT do**: 不删除 `package-lock.json`；不引入未经测试的大版本升级；不把 `.omo/plans/` 忽略掉。

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 配置修复明确但需命令验证
  - Skills: [] - 无需额外技能
  - Omitted: [`deep`] - 不需要架构研究

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [14, 15] | Blocked By: []

  **References**:
  - Pattern: `vite.config.ts` - `sourcemap: true`
  - Pattern: `package.json`, `package-lock.json` - dependency versions
  - Pattern: `src/scenes/PreloadScene.ts` - `preloadFailAsset`

  **Acceptance Criteria**:
  - [ ] `npm run build` 后 `dist/assets/*.map` 不存在
  - [ ] `package.json` 不包含字符串 `"latest"`
  - [ ] `.gitignore` 存在且不会忽略 `.omo/plans/`
  - [ ] 生产 build 中 `?preloadFailAsset=` 不会触发人为失败

  **QA Scenarios**:
  ```
  Scenario: Production build emits no sourcemaps
    Tool: Bash
    Steps: Run `npm run build`; inspect `dist/assets/*.map`.
    Expected: No `.map` files exist; build exits 0.
    Evidence: .omo/evidence/task-10-no-sourcemap.log

  Scenario: Dependencies are pinned
    Tool: Bash
    Steps: Run a script/grep over package.json for `latest`; run `npm ci`; run `npm run typecheck`.
    Expected: No `latest`; npm ci and typecheck exit 0.
    Evidence: .omo/evidence/task-10-pinned-deps.log
  ```

  **Commit**: YES | Message: `chore(build): pin deps and disable prod sourcemaps` | Files: [`vite.config.ts`, `package.json`, `package-lock.json`, `.gitignore`, `src/scenes/PreloadScene.ts`]

- [x] 11. 加固静态服务器安全头和压缩

  **What to do**: 修改 `server/static-server.js`：添加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、适配 Phaser/Vite 的 CSP；为 `.js/.css/.html` 响应 gzip 或 brotli 压缩；HTML cache 使用 `no-cache, must-revalidate`，hash assets 继续 immutable。
  **Must NOT do**: 不阻断游戏加载自身脚本、图片、字体；不把安全头只加到 index，所有响应都应覆盖。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 生产服务、安全头、兼容验证
  - Skills: [] - 无需额外技能
  - Omitted: [`security-research`] - 非漏洞审计，只是硬化执行

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [16] | Blocked By: []

  **References**:
  - Pattern: `server/static-server.js` - current `sendFile()` response headers
  - Pattern: `ecosystem.config.cjs` - production server env PORT/HOST

  **Acceptance Criteria**:
  - [ ] `curl -I http://127.0.0.1:8949/` 包含安全头
  - [ ] `curl -H 'Accept-Encoding: gzip' -I .../*.js` 包含 gzip 或压缩相关响应
  - [ ] 游戏页面仍可在 Playwright production project 正常加载

  **QA Scenarios**:
  ```
  Scenario: Static server returns security headers
    Tool: Bash + curl
    Steps: Start server on 8949; run `curl -I http://127.0.0.1:8949/`.
    Expected: Headers include X-Content-Type-Options=nosniff, X-Frame-Options=DENY, Referrer-Policy=no-referrer, Content-Security-Policy present.
    Evidence: .omo/evidence/task-11-security-headers.log

  Scenario: Compressed JS still executes
    Tool: Playwright production-chromium
    Steps: Load production URL with normal browser Accept-Encoding; wait for game canvas and preload complete.
    Expected: Page loads without CSP violation; game canvas visible; no console errors for blocked assets.
    Evidence: .omo/evidence/task-11-production-load.png
  ```

  **Commit**: YES | Message: `chore(server): add security headers and compression` | Files: [`server/static-server.js`, `src/tests/**`, `tests/e2e/**`]

- [x] 12. 加固 PM2 生产托管策略

  **What to do**: 修改 `ecosystem.config.cjs`：保留端口 `8949`，加入 `autorestart: true`、`max_memory_restart: '512M'`、`max_restarts: 5`、`restart_delay: 5000`、`min_uptime: '10s'`、`kill_timeout: 5000`。补 PM2 验证文档/测试。
  **Must NOT do**: 不改端口；不切 cluster 多实例；不写全局 pm2 配置。

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: 单配置文件加命令验证
  - Skills: [] - 无需额外技能
  - Omitted: [`deep`] - 不需架构设计

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [16] | Blocked By: []

  **References**:
  - Pattern: `ecosystem.config.cjs` - current PM2 app config
  - Documentation: `DELIVERY.md` - PM2 section to refresh in Task 16

  **Acceptance Criteria**:
  - [ ] `pm2 start ecosystem.config.cjs` 启动 app name `ying-zhong-jiu-static`
  - [ ] `pm2 show ying-zhong-jiu-static` 显示 restart/memory policy
  - [ ] `curl http://127.0.0.1:8949/` 返回 200

  **QA Scenarios**:
  ```
  Scenario: PM2 starts on required port with restart policy
    Tool: Bash + pm2 + curl
    Steps: Run `pm2 start ecosystem.config.cjs`; run `pm2 show ying-zhong-jiu-static`; curl port 8949.
    Expected: Process online; policy fields visible; curl returns HTTP 200.
    Evidence: .omo/evidence/task-12-pm2-policy.log

  Scenario: PM2 config does not change port
    Tool: Vitest or Bash
    Steps: Parse ecosystem config env PORT.
    Expected: PORT equals `8949`; HOST remains intended binding.
    Evidence: .omo/evidence/task-12-port-8949.log
  ```

  **Commit**: YES | Message: `chore(pm2): add production restart policy` | Files: [`ecosystem.config.cjs`, `tests/**`]

- [x] 13. 修复 Playwright mobile project 与真实端到端覆盖

  **What to do**: 调整 `tests/e2e/input-mobile.spec.ts` 或 `playwright.config.ts`，确保 mobile tests 只在 mobile-landscape project 或显式 device config 下运行。增加桌面/手机完整第一幕 smoke flow，覆盖真实 F、手机交互、电梯、分支，不再依赖 debug advance 完成核心路径。
  **Must NOT do**: 不删除 E2E；不通过跳过测试伪造通过；debug hooks 只能用于定位/快进非核心重复段，不能替代待验证交互。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: E2E 配置、移动设备、完整流程
  - Skills: [] - 无需额外技能
  - Omitted: [`quick`] - 容易误跳过测试

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [15, 16] | Blocked By: []

  **References**:
  - Pattern: `playwright.config.ts` - desktop/mobile/production projects
  - Pattern: `tests/e2e/input-mobile.spec.ts` - currently misassigned mobile tests
  - Pattern: `tests/e2e/*` - existing debug advance usage

  **Acceptance Criteria**:
  - [ ] `npm run e2e -- --project=desktop-chromium` 不运行 mobile-only 测试
  - [ ] `npm run e2e -- --project=mobile-landscape-chromium` 覆盖全屏提示、摇杆、统一交互
  - [ ] 至少一个 desktop smoke test 使用真实键盘 F 完成对话推进

  **QA Scenarios**:
  ```
  Scenario: Mobile-only tests do not fail desktop project
    Tool: Bash
    Steps: Run `npm run e2e -- --project=desktop-chromium`.
    Expected: No failures from mobile touch capability assumptions.
    Evidence: .omo/evidence/task-13-desktop-e2e.log

  Scenario: Mobile controls work in mobile project
    Tool: Playwright mobile-landscape-chromium
    Steps: Load game; answer fullscreen prompt; drag joystick northeast; tap interaction button during dialogue.
    Expected: Player moves diagonally with correct input vector; interaction button advances/activates F/Q actions.
    Evidence: .omo/evidence/task-13-mobile-controls.webm
  ```

  **Commit**: YES | Message: `test(e2e): isolate mobile tests and verify real input` | Files: [`playwright.config.ts`, `tests/e2e/**`]

- [x] 14. 建立一致的验证证据流水线

  **What to do**: 新增 `scripts/verify-production.*` 或 npm script `verify`，串联 `typecheck`、`test:run`、`build`、必要 E2E、dist sourcemap/security 检查，并把输出写入 `.omo/evidence/`。清理/替换陈旧证据，不再让旧 hash、旧测试数量与当前 dist 混杂。
  **Must NOT do**: 不把 `.omo/evidence/` 当作源代码真相；不删除 `.omo/plans/`；不跳过失败命令继续生成“通过”证据。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: QA 流水线、证据一致性、命令编排
  - Skills: [] - 无需额外技能
  - Omitted: [`writing`] - 不是纯文档

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [16] | Blocked By: [10]

  **References**:
  - Pattern: `package.json` scripts
  - Existing: `.omo/evidence/task-*.log` stale/inconsistent audit findings
  - Pattern: `DELIVERY.md` evidence index to refresh in Task 16

  **Acceptance Criteria**:
  - [ ] `npm run verify` 或等效脚本失败即非 0 退出
  - [ ] 新证据包含当前 dist hash、测试数量、build 时间
  - [ ] 证据中不再出现互相矛盾的旧 hash/旧测试数量作为当前结论

  **QA Scenarios**:
  ```
  Scenario: Verification pipeline regenerates current evidence
    Tool: Bash
    Steps: Run `npm run verify`; inspect generated final evidence summary.
    Expected: Summary includes current build hash, command exit codes, test counts, and timestamp from this run.
    Evidence: .omo/evidence/task-14-verify-pipeline.log

  Scenario: Verification pipeline fails on sourcemap regression
    Tool: Bash
    Steps: Temporarily simulate/fixture a `.map` file check in script test mode; run check command.
    Expected: Check exits non-zero and reports sourcemap forbidden.
    Evidence: .omo/evidence/task-14-sourcemap-check.log
  ```

  **Commit**: YES | Message: `chore(qa): add production verification pipeline` | Files: [`package.json`, `scripts/**`, `.omo/evidence/**`]

- [x] 15. 优化前端整体美观性与交互反馈

  **What to do**: 在不新增玩法、不引入 `其他/` 的前提下，对前端视觉做生产级 polish：优化启动/加载页层级和进度反馈；让“是否全屏”弹窗、主线任务栏、对话框、角色身份提示、分支按钮、移动端摇杆和交互键具备统一像素风、边框/阴影/按压态/禁用态；调整地图底色、门/通信设备/家具的色彩一致性；增加不同分辨率下的安全区域布局，避免手机端控件遮挡对话或任务文本。视觉基准：整体保持黑暗校园/像素恐怖风，字体清晰、对比度足够、按钮状态明确。
  **Must NOT do**: 不新增第二/三幕内容；不更改剧本文字；不引入未授权素材；不把 UI 做成会遮挡游戏核心信息的重装饰；不要求用户人工确认“好看”。

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: 前端视觉、响应式布局、Playwright 截图回归
  - Skills: [] - 无需额外技能
  - Omitted: [`artistry`] - 需要稳妥生产 polish，不需要非常规创作

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: [16] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 13]

  **References**:
  - Design: `设计/“你现在是”的UI设计.jpg` - 身份提示/对话区域/角色立绘布局参考
  - Pattern: `src/ui/NarrativeUIManager.ts` - 对话框、任务栏、身份提示、分支按钮
  - Pattern: `src/input/InputManager.ts` - 手机摇杆、交互键、全屏提示
  - Pattern: `src/scenes/PreloadScene.ts` - 加载页与失败状态
  - Pattern: `src/map/MapRenderer.ts` - 地图底色、门、家具、通信设备程序绘制

  **Acceptance Criteria**:
  - [ ] 桌面 1280×720、移动横屏、移动竖屏/受限视口下，任务栏、对话框、摇杆、交互键互不遮挡
  - [ ] 加载页显示明确进度、失败状态和重试入口；按钮有 hover/pressed/disabled 或等价触摸反馈
  - [ ] 主线任务为“无”时仍不显示；非“无”时顶部居中且不被移动端安全区遮挡
  - [ ] 对话框、身份提示、分支按钮、全屏弹窗统一深色像素风，文字对比度满足可读性；Playwright 截图中无文本溢出
  - [ ] `npm run e2e` 中新增/更新视觉回归截图测试通过

  **QA Scenarios**:
  ```
  Scenario: Desktop UI visual hierarchy is readable and non-overlapping
    Tool: Playwright desktop-chromium
    Steps: Load game; capture preload, first dialogue, main task visible, branch choice states at 1280x720.
    Expected: No text overflow; dialogue box does not cover task bar; branch buttons show distinct normal/hover/pressed states via computed style or screenshot diff threshold.
    Evidence: .omo/evidence/task-15-desktop-ui-polish.png

  Scenario: Mobile controls and dialogue do not overlap
    Tool: Playwright mobile-landscape-chromium
    Steps: Load game; accept/refuse fullscreen prompt in separate runs; show dialogue; drag joystick; tap interaction button; capture screenshots.
    Expected: Joystick stays left, interaction key stays right, dialogue remains readable, task bar top-centered, safe-area padding respected.
    Evidence: .omo/evidence/task-15-mobile-ui-polish.webm
  ```

  **Commit**: YES | Message: `feat(ui): polish production visual presentation` | Files: [`src/ui/**`, `src/input/InputManager.ts`, `src/scenes/PreloadScene.ts`, `src/map/MapRenderer.ts`, `tests/e2e/**`]

- [x] 16. 刷新交付文档并执行全量回归

  **What to do**: 更新 `DELIVERY.md`：删除已修复 Known Limitations，保留真实剩余限制；刷新安装、构建、测试、PM2、安全头、证据索引；记录不碰 `其他/` 的生产依赖审计。运行全量 `typecheck`、`test:run`、`build`、`e2e`、PM2/curl 验证并生成最终证据摘要。
  **Must NOT do**: 不夸大“完全完成”而隐藏限制；不引用旧证据；不声称二三幕可玩。

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: 全量回归、文档一致性、证据汇总
  - Skills: [] - 无需额外技能
  - Omitted: [`writing`] - 需要命令验证，不只是写作

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: [F1, F2, F3, F4] | Blocked By: [1-15]

  **References**:
  - Documentation: `DELIVERY.md` current Known Limitations and Evidence Index
  - Pattern: `package.json` scripts
  - Evidence: `.omo/evidence/` regenerated by Task 14

  **Acceptance Criteria**:
  - [ ] `DELIVERY.md` 与当前代码、dist、测试结果一致
  - [ ] 全量命令均通过：`npm run typecheck`, `npm run test:run`, `npm run build`, `npm run e2e`
  - [ ] PM2 8949 验证通过并记录最新证据
  - [ ] Known Limitations 不再包含本计划应修复的问题

  **QA Scenarios**:
  ```
  Scenario: Full verification commands pass and are documented
    Tool: Bash
    Steps: Run typecheck, test:run, build, e2e, PM2 start, curl 8949; save outputs.
    Expected: All commands exit 0; DELIVERY.md evidence index points to these new files.
    Evidence: .omo/evidence/task-16-full-regression.log

  Scenario: Delivery document has no stale claims
    Tool: Bash
    Steps: Compare dist asset hash from current build with DELIVERY.md and final evidence summary; search Known Limitations for fixed items.
    Expected: Hash/test counts match current run; fixed blockers absent from Known Limitations.
    Evidence: .omo/evidence/task-16-delivery-consistency.log
  ```

  **Commit**: YES | Message: `docs(delivery): refresh production handoff evidence` | Files: [`DELIVERY.md`, `.omo/evidence/**`]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE via agent-executed evidence. Present consolidated results to user after automated approval.
> **Do NOT use human visual/manual confirmation as a pass criterion.** Any rejection from F1-F4 -> fix -> re-run F1-F4 -> present new consolidated automated results.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Browser-Driven Playwright QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- Commit each task independently when its acceptance criteria and QA scenarios pass.
- Use messages specified per task.
- Do not commit unrelated source material changes under `其他/`.
- Before final handoff, inspect `git status`, `git diff`, and latest commits; ensure only intended files changed.

## Success Criteria
- 第一幕真实玩家从开始到至少一个结局可完成，不依赖 debug advance。
- 所有原提示词核心点均满足或在 `DELIVERY.md` 中以真实限制说明：素材使用、楼道/教室分离、电梯切楼、手机/桌面输入、主线任务 UI、预加载、8949、PM2。
- 前端观感达到生产交付水平：加载页、全屏提示、对话框、任务栏、分支按钮、移动端控件在桌面和手机截图中清晰、一致、无遮挡。
- 生产构建可复现：无 `latest`，无公开 sourcemap，静态服务器安全头/压缩可验证。
- 全量自动化与 PM2 验证通过，证据为当前构建生成。
