// tests/e2e/forgotten-sanity-elite-defeat.spec.ts
// spec §5.10 / §9.3 精英击杀 E2E：触发 handleEliteDefeated →
//   1) inventory.add('material.vaultKey', 1)
//   2) combatManager.duplicateSilentOnes(playerViewport) 复制体生成
//   3) RedEdgeFogOverlay 激活（视野 220px）
//
// 注：本 spec 当前标记为 test.fixme，因为：
//   1. 远程 sandbox 未安装 Playwright 浏览器
//   2. SceneDebugState 未暴露 forgottenSanity.combat.enemies 子状态
//   3. ForgottenSanityScene 未提供 triggerEliteDefeated 调试入口
//   启用前置条件同 forgotten-sanity-vault-door.spec.ts。
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.fixme('elite defeat triggers silent ones duplicate + red edge fog', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // TODO(启用前补全)：当前 SceneDebugState 无 forgottenSanity.combat.enemies 路径。
  // 待扩展后改为：
  //   const initialCount = await page.evaluate(() => {
  //     const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: {
  //       forgottenSanity?: { combat?: { enemies?: readonly unknown[] } };
  //     } };
  //     return w.__YING_ZHONG_JIU_SCENE_STATE__?.forgottenSanity?.combat?.enemies?.length ?? 0;
  //   });
  //   await page.evaluate(() => {
  //     const w = window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: {
  //       __testTriggerEliteDefeat?: () => void;
  //     } };
  //     w.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  //   });
  //   await page.waitForTimeout(100);
  //   const afterCount = await page.evaluate(() => {
  //     const w = window as unknown as { __YING_ZHONG_JIU_SCENE_STATE__?: {
  //       forgottenSanity?: { combat?: { enemies?: readonly unknown[] } };
  //     } };
  //     return w.__YING_ZHONG_JIU_SCENE_STATE__?.forgottenSanity?.combat?.enemies?.length ?? 0;
  //   });
  //   expect(afterCount).toBeGreaterThan(initialCount);
  expect(true).toBe(true);
});
