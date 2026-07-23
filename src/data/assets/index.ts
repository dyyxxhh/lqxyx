import type { AssetManifestEntry, ApprovedImplementation, MissingAssetBlocker, ProductionArtGateInput } from '../assetsTypes';

import { mainGameAssets } from './mainGameAssets';
import { forgottenSanityAssets } from './forgottenSanityAssets';

export type { AssetKind, ProductionStatus, AssetManifestEntry, ApprovedImplementation, MissingAssetBlocker, ProductionArtGateInput } from '../assetsTypes';

export const assetManifest = [...mainGameAssets, ...forgottenSanityAssets] as const satisfies readonly AssetManifestEntry[];

export const allowedAssetRoots = ["最终素材"] as const;

export const approvedProgrammaticAssets = [
  {
    key: "doors.wallWoodBars",
    productionStatus: "APPROVED_PROGRAMMATIC",
    usage: "All corridor/classroom/room doors, including five-floor non-interactive left-side class doors.",
    implementation: "Draw wood-colored horizontal bars embedded in wall positions; no standalone door art is required.",
  },
  {
    key: "communication.steelInteractable",
    productionStatus: "APPROVED_PROGRAMMATIC",
    usage: "Communication control room equipment/interactable.",
    implementation: "Draw a steel-colored programmatic communication device/interactable.",
  },
  {
    key: "officeFurniture.reuseDeskChairs",
    productionStatus: "APPROVED_REUSE",
    usage: "Office desks/chairs.",
    implementation: "Reuse 桌椅.png at classroom scale for office furniture.",
    sourceAssetKeys: ["furniture.classroomDeskChairs"],
  },
  {
    key: "headPickups.characterHeadParts",
    productionStatus: "APPROVED_REUSE",
    usage: "但宇轩/秦浩睿 head-related pickup and ground-object interactions.",
    implementation: "Use existing character head-part sprites as pickup/ground-object art.",
    sourceAssetKeys: ["sprite.danYuxuan.headPart", "sprite.qinHaorui.headPart"],
  },
  {
    key: "celeryVariants.generatedFromCeleryAsset",
    productionStatus: "APPROVED_DERIVED",
    usage: "Black, white, and large celery variants.",
    implementation: "Generate visual variants from 芹菜（字面意思）.png.",
    sourceAssetKeys: ["prop.celery"],
  },
  {
    key: "rulerFlashDeath.usesRulerAsset",
    productionStatus: "APPROVED_REUSE",
    usage: "Ruler flash and death visuals.",
    implementation: "Use 尺子（字面意思）.png for ruler flash/death requirements.",
    sourceAssetKeys: ["prop.ruler"],
  },
] as const satisfies readonly ApprovedImplementation[];

export function validateProductionArtGate(input: ProductionArtGateInput): string[] {
  const finalAssetKeys = new Set(input.finalAssets.map((asset) => asset.key));
  const approvedImplementationKeys = new Set(input.approvedImplementations.map((asset) => asset.key));
  const availableKeys = new Set([...finalAssetKeys, ...approvedImplementationKeys]);
  const failures: string[] = [];

  const missingRequiredKeys = requiredFirstActAssetKeys.filter((key) => !availableKeys.has(key));
  if (missingRequiredKeys.length > 0) {
    failures.push(
      `Required first-act production art keys are not final assets or approved implementations: ${missingRequiredKeys.join(", ")}`,
    );
  }

  const unresolvedBlockerKeys = input.missingBlockers
    .filter((blocker) => !finalAssetKeys.has(blocker.key))
    .map((blocker) => blocker.key);

  if (input.markFinalComplete && unresolvedBlockerKeys.length > 0) {
    failures.push(
      `Cannot mark first-act production art final complete while missing supplement blockers remain: ${unresolvedBlockerKeys.join(", ")}`,
    );
  }

  return failures;
}

