import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      getCommandIndex: () => number;
      advance: () => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
    };
      __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      setPlayerPosition: (position: { x: number; y: number }) => void;
      getPlayerPosition: () => { x: number; y: number };
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineSnapshot(page: import('@playwright/test').Page): Promise<{ state: string; commandIndex: number }> {
  return page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    return {
      state: engine?.getCurrentState() ?? 'unknown',
      commandIndex: engine?.getCommandIndex() ?? -1,
    };
  });
}

async function waitForFirstDialogue(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => getEngineSnapshot(page), { timeout: 10_000 }).toMatchObject({
    state: 'awaiting_advance',
  });
}

async function startGameWithMouse(page: import('@playwright/test').Page): Promise<void> {
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
  });
  await waitForFirstDialogue(page);
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
      const changedTouches = allTouches.filter((touch) => changedIds.includes(touch.identifier));

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

async function startGameWithTouch(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  await dispatchTouch(page, 'touchstart', [{ id: 0, x: 640, y: 368 }], [0]);
  await dispatchTouch(page, 'touchend', [], [0]);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
  await waitForFirstDialogue(page);
}

async function setLocation(page: import('@playwright/test').Page, floorId: '4F' | '5F', roomId: string | null): Promise<void> {
  await page.evaluate(({ floorId, roomId }) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation(floorId, roomId);
  }, { floorId, roomId });
}

async function setPlayerPosition(page: import('@playwright/test').Page, position: { x: number; y: number }): Promise<void> {
  await page.evaluate((position) => {
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition(position);
  }, position);
}

async function clickDialogueArea(page: import('@playwright/test').Page): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9);
}

async function advanceUntilProximity(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
    if (!engine) return;
    engine.startFromCheckpoint('A');
    for (let i = 0; i < 10 && engine.getCurrentState() !== 'awaiting_proximity'; i++) {
      if (engine.getCurrentState() === 'waiting') {
        engine.update(2_000);
      } else if (engine.getCurrentState() === 'awaiting_advance') {
        engine.advance();
      }
    }
  });
}

