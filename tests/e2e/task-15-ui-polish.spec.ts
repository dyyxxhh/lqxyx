import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

interface VisualBox {
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
}

interface NarrativeVisualDebugState {
  theme: string;
  task: VisualBox;
  dialogue: VisualBox;
  rolePrompt: VisualBox;
}

interface InputVisualDebugState {
  theme: string;
  joystick: VisualBox | null;
  joystickThumb: VisualBox | null;
  interact: VisualBox | null;
  fullscreenPrompt: VisualBox | null;
  fullscreenButtonFill: number | null;
  interactFill: number | null;
}

interface BranchVisualDebugState {
  theme: string;
  visible: boolean;
  background: VisualBox | null;
  prompt?: { text: string; bounds: VisualBox };
  buttons: Array<{ fillColor: number; bounds: VisualBox }>;
  labels: Array<{ text: string; bounds: VisualBox }>;
}

interface PreloadVisualDebugState {
  theme: string;
  progressBar: VisualBox | null;
  failureText: VisualBox | null;
  retryButton: VisualBox | null;
  retryFill: number | null;
}

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_NARRATIVE_UI__?: {
      setTask(text: string): void;
      setDialogue(speaker: string, text: string, portraitKey?: string, visible?: boolean): void;
      setRolePrompt(characterId: string, displayName?: string): void;
      getVisualDebugState(): NarrativeVisualDebugState;
    };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      getVisualDebugState(): InputVisualDebugState;
      setInteractContext(action: 'F' | 'Q' | null): void;
      unlock(): void;
    };
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState(): string;
      startFromCheckpoint(id: string): void;
      advance(): void;
      update(delta: number): void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getBranchVisualDebugState(): BranchVisualDebugState;
    };
    __YING_ZHONG_JIU_PRELOAD_UI__?: {
      getVisualDebugState(): PreloadVisualDebugState;
    };
  };

function overlaps(a: VisualBox, b: VisualBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function startPlayScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({ currentScene: 'GameScene', ready: true });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });
}

async function dispatchGameTouch(
  page: import('@playwright/test').Page,
  type: 'touchstart' | 'touchend',
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
      const allTouches = touches.map((touch) => {
        const clientX = box.left + touch.x * scaleX;
        const clientY = box.top + touch.y * scaleY;
        return new Touch({
          identifier: touch.id,
          target: canvas,
          clientX,
          clientY,
          screenX: clientX,
          screenY: clientY,
          pageX: clientX,
          pageY: clientY,
          radiusX: 1,
          radiusY: 1,
          rotationAngle: 0,
          force: 0.5,
        });
      });
      canvas.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: allTouches,
        changedTouches: allTouches.filter((touch) => changedIds.includes(touch.identifier)),
        targetTouches: allTouches,
      }));
    },
    { type, touches, changedIds },
  );
}

async function showPolishState(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
    ui?.setTask('当前任务：调查教学楼');
    ui?.setDialogue('董继豪', '嘿，你来得正好。这边有点情况需要你帮忙看看。', 'portrait.dongJihao', true);
  });
  await page.waitForTimeout(200);
}

test.describe('Task 15 UI polish', () => {
  test('desktop dark pixel-horror UI is readable and non-overlapping', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await startPlayScene(page);
    await showPolishState(page);
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('G');
    });
    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getBranchVisualDebugState().visible ?? false),
      { timeout: 5_000 },
    ).toBe(true);

    const evidence = await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
      const branch = (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getBranchVisualDebugState();
      const state = (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__;
      return { ui, branch, state };
    });

    expect(evidence.ui?.theme).toBe('dark-pixel-horror');
    expect(evidence.branch?.theme).toBe('dark-pixel-horror');
    expect(evidence.ui?.task.visible).toBe(true);
    expect(evidence.ui?.dialogue.visible).toBe(true);
    expect(evidence.ui && overlaps(evidence.ui.task, evidence.ui.dialogue)).toBe(false);
    expect(evidence.branch?.prompt?.text.trim().length).toBeGreaterThan(0);
    expect(evidence.branch?.prompt?.bounds.visible).toBe(true);
    expect(evidence.branch?.buttons).toHaveLength(2);
    expect(evidence.branch?.buttons.every((button) => button.bounds.width >= 44 && button.bounds.height >= 44)).toBe(true);
    expect(evidence.branch?.labels.map((label) => label.text)).toEqual([
      expect.stringMatching(/^1[.、]/),
      expect.stringMatching(/^2[.、]/),
    ]);
    expect(evidence.branch?.labels.every((label) => label.bounds.width <= 460)).toBe(true);

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('无'));
    await expect.poll(() => readState(page), { timeout: 3_000 }).toMatchObject({ ui: { taskVisible: false, taskText: '无' } });
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('当前任务：调查教学楼'));

    const hoverFill = await page.evaluate(() => {
      const branch = (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getBranchVisualDebugState();
      return branch?.buttons[0]?.fillColor ?? null;
    });
    expect(hoverFill).not.toBeNull();

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setVisible('rolePrompt', false);
    });
    await page.waitForTimeout(500);
    await page.locator('canvas').screenshot({ path: `.omo/evidence/gameplay-polish-script-audit/t8c-branch-choice-panel.png` });
  });

  test('mobile landscape controls, task, dialogue, and touch feedback stay separated', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await startPlayScene(page);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.unlock());
    await showPolishState(page);

    const beforeTap = await page.evaluate(() => ({
      ui: (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState(),
      input: (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getVisualDebugState(),
      state: (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__,
    }));

    expect(beforeTap.ui?.theme).toBe('dark-pixel-horror');
    expect(beforeTap.input?.theme).toBe('dark-pixel-horror');
    expect(beforeTap.state?.input.deviceMode).toBe('mobile');
    expect(beforeTap.ui?.task.visible).toBe(true);
    expect(beforeTap.input?.joystick?.visible).toBe(true);
    expect(beforeTap.input?.interact).toBeNull();
    expect(beforeTap.ui && beforeTap.input?.joystick && overlaps(beforeTap.ui.dialogue, beforeTap.input.joystick)).toBe(false);
    expect(beforeTap.input?.interactFill).toBeNull();

    await dispatchGameTouch(page, 'touchstart', [{ id: 7, x: 1080, y: 600 }], [7]);
    await page.waitForTimeout(100);

    const afterTap = await page.evaluate(() => ({
      ui: (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState(),
      input: (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getVisualDebugState(),
      state: (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__,
    }));
    expect(afterTap.state?.input.interactPressed).toBe(true);

    await dispatchGameTouch(page, 'touchend', [], [7]);

    await page.screenshot({ path: `${evidenceDir}/task-15-mobile-ui-polish.png` });
  });

  test('preload failure presents retry affordance in the same visual system', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/?preloadFailAsset=floor.tile');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PreloadScene', preload: { status: 'failed' } });

    const evidence = await page.evaluate(() => ({
      preload: (window as SceneWindow).__YING_ZHONG_JIU_PRELOAD_UI__?.getVisualDebugState(),
      state: (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__,
    }));

    expect(evidence.preload?.theme).toBe('dark-pixel-horror');
    expect(evidence.preload?.failureText?.visible).toBe(true);
    expect(evidence.preload?.retryButton?.visible).toBe(true);
    expect(evidence.preload?.retryFill).toBe(0xb01724);

    await page.screenshot({ path: `${evidenceDir}/task-15-preload-failure-retry.png` });
  });
});
