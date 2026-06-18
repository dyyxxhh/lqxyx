## 2026-06-07 Task: start-work
Plan started for `ying-zhong-jiu-production-gap-fix`.
Scope: first-act production delivery only; no `其他/`; no Acts 2/3 content.

## 2026-06-07 Task 11: 静态服务器安全头和压缩
- `server/static-server.js` 继续使用 Node built-in modules；新增安全头统一注入静态响应和错误响应，避免引入 Express/serve 中间件依赖。
- CSP 采用同源脚本/样式/连接，禁止 object/frame embedding；图片和媒体允许 `data:`/`blob:` 以兼容 Phaser/Vite 资源预加载和运行时纹理/媒体使用。
- HTML 与 SPA fallback 的 `dist/index.html` 使用 `no-cache, must-revalidate`；其他 dist 文件保持 `public, max-age=31536000, immutable`，保留 Vite hashed asset 的长期缓存假设。
- `.html/.css/.js` 根据 `Accept-Encoding` 使用 zlib gzip/brotli 流式压缩，优先 brotli；测试通过真实本地 server 请求覆盖安全头、缓存和压缩行为。

## 2026-06-07 Task 10: 生产构建可复现性
- Vite production build no longer emits public sourcemaps; `npm run build` is expected to leave `dist/assets/` without `.map` files.
- Root dependency specs were pinned to the versions already resolved in `package-lock.json` (`phaser@4.1.0`, `vite@8.0.16`, `typescript@6.0.3`, `vitest@4.1.8`, `jsdom@29.1.1`, `serve@14.2.6`, `@playwright/test@1.60.0`) rather than upgrading.
- The `preloadFailAsset` query hook remains available only in non-production builds through a pure env gate, so public production URLs cannot force preload failure.
- `.gitignore` was introduced for generated/private outputs while leaving `.omo/plans/` unignored.

## 2026-06-07 Task 12: PM2 生产托管策略
- `ecosystem.config.cjs` 保持 fork/single app：`ying-zhong-jiu-static`、`./server/static-server.js`、`HOST: '0.0.0.0'`、`PORT: '8949'` 未变；新增 `autorestart: true`、`max_memory_restart: '512M'`、`max_restarts: 5`、`restart_delay: 5000`、`min_uptime: '10s'`、`kill_timeout: 5000`。
- `src/tests/deployment-static-server.test.ts` 新增解析 `ecosystem.config.cjs` 的 PM2 policy 断言；RED 证据：新增测试先因缺少上述 policy 字段失败，随后配置补齐后目标文件 9/9 通过。
- 配置级验证通过：Node `require('./ecosystem.config.cjs')` 输出 app/name/script/PORT 与全部策略字段；LSP 对 `ecosystem.config.cjs` 和部署测试均无 diagnostics。
- PM2 已安装；执行 `pm2 start ecosystem.config.cjs` 只重启同名 `ying-zhong-jiu-static`（未触碰其他应用），`pm2 show` 显示 online/fork_mode，`pm2 jlist` 显示 `autorestart: true`、`max_memory_restart: 536870912`、`max_restarts: 5`、`restart_delay: 5000`、`min_uptime: 10000`、`kill_timeout: 5000`、`PORT: '8949'`；`curl -I http://127.0.0.1:8949/` 返回 200 和 Task 11 安全头。
- 首次 `npm run build` 因本地 `node_modules/vitest` 缺失报 `Cannot find type definition file for 'vitest/globals'`；`npm install` 恢复依赖后需重跑 build 作为最终验证。
- 最终复验：`npx vitest run src/tests/deployment-static-server.test.ts` 9/9 通过；`npm run test:run` 18 files / 231 tests 全部通过；`npm run build` 通过。为让 Node-based deployment test 类型环境可解析，补充 `@types/node` devDependency 并在 `tsconfig.json` types 中加入 `node`；`npx tsc --noEmit --pretty false` 无输出。LSP 服务仍对该测试文件返回旧的 Node global diagnostics（行号未反映新增 reference），疑似活跃 TS LSP 未刷新；编译器/测试/build 均已验证通过。

## 2026-06-07 Task 1: 真实 F/Q/手机交互推进对话
- 根因在 `src/input/InputManager.ts`：`consumeInteract()` 在任何 locked 状态都直接返回空，同时 desktop polling 在 locked 时提前 return，mobile 交互区也在 locked 时忽略，导致 EventEngine 已经 `lock('dialogue')` 且处于 `awaiting_advance` 时 PlayScene 收不到 F/Q/mobile 交互边沿。
- 修复保持 movement lock 不变：`getMovementVector()` locked 时仍返回 `{ x: 0, y: 0 }`，joystick locked 时仍不启动；仅当 lockReason 为 `dialogue` 时允许 F/Q 和 mobile 右侧交互按钮写入一次性 interact action，并由 `consumeInteract()` 清除，保留按住不连发的 edge-triggered 行为。
- `src/scenes/PlayScene.ts` 将 F/Q 的 `awaiting_advance` 处理收敛到同一个 `advanceDialogueIfAwaiting()`，mobile 默认映射 F，因此与桌面 F/Q 共用 EventEngine.advance 路径。
- RED 证据：`npx vitest run src/tests/input-manager.test.ts` 在新增回归测试下失败，locked dialogue 的 F 和 mobile interact 均收到 `{ action: null, pressed: false }`；修复后同一目标测试 17/17 通过。
- E2E 证据：`npx playwright test tests/e2e/dialogue-advance-regression.spec.ts --project=desktop-chromium --project=mobile-landscape-chromium` 2 passed / 2 skipped；测试使用真实 `page.keyboard.press('f')` 和 mobile TouchEvent 右侧交互按钮推进对话，截图写入 `.omo/evidence/task-1-dialogue-f-advance.png` 与 `.omo/evidence/task-1-mobile-dialogue-advance.png`。

