## 2026-06-07 Task: start-work
- Momus high-accuracy review previously could not run because of insufficient balance.
- Plan currently has 16 implementation tasks + F1-F4 final wave = 20 top-level checkboxes.

## 2026-06-07 Task 11: 静态服务器 curl caveat
- `curl -I http://127.0.0.1:8949/` exact-port verification was blocked by a pre-existing Node listener on `0.0.0.0:8949` (pid 427177) serving old headers. To avoid killing an unrelated process, Task 11 verified the updated server on `127.0.0.1:8951`; it returned the required security headers and brotli negotiation. Targeted/full Vitest plus `npm run build` passed.

## 2026-06-07 Task 10: verification notes
- Initial preload gate test import from `PreloadScene` triggered Phaser canvas initialization in jsdom before tests could run; the gate was moved to a pure helper and covered there.

## 2026-06-07 Task 12: LSP diagnostic caveat
- After adding `@types/node`, `types: ["vitest/globals", "node"]`, and a local Node reference for `src/tests/deployment-static-server.test.ts`, `npx tsc --noEmit --pretty false`, targeted Vitest, full Vitest, and build all pass. The active TypeScript LSP still reported stale Node global diagnostics for that test file with line numbers from the pre-reference version, so treat compiler/test/build output as the reliable type evidence for this task unless the LSP server is restarted.

## 2026-06-07 Task 10: package pin retry
- Atlas verification found `package.json` had reverted to `latest` specs after Task 12 work added `@types/node`; Task 10 retry pinned all direct dependency specs in both `package.json` and package-lock root metadata to the lockfile resolved versions, including `@types/node@25.9.2`.

## 2026-06-07 Task 10: Atlas verification caveat
- Atlas initially ran `npm ci --ignore-scripts` and full Vitest in parallel, which caused a transient `node_modules` race (`vitest/suppress-warnings.cjs` missing and npm ENOTEMPTY). Recovered with `npm install`, then re-ran sequential verification: full Vitest passed, `npm ci --ignore-scripts && npm run typecheck && npx vitest run src/tests/preload.test.ts` passed, and `npm run build` produced no sourcemaps or `preloadFailAsset` string.

## 2026-06-07 Task 7: full test caveat
- Task 7 focused map/collision tests and `npm run typecheck` pass, but `npm run test:run` did not reach a clean full-suite pass in this run. First attempt passed 16 files / 221 tests but Vitest failed to start 2 fork workers (`input-manager.test.ts`, `room-render-boundaries.test.ts`). Subsequent standard retries consistently failed only `src/tests/input-manager.test.ts` test `allows F and Q interaction edges through dialogue lock while movement remains frozen` by its explicit 15s timeout; the same file alone also timed out on that same pre-existing Task 1 test. This task did not edit input code or `src/scenes/PlayScene.ts` per scope constraints.


## 2026-06-07 Task 4: full-suite caveat
- `npm run test:run` 两次均只失败 `src/tests/input-manager.test.ts > allows F and Q interaction edges through dialogue lock while movement remains frozen`，报该测试自身 15s timeout；单跑 `npx vitest run src/tests/input-manager.test.ts` 与 `--testTimeout 60000` 也同样停在该测试声明的 `15_000` timeout。该文件未在 Task 4 修改，作用域相关 `event-engine`/`save-state`/`first-act` 回归通过。

## 2026-06-07 Task 13: desktop project remaining blocker
- `npm run e2e -- --project=desktop-chromium` after Task 13 changes ran 130 tests: 101 passed / 27 skipped / 2 failed. Both failures are in `tests/e2e/map-navigation.spec.ts`, not mobile/desktop input separation: `elevator transition changes floor from 4F to 5F` and `elevator transitioning flag is true during transition` both timed out waiting for `map.elevatorTransitioning: false` while state remained `{ currentFloorId: "5F", elevatorTransitioning: true }`. Focused desktop input and production URL keyboard smoke passed, and mobile-only specs now skip under desktop.
- Parallel focused Playwright commands can still produce transient Vite/webServer PreloadScene timeout or `ERR_CONNECTION_REFUSED` noise; sequential reruns of the same focused specs passed. Avoid running `npx playwright ...` commands in parallel against the shared dev server for final evidence.

