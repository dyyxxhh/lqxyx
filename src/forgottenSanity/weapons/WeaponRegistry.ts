// src/forgottenSanity/weapons/WeaponRegistry.ts
// 8 把武器定义 + 查表。纯 TS，无 Phaser import。
// spec §4，grill 2026-07-17 §4.6 meleeFan 3 档 / §4.7 大招具体参数（权威）
import type { DamageCategory } from '../combat/DamageType';
import type { EnemyKind, ProceduralKind } from '../combat/Enemy';

// ---------------------------------------------------------------------------
// WeaponId & WeaponRarity
// ---------------------------------------------------------------------------
export type WeaponId =
  | 'weapon.brokenRuler'
  | 'weapon.chalk'
  | 'weapon.ruler'
  | 'weapon.spiritBlade'
  | 'weapon.fistGauntlet'
  | 'weapon.chain'
  | 'weapon.bloodScythe'
  | 'weapon.soulBanner';

export type WeaponRarity = 'purple' | 'green' | 'gold' | 'white';

// ---------------------------------------------------------------------------
// 特效种类（ProceduralKind 子集 + 近战闪光独立种类）
// ---------------------------------------------------------------------------
export type WeaponProjectileKind = 'rulerShard' | 'chalkThrow' | 'bladeCrescent';
export type WeaponZoneKind =
  | 'chalkBomb' | 'rulerStorm' | 'fistDash' | 'chainCrush' | 'bloodWheel' | 'soulCapture';
export type MeleeFlashKind =
  | 'brokenRulerSlash' | 'rulerSlash' | 'fistCombo'
  | 'chainWhip' | 'bloodScytheSlash' | 'soulBannerSlash';

// ---------------------------------------------------------------------------
// 普攻（判别联合）
// ---------------------------------------------------------------------------
export interface MeleeFanBasic {
  readonly kind: 'meleeFan';
  readonly damage: number;
  readonly attacksPerSecond: number;
  readonly range: number;
  readonly halfAngle: number;       // 弧度（grill §4.6: π/6 / π/4 / π/3）
  readonly hitsPerAttack: number;   // 拳套 3，其余 1（grill: 同一最近敌多段）
  readonly category: DamageCategory;
  readonly lifestealPercent: number;  // 血镰 10，其余 0
  readonly fearProcPercent: number;   // 万魂幡 20，其余 0
  readonly fearDurationMs: number;    // 万魂幡 2000，其余 0
  readonly effectKind: MeleeFlashKind;
}

export interface RangedPiercingBasic {
  readonly kind: 'rangedPiercing';
  readonly damage: number;
  readonly attacksPerSecond: number;
  readonly range: number;           // 投射物射程
  readonly pierceCount: number;     // 粉笔 1，灵刃 Infinity
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly category: DamageCategory;
  readonly effectKind: WeaponProjectileKind;
}

export type WeaponBasicAttack = MeleeFanBasic | RangedPiercingBasic;

// ---------------------------------------------------------------------------
// 大招（判别联合 8 种）— grill §4.7 权威参数
// ---------------------------------------------------------------------------
export interface ScatterShardsUlt {
  readonly kind: 'scatterShards';    // 断尺尺屑散射
  readonly cooldownMs: number;
  readonly shardCount: number;
  readonly damage: number;
  readonly spreadHalfAngle: number;  // 弧度
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly effectKind: WeaponProjectileKind;
}

export interface ChalkBombAoeUlt {
  readonly kind: 'chalkBombAoe';     // 粉笔爆弹
  readonly cooldownMs: number;
  readonly damage: number;
  readonly radius: number;           // grill §4.7: r150
  readonly effectKind: WeaponZoneKind;
}

export interface RulerStormUlt {
  readonly kind: 'rulerStorm';       // 尺子风暴
  readonly cooldownMs: number;
  readonly durationMs: number;       // grill §4.7: 3000
  readonly damagePerSecond: number;  // grill §4.7: 15
  readonly radius: number;           // grill §4.7: 150
  readonly effectKind: WeaponZoneKind;
}

