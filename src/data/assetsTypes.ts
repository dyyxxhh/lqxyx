export type AssetKind = "image";
export type ProductionStatus = "FINAL_ASSET" | "APPROVED_PROGRAMMATIC" | "APPROVED_REUSE" | "APPROVED_DERIVED" | "BLOCKER_FOR_FINAL_ART";

export interface AssetManifestEntry {
  readonly key: string;
  readonly path: string;
  readonly kind: AssetKind;
  readonly mimeType: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly usage: string;
  readonly productionStatus: "FINAL_ASSET";
}

export interface ApprovedImplementation {
  readonly key: string;
  readonly productionStatus: Exclude<ProductionStatus, "FINAL_ASSET" | "BLOCKER_FOR_FINAL_ART">;
  readonly usage: string;
  readonly implementation: string;
  readonly sourceAssetKeys?: readonly string[];
}

export interface MissingAssetBlocker {
  readonly key: string;
  readonly productionStatus: "BLOCKER_FOR_FINAL_ART";
  readonly usage: string;
  readonly sceneOrRequirement: string;
  readonly suggestedDimensions: string;
  readonly blockerReason: string;
}

export interface ProductionArtGateInput {
  readonly finalAssets: readonly AssetManifestEntry[];
  readonly approvedImplementations: readonly ApprovedImplementation[];
  readonly missingBlockers: readonly MissingAssetBlocker[];
  readonly markFinalComplete: boolean;
}
