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
      consumeInteract: () => { action: string | null; pressed: boolean };
    };
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.describe('desktop input', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });
  });

  test('detects desktop device mode', async ({ page }) => {
    const state = await readSceneState(page);
    expect(state?.input.deviceMode).toBe('desktop');
  });

  test('WASD movement produces correct movement vector', async ({ page }) => {
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    const stateRight = await readSceneState(page);
    expect(stateRight?.input.movementVector.x).toBe(1);
    expect(stateRight?.input.movementVector.y).toBe(0);

    await page.keyboard.up('d');
    await page.waitForTimeout(150);
    const stateIdle = await readSceneState(page);
    expect(stateIdle?.input.movementVector).toEqual({ x: 0, y: 0 });

    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    const stateUp = await readSceneState(page);
    expect(stateUp?.input.movementVector).toEqual({ x: 0, y: -1 });
    await page.keyboard.up('w');

    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    const stateDiag = await readSceneState(page);
    expect(stateDiag?.input.movementVector).toEqual({ x: 1, y: -1 });
    await page.keyboard.up('w');
    await page.keyboard.up('d');

    await page.screenshot({ path: `${evidenceDir}/task-7-desktop-wasd.png` });
  });

  test('arrow keys produce same movement as WASD', async ({ page }) => {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    const state = await readSceneState(page);
    expect(state?.input.movementVector.x).toBe(1);
    await page.keyboard.up('ArrowRight');

    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(150);
    const stateUp = await readSceneState(page);
    expect(stateUp?.input.movementVector.y).toBe(-1);
    await page.keyboard.up('ArrowUp');
  });

  test('F/Q edge-triggered via debug state contract', async ({ page }) => {
    const state = await readSceneState(page);
    expect(state?.input.interactAction).toBeNull();
    expect(state?.input.interactPressed).toBe(false);
  });

  test('input lock suppresses movement and interact via API', async ({ page }) => {
    // Verify movement works unlocked
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    const stateUnlocked = await readSceneState(page);
    expect(stateUnlocked?.input.lockActive).toBe(false);
    expect(stateUnlocked?.input.movementVector.x).toBe(1);
    await page.keyboard.up('d');

    // Lock input
    await page.evaluate(() => {
      const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (mgr) mgr.lock('dialogue');
    });
    await page.waitForTimeout(100);

    // Try pressing D while locked
    await page.keyboard.down('d');
    await page.waitForTimeout(200);
    const stateLocked = await readSceneState(page);
    expect(stateLocked?.input.lockActive).toBe(true);
    expect(stateLocked?.input.lockReason).toBe('dialogue');
    expect(stateLocked?.input.movementVector).toEqual({ x: 0, y: 0 });
    await page.keyboard.up('d');

    // Unlock
    await page.evaluate(() => {
      const mgr = (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__;
      if (mgr) mgr.unlock();
    });
    await page.waitForTimeout(100);
    await page.keyboard.down('d');
    await page.waitForTimeout(150);
    const stateUnlocked2 = await readSceneState(page);
    expect(stateUnlocked2?.input.lockActive).toBe(false);
    expect(stateUnlocked2?.input.movementVector.x).toBe(1);
    await page.keyboard.up('d');

    await page.screenshot({ path: `${evidenceDir}/task-7-desktop-lock.png` });
  });

  test('held F key does not repeat (edge-triggered)', async ({ page }) => {
    await page.keyboard.down('f');
    await page.waitForTimeout(500);
    const state = await readSceneState(page);
    expect(state?.input.interactPressed).toBe(false);
    await page.keyboard.up('f');
  });
});