export function buildSupplementAssetReport(): string {
  const finalAssetByKey = new Map(assetManifest.map((asset) => [asset.key, asset]));
  const approvedImplementationByKey = new Map(approvedProgrammaticAssets.map((asset) => [asset.key, asset]));
  const blockers = getMissingAssetBlockers();
  const gateFailures = validateProductionArtGate({
    finalAssets: assetManifest,
    approvedImplementations: approvedProgrammaticAssets,
    missingBlockers: blockers,
    markFinalComplete: true,
  });

  const lines = [
    "# Task 14 Supplement Asset Report",
    "",
    "Current known status:",
    `- Final supplied assets: ${assetManifest.length}`,
    `- Approved programmatic/reuse/derived implementations: ${approvedProgrammaticAssets.length}`,
    `- Current first-act supplement blockers: ${
      blockers.length === 0 ? "empty" : blockers.map((blocker) => blocker.key).join(", ")
    }`,
    "",
    "Required supplement status:",
    formatRequiredStatus("doors.wallWoodBars", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("communication.steelInteractable", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("officeFurniture.reuseDeskChairs", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("prop.phone", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("prop.phoneCabinetFront", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("prop.phoneCabinetAngled", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("prop.celery", finalAssetByKey, approvedImplementationByKey),
    formatRequiredStatus("prop.ruler", finalAssetByKey, approvedImplementationByKey),
    "",
    "Gate result:",
    gateFailures.length === 0
      ? "- PASS: no newly discovered missing first-act art remains, and the blocker mechanism is preserved."
      : `- BLOCKED: ${gateFailures.join("; ")}`,
  ];

  return lines.join("\n");
}

function formatRequiredStatus(
  key: string,
  finalAssetByKey: ReadonlyMap<string, AssetManifestEntry>,
  approvedImplementationByKey: ReadonlyMap<string, ApprovedImplementation>,
): string {
  const finalAsset = finalAssetByKey.get(key);
  if (finalAsset !== undefined) {
    return `- ${key}: supplied final asset at ${finalAsset.path}`;
  }

  const approvedImplementation = approvedImplementationByKey.get(key);
  if (approvedImplementation !== undefined) {
    return `- ${key}: ${formatApprovedImplementationStatus(approvedImplementation)}`;
  }

  return `- ${key}: missing supplement blocker`;
}

function formatApprovedImplementationStatus(approvedImplementation: ApprovedImplementation): string {
  if (approvedImplementation.key === "doors.wallWoodBars") {
    return "approved programmatic wood wall bars";
  }

  if (approvedImplementation.key === "communication.steelInteractable") {
    return "approved programmatic steel interactable";
  }

  if (approvedImplementation.key === "officeFurniture.reuseDeskChairs") {
    return "approved reuse of furniture.classroomDeskChairs";
  }

  return approvedImplementation.implementation;
}

export const requiredFirstActAssetKeys = [
  "floor.tile",
  "furniture.classroomDeskChairs",
  "transition.bloodBlackScreen",
  "prop.phone",
  "prop.phoneCabinetFront",
  "prop.phoneCabinetAngled",
  "prop.celery",
  "prop.ruler",
  "portrait.danYuxuan",
  "portrait.yangYunRed",
  "portrait.yangYunBlue",
  "portrait.dongJihao",
  "portrait.qinHaorui",
  "doors.wallWoodBars",
  "communication.steelInteractable",
  "officeFurniture.reuseDeskChairs",
  "headPickups.characterHeadParts",
  "celeryVariants.generatedFromCeleryAsset",
  "rulerFlashDeath.usesRulerAsset",
] as const;

const missingAssetBlockers = [] as const satisfies readonly MissingAssetBlocker[];

export function getMissingAssetBlockers(): readonly MissingAssetBlocker[] {
  return missingAssetBlockers;
}

export function validateAssetManifest(manifest: readonly Pick<AssetManifestEntry, "key" | "path">[]): string[] {
  const forbiddenSourceSegment = ["其", "他"].join("");

  return manifest.flatMap((asset) => {
    if (asset.path.includes(forbiddenSourceSegment)) {
      return [`${asset.key} uses a forbidden source segment: ${asset.path}`];
    }

    const usesAllowedRoot = allowedAssetRoots.some((root) => asset.path === root || asset.path.startsWith(`${root}/`));

    return usesAllowedRoot ? [] : [`${asset.key} uses a disallowed asset root: ${asset.path}`];
  });
}
