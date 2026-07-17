# 摸金模式（Tomb Raid Mode）设计规格

> **重建说明**：本 spec 从创建计划时的思考过程日志（`a.txt`）中还原。所有数值、数据结构、规则均来自日志中对 spec 各章节的引用。

## §1 入口与结算

### §1.1 概述
摸金模式是影中咎的 roguelike 副模式。玩家在程序生成的地下城中探索、战斗、收集记忆碎片，达到基准理智值后可撤离。死亡则丢失全部本局战利品。

### §1.2 场景结构
- `GameScene` 主菜单 → 「摸金模式」按钮 → `TombRaidHubScene`（枢纽）→ `TombRaidScene`（对局）
- 复用 `BootScene` / `PreloadScene`，不修改预加载流程
- 独立 localStorage 存档键，不污染剧情模式 `SaveState`

### §1.3 撤离/死亡结算
- **撤离成功**：本局 Inventory 碎片总值 ≥ baselineSanity → 碎片入仓库、更新 best sanity
- **撤离拒绝**：总值 < baselineSanity → 拒绝撤离，不修改仓库
- **死亡**：本局所有战利品丢失，仓库完全不变

```ts
export type SettlementOutcome =
  | { readonly kind: 'evacuated'; readonly totalValue: number; readonly bestSanity: number }
  | { readonly kind: 'refused'; readonly totalValue: number; readonly baseline: number }
  | { readonly kind: 'dead' };
```

---

## §2 地图生成

### §2.1 规模
- 设计像素：5000 × 4000
- 房间数：16–20（随机）
- 相机跟随玩家，视口 1280 × 720

### §2.2 房间类型（9 种）
```ts
export type TombRaidRoomKind =
  | 'entrance' | 'corridor' | 'classroom' | 'vault' | 'hall'
  | 'trap' | 'dark' | 'switchRoom' | 'exit';
```

### §2.3 差异化来源（roguelike）
- 房间数随机（16–20）
- 特殊结构种类随机选择+放置
- 连接拓扑随机（环 + 死路混合）
- 缄默者密度随机
- 房间矩形尺寸随机

### §2.4 宝箱分布
| 位置 | 类型 | 数量 |
|------|------|------|
| 野外普通宝箱 | normal | `clamp(round(roomCount/4), 3, 6)` |
| 宝藏房普通宝箱 | normal | 3 |
| 宝藏房鎏金宝箱 | gilded | 1（固定） |
| 野外鎏金宝箱 | gilded | 0–1（50% 概率） |

总数 7–11。普通宝箱分布：普通教室 70% / 陷阱房·暗室·机关房 30%。野外鎏金仅在暗室/机关房/大厅。

### §2.5 基准线与可达性
- `baselineSanity = roomCount × 50`
- 出口必须可达（BFS 从入口到出口拓扑连通）
- 生成器为纯函数，mulberry32 种子 RNG，同种子可复现

### §2.6 地图数据结构
```ts
export interface TombRaidMapManifest {
  id: string;
  seed: number;
  roomCount: number;
  bounds: { width: 5000; height: 4000 };
  rooms: readonly TombRaidRoom[];
  doors: readonly TombRaidDoor[];
  chests: readonly TombRaidChest[];
  baselineSanity: number;
  entranceRoomId: string;
  exitRoomId: string;
  floorTile: { tileWidth: 192; tileHeight: 192 };
}
```

---

## §3 战斗系统

### §3.1 玩家
- `PLAYER_MAX_HP = 100`
- `PLAYER_BASE_SPEED = 200`
- 攻击键：J（普攻）/ K（大招）/ H（交互）
- 初始武器占位 ID：`'weapon.ruler'`（plan 4 替换为真实武器系统）
- 空手弱拳：`WEAK_PUNCH_DAMAGE = 5`

### §3.2 伤害类型
```ts
export type DamageType = 'physical' | 'burn' | 'slow' | 'stun' | 'fear' | 'root';
export type DamageCategory = 'melee' | 'aoe' | 'dot';
export interface DamageInstance {
  amount: number;
  category: DamageCategory;
  debuff?: Debuff;
}
```

### §3.3 模块布局
- `combat/CombatManager.ts` — 战斗管理器（伤害结算/碰撞/AoE）
- `combat/Enemy.ts` — 缄默者基类 + 各子类
- `combat/PlayerCombat.ts` — 玩家战斗状态
- `combat/DamageType.ts` — 伤害类型 + DebuffTracker

