# 影中咎 Design System

## 1. Atmosphere & Identity

影中咎的界面是低照度的像素恐怖舞台：玩家看到的是黑暗楼道里被血色、旧金色和微弱蓝边切开的信息层。签名视觉是“暗幕上的像素金边”，所有叙事 UI 都像临时浮现在黑屏、血迹和教室阴影上的游戏提示，而不是现代网页组件。

## 2. Color

### Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Surface/primary | `surface` | `0x08070a` | 对话框、角色提示主体、默认暗面 |
| Surface/raised | `surfaceRaised` | `0x141018` | 按钮、任务条、可点击/强调面 |
| Surface/muted | `surfaceMuted` | `0x211821` | hover/active 后的暗红棕面 |
| Border/default | `border` | `0x6b1f2c` | 红边人格、恐怖叙事边框 |
| Border/blue | `borderBlue` | `0x1f3f6b` | 蓝边人格、正常控制态 |
| Border/muted | `borderMuted` | `0x49313a` | 非重点面板细边 |
| Accent/danger | `accent` | `0xb01724` | 血色强调 |
| Accent/hover | `accentHover` | `0xd12a3a` | 血色 hover |
| Accent/pressed | `accentPressed` | `0x7f101a` | 血色 pressed |
| Accent/gold | `gold` | `0xd7b15c` | 章节、按钮、结束页文字与边框 |
| Text/primary | `text` | `#f4efe6` | 主文本 |
| Text/muted | `textMuted` | `#c9b9a6` | 辅助说明 |
| Text/danger | `textDanger` | `#ff7a72` | 倒计时、危险提示 |
| Text/gold | `textGold` | `#d7b15c` | 章节标题、结局按钮 |
| Shadow/pixel | `shadow` | `#050305` | 像素文字硬阴影 |

### Rules

- 不使用高饱和霓虹或现代 SaaS 蓝紫渐变。
- 结局和章节推进优先使用 `gold` 与 `textGold`，死亡和追逐压力优先使用 `accent` / `textDanger`。
- 黑屏、死亡闪屏和幕布允许使用纯黑作为剧情遮罩；普通 UI 面板使用 `surface` 系列。

## 3. Typography

### Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| Curtain/display | `64px` | bold | 大结局/幕布主标题（实现使用 `64px`） |
| Role/display | `52px` | bold | “你现在是”角色名 |
| Minor ending title | `60px` | bold | 小结局标题 |
| Timer | `36px` | bold | 生存倒计时 |
| Curtain/subtitle | `26px` | bold | 幕布副标题/“敬请期待”（实现使用 `26px`） |
| Dialogue speaker | `22px` | bold | 对话说话人 |
| Dialogue body | `20px` | regular | 对话正文 |

### Font Stack

- Primary: `monospace`，保持像素风和调试可读性。
- 不新增第二字体，除非素材字体文件进入正式资产清单。

### Rules

- 中文文本优先保证不裁切、不掉基线。
- 大标题可加硬阴影，但不加柔和网页阴影。

## 4. Spacing & Layout

### Base Unit

所有新增 UI 间距以 **4px** 为基准。

| Token | Value | Usage |
|-------|-------|-------|
| `space-2` | `8px` | 紧凑文本/像素阴影偏移 |
| `space-4` | `16px` | 控件内边距 |
| `space-8` | `32px` | 标题与副标题间距 |
| `space-12` | `48px` | 卡片内部大间距 |
| `space-16` | `64px` | 全屏幕布中心偏移 |

### Grid

- 游戏画布固定为 `1280x720` 设计像素。
- 全屏叙事 UI 以画布中心为锚点，深度层级必须高于游戏对象。

### Rules

- 全屏幕布必须保持中心构图，不贴边。
- 黑屏剧情遮罩不能被按钮或教程层意外盖住，除非该层是角色切换或方向提示。

## 5. Components

### Curtain

- **Structure**: full-screen dark rectangle, centered title, gold subtitle capsule.
- **Spacing**: title 位于中心线上方 `space-16` 附近；subtitle 位于中心线下方 `space-16` 附近。
- **States**: visible / hidden；空 subtitle 时隐藏 capsule。
- **Accessibility**: 不作为可点击按钮，避免误导玩家。
- **Motion**: 由剧情 fade/blackScreen 控制，不单独增加布局动画。

### Dialogue Panel

- **Structure**: centered bottom panel, left portrait, speaker line, wrapped body.
- **Spacing**: portrait 与正文间距固定，正文不越出面板右边界。
- **States**: visible / hidden；无 portrait 时隐藏头像。

### Minor Ending Overlay

- **Structure**: full-screen black overlay, “小结局”标题、结局正文、返回检查点按钮。
- **States**: hover 用 `surfaceMuted`，默认用 `surfaceRaised`。

## 6. Motion & Interaction

### Timing

| Type | Duration | Usage |
|------|----------|-------|
| Micro | `120ms` | 移动端交互防抖 |
| Role prompt | `2000ms` | 角色切换阻塞提示 |
| Tutorial | `3000ms` | 首次操作教程 |
| Fade | `500ms` | 剧情黑屏/渐亮 |

### Rules

- 不动画布局属性；如果新增动画，只使用 opacity/transform。
- 小结局返回按钮必须有 hover/active 视觉反馈，并保留输入锁逻辑。

## 7. Depth & Surface

### Strategy

混合策略：像素描边 + 深色 tonal shift。阴影只用于文字硬阴影，不使用现代柔和投影。

| Level | Value | Usage |
|-------|-------|-------|
| Game UI | `1000-1002` | 任务、对话、计时器 |
| Curtain | `2000-2001` | 黑屏/大结局幕布 |
| Role prompt | `2010-2012` | 角色切换最高叙事遮罩 |

### Rules

- 新叙事 UI 深度必须说明是否覆盖 curtain。
- 可交互面必须有描边，不靠阴影表达可点击性。
