import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
      isScriptedMovementActive: () => boolean;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
}

async function advanceUntilProximity(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    if (!engine) return;
    engine.startFromCheckpoint('A');
    for (let i = 0; i < 10 && engine.getCurrentState() !== 'awaiting_proximity'; i++) {
      if (engine.getCurrentState() === 'waiting') {
        engine.update(2_000);
      } else if (engine.getCurrentState() === 'awaiting_advance') {
        engine.advance();
      }
    }
  });
}

async function getPlayerPosition(page: import('@playwright/test').Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition() ?? { x: NaN, y: NaN });
}

async function setLocation(page: import('@playwright/test').Page, floorId: '4F' | '5F', roomId: string | null): Promise<void> {
  await page.evaluate(({ floorId, roomId }) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation(floorId, roomId);
  }, { floorId, roomId });
}

async function setPlayerPosition(page: import('@playwright/test').Page, position: { x: number; y: number }): Promise<void> {
  await page.evaluate((position) => {
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition(position);
  }, position);
}

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
  await expect.poll(() => getEngineState(page), { timeout: 10_000 }).toBe('awaiting_advance');
}

test.describe('proximity and scripted movement surface', () => {
  test('checkpoint A proximity only reveals Dan dialogue in the 4F GT1 classroom', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await startGame(page);

    await advanceUntilProximity(page);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');

    await setLocation(page, '4F', null);
    await setPlayerPosition(page, { x: 600, y: 520 });
    await setPlayerPosition(page, { x: 760, y: 520 });
    await page.waitForTimeout(100);

    const corridorState = await readState(page);
    expect(corridorState?.ui.dialogueText).not.toBe('我要搓手。');
    expect(await getEngineState(page)).toBe('awaiting_proximity');

    await setLocation(page, '4F', 'gt2-classroom');
    await setPlayerPosition(page, { x: 600, y: 520 });
    await setPlayerPosition(page, { x: 760, y: 520 });
    await page.waitForTimeout(100);

    const gt2State = await readState(page);
    expect(gt2State?.ui.dialogueText).not.toBe('我要搓手。');
    expect(await getEngineState(page)).toBe('awaiting_proximity');

    await setLocation(page, '4F', 'gt1-classroom');
    await setPlayerPosition(page, { x: 600, y: 520 });
    await setPlayerPosition(page, { x: 760, y: 520 });

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    const gt1State = await readState(page);
    expect(gt1State?.ui.dialogueText).toBe('我要搓手。');

    await page.screenshot({ path: testInfo.outputPath('checkpoint-a-location-gated-proximity.png') });
  });

  test('checkpoint A proximity waits for real player movement, and checkpoint E uses fixed tween', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await startGame(page);

    await advanceUntilProximity(page);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');
    const beforeProximity = await readState(page);
    expect(beforeProximity?.ui.dialogueText).not.toBe('我要搓手。');
    expect(beforeProximity?.input.lockActive).toBe(false);

    await setLocation(page, '4F', 'gt1-classroom');
    await setPlayerPosition(page, { x: 760, y: 420 });
    await setPlayerPosition(page, { x: 760, y: 520 });

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    const afterProximity = await readState(page);
    const afterProximityPosition = await getPlayerPosition(page);
    expect(afterProximity?.ui.dialogueText).toBe('我要搓手。');
    expect(afterProximityPosition).toEqual({ x: 760, y: 520 });
    await page.screenshot({ path: testInfo.outputPath('task-2-proximity-checkpoint-a.png') });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('E');
    });

    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isScriptedMovementActive() ?? false),
      { timeout: 5_000 },
    ).toBe(true);
    await page.keyboard.down('d');
    await page.waitForTimeout(100);
    const duringMoveState = await readState(page);
    expect(duringMoveState?.input.lockActive).toBe(true);
    expect(duringMoveState?.input.lockReason).toBe('scriptedMovement');
    expect(duringMoveState?.input.movementVector).toEqual({ x: 0, y: 0 });
    await page.keyboard.up('d');
    const duringMove = await getPlayerPosition(page);
    expect(Number.isFinite(duringMove.x)).toBe(true);
    expect(Number.isFinite(duringMove.y)).toBe(true);

    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isScriptedMovementActive() ?? false),
      { timeout: 5_000 },
    ).toBe(false);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    const afterMove = await getPlayerPosition(page);
    const target = { x: 760, y: 330 };
    const distance = Math.hypot(afterMove.x - target.x, afterMove.y - target.y);
    expect(distance).toBeLessThanOrEqual(16);
    const afterMoveState = await readState(page);
    expect(afterMoveState?.input.lockReason).toBe('dialogue');

    await page.screenshot({ path: testInfo.outputPath('task-2-scripted-movement.png') });
  });
});
