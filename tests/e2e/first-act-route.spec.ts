import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      selectBranch: (id: string) => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      setPlayerPosition: (position: { x: number; y: number }) => void;
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

async function engineUpdate(page: import('@playwright/test').Page, delta: number): Promise<void> {
  await page.evaluate((d) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(d);
  }, delta);
  await page.waitForTimeout(50);
}

async function satisfyCheckpointAProximity(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('4F', 'gt1-classroom');
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 600, y: 520 });
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 520 });
  });
  await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
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
  await page.waitForTimeout(2_200);
}

test.describe('First Act — Main Route', () => {
  test('transitions from GameScene to PlayScene', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.51);

    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
      currentScene: 'PlayScene',
    });
  });

  test('checkpoint A: dialogue sequence and checkpoint save', async ({ page }) => {
    await page.goto('/');
    await startGame(page);

    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
      currentScene: 'PlayScene',
    });

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');

    const s1 = await readState(page);
    expect(s1?.ui.dialogueSpeaker).toBe('？？？');

    await engineAdvance(page);
    const s2 = await readState(page);
    expect(s2?.ui.dialogueSpeaker).toBe('杨云');

    await engineAdvance(page);
    await engineUpdate(page, 2_000);
    const s3 = await readState(page);
    expect(s3?.ui.taskText).toBe('找到但宇轩');

    await engineAdvance(page);
    await engineAdvance(page);
    await satisfyCheckpointAProximity(page);

    const sFinal = await readState(page);
    expect(sFinal?.story.currentCheckpointId).toBe('A');
    expect(sFinal?.ui.taskText).toBe('无');
  });

  test('checkpoint B: black screen engagement', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'B');

    for (let i = 0; i < 7; i++) await engineAdvance(page);

    const state = await readState(page);
    expect(state?.input.lockActive).toBe(true);
    expect(state?.input.lockReason).toBe('blackScreen');
  });

  test('checkpoint C: branch selection state', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'C');

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_branch');
  });

  test('checkpoint G: dual branch display', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'G');

    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_branch');
  });

  test('checkpoint I: ending with curtain', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await engineStart(page, 'I');
    await engineAdvance(page);
    await engineUpdate(page, 30000);
    await engineUpdate(page, 500);

    const state = await readState(page);
    expect(state?.ui.curtainVisible).toBe(true);
    expect(state?.ui.curtainTitle).toBe('下一幕');
    expect(state?.ui.curtainSubtitle).toBe('敬请期待');
  });
});
