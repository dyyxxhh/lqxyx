# 美术与音效优化设计

> 日期：2026-07-23
> 仓库：github.com/dyyxxhh/lqxyx
> 游戏：影中咎（Phaser 4 暗黑像素恐怖）
> 方案：美术C（最大化沉浸）+ 音频B（分阶段管线）

## 1. 概述

对"影中咎"进行美术与音效优化。美术采用最大化沉浸方案（全后处理栈+增强粒子+UI动效），音效采用分阶段管线方案（程序化合成SFX+CC0免费素材BGM/环境音），参考寂静岭式西式心理恐怖氛围。理智消散时美术与音效深度联动。

### 当前现状

- 美术：已有135个PNG素材（角色动作、敌人、道具、UI、场景），暗黑像素恐怖风格（`dark-pixel-horror`）已建立，无后处理、无粒子系统、无UI动效
- 音效：完全空白——无任何音频文件，代码中仅有暂停菜单的音效开关UI占位（`PauseMenu.audioEnabled`布尔值），无`load.audio()`、无`sound.play()`
- 文档明确标注音效为"未规划，待音频管线就绪后单独spec"

## 2. 范围

### 全局生效（第一幕主线 + 被遗忘的理智模式）

- ScreenEffectManager 后处理管线（CRT/颗粒/暗角/色差/Bloom/震动）
- AudioManager 音频管线（BGM/环境音/UI音效/全局开关）

### 被遗忘的理智模式专属

- ParticleFactory 增强粒子系统（血迹/碎片/光效/尘雾/灰烬/死亡爆裂）
- HUD 动效增强（条动画/面板过渡/受击反馈/大招释放）
- SanityFX 理智消散深度联动
- 战斗音效（攻击/命中/受击/击杀/投射物/墙壁反弹）

### 不在范围

- 第一幕主线专属特效（对话音效、追逐特效、死亡闪屏增强、场景氛围差异）
- 角色动画补全
- 美术素材重制/替换
- 分轨音量控制（仅保留简单总开关）

## 3. 架构

### 四层架构