## 2026-06-07 Task 7: 地图视觉、家具缩放/碰撞和通信设备
- 基于 `设计/楼道.jpg` 做最小校准：4F/5F 右侧门位按 order 保持“电梯在前”，4F 右侧为电梯 + 办公室前/后门，5F 右侧为电梯 + 学校通信控制室后门；4F 左侧 8 个教室门顺序不变，5F 左侧 4 个普通班级背景门仍不可交互。
- `src/data/maps.ts` 新增房间级 `interactionTargets` schema，并在 `communication-control-5f` 中加入 `communication-device`，使用已批准的 `communication.steelInteractable` 程序钢色设备 metadata，不触碰 story/EventEngine/save/PlayScene。
- `src/map/MapRenderer.ts` 导出 `CLASSROOM_DESK_TARGET_HEIGHT = 48`，继续复用 `最终素材/桌椅.png` 并按目标高度运行时缩放；通信控制室设备通过 Phaser graphics 程序绘制钢色 console 和标签。
- 碰撞语义保持 `CollisionManager.getFurnitureCollisions()` 的下 1/3 阻挡区；新增测试证明上部视觉区域可重叠、下部身体区域阻挡，不把整张桌椅图当碰撞体。
- `src/map/CollisionManager.ts` 显式导出 `FURNITURE_COLLISION_VERTICAL_FRACTION = 1 / 3`，使渲染/测试可锁定家具“只挡下部身体区域”的数据级语义。
- RED 证据：新增聚焦测试先失败：4F 右侧门 order 仍是办公室前/后 + 电梯；`communication-control-5f.interactionTargets` 为 undefined；`CLASSROOM_DESK_TARGET_HEIGHT` 未导出；通信钢色设备没有渲染 graphics。
- GREEN 证据：`npx vitest run src/tests/map-schema.test.ts src/tests/map-renderer.test.ts` 2 files / 22 tests 通过；`npx vitest run src/tests/map-schema.test.ts src/tests/map-renderer.test.ts src/tests/room-render-boundaries.test.ts` 3 files / 25 tests 通过；变更文件 LSP diagnostics 全部 clean；`npm run typecheck` 通过。
- 最终复验：在导出碰撞比例常量后，`npx vitest run src/tests/map-schema.test.ts src/tests/map-renderer.test.ts src/tests/room-render-boundaries.test.ts` 仍为 3 files / 25 tests 通过，`npm run typecheck` 仍通过。


## 2026-06-07 Task 4: H 点通信状态条件分支
- H 手机柜根因：`src/data/story.ts` 原本把“通信未开启”和“通信已开启”两个手机柜 `interaction` 线性相邻放在 checkpoint H，`src/story/EventEngine.ts` 对 `interaction` 只设置输入上下文，不看 `storyFlags`，因此两条路径会按数组顺序互相覆盖/串行执行。
- 修复采用现有 `storyFlags` 状态面：新增命令级 `condition: { flag, equals }` 过滤，H 点按 persisted `communicationDisabled` 选择未开启提示/去五楼任务或已关闭后 `gotoCheckpoint I`；B-2 在进入 H 存档前 `setFlag communicationDisabled=true`。
- `src/state/saveState.ts` 新增默认 `communicationDisabled:false`，反序列化旧/缺省 save 时合并默认值；任意 boolean story flag 记录机制仍沿用原有 `storyFlags`。
- RED 证据：新增 `src/tests/event-engine.test.ts` 三个回归后，`npx vitest run src/tests/event-engine.test.ts` 失败 3 项：false 路径最终任务仍是“去班里偷同学手机报警”；true 路径仍显示“信号屏蔽器？这对吗？”；B-2 save 仍停在 checkpoint G/无 `communicationDisabled`。
- GREEN 证据：修复后 `npx vitest run src/tests/event-engine.test.ts` 37/37 通过；`npx vitest run src/tests/save-state.test.ts src/tests/first-act.test.ts` 37/37 通过；`npx vitest run src/tests/event-engine.test.ts src/tests/save-state.test.ts src/tests/first-act.test.ts` 74/74 通过。
- Surface 证据：Vite SSR driver 直接加载 `EventEngine`/`storyManifest`/`saveState`，H with `communicationDisabled:false` 输出最后对白 `信号屏蔽器？这对吗？` 且不进 I；H with `communicationDisabled:true` 输出 `好了。` 且 checkpoints 包含 I；driver 未写入仓库文件。
- Type evidence：`npm run typecheck` / `npx tsc --noEmit --pretty false` 均无输出；LSP 对变更生产文件无 diagnostics，`event-engine.test.ts` 仅保留既有 unused hints。

