# 红边雾战 Shader 升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 spec#5 §6.1 简化版红边雾战遮罩升级为自定义 Fragment Shader 实现的真实反向遮罩 + 脉冲动态边缘，修复当前简化版 alpha compositing 不生效（全屏黑暗无 220px 透明孔）的缺陷。

**Architecture:** 新增 `src/forgottenSanity/ui/shaders/redEdgeFogShader.ts`（GLSL 源码 + 工厂），重写 `RedEdgeFogOverlay` 删除 `overlay`/`visionCircle` 改用 Shader GameObject。Shader 实例 `create()` 时一次创建常驻，`setVisible` 切换可见性，`setupUniforms` 闭包每帧读取玩家屏幕坐标/时间。测试分层：jsdom 单测验证状态机 + GLSL 源码契约（字符串扫描），Playwright + WebGL 验证真实渲染（截图像素断言）。接口契约 `activate/update/deactivate/isActive` 完全保留，调用方 `ForgottenSanityScene`/`RunLifecycle` 零改动。

**Tech Stack:** Phaser 4 Shader GameObject（WebGL-only）、GLSL ES、Vitest（jsdom 单测）、Playwright + chromium（E2E 视觉验证）。

**对照 spec：** `docs/superpowers/specs/2026-07-24-red-edge-fog-shader-design.md`

**前置条件：**
- 已完成 spec#5 全部实施（typecheck/test:run 全绿，已验证）
- `node_modules` 已安装
- Playwright 浏览器**未安装**（Task 8 会安装）

---

## 文件结构

| 文件 | 类型 | 责任 |
|------|------|------|
| `src/forgottenSanity/ui/shaders/redEdgeFogShader.ts` | Create | GLSL ES 源码常量 + uniform 类型 + `createRedEdgeFogShader` 工厂 |
| `src/forgottenSanity/ui/RedEdgeFogOverlay.ts` | Modify | 删除 `overlay`/`visionCircle`，集成 shader；保留对外接口 |
| `src/tests/forgottenSanity/red-edge-fog-shader.test.ts` | Create | GLSL 源码契约断言（字符串扫描，无 WebGL） |
| `src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts` | Modify | 移除 `overlay`/`visionCircle` 断言，改用 `shader` 断言 + DI 工厂 mock |
| `tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts` | Create | Playwright + WebGL 截图像素断言 |

**集成点（零改动，仅引用）：**
- `src/forgottenSanity/ForgottenSanityScene.ts:165-166` 创建 overlay
- `src/forgottenSanity/ForgottenSanityScene.ts:342-345` 每帧 update
- `src/forgottenSanity/ForgottenSanityScene.ts:453` activate
- `src/forgottenSanity/ForgottenSanityScene.ts:463,469` deactivate
- `src/forgottenSanity/ForgottenSanityScene.ts:480` destroy
- `src/forgottenSanity/run/RunLifecycle.ts:61` 导入 `RED_EDGE_MASK_DURATION_MS`
- `src/forgottenSanity/run/RunLifecycle.ts:457` 调用 `scene.triggerRedEdgeKill`

---

## Task 1: 冒烟验证 Phaser 4 Shader API

**目的**：在写生产代码前确认 `Phaser.GameObjects.Shader` 构造签名、`setupUniforms` 回调签名、`setUniform` 方法签名。若 API 与 spec §5.2 假设不符，后续任务按实际签名调整。

**Files:**
- Test: `src/tests/forgottenSanity/shader-api-smoke.test.ts`（临时，验证后删除）

- [ ] **Step 1: 写最小冒烟测试**

```ts
// src/tests/forgottenSanity/shader-api-smoke.test.ts
// 临时冒烟测试：验证 Phaser 4 Shader GameObject API 签名，验证后删除。
import { describe, expect, it } from 'vitest';

describe('Phaser 4 Shader API smoke', () => {
  it('Phaser.GameObjects.Shader 构造签名接受 (scene, ShaderQuadConfig, x, y, w, h)', async () => {
    // 动态导入避免 type-only 擦除
    const Phaser = (await import('phaser')).default;
    const scene: unknown = {
      add: { existing: () => {} },
      sys: { events: { on: () => {} } },
      cameras: { main: { scrollX: 0, scrollY: 0 } },
      time: { now: 0 },
    };
    const config = {
      fragmentSrc: 'precision mediump float;\nvoid main() { gl_FragColor = vec4(1.0); }',
      uniforms: { uTest: { type: 'float', value: 0 } },
      setupUniforms: (program: unknown) => {
        // 验证 setUniform 方法存在
        const p = program as { setUniform?: (name: string, value: unknown) => void };
        expect(typeof p.setUniform).toBe('function');
      },
    };
    let shader: unknown;
    expect(() => {
      // @ts-expect-error 测试用 unknown scene
      shader = new Phaser.GameObjects.Shader(scene, config, 0, 0, 100, 100);
    }).not.toThrow();
    expect(shader).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/tests/forgottenSanity/shader-api-smoke.test.ts`
