import { describe, expect, it, vi } from 'vitest';

// Mock Phaser before any imports that pull it in
vi.mock('phaser', () => {
  class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
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
    default: { Geom: { Rectangle } },
  };
});

import type { TombRaidMapManifest, TombRaidRect } from '../../../tombraid/map/tombRaidMapState';
import { TombRaidMapRenderer } from '../../../tombraid/map/TombRaidMapRenderer';

// ---------------------------------------------------------------------------
// Mock scene
// ---------------------------------------------------------------------------
interface TrackedObj {
  readonly type: 'image' | 'rectangle' | 'text' | 'graphics';
  readonly depth: number;
  destroy: ReturnType<typeof vi.fn>;
  setOrigin: ReturnType<typeof vi.fn>;
  setDepth: ReturnType<typeof vi.fn>;
  setDisplaySize: ReturnType<typeof vi.fn>;
  setStrokeStyle: ReturnType<typeof vi.fn>;
  setInteractive: ReturnType<typeof vi.fn>;
  // graphics ops
  fillStyle?: number;
  fillRect?: TombRaidRect;
  lineStyle?: { width: number; color: number };
  strokeRect?: TombRaidRect;
  // rectangle
  color?: number;
  // text
  text?: string;
}

function createMockScene() {
  const tracked: TrackedObj[] = [];
  const textureFrames = new Set<string>();

  function makeChainable(type: TrackedObj['type']): TrackedObj {
    const obj: TrackedObj = {
      type,
      depth: 0,
      destroy: vi.fn(() => undefined),
      setOrigin: vi.fn(function (this: TrackedObj) { return this; }),
      setDepth: vi.fn(function (this: TrackedObj, d: number) { this.depth = d; return this; }),
      setDisplaySize: vi.fn(function (this: TrackedObj) { return this; }),
      setStrokeStyle: vi.fn(function (this: TrackedObj) { return this; }),
      setInteractive: vi.fn(function (this: TrackedObj) { return this; }),
    };
    return obj;
  }

  const scene = {
    add: {
      image: vi.fn((x: number, y: number, _key: string, _frame?: string) => {
        const o = makeChainable('image');
        (o as TrackedObj & { x: number; y: number }).x = x;
        (o as TrackedObj & { x: number; y: number }).y = y;
        tracked.push(o);
        return o;
      }),
      rectangle: vi.fn((x: number, y: number, width: number, height: number, color?: number) => {
        const o = makeChainable('rectangle');
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).x = x;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).y = y;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).width = width;
        (o as TrackedObj & { x: number; y: number; width: number; height: number }).height = height;
        o.color = color;
        tracked.push(o);
        return o;
      }),
      text: vi.fn((_x: number, _y: number, text: string) => {
        const o = makeChainable('text');
        o.text = text;
        tracked.push(o);
        return o;
      }),
      graphics: vi.fn(() => {
        const o = makeChainable('graphics');
        const gfx = {
          ...o,
          fillStyle: vi.fn(function (this: TrackedObj, color: number) {
            this.fillStyle = color;
            return this;
          }),
          fillRect: vi.fn(function (this: TrackedObj, x: number, y: number, width: number, height: number) {
            this.fillRect = { x, y, width, height };
            return this;
          }),
          lineStyle: vi.fn(function (this: TrackedObj, width: number, color: number) {
            this.lineStyle = { width, color };
            return this;
          }),
          strokeRect: vi.fn(function (this: TrackedObj, x: number, y: number, width: number, height: number) {
            this.strokeRect = { x, y, width, height };
            return this;
          }),
          setDepth: o.setDepth,
          destroy: o.destroy,
        };
        // 替换 tracked 中最后一个为 graphics 完整对象
        tracked[tracked.length - 1] = gfx as unknown as TrackedObj;
        return gfx;
      }),
    },
    textures: {
      exists: (key: string) => key === 'floor.tile',
      get: (_key: string) => ({
        has: (frame: string) => textureFrames.has(frame),
        add: (name: string) => {
          textureFrames.add(name);
          return { name };
        },
      }),
    },
  };

  return { scene, tracked };
}

