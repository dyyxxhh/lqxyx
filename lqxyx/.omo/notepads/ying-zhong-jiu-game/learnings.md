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
