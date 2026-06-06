import { expect, test } from '@playwright/test';

test('boots through Boot, Preload, and Game scenes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => window.__YING_ZHONG_JIU_SCENE_STATE__?.sceneOrder ?? [])
    )
    .toEqual(['BootScene', 'PreloadScene', 'GameScene']);
});