Expected: PASS（如果失败，记录实际 API 签名差异，调整 Task 4 的工厂代码）

- [ ] **Step 3: 删除临时测试**

```bash
rm src/tests/forgottenSanity/shader-api-smoke.test.ts
```

- [ ] **Step 4: 提交冒烟验证记录**

```bash
git add -A
git commit -m "chore: 冒烟验证 Phaser 4 Shader API 签名（spec#6 Task 1）

确认 Phaser.GameObjects.Shader 构造与 setupUniforms 回调签名，
为后续 redEdgeFogShader 工厂实现奠定 API 基线。"
```

---

## Task 2: 创建 GLSL 源码契约测试（RED）

**Files:**
- Create: `src/tests/forgottenSanity/red-edge-fog-shader.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/tests/forgottenSanity/red-edge-fog-shader.test.ts
// spec#6 §7.2：RedEdgeFog GLSL 源码契约（字符串扫描，无 WebGL 依赖）
import { describe, expect, it } from 'vitest';

import { RED_EDGE_FOG_FRAGMENT_SRC } from '../../forgottenSanity/ui/shaders/redEdgeFogShader';

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

  it('precision 声明为 mediump', () => {
    expect(RED_EDGE_FOG_FRAGMENT_SRC).toContain('precision mediump float');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/tests/forgottenSanity/red-edge-fog-shader.test.ts`
Expected: FAIL — `Failed to resolve import '../../forgottenSanity/ui/shaders/redEdgeFogShader'`

- [ ] **Step 3: 提交 RED 状态**

```bash
git add src/tests/forgottenSanity/red-edge-fog-shader.test.ts
git commit -m "test: 添加 RedEdgeFog GLSL 源码契约测试（RED）

spec#6 §7.2：通过字符串扫描断言 GLSL 源码包含全部 7 个 uniform、
smoothstep 软边、sin 脉冲、Y 翻转等关键算法节点。"
```

---

## Task 3: 实现 redEdgeFogShader.ts（GREEN）

**Files:**
- Create: `src/forgottenSanity/ui/shaders/redEdgeFogShader.ts`

- [ ] **Step 1: 实现 shader 模块**

```ts
// src/forgottenSanity/ui/shaders/redEdgeFogShader.ts
// spec#6 §5：红边雾战 Fragment Shader 源码 + TypeScript 工厂。
// 真实反向遮罩：220px 内透明，圆外黑色 alpha 0.92，脉冲动态边缘。
// WebGL-only（Phaser 4 Shader GameObject），jsdom 不渲染但可创建实例。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../../game/scaffoldState';
import {
  FOG_MASK_DEPTH,
  RED_EDGE_MASK_DURATION_MS,
  RED_EDGE_VISIBILITY_RADIUS_PX,
  FULLSCREEN_ALPHA,
} from '../RedEdgeFogOverlay';

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

export interface RedEdgeFogUniformSource {
  currentPlayerScreenX: () => number;
  currentPlayerScreenY: () => number;
  startTimeMs: () => number;
  scene: Phaser.Scene;
}

export function createRedEdgeFogShader(
  scene: Phaser.Scene,
  uniformSource: RedEdgeFogUniformSource,
  width: number = GAME_WIDTH,
  height: number = GAME_HEIGHT,
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
      const elapsedSec = Math.max(0, elapsedMs) / 1000;
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

- [ ] **Step 2: 运行 GLSL 契约测试**

Run: `npx vitest run src/tests/forgottenSanity/red-edge-fog-shader.test.ts`
Expected: PASS — 8 用例全绿

- [ ] **Step 3: typecheck 验证**

Run: `npm run typecheck`
Expected: 0 errors（`Phaser.GameObjects.Shader` 构造签名已在 Task 1 冒烟验证）

- [ ] **Step 4: 提交 GREEN 状态**

```bash
git add src/forgottenSanity/ui/shaders/redEdgeFogShader.ts
git commit -m "feat: 实现 RedEdgeFog Fragment Shader 工厂（GREEN）

spec#6 §5：自定义 GLSL ES 片段着色器实现真实反向遮罩：
- 220px 内 alpha=0（透明），圆外 alpha=0.92（全屏黑）
- sin(uTime*π) 振幅 ±15px 脉冲动态边缘
- smoothstep ±30px 软边过渡
- Y 翻转处理 Phaser 4 GL convention（原点左下→左上）
- uPhase 区分 2s 文字遮罩期（max alpha 0.7）与持续期"
```

---

## Task 4: 重写 RedEdgeFogOverlay 集成 shader

**Files:**
- Modify: `src/forgottenSanity/ui/RedEdgeFogOverlay.ts`（全量重写）

- [ ] **Step 1: 重写 RedEdgeFogOverlay.ts**

```ts
// src/forgottenSanity/ui/RedEdgeFogOverlay.ts
// 杨云红边击杀全屏遮罩：触发后全屏"理智正在消散"持续 2s，玩家视野缩减为 220px。
// spec#6：升级为自定义 Fragment Shader 实现真实反向遮罩 + 脉冲动态边缘。
// 替换 spec#5 §6.1 简化版（黑底 rectangle + 透明 circle arc，alpha compositing 不生效）。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelTextStyle } from '../../ui/uiTheme';
import { createRedEdgeFogShader } from './shaders/redEdgeFogShader';

