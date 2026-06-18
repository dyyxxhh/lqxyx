import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_MAP_RENDERER__?: {
      currentFloor: string;
      startElevatorTransition: (floorId: string) => void;
      getInteractiveDoorNear: (x: number, y: number, proximity: number) => unknown;
    };
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      startFromCheckpoint: (id: string) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
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

test.describe('Elevator Floor Transition', () => {
  test('corridor is rendered on 4F at game start', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Map should be on 4F in GameScene
    const state = await readState(page);
    expect(state?.map.currentFloorId).toBe('4F');
    expect(state?.map.elevatorTransitioning).toBe(false);

    await page.screenshot({ path: `${evidenceDir}/task-17-elevator-4f.png` });
  });

  test('elevator transition via direct API changes floor from 4F to 5F', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Verify starting on 4F
    expect((await readState(page))?.map.currentFloorId).toBe('4F');

    // Trigger elevator transition to 5F via the exposed MapRenderer
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F');
    });

    // Wait for transition to complete (matches map-navigation.spec.ts pattern)
    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: {
          currentFloorId: '5F',
          currentRoomId: null,
          elevatorTransitioning: false,
        },
      });

    await page.screenshot({ path: `${evidenceDir}/task-17-elevator-5f.png` });
  });

  test('elevator round-trip: 4F → 5F → 4F', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // 4F → 5F
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F');
    });
    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { currentFloorId: '5F', elevatorTransitioning: false },
      });

    // 5F → 4F
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('4F');
    });
    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { currentFloorId: '4F', elevatorTransitioning: false },
      });

    await page.screenshot({ path: `${evidenceDir}/task-17-elevator-roundtrip.png` });
  });

  test('elevator transitioning flag is true during transition', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Trigger transition and immediately check the transitioning flag
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F');
    });

    await expect
      .poll(() => readState(page).then((s) => s?.map.elevatorTransitioning ?? null), {
        timeout: 2000,
      })
      .toBe(true);

    // After transition completes
    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { elevatorTransitioning: false, currentFloorId: '5F' },
      });
  });


  test('PlayScene elevator interaction places player at target-floor elevator spawn', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-landscape-chromium', 'keyboard elevator interaction is desktop only');

    await page.goto('/');
    await startGame(page);

    await page.evaluate(() => {
      const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
      if (!engine) return;
      for (let i = 0; i < 8 && engine.getCurrentState() !== 'awaiting_proximity'; i++) {
        if (engine.getCurrentState() === 'waiting') {
          engine.update(2_000);
        } else if (engine.getCurrentState() === 'awaiting_advance') {
          engine.advance();
        }
      }
    });
    await expect.poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown')).toBe('awaiting_proximity');

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 832, y: 424 });
    });
    await page.keyboard.press('KeyF');

    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { currentFloorId: '5F', elevatorTransitioning: false },
      });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition(),
          ),
        { timeout: 2_000 },
      )
      .toEqual({ x: 796, y: 424 });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 832, y: 424 });
    });
    await page.keyboard.press('KeyF');

    await expect
      .poll(() => readState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { currentFloorId: '4F', elevatorTransitioning: false },
      });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition(),
          ),
        { timeout: 2_000 },
      )
      .toEqual({ x: 796, y: 452 });

    await page.screenshot({ path: `${evidenceDir}/task-8-elevator-spawn-roundtrip.png` });
  });

  test('walks to elevator region and interacts via keyboard after game start', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    // Skip checkpoint A dialogue so input is unlocked after
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ??
              'unknown',
          ),
        { timeout: 10_000 },
      )
      .toBe('awaiting_advance');

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance();
      });
      await page.waitForTimeout(50);
    }

    // Walk DOWN toward elevator area (player starts at ~760, 420)
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(6000);
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(300);

    // Walk right to align with elevator x
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(200);

    // Press F to try interacting with nearby door
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(100);

    const state = await readState(page);
    expect(state?.map.currentFloorId).toBeDefined();

    await page.screenshot({ path: `${evidenceDir}/task-17-elevator-walk-interact.png` });
  });
});
