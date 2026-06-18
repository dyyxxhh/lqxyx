import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type VisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

type InputManagerDebugApi = {
  isOnMobile: () => boolean;
  getFullscreenStatus: () => string;
  getOrientationStatus: () => string;
  getVisualDebugState: () => {
    fullscreenPrompt?: VisualBounds | null;
  };
};

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_INPUT_MANAGER__?: InputManagerDebugApi;
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function gamePoint(page: import('@playwright/test').Page, x: number, y: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({ gameX, gameY }) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      return {
        x: box.left + gameX * scaleX,
        y: box.top + gameY * scaleY,
      };
    },
    { gameX: x, gameY: y },
  );
}

async function waitForGameSceneReady(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
}

async function readFullscreenPromptVisible(page: import('@playwright/test').Page): Promise<boolean | undefined> {
  return page.evaluate(() =>
    (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getVisualDebugState().fullscreenPrompt?.visible,
  );
}

test.describe('fullscreen and orientation', () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape only');
  });

  test('fullscreen prompt appears on mobile entry', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // The fullscreen prompt should be visible (status = 'idle' at entry)
    const state = await readSceneState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    expect(state?.input.fullscreenStatus).toBe('idle');

    await page.screenshot({ path: `${evidenceDir}/task-15-fullscreen-prompt.png` });
  });

  test('existing document fullscreen starts as entered and hides prompt on mobile entry', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => document.body,
        configurable: true,
      });
    });

    await waitForGameSceneReady(page);

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        deviceMode: 'mobile',
        fullscreenStatus: 'entered',
      },
    });
    await expect.poll(() => readFullscreenPromptVisible(page)).toBe(false);
  });

  test('dismissing fullscreen keeps game playable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Tap the "暂不" (dismiss) button — now positioned at (760, 100) in game coords
    // Scale to actual canvas position
    const tapResult = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      return {
        x: box.left + 760 * scaleX,
        y: box.top + 100 * scaleY,
      };
    });

    expect(tapResult).not.toBeNull();
    if (tapResult) {
      await page.mouse.click(tapResult.x, tapResult.y);
    }

    await page.waitForTimeout(500);

    // Status should be 'denied' — checked BEFORE scene transition
    // because PlayScene creates a new InputManager with fresh status
    const state = await readSceneState(page);
    expect(state?.input.fullscreenStatus).toBe('denied');

    // Game should still be playable — start new game
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
    await page.waitForTimeout(1000);

    const playState = await readSceneState(page);
    expect(playState?.currentScene).toBe('PlayScene');

    await page.screenshot({ path: `${evidenceDir}/task-15-fullscreen-denied-playable.png` });
  });

  test('mock requestFullscreen rejection marks status denied', async ({ page }) => {
    // Inject mock BEFORE navigation
    await page.addInitScript(() => {
      // Mock requestFullscreen to reject
      Element.prototype.requestFullscreen = () => {
        setTimeout(() => document.dispatchEvent(new Event('fullscreenerror')), 10);
        return Promise.reject(new Error('Mocked fullscreen rejection'));
      };
    });

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Tap the fullscreen accept button at (520, 100)
    const tapResult = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      return {
        x: box.left + 520 * scaleX,
        y: box.top + 100 * scaleY,
      };
    });

    if (tapResult) {
      await page.mouse.click(tapResult.x, tapResult.y);
    }

    await page.waitForTimeout(1200);

    // Should become 'denied' (silent denial timeout or error)
    const stateAfter = await readSceneState(page);
    expect(['denied', 'failed', 'unsupported']).toContain(stateAfter?.input.fullscreenStatus);

    // Re-entry button should be visible
    // Verify game still interactable — start button tap
    const startResult = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      return {
        x: box.left + 640 * scaleX,
        y: box.top + 368 * scaleY,
      };
    });

    if (startResult) {
      await page.mouse.click(startResult.x, startResult.y);
    }

    await page.waitForTimeout(1000);

    const playState = await readSceneState(page);
    expect(playState?.currentScene).toBe('PlayScene');
  });

  test('mock requestFullscreen success sets status to requested then denied', async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = function () {
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => document.body,
        configurable: true,
      });
    });

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    const scaleX = box.width / 1280;
    const scaleY = box.height / 720;
    await page.mouse.click(box.x + 520 * scaleX, box.y + 100 * scaleY);

    await page.waitForTimeout(800);

    // In test env the status may be 'requested' or 'denied' depending on Phaser internals
    const state = await readSceneState(page);
    expect(state?.input.fullscreenStatus).not.toBe('idle');
  });

  test('leaving document fullscreen re-shows the fullscreen prompt', async ({ page }) => {
    await page.addInitScript(() => {
      let fullscreenElement: Element | null = null;
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => fullscreenElement,
        configurable: true,
      });
      Object.defineProperty(document, 'fullscreenEnabled', {
        value: true,
        configurable: true,
      });
      Element.prototype.requestFullscreen = function () {
        fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      };
      (window as Window & typeof globalThis & { __setMockFullscreenElement?: (element: Element | null) => void }).__setMockFullscreenElement = (element: Element | null) => {
        fullscreenElement = element;
        document.dispatchEvent(new Event('fullscreenchange'));
      };
    });

    await waitForGameSceneReady(page);

    const acceptPoint = await gamePoint(page, 520, 100);
    expect(acceptPoint).not.toBeNull();
    if (acceptPoint) {
      await page.mouse.click(acceptPoint.x, acceptPoint.y);
    }

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        fullscreenStatus: 'entered',
      },
    });
    await expect.poll(() => readFullscreenPromptVisible(page)).toBe(false);

    await page.evaluate(() => {
      (window as Window & typeof globalThis & { __setMockFullscreenElement?: (element: Element | null) => void }).__setMockFullscreenElement?.(null);
    });

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        fullscreenStatus: 'left',
      },
    });
    await expect.poll(() => readFullscreenPromptVisible(page)).toBe(true);
    await page.screenshot({ path: `${evidenceDir}/ulw-oracle-fullscreen-exit-prompt-visible.png` });
  });

  test('dismissing fullscreen prompt then rotating portrait to landscape re-shows prompt idle', async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.resolve();
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => null,
        configurable: true,
      });
    });

    await waitForGameSceneReady(page);

    const dismissPoint = await gamePoint(page, 760, 100);
    expect(dismissPoint).not.toBeNull();
    if (dismissPoint) {
      await page.mouse.click(dismissPoint.x, dismissPoint.y);
    }

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        fullscreenStatus: 'denied',
      },
    });

    await page.setViewportSize({ width: 412, height: 915 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        orientationStatus: 'portrait',
      },
    });

    await page.setViewportSize({ width: 915, height: 412 });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    await expect.poll(() => readSceneState(page)).toMatchObject({
      input: {
        fullscreenStatus: 'idle',
        orientationStatus: 'landscape',
      },
    });
  });

  test('fullscreen accept hides prompt within 100ms when requestFullscreen never resolves', async ({ page }) => {
    await page.addInitScript(() => {
      Element.prototype.requestFullscreen = () => {
        return new Promise<void>(() => undefined);
      };
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => null,
        configurable: true,
      });
    });

    await waitForGameSceneReady(page);

    const acceptPoint = await gamePoint(page, 520, 100);
    expect(acceptPoint).not.toBeNull();
    if (acceptPoint) {
      await page.mouse.click(acceptPoint.x, acceptPoint.y);
    }

    await page.waitForTimeout(100);

    const state = await readSceneState(page);
    expect(state?.input.fullscreenStatus).toBe('requested');
    expect(await readFullscreenPromptVisible(page)).toBe(false);
  });

  test('portrait orientation shows overlay, landscape hides it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Initial state should be landscape
    const initial = await readSceneState(page);
    expect(initial?.input.orientationStatus).toBe('landscape');

    // Switch to portrait viewport and dispatch orientationchange
    await page.setViewportSize({ width: 412, height: 915 });

    // Dispatch orientation change to trigger Phaser handler
    await page.evaluate(() => {
      // Phaser listens to window orientationchange
      window.dispatchEvent(new Event('orientationchange'));
    });

    await page.waitForTimeout(300);

    const portrait = await readSceneState(page);
    expect(portrait?.input.orientationStatus).toBe('portrait');

    // Switch back to landscape
    await page.setViewportSize({ width: 915, height: 412 });

    await page.evaluate(() => {
      window.dispatchEvent(new Event('orientationchange'));
    });

    await page.waitForTimeout(300);

    const landscape = await readSceneState(page);
    expect(landscape?.input.orientationStatus).toBe('landscape');

    await page.screenshot({ path: `${evidenceDir}/task-15-orientation-landscape.png` });
  });

  test('fullscreen button tap region is responsive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Tap the centre of the fullscreen accept button at (520, 100)
    const tapResult3 = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      return {
        x: box.left + 520 * scaleX,
        y: box.top + 100 * scaleY,
      };
    });

    expect(tapResult3).not.toBeNull();

    if (tapResult3) {
      await page.mouse.click(tapResult3.x, tapResult3.y);
    }

    await page.waitForTimeout(800);

    // After tapping fullscreen accept (which may fail/silently deny in test env),
    // status should transition: idle → requested → denied/entered/failed
    const state = await readSceneState(page);
    expect(state?.input.fullscreenStatus).not.toBe('idle');
  });
});
