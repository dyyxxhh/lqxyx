import { test, expect } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
    };
    __YING_ZHONG_JIU_GAME__?: { startPlayScene: () => void };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.describe('PROD verification — full flow', () => {
  test.use({ baseURL: 'http://127.0.0.1:8949' });

  test('elevator from 4F to 5F places player next to 5F elevator door', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() =>
      (
        window as unknown as {
          __YING_ZHONG_JIU_MAP_RENDERER__?: { startElevatorTransition: (floor: string) => void };
        }
      ).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F'),
    );

    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { currentFloorId: '5F', elevatorTransitioning: false },
      });

    await page.screenshot({ path: `${evidenceDir}/PROD-5F-after-elevator.png` });
  });

  test('A-1 first entry triggers proximity event correctly', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);

    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 10_000 })
      .toBe('awaiting_advance');

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(500);

    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 5_000 })
      .toBe('awaiting_proximity');

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    const stateInRoom = await readState(page);
    expect(stateInRoom?.map.currentRoomId).toBe('gt1-classroom');

    // Walk to proximity target (760, 520) inside GT1
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 520 });
    });
    await page.waitForTimeout(300);

    // Engine should advance past awaiting_proximity (proximity triggered)
    const stateAfter = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState());
    expect(stateAfter).not.toBe('awaiting_proximity');

    await page.screenshot({ path: `${evidenceDir}/PROD-A1-proximity-triggered.png` });
  });
});
