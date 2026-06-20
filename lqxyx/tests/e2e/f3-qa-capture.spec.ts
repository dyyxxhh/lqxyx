/**
 * F3 QA Screenshot Tests - captures key moments for manual QA verification
 */
import { expect, test, type Page } from '@playwright/test';
import type { SceneDebugState } from '../../src/game/scaffoldState';

const EVIDENCE = '.omo/evidence';

type SceneWindow = Window & typeof globalThis & {
  __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  __YING_ZHONG_JIU_EVENT_ENGINE__?: {
    getCurrentState: () => string;
    advance: () => void;
    selectBranch: (id: string) => void;
    update: (delta: number) => void;
    startFromCheckpoint: (id: string) => void;
  };
  __YING_ZHONG_JIU_INPUT_MANAGER__?: {
    lock: (r: string) => void;
    unlock: () => void;
    setInteractContext: (a: 'F' | 'Q' | null) => void;
  };
  __YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__?: {
    setDialogue: (speaker: string, text: string, portraitKey?: string, visible?: boolean) => void;
    setTask: (text: string) => void;
  };
};

interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

interface DispatchTouchPayload {
  type: 'touchstart' | 'touchmove' | 'touchend';
  touches: TouchPoint[];
  changedIds: number[];
}

async function readState(page: Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: Page): Promise<string> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
}

async function engineAdvance(page: Page): Promise<void> {
  await page.evaluate(() => { (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance(); });
  await page.waitForTimeout(80);
}

async function engineStart(page: Page, checkpointId: string): Promise<void> {
  await page.evaluate((id) => { (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint(id); }, checkpointId);
  await page.waitForTimeout(200);
}

async function engineUpdate(page: Page, delta: number): Promise<void> {
  await page.evaluate((d) => { (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(d); }, delta);
  await page.waitForTimeout(100);
}

async function dispatchTouch(
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: TouchPoint[],
  changedIds: number[],
): Promise<void> {
  await page.evaluate(
    ({ type, touches, changedIds }: DispatchTouchPayload) => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return;
      const box = canvas.getBoundingClientRect();
      const scaleX = box.width / 1280;
      const scaleY = box.height / 720;
      const all: Touch[] = [];
      for (const t of touches) {
        const cx = box.left + t.x * scaleX;
        const cy = box.top + t.y * scaleY;
        all.push(new Touch({
          identifier: t.id, target: canvas,
          clientX: cx, clientY: cy, screenX: cx, screenY: cy,
          pageX: cx, pageY: cy, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 0.5,
        }));
      }
      canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: all,
        changedTouches: all.filter((touch) => changedIds.includes(touch.identifier)),
        targetTouches: all,
      }));
    },
    { type, touches, changedIds },
  );
}

// ━━━ Desktop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('F3 QA — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:8949/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
  });

  test('game loads and shows GameScene', async ({ page }) => {
    await expect.poll(() => readState(page), { timeout: 15000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-desktop-gamescene.png` });
  });

  test('start button transitions to PlayScene with dialogue', async ({ page }) => {
    await expect.poll(() => readState(page), { timeout: 15000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
    await page.waitForTimeout(1200);

    const state = await readState(page);
    expect(state?.currentScene).toBe('PlayScene');
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-desktop-start-clicked.png` });
  });

  test('first-act dialogue plays through checkpoint A', async ({ page }) => {
    await expect.poll(() => readState(page), { timeout: 15000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
    await page.waitForTimeout(2_200);

    await expect.poll(() => getEngineState(page), { timeout: 5000 }).toBe('awaiting_advance');
    const s1 = await readState(page);
    expect(s1?.ui.dialogueSpeaker).toBe('？？？');
    expect(s1?.ui.dialogueVisible).toBe(true);

    await engineAdvance(page);
    const s2 = await readState(page);
    expect(s2?.ui.dialogueSpeaker).toBe('杨云');

    await engineAdvance(page);
    await engineUpdate(page, 2_000);
    const s3 = await readState(page);
    expect(s3?.ui.taskText).toBe('找到但宇轩');

    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-desktop-dialogue.png` });
  });

  test('ending curtain appears at checkpoint I', async ({ page }) => {
    await expect.poll(() => readState(page), { timeout: 15000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
    await page.waitForTimeout(1200);

    // Jump to I
    await engineStart(page, 'I');
    await expect.poll(() => getEngineState(page), { timeout: 5000 }).toBe('awaiting_advance');
    await engineAdvance(page);

    // Feed the 30s wait
    let eng = await getEngineState(page);
    if (eng === 'waiting') {
      await engineUpdate(page, 30000);
      await engineUpdate(page, 5000);
      await page.waitForTimeout(500);
    }

    const state = await readState(page);
    expect(state?.ui.curtainVisible).toBe(true);
    expect(state?.ui.curtainTitle).toBe('"报假警"');
    expect(state?.ui.curtainSubtitle).toBe('敬请期待');
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-desktop-ending-curtain.png` });
  });
});

