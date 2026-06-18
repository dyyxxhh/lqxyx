import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      update: (delta: number) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
      interactWithNearestDoor: () => void;
    };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      isLocked: () => boolean;
      getLockReason: () => string | null;
      unlock: () => void;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(1000);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

test.describe('Door interaction fix — F key fall-through during awaiting_proximity', () => {
  test('player can enter a room via F key while engine is in awaiting_proximity state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await startGame(page);

    // Advance through checkpoint A dialogues until the engine reaches awaiting_proximity.
    // Checkpoint A commands:
    //   1. switchCharacter (yangYunBlue) → rolePrompt lock, 2000ms wait
    //   2. dialogue "皇上不好了..." → awaiting_advance
    //   3. dialogue "大胆！但宇轩！！" → awaiting_advance
    //   4. switchCharacter (yangYunRed) → rolePrompt lock, 2000ms wait
    //   5. setFlag + task + dialogue "但宇轩...听着也很好吃呢" → awaiting_advance
    //   6. interaction proximity → awaiting_proximity
    //
    // We advance through each state manually.
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 10_000 },
      )
      .toBe('awaiting_advance');

    // Advance past dialogue 1
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(100);

    // Wait for rolePrompt lock to expire (2000ms) then advance past dialogue 2
    await page.waitForTimeout(2200);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 5_000 },
      )
      .toBe('awaiting_advance');

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(100);

    // Wait for second rolePrompt + dialogue 3
    await page.waitForTimeout(2200);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 5_000 },
      )
      .toBe('awaiting_advance');

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(100);

    // Now engine should be in awaiting_proximity (waiting for player near Dan Yuxuan in GT1 classroom)
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 5_000 },
      )
      .toBe('awaiting_proximity');

    // Verify the engine is in awaiting_proximity — this is the state that caused the deadlock.
    // Before the fix, pressing F here would be swallowed (completeInteraction returns false
    // because the player is not at the proximity target inside GT1 classroom), and the code
    // would unconditionally return, preventing enterNearestDoor() from ever being called.

    // Place the player near the GT1 front door (4f-gt1-front at rect(276, 516, 24, 128), center ~288, 580)
    // The player needs to be within DOOR_PROXIMITY (80px) of the door center.
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });

    // Press F to try entering the GT1 classroom door
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    // After the fix: the player should have entered the GT1 classroom
    // (roomId should change from null to 'gt1-classroom')
    const state = await readState(page);
    expect(state?.map.currentRoomId).toBe('gt1-classroom');
    expect(state?.map.currentFloorId).toBe('4F');

    await page.screenshot({ path: `${evidenceDir}/door-interaction-fix-entered-gt1.png` });
  });

  test('player can use elevator via F key while engine is in awaiting_proximity state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await startGame(page);

    // Advance to awaiting_proximity (same as above)
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 10_000 },
      )
      .toBe('awaiting_advance');

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());

    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
          ),
        { timeout: 5_000 },
      )
      .toBe('awaiting_proximity');

    // Place player near the 4F elevator door (4f-elevator at rect(820, 388, 24, 128), center ~832, 452)
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 800, y: 452 });
    });

    // Press F to interact with the elevator
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);

    // The elevator transition should start (elevatorTransitioning should be true briefly)
    // Then after the transition completes (~1200ms), the floor should change to 5F
    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: {
          currentFloorId: '5F',
          elevatorTransitioning: false,
        },
      });

    await page.screenshot({ path: `${evidenceDir}/door-interaction-fix-elevator-to-5f.png` });
  });
});
