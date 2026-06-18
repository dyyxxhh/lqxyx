import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const getEngineState = async () => page.evaluate(() => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.getCurrentState() ?? 'unknown');
  const engineAdvance = async () => page.evaluate(() => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.advance());
  const engineStart = async (id) => page.evaluate((cp) => window.__YING_ZHONG_JIU_EVENT_ENGINE__?.startFromCheckpoint(cp), id);
  const readState = async () => page.evaluate(() => window.__YING_ZHONG_JIU_SCENE_STATE__);

  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(2000);
  const canvas = await page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.51);
  await page.waitForTimeout(1500);

  await engineStart('B');
  await page.waitForTimeout(800);
  
  for (let i = 0; i < 6; i++) {
    const state = await getEngineState();
    if (state === 'awaiting_advance') await engineAdvance();
    await page.waitForTimeout(200);
  }
  
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/qa-bug4-tone-display.png', fullPage: false });
  const state = await readState();
  console.log('Tone dialogue text:', state?.ui?.dialogueText);
  console.log('Tone dialogue speaker:', state?.ui?.dialogueSpeaker);

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