### §3.4 Debuff
| Debuff | 字段 | 效果 |
|-------|------|------|
| burn | dps, duration | 持续伤害 |
| slow | multiplier, duration | 减速倍率 |
| stun | duration | 眩晕 |
| fear | duration, source | 恐惧（逃离来源） |
| root | duration | 定身 |

---

## §4 武器系统（8 把）

> 稀有度分阶：紫阶 / 绿阶 / 金阶 / 白阶（无蓝阶武器）

### §4.1 紫阶（2 把）

| 名称 | ID | sanityValue | 普攻 | 大招 |
|------|-----|-------------|------|------|
| 断尺 | weapon.brokenRuler | 85 | meleeFan 8伤, 1.8/s | 6×4碎片, CD 22s |
| 粉笔 | weapon.chalk | 70 | rangedPiercing 6伤, 2/s, pierce 1 | AoE 25伤, CD 22s |

### §4.2 绿阶（3 把）

| 名称 | ID | sanityValue | 普攻 | 大招 |
|------|-----|-------------|------|------|
| 尺子 | weapon.ruler | 130 | meleeFan 15伤, 1.5/s | rulerStorm, CD 20s |
| 灵刃 | weapon.spiritBlade | 200 | rangedPiercing 18伤, 1.2/s | 8方向bladeArray, CD 25s |
| 拳套 | weapon.fistGauntlet | 170 | meleeFan 10×3伤, 2/s | fistDash(无敌), 总伤80, CD 22s |

### §4.3 金阶（2 把）

| 名称 | ID | sanityValue | 普攻 | 大招 |
|------|-----|-------------|------|------|
| 锁链 | weapon.chain | 420 | meleeFan 25伤, 1/s, 大范围 | chainCrush 拉近+root 2s+DoT, CD 25s |
| 血镰 | weapon.bloodScythe | 550 | meleeFan 40伤, 0.8/s, lifesteal 10% | bloodWheel r130, dps 50×3s, CD 25s |

### §4.4 白阶（1 把）

| 名称 | ID | sanityValue | 普攻 | 大招 |
|------|-----|-------------|------|------|
| 万魂幡 | weapon.soulBanner | 1200 | meleeFan 20伤, 1/s, 20%概率fear 2s | soulCapture 即死1个随机非精英, CD 120s |

### §4.5 武器数据结构
```ts
export type WeaponAttackKind = 'meleeFan' | 'rangedPiercing';
export interface WeaponBasicAttack {
  kind: WeaponAttackKind;
  damage: number;
  attackSpeed: number;
  pierce?: number;
  lifestealPercent?: number;
  fearPercent?: number;
  fearDuration?: number;
}
export interface Weapon {
  id: string;
  name: string;
  rarity: LootRarity;
  sanityValue: number;
  spriteKey?: string;
  proceduralDraw?: ProceduralDrawSpec;
  basic: WeaponBasicAttack;
  ultimate: WeaponUltimate;
}
```

---

## §5 怪物系统

### §5.1–5.8 八种普通缄默者

| # | 名称 | HP | 接触伤 | speed | 攻击间隔 | 攻击模式 |
|---|------|-----|-------|-------|----------|----------|
| ① | 但宇轩头颅 | 45 | 8 | 60 | 3s | 2个追踪弹, 弹速120, 伤害14, 存活3s |
| ② | 秦浩睿头颅 | 55 | 8 | 50 | 5s | 尖叫r150, slow60%×2s, 伤害18 |
| ③ | 桌椅 | 120 | 15 | 40 | 6s | 翻桌扇形90°×120; 木屑6×10伤; 无敌1.2s; 落地椅子障碍8s |
| ④ | 电话 | 70 | 10 | 55 | 4.5s | 红圈r90延迟1.2s爆炸30伤; 响铃区2s内+10伤 |
| ⑤ | 血手 | 70 | 16 | 0 | 5s | 蓄力0.8s→抓取r100, 25伤+root1s→回收; 换位; 程序绘制 |
| ⑥ | 漂浮眼球 | 35 | 6 | 80 | 4s | 蓄力1s→激光无限射程, 宽20, 20伤+burn2/s×2s; 程序绘制 |
| ⑦ | 粉笔尘云 | 150 | 5/s | 30 | 持续接触 | 减视野30%; 物理伤害减半; AoE1.5×; 程序绘制 |
| ⑧ | 但宇轩头颅·血瞳 | 70 | 12 | 75 | 2.2s | 3个追踪弹, 弹速140, 18伤, 强追踪; 贴图+程序红眼光 |

