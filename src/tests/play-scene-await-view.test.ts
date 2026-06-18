import { describe, expect, it } from 'vitest';
import { isRectInCameraView } from '../scenes/cameraView';

interface MockCamera {
  scrollX: number;
  scrollY: number;
  displayWidth: number;
  displayHeight: number;
  worldView: { x: number; y: number; width: number; height: number };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

describe('isRectInCameraView — fresh viewport vs stale worldView', () => {
  const cam: MockCamera = {
    scrollX: 0,
    scrollY: 800,
    displayWidth: 1280,
    displayHeight: 720,
    // stale worldView — does NOT reflect scrollY=800
    worldView: { x: 0, y: 0, width: 1280, height: 720 },
  };

  it('considers a rect visible when it falls inside the fresh camera viewport (scrollY=800)', () => {
    // Camera scrolled to y=800, so fresh viewport is y:[800, 1520]
    // Rect at y=1300 is within that range → should be VISIBLE
    const rect: Rect = { x: 728, y: 1300, width: 64, height: 64 };
    expect(isRectInCameraView(cam, rect)).toBe(true);
  });

  it('rejects a rect entirely above the fresh camera viewport', () => {
    // Camera scrolled to y=800, fresh viewport is y:[800, 1520]
    // Rect at y=100 is above → should be NOT visible
    const rect: Rect = { x: 728, y: 100, width: 64, height: 64 };
    expect(isRectInCameraView(cam, rect)).toBe(false);
  });

  it('rejects a rect entirely below the fresh camera viewport', () => {
    // Camera scrolled to y=800, fresh viewport is y:[800, 1520]
    // Rect at y=1600 is below → should be NOT visible
    const rect: Rect = { x: 728, y: 1600, width: 64, height: 64 };
    expect(isRectInCameraView(cam, rect)).toBe(false);
  });

  it('rejects a rect entirely left of the fresh camera viewport', () => {
    // Camera scrolled to x=0, fresh viewport is x:[0, 1280]
    // Rect at x=-100 is left → should be NOT visible
    const rect: Rect = { x: -100, y: 900, width: 64, height: 64 };
    expect(isRectInCameraView(cam, rect)).toBe(false);
  });

  it('rejects a rect entirely right of the fresh camera viewport', () => {
    // Camera scrolled to x=0, fresh viewport is x:[0, 1280]
    // Rect at x=1300 is right → should be NOT visible
    const rect: Rect = { x: 1300, y: 900, width: 64, height: 64 };
    expect(isRectInCameraView(cam, rect)).toBe(false);
  });
});
