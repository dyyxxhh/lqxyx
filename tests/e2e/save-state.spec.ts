import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';
import { SAVE_STATE_STORAGE_KEY } from '../../src/state/saveState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test('recovers from corrupt checkpoint localStorage without crashing', async ({ page }, testInfo) => {
  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, '{not valid json');
  }, SAVE_STATE_STORAGE_KEY);

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();

  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
    save: {
      storageKey: SAVE_STATE_STORAGE_KEY,
      schemaVersion: 1,
      status: 'invalid',
      hasValidSave: false,
      invalidReason: 'corrupt-json',
      checkpointId: 'A',
      actId: 'act-1',
    },
    menu: { visible: true, selectedAction: 'new-game', hasContinue: false },
  });

  await expect.poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), SAVE_STATE_STORAGE_KEY)).toBeNull();

  await page.screenshot({
    path:
      testInfo.project.name === 'desktop-chromium'
        ? `${evidenceDir}/task-9-corrupt-save.png`
        : `${evidenceDir}/task-9-corrupt-save-${testInfo.project.name}.png`,
  });
});
