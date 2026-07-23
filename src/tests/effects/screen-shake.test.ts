import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Phaser from 'phaser';
import { ScreenShake } from '../../effects/ScreenShake';

function createMockCamera() {
  return {
    shake: vi.fn(),
    flash: vi.fn(),
  };
}

function createMockScene() {
  const camera = createMockCamera();
  return {
    cameras: { main: camera },
    add: {
      rectangle: vi.fn(() => ({
        setOrigin: vi.fn(() => ({ setScrollFactor: vi.fn(() => ({ setDepth: vi.fn(() => ({ setAlpha: vi.fn(() => ({})), destroy: vi.fn() })), destroy: vi.fn() })), destroy: vi.fn() })),
      })),
    },
    tweens: { add: vi.fn() },
  };
}

describe('ScreenShake', () => {
  let mockScene: any;
  let shake: ScreenShake;

  beforeEach(() => {
    mockScene = createMockScene();
    shake = new ScreenShake(mockScene as unknown as Phaser.Scene);
  });

  it('shakeHit triggers 8px shake', () => {
    shake.shakeHit();
    expect(mockScene.cameras.main.shake).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    const [, intensity] = mockScene.cameras.main.shake.mock.calls[0];
    expect(intensity).toBeCloseTo(0.008, 3);
  });

  it('shakeKill triggers 12px shake', () => {
    shake.shakeKill();
    const [, intensity] = mockScene.cameras.main.shake.mock.calls[0];
    expect(intensity).toBeCloseTo(0.012, 3);
  });

  it('shakeSanity triggers 20px shake', () => {
    shake.shakeSanity();
    const [, intensity] = mockScene.cameras.main.shake.mock.calls[0];
    expect(intensity).toBeCloseTo(0.020, 3);
  });

  it('shakeCustom triggers custom intensity', () => {
    shake.shakeCustom(15, 300);
    const [duration, intensity] = mockScene.cameras.main.shake.mock.calls[0];
    expect(duration).toBe(300);
    expect(intensity).toBeCloseTo(0.015, 3);
  });

  it('flashRed creates a red rectangle overlay', () => {
    shake.flashRed(200, 0.3);
    expect(mockScene.add.rectangle).toHaveBeenCalled();
    expect(mockScene.tweens.add).toHaveBeenCalled();
  });
});
