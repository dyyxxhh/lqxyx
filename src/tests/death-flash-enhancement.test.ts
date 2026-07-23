import { describe, it, expect, vi } from 'vitest';
import type { DeathFlashFrame } from '../data/story';
import { DeathFlashManager } from '../scenes/DeathFlashManager';

function chainableObject(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { visible: true, destroyed: false, ...extra };
  object.setDepth = vi.fn(() => object);
  object.setScrollFactor = vi.fn(() => object);
  object.setOrigin = vi.fn(() => object);
  object.setDisplaySize = vi.fn(() => object);
  object.setScale = vi.fn(() => object);
  object.setTint = vi.fn(() => object);
  object.setTintMode = vi.fn(() => object);
  object.setAlpha = vi.fn(() => object);
  object.setVisible = vi.fn((visible: boolean) => {
    object.visible = visible;
    return object;
  });
  object.destroy = vi.fn(() => {
    object.destroyed = true;
  });
  return object;
}

function createMockScene() {
  const scheduled: { delay: number; callback: () => void }[] = [];
  return {
    add: {
      rectangle: vi.fn(() => chainableObject()),
      image: vi.fn(() => chainableObject({ width: 1254, height: 1254 })),
    },
    time: {
      delayedCall: vi.fn((delay: number, callback: () => void) => {
        scheduled.push({ delay, callback });
        return { remove: vi.fn() };
      }),
    },
    textures: { exists: vi.fn(() => true) },
    scheduled,
  };
}

const SIMPLE_SEQUENCE: DeathFlashFrame[] = [
  { background: 'bloodBlack', image: null, durationMs: 1000 },
  { background: 'white', image: 'blackCelery', durationMs: 500 },
  { background: 'black', image: 'whiteCelery', durationMs: 500 },
  { background: 'bloodBlack', image: null, durationMs: 1000 },
];

describe('DeathFlashManager SFX hooks', () => {
  it('setOnFrameSfxCallback is defined on the prototype', () => {
    expect(DeathFlashManager.prototype.setOnFrameSfxCallback).toBeDefined();
  });

  it('setOnFrameShakeCallback is defined on the prototype', () => {
    expect(DeathFlashManager.prototype.setOnFrameShakeCallback).toBeDefined();
  });

  it('frame SFX callback fires with correct frame type per frame', () => {
    const mockScene = createMockScene();
    const manager = new DeathFlashManager(mockScene as any);
    const sfxCalls: { type: string; index: number }[] = [];

    manager.setOnFrameSfxCallback((frameType, frameIndex) => {
      sfxCalls.push({ type: frameType, index: frameIndex });
    });

    manager.play('celery', SIMPLE_SEQUENCE);

    // Advance the first frame's timer to trigger the next frame
    mockScene.scheduled[0]?.callback();

    expect(sfxCalls.length).toBeGreaterThanOrEqual(2);
    // First frame is bloodBlack
    expect(sfxCalls[0].type).toBe('bloodBlack');
    // Second frame is white background -> whiteSilhouette
    expect(sfxCalls[1].type).toBe('whiteSilhouette');
  });

  it('frame shake callback fires with escalating intensity', () => {
    const mockScene = createMockScene();
    const manager = new DeathFlashManager(mockScene as any);
    const shakeCalls: number[] = [];

    manager.setOnFrameShakeCallback((intensityPx) => {
      shakeCalls.push(intensityPx);
    });

    manager.play('celery', SIMPLE_SEQUENCE);
    mockScene.scheduled[0]?.callback();

    // First frame should have the minimum intensity (4px)
    expect(shakeCalls[0]).toBeGreaterThanOrEqual(4);
    // Later frames should have higher or equal intensity
    expect(shakeCalls[1]).toBeGreaterThanOrEqual(shakeCalls[0]);
  });

  it('callbacks are no-op when not registered', () => {
    const mockScene = createMockScene();
    const manager = new DeathFlashManager(mockScene as any);
    // Should not throw when playing without callbacks
    expect(() => {
      manager.play('celery', SIMPLE_SEQUENCE);
      mockScene.scheduled[0]?.callback();
    }).not.toThrow();
  });

  it('getFrameType maps bloodBlack background to bloodBlack for first and last frames', () => {
    const mockScene = createMockScene();
    const manager = new DeathFlashManager(mockScene as any);
    const sfxCalls: string[] = [];

    manager.setOnFrameSfxCallback((frameType) => {
      sfxCalls.push(frameType);
    });

    manager.play('celery', SIMPLE_SEQUENCE);
    // Advance all frames
    while (mockScene.scheduled.length > 0) {
      const next = mockScene.scheduled.shift();
      next?.callback();
    }

    // Last frame should also be bloodBlack (index 0 or last)
    const bloodBlackCalls = sfxCalls.filter(t => t === 'bloodBlack');
    expect(bloodBlackCalls.length).toBeGreaterThanOrEqual(2); // first + last
  });
});
