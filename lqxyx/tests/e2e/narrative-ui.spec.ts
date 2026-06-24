import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

const evidenceDir = '.omo/evidence';
const auditEvidenceDir = '.omo/evidence/gameplay-polish-script-audit';

type VisualBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

type SceneWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_NARRATIVE_UI__?: {
      setTask(text: string): void;
      setDialogue(speaker: string, text: string, portraitKey?: string, visible?: boolean): void;
      setRolePrompt(characterId: string, displayName?: string): void;
      setTimer(remainingMs: number, visible?: boolean): void;
      setCurtain(visible: boolean, title?: string, subtitle?: string): void;
      setMinorEnding(visible: boolean, body?: string): void;
      setVisible(element: string, visible: boolean): void;
      getDisplayName(characterId: string): string;
      getPortraitKey(characterId: string): string | undefined;
      getVisualDebugState(): {
        task?: VisualBox;
        timer?: VisualBox;
        rolePromptCard?: VisualBox;
        rolePromptTitle?: VisualBox;
        rolePromptPortrait?: VisualBox | null;
        rolePromptName?: VisualBox;
        curtainTitle?: VisualBox;
        curtainSubtitleCapsule?: VisualBox;
        curtainSubtitle?: VisualBox;
        minorEndingTitle?: VisualBox;
        minorEndingBody?: VisualBox;
        minorEndingButton?: VisualBox;
        minorEndingButtonText?: VisualBox;
        colors?: { rolePromptBorder?: number; rolePromptBorderBlue?: number; border?: number; timer?: string; timerBackground?: string | number };
      };
    };
  };

async function readSceneState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

function expectInsideDesignViewport(box: VisualBox): void {
  expect(box.visible).toBe(true);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  expect(box.y + box.height).toBeLessThanOrEqual(720);
}

function expectBoxesSeparated(first: VisualBox, second: VisualBox): void {
  const overlaps = first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
  expect(overlaps).toBe(false);
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

  test('final curtain layout keeps title, subtitle, and capsule inside the design viewport', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setCurtain(true, '"报假警"', '敬请期待');
    });

    const visualState = await page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
    });
    const curtainTitle = visualState?.curtainTitle;
    const curtainSubtitleCapsule = visualState?.curtainSubtitleCapsule;
    const curtainSubtitle = visualState?.curtainSubtitle;
    if (!curtainTitle || !curtainSubtitleCapsule || !curtainSubtitle) throw new Error('Missing curtain visual bounds');

    expectInsideDesignViewport(curtainTitle);
    expectInsideDesignViewport(curtainSubtitleCapsule);
    expectInsideDesignViewport(curtainSubtitle);
    expectBoxesSeparated(curtainTitle, curtainSubtitleCapsule);
    await page.screenshot({ path: `${auditEvidenceDir}/t8b-final-curtain-layout.png` });
  });
});

