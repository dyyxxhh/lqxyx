import { describe, expect, it } from "vitest";
import {
  allowedAssetRoots,
  approvedProgrammaticAssets,
  assetManifest,
  getMissingAssetBlockers,
  requiredFirstActAssetKeys,
  validateAssetManifest,
} from "./assets";

const expectedFinalAssetPaths = [
  "最终素材/地板.png",
  "最终素材/桌椅.png",
  "最终素材/血迹黑屏.jpg",
  "最终素材/电话.png",
  "最终素材/手机柜-正着.png",
  "最终素材/手机柜-斜着.png",
  "最终素材/芹菜（字面意思）.png",
  "最终素材/尺子（字面意思）.png",
  "最终素材/立绘/但宇轩.png",
  "最终素材/立绘/杨云-红边.png",
  "最终素材/立绘/杨云-蓝边.png",
  "最终素材/立绘/董继豪.png",
  "最终素材/立绘/秦浩睿.png",
  "最终素材/角色动作/但宇轩-身体部件.png",
  "最终素材/角色动作/但宇轩-头部部件.png",
  "最终素材/角色动作/但宇轩-横躺有血.png",
  "最终素材/角色动作/但宇轩-横躺无血.png",
  "最终素材/角色动作/但宇轩-站立向右.png",
  "最终素材/角色动作/秦浩瑞-身体部件.png",
  "最终素材/角色动作/秦浩瑞-头部部件.png",
  "最终素材/角色动作/秦浩瑞-横躺有血.png",
  "最终素材/角色动作/秦浩瑞-横躺无血.png",
  "最终素材/角色动作/秦浩瑞-站立向右.png",
  "最终素材/角色动作/董继豪-右-迈腿.png",
  "最终素材/角色动作/董继豪-右-静止.png",
  "最终素材/角色动作/董继豪-左-迈腿.png",
  "最终素材/角色动作/董继豪-左-静止.png",
  "最终素材/角色动作/董继豪-上-右腿.png",
  "最终素材/角色动作/董继豪-上-左腿.png",
  "最终素材/角色动作/董继豪-上-静止.png",
  "最终素材/角色动作/董继豪-下-右腿.png",
  "最终素材/角色动作/董继豪-下-左腿.png",
  "最终素材/角色动作/董继豪-下-静止.png",
  "最终素材/角色动作/杨云-蓝边-右-迈腿.png",
  "最终素材/角色动作/杨云-蓝边-右-静止.png",
  "最终素材/角色动作/杨云-蓝边-左-迈腿.png",
  "最终素材/角色动作/杨云-蓝边-左-静止.png",
  "最终素材/角色动作/杨云-蓝边-上-左腿.png",
  "最终素材/角色动作/杨云-蓝边-上-右腿.png",
  "最终素材/角色动作/杨云-蓝边-上-静止.png",
  "最终素材/角色动作/杨云-蓝边-下-左腿.png",
  "最终素材/角色动作/杨云-蓝边-下-右腿.png",
  "最终素材/角色动作/杨云-蓝边-下-静止.png",
  "最终素材/角色动作/杨云-红边-右-迈腿.png",
  "最终素材/角色动作/杨云-红边-右-静止.png",
  "最终素材/角色动作/杨云-红边-左-迈腿.png",
  "最终素材/角色动作/杨云-红边-左-静止.png",
  "最终素材/角色动作/杨云-红边-上-左腿.png",
  "最终素材/角色动作/杨云-红边-上-右腿.png",
  "最终素材/角色动作/杨云-红边-上-静止.png",
  "最终素材/角色动作/杨云-红边-下-左腿.png",
  "最终素材/角色动作/杨云-红边-下-右腿.png",
  "最终素材/角色动作/杨云-红边-下-静止.png",
];

describe("asset manifest", () => {
  it("includes every approved final production asset explicitly", () => {
    const manifestPaths = assetManifest.map((asset) => asset.path).sort();

    expect(manifestPaths).toEqual([...expectedFinalAssetPaths].sort());
    expect(assetManifest).toHaveLength(53);
  });

  it("allows only final production asset roots and rejects forbidden roots", () => {
    expect(allowedAssetRoots).toEqual(["最终素材"]);
    expect(validateAssetManifest(assetManifest)).toEqual([]);

    const forbiddenRoot = ["其", "他"].join("");
    const invalidManifest = [
      ...assetManifest,
      {
        ...assetManifest[0],
        key: "invalid.forbidden-root",
        path: `${forbiddenRoot}/fake.png`,
      },
    ];

    expect(validateAssetManifest(invalidManifest)).toContain(
      "invalid.forbidden-root uses a forbidden source segment: 其他/fake.png",
    );

    const invalidNestedPath = [
      ...assetManifest,
      {
        ...assetManifest[0],
        key: "invalid.forbidden-segment",
        path: `最终素材/${forbiddenRoot}/fake.png`,
      },
    ];

    expect(validateAssetManifest(invalidNestedPath)).toContain(
      "invalid.forbidden-segment uses a forbidden source segment: 最终素材/其他/fake.png",
    );
  });

  it("keeps current first-act supplement blockers empty", () => {
    expect(getMissingAssetBlockers()).toEqual([]);
  });

  it("records approved non-missing programmatic and reuse implementations", () => {
    expect(approvedProgrammaticAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "doors.wallWoodBars", productionStatus: "APPROVED_PROGRAMMATIC" }),
        expect.objectContaining({ key: "communication.steelInteractable", productionStatus: "APPROVED_PROGRAMMATIC" }),
        expect.objectContaining({ key: "officeFurniture.reuseDeskChairs", productionStatus: "APPROVED_REUSE" }),
        expect.objectContaining({ key: "headPickups.characterHeadParts", productionStatus: "APPROVED_REUSE" }),
        expect.objectContaining({ key: "celeryVariants.generatedFromCeleryAsset", productionStatus: "APPROVED_DERIVED" }),
        expect.objectContaining({ key: "rulerFlashDeath.usesRulerAsset", productionStatus: "APPROVED_REUSE" }),
      ]),
    );
  });

  it("includes qinHaorui action assets (disk filenames use 秦浩瑞) and portrait (uses 秦浩睿)", () => {
    expect(assetManifest.some((asset) => asset.path.includes("秦浩瑞-头部部件"))).toBe(true);
    expect(assetManifest.some((asset) => asset.path.includes("立绘/秦浩睿"))).toBe(true);
  });

  it("marks all currently required first-act semantic assets as available or approved", () => {
    expect(requiredFirstActAssetKeys).toEqual(
      expect.arrayContaining([
        "floor.tile",
        "furniture.classroomDeskChairs",
        "transition.bloodBlackScreen",
        "prop.phone",
        "prop.phoneCabinetFront",
        "prop.phoneCabinetAngled",
        "prop.celery",
        "prop.ruler",
        "doors.wallWoodBars",
        "communication.steelInteractable",
      ]),
    );

    const availableKeys = new Set([
      ...assetManifest.map((asset) => asset.key),
      ...approvedProgrammaticAssets.map((asset) => asset.key),
    ]);

    expect(requiredFirstActAssetKeys.filter((key) => !availableKeys.has(key))).toEqual([]);
  });
});
