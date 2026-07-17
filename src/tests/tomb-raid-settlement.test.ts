import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettlementScreen, SETTLEMENT_DEPTH } from '../tombraid/ui/SettlementScreen';
import {
  loadStashState, saveStashState, createDefaultStashState,
  loadBestState, saveBestState, createDefaultBestState,
} from '../tombraid/state/tombRaidState';
import type { Inventory, InventoryEntry } from '../tombraid/loot/Inventory';

function createMockScene() {
  const objects: any[] = [];
  const scene: any = {
    add: {
      rectangle: vi.fn((x: number, y: number, w: number, h: number, color?: number, alpha?: number) => {
        const o = chain({ x, y, w, h, color, alpha, _kind: 'rectangle', depth: 0, visible: true });
        objects.push(o); return o;
      }),
      text: vi.fn((x: number, y: number, text: string) => {
        const o = chain({ x, y, text, _kind: 'text', depth: 0, visible: true });
        objects.push(o); return o;
      }),
    },
    input: { keyboard: { addKey: vi.fn(() => ({ isDown: false })), addCapture: vi.fn() }, on: vi.fn() },
    events: { on: vi.fn(), off: vi.fn() },
    sys: { game: { device: { input: { touch: false } }, canvas: null } },
    scale: { on: vi.fn(), off: vi.fn(), isPortrait: false, width: 1280, height: 720 },
  };
  return { scene, objects };
}

function chain(seed: Record<string, any>): any {
  const o: any = { ...seed };
  for (const m of ['setOrigin', 'setDepth', 'setScrollFactor', 'setInteractive', 'setStyle', 'setShadow', 'setStrokeStyle', 'setFillStyle', 'setPosition']) {
    o[m] = vi.fn((..._a: any[]) => o);
  }
  // setVisible / setText / setColor 必须真正写字段，让断言能验证可见性/文本/颜色
  o.setVisible = vi.fn((v: boolean) => { o.visible = v; return o; });
  o.setText = vi.fn((t: string) => { o.text = t; return o; });
  o.setColor = vi.fn((c: string) => { o.color = c; return o; });
  o.on = vi.fn(() => o);
  o.destroy = vi.fn(() => o);
  return o;
}

function invWith(entries: readonly InventoryEntry[], total: number): Inventory {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.itemId, e.quantity);
  return {
    add: () => ({ added: 0, overflow: 0 }),
    remove: () => true,
    has: (id: string) => (map.get(id) ?? 0) > 0,
    quantity: (id: string) => map.get(id) ?? 0,
    entries: () => Array.from(map.entries()).map(([itemId, quantity]) => ({ itemId, quantity })),
    totalSanityValue: () => total,
    clear: () => { map.clear(); },
  } as unknown as Inventory;
}

describe('SettlementScreen depth', () => {
  it('pins settlement depth 1996', () => {
    expect(SETTLEMENT_DEPTH).toBe(1996);
  });
});

describe('SettlementScreen evacuation (spec §1.3)', () => {
  beforeEach(() => localStorage.clear());

  it('evacuates when totalSanityValue >= baseline: deposits loot + updates best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100 });
    saveBestState(createDefaultBestState());
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const inv = invWith([{ itemId: 'treasure.jadePendant', quantity: 1 }], 220); // 220 >= 200
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    if (outcome.kind === 'evacuated') {
      expect(outcome.totalValue).toBe(220);
      expect(outcome.bestSanity).toBe(220);
    }
    // 仓库并入：sanity 增加 220，物品增加 1
    const stash = loadStashState().state;
    expect(stash.sanity).toBe(100 + 220);
    expect(stash.items).toHaveLength(1);
    // best 更新
    expect(loadBestState().state.bestSanity).toBe(220);
  });

  it('refuses evacuation when totalSanityValue < baseline: stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100 });
    saveBestState(createDefaultBestState());
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const inv = invWith([{ itemId: 'material.chalkStub', quantity: 1 }], 12); // 12 < 200
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') {
      expect(outcome.totalValue).toBe(12);
      expect(outcome.baseline).toBe(200);
    }
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(0);
    expect(loadBestState().state.bestSanity).toBe(0);
  });

  it('best only updates when new total > previous best', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 0 });
    saveBestState({ ...createDefaultBestState(), bestSanity: 500 });
    const env = createMockScene();
    const screen = new SettlementScreen(env.scene, { onConfirm: vi.fn() });
    screen.create();
    const inv = invWith([{ itemId: 'treasure.jadePendant', quantity: 1 }], 220);
    const outcome = screen.showEvacuation(inv, 200);
    expect(outcome.kind).toBe('evacuated');
    if (outcome.kind === 'evacuated') expect(outcome.bestSanity).toBe(500); // 保留旧 best
  });
});

describe('SettlementScreen death (spec §1.3)', () => {
  beforeEach(() => localStorage.clear());

  it('death loses all run loot, stash untouched', () => {
    saveStashState({ ...createDefaultStashState(), sanity: 100, items: [{ itemId: 'treasure.jadePendant', quantity: 1 }] });
    const env = createMockScene();
    const onConfirm = vi.fn();
    const screen = new SettlementScreen(env.scene, { onConfirm });
    screen.create();
    const outcome = screen.showDeath();
    expect(outcome.kind).toBe('dead');
    expect(loadStashState().state.sanity).toBe(100);
    expect(loadStashState().state.items).toHaveLength(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
