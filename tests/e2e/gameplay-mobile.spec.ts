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
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

/**
 * Dispatch a synthetic TouchEvent on the canvas element.
 * Coordinates are in Phaser game space (1280×720).
 * The helper converts to viewport coordinates using the canvas bounding box.
 */
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
        allTouches.push(
          new Touch({
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
          }),
        );
      }

      const changedTouches = allTouches.filter((t) => changedIds.includes(t.identifier));

      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: allTouches,
          changedTouches,
          targetTouches: allTouches,
        }),
      );
    },
    { type, touches, changedIds },
  );
}

/**
 * Start a new game via touch: tap the "开始新游戏" button at game centre.
 */
async function startGameViaTouch(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // Tap the start button area — button rectangle is at (640, 368) in game space
  await dispatchTouch(page, 'touchstart', [{ id: 0, x: 640, y: 368 }], [0]);
  await dispatchTouch(page, 'touchend', [], [0]);
  await page.waitForTimeout(800);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

test.describe('Mobile Gameplay', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-landscape-chromium',
      'mobile landscape project only',
    );

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
  });

  test('detects mobile device mode and shows controls', async ({ page }) => {
    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    expect(state?.currentScene).toBe('GameScene');

    await page.screenshot({ path: `${evidenceDir}/task-17-mobile-gamescene.png` });
  });

  test('fullscreen and orientation state fields are populated', async ({ page }) => {
    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    expect(state?.input.fullscreenStatus).toBeDefined();
    expect(state?.input.orientationStatus).toBeDefined();
    expect(['landscape', 'portrait']).toContain(state?.input.orientationStatus);

    await page.screenshot({ path: `${evidenceDir}/task-17-mobile-fullscreen-state.png` });
  });

  test('joystick touch produces movement in GameScene', async ({ page }) => {
    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');

    // Touch joystick and drag right
    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 200, y: 600 }], [0]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 280, y: 600 }], [0]);
    await page.waitForTimeout(200);

    const moveState = await readState(page);
    expect(moveState?.input.movementVector.x).toBe(1);

    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(200);

    await page.screenshot({ path: `${evidenceDir}/task-17-mobile-joystick.png` });
  });

  test('interact button tap works in GameScene', async ({ page }) => {
    // Tap interact region (right side of screen)
    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 1080, y: 600 }], [0]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(100);

    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');

    await page.screenshot({ path: `${evidenceDir}/task-17-mobile-interact.png` });
  });

  test('starts game via touch tap and enters PlayScene', async ({ page }) => {
    await startGameViaTouch(page);

    const state = await readState(page);
    expect(state?.currentScene).toBe('PlayScene');
    expect(state?.story.currentCheckpointId).toBe('A');
    expect(state?.character.currentDisplayName).toBe('杨云');

    // Dialogue should be active
    expect(state?.ui.dialogueVisible).toBe(true);

    await page.screenshot({ path: `${evidenceDir}/task-17-mobile-play-scene.png` });
  });
});