### §5.9 召唤核心：但宇轩身体
- HP 1, 接触 0, speed 0
- 贴图：`sprite.danYuxuan.lyingBloody`
- **A**：每 30s 召唤血眼（玩家 200px 外）；存活血眼 ≥ 3 则不召唤
- **B**：身体死亡 → 所有绑定头颅死亡
- **C**：头颅死亡 20s 后原位复活（条件：身体仍存活）
- **D**：每杀一个头颅 30% 概率在小地图标记身体位置
- **地图上限**：最多 2 个身体

### §5.10 精英：杨云红边
> 游戏内蓝边和红边均只显示"杨云"
- HP 320, 接触 22, speed 95
- **初始中立**：巡逻移动不攻击，视野 350px
- **激怒条件**：在杨云视野(350px)内攻击任何缄默者或杨云本人 → 永久敌对
- **冲撞**（敌对后）：间隔 3s, 蓄力 1.0s, 持续 0.7s, 速度 320, 伤害 50 + 击退
- **A 影分身**（HP<70% 触发一次）：2 个幻影, HP 40, 接触 8, speed 80, 存活 12s
- **B 地裂波**（HP<70% 起每 8s）：宽 60, 速度 200, 伤害 28, slow 50%×1.5s, 蓄力 0.6s
- **C 二阶段**（HP<40%）：攻击间隔 1.8s, 冲撞速度 380, 接触+burn 3/s×3s, 所有 CD 减半
- **击杀奖励**（§10.1）：
  - 100% 掉落仓库钥匙（非碎片，调用方单独发放）
  - 独立碎片掷骰：紫 50% / 绿 30% / 金 8% / 白 2%
  - 触发全屏遮罩"理智正在消散", 持续 2s
  - 视野变为 220px（红边雾战）
  - 理智刷新 +100%

---

## §6 记忆碎片（48 件）

### §6.1 稀有度顺序
蓝 < 紫 < 绿 < 金 < 白

### §6.2 蓝阶（12 件，材料类，sanity 10–35）

| itemId | 名称 | sanityValue |
|--------|------|-------------|
| material.chalkStub | 粉笔头 | 12 |
| material.brokenPencil | 断铅笔 | 18 |
| material.emptyColaCan | 空可乐罐 | 22 |
| material.rustyHairpin | 生锈发卡 | 28 |
| material.lostHomework | 走失作业本 | 15 |
| material.bloodstainedUniform | 沾血校服布 | 30 |
| material.tornDiary | 缺页日记 | 25 |
| material.dustyMedal | 蒙尘奖章 | 32 |
| material.brokenRulerShard | 断尺碎片 | 10 |
| material.oldCassette | 旧磁带 | 20 |
| material.bloodstainedLoveLetter | 染血情书 | 35 |
| material.rustyClassPlate | 生锈班牌 | 33 |

### §6.3 紫阶（12 件，sanity 45–95）

**消耗品 3**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| consumable.mint | 薄荷糖 | 50 | heal 3, 瞬发 |
| consumable.expiredEyeDrops | 过期眼药水 | 55 | visionRange +10%, 10s |
| consumable.halfBottleWater | 半瓶矿泉水 | 48 | moveSpeed +5%, 8s |

**遗物 3**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| relic.fadedStudentCard | 褪色学生卡 | 75 | passiveMaxHp +5 |
| relic.wornEraser | 磨旧橡皮 | 70 | passiveStat pickupRange +10% |
| relic.tornSchoolbag | 破洞书包 | 65 | passiveConsumableStackBonus +5 |

**材料 4**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| material.steelMealCard | 不锈钢饭卡 | 80 |
| material.glassMarble | 玻璃弹珠 | 45 |
| material.brassBookmark | 黄铜书签 | 90 |
| material.plasticAbacusBead | 塑料算盘珠 | 60 |

**宝物 2**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| treasure.silverSchoolBadge | 银质校徽 | 85 |
| treasure.jadePendantFragment | 玉坠碎片 | 95 |

### §6.4 绿阶（12 件，sanity 120–220）

**消耗品 3**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| consumable.celery | 芹菜 | 120 | heal 30, cast 500ms |
| consumable.antidote | 解药 | 150 | cleanse, cast 300ms |
| consumable.adrenaline | 肾上腺素 | 180 | moveSpeed +30% & attackSpeed +20%, 8s |

