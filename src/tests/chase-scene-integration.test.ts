import { describe, it, expect, vi } from 'vitest';

describe('EventEngine SFX hooks', () => {
  it('setOnFadeSfxCallback is defined on the prototype', async () => {
    const mod = await import('../story/EventEngine');
    expect(mod.EventEngine.prototype.setOnFadeSfxCallback).toBeDefined();
  });

  it('setOnBlackScreenSfxCallback is defined on the prototype', async () => {
    const mod = await import('../story/EventEngine');
    expect(mod.EventEngine.prototype.setOnBlackScreenSfxCallback).toBeDefined();
  });

  it('setOnSwitchViewSfxCallback is defined on the prototype', async () => {
    const mod = await import('../story/EventEngine');
    expect(mod.EventEngine.prototype.setOnSwitchViewSfxCallback).toBeDefined();
  });

  it('all three SFX hook methods are functions', async () => {
    const mod = await import('../story/EventEngine');
    expect(typeof mod.EventEngine.prototype.setOnFadeSfxCallback).toBe('function');
    expect(typeof mod.EventEngine.prototype.setOnBlackScreenSfxCallback).toBe('function');
    expect(typeof mod.EventEngine.prototype.setOnSwitchViewSfxCallback).toBe('function');
  });
});