## 2026-06-07 Task 13: Playwright mobile project 与真实端到端覆盖
- `playwright.config.ts` 的 `mobile-landscape-chromium` 显式设置 `isMobile: true` 与 `hasTouch: true`，保留 Pixel 5 landscape 和 915x412 viewport。
- `tests/e2e/input-mobile.spec.ts` 现在只在 `mobile-landscape-chromium` 下运行；desktop project 下 5/5 skip，mobile 下覆盖 device mode、joystick、input lock、fullscreen prompt idle/landscape、以及真实 TouchEvent 右侧 unified interaction button。新增证据截图：`.omo/evidence/task-13-mobile-fullscreen-prompt.png`、`.omo/evidence/task-13-mobile-interaction-button.png`。
- `tests/e2e/input-desktop.spec.ts` 现在只在 `desktop-chromium` 下运行，避免 mobile project 因 desktop keyboard movement/device assumptions 失败。
- `tests/e2e/production-url.spec.ts` 的 keyboard movement smoke 只在 `desktop-chromium` 下运行；其他 production URL smoke 仍可在 mobile project 运行。
- `tests/e2e/mobile-layout.spec.ts` 的 simultaneous touch regression 保留真实第二触点不打断 joystick movement 覆盖；unified interaction button 的真实 touch acceptance 由 `input-mobile.spec.ts` 负责。
- Task 1 `tests/e2e/dialogue-advance-regression.spec.ts` 未改，仍使用真实 `page.keyboard.press(f)` 和 mobile TouchEvent 推进对话，不以 debug `eventEngine.advance()` 替代。
- RED 证据：修改前 `npx playwright test tests/e2e/input-mobile.spec.ts --project=desktop-chromium` 为 3 failed / 2 passed，失败点为 desktop 下 `deviceMode` 收到 `desktop`、joystick movement 收到 `{x:0,y:0}`。
- GREEN/focused 证据：`npx playwright test tests/e2e/input-mobile.spec.ts --project=desktop-chromium --project=mobile-landscape-chromium` 最终 5 skipped / 5 passed；`npx playwright test tests/e2e/input-desktop.spec.ts --project=desktop-chromium` 6 passed；`npx playwright test tests/e2e/dialogue-advance-regression.spec.ts --project=desktop-chromium --project=mobile-landscape-chromium` 2 passed / 2 skipped；`npx playwright test tests/e2e/mobile-layout.spec.ts --project=mobile-landscape-chromium` 5 passed；`npx playwright test tests/e2e/production-url.spec.ts --project=desktop-chromium` 5 passed；`npx playwright test tests/e2e/production-url.spec.ts --project=mobile-landscape-chromium` 4 passed / 1 skipped。
- Project 证据：`npm run e2e -- --project=mobile-landscape-chromium` 最终 122 passed / 8 skipped。`npm run typecheck` 通过。Changed-file LSP diagnostics clean。