export interface BladeArrayUlt {
  readonly kind: 'bladeArray';       // 灵刃万刃阵
  readonly cooldownMs: number;
  readonly damage: number;           // grill §4.7: 18
  readonly projectileSpeed: number;  // grill §4.7: 400
  readonly projectileRadius: number;
  readonly pierceCount: number;      // grill §4.7: 2
  readonly directionCount: number;   // grill §4.7: 8 方向
  readonly bladeLength: number;      // grill §4.7: 180
  readonly effectKind: WeaponProjectileKind;
}

export interface FistDashUlt {
  readonly kind: 'fistDash';         // 拳套霸体冲拳
  readonly cooldownMs: number;
  readonly totalDamage: number;      // grill §4.7: 80（路径首敌40 + 末端40）
  readonly durationMs: number;       // grill §4.7: 300（0.3s）
  readonly radius: number;           // grill §4.7: 250（冲刺距离）
  readonly invincibleMs: number;     // grill §4.7: 300（无敌全程）
  readonly lockDirection: boolean;   // grill §4.7: true（锁定向不可转）
  readonly effectKind: WeaponZoneKind;
}

export interface ChainCrushUlt {
  readonly kind: 'chainCrush';       // 锁链万锁绞杀
  readonly cooldownMs: number;
  readonly pullRadius: number;       // grill §4.7: 200（拉扯检测范围）
  readonly pullDistance: number;     // grill §4.7: 200（首敌拉到身边，≤200px）
  readonly rootMs: number;           // grill §4.7: 2000
  readonly burnDps: number;          // grill §4.7: 10
  readonly burnMs: number;           // grill §4.7: 3000
  readonly effectKind: WeaponZoneKind;
}

export interface BloodWheelUlt {
  readonly kind: 'bloodWheel';       // 血镰血轮
  readonly cooldownMs: number;
  readonly durationMs: number;       // grill §4.7: 3000
  readonly damagePerSecond: number;  // grill §4.7: 50
  readonly radius: number;           // grill §4.7: 130
  readonly lifestealPercent: number; // grill §4.7: 10
  readonly effectKind: WeaponZoneKind;
}

export interface SoulCaptureUlt {
  readonly kind: 'soulCapture';      // 万魂幡拘魂
  readonly cooldownMs: number;
  readonly captureMode: 'screenViewport';  // grill §4.7: 屏幕可视范围（1280×720 视口）
  readonly excludeHpLe: number;            // grill §4.7: 1（排除 HP≤1 的但宇轩身体）
  readonly excludeKinds: readonly EnemyKind[];
  readonly effectKind: WeaponZoneKind;
}

export type WeaponUltimate =
  | ScatterShardsUlt
  | ChalkBombAoeUlt
  | RulerStormUlt
  | BladeArrayUlt
  | FistDashUlt
  | ChainCrushUlt
  | BloodWheelUlt
  | SoulCaptureUlt;

