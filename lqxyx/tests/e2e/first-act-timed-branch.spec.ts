import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_GAME__?: {
      startPlayScene: () => void;
    };
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      getPendingBranchIds: () => readonly string[];
      advance: () => void;
      selectBranch: (id: string) => void;
      update: (delta: number) => void;
      completeInteraction: (input: 'F' | 'Q') => boolean;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      setPlayerPosition: (position: { x: number; y: number }) => void;
      isScriptedMovementActive: () => boolean;
      getBranchVisualDebugState: () => { visible: boolean; labels: Array<{ text: string }> };
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    return (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown';
  });
}

async function engineStart(page: import('@playwright/test').Page, checkpointId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint(id);
  }, checkpointId);
  await engineUpdate(page, 2_000);
}

async function engineAdvance(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance();
  });
  await page.waitForTimeout(50);
}

async function engineSelectBranch(page: import('@playwright/test').Page, branchId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.selectBranch(id);
  }, branchId);
  await page.waitForTimeout(100);
}

async function engineUpdate(page: import('@playwright/test').Page, delta: number): Promise<void> {
  await page.evaluate((d) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(d);
  }, delta);
  await page.waitForTimeout(50);
}

async function moveTo(page: import('@playwright/test').Page, floorId: '4F' | '5F', roomId: string | null, position: { x: number; y: number }): Promise<void> {
  await page.evaluate(({ floorId, roomId, position }) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation(floorId, roomId);
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition(position);
  }, { floorId, roomId, position });
  await page.waitForTimeout(50);
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
}

async function startPlaySceneWithoutClearingSave(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_GAME__?.startPlayScene();
  });
  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });
}

test.describe('First Act — Timed Branch and Failure', () => {
  test('checkpoint C starts out of camera view without prematurely showing branch options', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({
        schemaVersion: 1,
        checkpointId: 'C',
        actId: 'act-1',
        floorId: '4F',
        roomId: 'gt1-classroom',
        position: { x: 760, y: 940, facing: 'up' },
        controllableCharacterId: 'yangYunBlue',
        task: '无',
        storyFlags: { communicationDisabled: false, danYuxuanStandingVisible: false, danYuxuanBodyProneAndBloody: true },
        branchChoices: {},
        timers: {},
        inventory: [],
        pickups: {},
        triggeredEvents: [],
      }));
    }, 'ying-zhong-jiu.checkpoint-save.v1');

    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_view');
    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getBranchVisualDebugState().visible;
    })).toBe(false);

    await moveTo(page, '4F', 'gt1-classroom', { x: 760, y: 520 });
    await engineUpdate(page, 500);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_branch');
    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getPendingBranchIds();
    })).toEqual(['A-1']);
  });

  test('checkpoint C A-2 timeout waits for GT2 before Qin scripted movement', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript((key) => {
      window.localStorage.setItem(key, JSON.stringify({
        schemaVersion: 1,
        checkpointId: 'C',
        actId: 'act-1',
        floorId: '4F',
        roomId: 'gt1-classroom',
        position: { x: 760, y: 520, facing: 'up' },
        controllableCharacterId: 'yangYunBlue',
        task: '无',
        storyFlags: { communicationDisabled: false, danYuxuanStandingVisible: false, danYuxuanBodyProneAndBloody: true },
        branchChoices: {},
        timers: {},
        inventory: [],
        pickups: {},
        triggeredEvents: [],
      }));
    }, 'ying-zhong-jiu.checkpoint-save.v1');

    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);
    await moveTo(page, '4F', 'gt1-classroom', { x: 760, y: 520 });
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_branch');

    await engineUpdate(page, 10_000);

    for (let i = 0; i < 50; i++) {
      const state = await getEngineState(page);
      if (state === 'awaiting_advance') {
        await engineAdvance(page);
        continue;
      }
      if (state === 'waiting') {
        await engineUpdate(page, 2_000);
        continue;
      }
      break;
    }

    // Complete back door F interaction
    await moveTo(page, '4F', null, { x: 288, y: 324 });
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F');
    });

    // Advance past "滚去前门" dialogue
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await engineAdvance(page);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');
    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isScriptedMovementActive?.() ?? false;
    })).toBe(false);

    await moveTo(page, '4F', 'gt1-classroom', { x: 700, y: 220 });
    await moveTo(page, '4F', 'gt1-classroom', { x: 760, y: 220 });
    await engineUpdate(page, 16);
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');

    await moveTo(page, '4F', 'gt2-classroom', { x: 700, y: 220 });
    await moveTo(page, '4F', 'gt2-classroom', { x: 760, y: 220 });
    await engineUpdate(page, 16);
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).not.toBe('awaiting_proximity');
  });

  test('branch B-1 leads to ending split-in-two', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'G');
    await engineSelectBranch(page, 'B-1');
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_interaction');
    await moveTo(page, '5F', null, { x: 288, y: 2012 });
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F');
    });

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
  });

  test('timer at checkpoint H displays countdown in UI', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'H');
    await engineUpdate(page, 500);
    await engineUpdate(page, 2_000);

    const state = await readState(page);
    expect(state?.ui.timerVisible).toBe(true);
  });

  test('checkpoint H survival timer triggers after 120s', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'H');
    await engineUpdate(page, 500);
    await engineUpdate(page, 2_000);

    await engineUpdate(page, 120000);
    await page.waitForTimeout(200);

    const state = await readState(page);
    expect(state?.input.lockActive).toBe(true);
    expect(state?.input.lockReason).toBe('ending');
  });

  test('checkpoint I 30s survival countdown ends with curtain', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'I');
    await engineAdvance(page);
    await engineUpdate(page, 30000);
    await engineUpdate(page, 500);

    const state = await readState(page);
    expect(state?.ui.curtainVisible).toBe(true);
    expect(state?.story.currentEndingId).toBe('survival-false-report');
  });
});
