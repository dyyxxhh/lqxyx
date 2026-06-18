# 影中咎生产级小游戏交付计划

## TL;DR
> **Summary**: 从当前素材/剧本/设计目录搭建 Phaser 3 + Vite + TypeScript 生产级 2D 叙事恐怖小游戏，完整交付第一幕，后续幕只预留结构并在落幕显示“下一幕 / 敬请期待”。
> **Deliverables**:
> - 可构建、可测试、可 pm2 托管在 8949 端口的前端游戏应用
> - 第一幕完整可玩剧情、地图、交互、结局、检查点存档
> - 桌面 F/Q 与移动端横屏摇杆 + 单交互键输入
> - 资源 manifest、剧本 manifest、缺失素材补充清单
> - Vitest + Playwright + pm2 部署 QA 证据
> **Effort**: XL
> **Parallel**: YES - 5 waves
> **Critical Path**: T1 → T2 → T3/T4/T5 → T8/T9/T10/T11 → T15 → T16 → Final Verification

## Context

### Original Request
用户要做名为“影中咎”的小游戏。当前目录下有素材、第一幕剧本、设计图；不要碰“其他”文件夹；最终要生产级、可交付、非半成品。要求端口 8949、pm2 托管、手机和电脑同时支持、手机横屏优先、进入询问全屏、摇杆八方向移动、右侧交互键替代 F/Q、启动加载预下载全部资源、楼道和房间分离渲染、指定门位和电梯楼层切换、主线任务顶部居中且为“无”时隐藏、桌椅缩放与局部碰撞/遮挡、地板平铺。

### Interview Summary
- 技术栈：Phaser 3 + Vite + TypeScript。
- 部署：Node/static server + pm2，端口 8949。
- 范围：第一幕完整可玩；第二幕、第三幕等只做结构预留；第一幕落幕显示“下一幕 / 敬请期待”。
- 地图：尽量接近 1:1 复刻 `设计/楼道.jpg`，同时以用户明确门位/楼层规则修正不精确处。
- 五楼左侧：仍显示 4 个班级门位，但这些班级都不是剧情班级，不可进入且无剧情交互；五楼剧情交互集中在通信控制房。
- 缺失素材：门允许按墙体对应位置绘制成木色横条，不再需要独立门图；通信设备允许程序化绘制为钢铁色设备/交互对象，不再需要独立设备图；办公室家具可复用教室桌椅；电话、手机柜、芹菜、尺子均已补充到 `最终素材/`；当前核心补素材 blocker 已清除，后续只在发现新增剧情需求时再列补充项。
- 角色 UI 文案：红边/蓝边只作为内部资源状态和立绘/动作选择，不体现在玩家可见的具体文字中；玩家看到的名字应显示“杨云”，不得显示“杨云蓝边”或“杨云红边”。
- 音频：第一版静音生产版，只预留音频模块。
- 存档：本地检查点存档/读档。
- 测试：Vitest + Playwright，核心逻辑 TDD，端到端覆盖桌面、移动端和 pm2 部署。

### Metis Review (gaps addressed)
- 收紧“第一幕完整可玩”边界：检查点 A-I、分支、计时器、结局必须通过 manifest 与测试覆盖。
- 强化缺失素材政策：已获用户确认的程序化/复用实现不算缺失；未确认的缺失项才是 blocker，不允许用矩形/通用图冒充生产资产。
- 地图 1:1 需要坐标/门位验收，不只靠视觉印象。
- 移动端需定义全屏拒绝、竖屏提示、摇杆多点触控和单交互键语义。
- F/Q、黑屏、倒计时、电梯切层期间输入锁定必须明确。
- 存档需 schema version、损坏恢复、checkpoint/floor/position/flags/timers/branch 状态。
- 禁止实现后续幕可玩内容、禁止引入音频、禁止多余系统如云存档/关卡编辑器/多语言。

## Work Objectives

### Core Objective
交付一个生产级浏览器 2D 叙事恐怖游戏：第一幕从开始到结局完整可玩，能在桌面与移动端横屏体验，能通过 `pm2` 在 `8949` 端口运行，并具备自动化测试与真实 QA 证据。

### Deliverables
- `package.json`、Vite/TS/Phaser 项目结构、Vitest/Playwright 配置。
- `src/` 游戏引擎模块：Boot/Preload/Game Scene、Input、UI、Transition、Script/Event、State/Save、Map/Collision、Audio stub。
- `public/assets` 或等价静态资源目录，只包含允许来源资源。
- `src/data/assets.*`、`src/data/script.*`、`src/data/maps.*`、`src/data/characters.*` 等 typed data manifest。
- 第一幕检查点 A-I、分支、计时器、结局、落幕“下一幕 / 敬请期待”。
- 资源缺失补充清单，阻塞生产美术替换项。
- `server/static-server.*`、`ecosystem.config.*`，pm2 8949 托管。
- `.omo/evidence/` 下每项任务的命令输出、截图、视频或日志证据。

### Definition of Done (verifiable conditions with commands)
- `npm run typecheck` 退出码 0。
- `npm run test:run` 退出码 0，覆盖剧情状态、存档、电梯时序、任务 UI、资源别名。
- `npm run build` 退出码 0，`dist/` 生成生产构建。
- `npm run e2e` 退出码 0，覆盖 desktop + mobile landscape + save/load + ending。
- `pm2 start ecosystem.config.cjs` 后 `pm2 status` 显示游戏进程 online。
- `curl -I http://127.0.0.1:8949/` 返回 HTTP 200。
- Playwright 证据显示：移动端全屏提示、横屏提示/布局、摇杆移动、单交互键、F/Q 桌面交互、电梯 0.5s fade out/in、第一幕落幕“下一幕 / 敬请期待”。

### Must Have
- 只使用 `第一幕剧本.txt`、`设计/`、`最终素材/` 作为生产来源。
- 不读取、不复制、不移动、不修改、不依赖 `其他/`。
- 第一幕检查点 A-I 的剧情覆盖与可玩路径。
- 五楼左侧 4 个班级门只作为非交互地图背景/门位存在，不得添加进入教室或剧情交互。
- 黑屏对白后 0.5s 等待。
- 主线任务为 `无` 时隐藏。
- 桌椅约为人物高度三分之一，并具备局部碰撞与遮挡。
- 地板平铺，不拉伸成单张大图。
- 秦浩睿/秦浩瑞资源别名映射，UI/剧情文本保持剧本人物名。
- 杨云红/蓝边状态只影响内部状态、资源选择和视觉边框，不出现在用户可见文字里。
- 移动端单交互键根据上下文替代 F/Q。
- localStorage 检查点存档 schema version 与损坏恢复。

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- 不实现第二幕/第三幕可玩内容。
- 不给五楼左侧 4 个普通班级门添加交互、进入逻辑或隐藏剧情。
- 不在 UI/对白/任务文字里显示“杨云红边”“杨云蓝边”等资源状态名。
- 不引入音频素材或占位音效。
- 不添加云存档、多语言、关卡编辑器、战斗系统、设置页等未要求功能。
- 不用占位矩形/通用图冒充缺失生产素材。
- 不把整张桌椅图设成碰撞体。
- 不硬编码散落剧情；必须通过 typed manifest/状态机驱动。
- 不用 `vite preview` 当生产服务。
- 不以 LSP/类型检查替代真实浏览器 QA。

