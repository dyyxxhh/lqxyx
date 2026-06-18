import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_NARRATIVE_UI__?: {
      setTask(text: string): void;
      setDialogue(speaker: string, text: string, portraitKey?: string, visible?: boolean): void;
      setRolePrompt(characterId: string, displayName?: string): void;
      setTimer(remainingMs: number, visible?: boolean): void;
      setCurtain(visible: boolean, title?: string, subtitle?: string): void;
      setVisible(element: string, visible: boolean): void;
      getDisplayName(characterId: string): string;
      getPortraitKey(characterId: string): string | undefined;
      getVisualDebugState(): { colors?: { rolePromptBorder?: number; rolePromptBorderBlue?: number; border?: number } };
    };
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

test.describe('narrative UI - task overlay', () => {
  test('task is initially hidden', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readSceneState(page);
    expect(state?.ui.taskVisible).toBe(false);
    expect(state?.ui.taskText).toBe('');
  });

  test('setTask with non-empty text makes task visible', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('寻找出路');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { taskVisible: true, taskText: '寻找出路' } });
  });

  test('setTask with 无 hides task', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // First set a visible task
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('找到但宇轩');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { taskVisible: true, taskText: '找到但宇轩' } });

    // Then set to 无
    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('无');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { taskVisible: false, taskText: '无' } });
  });

  test('setTask with empty string hides task', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { taskVisible: false, taskText: '' } });
  });
});

test.describe('narrative UI - curtain', () => {
  test('curtain is initially hidden with correct defaults', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readSceneState(page);
    expect(state?.ui.curtainVisible).toBe(false);
    expect(state?.ui.curtainTitle).toBe('下一幕');
    expect(state?.ui.curtainSubtitle).toBe('敬请期待');
  });

  test('setCurtain shows 下一幕 and 敬请期待', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setCurtain(true, '下一幕', '敬请期待');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          curtainVisible: true,
          curtainTitle: '下一幕',
          curtainSubtitle: '敬请期待',
        },
      });
  });

  test('setCurtain can be hidden after showing', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setCurtain(true, '下一幕', '敬请期待');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { curtainVisible: true } });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setCurtain(false);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { curtainVisible: false } });
  });

  test('setCurtain uses default title/subtitle when not provided', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setCurtain(true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          curtainVisible: true,
          curtainTitle: '下一幕',
          curtainSubtitle: '敬请期待',
        },
      });
  });
});

test.describe('narrative UI - dialogue', () => {
  test('dialogue is initially hidden with empty fields', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readSceneState(page);
    expect(state?.ui.dialogueVisible).toBe(false);
    expect(state?.ui.dialogueSpeaker).toBe('');
    expect(state?.ui.dialogueText).toBe('');
  });

  test('setDialogue shows speaker and text', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('杨云', '大胆！但宇轩！！可别让我抓到你。', 'portrait.yangYunRed', true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          dialogueVisible: true,
          dialogueSpeaker: '杨云',
          dialogueText: '大胆！但宇轩！！可别让我抓到你。',
          dialoguePortraitKey: 'portrait.yangYunRed',
        },
      });
  });

  test('setDialogue with 董继豪 shows correct speaker and portrait', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('董继豪', '我操！真的假的？', 'portrait.dongJihao', true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          dialogueVisible: true,
          dialogueSpeaker: '董继豪',
          dialogueText: '我操！真的假的？',
          dialoguePortraitKey: 'portrait.dongJihao',
        },
      });
  });

  test('dialogue speaker display name is never 杨云红边 or 杨云蓝边', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Set dialogue with speaker "杨云" (red state)
    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('杨云', '但宇轩……听着也很好吃呢。', 'portrait.yangYunRed', true);
    });

    const redState = await readSceneState(page);
    expect(redState?.ui.dialogueSpeaker).toBe('杨云');
    // Portrait should use the correct internal key
    expect(redState?.ui.dialoguePortraitKey).toBe('portrait.yangYunRed');

    // Set dialogue with speaker "杨云" (blue state)
    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('杨云', '我干了什么？！！！', 'portrait.yangYunBlue', true);
    });

    const blueState = await readSceneState(page);
    expect(blueState?.ui.dialogueSpeaker).toBe('杨云');
    expect(blueState?.ui.dialoguePortraitKey).toBe('portrait.yangYunBlue');
  });

  test('setDialogue can hide dialogue', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('？？？', '皇上不好了', undefined, true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { dialogueVisible: true } });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('', '', undefined, false);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { dialogueVisible: false } });
  });
});

test.describe('narrative UI - role prompt', () => {
  test('role prompt is initially hidden', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readSceneState(page);
    expect(state?.ui.rolePromptVisible).toBe(false);
  });

  test('setRolePrompt shows 杨云 for yangYunRed', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('yangYunRed', '杨云');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          rolePromptVisible: true,
          roleCharacterId: 'yangYunRed',
          roleDisplayName: '杨云',
        },
      });
  });

  test('setRolePrompt shows 杨云 for yangYunBlue', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('yangYunBlue', '杨云');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          rolePromptVisible: true,
          roleCharacterId: 'yangYunBlue',
          roleDisplayName: '杨云',
        },
      });
  });

  test('setRolePrompt shows 董继豪 for dongJihao', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('dongJihao', '董继豪');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          rolePromptVisible: true,
          roleCharacterId: 'dongJihao',
          roleDisplayName: '董继豪',
        },
      });
  });

  test('role prompt applies blue and red border colors in the real canvas UI', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('yangYunBlue', '杨云');
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState().colors?.rolePromptBorder;
    })).toBe(0x1f3f6b);
    await page.screenshot({ path: `${evidenceDir}/role-prompt-yang-blue-border.png` });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('yangYunRed', '杨云');
    });
    await expect.poll(() => page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState().colors?.rolePromptBorder;
    })).toBe(0x6b1f2c);
    await page.screenshot({ path: `${evidenceDir}/role-prompt-yang-red-border.png` });
  });
});

test.describe('narrative UI - timer', () => {
  test('timer is initially hidden', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const state = await readSceneState(page);
    expect(state?.ui.timerVisible).toBe(false);
    expect(state?.ui.timerRemainingMs).toBe(0);
  });

  test('setTimer shows countdown time', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTimer(120_000, true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({
        ui: {
          timerVisible: true,
          timerRemainingMs: 120_000,
        },
      });
  });
});

test.describe('narrative UI - getDisplayName / getPortraitKey', () => {
  test('getDisplayName returns 杨云 for both red and blue', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    const redName = await page.evaluate(
      () => (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getDisplayName('yangYunRed'),
    );
    expect(redName).toBe('杨云');

    const blueName = await page.evaluate(
      () => (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getDisplayName('yangYunBlue'),
    );
    expect(blueName).toBe('杨云');
  });
});

test.describe('narrative UI - screenshots', () => {
  test('captures task visible state', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setTask('找到但宇轩');
    });

    // Wait for task to be visible in debug state
    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { taskVisible: true } });

    await page.screenshot({ path: `${evidenceDir}/task-8-task-ui.png` });
  });

  test('captures curtain state', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setCurtain(true, '下一幕', '敬请期待');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { curtainVisible: true } });

    await page.screenshot({ path: `${evidenceDir}/task-8-curtain.png` });
  });

  test('captures dialogue state', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    // Use a portrait texture that was preloaded
    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('董继豪', '我操！真的假的？芹菜你别吓我。', 'portrait.dongJihao', true);
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { dialogueVisible: true } });

    await page.screenshot({ path: `${evidenceDir}/task-8-dialogue.png` });
  });
});