**遗物 5**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| relic.blueEdgeHeadband | 蓝边发带 | 200 | passiveMaxHp +20 |
| relic.danYuxuanGlasses | 但宇轩眼镜 | 160 | passiveStat visionRange +20% |
| relic.qinHaoruiRulerCompass | 秦浩睿尺规 | 170 | passiveStat critRate +8% |
| relic.bloodstainedBandage | 血渍绷带 | 140 | passiveDamageImmunityChance 15% |
| relic.boxingGlove | 拳击手套 | 190 | passiveBasicDamagePercent +20% |

**武器 1**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| weapon.ruler | 尺子 | 130 |

**宝物 3**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| treasure.jadeSchoolPlate | 翡翠校牌 | 160 |
| treasure.jadePendant | 玉佩 | 220 |
| treasure.gildedPen | 镀金钢笔 | 130 |

### §6.5 金阶（8 件，sanity 400–580）

**消耗品 2**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| consumable.holyWater | 圣水 | 400 | invulnerable 3s, fullRestore, cast 1000ms |
| consumable.soulBell | 镇魂铃 | 500 | aoeCrowdControl stun 5s, vuln +30% |

**遗物 2**：
| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| relic.redEdgeHeadband | 红边发带 | 450 | passiveAttackSpeedWithHpPenalty +25% / -15 |
| relic.principalSeal | 校长印章 | 480 | passiveExtractionValueBonus +15% |

**武器 2**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| weapon.chain | 锁链 | 420 |
| weapon.bloodScythe | 血镰 | 550 |

**宝物 2**：
| itemId | 名称 | sanityValue |
|--------|------|-------------|
| treasure.diamondCufflink | 钻石袖扣 | 480 |
| treasure.pureGoldSchoolBadge | 纯金校徽 | 580 |

### §6.6 白阶（4 件，sanity 750–1500）

| itemId | 名称 | sanityValue | 效果 |
|--------|------|-------------|------|
| treasure.blankDiploma | 无字毕业证 | 750 | 无效果（废卡） |
| weapon.soulBanner | 万魂幡 | 1200 | — |
| treasure.emeraldRing | 祖母绿戒指 | 1300 | — |
| relic.blackGraduationPhoto | 黑色毕业照 | 1500 | passiveReviveOnce, 复活HP 50% |

### §6.7 白阶特殊规则
白阶掉落时 **70% 概率**为 `treasure.blankDiploma`（无字毕业证，废卡）

### §6.8 LootItem 数据结构
```ts
export type LootRarity = 'blue' | 'purple' | 'green' | 'gold' | 'white';
export type LootType = 'material' | 'consumable' | 'relic' | 'weapon' | 'treasure';
export interface LootItem {
  readonly id: string;
  readonly name: string;
  readonly rarity: LootRarity;
  readonly type: LootType;
  readonly sanityValue: number;
  readonly spriteKey?: string;
  readonly description: string;
  readonly effect: LootEffect | null;
}
```

LootEffect 为判别联合，包含：heal / cleanse / buff / invulnerable / aoeCC / passiveMaxHp / passiveStat / passiveConsumableStack / passiveImmunity / passiveBasicDmg / passiveAtkSpeedHpPenalty / passiveExtractionValueBonus / passiveReviveOnce / null

---

## §7 宝箱

### §7.1 宝箱破译
- 按住 F 持续破译，松开后进度以与破译相同的速率回退（100%回退速率）
- 已崩开的锁扣（0.25/0.5/0.75里程碑）永久保留，回退到上一个锁扣处停止
- 4 个锁扣里程碑：0.25 / 0.5 / 0.75 / 1.0
- 总时长 ~2.5s
- 完成后输入锁解除，战利品卡弹出可拾取

### §7.2 破译状态机
states: `'idle' | 'decrypting' | 'opened' | 'completed'`
progress: 0..1, rate = 1/2500 per ms, decayRate = 1/2500 per ms（松开时回退）
锁扣里程碑: 0.25/0.5/0.75/1.0，回退到上一个已崩开锁扣处停止

### §7.3 宝箱视觉
- 贴图：`phoneCabinetFront`（手机柜正面）
- 开盖瞬间 swap 纹理 → `phoneCabinetAngled`
- 程序绘制叠加层：旋转码环 / 像素字符 / 进度弧 / 粒子 / 屏震
- 锁扣崩开：金✕ + 咔哒音 + 屏幕震动渐强
- 最后一扣全屏白闪 1 帧
- 开盖：金光柱 + 飞出按稀有度描边的战利品卡

