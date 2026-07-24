# 红边雾战 Shader 升级设计

**生成日期**：2026-07-24
**对照 spec**：
- `2026-07-17-tomb-raid-mode-design.md`（spec#1，§5.10 / §9.3 红边雾战原始定义）
- `2026-07-23-forgotten-sanity-structural-debt-closure-design.md`（spec#5，§6.1 + §10 简化版回退条款）

**性质**：将 spec#5 §6.1 回退保留的"简化版"红边雾战遮罩升级为真实反向遮罩 + 脉冲动态边缘。修复型 spec，零新功能（仅完善已声明但未落地的视觉效果）。

## §1 背景与动机

### §1.1 spec#1 §9.3 原始要求

> 红边雾战（RedEdgeFogOverlay）：击杀杨云红边后触发；全屏遮罩"理智正在消散"持续 2s；视野缩减为 §5.10 定义的 `RED_EDGE_VISIBILITY_RADIUS_PX`（220px）；遮罩期间敌人冻结 2s。

spec#1 只描述**效果**（220px 视野缩减 + 全屏遮罩），未指定实现技术（未提 BitmapMask/FilterMask/Shader）。

### §1.2 spec#5 §6.1 回退与遗漏

spec#5 §6.1 原计划升级为 `Phaser.Display.Masks.BitmapMask`，但 2026-07-23 实施时回退：
- Phaser 4 已移除 `BitmapMask`（v3 API），v4 替换为 `Mask` filter
- `Mask` filter 依赖 WebGL，jsdom 测试环境不提供 WebGL
- 保留简化版（黑底 rectangle + 透明 circle arc）+ 10 个回归测试 + TODO 注释

### §1.3 当前简化版的根本缺陷

