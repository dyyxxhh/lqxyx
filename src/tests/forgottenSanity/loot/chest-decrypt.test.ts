// src/tests/forgottenSanity/loot/chest-decrypt.test.ts
// Task 5: ChestDecrypt Phaser 薄层渲染 — 注入 fake scene（无 vi.mock('phaser')）。
// spec §7.3 grill 渲染参数；plan 5 Task 5。
import type Phaser from 'phaser';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChestDecrypt } from '../../../forgottenSanity/loot/ChestDecrypt';
import {
  CHEST_DECRYPT_OPEN_DURATION_MS,
  CHEST_DECRYPT_TOTAL_MS,
} from '../../../forgottenSanity/loot/chestDecryptState';
import { getLootItem, type LootItem } from '../../../forgottenSanity/loot/LootItem';

interface FakeImage {
  textureKey: string;
  setDisplaySize: (w: number, h: number) => FakeImage;
  setTexture: (key: string) => FakeImage;
  destroy: () => void;
}
interface FakeGraphics {
  clear: () => FakeGraphics;
  lineStyle: () => FakeGraphics;
  fillStyle: () => FakeGraphics;
  beginPath: () => FakeGraphics;
  arc: () => FakeGraphics;
  strokePath: () => FakeGraphics;
  fillPath: () => FakeGraphics;
  strokeRect: () => FakeGraphics;
  fillRect: () => FakeGraphics;
  destroy: () => void;
}
interface FakeContainer {
  add: () => FakeContainer;
  setSize: () => FakeContainer;
  setInteractive: () => FakeContainer;
  on: (event: string, cb: () => void) => FakeContainer;
  destroy: () => void;
  x: number;
  y: number;
}
interface FakeTween {
  target: unknown;
}
interface FakeCamera {
  shake: (duration: number, intensity: number) => void;
  flash: (duration: number, r: number, g: number, b: number) => void;
}
interface FakeKeyboard {
  handlers: Record<string, Array<() => void>>;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
}
interface FakeScene {
  add: {
    image: (x: number, y: number, key: string) => FakeImage;
    graphics: () => FakeGraphics;
    container: (x: number, y: number) => FakeContainer;
  };
  cameras: { main: FakeCamera };
  input: { keyboard: FakeKeyboard };
  tweens: { add: (cfg: Record<string, unknown>) => FakeTween };
}

function createFakeScene(): FakeScene {
  const keyboard: FakeKeyboard = {
    handlers: {},
    on(e: string, cb: () => void) {
      (this.handlers[e] ??= []).push(cb);
    },
    off(e: string, cb: () => void) {
      const arr = this.handlers[e];
      if (!arr) return;
      const idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };
  const camera: FakeCamera = { shake: vi.fn(), flash: vi.fn() };
  return {
    add: {
      image: vi.fn((_x: number, _y: number, key: string) => ({
        textureKey: key,
        setDisplaySize: vi.fn(function (this: FakeImage) {
          return this;
        }),
        setTexture: vi.fn(function (this: FakeImage, k: string) {
          this.textureKey = k;
          return this;
        }),
        destroy: vi.fn(),
      })),
      graphics: vi.fn(() => ({
        clear: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        lineStyle: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        fillStyle: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        beginPath: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        arc: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        strokePath: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        fillPath: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        strokeRect: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        fillRect: vi.fn(function (this: FakeGraphics) {
          return this;
        }),
        destroy: vi.fn(),
      })),
      container: vi.fn((_x: number, _y: number) => ({
        add: vi.fn(function (this: FakeContainer) {
          return this;
        }),
        setSize: vi.fn(function (this: FakeContainer) {
          return this;
        }),
        setInteractive: vi.fn(function (this: FakeContainer) {
          return this;
        }),
        on: vi.fn(function (this: FakeContainer, _e: string, cb: () => void) {
          (this as unknown as { _cb?: () => void })._cb = cb;
          return this;
        }),
        destroy: vi.fn(),
        x: 0,
        y: 0,
      })),
    },
    cameras: { main: camera },
    input: { keyboard },
    tweens: { add: vi.fn(() => ({ target: null })) },
  } as unknown as FakeScene;
}

function fireKey(scene: FakeScene, event: string): void {
  for (const cb of scene.input.keyboard.handlers[event] ?? []) cb();
}

const sampleLoot: LootItem[] = [getLootItem('material.chalkStub')!, getLootItem('consumable.celery')!];

function phaserScene(fake: FakeScene): Phaser.Scene {
  return fake as unknown as Phaser.Scene;
}

describe('ChestDecrypt input wiring', () => {
  it('F keydown when idle starts state', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 100, y: 200, lootItems: [] });
    fireKey(scene, 'keydown-F');
    expect(cd.snapshot().phase).toBe('decrypting');
    cd.destroy();
  });

  it('F keyup releases (pauses progress)', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F'); // start + hold
    cd.update(625); // progress 0.25
    fireKey(scene, 'keyup-F'); // release
    cd.update(625); // holding=false → 不推进
    expect(cd.snapshot().progress).toBeCloseTo(0.25, 4);
    cd.destroy();
  });

  it('second keydown-F (already decrypting) calls hold', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(100);
    fireKey(scene, 'keyup-F');
    fireKey(scene, 'keydown-F'); // hold
    cd.update(525); // 0.04 + 0.21 = 0.25
    expect(cd.snapshot().progress).toBeCloseTo(0.25, 4);
    cd.destroy();
  });

  it('uses custom inputKey when provided', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({
      scene: phaserScene(scene),
      x: 0,
      y: 0,
      lootItems: [],
      inputKey: 'H',
    });
    fireKey(scene, 'keydown-H');
    expect(cd.snapshot().phase).toBe('decrypting');
    cd.destroy();
  });
});