## Verification Strategy
> All technical verification is agent-executed; final completion still requires explicit user okay after consolidated results.
- Test decision: TDD + Vitest for deterministic logic; Playwright for desktop/mobile/deploy E2E.
- QA policy: Every task has agent-executed scenarios.
- Evidence: `.omo/evidence/task-{N}-{slug}.{ext}`。

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per major wave where dependencies allow; Wave 1 is intentionally split into 1A/1B because T4/T5 depend on T1/T2.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1A: T1 infrastructure, T2 manifest/blocker audit, T3 script manifest.
Wave 1B: T4 asset pipeline and T5 map schema after T1/T2 complete.
Wave 2: T6 core Phaser scenes, T7 input system, T8 UI system, T9 state/save, T10 script/event engine.
Wave 3: T11 map/collision/room transitions, T12 character animation, T13 first-act gameplay events, T14 missing asset integration gates, T15 mobile polish.
Wave 4: T16 deployment/pm2, T17 automated E2E, T18 production QA hardening.
Wave 5: T19 first-act content completion pass, T20 final blocker/asset handoff and evidence consolidation.

### Dependency Matrix (full, all tasks)
- T1: no dependencies; blocks all code/test tasks.
- T2: no dependencies; blocks T4, T11, T14, T20.
- T3: no dependencies; blocks T10, T13, T19.
- T4: blocked by T1, T2; blocks T6, T12, T14.
- T5: blocked by T2; blocks T11, T13.
- T6: blocked by T1, T4; blocks T7, T8, T10, T11.
- T7: blocked by T6; blocks T13, T15, T17.
- T8: blocked by T6; blocks T10, T13, T15, T17.
- T9: blocked by T1, T3; blocks T10, T13, T17, T19.
- T10: blocked by T3, T6, T8, T9; blocks T13, T19.
- T11: blocked by T5, T6; blocks T13, T15, T17.
- T12: blocked by T4, T6; blocks T13.
- T13: blocked by T7, T8, T10, T11, T12; blocks T17, T19.
- T14: blocked by T2, T4; blocks T19, T20.
- T15: blocked by T7, T8, T11; blocks T17.
- T16: blocked by T1; blocks T17, T18.
- T17: blocked by T7, T8, T9, T11, T13, T15, T16.
- T18: blocked by T16, T17.
- T19: blocked by T3, T10, T13, T14, T17.
- T20: blocked by T2, T14, T18, T19.

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1A → 3 tasks → unspecified-high, deep.
- Wave 1B → 2 tasks → unspecified-high, deep.
- Wave 2 → 5 tasks → unspecified-high, visual-engineering.
- Wave 3 → 5 tasks → unspecified-high, visual-engineering, deep.
- Wave 4 → 3 tasks → unspecified-high, quick.
- Wave 5 → 2 tasks → deep, writing.

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.
> TDD rule: every production behavior change must write or update the failing Vitest/Playwright test first where applicable, capture RED evidence, implement the smallest change, then capture GREEN evidence. Exemptions are limited to documentation-only, evidence consolidation, or deployment-command documentation tasks and must be stated in task evidence.

