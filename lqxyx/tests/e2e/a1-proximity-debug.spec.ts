import { test, expect } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      getCommandIndex: () => number;
      advance: () => void;
      update: (delta: number) => void;
      loadBranchDirect: (id: string) => void;
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
    __YING_ZHONG_JIU_MAP_RENDERER__?: {
      currentFloor: string;
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

async function dumpAll(page: import('@playwright/test').Page, label: string): Promise<void> {
  const data = await page.evaluate(() => {
    const w = window as SceneWindow;
    return {
      engineState: w.__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown',
      commandIndex: w.__YING_ZHONG_JIU_EVENT_ENGINE__?.getCommandIndex() ?? -1,
      lockReason: w.__YING_ZHONG_JIU_INPUT_MANAGER__?.getLockReason() ?? null,
      isLocked: w.__YING_ZHONG_JIU_INPUT_MANAGER__?.isLocked() ?? false,
      playerPos: w.__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition() ?? null,
      mapFloor: w.__YING_ZHONG_JIU_SCENE_STATE__?.map?.currentFloorId,
      mapRoom: w.__YING_ZHONG_JIU_SCENE_STATE__?.map?.currentRoomId,
      task: w.__YING_ZHONG_JIU_SCENE_STATE__?.ui?.taskText,
      checkpoint: w.__YING_ZHONG_JIU_SCENE_STATE__?.story?.currentCheckpointId,
    };
  });
  console.log(`[${label}]`, JSON.stringify(data));
}

test.describe('A-1 proximity trigger debug', () => {
  test('reproduce A-1 first-entry failure', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log('BROWSER:', msg.type(), msg.text());
      }
    });

    await page.goto('/');
    await startGame(page);

    await dumpAll(page, 'after-start');

    // Advance through checkpoint A dialogues to reach awaiting_proximity (GT1)
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 10_000 })
      .toBe('awaiting_advance');
    await dumpAll(page, 'first-awaiting_advance');

    // Advance dialogue 1
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2300); // wait for rolePrompt
    await dumpAll(page, 'after-advance-1');

    // Advance dialogue 2
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2300); // wait for rolePrompt
    await dumpAll(page, 'after-advance-2');

    // Advance dialogue 3
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(500);
    await dumpAll(page, 'after-advance-3');

    // Now should be in awaiting_proximity for checkpoint-a-dan-yuxuan-gt1
    // Target: floorId='4F', roomId='gt1-classroom', point (760, 520), radiusPx=96

    // Move player near GT1 front door (4f-gt1-front at (276, 516, 24, 128) → center (288, 580))
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });
    await page.waitForTimeout(100);
    await dumpAll(page, 'before-pressF-at-door');

    // Press F to enter GT1
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);
    await dumpAll(page, 'after-pressF-enter-room');

    // Now player should be in gt1-classroom at spawn point (772, 144)
    // The proximity target is at (760, 520) — player needs to walk down to it
    // Let's see what state we're in

    // Move player to proximity target
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 520 });
    });
    await page.waitForTimeout(200);
    await dumpAll(page, 'after-move-to-target');

    // Should have triggered the proximity event by now
    const finalState = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState());
    console.log('FINAL ENGINE STATE:', finalState);

    // Check expected state — after proximity triggers, engine should advance to next command (checkpoint A)
    expect(finalState).not.toBe('awaiting_proximity');
  });
});
