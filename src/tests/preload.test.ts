import { describe, expect, it } from 'vitest';

import { assetManifest, approvedProgrammaticAssets, requiredFirstActAssetKeys } from '../data/assets';
import { getStaticAssetEntries, sourcePathToPublicAssetPath } from '../data/assetUrls';
import {
  createInitialPreloadDebugState,
  markPreloadComplete,
  markPreloadFailure,
  markPreloadProgress,
} from '../scenes/preloadState';
import { getForcedPreloadFailureKey, shouldAllowForcedPreloadFailure } from '../scenes/preloadDebugGate';

describe('preload asset plan', () => {
  it('maps every manifest final asset to the public static final-asset directory', () => {
    const entries = getStaticAssetEntries();

    expect(entries).toHaveLength(assetManifest.length);
    expect(entries).toHaveLength(136);
    expect(entries.map((entry) => entry.key)).toEqual(assetManifest.map((asset) => asset.key));
    expect(entries.every((entry) => entry.url.startsWith('/assets/final/'))).toBe(true);
    expect(entries.some((entry) => entry.sourcePath.includes('最终素材/'))).toBe(true);
    expect(entries.every((entry) => !entry.url.includes('最终素材'))).toBe(true);
  });

  it('preserves nested source names while stripping the source root from public URLs', () => {
    expect(sourcePathToPublicAssetPath('最终素材/立绘/秦浩睿.png')).toBe('/assets/final/立绘/秦浩睿.png');
    expect(sourcePathToPublicAssetPath('最终素材/角色动作/杨云-蓝边-下-静止.png')).toBe(
      '/assets/final/角色动作/杨云-蓝边-下-静止.png',
    );
  });

  it('has no required first-act key without a final asset or approved implementation', () => {
    const availableKeys = new Set([
      ...assetManifest.map((asset) => asset.key),
      ...approvedProgrammaticAssets.map((asset) => asset.key),
    ]);

    expect(requiredFirstActAssetKeys.filter((key) => !availableKeys.has(key))).toEqual([]);
  });
});

describe('preload debug state', () => {
  it('tracks queued, progress, completion, and game transition eligibility deterministically', () => {
    const state = createInitialPreloadDebugState(getStaticAssetEntries());

    expect(state.status).toBe('queued');
    expect(state.total).toBe(136);
    expect(state.canEnterGame).toBe(false);

    const halfway = markPreloadProgress(state, 0.5);
    expect(halfway.status).toBe('loading');
    expect(halfway.loaded).toBe(68);
    expect(halfway.progress).toBe(0.5);

    const complete = markPreloadComplete(halfway);
    expect(complete.status).toBe('complete');
    expect(complete.loaded).toBe(136);
    expect(complete.progress).toBe(1);
    expect(complete.canEnterGame).toBe(true);
  });

  it('records visible failure details and prevents GameScene transition when a required asset fails', () => {
    const state = createInitialPreloadDebugState(getStaticAssetEntries());
    const failed = markPreloadFailure(state, 'floor.tile', '/assets/final/missing-floor.png');

    expect(failed.status).toBe('failed');
    expect(failed.failedAsset).toEqual({ key: 'floor.tile', url: '/assets/final/missing-floor.png' });
    expect(failed.errorMessage).toContain('floor.tile');
    expect(failed.canEnterGame).toBe(false);
  });

  it('keeps failure terminal when later loader progress events arrive', () => {
    const state = createInitialPreloadDebugState(getStaticAssetEntries());
    const failed = markPreloadFailure(state, 'floor.tile', '/assets/final/missing-floor.png');
    const afterProgress = markPreloadProgress(failed, 1);

    expect(afterProgress.status).toBe('failed');
    expect(afterProgress.failedAsset).toEqual({ key: 'floor.tile', url: '/assets/final/missing-floor.png' });
    expect(afterProgress.canEnterGame).toBe(false);
  });
});


describe('preload forced failure debug hook', () => {
  it('allows forced preload failure only outside production builds', () => {
    expect(shouldAllowForcedPreloadFailure(false)).toBe(true);
    expect(shouldAllowForcedPreloadFailure(true)).toBe(false);
    expect(getForcedPreloadFailureKey('?preloadFailAsset=floor.tile', false)).toBe('floor.tile');
    expect(getForcedPreloadFailureKey('?preloadFailAsset=floor.tile', true)).toBeNull();
  });
});
