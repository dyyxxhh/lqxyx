import { test, expect } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';
const saveStorageKey = 'ying-zhong-jiu.checkpoint-save.v1';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      isInteractionTargetInCurrentLocation: () => boolean;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
      interactWithNearestDoor: () => void;
    };
    __YING_ZHONG_JIU_GAME__?: { startPlayScene: () => void };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: { unlock: () => void };
    __YING_ZHONG_JIU_NARRATIVE_UI__?: { setVisible: (el: string, v: boolean) => void };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

const checkpointDSave = {
  schemaVersion: 1,
  checkpointId: 'D',
  actId: 'act-1',
  floorId: '4F',
  roomId: null,
  position: { x: 832, y: 948, facing: 'left' },
  controllableCharacterId: 'yangYunRed',
  task: '去办公室',
  storyFlags: { communicationDisabled: false, qinHaoruiStandingVisible: false, qinHaoruiBodyBloodyOnGround: true },
  branchChoices: {},
  timers: {},
  inventory: [],
  pickups: {},
  triggeredEvents: [],
} as const;

test.describe('Door fall-through guard — awaiting_interaction with target in current location', () => {
  test('S2: pressing F at office door from 49-80px does NOT enter room (engine stays awaiting_interaction)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      { key: saveStorageKey, state: checkpointDSave },
    );

    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_GAME__?.startPlayScene());
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await page.waitForTimeout(500);
    for (let i = 0; i < 25; i++) {
      const state = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
      if (state === 'awaiting_interaction') break;
      if (state === 'awaiting_advance') {
        await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
        await page.waitForTimeout(150);
      } else {
        await page.waitForTimeout(300);
      }
    }

    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 5_000 })
      .toBe('awaiting_interaction');

    const targetMatch = await page.evaluate(() =>
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.isInteractionTargetInCurrentLocation(),
    );
    expect(targetMatch).toBe(true);

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 800, y: 818 });
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    const stateAfter = await readState(page);
    expect(stateAfter?.map.currentRoomId).toBeNull();
    expect(stateAfter?.map.currentFloorId).toBe('4F');

    const engineStateAfter = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState());
    expect(engineStateAfter).toBe('awaiting_interaction');

    await page.screenshot({ path: `${evidenceDir}/door-guard-office-door-blocked.png` });
  });

  test('S2 (positive): pressing F at office door from within 48px completes interaction and advances story', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      { key: saveStorageKey, state: checkpointDSave },
    );

    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_GAME__?.startPlayScene());
    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    await page.waitForTimeout(500);
    for (let i = 0; i < 25; i++) {
      const state = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
      if (state === 'awaiting_interaction') break;
      if (state === 'awaiting_advance') {
        await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
        await page.waitForTimeout(150);
      } else {
        await page.waitForTimeout(300);
      }
    }

    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 5_000 })
      .toBe('awaiting_interaction');

    // Place player at office front door physical target (832, 868) — within radiusPx=48
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 832, y: 868 });
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    // After completing the interaction, engine should advance past awaiting_interaction
    const engineStateAfter = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState());
    expect(engineStateAfter).not.toBe('awaiting_interaction');

    await page.screenshot({ path: `${evidenceDir}/door-guard-office-door-completed.png` });
  });

  test('S5 (regression): proximity target in different room \u2014 fall-through to door entry still works', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop only');

    await page.goto('/');
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
    await page.waitForTimeout(1000);

    await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });

    // Advance to checkpoint A awaiting_proximity (proximity target inside gt1-classroom)
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 10_000 })
      .toBe('awaiting_advance');
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
    await page.waitForTimeout(2200);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());

    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown'), { timeout: 5_000 })
      .toBe('awaiting_proximity');

    // Player in corridor (roomId=null), proximity target in gt1-classroom — fall-through is allowed
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    const stateAfter = await readState(page);
    expect(stateAfter?.map.currentRoomId).toBe('gt1-classroom');
    expect(stateAfter?.map.currentFloorId).toBe('4F');
  });
});
