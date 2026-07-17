// src/tombraid/loot/LootItem.ts
// 48 件记忆碎片定义 + LootEffect 判别联合 + getLootItem 查询。
// 纯 TS，无 Phaser import。spec §6.2-§6.6，plan 5 Task 1。
import { getWeapon } from '../weapons/WeaponRegistry';
import type { WeaponId } from '../weapons/WeaponRegistry';

export type LootRarity = 'blue' | 'purple' | 'green' | 'gold' | 'white';
export type LootType = 'material' | 'consumable' | 'relic' | 'weapon' | 'treasure';

export const LOOT_RARITY_ORDER: readonly LootRarity[] = ['blue', 'purple', 'green', 'gold', 'white'];

export type LootBuffStat = 'moveSpeed' | 'attackSpeed' | 'visionRange' | 'pickupRange';
export type LootPassiveStat =
  | 'moveSpeed'
  | 'attackSpeed'
  | 'visionRange'
  | 'pickupRange'
  | 'critRate'
  | 'basicDamage';

export type LootEffect =
  | { readonly kind: 'heal'; readonly amount: number; readonly castTimeMs: number }
  | { readonly kind: 'cleanse'; readonly castTimeMs: number }
  | {
      readonly kind: 'buff';
      readonly stat: LootBuffStat;
      readonly magnitudePercent: number;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'multiBuff';
      readonly buffs: ReadonlyArray<{ readonly stat: LootBuffStat; readonly magnitudePercent: number }>;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'invulnerable';
      readonly durationMs: number;
      readonly castTimeMs: number;
      readonly fullRestore: boolean;
    }
  | {
      readonly kind: 'aoeStun';
      readonly durationMs: number;
      readonly vulnerabilityBonusPercent: number;
    }
  | { readonly kind: 'passiveMaxHp'; readonly amount: number }
  | {
      readonly kind: 'passiveStat';
      readonly stat: LootPassiveStat;
      readonly magnitudePercent: number;
    }
  | {
      readonly kind: 'passiveStatWithHpPenalty';
      readonly stat: 'attackSpeed';
      readonly magnitudePercent: number;
      readonly maxHpDelta: number;
    }
  | { readonly kind: 'passiveConsumableStackBonus'; readonly amount: number }
  | { readonly kind: 'passiveDamageImmunityChance'; readonly chancePercent: number }
  | { readonly kind: 'passiveExtractionValueBonus'; readonly magnitudePercent: number }
  | { readonly kind: 'passiveReviveOnce'; readonly reviveHpPercent: number };

export interface LootItem {
  readonly id: string;
  readonly name: string;
  readonly rarity: LootRarity;
  readonly type: LootType;
  readonly sanityValue: number;
  readonly spriteKey: string;
  readonly description: string;
  readonly effect: LootEffect | null;
}

function weaponLoot(id: WeaponId, name: string, description: string, spriteKey: string): LootItem {
  const w = getWeapon(id);
  if (w === null) {
    throw new Error(`WeaponRegistry missing weapon ${id} — plan 4 must run before plan 5`);
  }
  return {
    id,
    name,
    rarity: w.rarity as LootRarity,
    type: 'weapon',
    sanityValue: w.sanityValue,
    spriteKey,
    description,
    effect: null,
  };
}

