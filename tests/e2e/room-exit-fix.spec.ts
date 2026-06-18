import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition: () => { x: number; y: number };
      setPlayerPosition: (position: { x: number; y: number }) => void;
      interactWithNearestDoor: () => void;
    };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      isLocked: () => boolean;
      getLockReason: () => string | null;
      unlock: () => void;
    };
    __YING_ZHONG_JIU_MAP_RENDERER__?: {
      tryInteract: (x: number, y: number) => boolean;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(1000);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

test.describe('Room exit fix — exit room after entering', () => {
  test('player can exit room via F key after entering', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await startGame(page);

    // Advance to awaiting_proximity
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

    // Enter GT1 classroom via front door
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    // Verify we're in the room
    const stateInRoom = await readState(page);
    expect(stateInRoom?.map.currentRoomId).toBe('gt1-classroom');
    const posInRoom = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition());
    console.log('Player position in room:', posInRoom);
    console.log('Engine state in room:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState()));
    console.log('Input locked:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.isLocked()));
    console.log('Lock reason:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getLockReason()));

    // Now try to exit by moving near the in-room door and pressing F
    // In-room front door: rect(840, 80, 24, 128) → center (852, 144)
    // Move player close to the door
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 144 });
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    const stateAfterExit = await readState(page);
    console.log('After F press - roomId:', stateAfterExit?.map.currentRoomId);
    console.log('After F press - floorId:', stateAfterExit?.map.currentFloorId);

    // Should have exited to corridor
    expect(stateAfterExit?.map.currentRoomId).toBeNull();
    expect(stateAfterExit?.map.currentFloorId).toBe('4F');

    await page.screenshot({ path: `${evidenceDir}/room-exit-fix-corridor.png` });
  });

  test('debug: inspect state after entering room', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await startGame(page);

    // Use debug helper to enter a room directly (bypassing dialogue)
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.interactWithNearestDoor();
    });
    await page.waitForTimeout(500);

    const state = await readState(page);
    console.log('=== After entering room (via debug) ===');
    console.log('roomId:', state?.map.currentRoomId);
    console.log('floorId:', state?.map.currentFloorId);
    console.log('engineState:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState()));
    console.log('inputLocked:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.isLocked()));
    console.log('lockReason:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.getLockReason()));
    console.log('playerPos:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()));

    // Try pressing F
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(300);
    console.log('=== After F press ===');
    console.log('roomId:', (await readState(page))?.map.currentRoomId);
    console.log('engineState:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState()));

    // Move to door and try F
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 144 });
    });
    await page.waitForTimeout(100);
    console.log('playerPos at door:', await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()));
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(300);
    console.log('=== After F at door ===');
    console.log('roomId:', (await readState(page))?.map.currentRoomId);
    console.log('floorId:', (await readState(page))?.map.currentFloorId);
  });

  test('player can exit room via clicking the in-room door (mobile-style click)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await startGame(page);

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

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 320, y: 580 });
    });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(500);

    const stateInRoom = await readState(page);
    expect(stateInRoom?.map.currentRoomId).toBe('gt1-classroom');

    // Trigger pointerdown on the in-room door's hitArea by emitting via Phaser scene
    // The hitArea was added at world position (852, 144) for the front in-room door of GT1.
    // We invoke the Phaser scene input emit('pointerdown') on the hitArea directly.
    const exitTriggered = await page.evaluate(() => {
      const game = (window as unknown as { __YING_ZHONG_JIU_GAME__?: { startPlayScene: () => void } }).__YING_ZHONG_JIU_GAME__;
      if (!game) return 'no-game';
      // Find the PlayScene's input system and dispatch a pointerdown at world pos
      const scene = (window as unknown as { __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: unknown }).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__;
      if (!scene) return 'no-scene-debug';

      // Iterate Phaser scene game objects to find the in-room door hitArea at world (852, 144)
      const phaserScene = (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_MAP_RENDERER__ as unknown as { scene: { children: { list: unknown[] }; input: { emit: (event: string, ...args: unknown[]) => void } } };
      const list = phaserScene.scene.children.list as Array<{ x?: number; y?: number; width?: number; height?: number; emit?: (event: string, ...args: unknown[]) => void; type?: string; depth?: number; input?: unknown }>;
      const candidates = list.filter((obj) => obj.x === 852 && obj.y === 144 && obj.depth === 8 && obj.input);
      if (candidates.length === 0) return `no-hitArea-found-of-${list.length}-objs`;
      const hitArea = candidates[0]!;
      hitArea.emit?.('pointerdown', { x: 852, y: 144 });
      return 'triggered';
    });
    console.log('Exit trigger result:', exitTriggered);
    await page.waitForTimeout(500);

    const stateAfterClick = await readState(page);
    expect(stateAfterClick?.map.currentRoomId).toBeNull();
    expect(stateAfterClick?.map.currentFloorId).toBe('4F');

    await page.screenshot({ path: `${evidenceDir}/room-exit-fix-via-click.png` });
  });
});
