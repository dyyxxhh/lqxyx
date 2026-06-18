import { expect, test } from '@playwright/test';

import { schoolMaps } from '../../src/data/maps';
import { firstActBranches } from '../../src/data/story';
import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_MAP_RENDERER__?: {
      renderCorridor(floorId: string): void;
    };
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      selectBranch: (id: string) => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
      completeInteraction: (input: 'F' | 'Q') => boolean;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
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
  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });
}

async function engineUpdate(page: import('@playwright/test').Page, delta: number): Promise<void> {
  await page.evaluate((d) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(d);
  }, delta);
  await page.waitForTimeout(50);
}

async function engineAdvance(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance();
  });
  await page.waitForTimeout(50);
}

test.describe('Task 5 principal office target', () => {
  test('B-1 target resolves to the real 5F principal office door and ending flow', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    const principalDoor = schoolMaps.floors['5F'].corridor.doors.find(
      (door) => door.id === 'principals-office-front-5f',
    );
    const b1Interaction = firstActBranches
      .find((branch) => branch.id === 'B-1')
      ?.commands.find((command) => command.type === 'interaction');

    expect(principalDoor).toBeDefined();
    expect(b1Interaction).toEqual(expect.objectContaining({ target: '五楼校长办公室门口' }));
    expect(principalDoor?.storyTargetId).toBe(b1Interaction?.target);

    await page.evaluate(({ x, y }) => {
      const win = window as SceneWindow;
      win.__YING_ZHONG_JIU_MAP_RENDERER__?.renderCorridor('5F');
      win.__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('5F', null);
      win.__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x, y });
    }, {
      x: principalDoor!.bounds.x + principalDoor!.bounds.width / 2,
      y: principalDoor!.bounds.y + principalDoor!.bounds.height / 2,
    });

    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentFloorId: '5F', currentRoomId: null },
    });

    await page.evaluate(({ x, y }) => {
      const win = window as SceneWindow;
      win.__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('G');
      win.__YING_ZHONG_JIU_EVENT_ENGINE__?.selectBranch('B-1');
      win.__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('5F', null);
      win.__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x, y });
    }, { x: 288, y: 2012 });
    await expect.poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState())).toBe('awaiting_interaction');
    await expect(page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F'))).resolves.toBe(true);
    await engineUpdate(page, 500);
    await engineUpdate(page, 500);
    await engineUpdate(page, 500);
    await engineAdvance(page);
    await engineUpdate(page, 3000);
    await engineAdvance(page);
    await engineUpdate(page, 1000);
    await engineUpdate(page, 3000);
    await engineUpdate(page, 1000);

    const state = await readState(page);
    expect(state?.story.currentEndingId).toBe('split-in-two');
    expect(state?.story.currentCheckpointId).toBe('G');

    await page.screenshot({ path: `${evidenceDir}/task-5-principal-office-target.png` });
  });
});
