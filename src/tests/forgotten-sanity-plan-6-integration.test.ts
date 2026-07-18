import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phaser 在 jsdom 中无法初始化（canvas/webgl 依赖），mock 出最小 Scene 基类。
// ForgottenSanityScene extends Phaser.Scene → mock Scene 仅存 sceneKey；其余 add/cameras/sys 等
// 由各测试用 Object.assign 注入完整 mock。
vi.mock('phaser', () => {
  class Scene {
    readonly sceneKey: string;
    constructor(key?: string) {
      this.sceneKey = key ?? '';
    }
  }
  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
    },
  };
});

import { ForgottenSanityScene } from '../forgottenSanity/ForgottenSanityScene';
import {
  loadStashState, saveStashState, createDefaultStashState,
  loadBestState, saveBestState, createDefaultBestState,
  loadUpgradesState, saveUpgradesState, createDefaultUpgradesState,
  saveProgressState, createDefaultProgressState,
} from '../forgottenSanity/state/forgottenSanityState';
import { grantStarterPackIfNeeded } from '../forgottenSanity/state/forgottenSanityState';
import { ALL_LOOT, getLootItem } from '../forgottenSanity/loot/LootItem';
import { Inventory } from '../forgottenSanity/loot/Inventory';
import type { CombatManager } from '../forgottenSanity/combat/CombatManager';
import type { WeaponCombatAdapter } from '../forgottenSanity/weapons/WeaponCombatAdapter';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      circle: vi.fn((x: number, y: number, r: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, r, color, alpha, _kind: 'circle', depth: 0, visible: true, fillColor: color });
        objects.push(o); return o;
      }),
      arc: vi.fn((x: number, y: number, r: number) => {
        const o = chain({ x, y, r, _kind: 'arc', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      container: vi.fn((x: number, y: number) => {
        const o = chain({ x, y, _kind: 'container', depth: 0, visible: true });
        o.add = vi.fn(); o.removeAll = vi.fn();
        objects.push(o); return o;
      }),
    },
    time: { delayedCall: vi.fn((_ms: number, cb: () => void) => { cb(); return { remove: vi.fn() }; }), now: 0 },
    cameras: { main: { worldView: { x: 0, y: 0, width: 1280, height: 720 }, centerX: 640, centerY: 360, scrollX: 0, scrollY: 0, startFollow: vi.fn(), setBounds: vi.fn(), setBackgroundColor: vi.fn() } },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn(), on: vi.fn(), off: vi.fn() }, on: vi.fn(), off: vi.fn() },
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
    scene: { start: vi.fn(), get: vi.fn(() => null), pause: vi.fn(), resume: vi.fn() },
    physics: { add: { existing: vi.fn() }, world: { setBounds: vi.fn() } },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setVisible', 'setFillStyle', 'setPosition', 'setRadius', 'setBlendMode', 'setAngle']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  o.on = vi.fn(() => o);
  o.disableInteractive = vi.fn(() => o);
  o.getBounds = () => ({ x: o.x, y: o.y, width: o.w ?? 100, height: o.h ?? 30 });
  o.clear = vi.fn(() => o);
  o.fillStyle = vi.fn(() => o);
  o.lineStyle = vi.fn(() => o);
  o.slice = vi.fn(() => o);
  o.fillPath = vi.fn(() => o);
  o.fillCircle = vi.fn(() => o);
  o.destroy = vi.fn(() => o);
  o.setText = vi.fn((t: string) => { o.text = t; return o; });
  o.setColor = vi.fn((c: string) => { o.color = c; return o; });
  return o;
}

