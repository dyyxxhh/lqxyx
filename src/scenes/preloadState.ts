import type { StaticAssetEntry } from '../data/assetUrls';

export type PreloadStatus = 'queued' | 'loading' | 'complete' | 'failed';

export interface PreloadFailure {
  readonly key: string;
  readonly url: string;
}

export interface PreloadDebugState {
  readonly status: PreloadStatus;
  readonly total: number;
  readonly loaded: number;
  readonly progress: number;
  readonly queuedAssets: readonly string[];
  readonly failedAsset: PreloadFailure | null;
  readonly errorMessage: string | null;
  readonly canEnterGame: boolean;
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

export function createInitialPreloadDebugState(entries: readonly StaticAssetEntry[]): PreloadDebugState {
  return {
    status: 'queued',
    total: entries.length,
    loaded: 0,
    progress: 0,
    queuedAssets: entries.map((entry) => entry.key),
    failedAsset: null,
    errorMessage: null,
    canEnterGame: false,
  };
}

export function markPreloadProgress(state: PreloadDebugState, progress: number): PreloadDebugState {
  if (state.status === 'failed') {
    return state;
  }

  const clampedProgress = clampProgress(progress);

  return {
    ...state,
    status: clampedProgress >= 1 ? 'complete' : 'loading',
    loaded: Math.round(state.total * clampedProgress),
    progress: clampedProgress,
    canEnterGame: clampedProgress >= 1,
  };
}

export function markPreloadComplete(state: PreloadDebugState): PreloadDebugState {
  if (state.status === 'failed') {
    return state;
  }

  return {
    ...state,
    status: 'complete',
    loaded: state.total,
    progress: 1,
    failedAsset: null,
    errorMessage: null,
    canEnterGame: true,
  };
}

export function markPreloadFailure(state: PreloadDebugState, key: string, url: string): PreloadDebugState {
  return {
    ...state,
    status: 'failed',
    failedAsset: { key, url },
    errorMessage: `Required preload asset failed: ${key} (${url})`,
    canEnterGame: false,
  };
}
