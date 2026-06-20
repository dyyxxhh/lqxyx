import { describe, expect, it, vi } from 'vitest';

import { DeathFlashManager } from '../scenes/DeathFlashManager';
import { firstActBranches, type DeathFlashFrame } from '../data/story';

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
  const rectangles: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [];
  const scheduled: { delay: number; callback: () => void }[] = [];

  return {
    rectangles,
    images,
    scheduled,
    scene: {
      add: {
        rectangle: vi.fn((x: number, y: number, width: number, height: number, color: number, alpha: number) => {
          const rectangle = chainableObject({ x, y, width, height, color, alpha });
          rectangles.push(rectangle);
          return rectangle;
        }),
        image: vi.fn((x: number, y: number, key: string) => {
          const image = chainableObject({ x, y, key, width: 1254, height: 1254 });
          images.push(image);
          return image;
        }),
      },
      time: {
        delayedCall: vi.fn((delay: number, callback: () => void) => {
          scheduled.push({ delay, callback });
          return { remove: vi.fn() };
        }),
      },
      textures: {
        exists: vi.fn(() => true),
      },
    },
  };
}

function runNextTimer(scheduled: { delay: number; callback: () => void }[]): number {
  const next = scheduled.shift();
  if (!next) throw new Error('Expected a scheduled death flash frame timer');
  next.callback();
  return next.delay;
}

function celerySequence(): DeathFlashFrame[] {
  const branch = firstActBranches.find((candidate) => candidate.id === 'A-1');
  const flash = branch?.commands.find((command) => command.type === 'deathFlash');
  if (flash?.type !== 'deathFlash') throw new Error('A-1 celery death flash is missing');
  return flash.sequence;
}

describe('DeathFlashManager', () => {
  it('renders story death flash frames in order and logs source frame data', () => {
    const sequence = celerySequence();
    const mock = createMockScene();
    const manager = new DeathFlashManager(mock.scene as never);

    manager.play('celery', sequence);

    for (let index = 0; index < sequence.length - 1; index++) {
      expect(runNextTimer(mock.scheduled)).toBe(sequence[index]?.durationMs);
    }

    expect(manager.getFrameLog()).toEqual(
      sequence.map((frame, index) => ({
        id: 'celery',
        index,
        background: frame.background,
        image: frame.image ?? null,
        textureKey: frame.image ? expect.any(String) : null,
        durationMs: frame.durationMs,
      })),
    );
    expect(mock.rectangles.map((rectangle) => rectangle.color)).toEqual(
      sequence.filter((frame) => frame.background !== 'bloodBlack').map((frame) => frame.background === 'white' ? 0xffffff : 0x000000),
    );
    expect(mock.images.filter((image) => image.key === 'transition.bloodBlackScreen')).toHaveLength(
      sequence.filter((frame) => frame.background === 'bloodBlack').length,
    );
    expect(mock.images.filter((image) => image.key !== 'transition.bloodBlackScreen').map((image) => image.key)).toEqual(
      sequence.filter((frame) => frame.image).map((frame) => frame.image?.includes('Celery') ? 'prop.celery' : 'prop.ruler'),
    );
  });

  it('cleans up per-frame objects after playback completes', () => {
    const sequence = celerySequence();
    const mock = createMockScene();
    const manager = new DeathFlashManager(mock.scene as never);

    manager.play('celery', sequence);
    while (mock.scheduled.length > 0) {
      runNextTimer(mock.scheduled);
    }

    expect(mock.rectangles.every((rectangle) => rectangle.destroyed === true)).toBe(true);
    expect(mock.images.every((image) => image.destroyed === true)).toBe(true);
    expect(manager.getActiveObjectCount()).toBe(0);
    expect(manager.getFrameLog()).toHaveLength(sequence.length);
  });
});
