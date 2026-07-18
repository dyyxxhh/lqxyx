// tests/e2e/forgotten-sanity-vault-door.spec.ts
// spec §10.1 vault door 全流程 E2E：精英击杀 → 钥匙掉落 → 解锁 → 免费宝箱。
//
// 注：本 spec 当前标记为 test.fixme，因为：
//   1. 远程 sandbox 未安装 Playwright 浏览器（`~/.cache/ms-playwright/` 为空）
//   2. SceneDebugState 当前未暴露 combat/inventory 子状态（plan §13 step 1 草案读取
//      `__YING_ZHONG_JIU_SCENE_STATE__.inventory.has('material.vaultKey')`）；
//      ForgottenSanityScene 也未提供 triggerEliteDefeated 调试入口。
//   启用前置条件：
//   - 安装浏览器：`npx playwright install chromium`
//   - 在 ForgottenSanityScene 中暴露 `__testTriggerEliteDefeat()` 调试钩子
//   - 在 SceneDebugState 中扩展 `forgottenSanity` 子状态（inventory/combat 摘要）
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.fixme('vault door flow: elite defeat → key drop → unlock → free chest', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // TODO(启用前补全)：进入「被遗忘的理智」对局场景后，触发精英击杀路径。
  // 当前 ForgottenSanityScene 未暴露 triggerEliteDefeated 钩子；待补充后改为：
  //   await page.evaluate(() => {
  //     const w = window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: {
  //       __testTriggerEliteDefeat?: () => void;
  //     } };
  //     w.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  //   });
  //   const hasKey = await page.evaluate(() => {
  //     const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: {
  //       forgottenSanity?: { inventory?: { has?: (id: string) => boolean } };
  //     } };
  //     return w.__YING_ZHONG_JIU_SCENE_STATE__?.forgottenSanity?.inventory?.has?.('material.vaultKey') ?? false;
  //   });
  //   expect(hasKey).toBe(true);
  expect(true).toBe(true);
});
