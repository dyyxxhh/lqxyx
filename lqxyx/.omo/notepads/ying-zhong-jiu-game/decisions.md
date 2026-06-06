# Decisions: ying-zhong-jiu-game

## 2026-06-06 Task: start-work
- Stack: Phaser 3 + Vite + TypeScript.
- Deploy: Node/static server + pm2 on port 8949.
- Scope: complete playable first act; later acts reserved only; ending displays `下一幕` and `敬请期待`.
- Testing: Vitest TDD for deterministic logic; Playwright E2E for browser/mobile/deploy.
- Mobile: landscape-first, fullscreen prompt, joystick, one interact key replacing F/Q.