### §7.4 宝箱掉落
- 普通宝箱：independent 模式，各稀有度独立掷骰（蓝30%/紫30%/绿100%/金15%/白2%），1–5 件
- 鎏金宝箱：independent 模式，各稀有度独立掷骰（蓝30%/紫50%/绿70%/金100%/白15%），1–5 件
- 白阶掉落 70% 概率为无字毕业证（§6.7）

---

## §8 Meta 经济

### §8.1 仓库（Stash）
- 无限槽位
- 存 `items: readonly TombRaidStashItem[]` + `sanity: number` 理智账
- localStorage key: `ying-zhong-jiu.tomb-raid.stash.v1`

### §8.2 商城（Shop）
- 卖价 = 碎片面值 ×1（1:1）
- 买价 = `Math.ceil(lootItem.sanityValue × 1.75)`
- 可买：消耗品 + 武器；可卖：任意

### §8.3 起配（Loadout）
- 1 武器 + 3 消耗品槽
- 武备升级 +1 槽（最多 +3 → 6 槽）
- 空手 = `unarmed`，弱拳击 5 伤害
- 新用户起手包：`weapon.ruler ×1` + `consumable.celery ×3`（仅发放一次）

```ts
export type ConsumeResult =
  | { readonly ok: true; readonly stash: TombRaidStashState }
  | { readonly ok: false; readonly reason: 'insufficient-stock'; readonly stash: TombRaidStashState };
```

### §8.4 永久升级（6 种）

| 升级 ID | 效果 | 阶数 | 各阶成本（理智） |
|---------|------|------|-------------------|
| physique（体魄） | +4% maxHP | 5 | 200 / 400 / 600 / 800 / 1000 |
| swift（疾走） | +4% moveSpeed | 5 | 200 / 400 / 600 / 800 / 1000 |
| pickup（拾取） | +4% pickupRange | 5 | 300 / 500 / 700 / 900 / 1100 |
| sharp（锐利） | +4% attackDamage | 5 | 300 / 500 / 700 / 900 / 1100 |
| lucky（幸运） | +4% dropRate | 5 | 500 / 800 / 1200 / 1500 / 2000 |
| armory（武备） | +1 消耗品槽 | 3 | 500 / 800 / 1200 |

### §8.5 存档 Schema（4 个独立 localStorage key）
```ts
// ying-zhong-jiu.tomb-raid.stash.v1
export interface TombRaidStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly TombRaidStashItem[];
}
export interface TombRaidStashItem {
  readonly itemId: string;
  readonly quantity: number;
}

// ying-zhong-jiu.tomb-raid.upgrades.v1
export type TombRaidUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';
export interface TombRaidUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<TombRaidUpgradeId, number>>;
}

// ying-zhong-jiu.tomb-raid.best.v1
export interface TombRaidBestState {
  readonly schemaVersion: number;
  readonly bestSanity: number;
}

// ying-zhong-jiu.tomb-raid.progress.v1
export interface TombRaidProgressState {
  readonly schemaVersion: number;
  readonly starterPackGranted: boolean;
}
```

---

## §9 HUD 与地图 UI

### §9.1 HUD 布局
- **左上**：HP 血条 + 武器图标 + 大招 CD 环
- **顶部中央**：当前理智 / 基准线（达到基准线时变金）
- **右上**：小地图
- **底部中央**：消耗品槽
- **左下**：理智比率

### §9.2 小地图
- 雾战：仅显示玩家走过的区域（脚步点亮）
- 玩家点 + 出口 / 宝箱 / 身体标记
- 缄默者不显示
- 按 M 键或点击小地图 → 大地图
- 关闭：ESC 或再点小地图

### §9.3 红边雾战（RedEdgeFogOverlay）
- 击杀杨云红边后触发
- 全屏遮罩"理智正在消散", 持续 2s
- 视野缩减为 220px
- 理智刷新 +100%

---

## §10 掉落

### §10.1 杨云红边掉落
- 钥匙不在 LootTable 中，由调用方（CombatManager）单独发放
- **钥匙用途**：开启宝藏房门（vault door），进入后宝箱免费破译
- yangYunRed LootTable 仅做独立碎片掷骰（4 个稀有度各自独立掷骰），可返回 0–4 件

### §10.2 掉落表模式
```ts
export type LootRollMode = 'single' | 'independent' | 'multiPick';
```
- single：单次掷骰选 1 件
- independent：每个稀有度独立掷骰
- multiPick：多次不放回选取

