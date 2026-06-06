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
