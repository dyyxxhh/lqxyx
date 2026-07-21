// tests/e2e/forgotten-sanity-fog-of-war.spec.ts
// spec §9.2 雾战脚步点亮 E2E：玩家移动到新房间 → exploredCells 累积。
// plan 2026-07-19 Task 23：新建 spec。
//
// 流程：run 场景就绪 → 记录初始 exploredCells → 瞬移到 exit 房间 →
//   等待 update() 推进 → 断言 exploredCells 增长 → 瞬移到 vault 房间 → 再次增长。
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type TestHooks = {
  __testGetExploredCells?: () => number[];
  __testMovePlayerTo?: (roomId: string) => void;
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

async function navigateToRunScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
  await clickGamePoint(page, 640, 440);
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);
  await clickGamePoint(page, 1072, 56);
  await expect.poll(
    async () => (await readState(page))?.forgottenSanity?.scene,
    { timeout: 20_000 },
  ).toBe('run');
}

async function getExploredCells(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetExploredCells?.() ?? [],
  );
}

test('fog-of-war: explored cells accumulate as player moves between rooms', async ({ page }) => {
  await navigateToRunScene(page);

  // 1. 初始 exploredCells（玩家在 entrance 房间，至少 1 个 cell）
  await page.waitForTimeout(200); // 等 update() 推进几帧
  const initialCells = await getExploredCells(page);
  expect(initialCells.length).toBeGreaterThanOrEqual(1);

  // 2. 瞬移到 exit 房间 → update() 把新 cell 加入 exploredCells
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerTo?.('exit');
  });
  await page.waitForTimeout(200);
  const afterExitCells = await getExploredCells(page);
  expect(afterExitCells.length).toBeGreaterThan(initialCells.length);

  // 3. 瞬移到 vault 房间 → 再次增长
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerTo?.('vault');
  });
  await page.waitForTimeout(200);
  const afterVaultCells = await getExploredCells(page);
  expect(afterVaultCells.length).toBeGreaterThan(afterExitCells.length);
});