## 2026-06-07 Task 14: 验证证据流水线 final evidence
- Final npm run verify PASS: typecheck exit 0; Vitest exit 0 with 18 files / 243 tests; build exit 0 with Vite built in 2.16s; sourcemap scan passed with no dist/assets/*.map; static header check exit 0 on an ephemeral localhost port; production URL E2E 4 passed / 1 skipped; mobile input E2E 5 passed; dialogue advance E2E 2 passed / 2 skipped.
- Current dist evidence: sha256 4e2849eb0e1fab1abe956c38d6ebf904e7b86db938c557f30a59b9870c2b123d, 57 files, 12,177,303 bytes, build timestamp window 2026-06-07T10:33:14.957Z to 2026-06-07T10:33:22.043Z.
- Final PASS summary is .omo/evidence/task-14-verify-summary.json and .omo/evidence/task-14-verify-summary.md. Sourcemap simulated regression proof is separated as .omo/evidence/task-14-sourcemap-negative-summary.json/.md with conclusion FAIL and exit code 1, so it no longer overwrites the current PASS dist hash/test count evidence.
- Direct post-change checks also passed before final verify: npm run typecheck, npm run test:run (18 files / 243 tests), and npm run build.

## 2026-06-07 Task 14: 验证证据流水线 final evidence
- Final npm run verify PASS: typecheck exit 0; Vitest exit 0 with 18 files / 243 tests; build exit 0 with Vite built in 2.16s; sourcemap scan passed with no dist/assets/*.map; static header check exit 0 on an ephemeral localhost port; production URL E2E 4 passed / 1 skipped; mobile input E2E 5 passed; dialogue advance E2E 2 passed / 2 skipped.
- Current dist evidence: sha256 4e2849eb0e1fab1abe956c38d6ebf904e7b86db938c557f30a59b9870c2b123d, 57 files, 12,177,303 bytes, build timestamp window 2026-06-07T10:33:14.957Z to 2026-06-07T10:33:22.043Z.
- Final PASS summary is .omo/evidence/task-14-verify-summary.json and .omo/evidence/task-14-verify-summary.md. Sourcemap simulated regression proof is separated as .omo/evidence/task-14-sourcemap-negative-summary.json/.md with conclusion FAIL and exit code 1, so it no longer overwrites the current PASS dist hash/test count evidence.
- Direct post-change checks also passed before final verify: npm run typecheck, npm run test:run (18 files / 243 tests), and npm run build.

## 2026-06-07 Task 2: 检查点 A proximity 与固定点 scripted movement
- RED 证据：新增 `src/tests/event-engine.test.ts` proximity/scripted movement 合同测试后，`npx vitest run src/tests/event-engine.test.ts` 失败 2 项：A 点收到 3 次 advance 后直接进入 `awaiting_advance`（未停在 proximity），E 点 `scriptedMovements` 长度为 0（没有移动请求）。
- 数据面：`src/data/story.ts` 新增 `proximityTargets` / `scriptedMovementTargets`；A 点 proximity 使用 `checkpoint-a-dan-yuxuan-gt1`，坐标 `{ x: 760, y: 520 }`、半径 `96`，避免初始位置立即通过；董继豪/杨云走向秦浩睿尸体使用固定目标 `{ x: 760, y: 330 }`、`durationMs: 2000`、`tolerancePx: 16`。
- 引擎面：`src/story/EventEngine.ts` 新增 `awaiting_proximity` 和 `awaiting_scripted_movement`；proximity 等待期间解锁输入并由 `updatePlayerPosition()` 判断半径；scripted movement 通过回调发起固定目标移动，完成后更新位置、解锁，再继续执行后续 story command。
- 场景面：`src/scenes/PlayScene.ts` 每帧同步 `playerPosition` 给 EventEngine；scripted movement 使用 Phaser fixed-target linear tween，不使用 A* 或全局 pathfinding；debug hook `__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__` 暴露位置和移动状态供 E2E 验证。
- GREEN 证据：`npx vitest run src/tests/event-engine.test.ts` 39/39 通过；`npx vitest run src/tests/event-engine.test.ts src/tests/first-act.test.ts` 69/69 通过；`npm run test:run` 18 files / 243 tests 全部通过；`npm run typecheck` 通过；`npm run build` 通过（仅保留既有 Vite chunk size warning）。
- Playwright 证据：`npx playwright test tests/e2e/proximity-scripted-movement.spec.ts --project=desktop-chromium` 1/1 通过；证据写入 `.omo/evidence/task-2-proximity-checkpoint-a.png`、`.omo/evidence/task-2-scripted-movement.png`、`.omo/evidence/task-2-proximity-scripted-move.json`。JSON 显示 proximity 前仍为 `但宇轩……听着也很好吃呢。` 且 input unlocked；进入半径后显示 `我要搓手。`；scripted movement 中途位置 `{x:760,y:380.895}`，结束 `{x:760,y:330}`，距目标 `0`，最终 lockReason 为 `dialogue`。

### Task 2 re-review fixes
- Review blocker fixed: proximity now stores an armed player position and requires fresh movement (`>1px`) after entering `awaiting_proximity`, so a continue/reload already inside the configured radius does not immediately trigger checkpoint A. RED evidence: added `checkpoint A proximity does not immediately pass when armed inside radius until position changes` failed before the fix; GREEN evidence: `npx vitest run src/tests/event-engine.test.ts` 40/40 passed.
- Review blocker fixed: EventEngine tracks `switchCharacter.control` as story control state and `completeScriptedMovement()` restores via that state instead of unconditional unlock. Player control unlocks; scripted/hidden states restore `scriptedMovement` lock until later story commands change state.
- Review blocker fixed: Playwright now asserts during active tween `input.lockActive: true`, `input.lockReason: scriptedMovement`, and `movementVector: {x:0,y:0}` after a real keyboard movement attempt. Updated `.omo/evidence/task-2-proximity-scripted-move.json` records this lock proof.
- Final re-verification: changed-file LSP diagnostics clean; `npx playwright test tests/e2e/proximity-scripted-movement.spec.ts --project=desktop-chromium` 1/1 passed; `npx vitest run src/tests/event-engine.test.ts` 40/40 passed; `npm run test:run` 18 files / 244 tests passed; `npm run typecheck` passed; `npm run build` passed with only the known Vite large-chunk warning.

## 2026-06-07 Task 3: 死亡闪烁帧序列渲染
- `EventEngine` 仍保持 deathFlash 的 `blackScreen` 输入锁和按 `story.ts` frame duration 总和等待，但现在通过回调把 `celery` / `ruler` 的原始 `DeathFlashFrame[]` 交给场景渲染层，不再只是 wait-only。
- `DeathFlashManager` 使用 `src/data/story.ts` 的 frame 数据逐帧渲染：`bloodBlack` 使用 `transition.bloodBlackScreen`，白/黑背景用对应全屏色块；芹菜变体复用 `prop.celery` 并按黑/白/large frame 调整，尺子复用 `prop.ruler`。
- 每帧渲染前销毁上一帧对象，播放结束后 active object count 回到 0；PlayScene debug hook 暴露 ordered frame log / active 状态 / active object count 供 Playwright 断言。
- RED 证据：新增 focused tests 初次失败于缺少 `DeathFlashManager` import，以及 `EventEngine` 未触发 deathFlash renderer callback；GREEN 后 `npx vitest run src/tests/death-flash-manager.test.ts src/tests/event-engine.test.ts` 2 files / 42 tests 通过。
- Playwright 证据：`npx playwright test tests/e2e/death-flash-frames.spec.ts --project=desktop-chromium` 1/1 通过，证据写入 `.omo/evidence/task-3-death-flash-celery.json` 和 `.omo/evidence/task-3-death-flash-celery.png`；JSON 记录 12 帧 celery sequence 与 manifest 一致且 `activeObjectCount: 0`。
- 最终复验：changed-file LSP diagnostics clean；`npm run typecheck` 通过；`npm run test:run` 19 files / 246 tests 通过；`npm run build` 通过，仅保留既有 Vite large chunk warning。
- Review blocker fixed: A-1 deathFlash 结束到 checkpoint D 后曾保留 `blackScreen` 输入锁；`handleCheckpoint()` 现在按 checkpoint playable state 恢复 player control，Vitest 断言 `inputLog.locked === false`，Playwright 断言 deathFlash 后 `input.lockActive === false` 且真实按住 D 时 `movementVector.x > 0`。
- Review re-verification: focused Vitest 42/42 通过；`npx playwright test tests/e2e/death-flash-frames.spec.ts --project=desktop-chromium` 1/1 通过并刷新 `.omo/evidence/task-3-death-flash-celery.json`；changed-file LSP clean；`npm run typecheck` 通过；`npm run test:run` 19 files / 246 tests 通过；`npm run build` 通过，仅保留既有 Vite large chunk warning；re-review returned `UNCONDITIONAL APPROVAL`。


## 2026-06-07 Task 14: 验证证据流水线 refresh after Task 2
- Existing `scripts/verify.mjs` was kept unchanged: it already writes separate `task-14-verify-*` PASS evidence and `task-14-sourcemap-negative-*` FAIL regression evidence, runs checks sequentially, uses an ephemeral localhost static-server port, and exits non-zero on failed command/checks.
- Refreshed negative sourcemap proof first: `node scripts/verify.mjs --sourcemap-negative-test` exited 1 as intended through process exitCode behavior and wrote `.omo/evidence/task-14-sourcemap-negative-summary.json/.md` with `Conclusion: FAIL`, `mode: sourcemap-negative-test`, and `assets/simulated-regression.map` listed.
- Refreshed current PASS evidence: `npm run verify` exited 0. It ran typecheck exit 0, Vitest exit 0 with 18 files / 244 tests, build exit 0 with Vite built in 1.30s, sourcemap scan pass with no `dist/assets/*.map`, static header check exit 0 at `http://127.0.0.1:35335`, production URL E2E 4 passed / 1 skipped, mobile input E2E 5 passed, dialogue advance E2E 2 passed / 2 skipped.
- Current dist evidence in `.omo/evidence/task-14-verify-summary.json/.md`: sha256 `293494b120d46ea63d67c31529361f0df6264792502aac1496b3991d616bff61`, 57 files, 12,178,078 bytes, build timestamp window 2026-06-07T13:08:24.812Z to 2026-06-07T13:08:30.211Z. The current PASS summary no longer carries the stale 243-test count.

## 2026-06-07 Task 9: 运行时泄漏、重复管理器和边界 bug
- `InputManager.destroy()` now removes the stable `fullscreenerror` document listener and clears any pending fullscreen denial fallback timeout; fullscreen enter also clears the fallback timeout.
- Scene lifecycle cleanup is now registered on `GameScene` and `PlayScene` shutdown, with `GameScene.shutdown()` destroying menu managers before scene transitions/recreates so restart paths do not accumulate duplicate input/map managers.
- Missing player sprite fallback now ensures a deterministic 1x1 white `__WHITE` canvas texture exists before creating the fallback sprite, avoiding unsafe reliance on an absent texture key.
- `PlayScene` caps movement delta at 50ms before applying normal speed, so a tab-resume frame cannot step across narrow collision zones while ordinary per-frame movement remains unchanged.
- `EventEngine` zero-duration waits now complete on update ticks instead of synchronously recursing through command chains, and timer updates snapshot the current map before callbacks so callback-added timers are not visited in the same update pass.
- RED evidence: new focused regressions initially failed for synchronous 0ms waits, callback-added timer same-pass expiry, fullscreen fallback timeout cleanup, and missing scene/fallback/movement APIs. GREEN evidence: focused `npx vitest run src/tests/input-manager.test.ts src/tests/event-engine.test.ts src/tests/runtime-shell.test.ts` passed 67/67; full `npm run test:run` passed 19 files / 259 tests; `npm run typecheck` and `npm run build` passed; sequential Playwright surface checks passed for dialogue advance desktop/mobile and mobile input.

## 2026-06-07 Task 5: 5F 校长办公室地图与 B-1 门口交互
- `src/data/maps.ts` now defines real room `principals-office-5f` and real door `principals-office-front-5f`; door label is `校长办公室`, `storyTargetId` is `五楼校长办公室门口`, side is left, order is 9, bounds are `{ x: 240, y: 1560, width: 128, height: 24 }` derived from left-side order 8 y=1420 plus the 140px vertical spacing.
- 5F left side now has 8 non-interactive background class doors plus the order-9 principal office room door; 5F right side remains exactly `5f-elevator` order 1 and `5f-communication-control-back` order 2, preserving the Task 7 rule and communication-control back door.
- 5F corridor-only geometry was extended only for 5F: bounds height 2280, walkable height 2120, and corresponding bottom wall/occlusion zones, so order-9 fits without moving right-side elevator/communication doors.
- `src/state/saveState.ts` valid room whitelist includes `principals-office-5f`; focused save-state regression covers round-tripping that room.
- B-1 story text meaning is unchanged; `src/tests/story-manifest.test.ts` links B-1 interaction target `五楼校长办公室门口` to door `principals-office-front-5f`.
- RED/GREEN evidence: focused map/story tests first failed on missing principal office room/door/target; save-state test first failed with `Cannot serialize malformed save state`; final focused Vitest `npx vitest run src/tests/map-schema.test.ts src/tests/story-manifest.test.ts src/tests/map-renderer.test.ts src/tests/room-render-boundaries.test.ts src/tests/save-state.test.ts` passed 5 files / 43 tests.
- Surface evidence: `npx playwright test tests/e2e/principal-office-target.spec.ts --project=desktop-chromium` passed and wrote `.omo/evidence/task-5-principal-office-target.json` plus `.omo/evidence/task-5-principal-office-target.png`; JSON shows interactionResult true, map currentRoomId `principals-office-5f`, and B-1 ending `split-in-two` at checkpoint G.
- Final verification passed: `npm run typecheck`, `npm run test:run` (19 files / 259 tests), and `npm run build` (only known Vite large chunk warning).
- To unblock required typecheck/build without changing B-1 behavior, `src/phaser-texture-manager.d.ts` documents Phaser `TextureManager.generate`; `src/scenes/PlayScene.ts` received only a null guard around existing `createCanvas` fallback texture before `refresh()`.

### Task 5 verification blocker fix
- Removed the `@ts-ignore` workaround from `tests/e2e/principal-office-target.spec.ts`; the spec now imports Node file helpers via `node:fs` with no broad suppression.
- Added `tests/e2e/tsconfig.json` extending the root config with `types: ["node", "@playwright/test"]`, so the active LSP can type-check E2E specs that are excluded from the root app tsconfig.
- Verification passed: LSP diagnostics clean for the Task 5 spec and E2E tsconfig; `npx playwright test tests/e2e/principal-office-target.spec.ts --project=desktop-chromium` 1/1 passed; `npm run typecheck` passed.

## 2026-06-07 Task 8: 修复电梯切楼稳定性和出生点
- 根因：`MapRenderer.startElevatorTransition()` 原本只靠 `camerafadeoutcomplete`/`camerafadeincomplete` 清理状态，Phaser fade completion event 未触发时会永久停在 `elevatorTransitioning: true`；`PlayScene` 的真实 F 电梯交互还保留玩家 x 并硬编码 y=1540，没有读取目标楼层 map spawn。
- 修复：电梯正常路径仍保持 500ms fade out，切换楼层并渲染目标 corridor，再 50ms 后执行 500ms fade in；新增 1200ms recovery timeout，缺失 fade event 时强制渲染目标楼层、启动 fade in 并清掉 `transitioning`/debug state/input lock。
- 出生点：`PlayScene` 在目标楼层渲染回调中读取 `schoolMaps.floors[targetFloor].corridor.spawnPoints` 的 `${floorId.toLowerCase()}-elevator-arrival`，同步 player sprite、EventEngine position 和 character debug direction，不再保留旧 x 或使用场景内硬编码 y 分支。
- RED 证据：新增 `map-renderer: elevator transition fallback clears stuck state when camera fade events never fire` 后，`npx vitest run src/tests/map-renderer.test.ts` 先失败于 `expected '4F' to be '5F'`；新增 Playwright spawn spec 先失败于真实 F 交互未到 5F。
- GREEN/最终证据：changed-file LSP diagnostics clean；`npx vitest run src/tests/map-renderer.test.ts` 16/16 通过；`npx playwright test tests/e2e/elevator-transition.spec.ts --project=desktop-chromium --grep "target-floor elevator spawn"` 1/1 通过；`npx playwright test tests/e2e/map-navigation.spec.ts --project=desktop-chromium` 6/6 通过，Task 13 记录的 `{ currentFloorId: "5F", elevatorTransitioning: true }` 卡死已解除；`npm run typecheck`、`npm run test:run` 19 files / 260 tests、`npm run build` 均通过，build 仅保留既有 Vite large-chunk warning。

## 2026-06-07 Task 6: 渲染尸体、头部、非行走角色和对话立绘
- `src/ui/uiState.ts` now exposes `getDialoguePortraitKey()` so known speakers map to existing `PORTRAIT_KEYS`; `？？？` and empty narration return no portrait.
- `src/story/EventEngine.ts` passes resolved portrait keys into `NarrativeUIManager.setDialogue()` and resets `mutable.controllableCharacterId` to the checkpoint playable character on `startFromCheckpoint()`, which fixes debug/checkpoint jumps using stale Yang Yun portrait state.
- `src/scenes/storyEntities.ts` is the pure flag-to-visual contract for non-blocking world entities; `PlayScene` renders those entries as image-only story sprites and exposes `getStoryEntities()` for deterministic tests. No collision zones or interact hit areas are created for these corpse/head visuals.
- Story flags now include `danYuxuanStandingVisible` before the GT1 proximity/body state and `headPickupPartsVisible` around B-2 head pickup dialogue; existing dialogue text meaning is unchanged.
- RED/GREEN evidence: focused Vitest `npx vitest run src/tests/narrative-ui.test.ts src/tests/story-entities.test.ts src/tests/event-engine.test.ts` passed 3 files / 84 tests after implementation; Playwright first caught stale checkpoint portrait state, then passed after syncing checkpoint playable character.
- Browser evidence: `npx playwright test tests/e2e/task-6-portraits-entities.spec.ts --project=desktop-chromium` passed 2/2 and wrote `.omo/evidence/task-6-portraits.json/.png` plus `.omo/evidence/task-6-story-entities.json/.png`.

### Task 6 verification blocker fix
- Removed the stale role-prompt portrait future-work TODO and dead `void portraitKey` from `src/ui/NarrativeUIManager.ts`; `setRolePrompt()` remains text-only and no untested role-prompt portrait thumbnail behavior was added.
- Dialogue portrait rendering in `setDialogue()` remains unchanged: callers still pass `portraitKey`, `dialoguePortrait.setTexture()` is used when present, and debug state continues to record `dialoguePortraitKey`.

## 2026-06-07 Task 15: 前端整体美观性与交互反馈
- `src/ui/uiTheme.ts` now centralizes the first-act dark pixel-horror UI tokens used by narrative UI, mobile/fullscreen controls, preload UI, branch choices, and map labels/colors; visual helpers tolerate lightweight unit-test Phaser stubs while preserving real Phaser styling.
- `NarrativeUIManager`, `InputManager`, `PreloadScene`, `PlayScene`, and `MapRenderer` now share the same dark surfaces, blood-red/gold accents, monospace pixel-like text treatment, stroked panels/buttons, and hover/pressed/touch feedback without changing story text or gameplay semantics.
- Task visibility semantics remain unchanged: `setTask('无')` and empty task text hide the top task bar; non-empty text stays top-centered and width-capped.
- `tests/e2e/task-15-ui-polish.spec.ts` adds desktop, mobile-landscape, and preload-failure visual/layout proof. RED evidence during implementation: desktop test first failed because checkpoint C only had one branch button while the test expected two; mobile test first failed because raw viewport tap missed the game-space interaction key. Final tests use checkpoint G and the existing canvas game-space touch dispatch pattern.
- Evidence screenshots refreshed: `.omo/evidence/task-15-desktop-ui-polish.png`, `.omo/evidence/task-15-mobile-ui-polish.png`, and `.omo/evidence/task-15-preload-failure-retry.png`.
- Verification passed: changed-file LSP diagnostics clean; `npx playwright test tests/e2e/task-15-ui-polish.spec.ts --project=desktop-chromium --workers=1` 2 passed / 1 skipped; `npx playwright test tests/e2e/task-15-ui-polish.spec.ts --project=mobile-landscape-chromium --workers=1` 1 passed / 2 skipped; `npm run typecheck` passed; `npm run test:run` passed 20 files / 265 tests; `npm run build` passed with only the known large chunk warning.

## 2026-06-07 Task 16: 刷新交付文档并执行全量回归
- DELIVERY.md now reflects production-gap Task 16 rather than stale T20 wording: Act 1 only, Acts 2/3 reserved/not playable, current dist hash dd8b59865def38da544e812336249d453aceefd7923daceb767eac6b6ab5bdce, 57 dist files / 12,192,292 bytes, 20 Vitest files / 265 tests, PM2 HOST 0.0.0.0 PORT 8949, and current security-header/static-server behavior.
- Task 16 evidence refreshed: task-16-full-regression.log records typecheck/test/build plus attempted full npm run e2e; task-16-scoped-e2e.log records sequential passing reliable E2E scope; task-16-pm2-curl.log records PM2 online, 8949 curl 200/security headers, and ephemeral 39049 static-server equivalent; task-16-delivery-consistency.log proves stale fixed-limit claims are gone and production has no 其他/ dependency.
- Current production forbidden-source scan still finds 其他/ only in negative assertion tests (src/data/assets.test.ts and src/tests/deployment-static-server.test.ts); DELIVERY intentionally documents that distinction instead of claiming zero literal references anywhere.

## 2026-06-08 Task 16: E2E release gate fix
- Rejected Task 16 full E2E caveat was resolved by making configured Playwright release coverage valid and green: default `npm run e2e` now runs desktop/mobile local dev projects only, with `production-chromium` included only when `E2E_PRODUCTION_URL` is explicitly set for deployed static-server checks.
- Minimal spec fixes aligned old E2E assumptions with Tasks 2/3/13: checkpoint A tests now satisfy the real proximity gate; A-1 branch flow waits through death flash to checkpoint D; desktop gameplay/elevator keyboard checks are precisely desktop-only; production build skips dev-only forced preload failure query.
- Final sequential regression passed: `npm run typecheck` exit 0, `npm run test:run` 20 files / 265 tests, `npm run build` exit 0 with known large chunk warning, and `npm run e2e` 229 passed / 49 skipped exit 0. Evidence refreshed in `.omo/evidence/task-16-full-regression.log`.

## 2026-06-08T06:56:00+08:00 Final Wave Vitest timeout blocker fix
- Root cause: the two timed-out tests put the first runtime import of Phaser-heavy modules inside individual 15s async test bodies. Under full-suite worker load, module transform/import time was counted against those tests even though the assertions and cleanup behavior were fast.
- Changed files: `src/tests/input-manager.test.ts` and `src/tests/runtime-shell.test.ts`. The tests now use hoisted/static imports so import cost is file setup rather than per-test timeout budget; assertions for dialogue-locked F/Q/mobile interaction and GameScene manager destruction are unchanged. `input-manager.test.ts` also wraps its fake-timer fullscreen fallback test in `finally { vi.useRealTimers(); }`.
- RED evidence: required `npx vitest run src/tests/input-manager.test.ts src/tests/runtime-shell.test.ts --runInBand` was attempted first, but Vitest 4.1.8 rejects `--runInBand` as an unknown option; the runnable focused command before the fix passed but showed the issue shape with 14.42s spent inside tests, close to the explicit 15s timeout budget.
- GREEN evidence: `npx vitest run src/tests/input-manager.test.ts src/tests/runtime-shell.test.ts` passed 25/25 with tests taking 53ms; `npx vitest run src/tests/input-manager.test.ts src/tests/runtime-shell.test.ts --no-file-parallelism` passed 25/25; `npm run test:run` passed 20 files / 265 tests; `npm run typecheck` passed.

## 2026-06-08T06:55:15+08:00 F1 Vitest timeout blocker fix
- RED/context evidence: F1 observed standard `npm run test:run` timing out at `src/tests/input-manager.test.ts:86` and `src/tests/runtime-shell.test.ts:79`; local focused pre-edit reproduction with `npx vitest run src/tests/input-manager.test.ts src/tests/runtime-shell.test.ts` did not timeout but exposed the same fragility profile: 2 files / 25 tests passed only after 24.88s, with Phaser-dependent test execution consuming 14.30s.
- Root cause: those tests import Phaser-dependent `InputManager`/`GameScene` paths and were relying on real Phaser runtime import under jsdom; under the standard multi-file Vitest runner that made the import tests slow enough to hit their explicit 15s timeouts. The behavior under test is method-level input/shutdown logic, not Phaser runtime initialization.
- Fix: `src/tests/input-manager.test.ts` and `src/tests/runtime-shell.test.ts` now provide minimal hoisted `vi.mock('phaser')` definitions for their Phaser-dependent imports, preserving all original assertions while preventing real Phaser canvas/runtime probing in these unit tests.
- GREEN evidence: focused `npx vitest run src/tests/input-manager.test.ts src/tests/runtime-shell.test.ts` passed 2 files / 25 tests in 12.42s, with test execution down to 400ms; `npm run test:run` passed 20 files / 265 tests in 19.95s; `npm run typecheck` exited 0; changed-file LSP diagnostics were clean; required forbidden-pattern grep over changed tests found no matches.


## 2026-06-08T06:51:52+08:00 F1/F4 gateway subtree restore
- Confirmed blocker wording in `.omo/notepads/ying-zhong-jiu-production-gap-fix/issues.md`: F4 cited `../other/wechat-openai-gateway` with 4209 deleted files / 1,019,771 deletions; F1 cited 4209 deleted paths under `other/wechat-openai-gateway`.
- Before restore from `/mnt/Storage1_xe6x96xb0xe5x8axa0xe5x8dxb7/nas/lucky/lqxyx`: `git status --short -- ../other/wechat-openai-gateway` and `git diff --name-only -- ../other/wechat-openai-gateway` returned deleted paths under the gateway subtree.
- Restore command run: `GIT_MASTER=1 git restore -- ../other/wechat-openai-gateway`.
- After restore: `git diff --name-only -- ../other/wechat-openai-gateway`, `git diff --shortstat -- ../other/wechat-openai-gateway`, and `git status --short -- ../other/wechat-openai-gateway` all returned empty output.

## 2026-06-08T06:52:20+08:00 other/wechat-openai-gateway scoped restore
- Restored only tracked deletions under `../other/wechat-openai-gateway` from `lqxyx/` using `GIT_MASTER=1 git restore -- ../other/wechat-openai-gateway`.
- Before restore: `git diff --shortstat -- ../other/wechat-openai-gateway` reported 4209 files changed and 1,019,771 deletions; first timed-out scoped restore reduced remaining diff to 1473 deleted paths / 612,973 deletions, then the longer scoped retry completed.
- Verification commands after restore returned empty output: `GIT_MASTER=1 git diff --name-only -- ../other/wechat-openai-gateway`, `GIT_MASTER=1 git diff --shortstat -- ../other/wechat-openai-gateway`, and `GIT_MASTER=1 git status --short -- ../other/wechat-openai-gateway`.
- No staging, committing, pushing, deleting, or broad restore was performed; lqxyx production-gap files were not restored or otherwise touched by this cleanup.


## 2026-06-08T07:32:00+08:00 Death flash E2E blocker fix
- Changed files: `src/story/EventEngine.ts`, `src/tests/event-engine.test.ts`, `tests/e2e/death-flash-frames.spec.ts`, and refreshed `.omo/evidence/task-3-death-flash-celery.json/.png` via Playwright.
- RED evidence: required pre-edit `npx playwright test tests/e2e/death-flash-frames.spec.ts --project=desktop-chromium --workers=1` failed at frame-count polling, expected 12 and received 4 in this run (Atlas had received 2). Source regression added afterward first failed: `npx vitest run src/tests/event-engine.test.ts -t "cancels checkpoint C auto-branch timer after selecting A-1"` reported `onTimerExpired` was called with `A-2-auto-eat-dan-yuxuan` after A-1 selection.
- Root cause: checkpoint C's `A-2-auto-eat-dan-yuxuan` timer stayed active after explicit A-1 branch selection, so it could steal the flow during the long A-1 movement/deathFlash surface path; the E2E also polled frame-log length for a fixed 7s instead of first proving deathFlash active and then waiting for the story-duration-backed surface to finish before comparing the full ordered log.
- Fix: `EventEngine.selectBranch()` now stops active timers and hides the timer UI before loading the selected branch. The E2E still requires exactly the 12 story-defined celery frames, but waits for real deathFlash active -> inactive using the story sequence duration before asserting ordered frame data, `activeObjectCount: 0`, and unlocked movement.
- GREEN evidence: `npx vitest run src/tests/event-engine.test.ts -t "cancels checkpoint C auto-branch timer after selecting A-1"` passed; `npx playwright test tests/e2e/death-flash-frames.spec.ts --project=desktop-chromium --workers=1` passed 1/1 and refreshed death-flash evidence; `npx vitest run src/tests/death-flash-manager.test.ts` passed 2/2; `npx vitest run src/tests/death-flash-manager.test.ts src/tests/event-engine.test.ts` passed 46/46; `npm run test:run` passed 20 files / 266 tests; `npm run typecheck` exited 0.
- LSP diagnostics were clean for `src/story/EventEngine.ts`, `src/tests/event-engine.test.ts`, and `tests/e2e/death-flash-frames.spec.ts`. Forbidden-marker grep found no matches in the source/test unit files; it found the pre-existing desktop-project guard `test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only')` in the changed E2E file, not a newly introduced skip.

## 2026-06-08T07:59:40+08:00 F1 main-flow real-input E2E compliance
- RED/risk evidence: required inspection found `tests/e2e/first-act-route.spec.ts` and `tests/e2e/gameplay-desktop.spec.ts` still use debug `engineAdvance()`/`startFromCheckpoint()` for broad route/full-flow coverage, so that coverage remains auxiliary for DoD line 49 rather than the core real-input proof. Shell `rg "__YING_ZHONG_JIU_EVENT_ENGINE__.*advance|engineAdvance|\.skip|\.only" tests/e2e` could not run because `rg` is not installed in this environment; equivalent content search found the existing debug-heavy route/full-flow specs plus existing project-gated skips.
- Added `tests/e2e/main-flow-real-input.spec.ts` as the configured compliance proof. It starts the first-act main flow from the real menu surface, then advances the opening dialogue using `page.keyboard.press('f')` on `desktop-chromium` and a real canvas `TouchEvent` on `mobile-landscape-chromium`; it only reads engine state/command index for assertions and does not call `advance()`/`engineAdvance()` for the core segment.
- GREEN targeted evidence: `npx playwright test tests/e2e/main-flow-real-input.spec.ts --project=desktop-chromium --project=mobile-landscape-chromium --workers=1` exited 0 with 2 passed / 2 skipped. Screenshots written to `.omo/evidence/f1-main-flow-real-f-input.png` and `.omo/evidence/f1-main-flow-real-mobile-input.png`.
- Static/type evidence: changed-file LSP diagnostics for `tests/e2e/main-flow-real-input.spec.ts` returned no diagnostics; content search of the new spec for `advance\(|engineAdvance|__YING_ZHONG_JIU_EVENT_ENGINE__.*advance|\.only` returned no matches; `npm run typecheck` exited 0.
- Full E2E evidence: first `npm run e2e` attempt exceeded the 20-minute harness timeout after 258/282 tests and showed an unrelated transient `proximity-scripted-movement` failure; focused rerun of that spec passed 1/1. Second full run completed with 230 passed / 51 skipped / 1 unrelated transient `death-flash-frames` failure; focused rerun of that spec passed 1/1. Final `npm run e2e` exited 0 with 231 passed / 51 skipped.

## 2026-06-08 F4 mail scoped restore
- Pre-restore scoped checks for `../mail/public/index.html` and `../mail/server.js` already returned empty output for both `git diff --shortstat` and `git status --short`, indicating the mail blocker was cleared before this handoff.
- Ran exact scoped command `GIT_MASTER=1 git restore -- ../mail/public/index.html ../mail/server.js`; post-restore mail diff/status and gateway diff/status checks returned empty output.
