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
