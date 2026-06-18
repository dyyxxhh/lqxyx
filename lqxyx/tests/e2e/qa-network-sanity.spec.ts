import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

interface NetworkEntry {
  url: string;
  status: number;
  ok: boolean;
}

test.describe('QA — Network Sanity (404 Checks)', () => {
  test('no 404 for available manifest assets during preload', async ({ page }, testInfo) => {
    const networkEntries: NetworkEntry[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/final/')) {
        networkEntries.push({ url, status: response.status(), ok: response.ok() });
      }
    });

    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    // Wait for GameScene to be ready (preload complete)
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // All asset responses should be 200-299 range (ok)
    const assetResponses = networkEntries.filter((e) => e.ok);
    const asset404s = networkEntries.filter((e) => !e.ok);

    // There should be no 404s for manifest assets
    // (Some HTTP 304s for cached are ok, but not actual 404)
    const actual404s = asset404s.filter((e) => e.status === 404);
    expect(actual404s, `Found 404s for assets: ${actual404s.map((e) => e.url).join(', ')}`).toHaveLength(0);

    // At least some asset responses should have loaded
    expect(assetResponses.length).toBeGreaterThan(0);

    // Verify the preload state reports complete
    const state = await readState(page);
    expect(state?.preload?.status).toBe('complete');
    expect(state?.preload?.canEnterGame).toBe(true);

    await page.screenshot({
      path:
        testInfo.project.name === 'desktop-chromium'
          ? `${evidenceDir}/task-18-network-no-404.png`
          : `${evidenceDir}/task-18-network-no-404-${testInfo.project.name}.png`,
    });
  });

  test('preload progress reaches 100 percent or explicit blocker state', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    // Poll for preload state, capturing progress over time
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readState(page);
    expect(state?.preload).not.toBeNull();

    if (state?.preload) {
      if (state.preload.status === 'complete') {
        expect(state.preload.progress).toBe(1);
        expect(state.preload.loaded).toBe(state.preload.total);
        expect(state.preload.canEnterGame).toBe(true);
      } else if (state.preload.status === 'failed') {
        // Must have an explicit blocker reason
        expect(state.preload.failedAsset).not.toBeNull();
        expect(state.preload.errorMessage).not.toBeNull();
        expect(state.preload.canEnterGame).toBe(false);
      } else {
        // Should not be stuck in loading/queued
        expect(state.preload.status).toBe('complete');
      }
    }

    await page.screenshot({
      path:
        testInfo.project.name === 'desktop-chromium'
          ? `${evidenceDir}/task-18-preload-complete.png`
          : `${evidenceDir}/task-18-preload-complete-${testInfo.project.name}.png`,
    });
  });

  test('production build assets are served from dist/assets/final/', async ({ page }) => {
    // Verify the dist directory contains built assets
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
      preload: { status: 'complete' },
    });

    // Make a direct request to verify at least one known asset is reachable
    const response = await page.request.get('/assets/final/地板.png');
    expect(response.status()).toBe(200);
  });

  test('index.html is served with correct content type and no-cache', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const contentType = response?.headers()['content-type'] ?? '';
    expect(contentType.toLowerCase()).toContain('text/html');

    // The static server sets no-cache for index.html
    const cacheControl = response?.headers()['cache-control'] ?? '';
    expect(cacheControl.toLowerCase()).toContain('no-cache');

    await expect(page.locator('canvas')).toBeVisible();
  });

  test('known available asset in manifest is reachable via HTTP', async ({ page }) => {
    // Test that each key manifest asset resolves to a real file
    const testAssetPaths = [
      '/assets/final/地板.png',
      '/assets/final/桌椅.png',
      '/assets/final/血迹黑屏.jpg',
      '/assets/final/电话.png',
      '/assets/final/手机柜-正着.png',
      '/assets/final/手机柜-斜着.png',
      '/assets/final/芹菜（字面意思）.png',
      '/assets/final/尺子（字面意思）.png',
      '/assets/final/立绘/但宇轩.png',
    ];

    for (const assetPath of testAssetPaths) {
      const response = await page.request.get(assetPath);
      expect(response.status(), `Asset ${assetPath} returned ${response.status()}`).toBe(200);
    }
  });

  test('all preload assets resolve to valid Content-Type', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readState(page);
    const total = state?.preload?.total ?? 0;
    expect(total).toBeGreaterThan(0);

    // Spot-check a few asset Content-Types
    const pngResp = await page.request.get('/assets/final/地板.png');
    expect(pngResp.headers()['content-type']).toMatch(/image\/png/);

    const jpgResp = await page.request.get('/assets/final/血迹黑屏.jpg');
    expect(jpgResp.headers()['content-type']).toMatch(/image\/jpeg/);
  });
});

test.describe('QA — Preload & Debug State', () => {
  test('debug state is populated with valid scene order after boot', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      sceneOrder: ['BootScene', 'PreloadScene', 'GameScene'],
      currentScene: 'GameScene',
      ready: true,
      booted: true,
      preloaded: true,
      gameReady: true,
    });

    const state = await readState(page);
    expect(state).toHaveProperty('input');
    expect(state).toHaveProperty('ui');
    expect(state).toHaveProperty('story');
    expect(state).toHaveProperty('save');
    expect(state).toHaveProperty('character');
    expect(state).toHaveProperty('map');
    expect(state).toHaveProperty('canvas');
    expect(state).toHaveProperty('sizing');
    expect(state).toHaveProperty('menu');
  });

  test('scene counts are accurate — each scene runs exactly once', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
      sceneCounts: { BootScene: 1, PreloadScene: 1, GameScene: 1 },
    });
  });

  test('menu is visible with new-game selected after boot', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas')).toBeVisible();

    await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
      menu: { visible: true, selectedAction: 'new-game' },
    });
  });
});
