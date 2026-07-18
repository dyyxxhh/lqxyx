// src/forgottenSanity/loot/lootAssetKeys.ts
// itemId -> `loot.<中文名>` manifest texture key 解析 + 与 assetManifest 交叉验证。
// 纯 TS，无 Phaser import。plan 5 Task 6，spec §6 / §10。
import { assetManifest } from '../../data/assets';
import { ALL_LOOT } from './LootItem';

/**
 * itemId -> `loot.<中文名>` manifest key 映射。
 * 与 `src/data/assets.ts` 中已注册的 52 条 `loot.*` manifest 条目一一对应。
 * spec §6 的 48 件碎片每件一条；4 把非 §6 的 plan 4 武器（断尺/粉笔/灵刃/拳套）不在本映射中
 * （它们是 plan 4 WeaponDef，不是 plan 5 LootItem）。
 */
export const LOOT_SPRITE_KEY_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  // 蓝阶 12
  ['material.chalkStub', 'loot.粉笔头'],
  ['material.brokenPencil', 'loot.断铅笔'],
  ['material.emptyColaCan', 'loot.空可乐罐'],
  ['material.rustyHairpin', 'loot.生锈发卡'],
  ['material.lostHomework', 'loot.走失作业本'],
  ['material.bloodstainedUniform', 'loot.沾血校服布'],
  ['material.tornDiary', 'loot.缺页日记'],
  ['material.dustyMedal', 'loot.蒙尘奖章'],
  ['material.brokenRulerShard', 'loot.断尺碎片'],
  ['material.oldCassette', 'loot.旧磁带'],
  ['material.bloodstainedLoveLetter', 'loot.染血情书'],
  ['material.rustyClassPlate', 'loot.生锈班牌'],
  // 紫阶 12
  ['consumable.mint', 'loot.薄荷糖'],
  ['consumable.expiredEyeDrops', 'loot.过期眼药水'],
  ['consumable.halfBottleWater', 'loot.半瓶矿泉水'],
  ['relic.fadedStudentCard', 'loot.褪色学生卡'],
  ['relic.wornEraser', 'loot.磨旧橡皮'],
  ['relic.tornSchoolbag', 'loot.破洞书包'],
  ['material.steelMealCard', 'loot.不锈钢饭卡'],
  ['material.glassMarble', 'loot.玻璃弹珠'],
  ['material.brassBookmark', 'loot.黄铜书签'],
  ['material.plasticAbacusBead', 'loot.塑料算盘珠'],
  ['treasure.silverSchoolBadge', 'loot.银质校徽'],
  ['treasure.jadePendantFragment', 'loot.玉坠碎片'],
  // 绿阶 12
  ['consumable.celery', 'loot.芹菜'],
  ['consumable.antidote', 'loot.解药'],
  ['consumable.adrenaline', 'loot.肾上腺素'],
  ['relic.blueEdgeHeadband', 'loot.蓝边发带'],
  ['relic.danYuxuanGlasses', 'loot.但宇轩眼镜'],
  ['relic.qinHaoruiRulerCompass', 'loot.秦浩睿尺规'],
  ['relic.bloodstainedBandage', 'loot.血渍绷带'],
  ['relic.boxingGlove', 'loot.拳击手套'],
  ['weapon.ruler', 'loot.尺子'],
  ['treasure.jadeSchoolPlate', 'loot.翡翠校牌'],
  ['treasure.jadePendant', 'loot.玉佩'],
  ['treasure.gildedPen', 'loot.镀金钢笔'],
  // 金阶 8
  ['consumable.holyWater', 'loot.圣水'],
  ['consumable.soulBell', 'loot.镇魂铃'],
  ['relic.redEdgeHeadband', 'loot.红边发带'],
  ['relic.principalSeal', 'loot.校长印章'],
  ['weapon.chain', 'loot.锁链'],
  ['weapon.bloodScythe', 'loot.血镰'],
  ['treasure.diamondCufflink', 'loot.钻石袖扣'],
  ['treasure.pureGoldSchoolBadge', 'loot.纯金校徽'],
  // 白阶 4
  ['treasure.blankDiploma', 'loot.无字毕业证'],
  ['weapon.soulBanner', 'loot.万魂幡'],
  ['treasure.emeraldRing', 'loot.祖母绿戒指'],
  ['relic.blackGraduationPhoto', 'loot.黑色毕业照'],
  // spec §10.1 仓库钥匙（非 §6 碎片，单独注册）
  ['material.vaultKey', 'loot.仓库钥匙'],
]);

/**
 * 将 LootItem.id 解析为 `assetManifest` 中已注册的 `loot.<中文名>` texture key。
 * 未知 itemId 返回 `undefined`。
 */
export function lootSpriteKeyFor(itemId: string): string | undefined {
  return LOOT_SPRITE_KEY_MAP.get(itemId);
}

/**
 * 交叉验证 ALL_LOOT 中每件 LootItem 的 spriteKey：
 * 1. 在 LOOT_SPRITE_KEY_MAP 中存在解析条目；
 * 2. 解析结果与 LootItem.spriteKey 一致；
 * 3. spriteKey 存在于 assetManifest。
 * 返回失败条目列表（空数组表示全部通过）。
 */
export function validateLootSpriteKeys(): readonly string[] {
  const manifestKeys = new Set<string>(assetManifest.map((a) => a.key));
  const failures: string[] = [];
  for (const it of ALL_LOOT) {
    const resolved = lootSpriteKeyFor(it.id);
    if (resolved === undefined) {
      failures.push(`LootItem ${it.id} has no spriteKey resolver entry`);
      continue;
    }
    if (resolved !== it.spriteKey) {
      failures.push(`LootItem ${it.id} spriteKey ${it.spriteKey} != resolver ${resolved}`);
    }
    if (!manifestKeys.has(it.spriteKey)) {
      failures.push(`LootItem ${it.id} spriteKey ${it.spriteKey} not in assetManifest`);
    }
  }
  return failures;
}
