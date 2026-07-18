import { describe, expect, it, vi } from 'vitest';

// vi.mock Phaser（仅本测试文件）
// 注意：vi.mock factory 在 hoisted 上下文中执行，不能使用 vi.fn().returnsThis() 链式调用
// （factory 内的 vi.fn 返回的对象没有 returnsThis 方法）。改用普通 function 返回 self 实现链式。
vi.mock('phaser', () => {
  function makeGameObject() {
    const self: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = function () { return self; };
    const noop = function () { return undefined; };
    self.setPosition = chain;
    self.setDepth = chain;
    self.setOrigin = chain;
    self.setAlpha = chain;
    // setTint 用 vi.fn 而非 chain，便于记录调用参数（spec §5.11.8 tint 断言）
    self.setTint = vi.fn(function () { return self; });
    self.clearTint = chain;
    self.setText = chain;
    self.destroy = noop;
    self.clear = chain;
    self.fillStyle = chain;
    self.fillRect = chain;
    self.fillCircle = chain;
    self.lineStyle = chain;
    self.strokeRect = chain;
    self.strokeCircle = chain;
    self.beginPath = chain;
    self.moveTo = chain;
    self.lineTo = chain;
    self.strokePath = chain;
    return self;
  }
  // 必须用常规 function 而非箭头函数，否则 new Image(...) 会抛 "not a constructor"
  const Image = vi.fn().mockImplementation(function () { return makeGameObject(); });
  const Graphics = vi.fn().mockImplementation(function () { return makeGameObject(); });
  const Text = vi.fn().mockImplementation(function () { return makeGameObject(); });
  return {
    default: { GameObjects: { Image, Graphics, Text } },
    GameObjects: { Image, Graphics, Text },
  };
});

import Phaser from 'phaser';
import { EnemyViewRenderer } from '../../../forgottenSanity/combat/EnemyViewRenderer';
import { ButYuxuanHeadEnemy } from '../../../forgottenSanity/combat/enemies/ButYuxuanHead';
import { BloodHandEnemy } from '../../../forgottenSanity/combat/enemies/BloodHand';
import { ButYuxuanHeadBloodEyeEnemy } from '../../../forgottenSanity/combat/enemies/ButYuxuanHeadBloodEye';
import { Enemy, type EnemyPerceptionParams, type Projectile, type ZoneEffect } from '../../../forgottenSanity/combat/Enemy';

function makeSceneStub() {
  return {
    add: {
      image: vi.fn(() => new Phaser.GameObjects.Image(0, 0, '')),
      graphics: vi.fn(() => new Phaser.GameObjects.Graphics()),
      text: vi.fn(() => new Phaser.GameObjects.Text()),
    },
  } as unknown as Phaser.Scene;
}

const FAKE_PERCEPTION: EnemyPerceptionParams = {
  visionRange: 350, visionHalfAngleDeg: 60, noiseSensitivity: 1.0,
  alertToChaseMs: 'instant', chaseToSearchMs: 3000,
  searchToAlertMs: 3000, alertToIdleMs: 5000, patrolKind: 'wander',
};

class FakeViewEnemy extends Enemy {
  readonly kind = 'butYuxuanHead' as const;
  readonly proceduralKind = null;
  readonly perception = FAKE_PERCEPTION;
  constructor(
    id: string, x: number, y: number,
    readonly textureKey: string | null,
    aiState: 'idle' | 'alert' | 'chase' | 'search' = 'idle',
  ) {
    super({ id, x, y, maxHp: 100, speed: 0, contactDamage: 0, contactRadius: 20 });
    this.aiState = aiState;
  }
  update(): void { /* noop */ }
}

