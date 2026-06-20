import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => {
  class Scene {
    constructor(_key?: string) {}
  }

  class Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }

    contains(px: number, py: number): boolean {
      return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
    }
  }

  return {
    default: {
      Scene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
      Geom: { Rectangle },
      Math: {
        Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
        Distance: {
          Between: (x1: number, y1: number, x2: number, y2: number) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
        },
        DegToRad: (degrees: number) => (degrees * Math.PI) / 180,
        RadToDeg: (radians: number) => (radians * 180) / Math.PI,
      },
      Input: { Keyboard: { KeyCodes: {} } },
    },
  };
});

import {
  GAME_HEIGHT,
  GAME_WIDTH,
  createInitialSceneDebugState,
  markGameSceneReady,
  markPreloadReady,
  markSceneStarted,
  resetSceneDebugState,
  setCanvasDebugState,
} from '../game/scaffoldState';
import { GameScene } from '../scenes/GameScene';
import { PlayScene } from '../scenes/PlayScene';

describe('runtime scene shell', () => {
  it('records BootScene, PreloadScene, and GameScene exactly once with preload readiness before game readiness', () => {
    resetSceneDebugState();

    markSceneStarted('BootScene');
    markSceneStarted('PreloadScene');
    markSceneStarted('PreloadScene');
    markPreloadReady();
    markSceneStarted('GameScene');
    const state = markGameSceneReady();

    expect(state.sceneOrder).toEqual(['BootScene', 'PreloadScene', 'GameScene']);
    expect(state.sceneCounts).toEqual({ BootScene: 1, PreloadScene: 2, GameScene: 1, PlayScene: 0 });
    expect(state.booted).toBe(true);
    expect(state.preloaded).toBe(true);
    expect(state.gameReady).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.menu).toEqual({ visible: true, selectedAction: 'new-game', hasContinue: false });
  });

  it('exposes deterministic sizing and canvas debug info for desktop and mobile landscape checks', () => {
    resetSceneDebugState();

    const state = setCanvasDebugState({
      parentId: 'game-root',
      canvasWidth: 1280,
      canvasHeight: 720,
      displayWidth: 915,
      displayHeight: 412,
      viewportWidth: 915,
      viewportHeight: 412,
    });

    expect(state.canvas).toEqual({
      parentId: 'game-root',
      canvasWidth: 1280,
      canvasHeight: 720,
      displayWidth: 915,
      displayHeight: 412,
      viewportWidth: 915,
      viewportHeight: 412,
    });
    expect(state.sizing).toEqual({
      mode: 'FIT',
      autoCenter: 'CENTER_BOTH',
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      aspectRatio: GAME_WIDTH / GAME_HEIGHT,
    });
  });

  it('starts with shell-specific debug fields in their inactive state', () => {
    expect(createInitialSceneDebugState()).toMatchObject({
      sceneOrder: [],
      currentScene: null,
      booted: false,
      preloaded: false,
      gameReady: false,
      ready: false,
      sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0, PlayScene: 0 },
      menu: { visible: false, selectedAction: null, hasContinue: false },
      canvas: null,
    });
  });

  it('GameScene shutdown destroys managers created for the menu scene', () => {
    stubCanvasContext();
    const scene = Object.create(GameScene.prototype) as {
      inputManager: { destroy: () => void };
      narrativeUI: { destroy: () => void };
      mapRenderer: { destroy: () => void };
      shutdown: () => void;
    };
    const inputManager = { destroy: vi.fn() };
    const narrativeUI = { destroy: vi.fn() };
    const mapRenderer = { destroy: vi.fn() };
    scene.inputManager = inputManager;
    scene.narrativeUI = narrativeUI;
    scene.mapRenderer = mapRenderer;

    scene.shutdown();

    expect(inputManager.destroy).toHaveBeenCalledTimes(1);
    expect(narrativeUI.destroy).toHaveBeenCalledTimes(1);
    expect(mapRenderer.destroy).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('PlayScene ensures __WHITE fallback texture exists before missing sprite fallback is used', () => {
    stubCanvasContext();
    const scene = Object.create(PlayScene.prototype) as {
      textures: { exists: (key: string) => boolean; createCanvas: (key: string, width: number, height: number) => unknown };
      ensureWhiteFallbackTexture: () => void;
    };
    const context = { fillStyle: '', fillRect: vi.fn() };
    const texture = { getContext: vi.fn(() => context), refresh: vi.fn() };
    scene.textures = {
      exists: vi.fn(() => false),
      createCanvas: vi.fn(() => texture),
    };

    scene.ensureWhiteFallbackTexture();

    expect(scene.textures.exists).toHaveBeenCalledWith('__WHITE');
    expect(scene.textures.createCanvas).toHaveBeenCalledWith('__WHITE', 1, 1);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(texture.refresh).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('PlayScene caps movement delta so resume frames cannot skip across wall collision samples', () => {
    stubCanvasContext();
    const scene = Object.create(PlayScene.prototype) as {
      collisionManager: { getWalkableBounds: () => { x: number; y: number; width: number; height: number }; isWalkable: (x: number) => boolean };
      currentFloor: '4F';
      currentDirection: string;
      isMoving: boolean;
      playerPosition: { x: number; y: number };
      playerSprite: { setPosition: (x: number, y: number) => void };
      eventEngine: { updatePlayerPosition: (position: { x: number; y: number }) => void };
      syncCharacterDebugState: () => void;
      handleMovement: (vector: { x: number; y: number }, delta: number) => void;
    };
    scene.collisionManager = {
      getWalkableBounds: () => ({ x: 0, y: 0, width: 1000, height: 1000 }),
      isWalkable: (x: number) => x < 150 || x > 170,
    };
    scene.currentFloor = '4F';
    scene.currentDirection = 'down';
    scene.isMoving = false;
    scene.playerPosition = { x: 100, y: 100 };
    scene.playerSprite = { setPosition: vi.fn() };
    scene.eventEngine = { updatePlayerPosition: vi.fn() };
    scene.syncCharacterDebugState = vi.fn();

    scene.handleMovement({ x: 1, y: 0 }, 2_000);

    expect(scene.playerPosition.x).toBeLessThan(150);
    expect(scene.playerPosition.x).toBeGreaterThan(100);
  }, 15_000);

  it('PlayScene routes survival countdown expiry through EventEngine ending lookup', () => {
    const scene = Object.create(PlayScene.prototype) as {
      eventEngine: { triggerEndingById: (endingId: string) => void };
      onTimerExpired: (timerId: string) => void;
    };
    scene.eventEngine = { triggerEndingById: vi.fn() };

    scene.onTimerExpired('survival-route-countdown');

    expect(scene.eventEngine.triggerEndingById).toHaveBeenCalledWith('saozi');
  }, 15_000);
});

function stubCanvasContext(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      fillStyle: '',
      fillRect: () => undefined,
      clearRect: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => undefined,
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      setTransform: () => undefined,
      drawImage: () => undefined,
      save: () => undefined,
      fillText: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      rotate: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      measureText: () => ({ width: 0 }),
      transform: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
      canvas: document.createElement('canvas'),
    }),
  });
}
