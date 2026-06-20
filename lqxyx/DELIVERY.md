# DELIVERY - 映中咎 (Ying Zhong Jiu) Production Handoff

**Project**: ying-zhong-jiu-game  
**Version**: 0.1.0  
**Date**: 2026-06-07  
**Plan Context**: `ying-zhong-jiu-production-gap-fix` Task 16 final delivery refresh  
**Playable Scope**: Act 1 only. Acts 2/3 are reserved and not playable.

---

## 1. Install

```bash
npm install
```

**Prerequisites**:
- Node.js >= 22.12.0
- npm (comes with Node.js)
- pm2 (global install: `npm install -g pm2`)
- Playwright Chromium browser (`npx playwright install chromium`) for E2E checks

Dependencies are pinned in `package.json` / `package-lock.json`:
- Runtime: `phaser@4.1.0`
- Dev: `@playwright/test@1.60.0`, `@types/node@25.9.2`, `jsdom@29.1.1`, `serve@14.2.6`, `typescript@6.0.3`, `vite@8.0.16`, `vitest@4.1.8`

---

## 2. Build

```bash
npm run build
```

This runs:
1. `tsc --noEmit` - TypeScript type checking
2. `vite build` - production bundle into `dist/`

**Current Task 16 build output**:
- `dist/index.html`
- `dist/assets/index-BLEWH3lE.js` - main Phaser/game bundle, 1,458.94 kB before gzip
- `dist/assets/index-KiTG3TeY.css`
- `dist/assets/final/` - 53 supplied first-act game assets mirrored from `public/assets/final/`
- Dist fingerprint: `sha256:dd8b59865def38da544e812336249d453aceefd7923daceb767eac6b6ab5bdce`
- Dist file count: 57 files, 12,192,292 bytes

The Vite large chunk warning for the Phaser/game bundle is still expected and acceptable when the build exits 0.

---

## 3. Test And Verification

### Type Check
```bash
npm run typecheck
```
Task 16 result: exit 0 in `.omo/evidence/task-16-full-regression.log`.

### Unit Tests
```bash
npm run test:run
```
Task 16 result: 20 files / 265 tests, all passing, exit 0 in `.omo/evidence/task-16-full-regression.log`.

### Build
```bash
npm run build
```
Task 16 result: exit 0 in `.omo/evidence/task-16-full-regression.log`; only the known large chunk warning was emitted.

### E2E
```bash
npm run e2e
```
Task 16 final result: configured Playwright suite passed with exit 0 in `.omo/evidence/task-16-full-regression.log`: 278 tests total, 229 passed / 49 skipped. The configured default suite now runs the valid release coverage for local verification: `desktop-chromium` plus `mobile-landscape-chromium`, sequentially with one worker to avoid shared dev-server flake.

`production-chromium` is intentionally included only when `E2E_PRODUCTION_URL` is set, because those tests target an already-built static deployment instead of the local Vite dev server. Use this command after PM2/static deployment is verified:

```bash
E2E_PRODUCTION_URL=http://127.0.0.1:8949 npm run e2e -- --project=production-chromium
```

---

## 4. Deploy

### PM2 Production
```bash
pm2 start ecosystem.config.cjs
```

PM2 app configuration in `ecosystem.config.cjs`:
- Name: `ying-zhong-jiu-static`
- Script: `./server/static-server.js`
- Interpreter: `node`
- Mode: fork / single instance
- Host: `0.0.0.0`
- Port: `8949`
- Restart policy: `autorestart: true`, `max_memory_restart: 512M`, `max_restarts: 5`, `restart_delay: 5000`, `min_uptime: 10s`, `kill_timeout: 5000`

Task 16 PM2 verification in `.omo/evidence/task-16-pm2-curl.log` found `ying-zhong-jiu-static` online under PM2 and `http://127.0.0.1:8949/` returning HTTP 200 with the expected production security headers.

### Manual Static Server
```bash
npm run start:prod
```

Or combine build + serve:
```bash
npm run serve:prod
```

`server/static-server.js` serves `dist/`, supports SPA fallback to `index.html`, and applies:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CSP: same-origin script/style/connect, no object embedding, no frame ancestors
- `Cache-Control: no-cache, must-revalidate` for `index.html`
- Immutable long cache for hashed/static assets
- Brotli/gzip compression for `.html`, `.css`, and `.js` when accepted by the client

Task 16 also verified the same static server safely on ephemeral port `39049` without killing the existing 8949 listener; it returned HTTP 200, CSP, DENY, nosniff, Referrer-Policy, no-cache, and brotli.

---

## 5. Evidence Index

All verification outputs live under `.omo/evidence/`. Current handoff anchors:

