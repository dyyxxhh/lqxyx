# Decisions: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- Stack: Phaser 3 + Vite + TypeScript.
- Deploy: Node/static server + pm2 on port 8949.
- Scope: complete playable first act; later acts reserved only; ending displays `下一幕` and `敬请期待`.
- Testing: Vitest TDD for deterministic logic; Playwright E2E for browser/mobile/deploy.
- Mobile: landscape-first, fullscreen prompt, joystick, one interact key replacing F/Q.

## 2026-06-06 Task 5: map schema
- Coordinates are near-1:1 typed placeholders in design-pixel units; T11 should tune exact Phaser drawing/collision against the corridor design image without changing the door identity/order contract.
- 5F right side deliberately has only the communication-control back door plus elevator; no 5F office front door exists in the schema.
- Room IDs chosen for downstream consumers: `gt2-classroom`, `gt1-classroom`, `class-1-1`, `class-1-2`, `office-4f`, and `communication-control-5f`.

## 2026-06-06 Task 6: runtime shell decisions
- Keep `scene: [BootScene, PreloadScene, GameScene]` with Boot as the only auto-started Phaser scene; Preload and Game are entered only through scene transitions.
- Use deterministic debug state, not DOM text queries, as the test contract for Phaser-rendered menu/start-shell state.
- Keep fixed 1280x720 game coordinates and use Phaser `FIT`/`CENTER_BOTH` plus viewport CSS constraints for desktop/mobile landscape scaling.

## 2026-06-06 Task 6: post-review decisions
- Treat preload `failed` as terminal at the pure state-helper level rather than only inside `PreloadScene.create()`, because loader event order can otherwise mask failures.
- Preserve unique `sceneOrder` for readable order assertions and add `sceneCounts` for exact-once assertions instead of changing `sceneOrder` to include duplicates.


## 2026-06-06 Task 9: checkpoint save/load decisions
- Use a single localStorage-backed save slot for Task 9; multiple slots and migration chains remain out of scope.
- Version mismatch is treated as invalid and reset to default state instead of migrated because no previous shipped schema exists yet.
- Keep save integration debug-only in `scaffoldState.ts`; no Continue button or first-act gameplay restoration UI was added.

## 2026-06-06 Task 16: production deployment decisions
- Keep deployment dependency-free with the built-in Node `http` server instead of adding Docker, Nginx, Vite preview, or another static serving package.
- Default the production host/port to `127.0.0.1:8949`, while allowing simple `HOST`, `PORT`, or CLI port override for direct local smoke checks.

## 2026-06-06 Task 14: supplement blocker gate decisions
- Keep missing supplement blockers as explicit `BLOCKER_FOR_FINAL_ART` metadata, separate from final supplied assets and approved implementations.
- Generate the Task 14 supplement report from manifest data through a small dependency-free Node TypeScript script so T20 can cite deterministic output.