```
┌─────────────────────────────────────────────────────┐
│ 管理器层（新模块）                                     │
│  ┌─────────────────────┐ ┌────────────────────────┐ │
│  │ ScreenEffectManager │ │ AudioManager           │ │
│  │ 后处理管线统一管理    │ │ 音频管线统一管理         │ │
│  └─────────────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ 效果系统层（新模块）                                   │
│  ┌────────────┐ ┌───────────┐ ┌────────┐ ┌────────┐ │
│  │ParticleFact│ │ScreenShake│ │SfxSynth│ │SanityFX│ │
│  └────────────┘ └───────────┘ └────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│ 现有系统层（改造集成）                                 │
│  ┌────────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │RedEdgeFogOverlay│ │FS HUD        │ │PauseMenu  │  │
│  │→ 接入SanityFX   │ │→ UI动效增强   │ │→音频开关接线│  │
│  └────────────────┘ └──────────────┘ └───────────┘  │
├─────────────────────────────────────────────────────┤
│ 资源层                                               │
│  ┌─────────────────────┐ ┌────────────────────────┐ │
│  │public/assets/audio/ │ │ 程序化生成              │ │
│  │CC0 BGM+环境音(.ogg) │ │ UI/战斗SFX(Web Audio)  │ │
│  └─────────────────────┘ └────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 数据流

- `RunLifecycle` → 理智值变化 → `SanityFX` → 同时驱动 `ScreenEffectManager`（扭曲/色差/震动加剧）+ `AudioManager`（心跳加速/环境变调/幻听）
- `CombatManager` → 击中/受击事件 → `ParticleFactory` + `ScreenShake` + `SfxSynth`
- `PauseMenu` → 音频开关 → `AudioManager.setEnabled()`
- `RedEdgeFogOverlay.activate()/deactivate()` → `SanityFX.activate()/deactivate()`

### 关键技术约束

- Phaser 4 已移除 BitmapMask（v3 API），替换为 FilterMask / FilterPipeline。后处理基于 Phaser 4 FilterPipeline 实现。
- jsdom 测试环境不提供 WebGL 和 AudioContext，所有效果模块通过接口抽象 + mock 测试，与现有 `RedEdgeFogOverlay` 测试策略一致。
- 浏览器自动播放策略：AudioContext 必须在首次用户交互后初始化。
- 全平台全开所有后处理效果，不做移动端降级。

## 4. 美术系统设计（方案C：最大化沉浸）

### 4.1 ScreenEffectManager 后处理栈

新增模块 `src/effects/ScreenEffectManager.ts`。

6个后处理效果层，通过 Phaser 4 FilterPipeline 串联：

| 效果 | 基础参数 | 理智消散参数 | 触发条件 |
|------|----------|-------------|---------|
| CRT扫描线 | 强度 0.08-0.15 | 不变 | 常驻，全平台恒开 |
| 胶片颗粒 | 强度 0.05 | ×3 (0.15) | 常驻，每帧刷新随机噪点 |
| 动态暗角 | 60% 径向遮蔽 | 85% | 常驻，径向渐变黑边 |
| 色差 | 1px RGB偏移 | 5px | 常驻，RGB通道偏移 |
| Bloom辉光 | 血色/金色高光 | 不变 | 战斗命中/光柱/大招释放时触发 |
| 屏幕震动 | 0 | 持续微抖 | 受击8px / 击杀12px / 理智消散20px |

理智联动：理智消散时颗粒×3、暗角+25%、色差×5、持续微抖、间歇性屏幕扭曲脉冲。

参数插值：所有后处理参数变化使用平滑插值（300ms），不硬切。

### 4.2 ParticleFactory 增强粒子系统

新增模块 `src/effects/ParticleFactory.ts`。

基于 Phaser 4 GameObjects.Particles 实现的粒子工厂，通过注册表模式管理粒子配置：

| 粒子类型 | 触发事件 | 粒子数 | 颜色 | 生命周期 | 特殊行为 |
|---------|---------|--------|------|---------|---------|
| 血迹飞溅 | 命中敌人 | 8-15 | #b01724 | 0.6s | 重力下落 |
| 墙壁碎片 | 投射物撞墙 | 6-10 | #49313a | 0.4s | 弹射反弹 |
| 拾取光效 | 拾取碎片 | 10-20 | 按稀有度 | 0.8s | 光柱上升，金/蓝/紫/绿/白 |
| 粉笔尘雾 | ChalkDust敌人 | 12-18 | #c9b9a6 | 0.8s | 扩散云，击杀时大范围爆发 |
| 环境灰烬 | Run内常驻 | 持续 | #49313a 50%透明 | 持续 | 缓慢下落，理智低时密度×2 |
| 死亡爆裂 | 敌人死亡 | 15-25 | 按敌人种类 | 0.5s | 配合Bloom辉光 |

### 4.3 UI动效增强

改造模块 `src/forgottenSanity/ui/ForgottenSanityHUD.ts`，遵循 DESIGN.md 约束（只使用 opacity/transform，不动画布局属性）：

| 动效 | 对象 | 实现 | 时长 |
|------|------|------|------|
| HUD条动画 | HP/理智/体力条 | 平滑插值而非硬切，受击时红色脉冲闪烁 | 200ms插值 |
| 面板过渡 | 暂停/结算/Hub面板 | opacity+scale淡入淡出 | 200ms |
| 受击全屏反馈 | 全屏遮罩 | 红色径向脉冲 | 120ms闪现 |
| 大招释放 | 全屏+武器图标 | 全屏金光闪烁+武器图标缩放弹跳+Bloom脉冲 | 300ms |

## 5. 音频系统设计（方案B：分阶段管线）

### 5.1 AudioManager 核心管线

新增模块 `src/audio/AudioManager.ts`。

双轨架构：
- BGM/环境音 → Phaser 4 WebAudioSound（文件播放）
- 程序化SFX → SfxSynth（Web Audio API 合成）

初始化流程：
1. `PreloadScene.preload()` 添加 `this.load.audio()` 加载CC0音频文件
2. 首次用户交互后初始化 AudioContext（浏览器自动播放策略）
3. PauseMenu 音频开关接线到 `AudioManager.setEnabled()`

全局开关行为：
- 开关关闭时：BGM淡出200ms → 停止 · SFX静音 · 环境音暂停
- 开关打开时：恢复之前播放的BGM/环境音

### 5.2 BGM 分层播放

CC0免费素材（freesound.org等），存放于 `public/assets/audio/bgm/`：

| BGM层 | 风格 | 音量 | 场景 |
|-------|------|------|------|
| 菜单BGM | 低频嗡鸣+钢琴单音 | 0.3 | Boot/Preload/Hub |
| 探索BGM | 工业噪音+远处低语 | 0.25 | Run内探索 |
| 追逐/战斗BGM | 急促心跳+金属碰撞 | 0.4 | 敌人追击/战斗中 |
| 理智消散BGM | 耳鸣高频+扭曲低频 | 0.5 | RedEdgeFog激活 |

切换规则：场景切换时BGM交叉淡入淡出500ms。理智消散时立即切入消散BGM（不等交叉淡出）。

### 5.3 环境氛围音

CC0免费素材，存放于 `public/assets/audio/ambient/`：

| 环境音 | 类型 | 音量 | 触发规则 |
|-------|------|------|---------|
| 风声 | 低频呼啸循环 | 0.15（理智低+0.1） | Run内常驻 |
| 电流杂音 | 间歇性嗡嗡声 | 0.1 | 10-20s随机触发 |
| 远处低语 | 含糊人声片段 | 0.12 | 15-30s随机，理智消散时频率×3 |

### 5.4 SfxSynth 程序化音效

新增模块 `src/audio/SfxSynth.ts`。

基于 Web Audio API（OscillatorNode + GainNode + BiquadFilterNode）包络合成，零外部文件：

**战斗音效**：

| 音效 | 合成方式 |
|------|---------|
| 攻击挥动 | 白噪音burst + 低通滤波，0.15s |
| 命中 | 短促低频正弦冲击，0.1s |
| 受击 | 失真锯齿波刺耳音，0.2s |
| 击杀 | 下行频率扫频，0.3s |
| 投射物发射 | 正弦上行扫频，0.15s |
| 墙壁反弹 | 金属ping（高频正弦短促衰减），0.08s |

**UI音效**：

| 音效 | 合成方式 |
|------|---------|
| 按钮点击 | 短方波，0.05s |
| 面板弹出 | 上行三度（两个正弦音），0.15s |
| 拾取碎片 | 清脆正弦叮，0.1s |
| 宝箱开锁 | 机械咔哒（噪音+低通），0.1s |
| 破译密码 | 滴答序列（3-5个短方波），0.3s |
| 购买 | 金币音（高频正弦双音），0.15s |
| 暂停/恢复 | 下行/上行二度，0.1s |

技术约束：每个SFX <0.5s，首次播放延迟 <5ms。

### 5.5 理智消散深度联动

新增模块 `src/effects/SanityFX.ts`，协调 ScreenEffectManager 和 AudioManager。

**激活时**（`RedEdgeFogOverlay.activate()` 触发）：
- AudioManager：BGM立即切入"理智消散BGM"（耳鸣+扭曲低频）
- AudioManager：环境音"远处低语"频率×3，出现幻听（随机反向播放）
- AudioManager：心跳声层叠加，BPM随剩余时间加速
- AudioManager：所有SFX附加失真滤波器（BiquadFilter distortion）
- ScreenEffectManager：色差×5 / 颗粒×3 / 暗角+25% / 持续微抖
- ParticleFactory：环境灰烬粒子密度×2

**恢复时**（`RedEdgeFogOverlay.deactivate()` 触发）：
- AudioManager：BGM交叉淡出回探索BGM（500ms）
- AudioManager：环境音/SFX恢复原参数
- ScreenEffectManager：后处理参数平滑回归基础值（300ms插值）
- ParticleFactory：灰烬密度回归

## 6. 集成点

| 集成位置 | 改动内容 |
|---------|---------|
| `PreloadScene` | 添加 `load.audio()` 加载CC0音频文件；初始化AudioManager |
| `GameScene`（主菜单） | 接入菜单BGM；PauseMenu音频开关接线到AudioManager |
| `PlayScene`（第一幕） | 接入探索BGM + 环境音；后处理管线挂载 |
| `ForgottenSanityScene` | 接入探索/战斗/消散BGM切换 |
| `RunLifecycle` | 接入粒子系统 + HUD动效 + SanityFX联动；战斗事件→粒子/音效 |
| `RedEdgeFogOverlay` | `activate()/deactivate()` 触发/恢复 SanityFX |
| `ForgottenSanityHUD` | UI动效增强（条动画/面板过渡/受击反馈/大招释放） |
| `PauseMenu` | 音频开关接线到 `AudioManager.setEnabled()` |

## 7. 错误处理

| 错误场景 | 降级行为 |
|---------|---------|
| CC0音频文件加载失败 | 降级为纯程序化SFX，不阻塞游戏；console.warn 记录 |
| AudioContext初始化失败 | 静默禁用音频，游戏正常运行；AudioManager所有方法变no-op |
| WebGL不可用 | 后处理管线降级为纯Canvas叠加（与RedEdgeFogOverlay现有降级策略一致） |
| SfxSynth合成失败 | 静默跳过该音效，不影响游戏逻辑 |

## 8. 测试策略

### 单元测试

- `SfxSynth`：每个音效合成函数的参数正确性（mock AudioContext）
- `AudioManager`：开关状态、淡入淡出计时、BGM切换逻辑（mock Phaser Sound）
- `ScreenEffectManager`：参数插值计算、理智联动参数变化（mock WebGL）
- `SanityFX`：激活/恢复状态机、对ScreenEffectManager和AudioManager的调用验证
- `ParticleFactory`：粒子配置生成、按事件类型选择正确配置

### jsdom约束

所有效果模块通过接口抽象+mock测试。WebGL后处理和AudioContext在jsdom中不可用，测试验证逻辑层面的事件分发和参数计算，不验证实际渲染/播放。与现有 `RedEdgeFogOverlay` 测试策略一致。

### E2E测试（Playwright）

- 验证音频文件加载（网络请求）
- 验证BGM在场景切换时切换
- 验证理智消散触发SanityFX（通过debug hook或DOM状态）
- 验证音频开关功能

## 9. 新增文件清单

```
src/effects/
  ScreenEffectManager.ts    # 后处理管线管理器
  ParticleFactory.ts        # 增强粒子系统工厂
  ScreenShake.ts            # 屏幕震动控制
  SanityFX.ts               # 理智联动效果协调器

