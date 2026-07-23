// src/tests/forgottenSanity/forgotten-sanity-red-edge-fog.test.ts
// spec#5 §6.1 Task 10：RedEdgeFogOverlay 升级 BitmapMask 冒烟验证 + 简化版 API 契约。
//
// 冒烟验证结论（BitmapMask 不可用 → 保留简化版）：
// 1. Phaser 4 已移除 BitmapMask（v3 API）。依据：
//    - node_modules/phaser/skills/v3-to-v4-migration/SKILL.md: "BitmapMask removed.
//      Use the new Mask filter instead."
//    - node_modules/phaser/dist/phaser.esm.js 中 grep "BitmapMask" 零命中。
//    - 替换方案为 FilterMask（filters.internal.addMask），见 v4-new-features/SKILL.md。
// 2. FilterMask 需要 WebGL shader pass；下方测试实证 jsdom 不提供 WebGL。
//    → 即便改用 FilterMask，jsdom 测试环境也无法运行/验证。
//
// 本文件作为回归守卫：① 实证 jsdom 无 WebGL（FilterMask 不可用）；
// ② 锁定简化版 API 契约（activate/update/deactivate/isActive/isTextMaskActive）。
import { describe, expect, it } from 'vitest';

import {
  FOG_MASK_DEPTH,
  FOG_TEXT_DEPTH,
  RED_EDGE_MASK_DURATION_MS,
  RED_EDGE_VISIBILITY_RADIUS_PX,
  RedEdgeFogOverlay,
} from '../../forgottenSanity/ui/RedEdgeFogOverlay';

// ───────────────────────────────────────────────────────────────────────────
// 冒烟验证：jsdom 无 WebGL → FilterMask（BitmapMask 的 v4 替代）不可用
// ───────────────────────────────────────────────────────────────────────────
describe('RedEdgeFogOverlay BitmapMask/FilterMask 可用性冒烟验证', () => {
  it('jsdom 不提供 WebGL 渲染上下文（FilterMask 替代方案不可用）', () => {
    // Phaser 4 移除了 BitmapMask（v3 API），替换为 FilterMask
    // （filters.internal.addMask），后者依赖 WebGL shader pass。
    // jsdom 无 WebGLRenderingContext → mask 滤镜无法运行/验证。
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    expect(gl).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 简化版 API 契约（spec#5 §6.1）：常量 + activate/update/deactivate 生命周期
// ───────────────────────────────────────────────────────────────────────────
describe('RedEdgeFogOverlay 常量契约', () => {
  it('导出常量值不变（220/2000/1990/1991）', () => {
    expect(RED_EDGE_VISIBILITY_RADIUS_PX).toBe(220);
    expect(RED_EDGE_MASK_DURATION_MS).toBe(2000);
    expect(FOG_MASK_DEPTH).toBe(1990);
    expect(FOG_TEXT_DEPTH).toBe(1991);
  });
});

// 构造最小 mock scene：捕获 visionCircle 位置以验证 update() 跟随玩家。
interface TrackedObject {
  visible: boolean;
  x: number;
  y: number;
  depth: number;
}

function createMockScene() {
  const overlay: TrackedObject = { visible: false, x: 640, y: 360, depth: 0 };
  const visionCircle: TrackedObject = { visible: false, x: 640, y: 360, depth: 0 };
  const label: TrackedObject = { visible: false, x: 640, y: 280, depth: 0 };

  // queue-based delayedCall：回调入队，advanceTime 推进虚拟时钟后才触发
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
    obj.destroy = () => { /* no-op */ };
    return obj;
  }

  const scene = {
    add: {
      rectangle: (x: number, y: number) => {
        overlay.x = x; overlay.y = y;
        return makeChainable(overlay);
      },
      circle: (x: number, y: number) => {
        visionCircle.x = x; visionCircle.y = y;
        return makeChainable(visionCircle);
      },
      text: (x: number, y: number) => {
        label.x = x; label.y = y;
        return makeChainable(label);
      },
    },
    cameras: { main: { scrollX: 0, scrollY: 0 } },
    time: {
      delayedCall: (ms: number, cb: () => void) => {
        const entry = { fireAt: virtualTime + ms, callback: cb, fired: false };
        pendingTimers.push(entry);
        return { remove: () => { entry.fired = true; } };
      },
    },
  };

  const advanceTime = (ms: number): void => {
    virtualTime += ms;
    for (const t of pendingTimers) {
      if (!t.fired && t.fireAt <= virtualTime) {
        t.fired = true;
        t.callback();
      }
    }
  };

  return { scene, overlay, visionCircle, label, advanceTime };
}

describe('RedEdgeFogOverlay 简化版生命周期', () => {
  it('activate 后 isActive 与 isTextMaskActive 均为 true', () => {
    const { scene } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    expect(fog.isActive()).toBe(false);
    expect(fog.isTextMaskActive()).toBe(false);

    fog.activate(300, 200);
    expect(fog.isActive()).toBe(true);
    expect(fog.isTextMaskActive()).toBe(true);
    fog.destroy();
  });

  it('activate 显示 overlay/visionCircle/label', () => {
    const { scene, overlay, visionCircle, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    expect(overlay.visible).toBe(true);
    expect(visionCircle.visible).toBe(true);
    expect(label.visible).toBe(true);
    fog.destroy();
  });

  it('update 跟随玩家（visionCircle 位置 = 玩家屏幕坐标）', () => {
    const { scene, visionCircle } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(100, 100);

    fog.update(500, 400);
    // scrollX/scrollY = 0 → 屏幕坐标 = 世界坐标
    expect(visionCircle.x).toBe(500);
    expect(visionCircle.y).toBe(400);
    fog.destroy();
  });

  it('update 在未 activate 时为 no-op', () => {
    const { scene, visionCircle } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    const beforeX = visionCircle.x;
    const beforeY = visionCircle.y;
    fog.update(999, 999);
    expect(visionCircle.x).toBe(beforeX);
    expect(visionCircle.y).toBe(beforeY);
    fog.destroy();
  });

  it('deactivate 清除 active/textMask 状态并隐藏所有元素', () => {
    const { scene, overlay, visionCircle, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    fog.deactivate();
    expect(fog.isActive()).toBe(false);
    expect(fog.isTextMaskActive()).toBe(false);
    expect(overlay.visible).toBe(false);
    expect(visionCircle.visible).toBe(false);
    expect(label.visible).toBe(false);
    fog.destroy();
  });

  it('2s 后文字遮罩结束但红边雾战持续（overlay 隐藏，isActive 仍 true）', () => {
    const { scene, overlay, label, advanceTime } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    fog.activate(300, 200);
    expect(fog.isTextMaskActive()).toBe(true);

    advanceTime(RED_EDGE_MASK_DURATION_MS);
    expect(fog.isTextMaskActive()).toBe(false);
    expect(label.visible).toBe(false);
    expect(overlay.visible).toBe(false);
    // 红边雾战持续到撤离/死亡
    expect(fog.isActive()).toBe(true);
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

  it('depth 契约：overlay=1990 / label=1991', () => {
    const { scene, overlay, label } = createMockScene();
    const fog = new RedEdgeFogOverlay(scene as unknown as never);
    fog.create();
    expect(overlay.depth).toBe(FOG_MASK_DEPTH);
    expect(label.depth).toBe(FOG_TEXT_DEPTH);
    fog.destroy();
  });
});