describe('Plan 6 integration smoke: starter pack + loadout flow', () => {
  beforeEach(() => localStorage.clear());

  it('grantStarterPackIfNeeded seeds stash with weapon.ruler + celery x3 (once)', () => {
    grantStarterPackIfNeeded();
    const stash = loadStashState().state;
    expect(stash.items.find((i) => i.itemId === 'weapon.ruler')?.quantity).toBe(1);
    expect(stash.items.find((i) => i.itemId === 'consumable.celery')?.quantity).toBe(3);
    grantStarterPackIfNeeded();
    const stash2 = loadStashState().state;
    expect(stash2.items.find((i) => i.itemId === 'weapon.ruler')?.quantity).toBe(1);
    expect(stash2.items.find((i) => i.itemId === 'consumable.celery')?.quantity).toBe(3);
  });

  it('ALL_LOOT has 49 entries (48 spec §6 + 1 §10.1 vaultKey) with correct sanity values for jadePendant(220) and chalkStub(12)', () => {
    expect(ALL_LOOT.length).toBe(49);
    expect(getLootItem('treasure.jadePendant')?.sanityValue).toBe(220);
    expect(getLootItem('material.chalkStub')?.sanityValue).toBe(12);
  });
});

describe('Plan 6 integration smoke: HUD + settlement end-to-end (mock scene)', () => {
  beforeEach(() => localStorage.clear());

  it('ForgottenSanityScene.create instantiates HUD + Minimap + SettlementScreen without throwing', () => {
    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    // 注入 mock：用 Object.assign 覆盖 Phaser.Scene 的 add/events/sys 等
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    expect(() => scene.create()).not.toThrow();
    // HUD 文字、Minimap 矩形、Settlement 矩形都已创建
    expect(env.objects.length).toBeGreaterThan(0);
  });

  it('evacuation flow: build inventory ≥ baseline → settlement deposits + updates best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 50 });
    saveBestState(createDefaultBestState());
    saveUpgradesState(createDefaultUpgradesState());
    saveProgressState(createDefaultProgressState());

    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    scene.create();

    // 模拟本局捡到 jadePendant(220)，达到 baseline 200
    const inv = new Inventory();
    inv.add('treasure.jadePendant', 1);
    const outcome = scene.runEvacuationSettlement(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    // 仓库并入 + best 更新
    expect(loadStashState().state.sanity).toBe(50 + 220);
    expect(loadBestState().state.bestSanity).toBe(220);
  });

  it('death flow: settlement loses all run loot, stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100, items: [{ itemId: 'treasure.jadePendant', quantity: 1 }] });
    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    scene.create();
    const outcome = scene.runDeathSettlement();
    expect(outcome.kind).toBe('dead');
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(1);
  });

  it('red edge kill triggers fog overlay + 220px visibility, persists until settlement', () => {
    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    scene.create();
    expect(scene.isRedEdgeFogActive()).toBe(false);
    scene.triggerRedEdgeKill(640, 360);
    expect(scene.isRedEdgeFogActive()).toBe(true);
    // 撤离/死亡应清理雾战
    scene.runDeathSettlement();
    expect(scene.isRedEdgeFogActive()).toBe(false);
  });

  it('HUD update reflects HP/sanity/ult CD without throwing', () => {
    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    scene.create();
    expect(() => scene.updateHud({
      hp: 80, maxHp: 100, weaponId: 'weapon.ruler', weaponName: '尺子',
      ultCooldownRemaining: 5000, ultCooldownTotal: 20000,
      sanity: 250, baseline: 200,
      consumableSlots: [{ itemId: 'consumable.celery', quantity: 2 }],
      stashSanity: 750,
    })).not.toThrow();
  });

  it('unarmed loadout routes attack to CombatManager.playerAttack, not WeaponCombatAdapter.performAttack', () => {
    const env = createMockScene();
    const scene = new ForgottenSanityScene();
    Object.assign(scene as unknown as Record<string, unknown>, env.scene);
    scene.create();

    // 注入 mock 战斗依赖（Plan 3 CombatManager + Plan 4 WeaponCombatAdapter）
    const playerAttack = vi.fn();
    const performAttack = vi.fn();
    scene.setCombatDeps(
      { playerAttack } as unknown as CombatManager,
      { performAttack } as unknown as WeaponCombatAdapter,
    );
    scene.setCurrentLoadout({ weaponId: 'unarmed', consumables: [] });

    scene.performPlayerAttack({ x: 1, y: 0 }, 0);

    // 空手 → Plan 3 弱拳 fallback；不调用 Plan 4 adapter
    expect(playerAttack).toHaveBeenCalledWith({ x: 1, y: 0 });
    expect(performAttack).not.toHaveBeenCalled();
  });
});