src/audio/
  AudioManager.ts           # 音频管线管理器
  SfxSynth.ts               # 程序化音效合成器

public/assets/audio/
  bgm/                      # CC0 BGM文件(.ogg)
  ambient/                  # CC0 环境音文件(.ogg)
```

## 10. 现有素材风格分析（多模态审查）

基于对现有美术素材的多模态审查，确认以下风格特征以指导优化方向：

### UI素材

- **血条/理智条**：极简功能性像素UI，纯色填充无渐变，硬边无抗锯齿。血条深红(#8B0000级)，理智条青蓝(#00BFFF级)。结构统一但细节层次单一（无高光/阴影边）。优化方向：后处理Bloom为血条添加红色辉光，理智条添加青色辉光；受击时红色脉冲闪烁。
- **稀有度边框（金）**：多层金色像素描边（外深棕→中金黄→内亮金高光），模拟金属反光。优化方向：Bloom辉光增强金色边框闪烁，拾取时配合光柱粒子。
- **视野黑雾**：高质量径向渐变暗角，中心90%透明→边缘0%透明，非线性缓出曲线，重度羽化无带状瑕疵。优化方向：ScreenEffectManager的动态暗角应参考此素材的渐变曲线，不重新造轮子而是参数化调节其透明度。
- **光柱（金）**：复合径向渐变+垂直遮罩，4层透明度结构（核心95%→消散10%），指数衰减模型，轻微噪点纹理。优化方向：拾取光效粒子直接复用此素材作为粒子纹理，按稀有度换色。

### 角色立绘

- **杨云-红边**：伪写实数字绘（厚涂/半厚涂），非像素风。冷灰肤色+暗红血迹+蓝白校服的"日常异化"恐怖手法。无勾线，软边笔刷过渡。优化方向：后处理色差/颗粒效果叠加在立绘上时需注意厚涂风格对噪点的容忍度较高，可以适当增加颗粒强度。
- **敌人（漂浮眼球）**：16-bit复古像素恐怖，Dithering渐变模拟，硬边透明，瞳孔区域全透明（游戏机制用）。优化方向：死亡爆裂粒子应使用与敌人相同的像素风格（硬边、有限色板），不用柔和粒子。

### 场景素材

- **地板**：2×2瓷砖无缝贴图，灰白米色（#D4D0C8级），低饱和偏暖。多模态分析指出色调与恐怖氛围存在错位（偏亮偏暖）。优化方向：ScreenEffectManager的动态暗角和色差在Run内场景应加强，通过后处理压暗地板亮度30-40%并向青灰偏移，弥补素材本身的恐怖氛围不足。不修改原始素材文件。

### 风格结论

项目存在**混合美术风格**：UI和敌人为像素风（硬边、有限色板、Dithering），角色立绘为厚涂伪写实（软边、渐变、高色深）。后处理管线需同时适配两种风格：
- 像素素材：CRT扫描线+颗粒增强复古感，色差保持低强度避免破坏硬边
- 厚涂立绘：可承受更强颗粒和色差，Bloom辉光更有效
- 粒子系统：区分硬边粒子（血迹/碎片/死亡爆裂，配合像素敌人）和柔边粒子（光柱/灰烬/尘雾，配合厚涂氛围）

## 11. 设计原则遵循

- 遵循 DESIGN.md：只使用 opacity/transform 动画，不动画布局属性
- 遵循 DESIGN.md：深度层级（Game UI 1000-1002，Curtain 2000-2001），后处理管线深度高于所有UI
- 遵循 DESIGN.md：色板不引入高饱和霓虹或现代SaaS蓝紫渐变，粒子/Bloom使用现有 accent/gold 色系
- 遵循现有代码风格：仅 import type Phaser 的模式用于jsdom兼容
- 模块隔离：每个新模块单一职责，通过明确接口通信，可独立测试
- 素材风格适配：后处理参数区分像素素材和厚涂立绘的容忍度差异，粒子系统区分硬边和柔边两种风格