---

## §11 模块布局与约束

### §11.1 目录结构
```
src/tombraid/
├── state/tombRaidState.ts       # 4 key 存档 + 起手包
├── map/
│   ├── tombRaidMapState.ts      # manifest 类型
│   ├── TombRaidMapGenerator.ts  # 程序化生成器（纯函数）
│   └── TombRaidMapRenderer.ts   # 薄渲染器
├── combat/
│   ├── DamageType.ts            # 伤害类型 + DebuffTracker
│   ├── PlayerCombat.ts          # 玩家战斗状态
│   ├── CombatManager.ts         # 战斗管理器
│   ├── Enemy.ts                 # 缄默者基类 + 11 子类
│   └── EnemyViewRenderer.ts     # 集中程序绘制
├── weapons/
│   ├── WeaponRegistry.ts        # 8 把武器定义
│   ├── WeaponEffect.ts          # 程序绘制特效
│   ├── WeaponCooldowns.ts       # 冷却状态机
│   └── WeaponCombatAdapter.ts   # 普攻/大招执行器
├── loot/
│   ├── LootItem.ts              # 48 件碎片定义
│   ├── LootTable.ts             # 4 张掉率表 + roll 函数
│   ├── Inventory.ts             # 本局背包
│   ├── chestDecryptState.ts     # 破译纯状态机
│   └── ChestDecrypt.ts          # Phaser 薄层
├── meta/
│   ├── UpgradeManager.ts        # 6 种永久升级
│   ├── StashManager.ts          # 仓库
│   ├── ShopManager.ts           # 商城
│   └── LoadoutManager.ts        # 起配
├── ui/
│   ├── HubUI.ts                 # 枢纽 5 面板
│   ├── TombRaidHUD.ts           # 对局 HUD
│   ├── Minimap.ts               # 小地图 + 大地图
│   ├── RedEdgeFogOverlay.ts     # 红边雾战
│   ├── SettlementScreen.ts      # 撤离/死亡结算
│   └── MobileControls.ts        # 移动端控件
├── TombRaidHubScene.ts          # 枢纽场景
└── TombRaidScene.ts             # 对局场景
```

### §11.2 约束
- 不修改剧情模式代码（EventEngine/storyManifest/SaveState/PreloadScene）
- 不修改 `GAME_SCENES` 调试常量（保持 sanity test 通过）
- 所有 UI 复用 `UI_THEME`
- TypeScript strict 模式（noUncheckedIndexedAccess / exactOptionalPropertyTypes）
- TDD 强制（RED→GREEN→SURFACE）
- 素材根目录仅允许 `最终素材/`

### §11.3 资产清单
- loot key 命名：`loot.<itemId>`
- 46 个 loot manifest 条目注册进 `src/data/assets.ts`
- 素材路径：`最终素材/记忆碎片/<名称>.png`

### §11.4 移动端
- 复用 `InputManager` 摇杆（base 200,600，radius 80）
- 右侧 4 个动作按钮：普攻(J) / 大招(K) / 交互(H) / 消耗品
- 与桌面端功能对等

### §11.5 深度层级（复用主项目）
floor=0, walls=1, door=6, label=7, hitArea=8, player=10, chest=3, UI=1000+

---

## 关键数值速查

| 类别 | 数值 |
|------|------|
| 玩家 maxHP | 100 |
| 玩家 speed | 200 |
| 弱拳击伤害 | 5 |
| 地图尺寸 | 5000 × 4000 |
| 房间数 | 16–20 |
| 基准线公式 | roomCount × 50 |
| 宝箱总数 | 7–11 |
| 武器数 | 8 |
| 怪物总数 | 9 + 1 召唤核心 + 1 精英 |
| 战利品总数 | 48（蓝12/紫12/绿12/金8/白4） |
| 永久升级种类 | 6 |
| 武备最大扩展槽 | +3（消耗品 3→6） |
| 商城买价系数 | ×1.75 |
| 商城卖价系数 | ×1.0 |
| 杨云红边 HP | 320 |
| 杨云红边掉钥匙概率 | 100% |
| 白阶毕业证占比 | 70% |
| 红边击杀后视野 | 220px |
| 红边击杀后理智刷新 | +100% |
| 召唤核心召唤间隔 | 30s |
| 召唤核心最大血眼数 | 3 |
| 头颅复活时间 | 20s |
| 头颅标记身体概率 | 30% |
| 地图最多身体数 | 2 |
| localStorage schemaVersion | 1 |
