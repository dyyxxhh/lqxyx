import { expect, test } from '@playwright/test';
const evidenceDir = '.omo/evidence';

test('preloads required first-act assets before entering GameScene', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.preload?.status ?? null), { timeout: 30_000 })
    .toBe('complete');

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.currentScene ?? null), { timeout: 30_000 })
    .toBe('GameScene');

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.preload?.total ?? 0))
    .toBe(53);

  const assetRequestCount = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/assets/final/')).length,
  );
  expect(assetRequestCount).toBeGreaterThanOrEqual(53);

  await page.screenshot({
    path:
      testInfo.project.name === 'desktop-chromium'
        ? `${evidenceDir}/task-4-preload-success.png`
        : `${evidenceDir}/task-4-preload-success-${testInfo.project.name}.png`,
  });
});

test('shows a visible preload failure state when a required asset fails', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'production-chromium', 'forced preload failure query is disabled in production builds');

  await page.goto('/?preloadFailAsset=floor.tile');
  await expect(page.locator('canvas')).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.preload?.status ?? null))
    .toBe('failed');

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.preload?.failedAsset?.key ?? null))
    .toBe('floor.tile');

  await expect
    .poll(() => page.evaluate(() => (window as Window & typeof globalThis & { __YING_ZHONG_JIU_SCENE_STATE__?: import('../../src/game/scaffoldState').SceneDebugState }).__YING_ZHONG_JIU_SCENE_STATE__?.currentScene ?? null))
    .toBe('PreloadScene');

  await page.screenshot({
    path:
      testInfo.project.name === 'desktop-chromium'
        ? `${evidenceDir}/task-4-preload-failure.png`
        : `${evidenceDir}/task-4-preload-failure-${testInfo.project.name}.png`,
  });
});
