import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      lock: (r: string) => void;
      unlock: () => void;
      setInteractContext: (a: 'F' | 'Q' | null) => void;
    };
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function dispatchTouch(
  page: import('@playwright/test').Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: Array<{ id: number; x: number; y: number }>,
  changedIds: number[],
): Promise<void> {
  await page.evaluate(
    ({ type, touches, changedIds }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;

      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;

      const allTouches: Touch[] = [];
      for (const t of touches) {
        const cx = box.left + t.x * scaleX;
        const cy = box.top + t.y * scaleY;
        allTouches.push(new Touch({
          identifier: t.id,
          target: canvas,
          clientX: cx,
          clientY: cy,
          screenX: cx,
          screenY: cy,
          pageX: cx,
          pageY: cy,
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 0.5,
        }));
      }

      const changedTouches = allTouches.filter((t) => changedIds.includes(t.identifier));

      canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: allTouches,
        changedTouches,
        targetTouches: allTouches,
      }));
    },
    { type, touches, changedIds },
  );
}

test.describe('mobile input', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
  });

  test('detects mobile device mode', async ({ page }) => {
    const state = await readSceneState(page);
    expect(state?.input.deviceMode).toBe('mobile');
  });

  test('joystick touch snaps to eight-direction movement vectors', async ({ page }) => {
    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 200, y: 600 }], [0]);
    await page.waitForTimeout(50);

    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 260, y: 570 }], [0]);
    await page.waitForTimeout(100);

    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [50] },
    ).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });

    const vector = (await readSceneState(page))?.input.movementVector;
    if (vector === undefined) {
      throw new Error('movement vector missing after analog joystick poll');
    }

    expect(vector).toEqual({ x: 1, y: -1 });

    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 280, y: 600 }], [0]);
    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [50] },
    ).toEqual({ x: 1, y: 0 });

    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 120, y: 600 }], [0]);
    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [50] },
    ).toEqual({ x: -1, y: 0 });

    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(200);

    await page.screenshot({ path: `${evidenceDir}/task-7-mobile-joystick.png` });
  });

  test('input lock prevents joystick movement', async ({ page }) => {
    await page.evaluate(() => {
      const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (mgr) mgr.lock('scriptedMovement');
    });
    await page.waitForTimeout(100);

    await dispatchTouch(page, 'touchstart', [{ id: 1, x: 200, y: 600 }], [1]);
    await dispatchTouch(page, 'touchmove', [{ id: 1, x: 280, y: 600 }], [1]);
    await page.waitForTimeout(200);

    const stateLocked = await readSceneState(page);
    expect(stateLocked?.input.lockActive).toBe(true);
    expect(stateLocked?.input.lockReason).toBe('scriptedMovement');
    expect(stateLocked?.input.movementVector).toEqual({ x: 0, y: 0 });

    await dispatchTouch(page, 'touchend', [], [1]);
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (mgr) mgr.unlock();
    });
    await page.waitForTimeout(100);

    const stateUnlocked = await readSceneState(page);
    expect(stateUnlocked?.input.lockActive).toBe(false);

    await page.screenshot({ path: `${evidenceDir}/task-7-mobile-lock.png` });
  });

  test('fullscreen prompt starts idle with landscape orientation in debug state', async ({ page }) => {
    const state = await readSceneState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    expect(state?.input.fullscreenStatus).toBe('idle');
    expect(state?.input.orientationStatus).toBe('landscape');

    await page.screenshot({ path: `${evidenceDir}/task-13-mobile-fullscreen-prompt.png` });
  });

  test('unified interaction button touch reports the active interact action', async ({ page }) => {
    await page.evaluate(() => {
      const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (mgr) mgr.setInteractContext('F');
    });

    await dispatchTouch(page, 'touchstart', [{ id: 2, x: 1080, y: 600 }], [2]);

    await expect.poll(
      () => readSceneState(page).then((s) => ({
        action: s?.input.interactAction,
        pressed: s?.input.interactPressed,
      })),
      { timeout: 2000, intervals: [15] },
    ).toEqual({ action: 'F', pressed: true });

    await dispatchTouch(page, 'touchend', [], [2]);
    await page.screenshot({ path: `${evidenceDir}/task-13-mobile-interaction-button.png` });
  });
});
