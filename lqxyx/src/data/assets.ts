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

export const allowedAssetRoots = ["最终素材"] as const;

export const assetManifest = [
  {
    key: "floor.tile",
    path: "最终素材/地板.png",
    kind: "image",
    mimeType: "image/png",
    width: 384,
    height: 384,
    usage: "Tiled floor source for corridors and rooms.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "furniture.classroomDeskChairs",
    path: "最终素材/桌椅.png",
    kind: "image",
    mimeType: "image/png",
    width: 508,
    height: 646,
    usage: "Classroom desks/chairs; also approved office furniture reuse at classroom scale.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "transition.bloodBlackScreen",
    path: "最终素材/血迹黑屏.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    width: 1792,
    height: 1024,
    usage: "Blood black-screen transition and horror cutaway source.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "prop.phone",
    path: "最终素材/电话.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Phone prop/interactable.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "prop.phoneCabinetFront",
    path: "最终素材/手机柜-正着.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Phone cabinet front-facing prop/interactable.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "prop.phoneCabinetAngled",
    path: "最终素材/手机柜-斜着.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Phone cabinet angled prop/interactable.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "prop.celery",
    path: "最终素材/芹菜（字面意思）.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Celery source; black, white, and large variants may be generated from it.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "prop.ruler",
    path: "最终素材/尺子（字面意思）.png",
    kind: "image",
    mimeType: "image/png",
    width: 1536,
    height: 1024,
    usage: "Ruler source; ruler flash/death visuals may use it.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "portrait.danYuxuan",
    path: "最终素材/立绘/但宇轩.png",
    kind: "image",
    mimeType: "image/png",
    width: 1133,
    height: 1176,
    usage: "Dialogue portrait for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "portrait.yangYunRed",
    path: "最终素材/立绘/杨云-红边.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1196,
    usage: "Dialogue portrait for Yang Yun internal red-border state; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "portrait.yangYunBlue",
    path: "最终素材/立绘/杨云-蓝边.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1192,
    usage: "Dialogue portrait for Yang Yun internal blue-border state; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "portrait.dongJihao",
    path: "最终素材/立绘/董继豪.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Dialogue portrait for 董继豪.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "portrait.qinHaorui",
    path: "最终素材/立绘/秦浩睿.png",
    kind: "image",
    mimeType: "image/png",
    width: 1254,
    height: 1254,
    usage: "Dialogue portrait for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.danYuxuan.bodyPart",
    path: "最终素材/角色动作/但宇轩-身体部件.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Ground-object/pickup body-part art for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.danYuxuan.headPart",
    path: "最终素材/角色动作/但宇轩-头部部件.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Ground-object/pickup head-part art for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.danYuxuan.lyingBloody",
    path: "最终素材/角色动作/但宇轩-横躺有血.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only lying bloody sprite for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.danYuxuan.lyingClean",
    path: "最终素材/角色动作/但宇轩-横躺无血.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only lying clean sprite for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.danYuxuan.standRight",
    path: "最终素材/角色动作/但宇轩-站立向右.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only standing-right sprite for 但宇轩.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.qinHaorui.bodyPart",
    path: "最终素材/角色动作/秦浩瑞-身体部件.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Ground-object/pickup body-part art for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.qinHaorui.headPart",
    path: "最终素材/角色动作/秦浩瑞-头部部件.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Ground-object/pickup head-part art for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.qinHaorui.lyingBloody",
    path: "最终素材/角色动作/秦浩瑞-横躺有血.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only lying bloody sprite for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.qinHaorui.lyingClean",
    path: "最终素材/角色动作/秦浩瑞-横躺无血.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only lying clean sprite for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.qinHaorui.standRight",
    path: "最终素材/角色动作/秦浩瑞-站立向右.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Story-only standing-right sprite for 秦浩睿.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.right.step",
    path: "最终素材/角色动作/董继豪-右-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 右.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.right.idle",
    path: "最终素材/角色动作/董继豪-右-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 右.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.left.step",
    path: "最终素材/角色动作/董继豪-左-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 左.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.left.idle",
    path: "最终素材/角色动作/董继豪-左-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 左.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.up.rightLeg",
    path: "最终素材/角色动作/董继豪-上-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 上.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.up.leftLeg",
    path: "最终素材/角色动作/董继豪-上-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 上.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.up.idle",
    path: "最终素材/角色动作/董继豪-上-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 上.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.down.rightLeg",
    path: "最终素材/角色动作/董继豪-下-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 下.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.down.leftLeg",
    path: "最终素材/角色动作/董继豪-下-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 下.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.dongJihao.down.idle",
    path: "最终素材/角色动作/董继豪-下-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for 董继豪 facing 下.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.right.step",
    path: "最终素材/角色动作/杨云-蓝边-右-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 右; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.right.idle",
    path: "最终素材/角色动作/杨云-蓝边-右-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 右; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.left.step",
    path: "最终素材/角色动作/杨云-蓝边-左-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 左; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.left.idle",
    path: "最终素材/角色动作/杨云-蓝边-左-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 左; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.up.leftLeg",
    path: "最终素材/角色动作/杨云-蓝边-上-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.up.rightLeg",
    path: "最终素材/角色动作/杨云-蓝边-上-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.up.idle",
    path: "最终素材/角色动作/杨云-蓝边-上-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.down.leftLeg",
    path: "最终素材/角色动作/杨云-蓝边-下-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.down.rightLeg",
    path: "最终素材/角色动作/杨云-蓝边-下-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunBlue.down.idle",
    path: "最终素材/角色动作/杨云-蓝边-下-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal blue-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.right.step",
    path: "最终素材/角色动作/杨云-红边-右-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 右; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.right.idle",
    path: "最终素材/角色动作/杨云-红边-右-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 右; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.left.step",
    path: "最终素材/角色动作/杨云-红边-左-迈腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 左; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.left.idle",
    path: "最终素材/角色动作/杨云-红边-左-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 左; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.up.leftLeg",
    path: "最终素材/角色动作/杨云-红边-上-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.up.rightLeg",
    path: "最终素材/角色动作/杨云-红边-上-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.up.idle",
    path: "最终素材/角色动作/杨云-红边-上-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 上; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.down.leftLeg",
    path: "最终素材/角色动作/杨云-红边-下-左腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.down.rightLeg",
    path: "最终素材/角色动作/杨云-红边-下-右腿.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
  {
    key: "sprite.yangYunRed.down.idle",
    path: "最终素材/角色动作/杨云-红边-下-静止.png",
    kind: "image",
    mimeType: "image/png",
    width: 128,
    height: 128,
    usage: "Walking sprite frame for Yang Yun internal red-border state facing 下; display name remains 杨云.",
    productionStatus: "FINAL_ASSET",
  },
] as const satisfies readonly AssetManifestEntry[];

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

export interface ProductionArtGateInput {
  readonly finalAssets: readonly AssetManifestEntry[];
  readonly approvedImplementations: readonly ApprovedImplementation[];
  readonly missingBlockers: readonly MissingAssetBlocker[];
  readonly markFinalComplete: boolean;
}

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

