import type Phaser from 'phaser';

type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xd7b15c,
  rare: 0x3a6db5,
  epic: 0x7a3ab5,
  legendary: 0x3ab56a,
  mythic: 0xffffff,
};

/**
 * Enhanced particle system factory. Uses Phaser 4 GameObjects.Particles
 * with a registry pattern for particle configurations.
 * Pickup particles are SILENT (grill-me: particles only, no sound).
 */
export class ParticleFactory {
  private scene: Phaser.Scene;
  private ashEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ashDensityMultiplier = 1;
  private pendingTimers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  emitBloodSplash(x: number, y: number): void {
    const count = 8 + Math.floor(Math.random() * 8);
    const emitter = this.createEmitter(x, y, 0xb01724, count, 600, true);
    const t = this.scene.time.delayedCall(700, () => emitter?.destroy());
    this.pendingTimers.push(t);
  }

  emitWallDebris(x: number, y: number): void {
    const count = 6 + Math.floor(Math.random() * 5);
    const emitter = this.createEmitter(x, y, 0x49313a, count, 400, false);
    const t = this.scene.time.delayedCall(500, () => emitter?.destroy());
    this.pendingTimers.push(t);
  }

  emitPickupLight(x: number, y: number, rarity: Rarity | string): void {
    const color = typeof rarity === 'string' && rarity in RARITY_COLORS
      ? RARITY_COLORS[rarity as Rarity]
      : RARITY_COLORS.common;
    const count = 10 + Math.floor(Math.random() * 11);
    const emitter = this.createEmitter(x, y, color, count, 800, false, true);
    const t = this.scene.time.delayedCall(900, () => emitter?.destroy());
    this.pendingTimers.push(t);
  }

  emitChalkDust(x: number, y: number): void {
    const count = 12 + Math.floor(Math.random() * 7);
    const emitter = this.createEmitter(x, y, 0xc9b9a6, count, 800, false);
    const t = this.scene.time.delayedCall(900, () => emitter?.destroy());
    this.pendingTimers.push(t);
  }

  emitDeathBurst(x: number, y: number, colorHex: string): void {
    const parsed = parseInt(colorHex.replace('#', ''), 16);
    const color = Number.isNaN(parsed) ? 0xb01724 : parsed;
    const count = 15 + Math.floor(Math.random() * 11);
    const emitter = this.createEmitter(x, y, color, count, 500, true);
    const t = this.scene.time.delayedCall(600, () => emitter?.destroy());
    this.pendingTimers.push(t);
  }

  startAmbientAsh(): void {
    if (this.ashEmitter) return;
    this.ashEmitter = this.scene.add.particles(0, 0, '__DEFAULT', {
      x: { min: 0, max: 1280 },
      y: -10,
      lifespan: 8000,
      speedY: { min: 10, max: 30 },
      speedX: { min: -5, max: 5 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.3, end: 0 },
      tint: 0x49313a,
      quantity: this.ashDensityMultiplier,
      frequency: 200,
      blendMode: 'NORMAL',
    } as any);
    (this.ashEmitter as any).setDepth(500);
    (this.ashEmitter as any).setScrollFactor(0);
  }

  setAshDensityMultiplier(multiplier: number): void {
    this.ashDensityMultiplier = multiplier;
    if (this.ashEmitter) {
      (this.ashEmitter as any).quantity = multiplier;
    }
  }

  getAshDensityMultiplier(): number {
    return this.ashDensityMultiplier;
  }

  stopAmbientAsh(): void {
    if (this.ashEmitter) {
      (this.ashEmitter as any).destroy();
      this.ashEmitter = null;
    }
  }

  destroy(): void {
    this.stopAmbientAsh();
    for (const t of this.pendingTimers) {
      t.remove();
    }
    this.pendingTimers = [];
  }

  private createEmitter(
    x: number, y: number, color: number, count: number,
    lifespanMs: number, gravity: boolean, rising = false,
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(x, y, '__DEFAULT', {
      speed: rising
        ? { min: 50, max: 150 }
        : { min: 30, max: 120 },
      lifespan: lifespanMs,
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      quantity: count,
      frequency: 0,
      gravityY: gravity ? 200 : 0,
      blendMode: 'ADD',
    } as any);
    (emitter as any).setDepth(100);
    return emitter;
  }
}