// ━━━ Mobile Landscape ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test.describe('F3 QA — Mobile Landscape', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape only');
    await page.goto('http://127.0.0.1:8949/');
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => readState(page), { timeout: 30000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
  });

  test('fullscreen prompt appears on mobile entry', async ({ page }) => {
    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    expect(state?.input.fullscreenStatus).toBeDefined();
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-mobile-fullscreen-prompt.png` });
  });

  test('joystick touch produces movement', async ({ page }) => {
    expect((await readState(page))?.input.deviceMode).toBe('mobile');

    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 200, y: 600 }], [0]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchmove', [{ id: 0, x: 280, y: 600 }], [0]);
    await page.waitForTimeout(200);

    const state = await readState(page);
    expect(state?.input.movementVector.x).toBe(1);

    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-mobile-joystick.png` });
  });

  test('interact button tap works', async ({ page }) => {
    expect((await readState(page))?.input.deviceMode).toBe('mobile');

    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 1080, y: 600 }], [0]);
    await page.waitForTimeout(50);
    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(100);

    const state = await readState(page);
    expect(state?.input.deviceMode).toBe('mobile');
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-mobile-interact.png` });
  });

  test('UI does not overlap controls when dialogue visible', async ({ page }) => {
    // Dismiss fullscreen first
    const tapResult = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const sx = box.width / 1280;
      const sy = box.height / 720;
      return { x: box.left + 760 * sx, y: box.top + 100 * sy };
    });
    if (tapResult) {
      await page.mouse.click(tapResult.x, tapResult.y);
      await page.waitForTimeout(500);
    }

    // Start game via touch
    await dispatchTouch(page, 'touchstart', [{ id: 0, x: 640, y: 368 }], [0]);
    await dispatchTouch(page, 'touchend', [], [0]);
    await page.waitForTimeout(1500);

    const state = await readState(page);
    expect(state?.currentScene).toBe('PlayScene');

    // Set dialogue and task; ensure input unlocked
    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__;
      const input = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (ui) {
        ui.setDialogue('杨云', '这是一段测试对话，用于验证移动端控制按钮与UI不重叠。', undefined, true);
        ui.setTask('当前任务：探索教学楼');
      }
      if (input) input.unlock();
    });
    await page.waitForTimeout(300);

    // Joystick should still work with dialogue visible
    await dispatchTouch(page, 'touchstart', [{ id: 1, x: 200, y: 600 }], [1]);
    await dispatchTouch(page, 'touchmove', [{ id: 1, x: 200, y: 520 }], [1]);
    await page.waitForTimeout(200);

    const afterState = await readState(page);
    expect(afterState?.ui.dialogueVisible).toBe(true);
    expect(afterState?.input.deviceMode).toBe('mobile');
    expect(afterState?.input.movementVector.y).toBe(-1);

    await dispatchTouch(page, 'touchend', [], [1]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${EVIDENCE}/task-f3-qa-mobile-controls-ui.png` });
  });
});