describe('ChestDecrypt update advances state', () => {
  it('update forwards deltaMs to state.advance', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    expect(cd.snapshot().phase).toBe('opened');
    cd.destroy();
  });
});

describe('ChestDecrypt visual feedback (spec §7.3)', () => {
  it('cabinet starts with prop.phoneCabinetFront texture', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    expect(cd.cabinetTextureKey()).toBe('prop.phoneCabinetFront');
    cd.destroy();
  });

  it('lock broken triggers camera shake', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(625); // lock 0 broken
    expect(scene.cameras.main.shake).toHaveBeenCalled();
    cd.destroy();
  });

  it('progress reaches 1.0 swaps texture to phoneCabinetAngled + white flash', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    expect(cd.cabinetTextureKey()).toBe('prop.phoneCabinetAngled');
    expect(scene.cameras.main.flash).toHaveBeenCalled();
    cd.destroy();
  });
});

describe('ChestDecrypt loot card spawn (spec §7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('onCompleted spawns loot cards and pointerdown collects', () => {
    const scene = createFakeScene();
    const collected: LootItem[] = [];
    const cd = new ChestDecrypt({
      scene: phaserScene(scene),
      x: 0,
      y: 0,
      lootItems: sampleLoot,
      onLootCollected: (item) => collected.push(item),
    });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS); // opening
    cd.update(CHEST_DECRYPT_OPEN_DURATION_MS); // completed
    expect(collected).toHaveLength(0); // 尚未点击
    cd.clickAllLootCards();
    expect(collected).toHaveLength(2);
    expect(collected.map((it) => it.id).sort()).toEqual(['consumable.celery', 'material.chalkStub']);
    cd.destroy();
  });

  it('onLootCollected defaults to no-op when omitted', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: sampleLoot });
    fireKey(scene, 'keydown-F');
    cd.update(CHEST_DECRYPT_TOTAL_MS);
    cd.update(CHEST_DECRYPT_OPEN_DURATION_MS);
    expect(() => cd.clickAllLootCards()).not.toThrow();
    cd.destroy();
  });

  it('destroy cleans up container', () => {
    const scene = createFakeScene();
    const cd = new ChestDecrypt({ scene: phaserScene(scene), x: 0, y: 0, lootItems: [] });
    cd.destroy();
    // 多次 destroy 不崩溃
    expect(() => cd.destroy()).not.toThrow();
  });
});

describe('vault chest free decrypt (spec §10.1)', () => {
  it('isVaultChest=true skips decrypting phase and enters opened directly', () => {
    const scene = createFakeScene();
    const decrypt = new ChestDecrypt({
      scene: phaserScene(scene),
      x: 100, y: 100,
      lootItems: [],
      isVaultChest: true,
    });
    // vault chest 应直接进入 opened 态
    expect(decrypt.snapshot().phase).toBe('opened');
    decrypt.destroy();
  });

  it('isVaultChest=false (default) starts in idle phase', () => {
    const scene = createFakeScene();
    const decrypt = new ChestDecrypt({
      scene: phaserScene(scene),
      x: 100, y: 100,
      lootItems: [],
    });
    expect(decrypt.snapshot().phase).toBe('idle');
    decrypt.destroy();
  });
});