export const ALL_LOOT: readonly LootItem[] = [
  // === 蓝阶 12 件（材料，sanity 10-35）spec §6.2 ===
  {
    id: 'material.chalkStub',
    name: '粉笔头',
    rarity: 'blue',
    type: 'material',
    sanityValue: 12,
    spriteKey: 'loot.粉笔头',
    description: '一截被踩碎的粉笔头，沾着粉笔灰。',
    effect: null,
  },
  {
    id: 'material.brokenPencil',
    name: '断铅笔',
    rarity: 'blue',
    type: 'material',
    sanityValue: 18,
    spriteKey: 'loot.断铅笔',
    description: '断成两截的铅笔，笔芯还露在外面。',
    effect: null,
  },
  {
    id: 'material.emptyColaCan',
    name: '空可乐罐',
    rarity: 'blue',
    type: 'material',
    sanityValue: 22,
    spriteKey: 'loot.空可乐罐',
    description: '被踩扁的空可乐罐，还残留着甜腻气味。',
    effect: null,
  },
  {
    id: 'material.rustyHairpin',
    name: '生锈发卡',
    rarity: 'blue',
    type: 'material',
    sanityValue: 28,
    spriteKey: 'loot.生锈发卡',
    description: '生锈的金属发卡，边缘已经发黑。',
    effect: null,
  },
  {
    id: 'material.lostHomework',
    name: '走失作业本',
    rarity: 'blue',
    type: 'material',
    sanityValue: 15,
    spriteKey: 'loot.走失作业本',
    description: '一本次主人不明的作业本，字迹潦草。',
    effect: null,
  },
  {
    id: 'material.bloodstainedUniform',
    name: '沾血校服布',
    rarity: 'blue',
    type: 'material',
    sanityValue: 30,
    spriteKey: 'loot.沾血校服布',
    description: '一块沾着干涸血迹的校服布片。',
    effect: null,
  },
  {
    id: 'material.tornDiary',
    name: '缺页日记',
    rarity: 'blue',
    type: 'material',
    sanityValue: 25,
    spriteKey: 'loot.缺页日记',
    description: '日记本缺了好几页，剩下的字句令人不安。',
    effect: null,
  },
  {
    id: 'material.dustyMedal',
    name: '蒙尘奖章',
    rarity: 'blue',
    type: 'material',
    sanityValue: 32,
    spriteKey: 'loot.蒙尘奖章',
    description: '蒙着灰尘的旧奖章，看不清 awarded 给谁。',
    effect: null,
  },
  {
    id: 'material.brokenRulerShard',
    name: '断尺碎片',
    rarity: 'blue',
    type: 'material',
    sanityValue: 10,
    spriteKey: 'loot.断尺碎片',
    description: '断尺崩飞出来的碎片，边缘锋利。',
    effect: null,
  },
  {
    id: 'material.oldCassette',
    name: '旧磁带',
    rarity: 'blue',
    type: 'material',
    sanityValue: 20,
    spriteKey: 'loot.旧磁带',
    description: '一盒外壳开裂的旧磁带，磁带已散开。',
    effect: null,
  },
  {
    id: 'material.bloodstainedLoveLetter',
    name: '染血情书',
    rarity: 'blue',
    type: 'material',
    sanityValue: 35,
    spriteKey: 'loot.染血情书',
    description: '一封被血浸透的情书，字迹已无法辨认。',
    effect: null,
  },
  {
    id: 'material.rustyClassPlate',
    name: '生锈班牌',
    rarity: 'blue',
    type: 'material',
    sanityValue: 33,
    spriteKey: 'loot.生锈班牌',
    description: '生锈的班级门牌，号码已被划花。',
    effect: null,
  },

  // === 紫阶 12 件（sanity 45-95）spec §6.3 ===
  // 消耗品 3
  {
    id: 'consumable.mint',
    name: '薄荷糖',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 50,
    spriteKey: 'loot.薄荷糖',
    description: '一颗薄荷糖，含下去能稍微提神。',
    effect: { kind: 'heal', amount: 3, castTimeMs: 0 },
  },
  {
    id: 'consumable.expiredEyeDrops',
    name: '过期眼药水',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 55,
    spriteKey: 'loot.过期眼药水',
    description: '过期很久的眼药水，滴下去视野会短暂清晰。',
    effect: { kind: 'buff', stat: 'visionRange', magnitudePercent: 10, durationMs: 10000 },
  },
  {
    id: 'consumable.halfBottleWater',
    name: '半瓶矿泉水',
    rarity: 'purple',
    type: 'consumable',
    sanityValue: 48,
    spriteKey: 'loot.半瓶矿泉水',
    description: '喝剩半瓶的矿泉水，能短暂加快脚步。',
    effect: { kind: 'buff', stat: 'moveSpeed', magnitudePercent: 5, durationMs: 8000 },
  },
  // 遗物 3
  {
    id: 'relic.fadedStudentCard',
    name: '褪色学生卡',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 75,
    spriteKey: 'loot.褪色学生卡',
    description: '褪色的学生卡，随身携带似乎能撑住一口气。',
    effect: { kind: 'passiveMaxHp', amount: 5 },
  },
  {
    id: 'relic.wornEraser',
    name: '磨旧橡皮',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 70,
    spriteKey: 'loot.磨旧橡皮',
    description: '磨旧的橡皮，攥在手里总觉得能多捡点东西。',
    effect: { kind: 'passiveStat', stat: 'pickupRange', magnitudePercent: 10 },
  },
  {
    id: 'relic.tornSchoolbag',
    name: '破洞书包',
    rarity: 'purple',
    type: 'relic',
    sanityValue: 65,
    spriteKey: 'loot.破洞书包',
    description: '破了个洞的书包，虽然漏东西但能装更多消耗品。',
    effect: { kind: 'passiveConsumableStackBonus', amount: 5 },
  },
  // 材料 4
  {
    id: 'material.steelMealCard',
    name: '不锈钢饭卡',
    rarity: 'purple',
    type: 'material',
    sanityValue: 80,
    spriteKey: 'loot.不锈钢饭卡',
    description: '不锈钢饭卡，沉甸甸的。',
    effect: null,
  },
  {
    id: 'material.glassMarble',
    name: '玻璃弹珠',
    rarity: 'purple',
    type: 'material',
    sanityValue: 45,
    spriteKey: 'loot.玻璃弹珠',
    description: '一颗透亮的玻璃弹珠。',
    effect: null,
  },
  {
    id: 'material.brassBookmark',
    name: '黄铜书签',
    rarity: 'purple',
    type: 'material',
    sanityValue: 90,
    spriteKey: 'loot.黄铜书签',
    description: '黄铜书签，刻着看不懂的花纹。',
    effect: null,
  },
  {
    id: 'material.plasticAbacusBead',
    name: '塑料算盘珠',
    rarity: 'purple',
    type: 'material',
    sanityValue: 60,
    spriteKey: 'loot.塑料算盘珠',
    description: '一颗塑料算盘珠，色彩鲜艳却显得廉价。',
    effect: null,
  },
  // 宝物 2
  {
    id: 'treasure.silverSchoolBadge',
    name: '银质校徽',
    rarity: 'purple',
    type: 'treasure',
    sanityValue: 85,
    spriteKey: 'loot.银质校徽',
    description: '银质校徽，做工精致。',
    effect: null,
  },
  {
    id: 'treasure.jadePendantFragment',
    name: '玉坠碎片',
    rarity: 'purple',
    type: 'treasure',
    sanityValue: 95,
    spriteKey: 'loot.玉坠碎片',
    description: '玉坠崩碎的一角，温润依旧。',
    effect: null,
  },

  // === 绿阶 12 件（sanity 120-220）spec §6.4 ===
  // 消耗品 3
  {
    id: 'consumable.celery',
    name: '芹菜',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 120,
    spriteKey: 'loot.芹菜',
    description: '一根芹菜，嚼下去能回不少血。',
    effect: { kind: 'heal', amount: 30, castTimeMs: 500 },
  },
  {
    id: 'consumable.antidote',
    name: '解药',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 150,
    spriteKey: 'loot.解药',
    description: '解药，能清除身上所有负面状态。',
    effect: { kind: 'cleanse', castTimeMs: 300 },
  },
  {
    id: 'consumable.adrenaline',
    name: '肾上腺素',
    rarity: 'green',
    type: 'consumable',
    sanityValue: 180,
    spriteKey: 'loot.肾上腺素',
    description: '肾上腺素，短暂大幅强化速度与攻速。',
    effect: {
      kind: 'multiBuff',
      buffs: [
        { stat: 'moveSpeed', magnitudePercent: 30 },
        { stat: 'attackSpeed', magnitudePercent: 20 },
      ],
      durationMs: 8000,
    },
  },
  // 遗物 5
  {
    id: 'relic.blueEdgeHeadband',
    name: '蓝边发带',
    rarity: 'green',
    type: 'relic',
    sanityValue: 200,
    spriteKey: 'loot.蓝边发带',
    description: '蓝边发带，戴上后体魄更壮。',
    effect: { kind: 'passiveMaxHp', amount: 20 },
  },
  {
    id: 'relic.danYuxuanGlasses',
    name: '但宇轩眼镜',
    rarity: 'green',
    type: 'relic',
    sanityValue: 160,
    spriteKey: 'loot.但宇轩眼镜',
    description: '但宇轩的眼镜，戴上视野更广。',
    effect: { kind: 'passiveStat', stat: 'visionRange', magnitudePercent: 20 },
  },
  {
    id: 'relic.qinHaoruiRulerCompass',
    name: '秦浩睿尺规',
    rarity: 'green',
    type: 'relic',
    sanityValue: 170,
    spriteKey: 'loot.秦浩睿尺规',
    description: '秦浩睿的尺规，让攻击更易命中要害。',
    effect: { kind: 'passiveStat', stat: 'critRate', magnitudePercent: 8 },
  },
  {
    id: 'relic.bloodstainedBandage',
    name: '血渍绷带',
    rarity: 'green',
    type: 'relic',
    sanityValue: 140,
    spriteKey: 'loot.血渍绷带',
    description: '血渍绷带，缠在身上偶尔能硬扛一击。',
    effect: { kind: 'passiveDamageImmunityChance', chancePercent: 15 },
  },
  {
    id: 'relic.boxingGlove',
    name: '拳击手套',
    rarity: 'green',
    type: 'relic',
    sanityValue: 190,
    spriteKey: 'loot.拳击手套',
    description: '拳击手套，让普攻更有力。',
    effect: { kind: 'passiveStat', stat: 'basicDamage', magnitudePercent: 20 },
  },
  // 武器 1（从 plan 4 getWeapon 派生）
  weaponLoot('weapon.ruler', '尺子', '尺子。普攻扇形，大招 rulerStorm。', 'loot.尺子'),
  // 宝物 3
  {
    id: 'treasure.jadeSchoolPlate',
    name: '翡翠校牌',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 160,
    spriteKey: 'loot.翡翠校牌',
    description: '翡翠校牌，价值不菲。',
    effect: null,
  },
  {
    id: 'treasure.jadePendant',
    name: '玉佩',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 220,
    spriteKey: 'loot.玉佩',
    description: '完整的玉佩，温润通透。',
    effect: null,
  },
  {
    id: 'treasure.gildedPen',
    name: '镀金钢笔',
    rarity: 'green',
    type: 'treasure',
    sanityValue: 130,
    spriteKey: 'loot.镀金钢笔',
    description: '镀金钢笔，笔尖闪光。',
    effect: null,
  },

  // === 金阶 8 件（sanity 400-580）spec §6.5 ===
  // 消耗品 2
  {
    id: 'consumable.holyWater',
    name: '圣水',
    rarity: 'gold',
    type: 'consumable',
    sanityValue: 400,
    spriteKey: 'loot.圣水',
    description: '圣水，饮用后短暂无敌并恢复全部状态。',
    effect: {
      kind: 'invulnerable',
      durationMs: 3000,
      castTimeMs: 1000,
      fullRestore: true,
    },
  },
  {
    id: 'consumable.soulBell',
    name: '镇魂铃',
    rarity: 'gold',
    type: 'consumable',
    sanityValue: 500,
    spriteKey: 'loot.镇魂铃',
    description: '镇魂铃，摇响后范围内缄默者眩晕并易伤。',
    effect: { kind: 'aoeStun', durationMs: 5000, vulnerabilityBonusPercent: 30 },
  },
  // 遗物 2
  {
    id: 'relic.redEdgeHeadband',
    name: '红边发带',
    rarity: 'gold',
    type: 'relic',
    sanityValue: 450,
    spriteKey: 'loot.红边发带',
    description: '红边发带，攻速大增但会消耗生命。',
    effect: {
      kind: 'passiveStatWithHpPenalty',
      stat: 'attackSpeed',
      magnitudePercent: 25,
      maxHpDelta: -15,
    },
  },
  {
    id: 'relic.principalSeal',
    name: '校长印章',
    rarity: 'gold',
    type: 'relic',
    sanityValue: 480,
    spriteKey: 'loot.校长印章',
    description: '校长印章，撤离结算时记忆碎片准出价值更高。',
    effect: { kind: 'passiveExtractionValueBonus', magnitudePercent: 15 },
  },
  // 武器 2（从 plan 4 getWeapon 派生）
  weaponLoot('weapon.chain', '锁链', '锁链。普攻大范围扇形，大招 chainCrush。', 'loot.锁链'),
  weaponLoot('weapon.bloodScythe', '血镰', '血镰。普攻带吸血，大招 bloodWheel。', 'loot.血镰'),
  // 宝物 2
  {
    id: 'treasure.diamondCufflink',
    name: '钻石袖扣',
    rarity: 'gold',
    type: 'treasure',
    sanityValue: 480,
    spriteKey: 'loot.钻石袖扣',
    description: '钻石袖扣，璀璨夺目。',
    effect: null,
  },
  {
    id: 'treasure.pureGoldSchoolBadge',
    name: '纯金校徽',
    rarity: 'gold',
    type: 'treasure',
    sanityValue: 580,
    spriteKey: 'loot.纯金校徽',
    description: '纯金校徽，沉甸甸的财富。',
    effect: null,
  },

  // === 白阶 4 件（sanity 750-1500）spec §6.6 ===
  {
    id: 'treasure.blankDiploma',
    name: '无字毕业证',
    rarity: 'white',
    type: 'treasure',
    sanityValue: 750,
    spriteKey: 'loot.无字毕业证',
    description: '一张空白的毕业证，什么都没写。',
    effect: null,
  },
  weaponLoot('weapon.soulBanner', '万魂幡', '万魂幡。普攻有概率恐惧，大招 soulCapture 即死。', 'loot.万魂幡'),
  {
    id: 'treasure.emeraldRing',
    name: '祖母绿戒指',
    rarity: 'white',
    type: 'treasure',
    sanityValue: 1300,
    spriteKey: 'loot.祖母绿戒指',
    description: '祖母绿戒指，绿光幽幽。',
    effect: null,
  },
  {
    id: 'relic.blackGraduationPhoto',
    name: '黑色毕业照',
    rarity: 'white',
    type: 'relic',
    sanityValue: 1500,
    spriteKey: 'loot.黑色毕业照',
    description: '黑色毕业照，受致命伤时复活一次。',
    effect: { kind: 'passiveReviveOnce', reviveHpPercent: 50 },
  },
];

const LOOT_BY_ID: ReadonlyMap<string, LootItem> = new Map(ALL_LOOT.map((it) => [it.id, it]));

export function getLootItem(id: string): LootItem | undefined {
  return LOOT_BY_ID.get(id);
}
