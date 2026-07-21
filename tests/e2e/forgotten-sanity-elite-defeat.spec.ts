// tests/e2e/forgotten-sanity-elite-defeat.spec.ts
// spec §5.10 / §9.3 精英击杀 E2E：触发 handleEliteDefeated →
//   1) inventory.add('material.vaultKey', 1)
//   2) combatManager.duplicateSilentOnes(playerViewport) 复制体生成
//   3) RedEdgeFogOverlay 激活（视野 220px）
// plan 2026-07-19 Task 23：移除 test.fixme，真实化流程。
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type TestHooks = {
  __testTriggerEliteDefeat?: () => void;
  __testGetInventorySummary?: () => { items: Record<string, number>; vaultKey: number };
  __testGetCombatSummary?: () => { enemyCount: number; duplicateCount: number; farRoomCount: number };
};

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: TestHooks;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readHubActive(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ === true);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

async function navigateToRunScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
  await clickGamePoint(page, 640, 440);
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);
  await clickGamePoint(page, 1072, 56);
  await expect.poll(
    async () => (await readState(page))?.forgottenSanity?.scene,
    { timeout: 20_000 },
  ).toBe('run');
}

test('elite defeat triggers silent ones duplicate + vault key drop', async ({ page }) => {
  await navigateToRunScene(page);

  // 1. 记录初始战斗摘要
  const initial = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetCombatSummary?.(),
  );
  const initialEnemyCount = initial?.enemyCount ?? 0;
  const initialDuplicateCount = initial?.duplicateCount ?? 0;

  // 2. 触发精英击杀 → 钥匙掉落 + 复制体 ×2 + 红边雾战 + 2s 冻结
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  });
  // 等待 1 帧让 duplicateSilentOnes 同步执行 + combatManager 更新
  await page.waitForTimeout(100);

  // 3. 断言仓库钥匙已发放（spec §10.1：100% 掉落）
  const inv = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetInventorySummary?.(),
  );
  expect(inv?.vaultKey ?? 0).toBeGreaterThanOrEqual(1);

  // 4. 断言复制体已生成（spec §9.3：缄默者复制 ×2 现有数量）
  const after = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetCombatSummary?.(),
  );
  expect(after?.duplicateCount ?? 0).toBeGreaterThan(initialDuplicateCount);
  expect(after?.enemyCount ?? 0).toBeGreaterThan(initialEnemyCount);
});
