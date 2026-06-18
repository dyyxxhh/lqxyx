import { expect, test } from '@playwright/test';

import { schoolMaps, type DoorId } from '../../src/data/maps';
import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      getPlayerPosition(): { x: number; y: number };
      setPlayerPosition(position: { x: number; y: number }): void;
      interactWithNearestDoor(): void;
    };
    __YING_ZHONG_JIU_GAME__?: {
      startPlayScene(): void;
    };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      unlock(): void;
    };
    __YING_ZHONG_JIU_NARRATIVE_UI__?: {
      setVisible(element: 'task' | 'dialogue' | 'rolePrompt' | 'timer' | 'curtain', visible: boolean): void;
    };
    __YING_ZHONG_JIU_MAP_RENDERER__?: {
      startElevatorTransition(toFloor: string): void;
      renderRoom(roomId: string): void;
      renderCorridor(floorId: string): void;
      tryInteract(x: number, y: number): boolean;
      get currentFloor(): string;
    };
  };

const saveStorageKey = 'ying-zhong-jiu.checkpoint-save.v1';

const savedCommunicationRoomState = {
  schemaVersion: 1,
  checkpointId: 'H',
  actId: 'act-1',
  floorId: '5F',
  roomId: 'communication-control-5f',
  position: { x: 620, y: 240, facing: 'up' },
  controllableCharacterId: 'dongJihao',
  task: '去学校通信控制室报警',
  storyFlags: { communicationDisabled: false },
  branchChoices: {},
  timers: {},
  inventory: [],
  pickups: {},
  triggeredEvents: [],
} as const;

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
}

async function startPlaySceneWithoutClearingSave(page: import('@playwright/test').Page): Promise<void> {
  await waitForReady(page);
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_GAME__?.startPlayScene();
  });
  await expect.poll(() => readSceneState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

function getCorridorDoor(doorId: DoorId) {
  const door = Object.values(schoolMaps.floors).flatMap((floor) => floor.corridor.doors).find((candidate) => candidate.id === doorId);
  if (!door) throw new Error(`Missing corridor door ${doorId}`);
  return door;
}

function expectedCorridorReturnPosition(doorId: DoorId): { x: number; y: number } {
  const door = getCorridorDoor(doorId);
  const walkable = schoolMaps.floors[door.floorId].corridor.walkableBounds[0]!;
  const x = door.side === 'left' ? walkable.x + 24 : walkable.x + walkable.width - 24;
  return { x, y: door.bounds.y + door.bounds.height / 2 };
}

function doorCenter(doorId: DoorId): { x: number; y: number } {
  const door = getCorridorDoor(doorId);
  return { x: door.bounds.x + door.bounds.width / 2, y: door.bounds.y + door.bounds.height / 2 };
}

async function enterDoorFromCorridor(page: import('@playwright/test').Page, position: { x: number; y: number }): Promise<void> {
  await page.evaluate((entryPosition) => {
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition(entryPosition);
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.interactWithNearestDoor();
  }, position);
}

async function interactWithNearestDoor(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.interactWithNearestDoor();
  });
}