describe('EnemyViewRenderer', () => {
  it('贴图敌人调用 scene.add.image', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const enemy = new ButYuxuanHeadEnemy('e1', 100, 200);
    renderer.createView(enemy);
    expect(scene.add.image).toHaveBeenCalledWith(100, 200, 'sprite.danYuxuan.headPart');
  });

  it('程序绘制敌人调用 scene.add.graphics', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const enemy = new BloodHandEnemy('e1', 50, 60);
    renderer.createView(enemy);
    expect(scene.add.graphics).toHaveBeenCalled();
  });

  it('血瞳头颅：image + graphics 红眼叠加', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const enemy = new ButYuxuanHeadBloodEyeEnemy('e1', 0, 0);
    renderer.createView(enemy);
    expect(scene.add.image).toHaveBeenCalled();
    expect(scene.add.graphics).toHaveBeenCalled();
  });

  it('updateView 同步敌人位置到视图', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const enemy = new ButYuxuanHeadEnemy('e1', 0, 0);
    renderer.createView(enemy);
    enemy.x = 300;
    enemy.y = 400;
    renderer.updateView(enemy);
    // image 的 setPosition 应被调用
    const view = renderer.getView(enemy.id);
    expect(view).toBeDefined();
  });

  it('drawProjectile 绘制弹幕', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const p: Projectile = {
      id: 'p1', x: 10, y: 20, vx: 0, vy: 0, speed: 0, damage: 0, category: 'aoe',
      homingTarget: null, homingStrength: 0, remainingMs: 1000, radius: 8,
      proceduralKind: 'danYuxuanOrb', ownerId: 'e1',
    };
    expect(() => renderer.drawProjectile(p)).not.toThrow();
  });

  it('drawZone 绘制区域', () => {
    const scene = makeSceneStub();
    const renderer = new EnemyViewRenderer(scene);
    const z: ZoneEffect = {
      id: 'z1', shape: 'circle', x: 0, y: 0, radius: 60, width: 0, height: 0, angle: 0,
      vx: 0, vy: 0, expandSpeed: 0, maxRadius: 60, windupMs: 0, burstDamage: 0,
      damagePerSecond: 0, category: 'aoe', remainingMs: 1000, applyDebuffOnce: false,
      debuffApplied: false, proceduralKind: 'phoneRedCircle', ownerId: 'e1',
    };
    expect(() => renderer.drawZone(z)).not.toThrow();
  });
});

describe('EnemyViewRenderer three-state feedback (spec §5.11.8)', () => {
  it('renders "?" icon above alert enemy', () => {
    const scene = makeSceneStub();
    const r = new EnemyViewRenderer(scene);
    const enemy = new FakeViewEnemy('e1', 100, 200, 'sprite.test', 'alert');
    r.createView(enemy);
    r.updateView(enemy);
    expect(scene.add.text).toHaveBeenCalled();
    // add.text 的第 3 个参数是文字内容
    const textCalls = (scene.add.text as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(textCalls[0]![2]).toContain('?');
  });

  it('renders "!" icon for chase enemy', () => {
    const scene = makeSceneStub();
    const r = new EnemyViewRenderer(scene);
    const enemy = new FakeViewEnemy('e2', 100, 200, 'sprite.test', 'chase');
    r.createView(enemy);
    r.updateView(enemy);
    const textCalls = (scene.add.text as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(textCalls[0]![2]).toContain('!');
  });

  it('applies red tint (0xff8888) to chase enemy image', () => {
    const scene = makeSceneStub();
    const r = new EnemyViewRenderer(scene);
    const enemy = new FakeViewEnemy('e3', 100, 200, 'sprite.test', 'chase');
    r.createView(enemy);
    // image 是 new Phaser.GameObjects.Image()，其 setTint 是 vi.fn
    // 使用 as unknown as 双重断言访问 vi.fn 内部 mock（项目约定）
    const imageCalls = (scene.add.image as unknown as {
      mock: { results: { value: { setTint: { mock: { calls: number[][] } } } }[] };
    }).mock.results;
    const image = imageCalls[0]!.value;
    expect(image.setTint.mock.calls.some((c: number[]) => c[0] === 0xff8888)).toBe(true);
  });

  it('renders "…" icon for search enemy', () => {
    const scene = makeSceneStub();
    const r = new EnemyViewRenderer(scene);
    const enemy = new FakeViewEnemy('e4', 100, 200, 'sprite.test', 'search');
    r.createView(enemy);
    r.updateView(enemy);
    const textCalls = (scene.add.text as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(textCalls[0]![2]).toContain('…');
  });

  it('renders no icon for idle enemy', () => {
    const scene = makeSceneStub();
    const r = new EnemyViewRenderer(scene);
    const enemy = new FakeViewEnemy('e5', 100, 200, 'sprite.test', 'idle');
    r.createView(enemy);
    r.updateView(enemy);
    expect(scene.add.text).not.toHaveBeenCalled();
  });
});
