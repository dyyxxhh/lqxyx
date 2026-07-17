import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__?: boolean;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readHubActive(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_TOMB_RAID_HUB_ACTIVE__ === true);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

test('摸金模式入口：主菜单 → 枢纽 → 返回主菜单', async ({ page }) => {
  await page.goto('/');

  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });

  // 点击「摸金模式」按钮（游戏坐标 640,440 = GAME_WIDTH/2, GAME_HEIGHT/2+80）
  await clickGamePoint(page, 640, 440);

  // 进入枢纽：hub 活跃全局翻为 true
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);

  // 点击「返回主菜单」按钮（游戏坐标 640,480 = GAME_WIDTH/2, GAME_HEIGHT/2+120）
  await clickGamePoint(page, 640, 480);

  // 返回主菜单：hub 全局翻为 false（SHUTDOWN 清理）
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(false);
  // GameScene 重新就绪
  await expect.poll(() => readState(page), { timeout: 15_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
});