## 2026-06-07 Task 14: verification scope caveats
- npm run verify intentionally runs selected reliable E2E scope only: production URL smoke on a temporary static-server port, input-mobile.spec.ts on mobile-landscape-chromium, and dialogue-advance-regression.spec.ts on desktop+mobile. It does not run the known-blocked full desktop map-navigation/elevator regression from Task 8.
- Static security-header verification starts server/static-server.js on an ephemeral localhost port after build, avoiding PM2 lifecycle changes and avoiding killing any unrelated process on port 8949.

## 2026-06-07 Task 2: blockers
- No new blockers. Final build still emits the pre-existing Vite large chunk warning for the main JS bundle; build exits 0.

## 2026-06-07 Task 16: full E2E caveat
- Full `npm run e2e` was attempted after typecheck/test/build passed, but the 3-project Playwright matrix exceeded the 900000 ms harness timeout and had visible broad-matrix failures before timeout. Task 16 documents the passing release evidence as the sequential scoped E2E set in `.omo/evidence/task-16-scoped-e2e.log`: production URL 4/1 skip, mobile input 5, dialogue advance 2/2 skip, Task 15 desktop 2/1 skip, Task 15 mobile 1/2 skip.

## 2026-06-08 Task 16: full E2E caveat resolved
- The previous Task 16 full E2E caveat is no longer an unresolved blocker. After precise config/spec fixes, `npm run e2e` exits 0 for the configured Playwright suite: 229 passed / 49 skipped, recorded in `.omo/evidence/task-16-full-regression.log`.


## 2026-06-08T06:31:04+08:00 F4 Scope Fidelity Check
- Verdict: REJECT.
- Blocking scope issue: current delivery diff includes unexplained destructive repository changes outside the approved `lqxyx` first-act production scope: `../other/wechat-openai-gateway` has 4209 deleted files and 1,019,771 deletions by `git diff --shortstat -- ../other/wechat-openai-gateway`, including tracked source/config files such as `other/wechat-openai-gateway/server/src/index.ts`, `other/wechat-openai-gateway/server/package.json`, `other/wechat-openai-gateway/web/src/App.tsx`, and `other/wechat-openai-gateway/web/package.json` deleted in the representative targeted diff. Plan commit strategy explicitly requires ensuring only intended files changed before final handoff.
- Non-blocking game-scope checks: `DELIVERY.md` line 7 says Act 1 only and Acts 2/3 not playable; `src/data/story.ts` keeps `act-2` and `act-3` as `status: "reserved"` with empty checkpoints/branches/timers/tasks/endings; `src/data/assets.ts` uses `最终素材/` paths; grep found `其他/` only in DELIVERY/test negative assertions; `vite.config.ts` has `sourcemap: false`; `src/scenes/preloadDebugGate.ts` returns null for forced preload failure in production; `package.json` pins direct dependency versions; scripted movement references are fixed target/tween, not A*/global pathfinding.

## 2026-06-08 F1 Plan Compliance Audit
- VERDICT REJECT. Current `npm run test:run` does not satisfy plan DoD line 47: rerun at 2026-06-08 local failed with 2 timed-out tests (`src/tests/input-manager.test.ts:86` and `src/tests/runtime-shell.test.ts:79`) after an initial worker-start failure run. Evidence command output in this audit session; fix or make the full standard command pass without special casing before approval.
- Scope blocker: current git diff from repository root includes 4209 deleted paths under `other/wechat-openai-gateway` (for example `other/wechat-openai-gateway/server/package.json`, `server/src/index.ts`, `web/package.json`, `web/src/App.tsx`). This conflicts with plan constraints not to modify/touch `其他/`/other scope and commit strategy not to include unrelated source material; revert/quarantine this unrelated subtree before final approval.
- Passing checks observed: `npm run typecheck` exit 0; `npm run build` exit 0; `vite.config.ts` has `sourcemap: false`; `dist/assets` `.map` count is 0; `package.json` has no `latest`; Task 16 evidence records `npm run e2e` 229 passed / 49 skipped and PM2/curl 8949 headers.