test.describe('dialogue advance input regression', () => {
  test('desktop F advances dialogue while dialogue lock keeps movement frozen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithMouse(page);

    await page.keyboard.down('d');
    await page.waitForTimeout(100);

    const before = await readState(page);
    const engineBefore = await getEngineSnapshot(page);
    expect(before?.input.lockActive).toBe(true);
    expect(before?.input.lockReason).toBe('dialogue');
    expect(before?.input.movementVector).toEqual({ x: 0, y: 0 });
    expect(before?.ui.dialogueSpeaker).toBe('？？？');

    await page.keyboard.press('f');

    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
      commandIndex: engineBefore.commandIndex + 1,
    });

    const after = await readState(page);
    expect(after?.input.lockActive).toBe(true);
    expect(after?.input.lockReason).toBe('dialogue');
    expect(after?.input.movementVector).toEqual({ x: 0, y: 0 });
    expect(after?.ui.dialogueSpeaker).toBe('杨云');

    await page.keyboard.up('d');
    await page.screenshot({ path: evidenceDir + '/task-1-dialogue-f-advance.png' });
  });

  test('mobile interaction advances dialogue without moving the player', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithTouch(page);

    const before = await readState(page);
    const engineBefore = await getEngineSnapshot(page);
    expect(before?.input.lockActive).toBe(true);
    expect(before?.input.lockReason).toBe('dialogue');
    expect(before?.input.movementVector).toEqual({ x: 0, y: 0 });
    expect(before?.ui.dialogueSpeaker).toBe('？？？');

    await dispatchTouch(page, 'touchstart', [{ id: 1, x: 1080, y: 600 }], [1]);
    await dispatchTouch(page, 'touchend', [], [1]);

    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
      commandIndex: engineBefore.commandIndex + 1,
    });

    const after = await readState(page);
    expect(after?.input.lockActive).toBe(true);
    expect(after?.input.lockReason).toBe('dialogue');
    expect(after?.input.movementVector).toEqual({ x: 0, y: 0 });
    expect(before?.character.isMoving).toBe(false);
    expect(after?.character.isMoving).toBe(false);
    expect(after?.ui.dialogueSpeaker).toBe('杨云');

    await page.screenshot({ path: evidenceDir + '/task-1-mobile-dialogue-advance.png' });
  });

  test('desktop mouse click advances the checkpoint A Dan dialogue and unlocks input', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithMouse(page);

    await advanceUntilProximity(page);

    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_proximity',
    });

    await setLocation(page, '4F', 'gt1-classroom');
    await setPlayerPosition(page, { x: 600, y: 520 });
    await setPlayerPosition(page, { x: 760, y: 520 });

    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueText: '我要搓手。' },
      input: { lockActive: true, lockReason: 'dialogue' },
    });

    await clickDialogueArea(page);

    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'idle',
    });
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      input: { lockActive: false },
    });

    await page.screenshot({ path: evidenceDir + '/checkpoint-a-dan-dialogue-click-advance.png' });
  });

  async function advanceOpeningDialoguesWithF(page: import('@playwright/test').Page): Promise<void> {
    await waitForFirstDialogue(page);
    await holdKey(page, 'f', 100);
    await page.waitForTimeout(2_200);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueSpeaker: '杨云' },
    });
    await holdKey(page, 'f', 100);
    await page.waitForTimeout(2_200);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    const dialogue3 = await readState(page);
    expect(dialogue3?.ui.dialogueText).toBe('但宇轩……听着也很好吃呢。');
    await holdKey(page, 'f', 100);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_proximity',
    });
  }

  async function advanceOpeningDialoguesWithDialogueClick(page: import('@playwright/test').Page): Promise<void> {
    await waitForFirstDialogue(page);
    await clickDialogueArea(page);
    await page.waitForTimeout(2_200);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    await clickDialogueArea(page);
    await page.waitForTimeout(2_200);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    await clickDialogueArea(page);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_proximity',
    });
  }

  async function advanceOpeningDialoguesWithMobileTap(
    page: import('@playwright/test').Page,
    snapshots: CuoshouDebugSnapshot[],
  ): Promise<void> {
    await waitForFirstDialogue(page);
    snapshots.push(await captureCuoshouDebugSnapshot(page, 'mobile-prefix-before-tap-1'));
    await dispatchTouch(page, 'touchstart', [{ id: 1, x: 1080, y: 600 }], [1]);
    await dispatchTouch(page, 'touchend', [], [1]);
    await page.waitForTimeout(2_200);
    snapshots.push(await captureCuoshouDebugSnapshot(page, 'mobile-prefix-after-tap-1'));
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    await dispatchTouch(page, 'touchstart', [{ id: 2, x: 1080, y: 600 }], [2]);
    await dispatchTouch(page, 'touchend', [], [2]);
    await page.waitForTimeout(2_200);
    snapshots.push(await captureCuoshouDebugSnapshot(page, 'mobile-prefix-after-tap-2'));
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
    await dispatchTouch(page, 'touchstart', [{ id: 3, x: 1080, y: 600 }], [3]);
    await dispatchTouch(page, 'touchend', [], [3]);
    snapshots.push(await captureCuoshouDebugSnapshot(page, 'mobile-prefix-after-tap-3'));
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_proximity',
    });
  }

  async function triggerDanProximity(page: import('@playwright/test').Page): Promise<void> {
    // Real corridor walking + door entry is unrelated to S5 (which is about advancing past
    // the dialogue command produced by the proximity trigger), and would make these tests brittle.
    // Use the existing debug hooks to put the engine in the same proximity-resolved state.
    await setLocation(page, '4F', 'gt1-classroom');
    await setPlayerPosition(page, { x: 760, y: 420 });
    await setPlayerPosition(page, { x: 760, y: 520 });

    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueText: '我要搓手。', dialogueSpeaker: '杨云' },
      input: { lockActive: true, lockReason: 'dialogue' },
    });
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
  }

  interface CuoshouDebugSnapshot {
    engine: { state: string; commandIndex: number };
    state: SceneDebugState | undefined;
    playerPosition: { x: number; y: number } | undefined;
    label: string;
  }

  async function captureCuoshouDebugSnapshot(page: import('@playwright/test').Page, label: string): Promise<CuoshouDebugSnapshot> {
    const [engine, state, playerPosition] = await Promise.all([
      getEngineSnapshot(page),
      readState(page),
      page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getPlayerPosition()),
    ]);
    return { engine, state, playerPosition, label };
  }

  function summariseSnapshot(snap: CuoshouDebugSnapshot): Record<string, unknown> {
    return {
      label: snap.label,
      engineState: snap.engine.state,
      engineCommandIndex: snap.engine.commandIndex,
      lockActive: snap.state?.input.lockActive,
      lockReason: snap.state?.input.lockReason,
      dialogueText: snap.state?.ui.dialogueText,
      dialogueSpeaker: snap.state?.ui.dialogueSpeaker,
      currentFloorId: snap.state?.map.currentFloorId,
      currentRoomId: snap.state?.map.currentRoomId,
      isMoving: snap.state?.character.isMoving,
      playerPosition: snap.playerPosition,
    };
  }

  async function holdKey(page: import('@playwright/test').Page, key: string, durationMs: number): Promise<void> {
    await page.keyboard.down(key);
    await page.waitForTimeout(durationMs);
    await page.keyboard.up(key);
  }

  async function walkToGt1FrontDoorWithKeyboard(page: import('@playwright/test').Page): Promise<void> {
    await holdKey(page, 'a', 1_150);
    await holdKey(page, 's', 1_450);
    await page.keyboard.press('f');
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      map: { currentFloorId: '4F', currentRoomId: 'gt1-classroom' },
    });
  }

  async function walkFromGt1FrontEntryToDanWithKeyboard(
    page: import('@playwright/test').Page,
    testInfo: import('@playwright/test').TestInfo,
  ): Promise<void> {
    const trace: CuoshouDebugSnapshot[] = [];
    trace.push(await captureCuoshouDebugSnapshot(page, 'real-nav-after-enter-gt1'));
    await holdKey(page, 's', 510);
    trace.push(await captureCuoshouDebugSnapshot(page, 'real-nav-after-walk-s-510'));
    await testInfo.attach('s5-real-nav-proximity-trace.json', {
      body: JSON.stringify(trace.map(summariseSnapshot), null, 2),
      contentType: 'application/json',
    });
    await expect.poll(() => readState(page), { timeout: 5_000 }).toMatchObject({
      ui: { dialogueText: '我要搓手。', dialogueSpeaker: '杨云' },
      input: { lockActive: true, lockReason: 'dialogue' },
    });
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_advance',
    });
  }

  test('S5 desktop F advances 我要搓手 reached via real keyboard navigation to Dan', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithMouse(page);

    await advanceOpeningDialoguesWithF(page);
    await expect.poll(() => getEngineSnapshot(page), { timeout: 5_000 }).toMatchObject({
      state: 'awaiting_proximity',
    });

    await walkToGt1FrontDoorWithKeyboard(page);
    await walkFromGt1FrontEntryToDanWithKeyboard(page, testInfo);

    const before = await captureCuoshouDebugSnapshot(page, 's5-desktop-real-nav-before-advance');
    expect(before.state?.ui.dialogueText).toBe('我要搓手。');
    expect(before.engine.state).toBe('awaiting_advance');

    await page.keyboard.press('f');
    await page.waitForTimeout(150);

    const after = await captureCuoshouDebugSnapshot(page, 's5-desktop-real-nav-after-advance');
    expect(after.engine.commandIndex).toBeGreaterThan(before.engine.commandIndex);
    expect(after.engine.state).not.toBe('awaiting_advance');
    expect(after.state?.input.lockActive).toBe(false);

    await page.screenshot({ path: evidenceDir + '/s5-desktop-real-nav-cuoshou-advance.png' });
    await testInfo.attach('s5-desktop-real-nav-cuoshou-debug.json', {
      body: JSON.stringify({ before: summariseSnapshot(before), after: summariseSnapshot(after) }, null, 2),
      contentType: 'application/json',
    });
  });

  test('S5 desktop F advances 我要搓手 reached via real opening-dialogue F input', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithMouse(page);

    await advanceOpeningDialoguesWithF(page);
    await triggerDanProximity(page);

    const before = await captureCuoshouDebugSnapshot(page, 's5-desktop-f-before-advance');
    expect(before.state?.ui.dialogueText).toBe('我要搓手。');
    expect(before.engine.state).toBe('awaiting_advance');

    await page.keyboard.press('f');
    await page.waitForTimeout(150);

    const after = await captureCuoshouDebugSnapshot(page, 's5-desktop-f-after-advance');

    expect(after.engine.commandIndex).toBeGreaterThan(before.engine.commandIndex);
    expect(after.engine.state).not.toBe('awaiting_advance');
    expect(after.state?.input.lockActive).toBe(false);

    await page.screenshot({ path: evidenceDir + '/s5-desktop-f-cuoshou-advance.png' });
    await testInfo.attach('s5-desktop-f-cuoshou-debug.json', {
      body: JSON.stringify({ before: summariseSnapshot(before), after: summariseSnapshot(after) }, null, 2),
      contentType: 'application/json',
    });
  });

  test('S5 desktop dialogue-area click advances 我要搓手 reached via real click input', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithMouse(page);

    await advanceOpeningDialoguesWithDialogueClick(page);
    await triggerDanProximity(page);

    const before = await captureCuoshouDebugSnapshot(page, 's5-desktop-click-before-advance');
    expect(before.state?.ui.dialogueText).toBe('我要搓手。');
    expect(before.engine.state).toBe('awaiting_advance');

    await clickDialogueArea(page);
    await page.waitForTimeout(150);

    const after = await captureCuoshouDebugSnapshot(page, 's5-desktop-click-after-advance');

    expect(after.engine.commandIndex).toBeGreaterThan(before.engine.commandIndex);
    expect(after.engine.state).not.toBe('awaiting_advance');
    expect(after.state?.input.lockActive).toBe(false);

    await page.screenshot({ path: evidenceDir + '/s5-desktop-click-cuoshou-advance.png' });
    await testInfo.attach('s5-desktop-click-cuoshou-debug.json', {
      body: JSON.stringify({ before: summariseSnapshot(before), after: summariseSnapshot(after) }, null, 2),
      contentType: 'application/json',
    });
  });

  test('S5 mobile tap advances 我要搓手 reached via real touch input', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-landscape-chromium', 'mobile landscape project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await startGameWithTouch(page);

    const prefixSnapshots: CuoshouDebugSnapshot[] = [];
    const tracePath = '/tmp/ulw-red-cuoshou.s5-mobile-trace.json';

    try {
      await advanceOpeningDialoguesWithMobileTap(page, prefixSnapshots);
      await triggerDanProximity(page);

      const before = await captureCuoshouDebugSnapshot(page, 's5-mobile-tap-before-advance');
      expect(before.state?.ui.dialogueText).toBe('我要搓手。');
      expect(before.engine.state).toBe('awaiting_advance');

      await dispatchTouch(page, 'touchstart', [{ id: 9, x: 1080, y: 600 }], [9]);
      await dispatchTouch(page, 'touchend', [], [9]);
      await page.waitForTimeout(150);

      const after = await captureCuoshouDebugSnapshot(page, 's5-mobile-tap-after-advance');

      await page.evaluate(({ path, payload }) => {
        localStorage.setItem(path, JSON.stringify(payload));
      }, {
        path: tracePath,
        payload: {
          outcome: 'reached-final-assertions',
          prefixSnapshots: prefixSnapshots.map(summariseSnapshot),
          before: summariseSnapshot(before),
          after: summariseSnapshot(after),
        },
      });

      expect(after.engine.commandIndex).toBeGreaterThan(before.engine.commandIndex);
      expect(after.engine.state).not.toBe('awaiting_advance');
      expect(after.state?.input.lockActive).toBe(false);

      await page.screenshot({ path: evidenceDir + '/s5-mobile-tap-cuoshou-advance.png' });
      await testInfo.attach('s5-mobile-tap-cuoshou-debug.json', {
        body: JSON.stringify({
          prefixSnapshots: prefixSnapshots.map(summariseSnapshot),
          before: summariseSnapshot(before),
          after: summariseSnapshot(after),
        }, null, 2),
        contentType: 'application/json',
      });
    } catch (err) {
      const failureSnapshot = await captureCuoshouDebugSnapshot(page, 's5-mobile-tap-failure');
      await page.evaluate(({ path, payload }) => {
        localStorage.setItem(path, JSON.stringify(payload));
      }, {
        path: tracePath,
        payload: {
          outcome: 'failed-before-final-assertions',
          error: err instanceof Error ? err.message : String(err),
          prefixSnapshots: prefixSnapshots.map(summariseSnapshot),
          failure: summariseSnapshot(failureSnapshot),
        },
      });
      throw err;
    }
  });
});
