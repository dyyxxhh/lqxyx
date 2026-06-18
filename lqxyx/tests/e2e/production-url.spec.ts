import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.describe('Production URL — Port 8949 Smoke', () => {
  test('canvas is visible and GameScene booted', async ({ page }) => {
    await page.goto('/');

    // Canvas should render
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // Game should boot through Boot, Preload, and Game scenes
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      sceneOrder: ['BootScene', 'PreloadScene', 'GameScene'],
      currentScene: 'GameScene',
      ready: true,
      menu: { visible: true, selectedAction: 'new-game' },
    });

    await page.screenshot({ path: `${evidenceDir}/task-17-prod-url-gamescene.png` });
  });

  test('preload completes successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
      preload: { status: 'complete' },
    });

    const state = await readState(page);
    expect(state?.preload?.status).toBe('complete');
    expect(state?.preload?.canEnterGame).toBe(true);
  });

  test('basic keyboard control produces debug state change', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Test keyboard movement in GameScene (no dialogue lock yet)
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(300);

    const moveState = await readState(page);
    expect(moveState?.input.movementVector.x).toBe(1);

    await page.keyboard.up('KeyD');
    await page.waitForTimeout(300);

    const idleState = await readState(page);
    expect(idleState?.input.movementVector).toEqual({ x: 0, y: 0 });

    await page.screenshot({ path: `${evidenceDir}/task-17-prod-url-movement.png` });
  });

  test('scene state API accessible via window', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Verify the debug state contract is accessible and populated
    const state = await readState(page);
    expect(state).toHaveProperty('sceneOrder');
    expect(state).toHaveProperty('currentScene');
    expect(state).toHaveProperty('ready');
    expect(state).toHaveProperty('input');
    expect(state).toHaveProperty('ui');
    expect(state).toHaveProperty('story');
    expect(state).toHaveProperty('save');
    expect(state).toHaveProperty('map');
  });

  test('SERP routes populate with valid content', async ({ page }) => {
    // Test that the SPA fallback serves index.html for any path
    const response = await page.goto('/some-random-path');
    expect(response?.status()).toBe(200);

    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
  });
});
