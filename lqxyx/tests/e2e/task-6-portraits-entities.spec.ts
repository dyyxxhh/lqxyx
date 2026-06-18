/// <reference types="node" />

import { mkdirSync, writeFileSync } from 'fs';

import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';
import type { StoryEntityDebugEntry } from '../../src/scenes/storyEntities';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      update: (delta: number) => void;
      selectBranch: (id: string) => void;
      startFromCheckpoint: (id: string) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
      interactWithNearestDoor: () => boolean;
      getStoryEntities: () => StoryEntityDebugEntry[];
      isScriptedMovementActive: () => boolean;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
}

async function getStoryEntities(page: import('@playwright/test').Page): Promise<StoryEntityDebugEntry[]> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getStoryEntities() ?? []);
}

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({ currentScene: 'PlayScene' });
  await page.waitForTimeout(2_200);
  await expect.poll(() => getEngineState(page), { timeout: 10_000 }).toBe('awaiting_advance');
}

async function advance(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
  await page.waitForTimeout(50);
}

async function updateEngine(page: import('@playwright/test').Page, delta: number): Promise<void> {
  await page.evaluate((value) => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(value), delta);
  await page.waitForTimeout(50);
}

async function enterDoorAt(page: import('@playwright/test').Page, position: { x: number; y: number }): Promise<void> {
  await page.evaluate((target) => {
    const debug = (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__;
    debug?.setPlayerPosition(target);
    debug?.interactWithNearestDoor();
  }, position);
  await page.waitForTimeout(50);
}

async function advanceB2ToHeadPickupFlag(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    engine?.startFromCheckpoint('G');
    engine?.selectBranch('B-2');
  });
  await updateEngine(page, 3000);
  await advance(page);
  await advance(page);
  await updateEngine(page, 500);
  await updateEngine(page, 2000);
  await updateEngine(page, 500);
  await updateEngine(page, 2000);
  await advance(page);
}

test.describe('Task 6 portraits and story entities', () => {
  test('renders known portraits while hiding unknown narration portraits', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');
    mkdirSync(evidenceDir, { recursive: true });

    await startGame(page);

    const unknownState = await readState(page);
    expect(unknownState?.ui.dialogueSpeaker).toBe('？？？');
    expect(unknownState?.ui.dialoguePortraitKey).toBeNull();

    await advance(page);
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueSpeaker: '杨云', dialoguePortraitKey: 'portrait.yangYunBlue' },
    });

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('B'));
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueSpeaker: '杨云', dialoguePortraitKey: 'portrait.yangYunRed' },
    });
    await advance(page);
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueSpeaker: '但宇轩', dialoguePortraitKey: 'portrait.danYuxuan' },
    });

    const state = await readState(page);
    writeFileSync(`${evidenceDir}/task-6-portraits.json`, JSON.stringify({ unknownState: unknownState?.ui, finalState: state?.ui }, null, 2));
    await page.screenshot({ path: `${evidenceDir}/task-6-portraits.png` });
  });

  test('renders corpse and head sprites from story flags without blocking movement', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');
    mkdirSync(evidenceDir, { recursive: true });

    await startGame(page);
    await advance(page);
    await advance(page);
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toEqual([]);
    const corridorAfterStandingFlag = await getStoryEntities(page);
    await enterDoorAt(page, { x: 288, y: 364 });
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toContainEqual(
      expect.objectContaining({ id: 'danYuxuanStanding', textureKey: 'sprite.danYuxuan.standRight', roomId: 'gt1-classroom', blocksMovement: false }),
    );
    const standingEntities = await getStoryEntities(page);

    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('B'));
    for (let index = 0; index < 7; index += 1) {
      await advance(page);
    }
    await updateEngine(page, 1000);
    await updateEngine(page, 500);
    await updateEngine(page, 500);
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toContainEqual(
      expect.objectContaining({ id: 'danYuxuanProneBloody', textureKey: 'sprite.danYuxuan.lyingBloody', roomId: 'gt1-classroom', blocksMovement: false }),
    );
    const danBodyEntities = await getStoryEntities(page);

    await startGame(page);
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('D'));
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toEqual([]);
    const corridorAfterQinFlag = await getStoryEntities(page);
    await enterDoorAt(page, { x: 288, y: 244 });
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toContainEqual(
      expect.objectContaining({ id: 'qinHaoruiProneBloody', textureKey: 'sprite.qinHaorui.lyingBloody', roomId: 'gt2-classroom', blocksMovement: false }),
    );
    const qinBodyEntities = await getStoryEntities(page);

    await advanceB2ToHeadPickupFlag(page);
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toContainEqual(
      expect.objectContaining({ id: 'qinHaoruiHeadPickup', textureKey: 'sprite.qinHaorui.headPart', roomId: 'gt2-classroom', blocksMovement: false }),
    );
    const qinRoomHeadPickupEntities = await getStoryEntities(page);

    await startGame(page);
    await advanceB2ToHeadPickupFlag(page);
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toEqual([]);
    const corridorAfterHeadPickupFlag = await getStoryEntities(page);
    await enterDoorAt(page, { x: 288, y: 364 });
    await expect.poll(() => getStoryEntities(page), { timeout: 5_000 }).toContainEqual(
      expect.objectContaining({ id: 'danYuxuanHeadPickup', textureKey: 'sprite.danYuxuan.headPart', roomId: 'gt1-classroom', blocksMovement: false }),
    );
    const danRoomHeadPickupEntities = await getStoryEntities(page);

    writeFileSync(`${evidenceDir}/task-6-story-entities.json`, JSON.stringify({
      corridorAfterStandingFlag,
      standingEntities,
      danBodyEntities,
      corridorAfterQinFlag,
      qinBodyEntities,
      qinRoomHeadPickupEntities,
      corridorAfterHeadPickupFlag,
      danRoomHeadPickupEntities,
    }, null, 2));
    await page.screenshot({ path: `${evidenceDir}/task-6-story-entities.png` });
  });
});
