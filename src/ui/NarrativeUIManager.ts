import Phaser from 'phaser';

import { GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';
import { getDisplayName, getPortraitKey, getRolePromptBorderColor, setNarrativeUiDebugState } from './uiState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from './uiTheme';

// ── Dialogue layout constants ────────────────────────────────────
const DIALOGUE_BG_HEIGHT = 132;
const DIALOGUE_BG_WIDTH = 720;
const DIALOGUE_BG_Y = 628;

// Compute derived positions relative to the centred dialogue background
const BG_LEFT = (GAME_WIDTH - DIALOGUE_BG_WIDTH) / 2;

const PORTRAIT_SIZE = 116;
const PORTRAIT_X = BG_LEFT + 28 + PORTRAIT_SIZE / 2;
const PORTRAIT_Y = DIALOGUE_BG_Y - DIALOGUE_BG_HEIGHT / 2 - PORTRAIT_SIZE / 2 + 8;

const DIALOGUE_TEXT_X = BG_LEFT + 176;
const DIALOGUE_SPEAKER_Y = DIALOGUE_BG_Y - DIALOGUE_BG_HEIGHT / 2 + 12;
const DIALOGUE_TEXT_Y = DIALOGUE_SPEAKER_Y + 26;

// Word-wrap: don't extend past the right edge of the background
const BG_RIGHT = BG_LEFT + DIALOGUE_BG_WIDTH;
const DIALOGUE_WORD_WRAP = BG_RIGHT - DIALOGUE_TEXT_X - 30;

// ── Layout constants for other UI elements ────────────────────────
const TASK_Y = 34;
const TASK_HEIGHT = 44;

const ROLE_PROMPT_CARD_WIDTH = 420;
const ROLE_PROMPT_CARD_HEIGHT = 220;

const TIMER_X = 1200;
const TIMER_Y = 100;

// ── Depth constants ───────────────────────────────────────────────
const UI_BG_DEPTH = 1000;
const UI_TEXT_DEPTH = 1001;
const UI_OVERLAY_DEPTH = 1002;
const CURTAIN_DEPTH = 2000;
const CURTAIN_TEXT_DEPTH = 2001;

export class NarrativeUIManager {
  private scene: Phaser.Scene;

  // Task UI elements
  private taskBg: Phaser.GameObjects.Rectangle;
  private taskText: Phaser.GameObjects.Text;

  // Dialogue UI elements
  private dialogueBg: Phaser.GameObjects.Rectangle;
  private dialoguePortrait: Phaser.GameObjects.Image;
  private dialogueSpeakerText: Phaser.GameObjects.Text;
  private dialogueBodyText: Phaser.GameObjects.Text;

  // Role prompt
  private rolePromptBg: Phaser.GameObjects.Rectangle;
  private rolePromptCard: Phaser.GameObjects.Rectangle;
  private rolePromptTitleText: Phaser.GameObjects.Text;
  private rolePromptText: Phaser.GameObjects.Text;

  // Timer
  private timerText: Phaser.GameObjects.Text;

  // Curtain
  private curtainBg: Phaser.GameObjects.Rectangle;
  private curtainImage: Phaser.GameObjects.Image | null;
  private curtainTitleText: Phaser.GameObjects.Text;
  private curtainSubtitleText: Phaser.GameObjects.Text;

  // Minor ending overlay (shown after returnsToCheckpoint endings, blocks until
  // the player clicks the "返回检查点" button).
  private minorEndingBg: Phaser.GameObjects.Rectangle;
  private minorEndingTitleText: Phaser.GameObjects.Text;
  private minorEndingBodyText: Phaser.GameObjects.Text;
  private minorEndingButtonBg: Phaser.GameObjects.Rectangle;
  private minorEndingButtonText: Phaser.GameObjects.Text;
  private minorEndingOnConfirm: (() => void) | null = null;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // --- Task UI ---
    this.taskBg = scene.add
      .rectangle(GAME_WIDTH / 2, TASK_Y, 640, TASK_HEIGHT, UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panel)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_BG_DEPTH)
      .setVisible(false);
    applyPixelStrokeStyle(this.taskBg, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.95);

    this.taskText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, TASK_Y, '', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '22px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_TEXT_DEPTH)
      .setVisible(false);

    // --- Dialogue UI ---
    this.dialogueBg = scene.add
      .rectangle(GAME_WIDTH / 2, DIALOGUE_BG_Y, DIALOGUE_BG_WIDTH, DIALOGUE_BG_HEIGHT, UI_THEME.colors.surface, UI_THEME.alpha.panelStrong)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_BG_DEPTH)
      .setVisible(false);
    applyPixelStrokeStyle(this.dialogueBg, UI_THEME.stroke.medium, UI_THEME.colors.border, 0.98);

    this.dialoguePortrait = scene.add
      .image(PORTRAIT_X, PORTRAIT_Y, '')
      .setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_TEXT_DEPTH + 1)
      .setVisible(false);

    this.dialogueSpeakerText = applyPixelTextStyle(scene.add
      .text(DIALOGUE_TEXT_X, DIALOGUE_SPEAKER_Y, '', {
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '22px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_TEXT_DEPTH)
      .setVisible(false);

    this.dialogueBodyText = applyPixelTextStyle(scene.add
      .text(DIALOGUE_TEXT_X, DIALOGUE_TEXT_Y, '', {
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        lineSpacing: 7,
        wordWrap: { width: DIALOGUE_WORD_WRAP },
      })
    )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_TEXT_DEPTH)
      .setVisible(false);

    // --- Role prompt ---
    this.rolePromptBg = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x050506, 0.94)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 10)
      .setVisible(false);

    this.rolePromptCard = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, ROLE_PROMPT_CARD_WIDTH, ROLE_PROMPT_CARD_HEIGHT, UI_THEME.colors.surface, 0.98)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 11)
      .setVisible(false);
    applyPixelStrokeStyle(this.rolePromptCard, UI_THEME.stroke.medium, UI_THEME.colors.border, 1);

    this.rolePromptTitleText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 58, '你现在是', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '30px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 12)
      .setVisible(false);

    this.rolePromptText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, '', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '52px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 12)
      .setVisible(false);

    // --- Timer ---
    this.timerText = applyPixelTextStyle(scene.add
      .text(TIMER_X, TIMER_Y, '', {
        align: 'right',
        color: UI_THEME.colors.textDanger,
        fontFamily: UI_THEME.font.ui,
        fontSize: '36px',
        fontStyle: 'bold',
        backgroundColor: '#141018ee',
        padding: { x: 16, y: 8 },
      })
    )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_OVERLAY_DEPTH)
      .setVisible(false);

    // --- Curtain ---
    this.curtainBg = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH)
      .setVisible(false);
    this.curtainImage = null;

    this.curtainTitleText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '56px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_TEXT_DEPTH)
      .setVisible(false);

    this.curtainSubtitleText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, '', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_TEXT_DEPTH)
      .setVisible(false);

    // --- Minor ending overlay ---
    // Sits above curtain (depth +5) so it overlays even if a curtain was last
    // raised. Title "小结局" + body text + single "返回检查点" button.
    this.minorEndingBg = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 5)
      .setVisible(false);

    this.minorEndingTitleText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 140, '小结局', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '60px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 6)
      .setVisible(false);

    this.minorEndingBodyText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '36px',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 6)
      .setVisible(false);

    this.minorEndingButtonBg = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 280, 64, UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 6)
      .setVisible(false);
    applyPixelStrokeStyle(this.minorEndingButtonBg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 1);

    this.minorEndingButtonText = applyPixelTextStyle(scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, '返回检查点', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '24px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(CURTAIN_DEPTH + 7)
      .setVisible(false);

    this.minorEndingButtonBg.setInteractive({ useHandCursor: true });
    this.minorEndingButtonBg.on('pointerover', () => {
      this.minorEndingButtonBg.setFillStyle(UI_THEME.colors.surfaceMuted, UI_THEME.alpha.controlActive);
    });
    this.minorEndingButtonBg.on('pointerout', () => {
      this.minorEndingButtonBg.setFillStyle(UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong);
    });
    this.minorEndingButtonBg.on('pointerdown', () => {
      const handler = this.minorEndingOnConfirm;
      // Defer the callback to avoid firing while the input event is still
      // being dispatched (and to let the caller hide the UI before it runs
      // engine logic).
      if (handler) handler();
    });

    // Expose on window for e2e tests
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_NARRATIVE_UI__ = this;
    }
  }

  // ---- Public API ----

  public setTask(text: string): void {
    const isEmpty = text === '' || text === '无';
    const visible = !isEmpty;

    this.taskBg.setVisible(visible);
    this.taskText.setVisible(visible);

    if (visible) {
      this.taskText.setText(text);
      // Adjust bg width to fit text
      this.taskBg.setDisplaySize(Math.min(900, Math.max(640, this.taskText.width + 56)), TASK_HEIGHT);
    }

    setNarrativeUiDebugState({ taskVisible: visible, taskText: text });
  }

  public setDialogue(speaker: string, text: string, portraitKey?: string, visible = true, tone?: string, bodyAction?: string): void {
    this.dialogueBg.setVisible(visible);
    this.dialogueSpeakerText.setVisible(visible);
    this.dialogueBodyText.setVisible(visible);
    this.dialoguePortrait.setVisible(visible && portraitKey !== undefined);

    if (visible) {
      this.dialogueSpeakerText.setText(speaker);
      const bodyActionPrefix = bodyAction ? `（${bodyAction}）\n` : '';
      const toneSuffix = tone ? `\n（${tone}）` : '';
      this.dialogueBodyText.setText(`${bodyActionPrefix}${text}${toneSuffix}`);

      if (portraitKey) {
        this.dialoguePortrait.setTexture(portraitKey);
        this.dialoguePortrait.setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);
        this.dialoguePortrait.setScale(
          PORTRAIT_SIZE / this.dialoguePortrait.width,
          PORTRAIT_SIZE / this.dialoguePortrait.height,
        );
        this.dialoguePortrait.setVisible(true);
      } else {
        this.dialoguePortrait.setVisible(false);
      }
    }

    setNarrativeUiDebugState({
      dialogueVisible: visible,
      dialogueSpeaker: speaker,
      dialogueText: text,
      dialoguePortraitKey: portraitKey ?? null,
    });
  }

  public setRolePrompt(characterId: string, displayName?: string): void {
    const name = displayName ?? getDisplayName(characterId);
    const visible = characterId !== '' && characterId !== 'unknown';

    this.rolePromptBg.setVisible(visible);
    this.rolePromptCard.setVisible(visible);
    this.rolePromptTitleText.setVisible(visible);
    this.rolePromptText.setVisible(visible);

    if (visible) {
      this.rolePromptText.setText(name);
      applyPixelStrokeStyle(this.rolePromptCard, UI_THEME.stroke.medium, getRolePromptBorderColor(characterId), 1);
    }

    setNarrativeUiDebugState({
      rolePromptVisible: visible,
      roleCharacterId: characterId,
      roleDisplayName: name,
    });
  }

  public isRolePromptBlocking(): boolean {
    return true;
  }

  public setTimer(remainingMs: number, visible = true): void {
    this.timerText.setVisible(visible);

    if (visible) {
      const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.timerText.setText(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    }

    setNarrativeUiDebugState({
      timerVisible: visible,
      timerRemainingMs: remainingMs,
    });
  }

  public setCurtain(visible: boolean, title?: string, subtitle?: string, textureKey?: string): void {
    this.curtainBg.setVisible(visible);
    this.curtainTitleText.setVisible(visible);
    this.curtainSubtitleText.setVisible(visible);

    if (visible) {
      this.curtainTitleText.setText(title ?? '下一幕');
      this.curtainSubtitleText.setText(subtitle ?? '敬请期待');
      if (textureKey) {
        if (!this.curtainImage) {
          this.curtainImage = this.scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, textureKey).setDepth(CURTAIN_DEPTH + 1).setScrollFactor(0).setVisible(false);
        }
        this.curtainImage.setTexture(textureKey);
        this.curtainImage.setVisible(true);
      } else if (this.curtainImage) {
        this.curtainImage.setVisible(false);
      }
    } else if (this.curtainImage) {
      this.curtainImage.setVisible(false);
    }

    setNarrativeUiDebugState({
      curtainVisible: visible,
      curtainTitle: title ?? '下一幕',
      curtainSubtitle: subtitle ?? '敬请期待',
    });
  }

  public setMinorEnding(visible: boolean, body?: string, onConfirm?: () => void): void {
    this.minorEndingBg.setVisible(visible);
    this.minorEndingTitleText.setVisible(visible);
    this.minorEndingBodyText.setVisible(visible);
    this.minorEndingButtonBg.setVisible(visible);
    this.minorEndingButtonText.setVisible(visible);

    if (visible) {
      this.minorEndingBodyText.setText(body ?? '');
      this.minorEndingOnConfirm = onConfirm ?? null;
      // Reset hover fill so re-shows start in a clean state
      this.minorEndingButtonBg.setFillStyle(UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong);
    } else {
      this.minorEndingOnConfirm = null;
    }

    setNarrativeUiDebugState({
      minorEndingVisible: visible,
      minorEndingBody: visible ? body ?? '' : '',
    });
  }

  public setVisible(element: 'task' | 'dialogue' | 'rolePrompt' | 'timer' | 'curtain' | 'minorEnding', visible: boolean): void {
    switch (element) {
      case 'task':
        this.taskBg.setVisible(visible);
        this.taskText.setVisible(visible);
        break;
      case 'dialogue':
        this.dialogueBg.setVisible(visible);
        this.dialogueSpeakerText.setVisible(visible);
        this.dialogueBodyText.setVisible(visible);
        this.dialoguePortrait.setVisible(visible);
        break;
      case 'rolePrompt':
        this.rolePromptBg.setVisible(visible);
        this.rolePromptCard.setVisible(visible);
        this.rolePromptTitleText.setVisible(visible);
        this.rolePromptText.setVisible(visible);
        setNarrativeUiDebugState({ rolePromptVisible: visible });
        break;
      case 'timer':
        this.timerText.setVisible(visible);
        break;
      case 'curtain':
        this.curtainBg.setVisible(visible);
        this.curtainTitleText.setVisible(visible);
        this.curtainSubtitleText.setVisible(visible);
        break;
      case 'minorEnding':
        this.minorEndingBg.setVisible(visible);
        this.minorEndingTitleText.setVisible(visible);
        this.minorEndingBodyText.setVisible(visible);
        this.minorEndingButtonBg.setVisible(visible);
        this.minorEndingButtonText.setVisible(visible);
        if (!visible) {
          this.minorEndingOnConfirm = null;
        }
        setNarrativeUiDebugState({ minorEndingVisible: visible });
        break;
    }
  }

  // ---- Internal helpers ----

  public getDisplayName(characterId: string): string {
    return getDisplayName(characterId);
  }

  public getPortraitKey(characterId: string): string | undefined {
    return getPortraitKey(characterId);
  }

  public getVisualDebugState(): Record<string, unknown> {
    return {
      theme: 'dark-pixel-horror',
      task: this.boundsOf(this.taskBg),
      dialogue: this.boundsOf(this.dialogueBg),
      dialoguePortrait: this.dialoguePortrait.visible ? this.imageDisplayBoundsOf(this.dialoguePortrait) : null,
      rolePrompt: this.boundsOf(this.rolePromptBg),
      rolePromptCard: this.boundsOf(this.rolePromptCard),
      colors: {
        task: this.taskBg.fillColor,
        dialogue: this.dialogueBg.fillColor,
        border: UI_THEME.colors.border,
        rolePromptBorder: this.rolePromptCard.strokeColor,
        rolePromptBorderBlue: UI_THEME.colors.borderBlue,
      },
    };
  }

  private boundsOf(object: Phaser.GameObjects.Components.GetBounds & Phaser.GameObjects.Components.Visible): { x: number; y: number; width: number; height: number; visible: boolean } {
    const bounds = object.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, visible: object.visible };
  }

  private imageDisplayBoundsOf(image: Phaser.GameObjects.Image): { x: number; y: number; width: number; height: number; visible: boolean } {
    return {
      x: image.x - image.displayWidth * image.originX,
      y: image.y - image.displayHeight * image.originY,
      width: image.displayWidth,
      height: image.displayHeight,
      visible: image.visible,
    };
  }
}