function makeMiniManifest(overrides: Partial<TombRaidMapManifest> = {}): TombRaidMapManifest {
  const base: TombRaidMapManifest = {
    id: 'ying-zhong-jiu-tomb-raid',
    seed: 1,
    roomCount: 1,
    bounds: { x: 0, y: 0, width: 5000, height: 4000 },
    grid: { cols: 5, rows: 4, cellWidth: 1000, cellHeight: 1000 },
    rooms: [
      {
        id: 'room-0',
        kind: 'entrance',
        label: '入口',
        bounds: { x: 0, y: 0, width: 800, height: 800 },
        walkableBounds: { x: 12, y: 12, width: 776, height: 776 },
        collisionZones: [],
        spawnPoint: { x: 400, y: 400 },
        cellIndex: 0,
      },
    ],
    corridors: [],
    doors: [],
    chests: [],
    entranceRoomId: 'room-0',
    exitRoomId: 'room-0',
    vaultRoomId: 'room-0',
    hallRoomId: 'room-0',
    baselineSanity: 50,
    floorTile: { tileWidth: 192, tileHeight: 192 },
  };
  return { ...base, ...overrides };
}

describe('TombRaidMapRenderer', () => {
  it('render 创建 floor tile image（depth=0）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const floorTiles = tracked.filter((o) => o.type === 'image' && o.depth === 0);
    expect(floorTiles.length).toBeGreaterThan(0);
  });

  it('render 创建墙 rectangle（depth=1）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const walls = tracked.filter((o) => o.type === 'rectangle' && o.depth === 1);
    expect(walls.length).toBeGreaterThan(0);
  });

  it('render 创建门 graphics（depth=6）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({
      doors: [
        {
          id: 'door-0',
          bounds: { x: 800, y: 400, width: 24, height: 128 },
          roomId: 'room-0',
          corridorId: 'corridor-0',
          orientation: 'horizontal',
          locked: false,
        },
      ],
    });
    renderer.render(manifest);
    const doorGfxs = tracked.filter((o) => o.type === 'graphics' && o.depth === 6);
    expect(doorGfxs.length).toBeGreaterThanOrEqual(1);
  });

  it('render 创建门标签 text（depth=7）', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    // 至少有房间标签
    const labels = tracked.filter((o) => o.type === 'text' && o.depth === 7);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('render 创建宝箱 rectangle（depth=3），鎏金 0xd4a017 / 普通 0x6b4a1f', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({
      chests: [
        {
          id: 'chest-0',
          roomId: 'room-0',
          kind: 'gilded',
          bounds: { x: 100, y: 100, width: 48, height: 48 },
        },
        {
          id: 'chest-1',
          roomId: 'room-0',
          kind: 'normal',
          bounds: { x: 200, y: 200, width: 48, height: 48 },
        },
      ],
    });
    renderer.render(manifest);
    const chestRects = tracked.filter((o) => o.type === 'rectangle' && o.depth === 3);
    expect(chestRects).toHaveLength(2);
    // 用 manifest.chests[i].kind 推断期望颜色（mock 矩形不携带 kind 字段）
    const GILDED = 0xd4a017;
    const NORMAL = 0x6b4a1f;
    chestRects.forEach((rect, i) => {
      const expected = manifest.chests[i]!.kind === 'gilded' ? GILDED : NORMAL;
      expect(rect.color).toBe(expected);
    });
  });

  it('getCollisionZones 返回墙体矩形（房间 bounds 与 walkableBounds 的差集）', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const zones = renderer.getCollisionZones();
    // 至少有 4 面墙
    expect(zones.length).toBeGreaterThanOrEqual(4);
    // 所有 zone 都在 manifest.bounds 内
    for (const z of zones) {
      expect(z.width).toBeGreaterThan(0);
      expect(z.height).toBeGreaterThan(0);
    }
  });

  it('clear 销毁所有 tracked 对象', () => {
    const { scene, tracked } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    renderer.render(makeMiniManifest());
    const beforeCount = tracked.length;
    expect(beforeCount).toBeGreaterThan(0);
    renderer.clear();
    // 每个 tracked 对象的 destroy mock 应被调用至少一次
    expect(tracked.every((obj) => obj.destroy.mock.calls.length >= 1)).toBe(true);
    // clear 后 getCollisionZones 为空
    expect(renderer.getCollisionZones()).toEqual([]);
  });

  it('再次 render 时 getCollisionZones 数量保持不变（不累积）', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest();
    renderer.render(manifest);
    const zoneCount = renderer.getCollisionZones().length;
    renderer.render(manifest);
    expect(renderer.getCollisionZones().length).toBe(zoneCount);
  });

  it('currentManifest 返回最近渲染的 manifest', () => {
    const { scene } = createMockScene();
    const renderer = new TombRaidMapRenderer(scene as never);
    const manifest = makeMiniManifest({ seed: 999 });
    renderer.render(manifest);
    expect(renderer.currentManifest?.seed).toBe(999);
  });
});
