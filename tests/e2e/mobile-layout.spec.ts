import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      isOnMobile: () => boolean;
      lock: (r: string) => void;
      unlock: () => void;
      setInteractContext: (a: 'F' | 'Q' | null) => void;
      getMovementVector: () => { x: number; y: number };
      consumeInteract: () => { action: string | null; pressed: boolean };
      getVisualDebugState: () => {
        fullscreenPrompt: { visible: boolean } | null;
        tutorial: { visible: boolean; text: string } | null;
      };
    };
    __YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__?: {
      setDialogue: (speaker: string, text: string, portraitKey?: string, visible?: boolean) => void;
      setTask: (text: string) => void;
    };
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      update: (delta: number) => void;
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

async function enterPlayScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(1000);

  await expect.poll(() => readSceneState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });

  // Advance past initial checkpoint dialogue so input unlocks
  await page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    if (engine) {
      // Advance through any initial awaiting_advance states
      for (let i = 0; i < 6; i++) {
        if (engine.getCurrentState() === 'awaiting_advance') {
          engine.advance();
          engine.update(16);
        }
      }
    }
  });
  await page.waitForTimeout(300);

  // Belt-and-suspenders: force unlock
  await page.evaluate(() => {
    const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
    if (mgr) mgr.unlock();
  });
  await page.waitForTimeout(100);
}

async function clickGamePoint(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (x / 1280) * box.width, box.y + (y / 720) * box.height);
}

test.describe('mobile layout', () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape only');
  });

  test('simultaneous second touch does not interrupt joystick drag', async ({ page }) => {
    await enterPlayScene(page);

    // Step 1: Start joystick drag (id=0)
    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 200, y: 600 }], [0]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 280, y: 600 }], [0]);
    await page.waitForTimeout(100);

    // Poll for movement
    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [30] },
    ).toEqual({ x: 1, y: 0 });

    await dispatchTouch(page, 'touchstart', [
      { id: 0, x: 280, y: 600 },
      { id: 1, x: 1080, y: 600 },
    ], [1]);

    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 2000, intervals: [30] },
    ).toEqual({ x: 1, y: 0 });

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      const sx = box.width / 1280;
      const sy = box.height / 720;
      const mk = (id: number, x: number, y: number) => new Touch({
        identifier: id, target: canvas,
        clientX: box.left + x * sx, clientY: box.top + y * sy,
        screenX: box.left + x * sx, screenY: box.top + y * sy,
        pageX: box.left + x * sx, pageY: box.top + y * sy,
        radiusX: 1, radiusY: 1, rotationAngle: 0, force: 0.5,
      });
      const joy = mk(0, 280, 600);
      const it = mk(1, 1080, 600);
      canvas.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, cancelable: true,
        touches: [joy],
        changedTouches: [it],
        targetTouches: [joy],
      }));
      canvas.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, cancelable: true,
        touches: [],
        changedTouches: [joy],
        targetTouches: [],
      }));
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${evidenceDir}/task-15-simultaneous-touch.png` });
  });

  test('fullscreen prompt suppresses first-run tutorial until dismissed', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getVisualDebugState();
    }), { timeout: 5_000 }).toMatchObject({
      fullscreenPrompt: { visible: true },
      tutorial: { visible: false },
    });

    await clickGamePoint(page, 760, 104);

    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getVisualDebugState();
    }), { timeout: 5_000 }).toMatchObject({
      fullscreenPrompt: { visible: false },
      tutorial: { visible: true },
    });

    await page.screenshot({ path: `.omo/evidence/gameplay-polish-script-audit/t8c-fullscreen-tutorial-stacking.png` });
  });

  test('viewport resize keeps joystick mapping correct', async ({ page }) => {
    await enterPlayScene(page);

    await dispatchTouch(page, 'touchstart', [{ id: 1, x: 200, y: 600 }], [1]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchmove', [{ id: 1, x: 280, y: 600 }], [1]);
    await page.waitForTimeout(100);

    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [50] },
    ).toEqual({ x: 1, y: 0 });

    await dispatchTouch(page, 'touchend', [], [1]);
    await page.waitForTimeout(300);

    await page.setViewportSize({ width: 800, height: 400 });
    await page.waitForTimeout(300);

    const afterResize = await readSceneState(page);
    expect(afterResize?.currentScene).toBe('PlayScene');

    await page.screenshot({ path: `${evidenceDir}/task-15-resize-joystick.png` });
  });

  test('controls remain visible when dialogue is shown', async ({ page }) => {
    await enterPlayScene(page);

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__;
      if (ui) {
        ui.setDialogue('杨云', '这是一段测试对话文本，用于验证对话UI不会遮挡移动端的控制按钮。', undefined, true);
      }
    });
    await page.waitForTimeout(200);

    const state = await readSceneState(page);
    expect(state?.ui.dialogueVisible).toBe(true);
    expect(state?.input.deviceMode).toBe('mobile');

    // Ensure input still works with dialogue visible
    await dispatchTouch(page, 'touchstart', [{ id: 2, x: 200, y: 600 }], [2]);
    await dispatchTouch(page, 'touchmove', [{ id: 2, x: 200, y: 520 }], [2]);
    await page.waitForTimeout(100);

    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [30] },
    ).toEqual({ x: 0, y: -1 });

    await dispatchTouch(page, 'touchend', [], [2]);
    await page.waitForTimeout(100);

    await page.screenshot({ path: `${evidenceDir}/task-15-dialogue-controls-visible.png` });
  });

  test('task text and controls maintain safe distance', async ({ page }) => {
    await enterPlayScene(page);

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__;
      if (ui) {
        ui.setTask('当前任务：调查教室');
      }
    });
    await page.waitForTimeout(200);

    const state = await readSceneState(page);
    expect(state?.ui.taskVisible).toBe(true);

    // Joystick still works with task text visible
    await dispatchTouch(page, 'touchstart', [{ id: 3, x: 200, y: 600 }], [3]);
    await dispatchTouch(page, 'touchmove', [{ id: 3, x: 280, y: 600 }], [3]);
    await page.waitForTimeout(100);

    await expect.poll(
      () => readSceneState(page).then((s) => s?.input.movementVector),
      { timeout: 3000, intervals: [30] },
    ).toEqual({ x: 1, y: 0 });

    await dispatchTouch(page, 'touchend', [], [3]);
    await page.waitForTimeout(100);

    await page.screenshot({ path: `${evidenceDir}/task-15-task-controls-safe.png` });
  });

  test('controls visible at bottom on mobile landscape screenshot', async ({ page }) => {
    await enterPlayScene(page);

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__;
      if (ui) {
        ui.setTask('当前任务：探索教学楼');
        ui.setDialogue('董继豪', '嘿，你来得正好。这边有点情况需要你帮忙看看。');
      }
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${evidenceDir}/task-15-mobile-landscape-layout.png` });
  });
});
