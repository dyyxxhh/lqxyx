# 被遗忘的理智（Forgotten Sanity Mode）设计规格

> **重建说明**：本 spec 从创建计划时的思考过程日志（`a.txt`）中还原。所有数值、数据结构、规则均来自日志中对 spec 各章节的引用。

## §1 入口与结算

### §1.1 概述
被遗忘的理智是影中咎的 roguelike 副模式。玩家在程序生成的地下城中探索、战斗、收集记忆碎片，达到基准理智值后可撤离。死亡则丢失全部本局战利品。

### §1.2 场景结构
- `GameScene` 主菜单 → 「被遗忘的理智」按钮 → `ForgottenSanityHubScene`（枢纽）→ `ForgottenSanityScene`（对局）
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
export type ForgottenSanityRoomKind =
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
export interface ForgottenSanityMapManifest {
  id: string;
  seed: number;
  roomCount: number;
  bounds: { width: 5000; height: 4000 };
  rooms: readonly ForgottenSanityRoom[];
  doors: readonly ForgottenSanityDoor[];
  chests: readonly ForgottenSanityChest[];
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
- `PLAYER_BASE_SPEED = 200`（走）
- `PLAYER_RUN_SPEED = 320`（跑，按 Shift）
- `STAMINA_MAX = 100`，跑耗 33.3/s（3s 耗完），走/静止回 20/s（5s 回满）
- **疲劳锁**：体力耗尽后强制走 1s 不能跑（疲劳惩罚），1s 后开始正常回体
- 攻击键：J（普攻）/ K（大招）/ H（交互）/ Shift（跑）
- 初始武器占位 ID：`'weapon.ruler'`（plan 4 替换为真实武器系统）
- 空手弱拳：`WEAK_PUNCH_DAMAGE = 5`
- 移动方向：8 方向（同剧情模式 InputManager），斜向取上下优先（CharacterRegistry.resolveDirection）

### §3.2 伤害类型与命中判定
```ts
export type DamageType = 'physical' | 'burn' | 'slow' | 'stun' | 'fear' | 'root';
export type DamageCategory = 'melee' | 'aoe' | 'dot';
export interface DamageInstance {
  amount: number;
  category: DamageCategory;
  debuff?: Debuff;
}
```

**命中判定（grill 确认 2026-07-17）**：
- **近战（meleeFan）**：扇形几何与敌人 AABB 相交判定，**仅命中扇形内最近 1 敌**（单体近战原则）
  - 例外：拳套 `10×3伤` = 单敌 3 段×10（爆发型，同一最近敌受 3 段）
- **远程（rangedPiercing）**：直线弹道，朝玩家 8 方向之一射出（同移动方向，静止时用上次方向），`pierce=N` 穿 N 敌后消失，遇墙停止
- **攻击方向**：普攻/大招方向 = 玩家移动方向（8 方向），无鼠标依赖
- **大招转向**：释放中可转向（持续型大招如 rulerStorm/bloodWheel/bladeArray/chainCrush 适用）
  - 例外：fistDash 冲刺方向释放瞬间锁定，冲刺中不可转（0.3s 短冲刺，预判要求高）

**玩家碰撞几何**：8×8 像素点检测（中心点判定），用于墙壁碰撞与可走性检测。
**fistDash 无敌期**：冲刺 0.3s 期间免疫伤害数值，但 debuff（slow/stun/burn 等）仍应用。

### §3.3 模块布局
- `combat/CombatManager.ts` — 战斗管理器（伤害结算/碰撞/AoE）
- `combat/Enemy.ts` — 缄默者基类 + 各子类
- `combat/PlayerCombat.ts` — 玩家战斗状态
- `combat/DamageType.ts` — 伤害类型 + DebuffTracker

### §3.4 Debuff
| Debuff | 字段 | 效果 |
|-------|------|------|
| burn | dps, duration | 持续伤害（**dps 累加，duration 取 max**：同源/异源 burn 叠加时 dps 相加，剩余时间取较长者） |
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
  fanHalfAngleDeg?: number;   // meleeFan 半角
  fanRadius?: number;         // meleeFan 半径
  multiHit?: number;          // 单敌多段（拳套 3）
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

### §4.6 meleeFan 档位与武器分配（grill 确认 2026-07-17）

按玩法风格分 3 档，武器按档位分配几何参数。`fanHalfAngleDeg` 为扇形**半角**（与 §5.11.2 视野锥 `visionHalfAngleDeg` 同义，总宽 = 2 × 半角）：

| 档位 | 半角 (fanHalfAngleDeg) | 总宽 | 半径 (fanRadius) | 适用武器 | 风格说明 |
|------|------|------|------|----------|----------|
| 快攻型 | 30° | 60° | 90px | 断尺、拳套 | 窄短，需贴脸，高频 |
| 均衡型 | 45° | 90° | 120px | 尺子、万魂幡 | 标准，覆盖适中 |
| 重型 | 60° | 120° | 180px | 锁链、血镰 | 广扫，大范围 |

**rangedPiercing 武器**（断尺为近战；粉笔/灵刃为远程）：朝玩家 8 方向射出，pierce 按武器定义，遇墙停止。

**大招转向规则**：释放中可转向（持续型），fistDash 例外（锁定方向）。

### §4.7 大招具体参数（grill 确认 2026-07-17）

```ts
export type WeaponUltimateKind =
  | 'fragmentBurst'      // 断尺 6×4 碎片
  | 'aoeBurst'           // 粉笔 AoE
  | 'rulerStorm'         // 尺子尺风暴
  | 'bladeArray'         // 灵刃 8 方向刃阵
  | 'fistDash'           // 拳套冲刺
  | 'chainCrush'         // 锁链拉扯
  | 'bloodWheel'         // 血镰血轮
  | 'soulCapture';       // 万魂幡即死

export interface WeaponUltimate {
  readonly kind: WeaponUltimateKind;
  readonly cooldownMs: number;
  readonly radius?: number;
  readonly durationMs?: number;
  readonly damagePerSecond?: number;
  readonly totalDamage?: number;
  readonly lifestealPercent?: number;
  readonly rootMs?: number;
  readonly burnDps?: number;
  readonly burnMs?: number;
  readonly pullRange?: number;
  readonly dashDistance?: number;
  readonly dashDurationMs?: number;
  readonly invulnerable?: boolean;
  readonly lockDirection?: boolean;
}
```

| 武器 | 大招 | CD | 关键参数 |
|------|------|-----|----------|
| 断尺 | fragmentBurst | 22s | 6×4 碎片，每片 4 伤（总 24），扇形或随机散布 |
| 粉笔 | aoeBurst | 22s | AoE 25 伤，r150，瞬发 |
| 尺子 | rulerStorm | 20s | **3s 环 r150 dps15**（总 45），持续型，玩家可移动可转向 |
| 灵刃 | bladeArray | 25s | **8 方向射出**，每刃长 180 / 宽 20 / 18 伤 / pierce 2 / 速度 400，遇墙消失 |
| 拳套 | fistDash | 22s | **0.3s 冲刺距离 250**（速 833），路径首敌 40 + 末端 40（总 80），**无敌** + **锁定向不可转** |
| 锁链 | chainCrush | 25s | **拉扯 ≤200px**（首敌拉到身边），root 2s + burn 10/s×3s，近战控制型 |
| 血镰 | bloodWheel | 25s | **3s r130 dps50**（总 150），lifesteal 10%，持续型，可移动可转向 |
| 万魂幡 | soulCapture | 120s | **屏幕可视范围**（1280×720 视口）内随机 1 只非精英即死，排除但宇轩身体（HP=1） |

**soulCapture 特殊**：视野判定按屏幕可视范围（相机视口 1280×720），不穿墙检测仍生效（墙后敌人不可见即不被选）。

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
- **B**：身体死亡 → 所有绑定头颅死亡；复活计时器随之清除（boundHeads 清空，deadHeads 不再复活）
- **C**：头颅死亡 20s 后原位复活（条件：身体仍存活）
- **D**：每杀一个头颅 30% 概率在小地图标记身体位置
- **地图上限**：最多 1 个身体
- **召唤计时器与降级交互（grill 补充 2026-07-17）**：身体始终以 1Hz 真实时间推进召唤计时器，**不受 §5.11.7 远房 4Hz 降级影响**。玩家离开房间后召唤不暂停，可能返回时遭遇血眼伏击。头颅复活计时器（§5.9 C 20s）同此规则，始终按真实时间推进。

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
  - 视野变为 `RED_EDGE_VISIBILITY_RADIUS_PX = 220`（红边雾战，本 spec 唯一定义；§9.3 / §11.x 数值表均引用此常量）
  - 缄默者复制 ×2（仅普通缄默者：①但宇轩头颅/②秦浩睿/③桌椅/④电话/⑤血手/⑥漂浮眼球/⑦粉笔尘云/⑧血瞳头颅）
    - 复制数量 = 现有普通缄默者数量，即每个原体生成 1 个复制体（共 ×2 现有数量）
    - 复制体属性与原体一致（HP/接触伤/speed/攻击间隔/感知参数）
    - 复制体出生位置 = 玩家视口（1280×720）+ 100px buffer 外的随机房间内随机点
    - 复制体按原体同表 ×1.0 掉落
    - 复制体标记 `isDuplicate=true` 防止递归

### §5.11 感知 / 巡逻 / 脱战（普通缄默者三态机）

> **设计变更（grill 确认 2026-07-17）**：补全 spec §5.1-5.8 留白的感知机制。plan 3 原始实现「全图感知永久追击」作废，改用视野锥+噪声二通道感知、定点待机巡逻、三态机脱战、远房降级更新。

#### §5.11.1 三态机
```
待机 (idle) ──视野命中 OR 噪声命中──▶ 警觉 (alert)
警觉 (alert) ──视野命中 OR 噪声命中──▶ 追击 (chase)
追击 (chase) ──脱离视野 N 秒──▶ 搜索 (search)
搜索 (search) ──到达最后目击点 N 秒无新刺激──▶ 警觉 (alert)
警觉 (alert) ──原地 N 秒无新刺激──▶ 待机 (idle)
搜索 (search) ──视野/噪声命中──▶ 追击 (chase)   // 搜索中再次发现立即追击
```

#### §5.11.2 感知二通道
- **视野锥**：120° 圆锥（半角 60°），朝向 = 怪物当前移动方向（静止时保持上次朝向），半径随怪种（见 §5.11.6）
- **静止 360° 规则（grill 补充 2026-07-17）**：静物类（血手⑤/桌椅③/电话④/粉笔尘云⑦）+ 漂浮眼球⑥ 在**自身静止**时（速度=0 或待机态不移动）视野变为 360° 全向感知，半径 = `visionRange × 0.7`；一旦开始移动（追击/搜索态位移）恢复 120° 锥 + 原始半径。头颅类（①②⑧）始终 120° 锥，有背后盲区可潜行
- **视野射线**：3 条射线（中+左右肩），与房间墙壁矩形相交检测，**不穿墙**；门（开/关）不阻视野，能看到同房间 + 邻接房间
  - 360° 模式下射线简化为：从怪物向玩家方向 1 条射线（全向无需扇形边界判定），仍做不穿墙检测
- **噪声**：玩家行为产生噪声半径（见 §5.11.3），噪声到达怪物位置且 `半径 × 怪种噪声敏感度 ≥ 距离` 时触发警觉/追击；噪声穿墙（仅距离判定）

#### §5.11.3 噪声半径基准
| 玩家行为 | 噪声半径 |
|---------|---------|
| 走（默认移速） | 80px |
| 跑（加速键，如有） | 200px |
| 普攻（J） | 150px |
| 大招（K） | 250px |
| 宝箱破译（F 按住期） | 120px（持续发噪） |
| 交互/开门/拾取（H） | 不产生噪声 |
| 静止 | 0px |

实际生效半径 = `基准 × 怪种噪声敏感度`。

#### §5.11.4 巡逻（待机态行为）
- **静物类**（血手⑤/桌椅③/电话④/粉笔尘云⑦）：定点待机，待机态不移动
- **游走类**（但宇轩头颅①/秦浩睿头颅②/漂浮眼球⑥/血瞳头颅⑧）：在出生点周边随机游走，半径 80px，`PATROL_SPEED = 50`，方向切换间隔 `PATROL_SEGMENT_MS = 1500`（复用杨云红边中立巡逻常量）
- 待机态怪物朝向不主动改变（静物固定朝向；游走类朝向 = 移动方向）

#### §5.11.5 脱战回归
- 搜索态到达最后目击点后超时 → 警觉 → 待机
- 待机态恢复后：静物原地；游走类以**当前最后停留点**为新的巡逻中心（不强制回归原出生点），防止拉怪后归位穿墙

#### §5.11.6 怪种参数表
| 怪种 | 视野R(px) | 静止360° | 噪声敏感度 | 警觉→追击 | 追击→搜索 | 搜索→警觉 | 警觉→待机 | 巡逻类型 | 设计理由 |
|------|----------|---------|-----------|-----------|-----------|-----------|-----------|----------|----------|
| ① 但宇轩头颅 | 350 | 否 | 1.0× | 即转 | 3s | 3s | 5s | 游走 | 远程射手，标准感知，背后可潜行 |
| ② 秦浩睿头颅 | 320 | 否 | 1.0× | 即转 | 3s | 3s | 5s | 游走 | 尖叫型，标准，背后可潜行 |
| ③ 桌椅 | 180 | 是(126px) | 0.7× | 2s | 4s | 4s | 6s | 静物 | 听觉迟钝，近战，静止全向 |
| ④ 电话 | 280 | 是(196px) | 1.3× | 2s | 2s | 2s | 4s | 静物 | 电话=听觉锐，反应快，静止全向 |
| ⑤ 血手 | 150 | 是(105px) | 1.0× | 1s | 4s | 4s | 6s | 静物 | 伏击型，近身瞬转，静止全向 |
| ⑥ 漂浮眼球 | 400 | 是(280px) | 0.8× | 即转 | 3s | 3s | 5s | 游走 | 视觉主导，远视但听觉差，静止全向（移动后变锥） |
| ⑦ 粉笔尘云 | 250 | 是(175px) | 1.0× | 即转 | 5s | 5s | 7s | 静物 | 移动慢，搜索久，静止全向 |
| ⑧ 血瞳头颅 | 380 | 否 | 1.2× | 即转 | 2s | 2s | 4s | 游走 | 强化版头颅，反应快，背后可潜行 |

> 「即转」= 警觉态一旦视野/噪声命中立即升为追击，不经过警觉停留。流程修正：待机 → (视野/噪声命中) → 警觉 → (即转怪种继续命中) → 追击；若命中消失则走正常超时回退。
> 「静止360°」= 怪物自身静止时视野变 360°，半径 ×0.7（见 §5.11.2）。移动时恢复 120° 锥 + 原始半径。

#### §5.11.7 远房降级更新
- **当前房间 + 邻接房间**（门连通）：正常 60Hz update
- **远房**：4Hz update（250ms/帧），感知/攻击都照算但精度低
- 例外：但宇轩身体召唤计时器（spec §5.9 A）始终按真实时间推进，不受降级影响，防止玩家踢出房间后召唤暂停
- 远房怪物若进入搜索态，最后目击点为玩家最后可见位置，可能引导怪物跨房间搜索

#### §5.11.8 三态玩家可见反馈
| 态 | 头顶图标 | tint |
|----|---------|------|
| 待机 (idle) | 无 | 原色 |
| 警觉 (alert) | ？ | 原色 |
| 追击 (chase) | ！ | 略红 tint |
| 搜索 (search) | … | 原色 |

图标 depth = 玩家上方，遵循项目 UI 深度层级约定。

#### §5.11.9 杨云红边感知（保留 spec §5.10）
350px 激怒视野与但宇轩头颅同 R。玩家攻击命中视野内任意目标（缄默者或杨云本人）即永久激怒，激怒后启用 §5.10 攻击模式，不走三态机。激怒为单向不可逆。

#### §5.11.10 数据结构补充
```ts
export type EnemyAIState = 'idle' | 'alert' | 'chase' | 'search';

export interface EnemyPerceptionParams {
  readonly visionRange: number;          // 视野半径 px
  readonly visionHalfAngleDeg: number;   // 视野半角，固定 60（即 120° 锥）
  readonly noiseSensitivity: number;     // 噪声敏感度倍率
  readonly alertToChaseMs: number | 'instant';  // 警觉→追击
  readonly chaseToSearchMs: number;      // 追击→搜索
  readonly searchToAlertMs: number;      // 搜索→警觉
  readonly alertToIdleMs: number;        // 警觉→待机
  readonly patrolKind: 'static' | 'wander';
  readonly patrolRadius?: number;        // wander 时
  readonly patrolSpeed?: number;         // wander 时
  readonly patrolSegmentMs?: number;     // wander 时
}
```

每怪种在 `Enemy` 子类中暴露 `readonly perception: EnemyPerceptionParams`，CombatManager / AIUpdateSystem 读取此参数驱动三态机。

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

**渲染参数（grill 确认 2026-07-17，夸张视觉档）**：
| 元素 | 参数 |
|------|------|
| 旋转码环 | r80，1 圈/s，像素字符 8 个均匀分布 |
| 进度弧 | r100，从 0° 到 360° 随 progress 填充，金色描边 |
| 粒子 | 16 个，环绕宝箱随机角度，r120-150 范围漂浮，1s 寿命循环 |
| 屏震幅度 | `progress × 6px`（progress=1 时最大 6px） |
| 锁扣崩开震幅 | ×3（即 18px 瞬时震） |
| 最后一扣全屏白闪 | 1 帧（~16ms），alpha=1.0 后立即归零 |
| 开盖金光柱 | r150 高 150，从宝箱中心向上发射，持续 800ms 渐隐 |
| 战利品卡 | 64×64，按稀有度描边色（蓝#4a90e2 / 紫#a155d1 / 绿#4caf50 / 金#ffc107 / 白#ffffff），从宝箱飞出 200px 距离悬停 1.5s 可拾取 |

### §7.4 宝箱掉落
- 普通宝箱：independent 模式，各稀有度独立掷骰（蓝30%/紫30%/绿100%/金15%/白2%），1–5 件
- 鎏金宝箱：independent 模式，各稀有度独立掷骰（蓝30%/紫50%/绿70%/金100%/白15%），1–5 件
- 白阶掉落 70% 概率为无字毕业证（§6.7）
- **回退红闪**：宝箱破译进度回退（decayProgress）时，进度弧红色闪烁 200ms（`redFlashRemainingMs`）。

---

## §8 Meta 经济

### §8.1 仓库（Stash）
- 无限槽位
- 存 `items: readonly ForgottenSanityStashItem[]` + `sanity: number` 理智账
- localStorage key: `ying-zhong-jiu.forgotten-sanity.stash.v1`

### §8.2 商城（Shop）
- 卖价 = 碎片面值 ×1（1:1）
- 买价 = `Math.ceil(lootItem.sanityValue × 1.75)`
- 可买：消耗品 + 武器；可卖：任意（除 `material.vaultKey` 等标记 `sellable:false` 的物品）

### §8.3 起配（Loadout）
- 1 武器 + 3 消耗品槽
- 武备升级 +1 槽（最多 +3 → 6 槽）
- 空手 = `unarmed`，弱拳击 5 伤害
- 新用户起手包：`weapon.ruler ×1` + `consumable.celery ×3`（仅发放一次）

```ts
export type ConsumeResult =
  | { readonly ok: true; readonly stash: ForgottenSanityStashState }
  | { readonly ok: false; readonly reason: 'insufficient-stock'; readonly stash: ForgottenSanityStashState };
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
// ying-zhong-jiu.forgotten-sanity.stash.v1
export interface ForgottenSanityStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly ForgottenSanityStashItem[];
}
export interface ForgottenSanityStashItem {
  readonly itemId: string;
  readonly quantity: number;
}

// ying-zhong-jiu.forgotten-sanity.upgrades.v1
export type ForgottenSanityUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';
export interface ForgottenSanityUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<ForgottenSanityUpgradeId, number>>;
}

// ying-zhong-jiu.forgotten-sanity.best.v1
export interface ForgottenSanityBestState {
  readonly schemaVersion: number;
  readonly bestSanity: number;
}

// ying-zhong-jiu.forgotten-sanity.progress.v1
export interface ForgottenSanityProgressState {
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

**ESC 行为优先级（M8 暂停菜单）**：
1. 大地图可见 → 关闭大地图（不暂停，消费 ESC）
2. 否则 → 切换暂停菜单（`togglePause`）

**暂停菜单 3 项**：继续 / 放弃对局 / 设置。
- **放弃对局**：按死亡处理（本局战利品全丢，仓库不变），调用 `runDeathSettlement`。
- **设置子菜单**：音效开关 / 像素滤镜开关 / 返回。
- 暂停时 `combatManager.setFrozen(true)`，恢复时 `setFrozen(false)`。

### §9.3 红边雾战（RedEdgeFogOverlay）
- 击杀杨云红边后触发
- 全屏遮罩"理智正在消散", 持续 2s
- 视野缩减为 §5.10 定义的 `RED_EDGE_VISIBILITY_RADIUS_PX`（220px）
- 缄默者复制 ×2（详见 §5.10 击杀奖励）：以玩家视口外 100px buffer 生成等量复制体
- **遮罩期间敌人冻结**：`combatManager.setFrozen(true)` 持续 2s，敌人不移动/不攻击，仅视觉特效推进；2s 后自动解冻。

---

## §10 掉落

### §10.1 杨云红边掉落
- 钥匙不在 LootTable 中，由 `ForgottenSanityRunController.handleEliteDefeated` 单独发放至 `inventory.add('material.vaultKey', 1)`
- **钥匙用途完整流程**：
  1. 红边被击杀 → `handleEliteDefeated` 触发 `inventory.add('material.vaultKey', 1)` + `combatManager.duplicateSilentOnes(playerViewport)` + 红边雾战遮罩
  2. 玩家移动至 vault door（`ForgottenSanityMapRenderer.createVaultDoorInteraction` 注册的 hitArea，80×80 zone）
  3. 玩家按 H 交互 → `onInteractPressed` 中 vault door 分支优先于 exit 分支，调用 `tryUnlockVaultDoor()`
  4. `tryUnlockVaultDoor()` 校验 `inventory.has('material.vaultKey', 1)` → 调用 `renderer.unlockVaultDoor()` + `inventory.remove('material.vaultKey', 1)` + 提示
  5. vault door 解锁后，玩家进入宝藏房 → 房内宝箱 `isVaultChest: chest.roomId === manifest.vaultRoomId` → `ChestDecrypt` 构造时跳过破译阶段（直接 `phase = 'opened'`），免费破译开启
- yangYunRed LootTable 仅做独立碎片掷骰（4 个稀有度各自独立掷骰），可返回 0–4 件

### §10.2 掉落表模式
```ts
export type LootRollMode = 'single' | 'independent' | 'multiPick';
```
- single：单次掷骰选 1 件
- independent：每个稀有度独立掷骰
- multiPick：多次不放回选取
- **independent（rollIndependent）模式详述**：每个稀有度独立掷骰，可返回 0–4 件。普通/鎏金宝箱 `itemCount = {min:1, max:5}`，但 independent 模式实际件数由各稀有度掷骰结果决定（最少 0 件触发 min 保底，最多 5 件触发 max 截断）。

---

## §11 模块布局与约束

### §11.1 目录结构
```
src/forgottenSanity/
├── state/forgottenSanityState.ts       # 4 key 存档 + 起手包
├── map/
│   ├── forgottenSanityMapState.ts      # manifest 类型
│   ├── ForgottenSanityMapGenerator.ts  # 程序化生成器（纯函数）
│   └── ForgottenSanityMapRenderer.ts   # 薄渲染器
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
│   ├── ForgottenSanityHUD.ts           # 对局 HUD
│   ├── Minimap.ts               # 小地图 + 大地图
│   ├── RedEdgeFogOverlay.ts     # 红边雾战
│   ├── SettlementScreen.ts      # 撤离/死亡结算
│   └── MobileControls.ts        # 移动端控件
├── ForgottenSanityHubScene.ts          # 枢纽场景
└── ForgottenSanityScene.ts             # 对局场景
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
- 49 个 loot manifest 条目（48 碎片 + 1 仓库钥匙 `material.vaultKey`）注册进 `src/data/assets.ts`
- 素材路径：`最终素材/记忆碎片/<名称>.png`

### §11.4 移动端
- 复用 `InputManager` 摇杆（base 200,600，radius 80）
- 右侧 4 个动作按钮：普攻(J) / 大招(K) / 交互(H) / 消耗品
- 与桌面端功能对等

### §11.5 深度层级（复用主项目）
floor=0, walls=1, chest=3, door=6, label=7, hitArea=8, player=10, UI=1000+

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
| 红边击杀后视野 | 见 §5.10（`RED_EDGE_VISIBILITY_RADIUS_PX = 220`） |
| 红边击杀后缄默者复制 | ×2 现有数量 |
| 召唤核心召唤间隔 | 30s |
| 召唤核心最大血眼数 | 3 |
| 头颅复活时间 | 20s |
| 头颅标记身体概率 | 30% |
| 地图最多身体数 | 1 |
| localStorage schemaVersion | 1 |
