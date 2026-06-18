import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
      completeInteraction: (input: 'F' | 'Q') => boolean;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      setPlayerPosition: (position: { x: number; y: number }) => void;
      interactWithNearestDoor: () => boolean;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
}

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({ currentScene: 'GameScene', ready: true });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });
  await expect.poll(() => getEngineState(page), { timeout: 10_000 }).toBe('awaiting_advance');
}

test.describe('physical target validation', () => {
  test('office phone F interaction only completes near the office phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await startGame(page);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('F'));
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_interaction');

    const wrongLocationResult = await page.evaluate(() => {
      const win = window as SceneWindow;
      win.__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('4F', null);
      return win.__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F') ?? null;
    });
    expect(wrongLocationResult).toBe(false);
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_interaction');

    await page.evaluate(() => {
      const debug = (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__;
      debug?.setPlayerPosition({ x: 832, y: 868 });
      debug?.interactWithNearestDoor();
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('4F', 'office-4f');
      debug?.setPlayerPosition({ x: 620, y: 180 });
    });
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({ map: { currentRoomId: 'office-4f' } });

    const correctLocationResult = await page.evaluate(() => (
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F') ?? null
    ));
    expect(correctLocationResult).toBe(true);
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
  });
});
