import { describe, expect, it } from 'vitest';

import { Inventory, BASE_CONSUMABLE_STACK_LIMIT, TORN_SCHOOLBAG_BONUS } from '../../../forgottenSanity/loot/Inventory';

describe('Inventory constants', () => {
  it('BASE_CONSUMABLE_STACK_LIMIT = 10', () => {
    expect(BASE_CONSUMABLE_STACK_LIMIT).toBe(10);
  });
  it('TORN_SCHOOLBAG_BONUS = 5', () => {
    expect(TORN_SCHOOLBAG_BONUS).toBe(5);
  });
});

describe('Inventory add/remove basics', () => {
  it('add material stacks without cap', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 100);
    expect(inv.quantity('material.chalkStub')).toBe(100);
    expect(inv.has('material.chalkStub')).toBe(true);
  });

  it('add treasure stacks without cap', () => {
    const inv = new Inventory();
    inv.add('treasure.jadePendant', 5);
    expect(inv.quantity('treasure.jadePendant')).toBe(5);
  });

  it('remove decrements quantity', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 10);
    expect(inv.remove('material.chalkStub', 3)).toBe(true);
    expect(inv.quantity('material.chalkStub')).toBe(7);
  });

  it('remove returns false when insufficient', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 2);
    expect(inv.remove('material.chalkStub', 5)).toBe(false);
    expect(inv.quantity('material.chalkStub')).toBe(2);
  });

  it('remove to zero deletes entry', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 5);
    inv.remove('material.chalkStub', 5);
    expect(inv.has('material.chalkStub')).toBe(false);
    expect(inv.quantity('material.chalkStub')).toBe(0);
  });

  it('add unknown item returns added 0 overflow qty', () => {
    const inv = new Inventory();
    const r = inv.add('material.nonexistent', 3);
    expect(r.added).toBe(0);
    expect(r.overflow).toBe(3);
  });
});

describe('Inventory consumable stack limit', () => {
  it('caps consumable at BASE_CONSUMABLE_STACK_LIMIT=10 by default', () => {
    const inv = new Inventory();
    const r = inv.add('consumable.celery', 20);
    expect(inv.quantity('consumable.celery')).toBe(10);
    expect(r.added).toBe(10);
    expect(r.overflow).toBe(10);
  });

  it('caps at 15 when tornSchoolbag active', () => {
    const inv = new Inventory({ isTornSchoolbagActive: () => true });
    inv.add('consumable.celery', 20);
    expect(inv.quantity('consumable.celery')).toBe(15);
  });

  it('subsequent add respects existing cap', () => {
    const inv = new Inventory();
    inv.add('consumable.celery', 8);
    const r = inv.add('consumable.celery', 5);
    expect(inv.quantity('consumable.celery')).toBe(10);
    expect(r.added).toBe(2);
    expect(r.overflow).toBe(3);
  });
});

describe('Inventory relic non-stacking', () => {
  it('adding same relic twice keeps single activeRelic entry', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 1);
    inv.add('relic.blueEdgeHeadband', 1);
    expect(inv.quantity('relic.blueEdgeHeadband')).toBe(2);
    expect(inv.activeRelics()).toEqual(['relic.blueEdgeHeadband']);
  });

  it('different relics each activate once', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 1);
    inv.add('relic.danYuxuanGlasses', 1);
    expect(inv.activeRelics()).toHaveLength(2);
    expect(inv.activeRelics()).toContain('relic.blueEdgeHeadband');
    expect(inv.activeRelics()).toContain('relic.danYuxuanGlasses');
  });

  it('relic deactivates when removed to zero', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.remove('relic.blueEdgeHeadband', 2);
    expect(inv.activeRelics()).toEqual([]);
  });

  it('relic stays active when partially removed', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.remove('relic.blueEdgeHeadband', 1);
    expect(inv.activeRelics()).toEqual(['relic.blueEdgeHeadband']);
    expect(inv.quantity('relic.blueEdgeHeadband')).toBe(1);
  });

  it('materials and treasures are not relics', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 1);
    inv.add('treasure.jadePendant', 1);
    inv.add('consumable.celery', 1);
    inv.add('weapon.ruler', 1);
    expect(inv.activeRelics()).toEqual([]);
  });
});

describe('Inventory totalSanityValue', () => {
  it('sums sanityValue * quantity across all items', () => {
    const inv = new Inventory();
    // chalkStub sanity 12 × 3 = 36
    inv.add('material.chalkStub', 3);
    // celery sanity 120 × 1 = 120
    inv.add('consumable.celery', 1);
    // blueEdgeHeadband sanity 200 × 2 = 400
    inv.add('relic.blueEdgeHeadband', 2);
    expect(inv.totalSanityValue()).toBe(36 + 120 + 400);
  });

  it('returns 0 when empty', () => {
    expect(new Inventory().totalSanityValue()).toBe(0);
  });
});

describe('Inventory entries & clear', () => {
  it('entries lists all items', () => {
    const inv = new Inventory();
    inv.add('material.chalkStub', 3);
    inv.add('consumable.celery', 1);
    const e = inv.entries();
    expect(e).toHaveLength(2);
    expect(e.map((x) => x.itemId).sort()).toEqual(['consumable.celery', 'material.chalkStub']);
  });

  it('clear empties everything', () => {
    const inv = new Inventory();
    inv.add('relic.blueEdgeHeadband', 2);
    inv.add('material.chalkStub', 5);
    inv.clear();
    expect(inv.entries()).toEqual([]);
    expect(inv.activeRelics()).toEqual([]);
    expect(inv.totalSanityValue()).toBe(0);
  });
});
