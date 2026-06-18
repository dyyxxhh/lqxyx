import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      getCommandIndex: () => number;
    };
    __YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__?: {
      getVisualDebugState: () => {
        dialogue?: Bounds;
        dialoguePortrait?: Bounds | null;
      };
    };
  };

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
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

async function readVisualState(page: import('@playwright/test').Page): Promise<{ dialogue?: Bounds; dialoguePortrait?: Bounds | null }> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__?.getVisualDebugState() ?? {});
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
}

async function clickGamePoint(page: import('@playwright/test').Page, point: { x: number; y: number }): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  await page.mouse.click(
    box.x + point.x * (box.width / 1280),
    box.y + point.y * (box.height / 720),
  );
}

test.describe('mobile dialogue layout and tapping', () => {
  test('dialogue box tap advances and the layout sits bottom-center with portrait above its left edge', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await clickStartButton(page);

    await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });

    const firstEngine = await readEngine(page);
    await clickGamePoint(page, { x: 1080, y: 600 });
    await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
      commandIndex: firstEngine.commandIndex + 1,
    });

    let visual = await readVisualState(page);
    expect(visual.dialogue).toMatchObject({ visible: true });
    expect(visual.dialogue?.x).toBeGreaterThanOrEqual(220);
    expect(visual.dialogue?.x).toBeLessThanOrEqual(300);
    expect((visual.dialogue?.y ?? 0) + (visual.dialogue?.height ?? 0)).toBeGreaterThanOrEqual(690);
    expect(visual.dialoguePortrait).toMatchObject({ visible: true });
    expect((visual.dialoguePortrait?.y ?? 720) + (visual.dialoguePortrait?.height ?? 0)).toBeLessThanOrEqual((visual.dialogue?.y ?? 0) + 24);
    expect(visual.dialoguePortrait?.x).toBeLessThan((visual.dialogue?.x ?? 0) + 170);

    const engineBefore = await readEngine(page);
    await clickGamePoint(page, { x: 640, y: 620 });

    await expect.poll(() => readEngine(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    expect((await readEngine(page)).commandIndex).toBeGreaterThan(engineBefore.commandIndex);

    visual = await readVisualState(page);
    expect(visual.dialogue).toMatchObject({ visible: true });
    await page.screenshot({ path: '.omo/evidence/dialogue-mobile-layout.png' });
  });
});