经 2026-07-24 复核 [RedEdgeFogOverlay.ts:39-48](file:///workspace/src/forgottenSanity/ui/RedEdgeFogOverlay.ts#L39-L48)，简化版**视觉上根本未生效**：

- `overlay`：全屏黑色矩形，alpha=0.92（depth 1990）
- `visionCircle`：220px 半径**黑色圆，alpha=0**（depth 1991，叠在矩形之上）

按 alpha compositing 规则：透明圆（alpha=0）叠加在黑色矩形之上**不会"擦除"下层黑色**。最终渲染结果是**全屏 alpha 0.92 黑色，没有 220px 透明孔**。玩家在雾战期间整个屏幕都是黑暗的，根本看不到自己周围 220px 的内容。

10 个回归测试只断言了 `isActive()`/`isTextMaskActive()` 等布尔状态与常量值，**没有任何一个测试验证"孔洞存在"的视觉效果**——所以测试在 jsdom 全绿不代表实际渲染正确。

### §1.4 决策

用户明确要求升级为真实反向遮罩（"误战没说要简化，要的就是复杂的"）。本 spec 升级为**自定义 Fragment Shader** 实现：
- 真实反向遮罩（220px 内透明、圆外黑）
- 脉冲动态边缘（sin 调制半径，全期持续）
- 测试改用 Playwright + WebGL（spec#5 §10 原话"待真实浏览器测试环境落地后再升级为 FilterMask"）

## §2 修复原则

- **spec#1 字面对齐**：220px 视野缩减 + 2s 文字遮罩 + 持续到撤离/死亡
- **TDD 强制**：每项修复先写失败测试（RED）→ 实现（GREEN）→ 回归（SURFACE）
- **零侵入剧情模式**：改动限于 `src/forgottenSanity/ui/` + 新增 `tests/e2e/`
- **接口契约不变**：RedEdgeFogOverlay 的 `activate/update/deactivate/isActive` 签名完全保留，[RunLifecycle.ts:447-464](file:///workspace/src/forgottenSanity/run/RunLifecycle.ts#L447-L464) 调用方无需改动
- **常量不变**：`RED_EDGE_VISIBILITY_RADIUS_PX=220` / `RED_EDGE_MASK_DURATION_MS=2000` / `FOG_MASK_DEPTH=1990` / `FOG_TEXT_DEPTH=1991`

## §3 决策矩阵

| 类别 | 项 | 决策 |
|------|----|------|
| 实现技术 | 反向遮罩方式 | 自定义 Fragment Shader（GLSL ES） |
| 视觉效果 | 边缘过渡 | 软边（smoothstep ±30px）+ 脉冲（sin 振幅 ±15px） |
| 脉冲范围 | 出现时段 | 全期脉冲（2s 文字遮罩期 + 持续期） |
| 测试环境 | 视觉验证 | Playwright + WebGL（chromium headless） |
| 测试分层 | jsdom 单测职责 | 状态机/常量/GLSL 源码契约（不验证渲染） |
| 测试分层 | Playwright E2E 职责 | 真实 WebGL 截图像素断言 |
| 资源管理 | Shader 实例生命周期 | create() 一次创建常驻，setVisible 切换 |
| 文字遮罩 | 独立 GameObject | label（Text）独立于 shader，2s 后 setVisible(false) |
| 性能 | draw call 增量 | 单 shader = 1 draw call，可接受 |
| 兼容性 | Canvas renderer | WebGL-only，Canvas 不保证（Phaser 4 已 deprecated Canvas） |

## §4 架构与模块结构

**改造对象**：`src/forgottenSanity/ui/RedEdgeFogOverlay.ts`

**新结构**：
```
src/forgottenSanity/ui/
├── RedEdgeFogOverlay.ts                    # 门面：生命周期 + 2s 文字遮罩 + 委派 shader
└── shaders/
    └── redEdgeFogShader.ts                 # Fragment shader 源码 + uniform 类型 + 工厂
src/tests/forgottenSanity/
├── forgotten-sanity-red-edge-fog.test.ts   # jsdom 单测（状态机/常量/类型契约）
├── red-edge-fog-shader.test.ts             # jsdom 单测（GLSL 源码契约）
tests/e2e/
└── forgotten-sanity-red-edge-fog-visual.spec.ts  # Playwright + WebGL 视觉验证
```

**数据流**：
```
RunLifecycle.handleEliteDefeated()
  → redEdgeFog.activate(playerX, playerY)
    → shader.setVisible(true) + label.setVisible(true)
    → 启动 2s 文字遮罩定时器
  → RunLifecycle.update(time, delta) 每帧
    → redEdgeFog.update(playerX, playerY)
      → 更新闭包内 currentPlayerScreenX/Y（shader 的 setupUniforms 每帧读取）
  → runEvacuation/abandonRun
    → redEdgeFog.deactivate() → shader.setVisible(false)
```

**关键决策**：
- Shader 实例 `create()` 时一次创建，常驻 DisplayList 但默认 `setVisible(false)`，避免每场红边战重建 WebGL 资源
- 2s 文字遮罩（label）与持续雾战 shader 是独立 GameObject
- 删除 `overlay`（黑矩形）+ `visionCircle`（黑透明圆）——根本不生效，被 shader 取代
- [RunLifecycle.ts](file:///workspace/src/forgottenSanity/run/RunLifecycle.ts) 集成签名不变：`activate(x,y)` / `update(x,y)` / `deactivate()` / `isActive()`

## §5 Fragment Shader 设计

**文件**：`src/forgottenSanity/ui/shaders/redEdgeFogShader.ts`

### §5.1 GLSL ES 片段着色器

```glsl
precision mediump float;

uniform vec2  uResolution;       // 屏幕分辨率（GAME_WIDTH, GAME_HEIGHT）
uniform vec2  uPlayerScreen;     // 玩家屏幕坐标（已 worldToScreen 转换）
uniform float uTime;              // 雾战激活后累计秒数
uniform float uPhase;            // 0=文字遮罩期(2s)，1=持续期
uniform float uVisibilityRadius; // 220.0
uniform float uFullscreenAlpha;   // 0.92
uniform vec3  uFogColor;          // vec3(0.0, 0.0, 0.0) 黑色

void main() {
  // gl_FragCoord: 像素坐标，原点在屏幕左下角（Phaser 4 GL convention）
  // 翻 Y 让原点回左上，与 Phaser 屏幕坐标一致
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float dist = distance(frag, uPlayerScreen);

  // 脉冲半径：sin 周期 2π/2s ≈ 3.14 rad/s，振幅 ±15px
  float pulse = sin(uTime * 3.14159) * 15.0;
  float currentRadius = uVisibilityRadius + pulse;

  // 边缘过渡区（±30px 软边，配合脉冲振幅 ±15px 共 45px 总宽度）
  float edgeStart = currentRadius - 30.0;
  float edgeEnd   = currentRadius + 30.0;

  float alpha;
  if (dist < edgeStart) {
    alpha = 0.0;                              // 玩家视野内：透明
  } else if (dist > edgeEnd) {
    alpha = uFullscreenAlpha;                  // 远处：全屏黑
  } else {
    // 软边过渡（smoothstep）
    float t = smoothstep(0.0, 1.0, (dist - edgeStart) / (edgeEnd - edgeStart));
    alpha = mix(0.0, uFullscreenAlpha, t);
  }

  // 文字遮罩期（uPhase=0）额外加深边缘，增强"理智正在消散"压迫感
  if (uPhase < 0.5) {
    alpha = max(alpha, 0.7);  // 2s 期最少 0.7 alpha
  }

  gl_FragColor = vec4(uFogColor, alpha);
}
```

### §5.2 TypeScript 工厂

```ts
// src/forgottenSanity/ui/shaders/redEdgeFogShader.ts
import type Phaser from 'phaser';
import { RED_EDGE_VISIBILITY_RADIUS_PX, RED_EDGE_MASK_DURATION_MS, FULLSCREEN_ALPHA, FOG_MASK_DEPTH } from '../RedEdgeFogOverlay';

// §5.1 中 GLSL ES 片段着色器源码逐字嵌入此模板字符串（含 precision 声明到 gl_FragColor 赋值的完整文本）
export const RED_EDGE_FOG_FRAGMENT_SRC = `
precision mediump float;

uniform vec2  uResolution;
uniform vec2  uPlayerScreen;
uniform float uTime;
uniform float uPhase;
uniform float uVisibilityRadius;
uniform float uFullscreenAlpha;
uniform vec3  uFogColor;

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  float dist = distance(frag, uPlayerScreen);
  float pulse = sin(uTime * 3.14159) * 15.0;
  float currentRadius = uVisibilityRadius + pulse;
  float edgeStart = currentRadius - 30.0;
  float edgeEnd   = currentRadius + 30.0;
  float alpha;
  if (dist < edgeStart) {
    alpha = 0.0;
  } else if (dist > edgeEnd) {
    alpha = uFullscreenAlpha;
  } else {
    float t = smoothstep(0.0, 1.0, (dist - edgeStart) / (edgeEnd - edgeStart));
    alpha = mix(0.0, uFullscreenAlpha, t);
  }
  if (uPhase < 0.5) {
    alpha = max(alpha, 0.7);
  }
  gl_FragColor = vec4(uFogColor, alpha);
}
`;

export interface RedEdgeFogUniforms {
  uResolution:      { x: number; y: number };
  uPlayerScreen:     { x: number; y: number };
  uTime:            number;
  uPhase:           number;
  uVisibilityRadius:number;
  uFullscreenAlpha: number;
  uFogColor:        [number, number, number];
}

export function createRedEdgeFogShader(
  scene: Phaser.Scene,
  width: number,
  height: number,
  uniformSource: { currentPlayerScreenX: () => number; currentPlayerScreenY: () => number; startTimeMs: () => number; scene: Phaser.Scene },
): Phaser.GameObjects.Shader {
  const shader = new Phaser.GameObjects.Shader(scene, {
    fragmentSrc: RED_EDGE_FOG_FRAGMENT_SRC,
    uniforms: {
      uResolution:      { type: 'vec2',  value: [width, height] },
      uPlayerScreen:    { type: 'vec2',  value: [0, 0] },
      uTime:            { type: 'float', value: 0 },
      uPhase:           { type: 'float', value: 0 },
      uVisibilityRadius:{ type: 'float', value: RED_EDGE_VISIBILITY_RADIUS_PX },
      uFullscreenAlpha: { type: 'float', value: FULLSCREEN_ALPHA },
      uFogColor:        { type: 'vec3',  value: [0, 0, 0] },
    },
    setupUniforms: (program) => {
      const elapsedMs = uniformSource.scene.time.now - uniformSource.startTimeMs();
      const elapsedSec = elapsedMs / 1000;
      const phase = elapsedMs < RED_EDGE_MASK_DURATION_MS ? 0 : 1;
      program.setUniform('uResolution',       [width, height]);
      program.setUniform('uPlayerScreen',     [uniformSource.currentPlayerScreenX(), uniformSource.currentPlayerScreenY()]);
      program.setUniform('uTime',            elapsedSec);
      program.setUniform('uPhase',           phase);
      program.setUniform('uVisibilityRadius', RED_EDGE_VISIBILITY_RADIUS_PX);
      program.setUniform('uFullscreenAlpha', FULLSCREEN_ALPHA);
      program.setUniform('uFogColor',        [0, 0, 0]);
    },
  }, 0, 0, width, height);
  shader.setOrigin(0).setScrollFactor(0).setDepth(FOG_MASK_DEPTH).setVisible(false);
  scene.add.existing(shader);
  return shader;
}
```

**说明**：`setupUniforms` 中 closure 引用 `uniformSource` 提供的 getter，由 `RedEdgeFogOverlay` 持有并更新。Phaser 4 文档明确 `setupUniforms` 每次渲染都调用，正好用于逐帧更新。

## §6 RedEdgeFogOverlay 门面重写

### §6.1 接口契约（完全保留，向后兼容）

```ts
class RedEdgeFogOverlay {
  constructor(scene: Phaser.Scene): void;
  create(): void;
  activate(playerX: number, playerY: number): void;
  update(playerX: number, playerY: number): void;
  deactivate(): void;
  isActive(): boolean;           // 红边雾战是否生效（220px 视野）
  isTextMaskActive(): boolean;   // 2s 全屏文字遮罩期
  isRedEdgeFogActive(): boolean; // 同 isActive（向后兼容别名）
  destroy(): void;
}
```

### §6.2 常量保留

```ts
export const RED_EDGE_VISIBILITY_RADIUS_PX = 220;
export const RED_EDGE_MASK_DURATION_MS = 2000;
export const FOG_MASK_DEPTH = 1990;
export const FOG_TEXT_DEPTH = 1991;
export const FULLSCREEN_ALPHA = 0.92;  // 改 export（原为 const，shader 工厂需引用）
```

### §6.3 内部状态

```ts
private shader: Phaser.GameObjects.Shader | null = null;
private label: Phaser.GameObjects.Text | null = null;
private textMaskTimer: Phaser.Time.TimerEvent | null = null;
private redEdgeFogActive = false;
private textMaskActive = false;
private startTimeMs = 0;
// shader uniform 闭包更新源
private currentPlayerScreenX = 0;
private currentPlayerScreenY = 0;
```

### §6.4 关键方法实现要点

```ts
create(): void {
  this.shader = createRedEdgeFogShader(
    this.scene, GAME_WIDTH, GAME_HEIGHT,
    {
      currentPlayerScreenX: () => this.currentPlayerScreenX,
      currentPlayerScreenY: () => this.currentPlayerScreenY,
      startTimeMs: () => this.startTimeMs,
      scene: this.scene,
    },
  );
  this.label = applyPixelTextStyle(this.scene.add.text(
    GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, '理智正在消散',
    { align: 'center', color: UI_THEME.colors.textDanger, fontFamily: UI_THEME.font.ui, fontSize: '32px', fontStyle: 'bold' },
  )).setOrigin(0.5).setScrollFactor(0).setDepth(FOG_TEXT_DEPTH).setVisible(false);
}

activate(playerX, playerY): void {
  this.redEdgeFogActive = true;
  this.textMaskActive = true;
  this.startTimeMs = this.scene.time.now;
  this.updatePlayerScreen(playerX, playerY);
  this.shader?.setVisible(true);
  this.label?.setVisible(true);
  if (this.textMaskTimer) this.textMaskTimer.remove();
  this.textMaskTimer = this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
    this.textMaskActive = false;
    this.label?.setVisible(false);
    // shader 保持可见，uPhase 在 setupUniforms 中自动切到 1（持续期）
  });
}

update(playerX, playerY): void {
  if (!this.redEdgeFogActive) return;
  this.updatePlayerScreen(playerX, playerY);
  // setupUniforms 闭包自动读取 currentPlayerScreenX/Y + scene.time.now - startTimeMs
  // uPhase 自动计算：elapsed < 2000 ? 0 : 1
}

deactivate(): void {
  this.redEdgeFogActive = false;
  this.textMaskActive = false;
  this.shader?.setVisible(false);
  this.label?.setVisible(false);
  if (this.textMaskTimer) { this.textMaskTimer.remove(); this.textMaskTimer = null; }
}

private updatePlayerScreen(worldX, worldY): void {
  const cam = this.scene.cameras.main;
  this.currentPlayerScreenX = worldX - cam.scrollX;
  this.currentPlayerScreenY = worldY - cam.scrollY;
}

destroy(): void {
  this.deactivate();
  this.shader?.destroy();
  this.label?.destroy();
  this.shader = null;
  this.label = null;
}
```

## §7 测试策略

### §7.1 jsdom 单测（现有 + 新增，全部保留）

`forgotten-sanity-red-edge-fog.test.ts` 保留现有 10 个测试（常量/lifecycle/状态机/depth 契约），**移除对 `overlay`/`visionCircle` GameObject 的断言**（因已删除），改为：
- `create` 后 `shader` 字段非 null
- `shader` 默认 `visible === false`
- `activate` 后 `shader.visible === true` + `isActive() === true`
- `update` 修改 `currentPlayerScreenX/Y`（通过暴露 `getPlayerScreenForTest()` 间接断言）
- `deactivate` 后 `shader.visible === false`
- 2s 后 `isTextMaskActive === false` 但 `isActive === true`（shader 仍可见）
- depth 契约：shader depth === FOG_MASK_DEPTH === 1990，label depth === FOG_TEXT_DEPTH === 1991

### §7.2 新增 jsdom 单测：`red-edge-fog-shader.test.ts`

GLSL 源码契约断言（字符串扫描，无 WebGL 依赖）：
```ts
describe('RedEdgeFog shader source contract', () => {
  it('声明全部 7 个 uniform', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform vec2 uResolution');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform vec2 uPlayerScreen');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform float uTime');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform float uPhase');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform float uVisibilityRadius');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform float uFullscreenAlpha');
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uniform vec3 uFogColor');
  });
  it('使用 smoothstep 实现软边过渡', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('smoothstep');
  });
  it('使用 sin 实现脉冲边缘', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toMatch(/sin\s*\(\s*uTime/);
  });
  it('玩家视野内 alpha = 0', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('alpha = 0.0');
  });
  it('远处 alpha = uFullscreenAlpha', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('alpha = uFullscreenAlpha');
  });
  it('文字遮罩期 alpha 最小 0.7', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('max(alpha, 0.7)');
  });
  it('Y 翻转处理 Phaser 4 GL convention', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('uResolution.y - gl_FragCoord.y');
  });
});
```

### §7.3 新增 Playwright E2E：`tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts`

WebGL 真实渲染截图断言：
```ts
test('红边雾战激活后玩家周围 220px 透明', async ({ page }) => {
  // 1. 启动游戏到 forgotten sanity 场景
  // 2. 通过 __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ 钩子触发 handleEliteDefeatedForTest()
  // 3. 等待 2s 文字遮罩结束（避免文字干扰）
  // 4. page.screenshot() 截全屏
  // 5. 断言：
  //    - 玩家位置像素：alpha < 50（透明，能看见背景）
  //    - 屏幕角落像素：alpha > 200（黑色雾遮罩）
  //    - 距离玩家中心 200px 处像素：alpha < 50（圆内）
  //    - 距离玩家中心 280px 处像素：alpha > 200（圆外）
});

test('脉冲边缘动态变化', async ({ page }) => {
  // 在 t=3.0s 和 t=4.0s 各截一次图（避开 2s 文字遮罩期）
  // 断言边缘像素 alpha 不同（脉冲效果存在，容差 ±20）
});

test('2s 文字遮罩期间额外加深', async ({ page }) => {
  // t=0.5s 截图，断言屏幕角落 alpha > 0.7 * 255 = 178
  // 2s 后角落 alpha = 0.92 * 255 = 235
});
```

**Playwright 环境前置**：
- 项目需先执行 `npx playwright install` 安装 chromium
- `playwright.config.ts` 已存在 5 个 forgotten-sanity E2E spec，新 spec 自动被收录
- 截图存储到 `test-results/red-edge-fog-*/` 目录

## §8 删除清单

- `RedEdgeFogOverlay.ts` 删除字段：`overlay`（黑矩形）+ `visionCircle`（黑透明圆）+ `maskTimer`（已不存在）
- 删除相关 create/activate/update/deactivate 对这两个对象的引用
- 删除 spec#5 §6.1 的 TODO 注释（10-15 行）——升级已落地

## §9 风险与回滚

| 风险 | 缓解 |
|------|------|
| Shader API 在 Phaser 4.1.0 实际行为与文档不符 | 先写最小冒烟测试：`add.shader` 创建 + `setupUniforms` 回调 + Playwright 截图非空白 |
| `setupUniforms` 闭包更新模式有内存泄漏 | deactivate 时显式重置闭包引用为 0；`destroy()` 调用 `shader.destroy()` |
| Playwright 截图测试 flaky（脉冲边缘像素采样时间敏感） | 截图固定在 `t=3s`（脉冲已稳定振荡）+ 容差 ±20 alpha |
| WebGL context lost 时 shader 不可恢复 | Phaser 4 文档明确 shader 在 context restore 后自动重建（`WebGLProgramWrapper` 自动管理） |
| 移动端性能（draw call 增量） | Shader 是单 draw call，全屏一次；脉冲无额外 draw call；性能可接受 |
| Playwright 浏览器未安装导致 E2E 失败 | `package.json` 添加 `postinstall` 钩子或 README 注明 `npx playwright install` 前置 |

**回滚策略**：若 E2E 红且 1 小时内无法修复，回滚到简化版（`git revert`），保留简化版回归测试。简化版的 10 个测试完全可复用。

## §10 不在范围

- **多光源/色彩偏移**：spec#1 §9.3 只要求 220px 视野缩减 + 全屏黑遮罩，不做彩色边缘或波纹色彩
- **遮罩之外的视野系统**：缄默者 AI 视野锥（§5.11）独立于本遮罩，本 spec 不修改
- **音频**：spec#5 §9 已声明不做
- **Canvas renderer 兼容**：Phaser 4 Shader 是 WebGL-only，Canvas 已 deprecated，不保证
- **持续期结束条件**：spec#1 §9.3 明确"红边雾战持续到撤离/死亡"，本 spec 不修改结束条件

## §11 验证门槛

- `npm run typecheck` 0 errors
- `npm run test:run` 全绿（含新增 shader 源码契约测试）
- `npm run e2e` 全绿（含新增 visual spec，需先 `npx playwright install`）
- `npm run verify` 全绿
- 手动 QA：在 forgotten sanity 模式击杀杨云红边，肉眼确认 220px 透明圆 + 脉冲边缘 + 全屏黑遮罩

## §12 实施顺序

```
Phase 1（Shader 落地）
  ├─ §5 创建 redEdgeFogShader.ts（GLSL + 工厂）
  ├─ §7.2 写 GLSL 源码契约测试（RED → GREEN）
  └─ §6 重写 RedEdgeFogOverlay（删除 overlay/visionCircle，集成 shader）
        ↓
Phase 2（jsdom 单测回归）
  └─ §7.1 更新 forgotten-sanity-red-edge-fog.test.ts（移除 overlay/visionCircle 断言，改为 shader 断言）
        ↓
Phase 3（Playwright 视觉验证）
  ├─ npx playwright install
  ├─ §7.3 写 visual spec（RED）
  └─ 调试 shader 直到截图通过（GREEN）
        ↓
Phase 4（验证门槛）
  └─ §11 全量验证
```
