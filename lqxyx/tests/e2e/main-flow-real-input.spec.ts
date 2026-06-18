import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      getCommandIndex: () => number;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readEngine(page: import('@playwright/test').Page): Promise<{ state: string; commandIndex: number }> {
  return page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    return {
      state: engine?.getCurrentState() ?? 'unknown',
      commandIndex: engine?.getCommandIndex() ?? -1,
    };
  });
}

async function clickStartButton(page: import('@playwright/test').Page): Promise<void> {
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
    story: { currentCheckpointId: 'A' },
  });
  await page.waitForTimeout(2_200);
  await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
    state: 'awaiting_advance',
  });
}

async function dispatchGameTouch(
  page: import('@playwright/test').Page,
  type: 'touchstart' | 'touchend',
  touch: { id: number; x: number; y: number } | null,
): Promise<void> {
  await page.evaluate(
    ({ type, touch }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const box = canvas.getBoundingClientRect();
      const touches = touch
        ? [
            new Touch({
              identifier: touch.id,
              target: canvas,
              clientX: box.left + touch.x * (box.width / 1280),
              clientY: box.top + touch.y * (box.height / 720),
              screenX: box.left + touch.x * (box.width / 1280),
              screenY: box.top + touch.y * (box.height / 720),
              pageX: box.left + touch.x * (box.width / 1280),
              pageY: box.top + touch.y * (box.height / 720),
              radiusX: 1,
              radiusY: 1,
              rotationAngle: 0,
              force: 0.5,
            }),
          ]
        : [];

      canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches,
        changedTouches: touches,
        targetTouches: touches,
      }));
    },
    { type, touch },
  );
}

test.describe('First Act main flow real input compliance', () => {
  test('desktop main flow advances opening dialogue with real F key, not debug advance', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await clickStartButton(page);

    const firstDialogue = await readState(page);
    const engineBefore = await readEngine(page);
    expect(firstDialogue?.ui.dialogueSpeaker).toBe('？？？');
    expect(firstDialogue?.ui.dialogueVisible).toBe(true);
    expect(engineBefore.state).toBe('awaiting_advance');

    await page.keyboard.press('f');

    await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
      commandIndex: engineBefore.commandIndex + 1,
    });
    const secondDialogue = await readState(page);
    expect(secondDialogue?.ui.dialogueSpeaker).toBe('杨云');
    expect(secondDialogue?.input.lockActive).toBe(true);
    expect(secondDialogue?.input.lockReason).toBe('dialogue');

    await page.screenshot({ path: `${evidenceDir}/f1-main-flow-real-f-input.png` });
  });

  test('mobile main flow advances opening dialogue with real touch interaction, not debug advance', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await clickStartButton(page);

    const firstDialogue = await readState(page);
    const engineBefore = await readEngine(page);
    expect(firstDialogue?.ui.dialogueSpeaker).toBe('？？？');
    expect(firstDialogue?.ui.dialogueVisible).toBe(true);
    expect(engineBefore.state).toBe('awaiting_advance');

    await dispatchGameTouch(page, 'touchstart', { id: 1, x: 1080, y: 600 });
    await dispatchGameTouch(page, 'touchend', null);

    await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
      commandIndex: engineBefore.commandIndex + 1,
    });
    const secondDialogue = await readState(page);
    expect(secondDialogue?.ui.dialogueSpeaker).toBe('杨云');
    expect(secondDialogue?.input.lockActive).toBe(true);
    expect(secondDialogue?.input.lockReason).toBe('dialogue');

    await page.screenshot({ path: `${evidenceDir}/f1-main-flow-real-mobile-input.png` });
  });
});
