import Phaser from 'phaser';

import { storyManifest } from '../data/story';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  getSceneDebugState,
  markGameSceneReady,
  markSceneStarted,
  refreshCanvasDebugState,
  refreshSaveDebugState,
} from '../game/scaffoldState';
import { InputManager } from '../input/InputManager';
import { MapRenderer } from '../map/MapRenderer';
import { clearSaveState, exportSaveJson, importSaveJson, loadSaveState, type SaveState } from '../state/saveState';
import { NarrativeUIManager } from '../ui/NarrativeUIManager';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

export class GameScene extends Phaser.Scene {
  private inputManager: InputManager | null = null;
  private narrativeUI: NarrativeUIManager | null = null;
  private mapRenderer: MapRenderer | null = null;
  private startButton!: Phaser.GameObjects.Rectangle;
  private continueButton: Phaser.GameObjects.Rectangle | null = null;
  private continueAffordance: Phaser.GameObjects.GameObject[] = [];
  private saveCodeStatusText: Phaser.GameObjects.Text | null = null;
  private readonly UI_BASE_DEPTH = 980;
  private readonly UI_TEXT_DEPTH = 981;
  private readonly TOMB_RAID_BUTTON_Y = GAME_HEIGHT / 2 + 80;
  private readonly CONTINUE_Y = GAME_HEIGHT / 2 + 152;
  private readonly SETTINGS_TITLE_Y = GAME_HEIGHT / 2 + 216;
  private readonly SETTINGS_BUTTON_Y = GAME_HEIGHT / 2 + 262;

  public constructor() {
    super('GameScene');
  }

  public create(): void {
    this.shutdown();
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    markSceneStarted('GameScene');
    refreshCanvasDebugState();
    const sceneState = markGameSceneReady();
    const hasContinue = sceneState.menu.hasContinue;
    const completedSave = this.hasCompletedSave();

    this.inputManager = new InputManager(this);
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__ = this.inputManager;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_GAME_MENU_DEBUG__ = {
        getContinueAffordanceVisualState: () => this.getContinueAffordanceVisualState(),
      };
    }

