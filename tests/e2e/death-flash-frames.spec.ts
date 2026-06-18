/// <reference types="node" />

import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';

import type { SceneDebugState } from '../../src/game/scaffoldState';
import { firstActBranches } from '../../src/data/story';
import type { DeathFlashFrameLogEntry } from '../../src/scenes/DeathFlashManager';

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
      isScriptedMovementActive: () => boolean;
      isDeathFlashActive: () => boolean;
      getDeathFlashActiveObjectCount: () => number;
      getDeathFlashFrameLog: () => DeathFlashFrameLogEntry[];
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
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

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

function expectedCeleryFlash() {
  const branch = firstActBranches.find((candidate) => candidate.id === 'A-1');
  const flash = branch?.commands.find((command) => command.type === 'deathFlash');
  if (flash?.type !== 'deathFlash') throw new Error('A-1 celery death flash missing');
  return {
    frames: flash.sequence.map((frame, index) => ({
      id: 'celery' as const,
      index,
      background: frame.background,
      image: frame.image ?? null,
      textureKey: frame.image ? 'prop.celery' : null,
      durationMs: frame.durationMs,
    })),
    durationMs: flash.sequence.reduce((sum, frame) => sum + frame.durationMs, 0),
  };
}

test.describe('death flash frame rendering surface', () => {
  test('celery death flash renders ordered story frames and cleans up overlays', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');
    mkdirSync(evidenceDir, { recursive: true });

    await startGame(page);
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint('C');
      (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.selectBranch('A-1');
    });

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await page.evaluate(() => {
      const engine = (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__;
      engine?.advance();
      engine?.update(2_000);
    });

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_scripted_movement');
    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isScriptedMovementActive() ?? false),
      { timeout: 5_000 },
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isScriptedMovementActive() ?? false),
      { timeout: 7_000 },
    ).toBe(false);

    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());

    const expectedFlash = expectedCeleryFlash();
    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isDeathFlashActive() ?? false),
      { timeout: 5_000 },
    ).toBe(true);
    await expect.poll(
      () => page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.isDeathFlashActive() ?? true),
      { timeout: expectedFlash.durationMs + 20_000 },
    ).toBe(false);

    const expectedFrames = expectedFlash.frames;
    const actualFrames = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getDeathFlashFrameLog() ?? []);
    const activeObjectCount = await page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.getDeathFlashActiveObjectCount() ?? -1);
    expect(actualFrames).toEqual(expectedFrames);
    expect(activeObjectCount).toBe(0);

    const state = await readState(page);
    expect(state?.input.lockActive).toBe(false);

    await page.keyboard.down('d');
    await page.waitForTimeout(250);
    const movementProbeState = await readState(page);
    await page.keyboard.up('d');
    const movedState = await readState(page);
    expect(movementProbeState?.input.lockActive).toBe(false);
    expect(movementProbeState?.input.movementVector.x).toBeGreaterThan(0);

    writeFileSync(`${evidenceDir}/task-3-death-flash-celery.json`, JSON.stringify({
      actualFrames,
      expectedFrames,
      activeObjectCount,
      engineState: await getEngineState(page),
      checkpoint: state?.story.currentCheckpointId,
      inputAfterFlash: state?.input,
      inputDuringMovementProbe: movementProbeState?.input,
      inputAfterMovementProbe: movedState?.input,
    }, null, 2));
    await page.screenshot({ path: `${evidenceDir}/task-3-death-flash-celery.png` });
  });
});
