import Phaser from 'phaser';

import { getStaticAssetEntries } from '../data/assetUrls';
import { GAME_HEIGHT, GAME_WIDTH, markPreloadReady, markSceneStarted, refreshCanvasDebugState, setPreloadDebugState } from '../game/scaffoldState';
import {
  createInitialPreloadDebugState,
  markPreloadComplete,
  markPreloadFailure,
  markPreloadProgress,
  type PreloadDebugState,
} from './preloadState';
import { getForcedPreloadFailureKey } from './preloadDebugGate';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../ui/uiTheme';

export class PreloadScene extends Phaser.Scene {
  private preloadState: PreloadDebugState | null = null;
  private progressText: Phaser.GameObjects.Text | null = null;
  private progressBar: Phaser.GameObjects.Rectangle | null = null;
  private failureText: Phaser.GameObjects.Text | null = null;
  private retryButton: Phaser.GameObjects.Rectangle | null = null;
  private retryLabel: Phaser.GameObjects.Text | null = null;

  public constructor() {
    super('PreloadScene');
  }

  public preload(): void {
    markSceneStarted('PreloadScene');
    refreshCanvasDebugState();

    const entries = getStaticAssetEntries();
    this.preloadState = createInitialPreloadDebugState(entries);
    setPreloadDebugState(this.preloadState);
    this.createLoadingUi();
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_PRELOAD_UI__ = {
        getVisualDebugState: () => this.getVisualDebugState(),
      };
    }

    const forcedFailureKey = getForcedPreloadFailureKey(globalThis.location?.search ?? '', import.meta.env.PROD);
    const forcedFailureEntry = entries.find((entry) => entry.key === forcedFailureKey);

    if (forcedFailureEntry) {
      this.setPreloadState(markPreloadFailure(this.requirePreloadState(), forcedFailureEntry.key, forcedFailureEntry.url));
      this.renderFailure();
      return;
    }

    for (const entry of entries) {
      this.load.image(entry.key, entry.url);
    }

    this.load.on('progress', (progress: number) => {
      this.setPreloadState(markPreloadProgress(this.requirePreloadState(), progress));
      this.renderProgress();
    });

    this.load.on('filecomplete', () => {
      this.renderProgress();
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      const key = String(file.key);
      const url = typeof file.url === 'string' ? file.url : key;
      this.setPreloadState(markPreloadFailure(this.requirePreloadState(), key, url));
      this.renderFailure();
    });
  }

  public create(): void {
    const state = this.requirePreloadState();

    if (state.status === 'failed') {
      this.renderFailure();
      return;
    }

    this.setPreloadState(markPreloadComplete(state));
    markPreloadReady();
    this.renderProgress();
    this.scene.start('GameScene');
  }

  private requirePreloadState(): PreloadDebugState {
    if (!this.preloadState) {
      throw new Error('Preload state is not initialized');
    }

    return this.preloadState;
  }

  private setPreloadState(state: PreloadDebugState): void {
    this.preloadState = state;
    setPreloadDebugState(state);
  }

  private createLoadingUi(): void {
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 760, 340, UI_THEME.colors.surface, UI_THEME.alpha.panelStrong)
      .setOrigin(0.5);
    applyPixelStrokeStyle(panel, UI_THEME.stroke.medium, UI_THEME.colors.border, 0.98);

    applyPixelTextStyle(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 118, '影中咎', {
      align: 'center',
      color: UI_THEME.colors.text,
      fontFamily: UI_THEME.font.ui,
      fontSize: '48px',
      fontStyle: 'bold',
    })).setOrigin(0.5);

    applyPixelTextStyle(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 68, '第一幕资源载入中', {
      align: 'center',
      color: UI_THEME.colors.textMuted,
      fontFamily: UI_THEME.font.ui,
      fontSize: '18px',
    })).setOrigin(0.5);

    const progressTrack = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 540, 30, UI_THEME.colors.surfaceMuted, 1)
      .setOrigin(0.5);
    applyPixelStrokeStyle(progressTrack, UI_THEME.stroke.thin, UI_THEME.colors.borderMuted, 1);
    this.progressBar = this.add.rectangle(GAME_WIDTH / 2 - 270, GAME_HEIGHT / 2, 0, 24, UI_THEME.colors.accent).setOrigin(0, 0.5);
    this.progressText = applyPixelTextStyle(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 56, '加载资源 0%', {
      align: 'center',
      color: UI_THEME.colors.text,
      fontFamily: UI_THEME.font.ui,
      fontSize: '26px',
      fontStyle: 'bold',
    })).setOrigin(0.5);
  }

  private renderProgress(): void {
    const state = this.requirePreloadState();
    const percent = Math.round(state.progress * 100);
    this.progressBar?.setDisplaySize(540 * state.progress, 24);
    this.progressText?.setText(state.status === 'complete' ? '加载完成 100%' : `加载资源 ${percent}%`);
  }

  private renderFailure(): void {
    const state = this.requirePreloadState();
    const message = state.errorMessage ?? 'Required preload asset failed';
    this.progressText?.setText('加载失败 · 请重试');
    this.progressBar?.setFillStyle(UI_THEME.colors.accentPressed);

    if (!this.failureText) {
      this.failureText = applyPixelTextStyle(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 106, message, {
        align: 'center',
        color: UI_THEME.colors.textDanger,
        fontFamily: UI_THEME.font.ui,
        fontSize: '20px',
        wordWrap: { width: 900 },
      })).setOrigin(0.5);
    }

    this.failureText.setText(message);
    this.createRetryButton();
  }

  private createRetryButton(): void {
    if (this.retryButton && this.retryLabel) return;

    this.retryButton = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 158, 180, 44, UI_THEME.colors.accent)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyPixelStrokeStyle(this.retryButton, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.95);
    this.retryLabel = applyPixelTextStyle(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 158, '重新加载', {
      align: 'center',
      color: UI_THEME.colors.text,
      fontFamily: UI_THEME.font.ui,
      fontSize: '20px',
      fontStyle: 'bold',
    })).setOrigin(0.5);

    this.retryButton.on('pointerover', () => this.retryButton?.setFillStyle(UI_THEME.colors.accentHover));
    this.retryButton.on('pointerout', () => this.retryButton?.setFillStyle(UI_THEME.colors.accent));
    this.retryButton.on('pointerdown', () => this.retryButton?.setFillStyle(UI_THEME.colors.accentPressed));
    this.retryButton.on('pointerup', () => globalThis.location.reload());
  }

  private getVisualDebugState(): Record<string, unknown> {
    return {
      theme: 'dark-pixel-horror',
      progressBar: this.progressBar ? this.boundsOf(this.progressBar) : null,
      failureText: this.failureText ? this.boundsOf(this.failureText) : null,
      retryButton: this.retryButton ? this.boundsOf(this.retryButton) : null,
      retryLabel: this.retryLabel ? this.boundsOf(this.retryLabel) : null,
      retryFill: this.retryButton?.fillColor ?? null,
    };
  }

  private boundsOf(object: Phaser.GameObjects.Components.GetBounds & Phaser.GameObjects.Components.Visible): { x: number; y: number; width: number; height: number; visible: boolean } {
    const bounds = object.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, visible: object.visible };
  }
}
