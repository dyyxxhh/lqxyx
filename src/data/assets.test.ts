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
  "最终素材/UI/光柱-白.png",
  "最终素材/UI/光柱-紫.png",
  "最终素材/UI/光柱-绿.png",
  "最终素材/UI/光柱-蓝.png",
  "最终素材/UI/光柱-金.png",
  "最终素材/UI/大地图边框.png",
  "最终素材/UI/小地图边框.png",
  "最终素材/UI/技能框.png",
  "最终素材/UI/武器框.png",
  "最终素材/UI/理智条填充.png",
  "最终素材/UI/理智条背景.png",
  "最终素材/UI/理智消散边缘.png",
  "最终素材/UI/破译帧1.png",
  "最终素材/UI/破译帧2.png",
  "最终素材/UI/破译帧3.png",
  "最终素材/UI/破译帧4.png",
  "最终素材/UI/破译帧5.png",
  "最终素材/UI/稀有度边框-白.png",
  "最终素材/UI/稀有度边框-紫.png",
  "最终素材/UI/稀有度边框-绿.png",
  "最终素材/UI/稀有度边框-蓝.png",
  "最终素材/UI/稀有度边框-金.png",
  "最终素材/UI/血条填充.png",
  "最终素材/UI/血条背景.png",
  "最终素材/UI/血瞳.png",
  "最终素材/UI/视野黑雾.png",
  "最终素材/地板.png",
  "最终素材/尺子（字面意思）.png",
  "最终素材/手机柜-斜着.png",
  "最终素材/手机柜-正着.png",
  "最终素材/桌椅.png",
  "最终素材/电话.png",
  "最终素材/立绘/但宇轩.png",
  "最终素材/立绘/杨云-红边.png",
  "最终素材/立绘/杨云-蓝边.png",
  "最终素材/立绘/秦浩睿.png",
  "最终素材/立绘/董继豪.png",
  "最终素材/缄默者/漂浮眼球.png",
  "最终素材/缄默者/粉笔尘云.png",
  "最终素材/缄默者/血手.png",
  "最终素材/芹菜（字面意思）.png",
  "最终素材/血迹黑屏.jpg",
  "最终素材/角色动作/但宇轩-头部部件.png",
  "最终素材/角色动作/但宇轩-横躺无血.png",
  "最终素材/角色动作/但宇轩-横躺有血.png",
  "最终素材/角色动作/但宇轩-站立向右.png",
  "最终素材/角色动作/但宇轩-身体部件.png",
  "最终素材/角色动作/杨云-红边-上-右腿.png",
  "最终素材/角色动作/杨云-红边-上-左腿.png",
  "最终素材/角色动作/杨云-红边-上-静止.png",
  "最终素材/角色动作/杨云-红边-下-右腿.png",
  "最终素材/角色动作/杨云-红边-下-左腿.png",
  "最终素材/角色动作/杨云-红边-下-静止.png",
  "最终素材/角色动作/杨云-红边-右-迈腿.png",
  "最终素材/角色动作/杨云-红边-右-静止.png",
  "最终素材/角色动作/杨云-红边-左-迈腿.png",
  "最终素材/角色动作/杨云-红边-左-静止.png",
  "最终素材/角色动作/杨云-蓝边-上-右腿.png",
  "最终素材/角色动作/杨云-蓝边-上-左腿.png",
  "最终素材/角色动作/杨云-蓝边-上-静止.png",
  "最终素材/角色动作/杨云-蓝边-下-右腿.png",
  "最终素材/角色动作/杨云-蓝边-下-左腿.png",
  "最终素材/角色动作/杨云-蓝边-下-静止.png",
  "最终素材/角色动作/杨云-蓝边-右-迈腿.png",
  "最终素材/角色动作/杨云-蓝边-右-静止.png",
  "最终素材/角色动作/杨云-蓝边-左-迈腿.png",
  "最终素材/角色动作/杨云-蓝边-左-静止.png",
  "最终素材/角色动作/秦浩瑞-头部部件.png",
  "最终素材/角色动作/秦浩瑞-横躺无血.png",
  "最终素材/角色动作/秦浩瑞-横躺有血.png",
  "最终素材/角色动作/秦浩瑞-站立向右.png",
  "最终素材/角色动作/秦浩瑞-身体部件.png",
  "最终素材/角色动作/董继豪-上-右腿.png",
  "最终素材/角色动作/董继豪-上-左腿.png",
  "最终素材/角色动作/董继豪-上-静止.png",
  "最终素材/角色动作/董继豪-下-右腿.png",
  "最终素材/角色动作/董继豪-下-左腿.png",
  "最终素材/角色动作/董继豪-下-静止.png",
  "最终素材/角色动作/董继豪-右-迈腿.png",
  "最终素材/角色动作/董继豪-右-静止.png",
  "最终素材/角色动作/董继豪-左-迈腿.png",
  "最终素材/角色动作/董继豪-左-静止.png",
  "最终素材/记忆碎片/万魂幡.png",
  "最终素材/记忆碎片/不锈钢饭卡.png",
  "最终素材/记忆碎片/但宇轩眼镜.png",
  "最终素材/记忆碎片/半瓶矿泉水.png",
  "最终素材/记忆碎片/圣水.png",
  "最终素材/记忆碎片/塑料算盘珠.png",
  "最终素材/记忆碎片/尺子.png",
  "最终素材/记忆碎片/拳击手套.png",
  "最终素材/记忆碎片/拳套.png",
  "最终素材/记忆碎片/断尺.png",
  "最终素材/记忆碎片/断尺碎片.png",
  "最终素材/记忆碎片/断铅笔.png",
  "最终素材/记忆碎片/无字毕业证.png",
  "最终素材/记忆碎片/旧磁带.png",
  "最终素材/记忆碎片/染血情书.png",
  "最终素材/记忆碎片/校长印章.png",
  "最终素材/记忆碎片/沾血校服布.png",
  "最终素材/记忆碎片/灵刃.png",
  "最终素材/记忆碎片/玉佩.png",
  "最终素材/记忆碎片/玉坠碎片.png",
  "最终素材/记忆碎片/玻璃弹珠.png",
  "最终素材/记忆碎片/生锈发卡.png",
  "最终素材/记忆碎片/生锈班牌.png",
  "最终素材/记忆碎片/破洞书包.png",
  "最终素材/记忆碎片/磨旧橡皮.png",
  "最终素材/记忆碎片/祖母绿戒指.png",
  "最终素材/记忆碎片/秦浩睿尺规.png",
  "最终素材/记忆碎片/空可乐罐.png",
  "最终素材/记忆碎片/粉笔.png",
  "最终素材/记忆碎片/粉笔头.png",
  "最终素材/记忆碎片/红边发带.png",
  "最终素材/记忆碎片/纯金校徽.png",
  "最终素材/记忆碎片/缺页日记.png",
  "最终素材/记忆碎片/翡翠校牌.png",
  "最终素材/记忆碎片/肾上腺素.png",
  "最终素材/记忆碎片/芹菜.png",
  "最终素材/记忆碎片/蒙尘奖章.png",
  "最终素材/记忆碎片/蓝边发带.png",
  "最终素材/记忆碎片/薄荷糖.png",
  "最终素材/记忆碎片/血渍绷带.png",
  "最终素材/记忆碎片/血镰.png",
  "最终素材/记忆碎片/褪色学生卡.png",
  "最终素材/记忆碎片/解药.png",
  "最终素材/记忆碎片/走失作业本.png",
  "最终素材/记忆碎片/过期眼药水.png",
  "最终素材/记忆碎片/钻石袖扣.png",
  "最终素材/记忆碎片/银质校徽.png",
  "最终素材/记忆碎片/锁链.png",
  "最终素材/记忆碎片/镀金钢笔.png",
  "最终素材/记忆碎片/镇魂铃.png",
  "最终素材/记忆碎片/黄铜书签.png",
  "最终素材/记忆碎片/黑色毕业照.png",
  "最终素材/记忆碎片/仓库钥匙.png",
  "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png",
];

describe("asset manifest", () => {
  it("includes every approved final production asset explicitly", () => {
    const manifestPaths = assetManifest.map((asset) => asset.path).sort();

    expect(manifestPaths).toEqual([...expectedFinalAssetPaths].sort());
    expect(assetManifest).toHaveLength(136);
  });

  it("has exactly 1 note.* entry", () => {
    const noteEntries = assetManifest.filter((a) => a.key.startsWith("note."));
    expect(noteEntries).toHaveLength(1);
    expect(noteEntries[0]!.key).toBe("note.遗落的纸条");
    expect(noteEntries[0]!.path).toBe("最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png");
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
