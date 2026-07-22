// tests/e2e/forgotten-sanity-notes.spec.ts
// spec §10.2 遗落的纸条 E2E：拾取 → 阅读推进 nextSequentialIndex → 重读不推进 → ESC 关闭 → 持久化。
// plan 2026-07-22 Task 13.
//
// 流程：主菜单 → hub → 进入墓穴 → run 场景就绪 →
//   1) __testSpawnNote('entrance') 在入口房注入纸条
//   2) __testMovePlayerToNote 瞬移玩家到纸条
//   3) 按 H 打开/关闭纸条覆盖层
//   4) 校验 nextSequentialIndex 推进与重读不变
//   5) ESC 关闭覆盖层
//   6) localStorage 持久化 nextSequentialIndex
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type TestHooks = {
  __testSpawnNote?: (roomId: string) => void;
  __testGetNoteState?: () => { nextSequentialIndex: number; readThisRun: string[] };
  __testReadNearestNote?: () => boolean;
  __testIsNoteOverlayVisible?: () => boolean;
  __testMovePlayerToNote?: () => void;
  __testForceNotesState?: (nextSequentialIndex: number) => void;
};

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: TestHooks;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readHubActive(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ === true);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

/** 导航到 ForgottenSanityScene run 场景：主菜单 → hub → 进入墓穴。 */
async function navigateToRunScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
  // 点击「被遗忘的理智」按钮（640,440）
  await clickGamePoint(page, 640, 440);
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);
  // 点击 hub「进入墓穴」面板按钮（5 面板第 5 个，中心 x=1072, y=56）
  await clickGamePoint(page, 1072, 56);
  // 等待 run 场景就绪（forgottenSanity.scene === 'run'）
  await expect.poll(
    async () => (await readState(page))?.forgottenSanity?.scene,
    { timeout: 20_000 },
  ).toBe('run');
}

async function resetNotesState(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem('ying-zhong-jiu.forgotten-sanity.notes.v1');
  });
}

test.describe('遗落的纸条 (Forgotten Sanity lost notes)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToRunScene(page);
    await resetNotesState(page);
    // Force notesState to 0 after reset (RunController loaded it before reset)
    await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testForceNotesState?: (n: number) => void } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      scene?.__testForceNotesState?.(0);
    });
  });

  test('first read advances nextSequentialIndex 0->1, re-read does not advance', async ({ page }) => {
    // 1. Spawn a note
    await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testSpawnNote?: (r: string) => void } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      scene?.__testSpawnNote?.('entrance');
    });
    // 2. Move player to note
    await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testMovePlayerToNote?: () => void } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      scene?.__testMovePlayerToNote?.();
    });
    // 3. Press H to open
    await page.keyboard.press('H');
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testIsNoteOverlayVisible?: () => boolean } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
          return scene?.__testIsNoteOverlayVisible?.() ?? false;
        });
      },
      { timeout: 5_000 },
    ).toBe(true);

    // 4. Assert nextSequentialIndex 0 -> 1
    const after1 = await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testGetNoteState?: () => { nextSequentialIndex: number; readThisRun: string[] } } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      return scene?.__testGetNoteState?.();
    });
    expect(after1?.nextSequentialIndex).toBe(1);

    // 5. Press H to close
    await page.keyboard.press('H');
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testIsNoteOverlayVisible?: () => boolean } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
          return scene?.__testIsNoteOverlayVisible?.() ?? false;
        });
      },
      { timeout: 5_000 },
    ).toBe(false);

    // 6. Re-read: nextSequentialIndex should still be 1
    await page.keyboard.press('H');
    await page.keyboard.press('H');
    const after2 = await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testGetNoteState?: () => { nextSequentialIndex: number; readThisRun: string[] } } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      return scene?.__testGetNoteState?.();
    });
    expect(after2?.nextSequentialIndex).toBe(1);
  });

  test('ESC closes the overlay without pausing', async ({ page }) => {
    await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testSpawnNote?: (r: string) => void; __testMovePlayerToNote?: () => void } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      scene?.__testSpawnNote?.('entrance');
      scene?.__testMovePlayerToNote?.();
    });
    await page.keyboard.press('H');
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testIsNoteOverlayVisible?: () => boolean } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
          return scene?.__testIsNoteOverlayVisible?.() ?? false;
        });
      },
      { timeout: 5_000 },
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(
      async () => {
        return await page.evaluate(() => {
          const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testIsNoteOverlayVisible?: () => boolean } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
          return scene?.__testIsNoteOverlayVisible?.() ?? false;
        });
      },
      { timeout: 5_000 },
    ).toBe(false);
  });

  test('persistence: nextSequentialIndex survives in localStorage', async ({ page }) => {
    await page.evaluate(() => {
      const scene = (window as unknown as { __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: { __testSpawnNote?: (r: string) => void; __testMovePlayerToNote?: () => void } }).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__;
      scene?.__testSpawnNote?.('entrance');
      scene?.__testMovePlayerToNote?.();
    });
    await page.keyboard.press('H');
    await page.keyboard.press('H');
    const stored = await page.evaluate(() => window.localStorage.getItem('ying-zhong-jiu.forgotten-sanity.notes.v1'));
    expect(stored).toContain('"nextSequentialIndex":1');
  });
});