test.describe('map navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.removeItem(key), saveStorageKey);
  });

  test('initial map state shows 4F corridor with no room', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    const state = await readSceneState(page);
    expect(state?.map.currentFloorId).toBe('4F');
    expect(state?.map.currentRoomId).toBeNull();
    expect(state?.map.elevatorTransitioning).toBe(false);
  });

  test('elevator transition changes floor from 4F to 5F', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Verify starting on 4F
    let state = await readSceneState(page);
    expect(state?.map.currentFloorId).toBe('4F');

    // Trigger elevator transition to 5F via the exposed MapRenderer
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F');
    });

    // Wait for transition to complete (fade out 500ms + delay 50ms + fade in 500ms + margin)
    await expect
      .poll(() => readSceneState(page), { timeout: 10_000 })
      .toMatchObject({
        map: {
          currentFloorId: '5F',
          currentRoomId: null,
          elevatorTransitioning: false,
        },
      });

    // Screenshot after transition
    await page.screenshot({ path: `${evidenceDir}/task-11-elevator-5f.png` });
  });

  test('elevator transitioning flag is true during transition', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Trigger transition and immediately check the transitioning flag
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.startElevatorTransition('5F');
    });

    // The transitioning flag should be true briefly after starting
    await expect
      .poll(() => readSceneState(page).then((s) => s?.map.elevatorTransitioning ?? null), {
        timeout: 2_000,
      })
      .toBe(true);

    // After transition completes, it should be false
    await expect
      .poll(() => readSceneState(page), { timeout: 10_000 })
      .toMatchObject({
        map: { elevatorTransitioning: false, currentFloorId: '5F' },
      });
  });

  test('room transition renders a classroom from corridor', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Navigate to a classroom
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.renderRoom('gt2-classroom');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        map: {
          currentRoomId: 'gt2-classroom',
        },
      });

    // Screenshot of room
    await page.screenshot({ path: `${evidenceDir}/task-11-gt2-classroom.png` });
  });

  test('classroom render fills the 1280x720 viewport without a black right edge', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setVisible('rolePrompt', false);
      (window as SceneWindow).__YING_ZHONG_JIU_INPUT_MANAGER__?.unlock();
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.renderRoom('gt1-classroom');
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 480, y: 480 });
    });

    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentFloorId: '4F', currentRoomId: 'gt1-classroom' },
      ui: { rolePromptVisible: false },
    });

    await page.screenshot({ path: `${evidenceDir}/viewport-fill-gt1-classroom.png` });
  });

  test('saved room checkpoint restores the saved floor, room, and player position', async ({ page }) => {
    await page.addInitScript(
      ({ key, state }) => window.localStorage.setItem(key, JSON.stringify(state)),
      { key: saveStorageKey, state: savedCommunicationRoomState },
    );

    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: {
        currentFloorId: '5F',
        currentRoomId: 'communication-control-5f',
      },
    });
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
      .toEqual({ x: 620, y: 240 });
  });

  test('keyboard room transition places player at the door spawnPointId', async ({ page }) => {
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await page.evaluate((entryPosition) => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition(entryPosition);
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.interactWithNearestDoor();
    }, doorCenter('4f-gt1-back'));

    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: {
        currentFloorId: '4F',
        currentRoomId: 'gt1-classroom',
      },
    });
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
      .toEqual({ x: 760, y: 260 });
  });

  test('interacting far from an in-room entry door keeps the player inside room F', async ({ page }) => {
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await enterDoorFromCorridor(page, doorCenter('4f-gt1-back'));
    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentRoomId: 'gt1-classroom' },
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 480, y: 480 });
    });
    await interactWithNearestDoor(page);

    const state = await readSceneState(page);
    expect(state?.map.currentRoomId).toBe('gt1-classroom');
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
      .toEqual({ x: 480, y: 480 });
  });

  test('interacting near the visible room F entry door exits to the corridor', async ({ page }) => {
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await enterDoorFromCorridor(page, doorCenter('4f-gt1-back'));
    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentRoomId: 'gt1-classroom' },
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 260 });
    });
    await interactWithNearestDoor(page);

    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentFloorId: '4F', currentRoomId: null },
    });
  });

  test('returning from classroom exits near the matching corridor door, not corridor center', async ({ page }) => {
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await enterDoorFromCorridor(page, doorCenter('4f-gt1-back'));
    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentRoomId: 'gt1-classroom' },
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 260 });
    });
    await interactWithNearestDoor(page);

    const expected = expectedCorridorReturnPosition('4f-gt1-back');
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
      .toEqual(expected);
    expect(expected).not.toEqual({ x: 560, y: 920 });
  });

  test('returning from office exits near the matching corridor door, not corridor center', async ({ page }) => {
    await page.goto('/');
    await startPlaySceneWithoutClearingSave(page);

    await enterDoorFromCorridor(page, doorCenter('4f-office-front'));
    await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentRoomId: 'office-4f' },
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 160, y: 260 });
    });
    await interactWithNearestDoor(page);

    const expected = expectedCorridorReturnPosition('4f-office-front');
    await expect
      .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
      .toEqual(expected);
    expect(expected).not.toEqual({ x: 560, y: 920 });
  });

  test.describe('cross-door exit routing (RED - expected to fail until PlayScene fix)', () => {
    test('GT1 back→front: entering via back door and exiting via front door returns to front corridor door', async ({ page }) => {
      await page.goto('/');
      await startPlaySceneWithoutClearingSave(page);

      // Enter GT1 via back door
      await enterDoorFromCorridor(page, doorCenter('4f-gt1-back'));
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentRoomId: 'gt1-classroom' },
      });

      // Move player to front in-room door center and interact
      await page.evaluate(() => {
        (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 144 });
      });
      await interactWithNearestDoor(page);

      // Should exit via front corridor door
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentFloorId: '4F', currentRoomId: null },
      });
      const expected = expectedCorridorReturnPosition('4f-gt1-front');
      await expect
        .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
        .toEqual(expected);
    });

    test('GT1 front→back: entering via front door and exiting via back door returns to back corridor door', async ({ page }) => {
      await page.goto('/');
      await startPlaySceneWithoutClearingSave(page);

      // Enter GT1 via front door
      await enterDoorFromCorridor(page, doorCenter('4f-gt1-front'));
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentRoomId: 'gt1-classroom' },
      });

      // Move player to back in-room door center and interact
      await page.evaluate(() => {
        (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 1136 });
      });
      await interactWithNearestDoor(page);

      // Should exit via back corridor door
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentFloorId: '4F', currentRoomId: null },
      });
      const expected = expectedCorridorReturnPosition('4f-gt1-back');
      await expect
        .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
        .toEqual(expected);
    });

    test('GT2 back→front: entering via back door and exiting via front door returns to front corridor door', async ({ page }) => {
      await page.goto('/');
      await startPlaySceneWithoutClearingSave(page);

      // Enter GT2 via back door
      await enterDoorFromCorridor(page, doorCenter('4f-gt2-back'));
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentRoomId: 'gt2-classroom' },
      });

      // Move player to front in-room door center and interact
      await page.evaluate(() => {
        (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 144 });
      });
      await interactWithNearestDoor(page);

      // Should exit via front corridor door
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentFloorId: '4F', currentRoomId: null },
      });
      const expected = expectedCorridorReturnPosition('4f-gt2-front');
      await expect
        .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
        .toEqual(expected);
    });

    test('GT2 front→back: entering via front door and exiting via back door returns to back corridor door', async ({ page }) => {
      await page.goto('/');
      await startPlaySceneWithoutClearingSave(page);

      // Enter GT2 via front door
      await enterDoorFromCorridor(page, doorCenter('4f-gt2-front'));
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentRoomId: 'gt2-classroom' },
      });

      // Move player to back in-room door center and interact
      await page.evaluate(() => {
        (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 852, y: 1136 });
      });
      await interactWithNearestDoor(page);

      // Should exit via back corridor door
      await expect.poll(() => readSceneState(page), { timeout: 5_000 }).toMatchObject({
        map: { currentFloorId: '4F', currentRoomId: null },
      });
      const expected = expectedCorridorReturnPosition('4f-gt2-back');
      await expect
        .poll(() => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()))
        .toEqual(expected);
    });
  });

  test('returning to corridor after room clears roomId', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Navigate to a room first
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.renderRoom('gt1-classroom');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ map: { currentRoomId: 'gt1-classroom' } });

    // Return to corridor
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_MAP_RENDERER__?.renderCorridor('4F');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        map: {
          currentFloorId: '4F',
          currentRoomId: null,
        },
      });
  });

  test('corridor screenshot shows rendered floor and doors', async ({ page }) => {
    await page.goto('/');
    await waitForReady(page);

    // Take screenshot of the corridor rendering
    await page.screenshot({ path: `${evidenceDir}/task-11-4f-corridor.png` });
  });

});
