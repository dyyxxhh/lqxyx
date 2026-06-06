import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test('boots through Boot, Preload, and Game scenes once and shows the start shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    sceneOrder: ['BootScene', 'PreloadScene', 'GameScene'],
    currentScene: 'GameScene',
    ready: true,
    sceneCounts: { BootScene: 1, PreloadScene: 1, GameScene: 1 },
    menu: { visible: true, selectedAction: 'new-game' },
  });

  const state = await readSceneState(page);
  expect(state?.sceneOrder).toEqual(['BootScene', 'PreloadScene', 'GameScene']);
  expect(state?.preload?.status).toBe('complete');

  await page.screenshot({ path: `${evidenceDir}/task-6-scene-order.png` });
});

test('keeps a centered FIT canvas in mobile landscape', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
    sizing: { mode: 'FIT', autoCenter: 'CENTER_BOTH', gameWidth: 1280, gameHeight: 720 },
  });

  const fit = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(fit).not.toBeNull();
  expect(fit?.width).toBeLessThanOrEqual(fit?.viewportWidth ?? 0);
  expect(fit?.height).toBeLessThanOrEqual(fit?.viewportHeight ?? 0);
  expect(fit?.left).toBeGreaterThanOrEqual(-1);
  expect(fit?.top).toBeGreaterThanOrEqual(-1);

  const state = await readSceneState(page);
  expect(state?.canvas).toMatchObject({
    parentId: 'game-root',
    canvasWidth: 1280,
    canvasHeight: 720,
  });
  expect(state?.canvas?.displayWidth).toBeLessThanOrEqual(state?.canvas?.viewportWidth ?? 0);
  expect(state?.canvas?.displayHeight).toBeLessThanOrEqual(state?.canvas?.viewportHeight ?? 0);

  await page.screenshot({ path: `${evidenceDir}/task-6-mobile-landscape.png` });
});