| File | What it captures |
|------|-----------------|
| `task-1-dialogue-f-advance.png`, `task-1-mobile-dialogue-advance.png` | Real F/Q/mobile dialogue advance surface proof |
| `task-2-proximity-scripted-move.json`, `task-2-proximity-checkpoint-a.png`, `task-2-scripted-movement.png` | Checkpoint A proximity wait and fixed scripted movement proof |
| `task-3-death-flash-celery.json`, `task-3-death-flash-celery.png` | Ordered celery/ruler-style death flash rendering and cleanup proof |
| `task-4-dist-assets.log`, `task-14-supplement-report.md` | Final supplied asset copy and supplement blocker audit |
| `task-5-principal-office-target.json`, `task-5-principal-office-target.png` | 5F principal office target and B-1 flow proof |
| `task-6-portraits.json/.png`, `task-6-story-entities.json/.png` | Portraits, corpse/head entities, and visual entity proof |
| `task-8-elevator-spawn-roundtrip.png` | Elevator transition/spawn stability proof |
| `task-13-mobile-interaction-button.png`, `task-13-mobile-fullscreen-prompt.png` | Mobile project, touch input, and fullscreen prompt proof |
| `task-14-verify-summary.md`, `task-14-verify-summary.json` | Verification pipeline PASS summary, dist hash, headers, selected E2E scope |
| `task-15-desktop-ui-polish.png`, `task-15-mobile-ui-polish.png`, `task-15-preload-failure-retry.png` | Final UI polish screenshots for desktop, mobile, and preload failure retry |
| `task-16-full-regression.log` | Task 16 typecheck, Vitest, build, and full configured `npm run e2e` exit 0 evidence |
| `task-16-e2e-fix-focused-red.log` | Reproduced rejected full-suite failures before fixes |
| `task-16-e2e-fix-focused-green.log`, `task-16-e2e-fix-gameplay-green.log` | Focused E2E post-fix proof for affected specs |
| `task-16-pm2-curl.log` | PM2 status, 8949 curl, and safe equivalent static-server curl/header verification |
| `task-16-delivery-consistency.log` | DELIVERY stale-claim and forbidden `其他/` consistency proof |

Older Task 17-20 evidence files may remain from the previous plan numbering and should not be treated as current Task 16/Future final-wave evidence.

---

## 6. Asset Status

### Supplement Blockers: NONE

Per current supplement and verification evidence:
- Final supplied assets: 53 in `public/assets/final/`, copied into `dist/assets/final/`
- First-act supplement blockers: empty
- Source mirror for supplied assets: `最终素材/`
- Production code and dist do not depend on `其他/`

### Approved Programmatic / Reuse Implementations

| Requirement | Approach |
|-------------|----------|
| `doors.wallWoodBars` | Programmatic wood-colored bars drawn in wall positions |
| `communication.steelInteractable` | Programmatic steel-colored communication device/interactable |
| `officeFurniture.reuseDeskChairs` | Reuses `桌椅.png` |
| `headPickups.characterHeadParts` | Head sprites from supplied character part assets |
| `celeryVariants.generatedFromCeleryAsset` | Black/white/large variants rendered from `芹菜（字面意思）.png` |
| `rulerFlashDeath.usesRulerAsset` | Uses `尺子（字面意思）.png` in death flash sequence |

---

## 7. Asset Replacement Procedure

For existing assets:
1. Replace the file in `public/assets/final/<name>` using the same name and extension.
2. Run `npm run build`.
3. Verify the asset appears under `dist/assets/final/`.
4. Run `npm run test:run`.

For new first-act assets:
1. Place the asset in `public/assets/final/<name>`.
2. Update `src/data/assets.ts` if the asset must be tracked or preloaded.
3. Run `npm run build`.
4. Verify `dist/assets/final/` includes the new file.
5. Run `npm run test:run` and relevant Playwright coverage.

For final source assets from `最终素材/`, copy into `public/assets/final/` before building. Do not introduce production dependencies on `其他/`.

---

## 8. Production Dependency Audit

**Result: no production dependency on `其他/`.**

Task 16 scan found `其他/` only in test negative assertions:
- `src/data/assets.test.ts` - verifies forbidden source segments are rejected
- `src/tests/deployment-static-server.test.ts` - verifies static server output does not contain `其他/`

This is recorded in `.omo/evidence/task-16-delivery-consistency.log` and matches the current rule: production assets come from `public/assets/final/` / `最终素材/`, not `其他/`.

---

## 9. Known Limitations

1. **Acts 2 and 3 are reserved, not playable.** `src/data/story.ts` marks later acts as reserved. The delivered playable scope is Act 1 and ends at the `"报假警" / 敬请期待` curtain.

2. **Production URL E2E requires an explicit deployed URL.** The default `npm run e2e` release suite covers local desktop/mobile gameplay on the Vite dev server. `production-chromium` runs only when `E2E_PRODUCTION_URL` is set, so it does not accidentally test a stale or unrelated service on port 8949.

3. **Main JS bundle is large.** The production build emits the expected Vite chunk warning for the Phaser/game bundle. The build exits 0; future acts should consider code splitting if bundle size becomes a shipping constraint.

---

## 10. Quick Reference

```bash
# Core regression
npm run typecheck
npm run test:run          # Task 16: 20 files / 265 tests passing
npm run build             # Task 16: exits 0, known large chunk warning only

# Current full configured E2E gate
npm run e2e             # Task 16: 229 passed / 49 skipped, exit 0

# Production serve
pm2 start ecosystem.config.cjs
curl -i http://127.0.0.1:8949/
```