    this.narrativeUI = new NarrativeUIManager(this);
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_NARRATIVE_UI__ = this.narrativeUI;
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_NARRATIVE_UI_MANAGER__ = this.narrativeUI;
    }

    this.mapRenderer = new MapRenderer(this, '4F');
    this.mapRenderer.renderCorridor('4F');
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_MAP_RENDERER__ = this.mapRenderer;
    }

    // ── Title ──────────────────────────────────────────────────
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_THEME.colors.surface, 0.58)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH - 1);

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120, '影中咎', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '60px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    // ── Start button ───────────────────────────────────────────
    this.startButton = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, 360, 72, UI_THEME.colors.accent)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.startButton, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 8, '开始新游戏', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    // ── Tomb raid entry button ─────────────────────────────────
    const tombRaidButton = this.add
      .rectangle(GAME_WIDTH / 2, this.TOMB_RAID_BUTTON_Y, 300, 56, UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(tombRaidButton, UI_THEME.stroke.thin, UI_THEME.colors.borderBlue, 0.95);
    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.TOMB_RAID_BUTTON_Y, '摸金模式', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '24px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);
    tombRaidButton.on('pointerover', () => tombRaidButton.setFillStyle(UI_THEME.colors.accentHover, UI_THEME.alpha.panelStrong));
    tombRaidButton.on('pointerout', () => tombRaidButton.setFillStyle(UI_THEME.colors.surfaceRaised, UI_THEME.alpha.panelStrong));
    tombRaidButton.on('pointerdown', () => {
      this.scene.start('TombRaidHubScene');
    });

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.SETTINGS_BUTTON_Y + 84, '第一幕 · 影中咎', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '24px',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH);

    if (hasContinue) {
      if (completedSave) {
        this.createCompletedContinueButton();
      } else {
        this.createContinueButton();
      }
    }

    applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.SETTINGS_TITLE_Y, '设置', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    const exportButton = this.add
      .rectangle(GAME_WIDTH / 2 - 92, this.SETTINGS_BUTTON_Y, 160, 42, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(exportButton, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.95);
    applyPixelTextStyle(this.add
      .text(exportButton.x, exportButton.y, '导出存档', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    const importButton = this.add
      .rectangle(GAME_WIDTH / 2 + 92, exportButton.y, 160, 42, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(importButton, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 0.95);
    applyPixelTextStyle(this.add
      .text(importButton.x, importButton.y, '导入存档', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    this.saveCodeStatusText = applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, exportButton.y + 38, '', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '16px',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);

    exportButton.on('pointerover', () => exportButton.setFillStyle(UI_THEME.colors.accentHover, UI_THEME.alpha.panelStrong));
    exportButton.on('pointerout', () => exportButton.setFillStyle(UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel));
    exportButton.on('pointerdown', () => this.showExportSaveCode());
    importButton.on('pointerover', () => importButton.setFillStyle(UI_THEME.colors.accentHover, UI_THEME.alpha.panelStrong));
    importButton.on('pointerout', () => importButton.setFillStyle(UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel));
    importButton.on('pointerdown', () => this.showImportSaveCode());

    // ── Button handlers ────────────────────────────────────────
    this.startButton.on('pointerover', () => {
      this.startButton.setFillStyle(UI_THEME.colors.accentHover);
    });
    this.startButton.on('pointerout', () => {
      this.startButton.setFillStyle(UI_THEME.colors.accent);
    });
    this.startButton.on('pointerdown', () => {
      this.startNewGame();
    });

    this.continueAvailable = hasContinue && !completedSave;

    // Also allow keyboard F/Enter to start
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-F', this.handleKeyboardF);
      this.input.keyboard.on('keydown-ENTER', this.handleKeyboardEnter);
      this.input.keyboard.on('keydown-C', this.handleKeyboardC);
    }
  }

  public update(): void {
    this.inputManager?.update();
    void this.narrativeUI;
    void this.mapRenderer;
  }

  private continueAvailable = false;

  private handleKeyboardF = (): void => {
    if (!this.scene?.isActive()) return;
    this.startNewGame();
  };

  private handleKeyboardEnter = (): void => {
    if (!this.scene?.isActive()) return;
    this.startNewGame();
  };

  private handleKeyboardC = (): void => {
    if (!this.scene?.isActive()) return;
    if (this.continueAvailable) this.continueGame();
  };

  private startNewGame(): void {
    clearSaveState();
    getSceneDebugState().menu = { visible: true, selectedAction: 'new-game', hasContinue: false };

    this.scene.start('PlayScene');
  }

  private continueGame(): void {
    getSceneDebugState().menu = { ...getSceneDebugState().menu, selectedAction: 'continue' };
    this.scene.start('PlayScene');
  }

  private createContinueButton(): void {
    if (this.continueButton) return;
    const affordance = this.getContinueAffordance();
    this.continueButton = this.add
      .rectangle(GAME_WIDTH / 2, this.CONTINUE_Y, 360, 72, UI_THEME.colors.surfaceMuted)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH)
      .setInteractive({ useHandCursor: true });
    affordance.push(this.continueButton);
    applyPixelStrokeStyle(this.continueButton, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.88);

    const label = applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.CONTINUE_Y, '继续游戏', {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);
    affordance.push(label);

    this.continueButton.on('pointerover', () => {
      this.continueButton?.setFillStyle(UI_THEME.colors.accentHover);
    });
    this.continueButton.on('pointerout', () => {
      this.continueButton?.setFillStyle(UI_THEME.colors.surfaceMuted);
    });
    this.continueButton.on('pointerdown', () => {
      this.continueGame();
    });
  }

  private createCompletedContinueButton(): void {
    const affordance = this.getContinueAffordance();
    const button = this.add
      .rectangle(GAME_WIDTH / 2, this.CONTINUE_Y, 360, 72, UI_THEME.colors.surfaceMuted, UI_THEME.alpha.panel)
      .setOrigin(0.5)
      .setDepth(this.UI_BASE_DEPTH);
    affordance.push(button);

    const title = applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.CONTINUE_Y - 16, '第一幕已完成', {
        align: 'center',
        color: UI_THEME.colors.textGold,
        fontFamily: UI_THEME.font.ui,
        fontSize: '22px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);
    affordance.push(title);

    const subtitle = applyPixelTextStyle(this.add
      .text(GAME_WIDTH / 2, this.CONTINUE_Y + 16, '敬请期待', {
        align: 'center',
        color: UI_THEME.colors.textMuted,
        fontFamily: UI_THEME.font.ui,
        fontSize: '22px',
        fontStyle: 'bold',
      })
    )
      .setOrigin(0.5)
      .setDepth(this.UI_TEXT_DEPTH);
    affordance.push(subtitle);
  }

  private getContinueAffordance(): Phaser.GameObjects.GameObject[] {
    this.continueAffordance ??= [];
    return this.continueAffordance;
  }

  private replaceContinueAffordance(completed: boolean): void {
    const affordance = this.getContinueAffordance();
    for (const object of affordance) {
      object.destroy();
    }
    affordance.length = 0;
    this.continueButton = null;

    if (completed) {
      this.continueAvailable = false;
      this.createCompletedContinueButton();
      return;
    }

    this.continueAvailable = true;
    this.createContinueButton();
  }

  private getContinueAffordanceVisualState(): Array<{ text?: string; interactive: boolean; visible: boolean }> {
    return this.getContinueAffordance().map((object) => {
      const candidate = object as Phaser.GameObjects.GameObject & { text?: string; input?: { enabled?: boolean }; visible?: boolean; interactive?: boolean };
      return {
        ...(candidate.text === undefined ? {} : { text: candidate.text }),
        interactive: candidate.input?.enabled === true || candidate.interactive === true,
        visible: candidate.visible !== false,
      };
    });
  }

  private showExportSaveCode(): void {
    const result = exportSaveJson();
    if (result.status !== 'exported') {
      this.saveCodeStatusText?.setText('暂无可导出的存档');
      return;
    }

    window.prompt('复制 JSON 存档', result.json);
    this.saveCodeStatusText?.setText('JSON 存档已生成');
  }

  private showImportSaveCode(): void {
    const json = window.prompt('粘贴 JSON 存档', '')?.trim() ?? '';
    const result = importSaveJson(json);
    if (result.status === 'imported') {
      refreshSaveDebugState();
      this.replaceContinueAffordance(this.isCompletedState(result.state));
      this.saveCodeStatusText?.setText('导入成功');
      return;
    }

    this.saveCodeStatusText?.setText(result.status === 'invalid-json' ? 'JSON 格式错误' : '存档内容无效');
  }

  private hasCompletedSave(): boolean {
    const result = loadSaveState();
    return result.status === 'valid' && this.isCompletedState(result.state);
  }

  private isCompletedState(state: SaveState): boolean {
    const playableAct = storyManifest.acts.find((act) => act.status === 'playable');
    const completedEndingIds = new Set(
      playableAct?.endings
        .filter((ending) => ending.kind === 'major' && !ending.returnsToCheckpoint)
        .map((ending) => `ending-${ending.id}`) ?? [],
    );
    return state.triggeredEvents.some((eventId) => completedEndingIds.has(eventId));
  }

  public shutdown(): void {
    this.input?.keyboard?.removeAllListeners();
    this.inputManager?.destroy();
    (this.narrativeUI as { destroy?: () => void } | null)?.destroy?.();
    this.mapRenderer?.destroy();
    this.inputManager = null;
    this.narrativeUI = null;
    this.mapRenderer = null;
    this.continueButton = null;
    this.getContinueAffordance().length = 0;
    this.saveCodeStatusText = null;
  }
}
