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

export class PreloadScene extends Phaser.Scene {
  private preloadState: PreloadDebugState | null = null;
  private progressText: Phaser.GameObjects.Text | null = null;
  private progressBar: Phaser.GameObjects.Rectangle | null = null;
  private failureText: Phaser.GameObjects.Text | null = null;

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

    const forcedFailureKey = new URLSearchParams(globalThis.location?.search ?? '').get('preloadFailAsset');
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
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 96, '影中咎', {
      align: 'center',
      color: '#f2f2f2',
      fontFamily: 'sans-serif',
      fontSize: '48px',
    }).setOrigin(0.5);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 28, 0x252525).setOrigin(0.5);
    this.progressBar = this.add.rectangle(GAME_WIDTH / 2 - 260, GAME_HEIGHT / 2, 0, 28, 0xb01724).setOrigin(0, 0.5);
    this.progressText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 56, '加载资源 0%', {
      align: 'center',
      color: '#f2f2f2',
      fontFamily: 'sans-serif',
      fontSize: '28px',
    }).setOrigin(0.5);
  }

  private renderProgress(): void {
    const state = this.requirePreloadState();
    const percent = Math.round(state.progress * 100);
    this.progressBar?.setDisplaySize(520 * state.progress, 28);
    this.progressText?.setText(state.status === 'complete' ? '加载完成 100%' : `加载资源 ${percent}%`);
  }

  private renderFailure(): void {
    const state = this.requirePreloadState();
    const message = state.errorMessage ?? 'Required preload asset failed';
    this.progressText?.setText('加载失败');

    if (!this.failureText) {
      this.failureText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 112, message, {
        align: 'center',
        color: '#ff6b6b',
        fontFamily: 'sans-serif',
        fontSize: '24px',
        wordWrap: { width: 900 },
      }).setOrigin(0.5);
      return;
    }

    this.failureText.setText(message);
  }
}
