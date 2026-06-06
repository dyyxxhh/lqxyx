# Issues: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- No implementation has started yet.
- No known core missing asset blocker remains after user-added phone/cabinet/celery/ruler assets.

## 2026-06-06 Task: T1 infrastructure
- `rg` is unavailable in this environment, so forbidden-folder evidence used an explicit Python 3 literal scan over Task 1 generated app/config/test scaffold files without reading or touching `其他/`.
- Playwright Chromium was not installed after adding dependencies; `npx playwright install chromium` was required before browser smoke tests could run.

## 2026-06-06 Task 3: story manifest
- T1 infrastructure is not present in this checkout at task time: no `package.json`, no `src/` baseline, and no runnable test script. Evidence files record pending command verification.

## 2026-06-06 Task 2: asset manifest
- `npm run test:run -- asset` is currently blocked by T1 Vitest discovery: `vitest.config.ts` includes only `src/tests/**/*.test.ts`, so requested `src/data/assets.test.ts` is not discovered yet.
- Project-wide `npm run typecheck` is currently blocked by unrelated T1/T3 files: `playwright.config.ts` workers optional type, `src/data/story.test.ts` StoryCommand.visibleName, and missing `src/main.ts` side-effect import target `./styles.css`.

## 2026-06-06 Task 3: verification update
- Resolved during Task 3: T1 infrastructure became available before handoff, so pending story/act-boundary verification was rerun and passed. Evidence logs were updated in `.omo/evidence/task-3-story-manifest-test.log` and `.omo/evidence/task-3-act-boundary-test.log`.

## 2026-06-06 Task 5: map schema
- `rg` is unavailable in this environment, so forbidden-folder and 5F interaction source checks used scoped Python literal scans over `src/data/maps.ts` and `src/tests/*map*` / `src/tests/room-render-boundaries.test.ts` instead of shell `rg`; no forbidden directory was read or touched.
- Full `npm run test:run` currently has an unrelated scaffold failure in `src/tests/sanity.test.ts`: `createInitialSceneDebugState()` returns an extra `preload: null` key compared with the old expected object. Targeted Task 5 tests pass.


## 2026-06-06 Task 4: preload and static assets
- `rg` is unavailable in this environment, so forbidden-folder verification used an explicit Python scan over `src/`, `public/`, `tests/`, and `dist/` while avoiding any traversal of forbidden source directories.
- Vite build reports the existing Phaser bundle as larger than 500 kB after minification; build exits 0 and this task did not introduce code splitting.

## 2026-06-06 Task 6: runtime shell issues
- First mobile landscape e2e run failed because the canvas displayed at intrinsic 1280x720 and overflowed a 915x577 mobile viewport; fixed by constraining root/canvas CSS while retaining Phaser `FIT`/`CENTER_BOTH` config.
- Scoped forbidden-reference scan over `src/` and `tests/` still reports the existing `src/data/assets.test.ts` forbidden-root rejection assertion; production `src/` files added or changed for Task 6 do not reference the forbidden source directory.
- Vite build still reports the known Phaser bundle-size warning and exits 0; Task 6 did not change build chunking.

## 2026-06-06 Task 6: post-review resolved issues
- Resolved reviewer finding: real loader failure state is terminal and covered by `src/tests/preload.test.ts` regression `keeps failure terminal when later loader progress events arrive`.
- Resolved reviewer finding: exact-once scene start evidence now uses `sceneCounts` in runtime and e2e tests.


## 2026-06-06 Task 9: checkpoint save/load issues
- Vite build still reports the known Phaser bundle-size warning over 500 kB; build exits 0 and Task 9 did not change chunking.
- Review-work skill was loaded because Task 9 touched more than three files, but this harness exposes no compatible reviewer-spawn tools from that skill; verification was completed with local tests, typecheck, build, LSP, and Playwright evidence.
