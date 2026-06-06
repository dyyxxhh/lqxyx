import { assetManifest, type AssetManifestEntry } from './assets';

const sourceAssetRoot = '最终素材/';
const publicAssetRoot = '/assets/final/';

export interface StaticAssetEntry {
  readonly key: AssetManifestEntry['key'];
  readonly sourcePath: AssetManifestEntry['path'];
  readonly url: string;
  readonly kind: AssetManifestEntry['kind'];
  readonly required: true;
}

export function sourcePathToPublicAssetPath(sourcePath: string): string {
  if (!sourcePath.startsWith(sourceAssetRoot)) {
    throw new Error(`Cannot map non-final asset source path: ${sourcePath}`);
  }

  return `${publicAssetRoot}${sourcePath.slice(sourceAssetRoot.length)}`;
}

export function getStaticAssetEntries(
  manifest: readonly AssetManifestEntry[] = assetManifest,
): readonly StaticAssetEntry[] {
  return manifest.map((asset) => ({
    key: asset.key,
    sourcePath: asset.path,
    url: sourcePathToPublicAssetPath(asset.path),
    kind: asset.kind,
    required: true,
  }));
}
