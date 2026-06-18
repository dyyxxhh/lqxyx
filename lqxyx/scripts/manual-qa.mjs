import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  const getEngineState = async () => page.evaluate(() => {
    return window.__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown';
  });
  const engineAdvance = async () => page.evaluate(() => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
  const engineUpdate = async (d) => page.evaluate((delta) => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.update(delta), d);
  const engineStart = async (id) => page.evaluate((cp) => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint(cp), id);
  const readState = async () => page.evaluate(() => window.__YING_ZHONG_JIU_SCENE_STATE__);

  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(2000);
  
  const canvas = await page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(1500);

  // ── Bug 3: D→E flow ──
  await engineStart('D');
  await page.waitForTimeout(800);
  
  // Pump until awaiting_interaction (office door)
  for (let i = 0; i < 30; i++) {
    const state = await getEngineState();
    if (state === 'awaiting_advance') await engineAdvance();
    else if (state === 'awaiting_interaction') break;
    else if (state === 'waiting') await engineUpdate(500);
    else await page.waitForTimeout(100);
  }
  
  await page.evaluate(() => {
    window.__YING_ZHONG_JIU_EVENT_ENGINE__?.updateLocation('4F', null);
    window.__YING_ZHONG_JIU_PLAY_SCENE_DEBUG__?.setPlayerPosition({ x: 832, y: 868 });
  });
  await page.evaluate(() => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.completeInteraction('F'));
  await page.waitForTimeout(500);
  
  // Pump through fade + blackScreen + bsdw
  for (let i = 0; i < 30; i++) {
    const state = await getEngineState();
    if (state === 'waiting') { await engineUpdate(500); continue; }
    if (state === 'awaiting_advance') { await engineAdvance(); continue; }
    if (state === 'executing' || state === 'idle') { await page.waitForTimeout(200); continue; }
    break;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/qa-bug3-d-to-e.png' });
  const state3 = await readState();
  console.log('Bug3 checkpointId:', state3?.story?.currentCheckpointId);
  console.log('Bug3 engineState:', await getEngineState());

  // ── Bug 4: Tone display ──
  await engineStart('B');
  await page.waitForTimeout(800);
  for (let i = 0; i < 30; i++) {
    const state = await getEngineState();
    if (state === 'awaiting_advance') await engineAdvance();
    else if (state === 'waiting') await engineUpdate(500);
    else break;
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/qa-bug4-tone-display.png' });
  const state4 = await readState();
  console.log('Bug4 dialogueText:', state4?.ui?.dialogueText);
  console.log('Bug4 dialogueVisible:', state4?.ui?.dialogueVisible);

  await browser.close();
  console.log('Screenshots saved to /tmp/qa-*.png');
}

run().catch((e) => { console.error(e); process.exit(1); });