- [x] 1. Initialize production Phaser/Vite app infrastructure

  **What to do**: Create the app foundation in the project root: `package.json`, TypeScript config, Vite config, Phaser dependency, Vitest config, Playwright config, `src/`, `public/`, `server/`, and npm scripts for `dev`, `typecheck`, `test:run`, `build`, `e2e`, `serve:prod`. Use Node version compatible with Vite/Vitest requirements. Do not import any game content yet except a placeholder boot screen.
  **Must NOT do**: Do not touch or scan `其他/`; do not implement gameplay; do not use `vite preview` as production server.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: multi-file project setup with production/test/deploy implications.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - Not a UI styling task yet.

  **Parallelization**: Can Parallel: YES | Wave 1A | Blocks: T4,T6,T7,T8,T9,T10,T16 | Blocked By: none

  **References**:
  - External: `https://vite.dev/guide/` - Vite TypeScript project and build baseline.
  - External: `https://docs.phaser.io/phaser/concepts/scenes` - Phaser scene lifecycle.
  - External: `https://vitest.dev/guide/` - Vitest setup.
  - External: `https://playwright.dev/docs/test-configuration` - Playwright config.

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` exits 0.
  - [ ] `npm run test:run` exits 0 with at least one scaffold sanity test.
  - [ ] `npm run build` exits 0 and creates `dist/`.
  - [ ] No created config/script references `其他/`.

  **QA Scenarios**:
  ```
  Scenario: App scaffold builds
    Tool: Bash
    Steps: npm install; npm run typecheck; npm run test:run; npm run build
    Expected: all commands exit 0; dist/index.html exists
    Evidence: .omo/evidence/task-1-infra-build.log

  Scenario: Forbidden folder not referenced
    Tool: Bash
    Steps: search generated app/config files for literal `其他`
    Expected: no matches in production app/config/test/deploy files
    Evidence: .omo/evidence/task-1-no-other-folder.log
  ```

  **Commit**: YES | Message: `chore(app): initialize phaser vite game scaffold` | Files: [package/config/src/server/test scaffold files]

- [x] 2. Build asset manifest and missing supplement blocker list

  **What to do**: Create a typed asset manifest from `最终素材/` only, mapping semantic keys to file paths, type, known dimensions, usage, and production status. Include known existing assets: `最终素材/地板.png`, `最终素材/桌椅.png`, `最终素材/血迹黑屏.jpg`, `最终素材/电话.png`, `最终素材/手机柜-正着.png`, `最终素材/手机柜-斜着.png`, `最终素材/芹菜（字面意思）.png`, `最终素材/尺子（字面意思）.png`, `最终素材/立绘/*`, `最终素材/角色动作/*`. Record approved non-missing implementations: doors are programmatic wood-colored horizontal bars embedded in wall positions; communication equipment is a programmatic steel-colored device/interactable; office desks/chairs may reuse the existing desk-chair asset at classroom scale; 但宇轩/秦浩睿 existing head-part sprites are the pickup/ground-object art for head-related interactions; celery black/white/large flash variants may be generated procedurally from `芹菜（字面意思）.png`; ruler flash/death may use `尺子（字面意思）.png`. Create a separate missing-supplement list only if newly discovered story/map requirements lack assets beyond the approved programmatic implementations and existing final assets. Missing items must be marked `BLOCKER_FOR_FINAL_ART`, not silently substituted.
  **Must NOT do**: Do not read/copy/derive from `其他/`; do not create placeholder production art; do not mark missing art complete.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: resource inventory affects all downstream tasks.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - No new art generation requested.

  **Parallelization**: Can Parallel: YES | Wave 1A | Blocks: T4,T11,T14,T20 | Blocked By: none

  **References**:
  - Asset: `最终素材/地板.png` - floor tile source.
  - Asset: `最终素材/桌椅.png` - classroom furniture source requiring scale/collision rules.
  - Asset: `最终素材/血迹黑屏.jpg` - blood/black transition source.
  - Asset: `最终素材/立绘/` - dialogue portraits.
  - Asset: `最终素材/角色动作/` - character sprites.

  **Acceptance Criteria**:
  - [ ] Manifest includes every file under `最终素材/` with semantic key and usage.
  - [ ] Manifest has Qin alias mapping note for `秦浩睿` vs `秦浩瑞`.
  - [ ] Missing supplement list includes all user/research-identified missing props/flash assets.
  - [ ] A test fails if a manifest path contains `/其他/`.

  **QA Scenarios**:
  ```
  Scenario: Manifest validates allowed source paths
    Tool: Bash
    Steps: npm run test:run -- asset-manifest
    Expected: tests pass and assert every asset path starts with final asset/design/script allowed roots, never `其他`
    Evidence: .omo/evidence/task-2-asset-manifest-test.log

  Scenario: Missing art remains explicit blocker
    Tool: Bash
    Steps: run asset manifest validation command
    Expected: blocker list is empty for currently known core props or lists only newly discovered missing requirements; doors are listed as approved programmatic wall/wood bars, communication equipment as approved programmatic steel-colored device, phone/phone cabinet/celery/ruler as available final assets, and head pickup art as existing character head-part sprites, not blockers
    Evidence: .omo/evidence/task-2-missing-assets.log
  ```

  **Commit**: YES | Message: `feat(assets): add manifest and supplement blockers` | Files: [src/data/assets*, tests]

- [x] 3. Convert first-act script into tested story manifest

  **What to do**: Transcribe `第一幕剧本.txt` into a typed story manifest with checkpoints A-I, dialogues, black-screen waits, branches, timers, task text, character-control switches, endings, and first-act curtain `下一幕 / 敬请期待`. Preserve dialogue meaning and names. Add tests that ensure all checkpoint IDs A-I exist and that no second/third act playable nodes are present.
  **Must NOT do**: Do not rewrite story meaning; do not add playable second-act content; do not omit branches/timers/endings from the script.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: requires faithful script extraction and consistency testing.
  - Skills: [] - No special skill required.
  - Omitted: [`writing`] - This is structured data + tests, not prose rewriting.

  **Parallelization**: Can Parallel: YES | Wave 1A | Blocks: T9,T10,T13,T19 | Blocked By: none

  **References**:
  - Script: `第一幕剧本.txt` - authoritative first-act content.
  - Draft finding: script has checkpoints A-I, branches A-1/A-2/B-1/B-2, 10s/120s/30s timers, endings.

  **Acceptance Criteria**:
  - [ ] Story manifest has checkpoint IDs A through I.
  - [ ] Tests verify black-screen dialogue waits are 500ms.
  - [ ] Tests verify first-act ending includes `下一幕` and `敬请期待`.
  - [ ] Tests verify no playable second/third act nodes exist.

  **QA Scenarios**:
  ```
  Scenario: Script coverage test
    Tool: Bash
    Steps: npm run test:run -- story-manifest
    Expected: all checkpoints A-I, branches, timers, endings are validated
    Evidence: .omo/evidence/task-3-story-manifest-test.log

  Scenario: Later acts are reserved only
    Tool: Bash
    Steps: npm run test:run -- act-boundary
    Expected: tests confirm later acts only appear as reserved metadata/curtain text, not playable event chains
    Evidence: .omo/evidence/task-3-act-boundary-test.log
  ```

  **Commit**: YES | Message: `feat(story): add first act manifest` | Files: [src/data/story*, tests]

- [x] 4. Implement preloader and static asset copy pipeline

  **What to do**: Copy allowed production assets from `最终素材/` into the app public/static asset directory using explicit file list from manifest. Implement `PreloadScene` to load all required first-act assets before play starts, show loading progress, and fail visibly if required assets are missing. Keep missing supplement items as blockers, not loaded fake art.
  **Must NOT do**: Do not glob copy `其他/`; do not lazy-load first-act required assets during play; do not hide failed loads.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: asset pipeline plus runtime loading behavior.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - Loading UI can be minimal here.

  **Parallelization**: Can Parallel: NO | Wave 1B | Blocks: T6,T12,T14 | Blocked By: T1,T2

  **References**:
  - External: `https://docs.phaser.io/phaser/concepts/loader` - Phaser loader behavior.
  - Asset manifest from T2.

  **Acceptance Criteria**:
  - [ ] `PreloadScene` queues all available required first-act assets.
  - [ ] Loading screen shows progress and completion.
  - [ ] Failed required asset load shows visible failure state and testable error.
  - [ ] Build output includes copied allowed assets and excludes `其他/`.

  **QA Scenarios**:
  ```
  Scenario: All available assets preload before play
    Tool: Playwright
    Steps: open game; wait for loading progress to reach 100%; assert start/new-game UI appears only after preload complete
    Expected: no network 404 for available assets; game start appears after preload completion
    Evidence: .omo/evidence/task-4-preload-success.png

  Scenario: Missing required asset failure is visible
    Tool: Bash + Playwright
    Steps: run test fixture with one required asset path invalid; open game
    Expected: visible preload error state names missing asset; game does not enter play scene
    Evidence: .omo/evidence/task-4-preload-failure.png
  ```

  **Commit**: YES | Message: `feat(assets): preload first act resources` | Files: [public assets, src/scenes/PreloadScene*, tests]

- [x] 5. Define near-1:1 map schema for corridor, rooms, doors, floors, collision, and spawn points

  **What to do**: Create typed map data for 4F/5F corridor and separate room scenes/areas. Encode user-specified left-side eight doors in order for 4F class/room routing; encode 5F left-side four class doors as visible non-interactive background doors with no entry/no story; encode right-side elevator, 4F office front/back, and 5F communication-control back door only. Map must support near-1:1 design layout, door coordinates, spawn points, walkable bounds, collision zones, occlusion zones, and room/floor identifiers. Treat `设计/楼道.jpg` as authoritative visual relation reference where precise dimensions are unavailable.
  **Must NOT do**: Do not render classrooms while corridor is active; do not keep 5F office front door; do not add interaction/entry/story to 5F left-side class doors; do not invent extra doors.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: map schema affects navigation, tests, QA, and content.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - This task defines data and collision schema; art rendering follows later.

  **Parallelization**: Can Parallel: YES | Wave 1B | Blocks: T11,T13 | Blocked By: T2

  **References**:
  - Design: `设计/楼道.jpg` - visual map relation.
  - User door order: left top-to-bottom GT2 front/back, GT1 front/back, 高一一 front/back, 高一二 front/back.
  - User floor rule: 4F office front/back; 5F only communication-control back door.
  - User clarification: 5F left-side four class doors are non-story, non-interactive doors only.

  **Acceptance Criteria**:
  - [ ] Map data has 4F and 5F corridor definitions.
  - [ ] Door ordering test matches user-provided sequence exactly.
  - [ ] 5F has no office front door and has communication-control back door.
  - [ ] 5F left-side four class doors are visible but have no interaction target and no room transition.
  - [ ] Corridor and rooms are separate render targets/room IDs.

  **QA Scenarios**:
  ```
  Scenario: Door schema matches requested ordering
    Tool: Bash
    Steps: npm run test:run -- map-schema
    Expected: test asserts left/right door labels/order, 4F/5F differences, and 5F left-side class doors as non-interactive exactly
    Evidence: .omo/evidence/task-5-map-schema-test.log

  Scenario: Corridor/room separation is encoded
    Tool: Bash
    Steps: npm run test:run -- room-render-boundaries
    Expected: tests confirm corridor render set excludes classroom/office room entities and vice versa
    Evidence: .omo/evidence/task-5-room-separation-test.log
  ```

  **Commit**: YES | Message: `feat(map): define school floor schema` | Files: [src/data/maps*, tests]

- [x] 6. Implement Phaser Boot/Game scene runtime shell

  **What to do**: Implement `BootScene`, `PreloadScene`, and `GameScene` wiring. Configure Phaser scale mode for responsive fit/center, pixel-art-friendly rendering, deterministic update loop boundaries, and scene transitions from boot to preload to game. Provide a visible minimal start/new game flow after preload.
  **Must NOT do**: Do not implement full first-act events yet; do not add React; do not add unrelated menus/settings.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: core runtime infrastructure for all later systems.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - Visual polish is not primary.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T7,T8,T10,T11,T12 | Blocked By: T1,T4

  **References**:
  - External: `https://docs.phaser.io/phaser/concepts/scenes` - scene lifecycle.
  - External: `https://docs.phaser.io/phaser/concepts/scale-manager` - FIT/CENTER and orientation.

  **Acceptance Criteria**:
  - [ ] Game boots from Vite build in browser.
  - [ ] Boot → Preload → Game scene order is deterministic.
  - [ ] Canvas scales correctly in desktop and mobile landscape viewport.
  - [ ] No production runtime references `其他/`.

  **QA Scenarios**:
  ```
  Scenario: Scene startup order
    Tool: Playwright
    Steps: open game; collect exposed scene state/debug test id after preload
    Expected: BootScene then PreloadScene then GameScene, exactly once each
    Evidence: .omo/evidence/task-6-scene-order.log

  Scenario: Mobile landscape canvas fit
    Tool: Playwright
    Steps: open with mobile landscape viewport; capture screenshot
    Expected: canvas is centered/fitted, no controls clipped outside viewport
    Evidence: .omo/evidence/task-6-mobile-landscape.png
  ```

  **Commit**: YES | Message: `feat(runtime): add phaser scene shell` | Files: [src/game*, src/scenes*, tests]

- [x] 7. Implement desktop and mobile input manager

  **What to do**: Implement `InputManager` with keyboard movement, F/Q context actions, mobile fullscreen prompt, landscape-first orientation prompt, eight-direction joystick, and one mobile interact button that resolves to current context action replacing F/Q. Input must lock during dialogue, black screens, elevator fade, scripted movement, and endings unless an event explicitly allows advance.
  **Must NOT do**: Do not add configurable keybinds; do not add gamepad support; do not create two separate mobile F/Q buttons.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: mobile control layout and touch behavior need UI/UX attention.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - No visual invention beyond controls.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T13,T15,T17 | Blocked By: T6

  **References**:
  - External: `https://docs.phaser.io/phaser/concepts/input` - Phaser pointer/input events.
  - External: `https://docs.phaser.io/phaser/concepts/scale-manager` - fullscreen and orientation APIs.
  - User requirement: mobile right-side single interaction key substitutes F/Q.

  **Acceptance Criteria**:
  - [ ] Desktop supports movement and F/Q context actions.
  - [ ] Mobile shows fullscreen prompt on entry and remains playable if user refuses.
  - [ ] Mobile joystick supports 8 directions.
  - [ ] Mobile single interact button triggers same context resolver as F/Q.
  - [ ] Input lock tests cover dialogue/black/elevator/scripted states.

  **QA Scenarios**:
  ```
  Scenario: Desktop F/Q and movement
    Tool: Playwright
    Steps: open desktop viewport; press movement key; press F near interactable; press Q where script expects Q
    Expected: player moves; context actions fire; no duplicate triggers
    Evidence: .omo/evidence/task-7-desktop-input.webm

  Scenario: Mobile joystick and single interact
    Tool: Playwright
    Steps: open mobile landscape; accept or refuse fullscreen prompt; drag joystick diagonally; tap interact button near interactable
    Expected: 8-direction movement vector produced; interact advances correct context action
    Evidence: .omo/evidence/task-7-mobile-input.webm
  ```

  **Commit**: YES | Message: `feat(input): support desktop and mobile controls` | Files: [src/input*, src/ui/mobile*, tests]

- [x] 8. Implement game UI manager for task, dialogue, role prompt, timers, loading, and curtain

  **What to do**: Build UI overlays matching design needs: top-center main task hidden when task is `无`, dialogue box with portrait/name, “你现在是” role prompt inspired by `设计/“你现在是”的UI设计.jpg`, countdown timers, loading progress, fullscreen/orientation prompts, and final first-act curtain with `下一幕` + `敬请期待`. For 杨云 red/blue internal states, render the appropriate visual asset/edge but show user-facing name text as `杨云` only.
  **Must NOT do**: Do not overbuild settings/multilanguage menus; do not show main task when value is `无`; do not display red/blue border state names in user-facing text.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: UI layout across desktop/mobile matters.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - Use existing design reference; no new art generation.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T10,T13,T15,T17 | Blocked By: T6

  **References**:
  - Design: `设计/“你现在是”的UI设计.jpg` - role prompt reference.
  - Asset: `最终素材/立绘/` - dialogue portraits.
  - User requirement: main task top-center hidden when `无`.

  **Acceptance Criteria**:
  - [ ] Task UI hidden for `无`, visible for non-empty text.
  - [ ] Dialogue UI renders correct portrait/name/text.
  - [ ] Role prompt supports 杨云 internal red/blue visual states and 董继豪, while displaying user-facing text `杨云` instead of `杨云红边`/`杨云蓝边`.
  - [ ] First-act curtain renders `下一幕` and `敬请期待`.

  **QA Scenarios**:
  ```
  Scenario: Task visibility rule
    Tool: Playwright
    Steps: load test state with task `无`; then set task to a non-empty objective
    Expected: task element absent/hidden for `无`; visible top-center for non-empty objective
    Evidence: .omo/evidence/task-8-task-ui.png

  Scenario: Curtain display
    Tool: Playwright
    Steps: trigger first-act ending test route/state
    Expected: screen displays `下一幕` and `敬请期待`, no playable second-act scene starts
    Evidence: .omo/evidence/task-8-curtain.png
  ```

  **Commit**: YES | Message: `feat(ui): add narrative overlays` | Files: [src/ui*, src/scenes*, tests]

- [x] 9. Implement checkpoint save/load state manager

  **What to do**: Implement localStorage-backed `StateManager` with schema version, safe defaults, corruption handling, checkpoint id, act id, floor, room, position, current controllable character, task, story flags, branch choices, timers, inventory/pickups if required, and triggered-event set. Save on checkpoint entry and scripted save points; load from main/start flow.
  **Must NOT do**: Do not add cloud save; do not add multiple save slots unless required by first-act script.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: state correctness affects production reliability.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - UI for save slots not required.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T10,T13,T17,T19 | Blocked By: T1,T3

  **References**:
  - Script: `第一幕剧本.txt` - checkpoints and branch/timer needs.
  - Metis guardrail: schema version and corrupted localStorage recovery.

  **Acceptance Criteria**:
  - [ ] Save/load round-trip preserves checkpoint/floor/room/position/flags/task/timers.
  - [ ] Schema version mismatch returns safe default or migration result.
  - [ ] Corrupt localStorage does not crash game.
  - [ ] Continue button appears only when valid save exists.

  **QA Scenarios**:
  ```
  Scenario: Checkpoint restore
    Tool: Bash
    Steps: npm run test:run -- save-state
    Expected: round-trip restores exact checkpoint/floor/room/position/task/flags object
    Evidence: .omo/evidence/task-9-save-state-test.log

  Scenario: Corrupt save recovery
    Tool: Playwright
    Steps: set invalid localStorage save; reload game
    Expected: game does not crash; continue disabled or reset message shown; new game still works
    Evidence: .omo/evidence/task-9-corrupt-save.png
  ```

  **Commit**: YES | Message: `feat(save): add checkpoint persistence` | Files: [src/state*, tests]

- [x] 10. Implement script/event engine with deterministic transitions

  **What to do**: Implement a typed event engine that interprets story manifest commands: dialogue, wait, black screen, fade, setTask, setFlag, switchCharacter, moveLock, timer start/stop, branch choice, checkpoint save, ending curtain, room/floor transition, and failure/ending triggers. Add fake-timer tests for 500ms black-screen wait and elevator timing sequence.
  **Must NOT do**: Do not hardcode first-act event logic into scene update loops; do not allow repeated F/Q presses to double-trigger events.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: state machine/event timing complexity.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - Visual rendering is handled by UI/transition modules.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: T13,T19 | Blocked By: T3,T6,T8,T9

  **References**:
  - Script manifest from T3.
  - External: `https://docs.phaser.io/phaser/concepts/scenes` - scene update and timers context.

  **Acceptance Criteria**:
  - [ ] Engine executes event command list deterministically.
  - [ ] Black-screen dialogue wait is 500ms.
  - [ ] Elevator sequence is fade out 500ms → switch floor → fade in 500ms.
  - [ ] Input lock prevents duplicate triggers during scripted states.

  **QA Scenarios**:
  ```
  Scenario: Timed event sequencing
    Tool: Bash
    Steps: npm run test:run -- event-engine
    Expected: fake timer tests prove black-screen and elevator timings exactly in order
    Evidence: .omo/evidence/task-10-event-engine-test.log

  Scenario: Repeated interact cannot double fire
    Tool: Playwright
    Steps: trigger dialogue/interact; spam F/Q or mobile interact during locked state
    Expected: event advances once per allowed state; no duplicate save/dialogue/transition
    Evidence: .omo/evidence/task-10-input-lock.webm
  ```

  **Commit**: YES | Message: `feat(story): add deterministic event engine` | Files: [src/story*, tests]

- [x] 11. Implement map rendering, collision, occlusion, doors, and elevator transitions

  **What to do**: Render corridor and room scenes separately from map schema. Tile `地板.png`; render scaled desk/chair assets at about one-third character height where classrooms need furniture; define partial collision boxes and separate occlusion regions. Implement doors and room transitions from schema. Implement elevator interaction with 0.5s fade out, floor switch, 0.5s fade in. Ensure 4F/5F right-side door differences.
  **Must NOT do**: Do not render classrooms while corridor active; do not use full `桌椅.png` rectangle collision; do not add 5F office front door.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: map visuals, collision, occlusion, and camera require spatial tuning.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - No new artwork.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T13,T15,T17 | Blocked By: T5,T6

  **References**:
  - Design: `设计/楼道.jpg` - map layout reference.
  - Asset: `最终素材/地板.png` - tiled floor.
  - Asset: `最终素材/桌椅.png` - furniture.
  - User requirement: corridor/classroom separated rendering and door/floor rules.

  **Acceptance Criteria**:
  - [ ] Door labels/order and transitions match map schema tests.
  - [ ] Elevator transition timing matches 500ms fade out/in.
  - [ ] Furniture has partial collision and occlusion.
  - [ ] Corridor and room rendering are mutually exclusive.

  **QA Scenarios**:
  ```
  Scenario: Door and elevator navigation
    Tool: Playwright
    Steps: move to elevator; press F/interact; verify fade; verify floor indicator/door set changes; enter a classroom door
    Expected: 4F↔5F switch follows timing; 5F has only communication-control back door on that side; 5F left class doors do not interact; room renders separately
    Evidence: .omo/evidence/task-11-navigation.webm

  Scenario: Furniture collision and occlusion
    Tool: Playwright
    Steps: move character around/partly behind desk-chair asset and into collision area
    Expected: character can pass behind allowed visual area but cannot cross configured collision zone
    Evidence: .omo/evidence/task-11-furniture-collision.webm
  ```

  **Commit**: YES | Message: `feat(map): render school rooms and transitions` | Files: [src/map*, src/scenes*, tests]

- [x] 12. Implement character resource mapping and movement animations

  **What to do**: Register character sprites/portraits. Implement walking animations for 杨云 internal blue-border state, 杨云 internal red-border state, and 董继豪 using up/down/left/right assets. Implement diagonal movement rule: northeast/southeast and northwest/southwest use up/down animation as appropriate while movement vector is diagonal. Register but do not make freely walkable the story/dead/body-part sprites for 但宇轩 and 秦浩睿/秦浩瑞. Add alias mapping so UI/story display uses `秦浩睿` while asset path may contain `秦浩瑞`. Add display-name mapping so both 杨云 red/blue resource states display as `杨云` in user-facing text.
  **Must NOT do**: Do not invent four-direction walking for 但宇轩/秦浩睿; do not rename source assets casually.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: sprite animation and movement feel.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - No asset creation.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T13 | Blocked By: T4,T6

  **References**:
  - Asset: `最终素材/角色动作/杨云-蓝边-*` - Yang Yun blue walking.
  - Asset: `最终素材/角色动作/杨云-红边-*` - Yang Yun red walking.
  - Asset: `最终素材/角色动作/董继豪-*` - Dong Jihao walking.
  - Asset: `最终素材/角色动作/但宇轩-*`, `最终素材/角色动作/秦浩瑞-*` - story/dead/body-part sprites.

  **Acceptance Criteria**:
  - [ ] Three mobile characters have idle/walk animations in four cardinal directions.
  - [ ] Diagonal movement uses vertical animation while moving diagonally.
  - [ ] 但宇轩/秦浩睿 are not configured as free-walking playable/NPC movement entities.
  - [ ] Qin alias tests pass.
  - [ ] 杨云 red/blue internal states both display user-facing name `杨云`.

  **QA Scenarios**:
  ```
  Scenario: Character animation mapping
    Tool: Bash
    Steps: npm run test:run -- character-assets
    Expected: animations and aliases validate; non-walking characters are flagged story-only; Yang Yun red/blue internal states display as `杨云`
    Evidence: .omo/evidence/task-12-character-assets-test.log

  Scenario: Diagonal movement uses vertical animation
    Tool: Playwright
    Steps: move northeast/southeast with keyboard or joystick; capture animation state
    Expected: movement vector diagonal; displayed animation is up/down per rule
    Evidence: .omo/evidence/task-12-diagonal-animation.webm
  ```

  **Commit**: YES | Message: `feat(characters): map sprites and animations` | Files: [src/characters*, tests]

- [x] 13. Implement first-act playable events, interactions, timers, branches, failures, and endings

  **What to do**: Wire the first-act story manifest into the playable world. Implement checkpoint A-I progression, GT1/GT2/office/communication interactions, F/Q contexts, 10s/120s/30s timers, 杨云复现/追逐/failure behavior as specified by script manifest, character control switches, task text updates, black screens, and all first-act endings. Ensure ending curtain shows `下一幕` + `敬请期待` and no later act gameplay starts.
  **Must NOT do**: Do not rewrite script meaning; do not skip branches; do not implement second-act content.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: this is the core gameplay/narrative integration.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - No new creative content.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T17,T19 | Blocked By: T7,T8,T10,T11,T12

  **References**:
  - Script: `第一幕剧本.txt` - authoritative event/dialogue/ending source.
  - Story manifest from T3.
  - Event engine from T10.
  - Map schema/rendering from T5/T11.

  **Acceptance Criteria**:
  - [ ] Checkpoints A-I are reachable or intentionally branch-reachable according to manifest.
  - [ ] Timers and failure states match manifest.
  - [ ] All first-act endings are reachable through test paths.
  - [ ] Ending curtain appears and blocks later-act gameplay.

  **QA Scenarios**:
  ```
  Scenario: Main first-act route completes
    Tool: Playwright
    Steps: start new game; follow scripted main path through checkpoints; reach first-act ending
    Expected: checkpoint/task/dialogue progression matches manifest; ending shows `下一幕` and `敬请期待`
    Evidence: .omo/evidence/task-13-main-route.webm

  Scenario: Timed failure/branch route
    Tool: Playwright
    Steps: trigger a timed branch/failure condition from manifest, such as countdown expiry or chase visibility rule
    Expected: correct branch/failure/ending triggers with no softlock
    Evidence: .omo/evidence/task-13-timed-branch.webm
  ```

  **Commit**: YES | Message: `feat(story): make first act playable` | Files: [src/story*, src/scenes*, src/data*, tests]

- [x] 14. Integrate missing-asset blocker gates and supplement handoff

  **What to do**: Add build/test gates that report missing production art supplement items from T2/T14 and prevent them from being marked complete as final art. For scenes that require missing assets, either block final visual acceptance until supplied or render only approved non-production debug labels in development mode with clear `NOT_PRODUCTION_ART` marking. Production screenshots/evidence must not present debug labels as final visuals; if required first-act art is missing, final handoff must mark visual production completion blocked until supplied. Produce a handoff list with exact desired dimensions/usages for each missing asset.
  **Must NOT do**: Do not ship debug placeholders as production art; do not conceal missing assets in screenshots/evidence.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: supplement handoff must be precise and user-facing, plus validation code.
  - Skills: [] - No special skill required.
  - Omitted: [`artistry`] - Does not create art.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: T19,T20 | Blocked By: T2,T4

  **References**:
  - Missing list from T2.
  - User decision: 缺失素材要求补素材.

  **Acceptance Criteria**:
  - [ ] Missing supplement list has exact item names, usage, scene, suggested size, blocker reason.
  - [ ] Validation test distinguishes available final assets from missing supplement blockers.
  - [ ] Production build cannot label missing items as final complete.
  - [ ] Development debug labels, if any, are visually marked not production art.

  **QA Scenarios**:
  ```
  Scenario: Missing supplement report
    Tool: Bash
    Steps: run asset validation/report command
    Expected: report lists only newly discovered missing items if any; report states doors are programmatic wall wood bars, communication equipment is a programmatic steel-colored interactable, office desks reuse existing desk-chair asset, and phone/phone cabinet/celery/ruler assets are available in `最终素材/`
    Evidence: .omo/evidence/task-14-supplement-report.md

  Scenario: Production art gate
    Tool: Bash
    Steps: npm run test:run -- production-art-gate
    Expected: test proves missing supplement items cannot be marked final without supplied asset paths
    Evidence: .omo/evidence/task-14-art-gate-test.log
  ```

  **Commit**: YES | Message: `feat(assets): gate missing production art` | Files: [src/data/assets*, scripts/report*, tests]

- [x] 15. Harden mobile landscape/fullscreen/touch layout

  **What to do**: Polish mobile behavior: show fullscreen prompt on entry; if user refuses or fullscreen fails, keep game playable and record state; show rotate-to-landscape prompt in portrait; handle viewport resize/safe area; ensure joystick and interact button support simultaneous touches; maintain readable dialogue/task UI in landscape.
  **Must NOT do**: Do not force unplayable fullscreen-only behavior; do not add left/right hand settings unless required.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` - Reason: mobile UX and responsive layout.
  - Skills: [] - No special skill required.
  - Omitted: [`unspecified-high`] - UI/touch expertise is more relevant.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T17 | Blocked By: T7,T8,T11

  **References**:
  - External: `https://playwright.dev/docs/emulation` - mobile emulation.
  - External: `https://docs.phaser.io/phaser/concepts/scale-manager` - fullscreen/orientation.
  - User requirement: mobile landscape preferred, fullscreen prompt, joystick, right interact key.

  **Acceptance Criteria**:
  - [ ] Fullscreen prompt appears on mobile entry.
  - [ ] Refusing fullscreen does not block play.
  - [ ] Portrait shows rotate prompt or safe degraded state.
  - [ ] Landscape joystick/interact controls do not overlap critical UI.

  **QA Scenarios**:
  ```
  Scenario: Fullscreen refusal remains playable
    Tool: Playwright
    Steps: open mobile emulation; dismiss fullscreen prompt; start game; move/interact
    Expected: game remains playable; prompt dismissal state is respected
    Evidence: .omo/evidence/task-15-fullscreen-refusal.webm

  Scenario: Portrait to landscape resize
    Tool: Playwright
    Steps: open portrait viewport; verify rotate prompt; switch to landscape; move with joystick and interact
    Expected: rotate prompt clears; controls/UI reposition correctly
    Evidence: .omo/evidence/task-15-orientation.webm
  ```

  **Commit**: YES | Message: `feat(mobile): harden landscape controls` | Files: [src/input*, src/ui*, tests/e2e]

- [x] 16. Implement production static server and pm2 8949 deployment

  **What to do**: Add a minimal Node static server serving `dist/` on port 8949 with SPA fallback, correct static caching basics, and a health endpoint if implemented. Add `ecosystem.config.cjs` for pm2. Add scripts/documentation for build and pm2 start/status/restart. Verify production build, not dev server.
  **Must NOT do**: Do not use Vite preview for production; do not introduce Docker/Nginx unless user later asks.

  **Recommended Agent Profile**:
  - Category: `quick` - Reason: focused deployment files once infra exists.
  - Skills: [] - No special skill required.
  - Omitted: [`deep`] - Not an architecture redesign.

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: T17,T18 | Blocked By: T1

  **References**:
  - External: `https://pm2.keymetrics.io/docs/usage/application-declaration/` - ecosystem config.
  - External: `https://pm2.keymetrics.io/docs/usage/expose/` - PM2 static serving references.
  - User requirement: port 8949 and pm2.

  **Acceptance Criteria**:
  - [ ] `npm run build` creates `dist/`.
  - [ ] Static server serves `dist/` at `http://127.0.0.1:8949/`.
  - [ ] pm2 ecosystem starts process online.
  - [ ] SPA fallback returns game HTML for refresh path if any route path is used.

  **QA Scenarios**:
  ```
  Scenario: Production server responds
    Tool: Bash
    Steps: npm run build; node server/static-server.js --port 8949 --dir dist; curl -I http://127.0.0.1:8949/
    Expected: HTTP 200 and HTML includes built asset script
    Evidence: .omo/evidence/task-16-static-server.log

  Scenario: PM2 process online
    Tool: Bash
    Steps: pm2 start ecosystem.config.cjs; pm2 status; curl -I http://127.0.0.1:8949/
    Expected: pm2 shows online process; curl returns HTTP 200
    Evidence: .omo/evidence/task-16-pm2.log
  ```

  **Commit**: YES | Message: `chore(deploy): add pm2 production server` | Files: [server/static-server*, ecosystem.config*, package scripts]

- [x] 17. Build Playwright E2E coverage for desktop, mobile, save/load, elevator, ending, and deploy

  **What to do**: Add Playwright tests and fixtures for desktop gameplay, mobile landscape controls, fullscreen prompt refusal, save/load checkpoint restore, elevator fade/floor switch, task visibility, first-act ending curtain, and deployed production URL on 8949. Capture screenshots/videos/traces into `.omo/evidence` or Playwright artifacts copied there.
  **Must NOT do**: Do not only test page load; do not skip mobile interactions; do not rely on manual observation.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: multi-surface test automation.
  - Skills: [] - No special skill required.
  - Omitted: [`quick`] - Too many scenarios.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T18,T19 | Blocked By: T7,T8,T9,T11,T13,T15,T16

  **References**:
  - External: `https://playwright.dev/docs/emulation` - mobile projects.
  - External: `https://playwright.dev/docs/test-webserver` - web server setup.
  - Acceptance scenarios from tasks T7-T16.

  **Acceptance Criteria**:
  - [ ] `npm run e2e` passes desktop and mobile projects.
  - [ ] Tests cover save/load checkpoint restore.
  - [ ] Tests cover elevator transition order and visible floor change.
  - [ ] Tests cover first-act ending curtain.
  - [ ] Deployed 8949 URL is tested, not only Vite dev server.

  **QA Scenarios**:
  ```
  Scenario: Full E2E suite
    Tool: Bash
    Steps: npm run e2e
    Expected: all configured Playwright projects pass; artifacts captured
    Evidence: .omo/evidence/task-17-e2e.log

  Scenario: Production URL E2E
    Tool: Bash + Playwright
    Steps: build; start pm2; run Playwright project against http://127.0.0.1:8949/
    Expected: deployed game passes smoke, controls, save/load, ending checks
    Evidence: .omo/evidence/task-17-prod-e2e.log
  ```

  **Commit**: YES | Message: `test(e2e): cover gameplay and deployment` | Files: [playwright config/tests/artifact scripts]

- [x] 18. Harden production QA: asset 404s, performance sanity, resize, and failure recovery

  **What to do**: Add QA checks for network 404s, preload progress, large asset loading sanity, localStorage corruption, viewport resize, portrait/landscape switch, repeated input spam during locked states, and static server refresh. Capture evidence and fix issues found.
  **Must NOT do**: Do not claim production ready with only unit tests; do not ignore flaky mobile/resize issues.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: cross-cutting hardening.
  - Skills: [] - No special skill required.
  - Omitted: [`visual-engineering`] - This includes more than UI.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: T20 | Blocked By: T16,T17

  **References**:
  - Metis edge cases: preload failure, resize, localStorage corruption, repeated F/Q, input lock.
  - Playwright artifact system from T17.

  **Acceptance Criteria**:
  - [ ] No available final asset 404s in E2E runs.
  - [ ] localStorage corruption recovery E2E passes.
  - [ ] resize/orientation E2E passes.
  - [ ] repeated input spam during locks does not double-trigger events.

  **QA Scenarios**:
  ```
  Scenario: Network and asset sanity
    Tool: Playwright
    Steps: run production smoke with network failure listener
    Expected: no 404 for available assets; preload reaches complete or explicit blocker state only for missing supplements
    Evidence: .omo/evidence/task-18-network-sanity.log

  Scenario: Failure recovery suite
    Tool: Playwright
    Steps: test corrupt localStorage, resize, repeated interact spam, route refresh
    Expected: no crashes, no duplicate events, route refresh returns app
    Evidence: .omo/evidence/task-18-recovery.webm
  ```

  **Commit**: YES | Message: `test(qa): harden production surfaces` | Files: [tests/e2e, fixes]

- [x] 19. Run first-act content completion pass against script and manifest

  **What to do**: Audit the playable game against `第一幕剧本.txt` and the story manifest. Verify each checkpoint A-I, branch, required dialogue, timer, character switch, task UI update, black-screen wait, ending, and “下一幕 / 敬请期待” curtain. Fix omissions. Produce a coverage report showing manifest nodes and their test/evidence mapping.
  **Must NOT do**: Do not add new story content; do not modify dialogue meaning; do not mark missing art blockers as complete.

  **Recommended Agent Profile**:
  - Category: `deep` - Reason: comprehensive narrative consistency audit.
  - Skills: [] - No special skill required.
  - Omitted: [`writing`] - Not rewriting story.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: T20 | Blocked By: T3,T10,T13,T14,T17

  **References**:
  - Script: `第一幕剧本.txt`.
  - Story manifest from T3.
  - Playwright E2E from T17.

  **Acceptance Criteria**:
  - [ ] Coverage report maps all first-act manifest nodes to tests/evidence.
  - [ ] No checkpoint A-I omission.
  - [ ] All endings/branches are covered or explicitly marked unreachable by design with reason from script.
  - [ ] No second-act playable content exists.

  **QA Scenarios**:
  ```
  Scenario: Manifest coverage report
    Tool: Bash
    Steps: run story coverage/report command
    Expected: report lists every checkpoint/branch/timer/ending with associated test or evidence path
    Evidence: .omo/evidence/task-19-story-coverage.md

  Scenario: First act playable completion
    Tool: Playwright
    Steps: execute representative route set covering main route and branch endings
    Expected: all selected routes reach valid first-act outcomes without softlock
    Evidence: .omo/evidence/task-19-first-act-completion.log
  ```

  **Commit**: YES | Message: `test(story): verify first act coverage` | Files: [coverage reports, tests, fixes]

- [x] 20. Consolidate production handoff, supplement list, and evidence package

  **What to do**: Prepare final delivery notes inside allowed project docs/files created by implementation agent: how to install, build, test, run with pm2 on 8949, where evidence lives, known missing supplement assets, and exact replacement procedure for future supplied art/audio. Confirm no `其他/` dependencies in production files. Ensure all QA evidence paths exist.
  **Must NOT do**: Do not claim full final-art completion while supplement blockers remain; do not delete evidence; do not modify `其他/`.

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: delivery/handoff clarity.
  - Skills: [] - No special skill required.
  - Omitted: [`quick`] - Needs careful consolidation.

  **Parallelization**: Can Parallel: NO | Wave 5 | Blocks: Final Verification | Blocked By: T2,T14,T18,T19

  **References**:
  - Evidence: `.omo/evidence/` generated by all tasks.
  - Supplement report from T14.
  - Deployment files from T16.

  **Acceptance Criteria**:
  - [ ] Delivery instructions include install/build/test/pm2 commands.
  - [ ] Supplement blocker list is explicit and not hidden.
  - [ ] Evidence package references all required task evidence.
  - [ ] Production dependency scan shows no `其他/` path.

  **QA Scenarios**:
  ```
  Scenario: Handoff commands work
    Tool: Bash
    Steps: follow delivery commands: npm install; npm run build; npm run test:run; npm run e2e; pm2 start ecosystem.config.cjs; curl http://127.0.0.1:8949/
    Expected: commands succeed or documented supplement blockers are explicitly reported
    Evidence: .omo/evidence/task-20-handoff-commands.log

  Scenario: Evidence and forbidden dependency audit
    Tool: Bash
    Steps: verify all referenced .omo/evidence files exist; scan production files for `/其他/` and `其他/`
    Expected: all evidence exists; no forbidden production dependency references
    Evidence: .omo/evidence/task-20-final-audit.log
  ```

  **Commit**: YES | Message: `docs(delivery): add production handoff` | Files: [delivery docs/reports/evidence index]

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright)
- [x] F4. Scope Fidelity Check — deep

### Final Verification Acceptance Contracts
- **F1 Plan Compliance Audit — oracle**: Return `APPROVE` only if every key requirement in this plan has corresponding implementation evidence path; otherwise return `REJECT WITH FIXES` listing missing requirement → missing/failing evidence.
- **F2 Code Quality Review — unspecified-high**: Return `APPROVE` only if code has no scattered hardcoded story logic, no fake production art, no forbidden `其他/` dependencies, no obvious resource leaks, and no untested production behavior; otherwise return `REJECT WITH FIXES` with file paths and exact fixes.
- **F3 Real Manual QA — unspecified-high (+ playwright)**: Return `APPROVE` only after running the deployed pm2 URL on `http://127.0.0.1:8949/` through desktop and mobile-landscape flows with screenshots/video/log evidence; otherwise return `REJECT WITH FIXES` with failing scenario and artifact path.
- **F4 Scope Fidelity Check — deep**: Return `APPROVE` only if first act is complete, later acts are reserved only, missing assets remain explicit blockers, no audio/extra systems were introduced, and no `其他/` usage exists; otherwise return `REJECT WITH FIXES`.
- Any `REJECT WITH FIXES` blocks presentation to the user until fixed and re-run. Only four `APPROVE` results may be consolidated for user okay.

## Commit Strategy
- Commit after each task with the specified message.
- Do not commit changes touching `其他/`.
- Each commit must include tests/evidence for that task.
- If supplement blockers remain, commit them as explicit reports, not as completed final art.

## Success Criteria
- First act is complete, playable, and test-covered from start through ending curtain.
- Desktop and mobile landscape controls are feature-equivalent.
- pm2 serves production build on port 8949.
- Missing assets are explicit supplement blockers with exact requirements.
- No production code/data/deploy path touches or depends on `其他/`.
- All final verification agents approve, and user gives explicit okay after consolidated results.