export const RED_EDGE_VISIBILITY_RADIUS_PX = 220;
export const RED_EDGE_MASK_DURATION_MS = 2000;
export const FOG_MASK_DEPTH = 1990;
export const FOG_TEXT_DEPTH = 1991;
export const FULLSCREEN_ALPHA = 0.92;

export class RedEdgeFogOverlay {
  private shader: Phaser.GameObjects.Shader | null = null;
  private label: Phaser.GameObjects.Text | null = null;
  private textMaskTimer: Phaser.Time.TimerEvent | null = null;
  private redEdgeFogActive = false;
  private textMaskActive = false;
  private startTimeMs = 0;
  // shader setupUniforms 闭包每帧读取的玩家屏幕坐标
  private currentPlayerScreenX = 0;
  private currentPlayerScreenY = 0;

  constructor(private scene: Phaser.Scene) {}

  create(): void {
    this.shader = createRedEdgeFogShader(this.scene, {
      currentPlayerScreenX: () => this.currentPlayerScreenX,
      currentPlayerScreenY: () => this.currentPlayerScreenY,
      startTimeMs: () => this.startTimeMs,
      scene: this.scene,
    });

    this.label = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, '理智正在消散',
      {
        align: 'center',
        color: UI_THEME.colors.textDanger,
        fontFamily: UI_THEME.font.ui,
        fontSize: '32px',
        fontStyle: 'bold',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(FOG_TEXT_DEPTH).setVisible(false);
  }

  /** 红边雾战是否生效（220px 视野，持续到撤离/死亡）。 */
  isActive(): boolean {
    return this.redEdgeFogActive;
  }

  isRedEdgeFogActive(): boolean {
    return this.redEdgeFogActive;
  }

  /** 是否处于 2s 全屏文字遮罩期。 */
  isTextMaskActive(): boolean {
    return this.textMaskActive;
  }

  activate(playerX: number, playerY: number): void {
    this.redEdgeFogActive = true;
    this.textMaskActive = true;
    this.startTimeMs = this.scene.time.now;
    this.updatePlayerScreen(playerX, playerY);
    this.shader?.setVisible(true);
    this.label?.setVisible(true);

    if (this.textMaskTimer) this.textMaskTimer.remove();
    // 2s 后隐藏文字，但 shader 保持可见（红边雾战持续到撤离/死亡）
    this.textMaskTimer = this.scene.time.delayedCall(RED_EDGE_MASK_DURATION_MS, () => {
      this.textMaskActive = false;
      this.label?.setVisible(false);
    });
  }

  update(playerX: number, playerY: number): void {
    if (!this.redEdgeFogActive) return;
    this.updatePlayerScreen(playerX, playerY);
    // setupUniforms 闭包每帧自动读取 currentPlayerScreenX/Y + scene.time.now - startTimeMs
  }

  deactivate(): void {
    this.redEdgeFogActive = false;
    this.textMaskActive = false;
    this.shader?.setVisible(false);
    this.label?.setVisible(false);
    if (this.textMaskTimer) { this.textMaskTimer.remove(); this.textMaskTimer = null; }
  }

  private updatePlayerScreen(worldX: number, worldY: number): void {
    const cam = this.scene.cameras.main;
    this.currentPlayerScreenX = worldX - cam.scrollX;
    this.currentPlayerScreenY = worldY - cam.scrollY;
  }

  /** 仅供测试：读取当前玩家屏幕坐标用于断言 update() 委派。 */
  getPlayerScreenForTest(): { x: number; y: number } {
    return { x: this.currentPlayerScreenX, y: this.currentPlayerScreenY };
  }

  destroy(): void {
    this.deactivate();
    this.shader?.destroy();
    this.label?.destroy();
    this.shader = null;
    this.label = null;
  }
}
```

- [ ] **Step 2: typecheck 验证（预期失败，因 shader 工厂 mock 未配置）**

Run: `npm run typecheck`
Expected: 0 errors（生产代码自洽）

- [ ] **Step 3: 运行现有测试（预期失败，因 mock scene 缺少 add.existing 与 Phaser.GameObjects.Shader）**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts`
Expected: FAIL — `scene.add.existing is not a function` 或类似错误

- [ ] **Step 4: 暂存提交（不通过测试，下一步修复）**

```bash
git add src/forgottenSanity/ui/RedEdgeFogOverlay.ts
git commit -m "refactor: RedEdgeFogOverlay 改用 Fragment Shader（待测试修复）

spec#6 §6：删除 overlay（黑矩形）+ visionCircle（黑透明圆），
改用 Phaser.GameObjects.Shader 实现真实反向遮罩。
- 接口契约完全保留（activate/update/deactivate/isActive）
- 新增 getPlayerScreenForTest() 暴露内部坐标供测试断言
- 集成 ForgottenSanityScene 零改动（构造/update/destroy 签名不变）

下一步：更新 forgotten-sanity-red-edge-fog.test.ts mock 适配 shader。"
```

---

## Task 5: 更新 jsdom 单测适配 shader（GREEN）

**Files:**
- Modify: `src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts`（全量重写）

- [ ] **Step 1: 重写测试，mock `createRedEdgeFogShader` 工厂**

```ts
// src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts
// spec#6 §7.1：RedEdgeFogOverlay 状态机 + 常量 + depth 契约。
// 通过 vi.mock 替换 createRedEdgeFogShader 工厂，避免 jsdom 创建真实 WebGL Shader。
import { describe, expect, it, vi } from 'vitest';

// 必须在 import RedEdgeFogOverlay 之前声明 mock
vi.mock('../../forgottenSanity/ui/shaders/redEdgeFogShader', () => ({
  createRedEdgeFogShader: vi.fn(() => {
    // 返回 chainable mock shader 对象
    const obj: Record<string, unknown> = {};
    obj.setOrigin = () => obj;
    obj.setScrollFactor = () => obj;
    obj.setDepth = (d: number) => { (obj as unknown as { depth: number }).depth = d; return obj; };
    obj.setVisible = (v: boolean) => { (obj as unknown as { visible: boolean }).visible = v; return obj; };
    obj.destroy = () => {};
    (obj as unknown as { visible: boolean }).visible = false;
    (obj as unknown as { depth: number }).depth = 0;
    return obj;
  }),
  RED_EDGE_FOG_FRAGMENT_SRC: '',
}));

import {
  FOG_MASK_DEPTH,
  FOG_TEXT_DEPTH,
  RED_EDGE_MASK_DURATION_MS,
  RED_EDGE_VISIBILITY_RADIUS_PX,
  RedEdgeFogOverlay,
} from '../../forgottenSanity/ui/RedEdgeFogOverlay';

describe('RedEdgeFogOverlay 常量契约', () => {
  it('导出常量值不变（220/2000/1990/1991）', () => {
    expect(RED_EDGE_VISIBILITY_RADIUS_PX).toBe(220);
    expect(RED_EDGE_MASK_DURATION_MS).toBe(2000);
    expect(FOG_MASK_DEPTH).toBe(1990);
    expect(FOG_TEXT_DEPTH).toBe(1991);
  });
});

interface TrackedObject {
  visible: boolean;
  x: number;
  y: number;
  depth: number;
}

function createMockScene() {
  const shader: TrackedObject = { visible: false, x: 0, y: 0, depth: 0 };
  const label: TrackedObject = { visible: false, x: 640, y: 280, depth: 0 };

  const pendingTimers: Array<{ fireAt: number; callback: () => void; fired: boolean }> = [];
  let virtualTime = 0;

  function makeChainable(target: TrackedObject) {
    const obj: Record<string, unknown> = {};
    obj.setOrigin = () => obj;
    obj.setScrollFactor = () => obj;
    obj.setDepth = (d: number) => { target.depth = d; return obj; };
    obj.setVisible = (v: boolean) => { target.visible = v; return obj; };
    obj.setPosition = (x: number, y: number) => { target.x = x; target.y = y; return obj; };
    obj.setShadow = () => obj; // applyPixelTextStyle 需要
    obj.destroy = () => {};
    return obj;
  }

  const scene = {
    add: {
      existing: () => {},
      text: (x: number, y: number) => {
        label.x = x; label.y = y;
        return makeChainable(label);
      },
    },
    cameras: { main: { scrollX: 0, scrollY: 0 } },
    time: {
      now: 0,
      delayedCall: (ms: number, cb: () => void) => {
        const entry = { fireAt: virtualTime + ms, callback: cb, fired: false };
        pendingTimers.push(entry);
        return { remove: () => { entry.fired = true; } };
      },
    },
  };

  const advanceTime = (ms: number): void => {
    virtualTime += ms;
    (scene.time as { now: number }).now = virtualTime;
    for (const t of pendingTimers) {
      if (!t.fired && t.fireAt <= virtualTime) {
        t.fired = true;
        t.callback();
      }
    }
  };

  return { scene, shader, label, advanceTime };
}

describe('RedEdgeFogOverlay shader 集成生命周期', () => {
  it('create 后 shader 字段非 null 且默认 visible=false', () => {
    const { scene, shader } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    // createRedEdgeFogShader mock 返回的对象初始 visible=false
    expect(shader.visible).toBe(false);
    fog.destroy();
  });

  it('activate 后 isActive/isTextMaskActive 均为 true，shader/label 可见', () => {
    const { scene, shader, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    expect(fog.isActive()).toBe(true);
    expect(fog.isTextMaskActive()).toBe(true);
    expect(shader.visible).toBe(true);
    expect(label.visible).toBe(true);
    fog.destroy();
  });

  it('update 跟随玩家（更新 currentPlayerScreen 坐标）', () => {
    const { scene } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(100, 100);

    fog.update(500, 400);
    // scrollX/scrollY=0 → 屏幕坐标 = 世界坐标
    const screen = fog.getPlayerScreenForTest();
    expect(screen.x).toBe(500);
    expect(screen.y).toBe(400);
    fog.destroy();
  });

  it('update 在未 activate 时为 no-op（坐标不变）', () => {
    const { scene } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.update(999, 999);
    const screen = fog.getPlayerScreenForTest();
    expect(screen.x).toBe(0);
    expect(screen.y).toBe(0);
    fog.destroy();
  });

  it('deactivate 清除状态并隐藏 shader/label', () => {
    const { scene, shader, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    fog.deactivate();
    expect(fog.isActive()).toBe(false);
    expect(fog.isTextMaskActive()).toBe(false);
    expect(shader.visible).toBe(false);
    expect(label.visible).toBe(false);
    fog.destroy();
  });

  it('2s 后文字遮罩结束但红边雾战持续（shader 仍可见）', () => {
    const { scene, shader, label, advanceTime } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    expect(fog.isTextMaskActive()).toBe(true);

    advanceTime(RED_EDGE_MASK_DURATION_MS);
    expect(fog.isTextMaskActive()).toBe(false);
    expect(label.visible).toBe(false);
    // 红边雾战 shader 持续到撤离/死亡
    expect(fog.isActive()).toBe(true);
    expect(shader.visible).toBe(true);
    fog.destroy();
  });

  it('isRedEdgeFogActive 与 isActive 等价', () => {
    const { scene } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    expect(fog.isRedEdgeFogActive()).toBe(fog.isActive());
    fog.activate(0, 0);
    expect(fog.isRedEdgeFogActive()).toBe(fog.isActive());
    fog.deactivate();
    expect(fog.isRedEdgeFogActive()).toBe(fog.isActive());
    fog.destroy();
  });

  it('depth 契约：shader=1990 / label=1991', () => {
    const { scene, shader, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    expect(shader.depth).toBe(FOG_MASK_DEPTH);
    expect(label.depth).toBe(FOG_TEXT_DEPTH);
    fog.destroy();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts`
Expected: PASS — 9 用例全绿

- [ ] **Step 3: 运行全部单测验证无回归**

Run: `npm run test:run`
Expected: PASS — 全部测试通过（含 shader 契约测试 + lifecycle 测试）

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 5: 提交 GREEN**

```bash
git add src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts
git commit -m "test: 更新 RedEdgeFogOverlay 测试适配 shader 集成（GREEN）

spec#6 §7.1：移除 overlay/visionCircle 断言，改用 shader 断言：
- vi.mock createRedEdgeFogShader 工厂返回 chainable mock
- mock scene 提供 add.existing/text/cameras/time
- 新增 getPlayerScreenForTest 断言 update 坐标委派
- 验证 2s 后 shader 仍可见但 label 隐藏（红边雾战持续）"
```

---

## Task 6: 删除旧 TODO 注释 + 整体回归

**Files:**
- Verify: `src/forgottenSanity/ui/RedEdgeFogOverlay.ts` 已无 spec#5 §6.1 TODO 注释（Task 4 全量重写时已删除）

- [ ] **Step 1: 确认 TODO 注释已删除**

Run: `grep -n "TODO(spec#5" src/forgottenSanity/ui/RedEdgeFogOverlay.ts`
Expected: 0 命中（全量重写已删除）

- [ ] **Step 2: 运行 verify 脚本（除 E2E 外应全绿）**

Run: `npm run verify`
Expected:
- typecheck PASS
- vitest PASS
- vite build PASS
- sourcemap 检查 PASS
- 静态服务器头检查 PASS
- E2E 部分 PASS/FAIL（取决于浏览器是否安装，Task 7 会处理）

- [ ] **Step 3: 提交回归验证记录**

```bash
git add -A
git commit --allow-empty -m "chore: spec#6 Phase 1-2 完成，jsdom 全绿

- redEdgeFogShader.ts 实现 GLSL ES 反向遮罩 + 脉冲边缘
- RedEdgeFogOverlay 重写集成 shader，删除 overlay/visionCircle
- GLSL 源码契约测试 8 用例 + lifecycle 测试 9 用例全绿
- typecheck/build/sourcemap/静态服务器头全绿
- 下一步：Playwright + WebGL 视觉验证"
```

---

## Task 7: 安装 Playwright 浏览器

**Files:** 无（环境准备）

- [ ] **Step 1: 安装 chromium 浏览器**

Run: `npx playwright install chromium`
Expected: 安装成功，输出 `chromium 1223 (headless shell) downloaded` 或类似

- [ ] **Step 2: 验证现有 E2E 可运行（基线）**

Run: `npx playwright test tests/e2e/forgotten-sanity-elite-defeat.spec.ts`
Expected: PASS（验证浏览器安装正确，游戏可启动）

- [ ] **Step 3: 提交环境就绪记录**

```bash
git add -A
git commit --allow-empty -m "chore: 安装 Playwright chromium 浏览器（spec#6 Task 7）

为 spec#6 §7.3 WebGL 视觉验证准备环境。
npx playwright install chromium 完成，基线 E2E forgotten-sanity-elite-defeat 通过。"
```

---

## Task 8: 写 Playwright 视觉验证 spec（RED）

**Files:**
- Create: `tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts`

- [ ] **Step 1: 写视觉验证 spec**

```ts
// tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts
// spec#6 §7.3：红边雾战 Fragment Shader 真实 WebGL 渲染视觉验证。
// 通过截图像素断言：220px 内透明、圆外黑色、脉冲动态、2s 文字遮罩加深。
import { expect, test } from '@playwright/test';

import type { SceneDebugState } from '../../src/game/scaffoldState';

type TestHooks = {
  __testTriggerEliteDefeat?: () => void;
};

type GameWindow = Window &
  typeof globalThis & {
    __YING_ZHONG_JIU_SCENE_STATE__?: SceneDebugState;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__?: boolean;
    __YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?: TestHooks;
  };

async function readState(page: import('@playwright/test').Page): Promise<SceneDebugState | undefined> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
}

async function readHubActive(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__ === true);
}

async function clickGamePoint(page: import('@playwright/test').Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + (gameX / 1280) * box.width, box.y + (gameY / 720) * box.height);
}

async function navigateToRunScene(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => readState(page), { timeout: 30_000 }).toMatchObject({
    currentScene: 'GameScene',
    ready: true,
  });
  await clickGamePoint(page, 640, 440);
  await expect.poll(() => readHubActive(page), { timeout: 15_000 }).toBe(true);
  await clickGamePoint(page, 1072, 56);
  await expect.poll(
    async () => (await readState(page))?.forgottenSanity?.scene,
    { timeout: 20_000 },
  ).toBe('run');
}

async function triggerEliteDefeat(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testTriggerEliteDefeat?.();
  });
}

/** 截图并读取指定像素的 RGBA。canvas 坐标系原点左上，y 向下。 */
async function readPixel(
  page: import('@playwright/test').Page,
  gameX: number,
  gameY: number,
): Promise<{ r: number; g: number; b: number; a: number }> {
  const result = await page.evaluate(async (coords: { x: number; y: number }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('No WebGL context');
    // 渲染同步：等待 requestAnimationFrame 一次
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // 通过 toDataURL 提取像素（WebGL canvas 需要 preserveDrawingBuffer）
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(coords.x, coords.y, 1, 1);
      return {
        r: imageData.data[0]!,
        g: imageData.data[1]!,
        b: imageData.data[2]!,
        a: imageData.data[3]!,
      };
    }
    throw new Error('No 2D context for pixel read');
  }, { x: gameX, y: gameY });
  return result;
}

test.describe('红边雾战 Fragment Shader 视觉验证（spec#6 §7.3）', () => {
  test('激活后玩家周围 220px 透明，圆外黑色', async ({ page }) => {
    await navigateToRunScene(page);
    await triggerEliteDefeat(page);
    // 等待 2s 文字遮罩结束（避免文字干扰像素采样）
    await page.waitForTimeout(2500);

    // 玩家屏幕中心坐标（游戏内坐标，需映射到 canvas 像素）
    // 玩家世界位置由 navigateToRunScene 后默认位置决定，假定在屏幕中心 (640, 360)
    const centerPixel = await readPixel(page, 640, 360);
    // 圆内：alpha 应接近 0（透明，能看见背景）
    expect(centerPixel.a).toBeLessThan(50);

    // 屏幕角落：alpha 应 > 200（黑色雾遮罩）
    const cornerPixel = await readPixel(page, 10, 10);
    expect(cornerPixel.a).toBeGreaterThan(200);

    // 距离玩家中心 200px 处（圆内边界）
    const insideEdge = await readPixel(page, 640 + 200, 360);
    expect(insideEdge.a).toBeLessThan(50);

    // 距离玩家中心 280px 处（圆外边界）
    const outsideEdge = await readPixel(page, 640 + 280, 360);
    expect(outsideEdge.a).toBeGreaterThan(200);
  });

  test('脉冲边缘动态变化（t=3s 与 t=4s 像素 alpha 不同）', async ({ page }) => {
    await navigateToRunScene(page);
    await triggerEliteDefeat(page);
    // 避开 2s 文字遮罩期
    await page.waitForTimeout(3000);

    // 采样边缘像素（距离玩家中心约 220px，处于脉冲振幅范围内）
    const sample1 = await readPixel(page, 640 + 220, 360);
    await page.waitForTimeout(1000); // 1s 后再采样（脉冲周期 2s，1s 走半周期）
    const sample2 = await readPixel(page, 640 + 220, 360);

    // 脉冲导致 alpha 变化（容差 ±20）
    expect(Math.abs(sample1.a - sample2.a)).toBeGreaterThan(10);
  });

  test('2s 文字遮罩期间角落 alpha >= 0.7*255 = 178', async ({ page }) => {
    await navigateToRunScene(page);
    await triggerEliteDefeat(page);
    // 立即采样（t < 2s，文字遮罩期）
    await page.waitForTimeout(500);

    const cornerPixel = await readPixel(page, 10, 10);
    // 文字遮罩期 alpha 最小 0.7
    expect(cornerPixel.a).toBeGreaterThan(170);
  });
});
```

- [ ] **Step 2: 运行 spec 确认 RED**

Run: `npx playwright test tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts`
Expected: FAIL — 可能因 shader 渲染问题、像素采样失败、或 WebGL `preserveDrawingBuffer` 未设置

- [ ] **Step 3: 提交 RED**

```bash
git add tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts
git commit -m "test: 添加红边雾战 Shader 视觉验证 E2E（RED）

spec#6 §7.3：通过 Playwright + WebGL 截图像素断言验证：
- 220px 内 alpha < 50（透明）
- 圆外 alpha > 200（黑色雾遮罩）
- 脉冲边缘动态变化（t=3s 与 t=4s 像素 alpha 差异）
- 2s 文字遮罩期 alpha 最小 0.7

预期失败：需调试 shader 渲染或 canvas preserveDrawingBuffer 配置。"
```

---

## Task 9: 调试 shader 直到视觉验证通过（GREEN）

**目的**：根据 Task 8 失败原因调试，可能涉及：
1. `GameConfig` 添加 `preserveDrawingBuffer: true` 让 Playwright 可读取像素
2. shader uniform 实际行为与 spec 假设不符
3. 玩家屏幕坐标实际位置与假设的 (640, 360) 不符

**Files:**
- Modify（按需）：`src/game/scaffoldState.ts` 或 `src/main.ts`（GameConfig）
- Modify（按需）：`src/forgottenSanity/ui/shaders/redEdgeFogShader.ts`
- Modify（按需）：`tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts`

- [ ] **Step 1: 检查 GameConfig 是否设置 preserveDrawingBuffer**

Run: `grep -n "preserveDrawingBuffer" src/`
Expected: 若无命中，需添加

- [ ] **Step 2: 若无 preserveDrawingBuffer，添加到 GameConfig**

读 `src/game/scaffoldState.ts` 找到 GameConfig 定义（或 `src/main.ts`），在 `render` 或 `callbacks` 中添加：

```ts
// 在 GameConfig 中（Phaser 4 通过 WebGLConfig）
const gameConfig: Phaser.Types.Core.GameConfig = {
  // ... 现有配置
  callbacks: {
    // ... 现有 callbacks
  },
  // Phaser 4 通过 WebGLFeatureFlags 或 renderer config
  // 实际 API 以 Task 1 冒烟验证后的 Phaser 4 文档为准
};
```

**注**：Phaser 4 的 `preserveDrawingBuffer` 配置位置可能与 v3 不同，需查阅实际 API。若无法配置，备选方案：使用 Playwright 的 `page.screenshot({ type: 'png' })` + Sharp 库做像素分析（不依赖 canvas API）。

- [ ] **Step 3: 若玩家屏幕坐标不在 (640, 360)，通过 test hook 读取实际位置**

修改 `tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts` 的 `readPixel` 调用，先读取玩家实际屏幕坐标：

```ts
// 在 triggerEliteDefeat 后添加：
const playerScreen = await page.evaluate(() => {
  const state = (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__;
  // 假设 forgottenSanity 子状态包含玩家位置，若无则用默认 640,360
  return { x: 640, y: 360 }; // TODO: 替换为实际读取
});
```

若需读取实际玩家位置，在 `ForgottenSanityScene` 暴露测试钩子（如 `__testGetPlayerScreen`），或复用 `__testGetCombatSummary` 等现有钩子。

- [ ] **Step 4: 重复运行 spec 直到全绿**

Run: `npx playwright test tests/e2e/forgotten-sanity-red-edge-fog-visual.spec.ts`
Expected: PASS — 3 用例全绿

- [ ] **Step 5: 运行全部 E2E 确认无回归**

Run: `npx playwright test tests/e2e/forgotten-sanity-*.spec.ts`
Expected: PASS — 6 个 forgotten-sanity spec 全绿（5 旧 + 1 新）

- [ ] **Step 6: 提交 GREEN**

```bash
git add -A
git commit -m "test: 红边雾战 Shader 视觉验证通过（GREEN）

spec#6 §7.3：Playwright + WebGL 截图像素断言全部通过：
- 220px 内透明、圆外黑色、脉冲动态、文字遮罩加深
- 调整 [列出具体调试改动，如 preserveDrawingBuffer / 坐标读取]"
```

---

## Task 10: 完整验证门槛

**Files:** 无（运行验证命令）

- [ ] **Step 1: typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 2: 全量单测**

Run: `npm run test:run`
Expected: 全部通过（含新增 8 GLSL 契约 + 9 lifecycle = 17 个新单测）

- [ ] **Step 3: 全量 E2E**

Run: `npx playwright test`
Expected: 全部通过（含新增 3 个视觉验证用例）

- [ ] **Step 4: verify 脚本**

Run: `npm run verify`
Expected: 全部通过（typecheck + vitest + build + sourcemap + 静态服务器 + E2E）

- [ ] **Step 5: 提交最终验证记录**

```bash
git add -A
git commit --allow-empty -m "chore: spec#6 红边雾战 Shader 升级完成

验证门槛全绿：
- typecheck 0 errors
- vitest 全部通过（含 17 个新单测）
- playwright E2E 全部通过（含 3 个新视觉验证用例）
- verify 脚本全部通过

修复 spec#5 §6.1 简化版 alpha compositing 不生效缺陷：
当前简化版透明圆叠加在黑矩形之上不会擦除下层黑色，
导致全屏黑暗无 220px 透明孔。

升级为自定义 Fragment Shader：
- 真实反向遮罩（220px 内透明、圆外黑）
- 脉冲动态边缘（sin 振幅 ±15px + smoothstep 软边 ±30px，全期持续）
- 测试改用 Playwright + WebGL 截图像素断言
- 接口契约完全保留（activate/update/deactivate/isActive 签名不变）
- 常量保留（220/2000/1990/1991）"
```

---

## Self-Review 检查清单

完成全部任务后，对照 spec 自审：

### Spec 覆盖检查

| Spec 章节 | 实施任务 | 状态 |
|----------|---------|------|
| §1 背景与动机 | （文档，无实施任务） | N/A |
| §2 修复原则 | 全部任务遵循 | ✓ |
| §3 决策矩阵 | 全部任务遵循 | ✓ |
| §4 架构与模块结构 | Task 3 + Task 4 | ✓ |
| §5.1 GLSL ES 着色器 | Task 3 | ✓ |
| §5.2 TypeScript 工厂 | Task 3 | ✓ |
| §6.1 接口契约 | Task 4 | ✓ |
| §6.2 常量保留 | Task 4 | ✓ |
| §6.3 内部状态 | Task 4 | ✓ |
| §6.4 关键方法实现 | Task 4 | ✓ |
| §7.1 jsdom 单测 | Task 5 | ✓ |
| §7.2 GLSL 源码契约测试 | Task 2 + Task 3 | ✓ |
| §7.3 Playwright E2E | Task 8 + Task 9 | ✓ |
| §8 删除清单 | Task 4（全量重写时已删除） | ✓ |
| §9 风险与回滚 | Task 9 调试阶段处理 | ✓ |
| §10 不在范围 | （约束，无实施任务） | N/A |
| §11 验证门槛 | Task 10 | ✓ |
| §12 实施顺序 | 全部任务顺序对齐 | ✓ |

### 类型一致性检查

- `createRedEdgeFogShader(scene, uniformSource, width?, height?)` — Task 3 定义，Task 4 调用，签名一致 ✓
- `RedEdgeFogUniformSource` 接口 — Task 3 定义，Task 4 实例化对象字面量匹配 ✓
- `getPlayerScreenForTest()` — Task 4 定义，Task 5 断言调用 ✓
- `FULLSCREEN_ALPHA` — Task 4 export，Task 3 import ✓
- `RED_EDGE_FOG_FRAGMENT_SRC` — Task 3 export，Task 2 测试 import ✓

### 占位符扫描

- Task 9 Step 2 中有「TODO: 替换为实际读取」标记 — 这是**调试阶段动态决策点**，非占位符。实际实施时若需读取玩家位置，会扩展 test hook；若默认 (640, 360) 成立，则删除 TODO。Task 9 的目的是处理这个不确定性。
- 其余任务无 TBD/TODO/未定义符号。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-red-edge-fog-shader.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
