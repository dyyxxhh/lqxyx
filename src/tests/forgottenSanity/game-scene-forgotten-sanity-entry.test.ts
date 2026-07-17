import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    constructor(_key?: string) {}
  }

  class Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }

    contains(px: number, py: number): boolean {
      return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
    }
  }

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
      Geom: { Rectangle },
      Math: {
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
        Distance: {
          Between: (x1: number, y1: number, x2: number, y2: number) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
        },
        DegToRad: (degrees: number) => (degrees * Math.PI) / 180,
        RadToDeg: (radians: number) => (radians * 180) / Math.PI,
      },
      Input: { Keyboard: { KeyCodes: {} } },
    },
  };
});

import { GAME_HEIGHT, GAME_WIDTH, resetSceneDebugState } from '../../game/scaffoldState';
import { GameScene } from '../../scenes/GameScene';

function chainable(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { ...extra };
  object.setOrigin = () => object;
  object.setDepth = () => object;
  object.setVisible = () => object;
  object.setInteractive = () => object;
  object.setScrollFactor = () => object;
  object.setStrokeStyle = () => object;
  object.setShadow = () => object;
  object.setText = () => object;
  object.setFillStyle = () => object;
  object.setDisplaySize = () => object;
  object.setScale = () => object;
  object.setTexture = () => object;
  object.fillStyle = () => object;
  object.fillRect = () => object;
  object.fillRoundedRect = () => object;
  object.lineStyle = () => object;
  object.strokeRect = () => object;
  object.clear = () => object;
  object.destroy = () => object;
  object.on ??= () => object;
  return object;
}

interface CapturedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fire: (event: string) => void;
}

function stubCanvasContext(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      fillStyle: '',
      fillRect: () => undefined,
      clearRect: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => undefined,
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      setTransform: () => undefined,
      drawImage: () => undefined,
      save: () => undefined,
      fillText: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      rotate: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      measureText: () => ({ width: 0 }),
      transform: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      canvas: document.createElement('canvas'),
    }),
  });
}

function setupGameScene(): {
  scene: GameScene;
  labels: string[];
  rects: CapturedRect[];
  startMock: ReturnType<typeof vi.fn>;
} {
  stubCanvasContext();
  resetSceneDebugState();
  localStorage.clear();
  const labels: string[] = [];
  const rects: CapturedRect[] = [];
  const startMock = vi.fn();
  const makeRect = (x: number, y: number, width: number, height: number) => {
    const handlers: Record<string, Array<() => void>> = {};
    const obj = chainable({ x, y, width, height });
    obj.on = (event: string, cb: () => void) => {
      (handlers[event] ??= []).push(cb);
      return obj;
    };
    rects.push({ x, y, width, height, fire: (e: string) => (handlers[e] ?? []).forEach((cb) => cb()) });
    return obj;
  };
  const scene = new GameScene() as unknown as GameScene & {
    add: { rectangle: typeof makeRect; text: (...args: unknown[]) => Record<string, unknown>; image: (...args: unknown[]) => Record<string, unknown>; graphics: () => Record<string, unknown> };
    cameras: { main: { setBounds: () => void } };
    events: { off: () => void; once: () => void };
    input: { keyboard: null; on: () => void };
    scene: { start: typeof startMock; isActive: () => boolean };
    sys: { game: { device: { input: { touch: boolean } } }; scale: { gameSize: { width: number; height: number } } };
    textures: { exists: () => boolean };
  };
  scene.add = {
    rectangle: makeRect,
    text: (_x: number, _y: number, text: string) => { labels.push(text); return chainable(); },
    image: () => chainable(),
    graphics: () => chainable(),
  };
  scene.cameras = { main: { setBounds: vi.fn() } };
  scene.events = { off: vi.fn(), once: vi.fn() };
  scene.input = { keyboard: null, on: vi.fn() } as never;
  scene.scene = { start: startMock, isActive: vi.fn(() => true) };
  scene.sys = { game: { device: { input: { touch: false } } }, scale: { gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT } } };
  scene.textures = { exists: vi.fn(() => false) };
  return { scene, labels, rects, startMock };
}

describe('GameScene 被遗忘的理智入口按钮', () => {
  it('常量 FORGOTTEN_SANITY_BUTTON_Y = 440，CONTINUE/SETTINGS 各下移 44 且保留 continue<settings 间距', () => {
    const scene = new GameScene() as unknown as {
      FORGOTTEN_SANITY_BUTTON_Y: number;
      CONTINUE_Y: number;
      SETTINGS_TITLE_Y: number;
      SETTINGS_BUTTON_Y: number;
    };
    expect(scene.FORGOTTEN_SANITY_BUTTON_Y).toBe(GAME_HEIGHT / 2 + 80);
    expect(scene.FORGOTTEN_SANITY_BUTTON_Y).toBe(440);
    expect(scene.CONTINUE_Y).toBe(GAME_HEIGHT / 2 + 152);
    expect(scene.SETTINGS_TITLE_Y).toBe(GAME_HEIGHT / 2 + 216);
    expect(scene.SETTINGS_BUTTON_Y).toBe(GAME_HEIGHT / 2 + 262);
    expect(scene.CONTINUE_Y + 36).toBeLessThan(scene.SETTINGS_TITLE_Y);
  });

  it('create 添加 被遗忘的理智 按钮文案，矩形位于 (640,440)、尺寸 300×56', () => {
    const { scene, labels, rects } = setupGameScene();
    scene.create();
    expect(labels).toContain('被遗忘的理智');
    const tomb = rects.find((r) => r.width === 300 && r.height === 56);
    expect(tomb).toBeDefined();
    expect(tomb!.x).toBe(GAME_WIDTH / 2);
    expect(tomb!.y).toBe(GAME_HEIGHT / 2 + 80);
  });

  it('点击 被遗忘的理智 按钮启动 ForgottenSanityHubScene', () => {
    const { scene, rects, startMock } = setupGameScene();
    scene.create();
    const tomb = rects.find((r) => r.width === 300 && r.height === 56);
    expect(tomb).toBeDefined();
    tomb!.fire('pointerdown');
    expect(startMock).toHaveBeenCalledWith('ForgottenSanityHubScene');
  });
});