test.describe('narrative UI - minor ending', () => {
  test('minor ending hides stale dialogue and timer and keeps overlay content inside the design viewport', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setDialogue('杨云', '这里不该继续显示。', 'portrait.yangYunBlue', true);
      ui?.setTimer(30_000, true);
      ui?.setMinorEnding(true, '你触发了错误的选择。');
    });

    await expect
      .poll(() => readSceneState(page), { timeout: 5_000 })
      .toMatchObject({ ui: { minorEndingVisible: true, dialogueVisible: false, timerVisible: false } });

    const visualState = await page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
    });
    const minorEndingTitle = visualState?.minorEndingTitle;
    const minorEndingBody = visualState?.minorEndingBody;
    const minorEndingButton = visualState?.minorEndingButton;
    const minorEndingButtonText = visualState?.minorEndingButtonText;
    if (!minorEndingTitle || !minorEndingBody || !minorEndingButton || !minorEndingButtonText) throw new Error('Missing minor ending visual bounds');

    expectInsideDesignViewport(minorEndingTitle);
    expectInsideDesignViewport(minorEndingBody);
    expectInsideDesignViewport(minorEndingButton);
    expectInsideDesignViewport(minorEndingButtonText);
    expectBoxesSeparated(minorEndingTitle, minorEndingBody);
    expectBoxesSeparated(minorEndingBody, minorEndingButton);
    await page.screenshot({ path: `${auditEvidenceDir}/t8b-minor-ending-layout.png` });
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

  test('role prompt renders the D10 portrait composition in the real canvas UI', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.setRolePrompt('yangYunBlue', '杨云');
    });

    await expect
      .poll(() => page.evaluate(() => {
        const visualState = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
        return {
          debug: (window as SceneWindow).__YING_ZHONG_JIU_SCENE_STATE__?.ui,
          visual: visualState,
        };
      }), { timeout: 5_000 })
      .toMatchObject({
        debug: {
          rolePromptVisible: true,
          roleCharacterId: 'yangYunBlue',
          roleDisplayName: '杨云',
        },
        visual: {
          rolePromptPortrait: { visible: true },
          colors: { rolePromptBorder: 0x1f3f6b },
        },
      });

    const rolePromptState = await page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
    });

    expect(rolePromptState?.rolePromptTitle?.visible).toBe(true);
    expect(Math.abs((rolePromptState?.rolePromptTitle?.x ?? 0) + (rolePromptState?.rolePromptTitle?.width ?? 0) / 2 - 640)).toBeLessThanOrEqual(2);
    expect(rolePromptState?.rolePromptPortrait?.visible).toBe(true);
    expect(rolePromptState?.rolePromptName?.visible).toBe(true);
    expect(rolePromptState?.rolePromptPortrait?.x).toBeLessThan(rolePromptState?.rolePromptName?.x ?? 0);
    expect(rolePromptState?.rolePromptName?.y).toBeGreaterThan(rolePromptState?.rolePromptPortrait?.y ?? 0);
    if (rolePromptState?.rolePromptPortrait && rolePromptState.rolePromptName) {
      expectBoxesSeparated(rolePromptState.rolePromptPortrait, rolePromptState.rolePromptName);
    }
    expect(rolePromptState?.rolePromptCard?.x).toBeGreaterThanOrEqual(0);
    expect((rolePromptState?.rolePromptCard?.x ?? 0) + (rolePromptState?.rolePromptCard?.width ?? 0)).toBeLessThanOrEqual(1280);
    expect(rolePromptState?.rolePromptCard?.y).toBeGreaterThanOrEqual(0);
    expect((rolePromptState?.rolePromptCard?.y ?? 0) + (rolePromptState?.rolePromptCard?.height ?? 0)).toBeLessThanOrEqual(720);
    await page.screenshot({ path: `${auditEvidenceDir}/t8a-role-prompt-d10-yang-blue.png` });
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

  test('task and timer HUD remain inside the viewport with danger timer styling', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => readSceneState(page), { timeout: 30_000 }).toMatchObject({
      currentScene: 'GameScene',
      ready: true,
    });

    await page.evaluate(() => {
      const ui = (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__;
      ui?.setTask('当前任务：调查教学楼');
      ui?.setTimer(30_000, true);
    });

    const visualState = await page.evaluate(() => {
      return (window as SceneWindow).__YING_ZHONG_JIU_NARRATIVE_UI__?.getVisualDebugState();
    });
    const task = visualState?.task;
    const timer = visualState?.timer;
    if (!task || !timer) throw new Error('Missing HUD visual bounds');

    expectInsideDesignViewport(task);
    expectInsideDesignViewport(timer);
    expect(visualState?.colors?.timer).toBe('#ff7a72');
    expect(visualState?.colors?.timerBackground).toBe(0x141018);
    await page.screenshot({ path: `${auditEvidenceDir}/t8c-task-timer-hud.png` });
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
