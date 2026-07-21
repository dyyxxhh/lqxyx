// tests/e2e/forgotten-sanity-vault-door.spec.ts
// spec §10.1 vault door 全流程 E2E：精英击杀 → 钥匙掉落 → 解锁 → 免费宝箱。
// plan 2026-07-19 Task 23：移除 test.fixme，真实化流程。
//
// 流程：主菜单 → hub → 进入墓穴 → run 场景就绪 →
//   1) __testTriggerEliteDefeat 发放仓库钥匙
//   2) __testMovePlayerToVaultDoor 瞬移到 vault door
//   3) 按 H 解锁 vault door（消耗钥匙）
//   4) __testSpawnChest('vault', true) 生成 vault 宝箱（forceOpen 免费开）
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type TestHooks = {
  __testTriggerEliteDefeat?: () => void;
  __testGetInventorySummary?: () => { items: Record<string, number>; vaultKey: number };
  __testMovePlayerToVaultDoor?: () => void;
  __testSpawnChest?: (roomId: string, isVaultChest: boolean) => void;
  __testGetVaultState?: () => { doorUnlocked: boolean; chestsOpened: number };
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

test('vault door flow: elite defeat → key drop → unlock → free chest', async ({ page }) => {
  await navigateToRunScene(page);

  // 1. 触发精英击杀 → 发放仓库钥匙 + 红边雾战 + 复制 + 2s 冻结
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  });

  // 2. 断言钥匙已发放
  const inv = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetInventorySummary?.(),
  );
  expect(inv?.vaultKey ?? 0).toBeGreaterThanOrEqual(1);

  // 3. 瞬移到 vault door
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerToVaultDoor?.();
  });
  await page.waitForTimeout(50);

  // 4. 按 H 解锁 vault door（消耗 1 把钥匙）
  await page.keyboard.press('H');
  await page.waitForTimeout(50);
  const vaultState1 = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetVaultState?.(),
  );
  expect(vaultState1?.doorUnlocked).toBe(true);

  // 5. 在 vault 房间生成 vault 宝箱（isVaultChest=true → forceOpen 免费开）
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testSpawnChest?.('vault', true);
  });
  await page.waitForTimeout(100);

  // 6. 断言宝箱已破译
  const vaultState2 = await page.evaluate(() =>
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetVaultState?.(),
  );
  expect(vaultState2?.chestsOpened ?? 0).toBeGreaterThanOrEqual(1);
});
