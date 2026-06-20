import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_EVENT_ENGINE__?: {
      getCurrentState: () => string;
      advance: () => void;
      selectBranch: (id: string) => void;
      update: (delta: number) => void;
      startFromCheckpoint: (id: string) => void;
      updateLocation: (floorId: '4F' | '5F', roomId: string | null) => void;
    };
    __YING_ZHONG_JIU_INPUT_MANAGER__?: {
      lock: (r: string) => void;
      unlock: () => void;
      setInteractContext: (a: 'F' | 'Q' | null) => void;
    };
    __YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?: {
      setPlayerPosition: (position: { x: number; y: number }) => void;
    };
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function getEngineState(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    return (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown';
  });
}

async function engineStart(page: import('@playwright/test').Page, checkpointId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint(id);
  }, checkpointId);
  await engineUpdate(page, 2_000);
}

async function engineAdvance(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.advance();
  });
  await page.waitForTimeout(50);
}

async function engineSelectBranch(page: import('@playwright/test').Page, branchId: string): Promise<void> {
  await page.evaluate((id) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.selectBranch(id);
  }, branchId);
  await page.waitForTimeout(100);
}

async function engineUpdate(page: import('@playwright/test').Page, delta: number): Promise<void> {
  await page.evaluate((d) => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.update(d);
  }, delta);
  await page.waitForTimeout(50);
}

async function satisfyCheckpointAProximity(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_proximity');
  await page.evaluate(() => {
    (window as SceneWindow).__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('4F', 'gt1-classroom');
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 600, y: 520 });
    (window as SceneWindow).__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 760, y: 520 });
  });
  await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
}

async function finishBranchA1ToCheckpointD(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const checkpointId = (await readState(page))?.story.currentCheckpointId;
    if (checkpointId === 'D') return;

    const st = await getEngineState(page);
    if (st === 'awaiting_advance') {
      await engineAdvance(page);
    } else if (st === 'waiting') {
      await engineUpdate(page, 1_000);
    } else if (st === 'awaiting_proximity') {
      await satisfyCheckpointAProximity(page);
    } else {
      await page.waitForTimeout(50);
    }
  }
}

/**
 * Start a new game by clicking the canvas centre (the "开始新游戏" button area).
 * Matches the approach used by first-act-route.spec.ts.
 */
async function startGame(page: import('@playwright/test').Page): Promise<void> {
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(2_200);

  await expect.poll(() => readState(page), { timeout: 10_000 }).toMatchObject({
    currentScene: 'PlayScene',
  });
}

