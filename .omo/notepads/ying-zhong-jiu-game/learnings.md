# Learnings: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- Plan path: `.omo/plans/ying-zhong-jiu-game.md`.
- Production sources only: `第一幕剧本.txt`, `设计/`, `最终素材/`.
- Forbidden source: do not read/copy/modify/depend on `其他/`.
- Current core asset blockers cleared: phone, phone cabinet, celery, ruler are in `最终素材/`.
- Programmatic assets approved: doors = wood-colored horizontal bars in wall positions; communication device = steel-colored interactable; office furniture = reuse `桌椅.png`.
- Five-floor left-side class doors are visible non-interactive background doors only.
- Yang Yun red/blue border is internal state only; user-facing text displays `杨云`.

## 2026-06-06 Task: T1 infrastructure
- Minimal infrastructure now uses Phaser 3 + Vite + TypeScript with strict production source under `src/`, Vitest sanity coverage, and Playwright desktop/mobile smoke scaffold.
- Vitest scaffold tests should import `src/game/scaffoldState.ts` instead of directly importing Phaser runtime modules, because Phaser initializes canvas APIs that jsdom does not provide.
- Playwright smoke tests should assert the visible canvas and exposed scene debug state, not Phaser-rendered text through DOM locators.
- Task 1 production serving script uses `serve dist --single --listen 8949` for a minimal static build surface; the later dedicated Node/pm2 server remains Task 16.

## 2026-06-06 Task 3: story manifest
- Created `src/data/story.ts` as typed first-act manifest data from `第一幕剧本.txt`; later acts are reserved metadata only.
- Story tests live in `src/data/story.test.ts` and target Vitest once T1 infrastructure/package scripts exist.
- Manifest includes first-act curtain data `下一幕` and `敬请期待`, plus task text `无` as data for later UI hiding.

## 2026-06-06 Task 2: asset manifest
- Final-asset-only inventory found 53 production assets under `最终素材/`: 8 root props/images, 5 portraits, and 40 action/body-part sprites.
- Asset manifest encodes the Qin alias split: user-facing `秦浩睿`, portrait filename `秦浩睿`, action sprite filename `秦浩瑞`.
- Current first-act supplement blocker list remains empty; doors, communication equipment, office furniture reuse, head pickups, celery variants, and ruler flash/death are encoded as approved non-missing implementations.
- `src/data/assets.ts` intentionally contains no forbidden-source path literal; the only forbidden-root literal is in `src/data/assets.test.ts` as a rejection assertion.

## 2026-06-06 Task 3: verification update
- After T1 infra landed, story tests were placed under `src/tests/story-manifest.test.ts` and `src/tests/act-boundary.test.ts` to match Vitest discovery.
- `npm run test:run -- story-manifest`, `npm run test:run -- act-boundary`, full `npm run test:run`, and `npm run typecheck` pass for the current Task 3 surface.

## 2026-06-06 Task 5: map schema
- Created `src/data/maps.ts` as a typed school map manifest for 4F/5F corridor, room areas, doors, spawn points, walkable bounds, collision placeholders, occlusion placeholders, and render-context separation metadata.
- 4F left-side corridor doors are encoded top-to-bottom as: GT2前门, GT2后门, GT1前门, GT1后门, 高一一班前门, 高一一班后门, 高一二班前门, 高一二班后门.
- 5F left-side four class doors are visible `backgroundDoor` entries with `interaction.type: "none"`, no `roomId`, and no `storyTargetId`; they must remain non-interactive for T11/T13.
- Door render metadata uses approved programmatic `doors.wallWoodBars` with wood material and horizontal-bar shape; no standalone door asset dependency was added.
- Corridor render contexts include `corridorOnly` and `sharedDoorSurface` scopes while excluding `roomOnly`; room render contexts include only `roomOnly`, preserving corridor/room render separation for T11.


## 2026-06-06 Task 4: preload and static assets
- `src/data/assetUrls.ts` maps each `assetManifest` final asset from `最终素材/` to Vite public URLs under `/assets/final/`; Phaser must preload those public URLs, never source paths.
- The 53 explicit manifest files were copied to `public/assets/final/` preserving nested names for `立绘/` and `角色动作/`; copy evidence is `.omo/evidence/task-4-asset-copy.log`.
- `window.__YING_ZHONG_JIU_SCENE_STATE__.preload` now exposes deterministic preload status, progress, queued keys, failed asset details, and `canEnterGame` for Vitest/Playwright inspection.
- Playwright success/failure smoke captures `.omo/evidence/task-4-preload-success.png` and `.omo/evidence/task-4-preload-failure.png`; manual browser QA additionally captured `task-4-manual-success.png` and `task-4-manual-failure.png`.

## 2026-06-06 Task 6: Phaser runtime shell
- Runtime shell now exposes `ready`, `menu`, `canvas`, and `sizing` under `window.__YING_ZHONG_JIU_SCENE_STATE__` while preserving `preload` debug state and the BootScene -> PreloadScene -> GameScene order.
- `GameScene` remains a minimal start/new-game shell only: visible title, start button text, and readiness hint; no first-act gameplay, input manager, story engine, or save/load was added.
- Mobile landscape FIT behavior needed CSS viewport constraints on `#app`, `#game-root`, and `canvas`; Phaser `FIT`/`CENTER_BOTH` alone did not prevent intrinsic 1280x720 overflow in Playwright mobile landscape.
- Evidence for Task 6 lives under `.omo/evidence/task-6-*`, including RED/GREEN runtime logs, scene-order JSON, mobile landscape screenshot, full Vitest/typecheck/build/e2e logs, and dev-server teardown.

## 2026-06-06 Task 6: post-review fixes
- Review found that real Phaser loader failures could be overwritten by later progress/completion events; `markPreloadProgress()` and `markPreloadComplete()` now keep `failed` terminal so GameScene remains blocked.
- Scene debug state now includes `sceneCounts` so e2e can prove BootScene, PreloadScene, and GameScene each started exactly once while keeping `sceneOrder` as first-seen order.


## 2026-06-06 Task 9: checkpoint save/load state
- Added `src/state/saveState.ts` as the deterministic localStorage checkpoint-save manager with storage key `ying-zhong-jiu.checkpoint-save.v1` and schema version `1`.
- Save state preserves checkpoint id, act id, floor, room, position/facing, controllable character, task text, story flags, branch choices, timers, inventory, pickups, and triggered event ids.
- Invalid saves return safe checkpoint A defaults and corrupted/mismatched/malformed localStorage entries are cleared instead of crashing.
- Runtime shell debug state now includes `save` and `menu.hasContinue` so future Continue-button work can detect valid saves without implementing the UI yet.
- Browser corrupt-save evidence uses Playwright `page.addInitScript` to seed invalid JSON before boot, then verifies `GameScene` readiness, `save.invalidReason = corrupt-json`, and cleared localStorage.
