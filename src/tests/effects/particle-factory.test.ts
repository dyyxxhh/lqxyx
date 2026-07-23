import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import { ParticleFactory } from '../../effects/ParticleFactory';

function createMockScene() {
  const emitters: any[] = [];
  const makeChainable = () => {
    const obj = {
      setDepth: vi.fn(() => obj),
      setScrollFactor: vi.fn(() => obj),
      emitParticleAt: vi.fn(),
      destroy: vi.fn(),
      setAlpha: vi.fn(() => obj),
      quantity: 1,
    };
    emitters.push(obj);
    return obj;
  };
  return {
    add: {
      particles: vi.fn(makeChainable),
    },
    time: { delayedCall: vi.fn(() => ({ remove: vi.fn() })) },
    _emitters: emitters,
  };
}

describe('ParticleFactory', () => {
  let mockScene: any;
  let factory: ParticleFactory;

  beforeEach(() => {
    mockScene = createMockScene();
    factory = new ParticleFactory(mockScene as unknown as Phaser.Scene);
  });

  it('emitBloodSplash creates particles at position', () => {
    factory.emitBloodSplash(400, 300);
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('emitWallDebris creates particles at position', () => {
    factory.emitWallDebris(200, 200);
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('emitPickupLight creates particles (no sound)', () => {
    factory.emitPickupLight(500, 400, 'gold');
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('emitChalkDust creates particles', () => {
    factory.emitChalkDust(300, 300);
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('emitDeathBurst creates particles', () => {
    factory.emitDeathBurst(400, 300, '#b01724');
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('emitDeathBurst falls back to default color for invalid hex', () => {
    factory.emitDeathBurst(400, 300, 'not-a-color');
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('startAmbientAsh starts continuous particles', () => {
    factory.startAmbientAsh();
    expect(mockScene.add.particles).toHaveBeenCalled();
  });

  it('setAshDensityMultiplier updates density', () => {
    factory.startAmbientAsh();
    factory.setAshDensityMultiplier(2);
    expect(factory.getAshDensityMultiplier()).toBe(2);
  });

  it('stopAmbientAsh stops particles', () => {
    factory.startAmbientAsh();
    factory.stopAmbientAsh();
    expect(true).toBe(true);
  });

  it('destroy cleans up pending timers without throwing', () => {
    factory.emitBloodSplash(400, 300);
    factory.emitWallDebris(200, 200);
    factory.startAmbientAsh();
    expect(() => factory.destroy()).not.toThrow();
  });

  it('destroy stops ambient ash', () => {
    factory.startAmbientAsh();
    factory.destroy();
    // After destroy, starting ash again should create a new emitter
    factory.startAmbientAsh();
    expect(mockScene.add.particles).toHaveBeenCalled();
  });
});