// ---------------------------------------------------------------------------
// WeaponDef
// ---------------------------------------------------------------------------
export interface WeaponDef {
  readonly id: WeaponId;
  readonly name: string;
  readonly rarity: WeaponRarity;
  readonly sanityValue: number;
  readonly textureKey: string | null;   // null = 程序绘制
  readonly basic: WeaponBasicAttack;
  readonly ultimate: WeaponUltimate;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// 8 把武器定义 (spec §4，grill §4.6/§4.7 权威)
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;

export const ALL_WEAPONS: readonly WeaponDef[] = [
  // -- 紫阶 (2) --
  {
    id: 'weapon.brokenRuler',
    name: '断尺',
    rarity: 'purple',
    sanityValue: 85,
    textureKey: null,
    basic: {
      // grill §4.6 快攻型: π/6 / 90
      kind: 'meleeFan', damage: 8, attacksPerSecond: 1.8, range: 90, halfAngle: Math.PI / 6,
      hitsPerAttack: 1, category: 'melee', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'brokenRulerSlash',
    },
    ultimate: {
      kind: 'scatterShards', cooldownMs: 22000, shardCount: 6, damage: 4,
      spreadHalfAngle: 60 * DEG, projectileSpeed: 320, projectileRadius: 8,
      effectKind: 'rulerShard',
    },
    description: '断裂的塑料尺，挥砍如刃。大招散射六枚尺屑。',
  },
  {
    id: 'weapon.chalk',
    name: '粉笔',
    rarity: 'purple',
    sanityValue: 70,
    textureKey: null,
    basic: {
      kind: 'rangedPiercing', damage: 6, attacksPerSecond: 2, range: 320, pierceCount: 1,
      projectileSpeed: 320, projectileRadius: 8, category: 'melee', effectKind: 'chalkThrow',
    },
    ultimate: {
      // grill §4.7: r150
      kind: 'chalkBombAoe', cooldownMs: 22000, damage: 25, radius: 150, effectKind: 'chalkBomb',
    },
    description: '投掷粉笔穿透一人。大招引爆粉笔爆弹。',
  },
  // -- 绿阶 (3) --
  {
    id: 'weapon.ruler',
    name: '尺子',
    rarity: 'green',
    sanityValue: 130,
    textureKey: 'prop.ruler',
    basic: {
      // grill §4.6 均衡型: π/4 / 120
      kind: 'meleeFan', damage: 15, attacksPerSecond: 1.5, range: 120, halfAngle: Math.PI / 4,
      hitsPerAttack: 1, category: 'melee', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'rulerSlash',
    },
    ultimate: {
      // grill §4.7: r150 / 3s / dps15
      kind: 'rulerStorm', cooldownMs: 20000, durationMs: 3000, damagePerSecond: 15,
      radius: 150, effectKind: 'rulerStorm',
    },
    description: '完整的尺子，扇形挥砍。大招召唤尺子风暴。',
  },
  {
    id: 'weapon.spiritBlade',
    name: '灵刃',
    rarity: 'green',
    sanityValue: 200,
    textureKey: null,
    basic: {
      kind: 'rangedPiercing', damage: 18, attacksPerSecond: 1.2, range: 400, pierceCount: Infinity,
      projectileSpeed: 400, projectileRadius: 10, category: 'melee', effectKind: 'bladeCrescent',
    },
    ultimate: {
      // grill §4.7: 8 方向 / 每刃长180 / 18伤 / pierce2 / 速400
      kind: 'bladeArray', cooldownMs: 25000, damage: 18, projectileSpeed: 400,
      projectileRadius: 10, pierceCount: 2, directionCount: 8, bladeLength: 180,
      effectKind: 'bladeCrescent',
    },
    description: '灵力凝成的月牙剑气，穿透一切。大招万刃阵八方向齐射。',
  },
  {
    id: 'weapon.fistGauntlet',
    name: '拳套',
    rarity: 'green',
    sanityValue: 170,
    textureKey: null,
    basic: {
      // grill §4.6 快攻型: π/6 / 90；grill: hitsPerAttack=3（同一最近敌 3 段）
      // spec §4.2 "10×3伤" = 10 damage × 3 hits = 30 total
      kind: 'meleeFan', damage: 10, attacksPerSecond: 2, range: 90, halfAngle: Math.PI / 6,
      hitsPerAttack: 3, category: 'melee', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'fistCombo',
    },
    ultimate: {
      // grill §4.7: 0.3s / 250px / 总伤80 / 无敌 / 锁定向
      kind: 'fistDash', cooldownMs: 22000, totalDamage: 80, durationMs: 300, radius: 250,
      invincibleMs: 300, lockDirection: true, effectKind: 'fistDash',
    },
    description: '快速连击拳套，三连击。大招霸体冲拳无敌突进。',
  },
  // -- 金阶 (2) --
  {
    id: 'weapon.chain',
    name: '锁链',
    rarity: 'gold',
    sanityValue: 420,
    textureKey: null,
    basic: {
      // grill §4.6 重型: π/3 / 180
      kind: 'meleeFan', damage: 25, attacksPerSecond: 1, range: 180, halfAngle: Math.PI / 3,
      hitsPerAttack: 1, category: 'melee', lifestealPercent: 0, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'chainWhip',
    },
    ultimate: {
      // grill §4.7: 拉扯≤200px / root 2s / burn 10/s×3s
      kind: 'chainCrush', cooldownMs: 25000, pullRadius: 200, pullDistance: 200, rootMs: 2000,
      burnDps: 10, burnMs: 3000, effectKind: 'chainCrush',
    },
    description: '中距离链鞭大范围挥击。大招万锁绞杀群拉缚身灼烧。',
  },
  {
    id: 'weapon.bloodScythe',
    name: '血镰',
    rarity: 'gold',
    sanityValue: 550,
    textureKey: null,
    basic: {
      // grill §4.6 重型: π/3 / 180
      kind: 'meleeFan', damage: 40, attacksPerSecond: 0.8, range: 180, halfAngle: Math.PI / 3,
      hitsPerAttack: 1, category: 'melee', lifestealPercent: 10, fearProcPercent: 0,
      fearDurationMs: 0, effectKind: 'bloodScytheSlash',
    },
    ultimate: {
      // grill §4.7: r130 / 3s / dps50 / lifesteal 10%
      kind: 'bloodWheel', cooldownMs: 25000, durationMs: 3000, damagePerSecond: 50,
      radius: 130, lifestealPercent: 10, effectKind: 'bloodWheel',
    },
    description: '大范围血镰挥斩，吸血 10%。大招血轮周身旋转。',
  },
  // -- 白阶 (1) --
  {
    id: 'weapon.soulBanner',
    name: '万魂幡',
    rarity: 'white',
    sanityValue: 1200,
    textureKey: null,
    basic: {
      // grill §4.6 均衡型: π/4 / 120
      kind: 'meleeFan', damage: 20, attacksPerSecond: 1, range: 120, halfAngle: Math.PI / 4,
      hitsPerAttack: 1, category: 'melee', lifestealPercent: 0, fearProcPercent: 20,
      fearDurationMs: 2000, effectKind: 'soulBannerSlash',
    },
    ultimate: {
      // grill §4.7: screenViewport + excludeHpLe=1
      kind: 'soulCapture', cooldownMs: 120000, captureMode: 'screenViewport', excludeHpLe: 1,
      excludeKinds: ['yangYunRed'], effectKind: 'soulCapture',
    },
    description: '万魂幡挥斩，20% 概率恐惧。大招拘魂秒杀一敌。',
  },
];

export const WEAPON_IDS: readonly WeaponId[] = ALL_WEAPONS.map((w) => w.id);

// ---------------------------------------------------------------------------
// 查表
// ---------------------------------------------------------------------------
const WEAPON_MAP: ReadonlyMap<string, WeaponDef> = new Map(ALL_WEAPONS.map((w) => [w.id, w]));

export function getWeapon(id: string): WeaponDef | null {
  return WEAPON_MAP.get(id) ?? null;
}

export function listWeaponsByRarity(rarity: WeaponRarity): readonly WeaponDef[] {
  return ALL_WEAPONS.filter((w) => w.rarity === rarity);
}

// 类型守卫：判断 ProceduralKind 是否为武器投射物种类
export function isWeaponProjectileKind(kind: ProceduralKind): kind is WeaponProjectileKind {
  return kind === 'rulerShard' || kind === 'chalkThrow' || kind === 'bladeCrescent';
}

export function isWeaponZoneKind(kind: ProceduralKind): kind is WeaponZoneKind {
  return kind === 'chalkBomb' || kind === 'rulerStorm' || kind === 'fistDash'
    || kind === 'chainCrush' || kind === 'bloodWheel' || kind === 'soulCapture';
}