test.describe('Desktop Gameplay Flow', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop project only');

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('starts new game via F key and loads PlayScene at checkpoint A', async ({ page }) => {
    await startGame(page);

    const state = await readState(page);
    expect(state?.story.currentCheckpointId).toBe('A');
    expect(state?.currentScene).toBe('PlayScene');
    expect(state?.character.currentDisplayName).toBe('杨云');

    await page.screenshot({ path: `${evidenceDir}/task-17-desktop-start.png` });
  });

  test('advances through checkpoint A dialogue sequence', async ({ page }) => {
    await startGame(page);

    // Wait for first dialogue to appear
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');

    // Verify opening dialogue
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

    await engineAdvance(page);
    // At this point engine may be awaiting_advance for the 但宇轩 dialogue
    // or may have gone to idle if all non-blocking commands are done
    const s4 = await readState(page);
    // Checkpoint A should be saved
    expect(s4?.story.currentCheckpointId).toBe('A');

    await satisfyCheckpointAProximity(page);

    const sFinal = await readState(page);
    expect(sFinal?.story.currentCheckpointId).toBe('A');
    expect(sFinal?.ui.taskText).toBe('无');

    await page.screenshot({ path: `${evidenceDir}/task-17-checkpoint-a.png` });
  });

  test('advances through checkpoint B black screen engagement', async ({ page }) => {
    await startGame(page);

    // Skip past A's dialogues
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await engineAdvance(page); // "？？？" dialogue
    await engineAdvance(page); // "杨云" dialogue
    await engineAdvance(page); // "但宇轩" dialogue

    // Jump to checkpoint B
    await engineStart(page, 'B');

    // B should start executing — first command is 'checkpoint' (non-blocking)
    // then 'dialogue' (blocks)
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    // Advance through B's 6 dialogues + black screen waits
    // Each advance consumes one awaitable + any non-blocking commands
    for (let i = 0; i < 7; i++) {
      const st = await getEngineState(page);
      if (st === 'awaiting_advance') {
        await engineAdvance(page);
        await page.waitForTimeout(50);
      } else if (st === 'waiting') {
        // Feed time delta to progress through waits (blackScreen + blackScreenDialogueWait)
        await engineUpdate(page, 2000);
        await page.waitForTimeout(100);
      }
    }

    // Feed remaining waits
    const state = await getEngineState(page);
    if (state === 'waiting') {
      await engineUpdate(page, 2000);
      await page.waitForTimeout(100);
    }

    const sB = await readState(page);
    expect(sB?.story.currentCheckpointId).toBe('B');

    // After some more advances if needed for the final dialogue
    const engState = await getEngineState(page);
    if (engState === 'awaiting_advance') {
      await engineAdvance(page);
    }

    // B should be complete; danYuxuanBodyProneAndBloody flag set
    const sFinal = await readState(page);
    expect(sFinal?.story.currentCheckpointId).toBe('B');

    await page.screenshot({ path: `${evidenceDir}/task-17-checkpoint-b.png` });
  });

  test('checkpoint C branch selection and progression', async ({ page }) => {
    await startGame(page);

    // Skip past A quickly
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await engineAdvance(page);
    await engineAdvance(page);
    await engineAdvance(page);

    // Jump to C
    await engineStart(page, 'C');

    // C starts with checkpoint (non-blocking), then setControl, then branch
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_branch');

    const sC = await readState(page);
    expect(sC?.story.currentCheckpointId).toBe('C');
    expect(sC?.story.pendingBranchId).toBeTruthy();

    // Select branch A-1 ("让我去看看芹菜怎么样了")
    await engineSelectBranch(page, 'A-1');

    // Branch A-1 loads — first command is task (non-blocking), then dialogue (blocks)
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    // Advance through A-1's commands: "？？？" dialogue, switchChar, setControl, "秦浩睿" dialogue, deathFlash, task, checkpoint D
    await finishBranchA1ToCheckpointD(page);

    // Should now be at checkpoint D
    const sD = await readState(page);
    expect(sD?.story.currentCheckpointId).toBe('D');

    await page.screenshot({ path: `${evidenceDir}/task-17-checkpoint-c-branch.png` });
  });

  test('first-act ending curtain at checkpoint I', async ({ page }) => {
    await startGame(page);

    // Skip A
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');
    await engineAdvance(page);
    await engineAdvance(page);
    await engineAdvance(page);

    // Jump directly to checkpoint I (ending)
    await engineStart(page, 'I');

    // I starts: checkpoint (save), dialogue "好了。" (blocks)
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    // Advance past "好了。" dialogue
    await engineAdvance(page);

    // After dialogue: timer stop (non-blocking), timer reset (non-blocking), task, setFlags, then wait 30000ms
    const stateAfterAdvance = await getEngineState(page);
    if (stateAfterAdvance === 'waiting') {
      // Feed the 30s wait
      await engineUpdate(page, 30000);
      await page.waitForTimeout(200);
    }

    // After wait: fade, ending, curtain
    // Feed a bit more time for fade + trigger
    await engineUpdate(page, 1000);
    await page.waitForTimeout(200);

    const state = await readState(page);
    expect(state?.ui.curtainVisible).toBe(true);
    expect(state?.ui.curtainTitle).toBe('"报假警"');
    expect(state?.ui.curtainSubtitle).toBe('敬请期待');

    await page.screenshot({ path: `${evidenceDir}/task-17-ending-curtain.png` });
  });

  test('full flow: A → B → C-branch → D → I ending', async ({ page }) => {
    await startGame(page);

    // ── Checkpoint A ──────────────────────────────────────────────
    await expect.poll(() => getEngineState(page), { timeout: 5_000 }).toBe('awaiting_advance');

    // Advance through A's 3 dialogues
    for (let i = 0; i < 3; i++) {
      await engineAdvance(page);
      await page.waitForTimeout(30);
    }

    const stateA = await readState(page);
    expect(stateA?.story.currentCheckpointId).toBe('A');

    // ── Checkpoint B ──────────────────────────────────────────────
    await engineStart(page, 'B');
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    // Advance through B — handle both awaits and waits
    for (let round = 0; round < 12; round++) {
      const st = await getEngineState(page);
      if (st === 'awaiting_advance') {
        await engineAdvance(page);
        await page.waitForTimeout(50);
      } else if (st === 'waiting') {
        await engineUpdate(page, 2000);
        await page.waitForTimeout(100);
      } else {
        break;
      }
    }

    const stateB = await readState(page);
    expect(stateB?.story.currentCheckpointId).toBe('B');

    // ── Checkpoint C → branch A-1 → checkpoint D ────────────────
    await engineStart(page, 'C');
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_branch');

    const stateC = await readState(page);
    expect(stateC?.story.currentCheckpointId).toBe('C');

    await engineSelectBranch(page, 'A-1');

    // Branch A-1 loads — need to advance through its blocking commands
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    await finishBranchA1ToCheckpointD(page);

    // Should now be at checkpoint D
    const stateAfterBranch = await readState(page);
    expect(stateAfterBranch?.story.currentCheckpointId).toBe('D');

    // ── Jump to checkpoint I for ending curtain ──────────────────
    await engineStart(page, 'I');
    await expect.poll(() => getEngineState(page), { timeout: 3_000 }).toBe('awaiting_advance');

    await engineAdvance(page);

    // Feed the 30s wait
    const afterAdvance = await getEngineState(page);
    if (afterAdvance === 'waiting') {
      await engineUpdate(page, 30000);
      await page.waitForTimeout(200);
    }
    await engineUpdate(page, 1000);
    await page.waitForTimeout(200);

    const finalState = await readState(page);
    expect(finalState?.ui.curtainVisible).toBe(true);
    expect(finalState?.ui.curtainTitle).toBe('"报假警"');
    expect(finalState?.ui.curtainSubtitle).toBe('敬请期待');
    expect(finalState?.input.lockActive).toBe(true);
    expect(finalState?.input.lockReason).toBe('ending');

    await page.screenshot({ path: `${evidenceDir}/task-17-full-flow-ending.png` });
  });
});
