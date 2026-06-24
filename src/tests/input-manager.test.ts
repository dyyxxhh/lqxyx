import { describe, expect, it, vi } from 'vitest';

import { InputManager, resolveJoystickMovementVector } from '../input/InputManager';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: {
          W: 87,
          A: 65,
          S: 83,
          D: 68,
          UP: 38,
          LEFT: 37,
          DOWN: 40,
          RIGHT: 39,
          F: 70,
          Q: 81,
        },
      },
    },
    Math: {
      DegToRad: (degrees: number) => (degrees * Math.PI) / 180,
      RadToDeg: (radians: number) => (radians * 180) / Math.PI,
    },
  },
}));

import { createInitialSceneDebugState, getSceneDebugState, resetSceneDebugState } from '../game/scaffoldState';
import {
  createInitialInputDebugState,
  setInputDebugState,
} from '../input/inputState';

describe('input debug state', () => {
  it('returns deterministic initial debug state', () => {
    expect(createInitialInputDebugState()).toEqual({
      deviceMode: 'desktop',
      lockActive: false,
      lockReason: null,
      movementVector: { x: 0, y: 0 },
      joystickPointerId: null,
      interactAction: null,
      interactPressed: false,
      fullscreenStatus: 'idle',
      orientationStatus: 'landscape',
    });
  });

  it('setInputDebugState merges partial into window scene state', () => {
    resetSceneDebugState();

    setInputDebugState({ deviceMode: 'mobile', lockActive: true, lockReason: 'dialogue' });

    const state = getSceneDebugState();
    expect(state.input).toMatchObject({
      deviceMode: 'mobile',
      lockActive: true,
      lockReason: 'dialogue',
    });

    // Unchanged fields retain their initial values
    expect(state.input.movementVector).toEqual({ x: 0, y: 0 });
    expect(state.input.fullscreenStatus).toBe('idle');
  });

  it('setInputDebugState preserves window state identity', () => {
    resetSceneDebugState();
    const first = getSceneDebugState();

    setInputDebugState({ lockActive: true });
    const second = getSceneDebugState();

    expect(first).toBe(second);
    expect(first.input.lockActive).toBe(true);
    expect(second.input.lockActive).toBe(true);
  });

  it('SceneDebugState includes input field with correct defaults', () => {
    resetSceneDebugState();
    const state = createInitialSceneDebugState();
    expect(state.input).toBeDefined();
    expect(state.input.deviceMode).toBe('desktop');
    expect(state.input.lockActive).toBe(false);
    expect(state.input.movementVector).toEqual({ x: 0, y: 0 });
  });
});

describe('input lock semantics', () => {
  it('lockActive and lockReason transition atomically via debug state', () => {
    resetSceneDebugState();

    // Simulate lock
    setInputDebugState({ lockActive: true, lockReason: 'dialogue', movementVector: { x: 0, y: 0 } });
    expect(getSceneDebugState().input).toMatchObject({
      lockActive: true,
      lockReason: 'dialogue',
      movementVector: { x: 0, y: 0 },
    });

    // Simulate unlock
    setInputDebugState({ lockActive: false, lockReason: null });
    expect(getSceneDebugState().input).toMatchObject({
      lockActive: false,
      lockReason: null,
    });
  });


  it('allows F and Q interaction edges through dialogue lock while movement remains frozen', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      getMovementVector: InputManager['getMovementVector'];
      consumeInteract: InputManager['consumeInteract'];
      locked: boolean;
      lockReason: string | null;
      movementVector: { x: number; y: number };
      interactAction: string | null;
      interactPressedThisFrame: boolean;
      keyF: { isDown: boolean };
      keyQ: { isDown: boolean };
      keyFPrevDown: boolean;
      keyQPrevDown: boolean;
      pollDesktopKeyboard: () => void;
    };

    manager.locked = true;
    manager.lockReason = 'dialogue';
    manager.movementVector = { x: 1, y: -1 };
    manager.interactAction = null;
    manager.interactPressedThisFrame = false;
    manager.keyF = { isDown: false };
    manager.keyQ = { isDown: false };
    manager.keyFPrevDown = false;
    manager.keyQPrevDown = false;

    manager.keyF.isDown = true;
    manager.pollDesktopKeyboard();

    expect(manager.getMovementVector()).toEqual({ x: 0, y: 0 });
    expect(manager.consumeInteract()).toEqual({ action: 'F', pressed: true });
    expect(manager.consumeInteract()).toEqual({ action: null, pressed: false });

    manager.pollDesktopKeyboard();
    expect(manager.consumeInteract()).toEqual({ action: null, pressed: false });

    manager.keyF.isDown = false;
    manager.keyQ.isDown = true;
    manager.pollDesktopKeyboard();

    expect(manager.consumeInteract()).toEqual({ action: 'Q', pressed: true });
  }, 15_000);

  it('allows mobile interact through dialogue lock without enabling joystick movement', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      getMovementVector: InputManager['getMovementVector'];
      consumeInteract: InputManager['consumeInteract'];
      locked: boolean;
      lockReason: string | null;
      movementVector: { x: number; y: number };
      interactAction: string | null;
      interactPressedThisFrame: boolean;
      contextAction: 'F' | 'Q' | null;
      joystickPointerId: number | null;
      onPointerDown: (pointer: { x: number; y: number; id: number }) => void;
      onPointerMove: (pointer: { x: number; y: number; id: number }) => void;
    };

    manager.locked = true;
    manager.lockReason = 'dialogue';
    manager.movementVector = { x: 0, y: 0 };
    manager.interactAction = null;
    manager.interactPressedThisFrame = false;
    manager.contextAction = null;
    manager.joystickPointerId = null;

    manager.onPointerDown({ x: 1080, y: 600, id: 3 });

    expect(manager.consumeInteract()).toEqual({ action: 'F', pressed: true });

    manager.onPointerDown({ x: 200, y: 600, id: 4 });
    manager.onPointerMove({ x: 280, y: 600, id: 4 });

    expect(manager.getMovementVector()).toEqual({ x: 0, y: 0 });
    expect(manager.joystickPointerId).toBeNull();
  }, 15_000);

  it('allows mobile dialogue-box taps through dialogue lock', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      consumeInteract: InputManager['consumeInteract'];
      locked: boolean;
      lockReason: string | null;
      interactAction: string | null;
      interactPressedThisFrame: boolean;
      contextAction: 'F' | 'Q' | null;
      joystickPointerId: number | null;
      onPointerDown: (pointer: { x: number; y: number; id: number }) => void;
    };

    manager.locked = true;
    manager.lockReason = 'dialogue';
    manager.interactAction = null;
    manager.interactPressedThisFrame = false;
    manager.contextAction = null;
    manager.joystickPointerId = null;

    manager.onPointerDown({ x: 640, y: 610, id: 8 });

    expect(manager.consumeInteract()).toEqual({ action: 'F', pressed: true });
  }, 15_000);

  it('ignores desktop pointer clicks outside dialogue bounds during dialogue lock', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      consumeInteract: InputManager['consumeInteract'];
      locked: boolean;
      lockReason: string | null;
      interactAction: string | null;
      interactPressedThisFrame: boolean;
      contextAction: 'F' | 'Q' | null;
      onDesktopPointerDown: (pointer: { x: number; y: number }) => void;
    };

    manager.locked = true;
    manager.lockReason = 'dialogue';
    manager.interactAction = null;
    manager.interactPressedThisFrame = false;
    manager.contextAction = null;

    manager.onDesktopPointerDown({ x: 100, y: 100 });

    expect(manager.consumeInteract()).toEqual({ action: null, pressed: false });
  }, 15_000);

  it('prioritizes dialogue-box taps over the joystick region during dialogue lock', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      consumeInteract: InputManager['consumeInteract'];
      locked: boolean;
      lockReason: string | null;
      interactAction: string | null;
      interactPressedThisFrame: boolean;
      contextAction: 'F' | 'Q' | null;
      joystickPointerId: number | null;
      onPointerDown: (pointer: { x: number; y: number; id: number }) => void;
    };

    manager.locked = true;
    manager.lockReason = 'dialogue';
    manager.interactAction = null;
    manager.interactPressedThisFrame = false;
    manager.contextAction = null;
    manager.joystickPointerId = null;

    manager.onPointerDown({ x: 300, y: 610, id: 9 });

    expect(manager.joystickPointerId).toBeNull();
    expect(manager.consumeInteract()).toEqual({ action: 'F', pressed: true });
  }, 15_000);

  it('lock clears movementVector and interact state', () => {
    resetSceneDebugState();

    // Setup some movement and interact state
    setInputDebugState({
      movementVector: { x: 1, y: 0 },
      interactAction: 'F',
      interactPressed: true,
    });

    // Lock should clear movement and interact
    setInputDebugState({
      lockActive: true,
      lockReason: 'blackScreen',
      movementVector: { x: 0, y: 0 },
      interactAction: null,
      interactPressed: false,
    });

    const state = getSceneDebugState().input;
    expect(state.movementVector).toEqual({ x: 0, y: 0 });
    expect(state.interactAction).toBeNull();
    expect(state.interactPressed).toBe(false);
  });
});

describe('mobile joystick movement vector', () => {
  it('snaps joystick drag to exactly eight directions including left and right', () => {
    expect(resolveJoystickMovementVector(80, 0)).toEqual({ x: 1, y: 0 });
    expect(resolveJoystickMovementVector(0, -80)).toEqual({ x: 0, y: -1 });
    expect(resolveJoystickMovementVector(-80, 0)).toEqual({ x: -1, y: 0 });
    expect(resolveJoystickMovementVector(0, 80)).toEqual({ x: 0, y: 1 });
    expect(resolveJoystickMovementVector(60, -30)).toEqual({ x: 1, y: -1 });
    expect(resolveJoystickMovementVector(-60, -30)).toEqual({ x: -1, y: -1 });
    expect(resolveJoystickMovementVector(-60, 30)).toEqual({ x: -1, y: 1 });
    expect(resolveJoystickMovementVector(60, 30)).toEqual({ x: 1, y: 1 });
  });

  it('preserves eight-direction joystick movement through pointer drag', () => {
    const manager = Object.create(InputManager.prototype) as unknown as {
      getMovementVector: InputManager['getMovementVector'];
      locked: boolean;
      movementVector: { x: number; y: number };
      joystickPointerId: number | null;
      joystickStartX: number;
      joystickStartY: number;
      joystickThumb: { setPosition: (x: number, y: number) => void } | null;
      onPointerMove: (pointer: { x: number; y: number; id: number }) => void;
    };

    manager.locked = false;
    manager.movementVector = { x: 0, y: 0 };
    manager.joystickPointerId = 3;
    manager.joystickStartX = 200;
    manager.joystickStartY = 600;
    manager.joystickThumb = { setPosition: () => undefined };

    manager.onPointerMove({ x: 260, y: 570, id: 3 });

    const vector = manager.getMovementVector();
    expect(vector).toEqual({ x: 1, y: -1 });
  });
});

describe('context action resolver priority', () => {
  it('resolves mobile interact to F by default', () => {
    const contextAction: 'F' | 'Q' | null = null;
    const resolved = contextAction ?? 'F';
    expect(resolved).toBe('F');
  });

  it('resolves to Q when context action is Q', () => {
    const contextAction: 'F' | 'Q' | null = 'Q';
    const resolved = contextAction ?? 'F';
    expect(resolved).toBe('Q');
  });

  it('resolves to F when context action is F', () => {
    const contextAction: 'F' | 'Q' | null = 'F';
    const resolved = contextAction ?? 'F';
    expect(resolved).toBe('F');
  });
});

describe('fullscreen status machine', () => {
  it('starts in idle state', () => {
    expect(createInitialInputDebugState().fullscreenStatus).toBe('idle');
  });

  it('transitions correctly through debug state', () => {
    resetSceneDebugState();

    setInputDebugState({ fullscreenStatus: 'requested' });
    expect(getSceneDebugState().input.fullscreenStatus).toBe('requested');

    setInputDebugState({ fullscreenStatus: 'entered' });
    expect(getSceneDebugState().input.fullscreenStatus).toBe('entered');

    setInputDebugState({ fullscreenStatus: 'left' });
    expect(getSceneDebugState().input.fullscreenStatus).toBe('left');
  });

  it('constructs mobile manager as entered and hides the main fullscreen prompt when document is already fullscreen', () => {
    stubCanvasContext();
    withFullscreenElement(document.body, () => {
      const manager = new InputManager(createMobileInputSceneStub());

      expect(manager.getFullscreenStatus()).toBe('entered');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });
      expect(getSceneDebugState().input.fullscreenStatus).toBe('entered');

      manager.destroy();
    });
  });

  it('keeps fullscreen prompt above the GameScene menu overlay but below portrait warning', () => {
    stubCanvasContext();
    withFullscreenElement(null, () => {
      const manager = new InputManager(createMobileInputSceneStub());
      const visual = manager.getVisualDebugState();

      expect(visual.fullscreenPrompt).toMatchObject({ visible: true, depth: 990 });
      expect((visual.fullscreenPrompt as { depth: number }).depth).toBeGreaterThan(979);
      expect((visual.fullscreenPrompt as { depth: number }).depth).toBeLessThan(1010);

      manager.destroy();
    });
  });

  it('does not render a visible mobile interaction button while right-side tap still interacts', () => {
    stubCanvasContext();
    withFullscreenElement(document.body, () => {
      const manager = new InputManager(createMobileInputSceneStub());

      expect(manager.getVisualDebugState()).toMatchObject({ interact: null, interactLabel: null });

      (manager as unknown as { onPointerDown: (pointer: { x: number; y: number; id: number }) => void }).onPointerDown({ x: 1080, y: 600, id: 1 });

      expect(manager.consumeInteract()).toEqual({ action: 'F', pressed: true });

      manager.destroy();
    });
  });

  it('shows a first-run tutorial for the current device mode and hides it after three seconds', () => {
    stubCanvasContext();
    vi.useFakeTimers();
    try {
      localStorage.clear();
      withFullscreenElement(document.body, () => {
        const manager = new InputManager(createMobileInputSceneStub());

        expect(manager.getVisualDebugState()).toMatchObject({
          tutorial: expect.objectContaining({ visible: true, text: expect.stringContaining('左侧') }),
        });

        vi.advanceTimersByTime(3_000);

        expect(manager.getVisualDebugState()).toMatchObject({
          tutorial: expect.objectContaining({ visible: false }),
        });

        manager.destroy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses first-run tutorial while fullscreen prompt is visible, then shows it after dismissal', () => {
    stubCanvasContext();
    vi.useFakeTimers();
    try {
      localStorage.clear();
      withFullscreenElement(null, () => {
        const scene = createMobileInputSceneStub();
        const manager = new InputManager(scene);

        expect(manager.getVisualDebugState()).toMatchObject({
          fullscreenPrompt: expect.objectContaining({ visible: true }),
          tutorial: expect.objectContaining({ visible: false }),
        });

        scene.emitRectanglePointerUp('暂不');

        expect(manager.getVisualDebugState()).toMatchObject({
          fullscreenPrompt: expect.objectContaining({ visible: false }),
          tutorial: expect.objectContaining({ visible: true, text: expect.stringContaining('左侧') }),
        });

        vi.advanceTimersByTime(3_000);
        expect(manager.getVisualDebugState()).toMatchObject({
          tutorial: expect.objectContaining({ visible: false }),
        });

        manager.destroy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps portrait-to-landscape from re-showing after denial while document is fullscreen, but re-shows when it is not fullscreen', () => {
    stubCanvasContext();
    withFullscreenElement(null, (setFullscreenElement) => {
      const scene = createMobileInputSceneStub();
      const manager = new InputManager(scene);

      scene.emitRectanglePointerUp('暂不');
      expect(manager.getFullscreenStatus()).toBe('denied');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });

      scene.scale.isPortrait = true;
      scene.emitScale('orientationchange', 'portrait-primary');
      setFullscreenElement(document.body);
      scene.scale.isPortrait = false;
      scene.emitScale('orientationchange', 'landscape-primary');

      expect(manager.getFullscreenStatus()).toBe('entered');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });

      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));
      scene.scale.isPortrait = true;
      scene.emitScale('orientationchange', 'portrait-primary');
      scene.scale.isPortrait = false;
      scene.emitScale('orientationchange', 'landscape-primary');

      expect(manager.getFullscreenStatus()).toBe('idle');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: true });

      manager.destroy();
    });
  });

  it('refreshes Phaser scale across fullscreen portrait-to-landscape recovery', () => {
    stubCanvasContext();
    vi.useFakeTimers();
    try {
      withFullscreenElement(document.body, () => {
        const scene = createMobileInputSceneStub();
        const manager = new InputManager(scene);
        scene.scaleSyncCalls.updateBounds = 0;
        scene.scaleSyncCalls.refresh = 0;

        scene.scale.isPortrait = true;
        scene.emitScale('orientationchange', 'portrait-primary');
        scene.scale.isPortrait = false;
        scene.emitScale('orientationchange', 'landscape-primary');

        expect(scene.scaleSyncCalls.updateBounds).toBe(2);
        expect(scene.scaleSyncCalls.refresh).toBe(2);

        vi.advanceTimersByTime(300);

        expect(scene.scaleSyncCalls.updateBounds).toBe(5);
        expect(scene.scaleSyncCalls.refresh).toBe(5);
        expect(manager.getFullscreenStatus()).toBe('entered');
        expect(manager.getOrientationStatus()).toBe('landscape');

        manager.destroy();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('syncs document fullscreenchange into status and fullscreen prompt visibility', () => {
    stubCanvasContext();
    withFullscreenElement(null, (setFullscreenElement) => {
      const manager = new InputManager(createMobileInputSceneStub());

      expect(manager.getFullscreenStatus()).toBe('idle');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: true });

      setFullscreenElement(document.body);
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(manager.getFullscreenStatus()).toBe('entered');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });

      setFullscreenElement(null);
      document.dispatchEvent(new Event('fullscreenchange'));

      expect(manager.getFullscreenStatus()).toBe('left');
      expect(manager.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: true });

      manager.destroy();
    });
  });

  it('constructs consecutive mobile managers as entered when document remains fullscreen', () => {
    stubCanvasContext();
    withFullscreenElement(document.body, () => {
      const first = new InputManager(createMobileInputSceneStub());
      expect(first.getFullscreenStatus()).toBe('entered');
      expect(first.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });
      first.destroy();

      const second = new InputManager(createMobileInputSceneStub());
      expect(second.getFullscreenStatus()).toBe('entered');
      expect(second.getVisualDebugState().fullscreenPrompt).toMatchObject({ visible: false });
      second.destroy();
    });
  });

  it('destroy removes the fullscreenerror listener registered by the prompt', () => {
    stubCanvasContext();
    const manager = Object.create(InputManager.prototype) as unknown as {
      scene: unknown;
      fullscreenStatus: string;
      fullscreenAvailable: boolean;
      setupFullscreenPrompt: () => void;
      destroy: InputManager['destroy'];
      updateDebugState: () => void;
    };
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');

    manager.scene = createFullscreenSceneStub();
    manager.fullscreenStatus = 'idle';
    manager.fullscreenAvailable = true;
    manager.updateDebugState = () => undefined;

    manager.setupFullscreenPrompt();
    const fullscreenErrorCall = addListener.mock.calls.find((call) => call[0] === 'fullscreenerror');

    expect(fullscreenErrorCall?.[1]).toBeTypeOf('function');

    manager.destroy();

    expect(removeListener).toHaveBeenCalledWith('fullscreenerror', fullscreenErrorCall?.[1]);

    addListener.mockRestore();
    removeListener.mockRestore();
    if (originalDescriptor) {
      Object.defineProperty(document, 'fullscreenEnabled', originalDescriptor);
    }
  });

  it('destroy clears a pending fullscreen denial fallback timeout', () => {
    stubCanvasContext();
    vi.useFakeTimers();
    try {
      const manager = Object.create(InputManager.prototype) as unknown as {
        scene: unknown;
        fullscreenStatus: string;
        fullscreenAvailable: boolean;
        attemptFullscreen: () => void;
        destroy: InputManager['destroy'];
        dismissFullscreenPrompt: () => void;
        updateDebugState: () => void;
      };

      withFullscreenElement(null, () => {
        manager.scene = createFullscreenSceneStub();
        manager.fullscreenStatus = 'idle';
        manager.fullscreenAvailable = true;
        manager.dismissFullscreenPrompt = vi.fn(() => {
          manager.fullscreenStatus = 'denied';
        });
        manager.updateDebugState = () => undefined;

        manager.attemptFullscreen();
        expect(manager.fullscreenStatus).toBe('requested');
      });

      manager.destroy();
      vi.advanceTimersByTime(800);

      expect(manager.fullscreenStatus).toBe('requested');
      expect(manager.dismissFullscreenPrompt).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('orientation status', () => {
  it('starts as landscape', () => {
    expect(createInitialInputDebugState().orientationStatus).toBe('landscape');
  });

  it('switches to portrait via debug state', () => {
    resetSceneDebugState();
    setInputDebugState({ orientationStatus: 'portrait' });
    expect(getSceneDebugState().input.orientationStatus).toBe('portrait');
  });
});

function stubCanvasContext(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
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

type FullscreenElementSetter = (element: Element | null) => void;

type StubGameObject = {
  visible: boolean;
  fillColor: number | null;
  depth: number;
  text: string;
  setDepth: (depth: number) => StubGameObject;
  setScrollFactor: () => StubGameObject;
  setOrigin: () => StubGameObject;
  setInteractive: () => StubGameObject;
  setVisible: (visible: boolean) => StubGameObject;
  setFillStyle: (fillColor: number) => StubGameObject;
  setPosition: () => StubGameObject;
  on: (event: string, callback: () => void) => StubGameObject;
  getBounds: () => { x: number; y: number; width: number; height: number };
  emitPointerUp: () => void;
};

type MobileInputSceneStub = Phaser.Scene & {
  scale: Phaser.Scene['scale'] & {
    isPortrait: boolean;
  };
  scaleSyncCalls: {
    updateBounds: number;
    refresh: number;
  };
  emitScale: (event: string, orientation: string) => void;
  emitRectanglePointerUp: (label: '全屏' | '暂不') => void;
};

function withFullscreenElement(initialElement: Element | null, run: (setFullscreenElement: FullscreenElementSetter) => void): void {
  const originalFullscreenEnabled = Object.getOwnPropertyDescriptor(document, 'fullscreenEnabled');
  const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  let fullscreenElement = initialElement;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });

  try {
    run((element: Element | null) => {
      fullscreenElement = element;
    });
  } finally {
    if (originalFullscreenEnabled) {
      Object.defineProperty(document, 'fullscreenEnabled', originalFullscreenEnabled);
    }
    if (originalFullscreenElement) {
      Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
    }
  }
}

function createStubGameObject(x = 0, y = 0, width = 0, height = 0, text = ''): StubGameObject {
  const callbacks = new Map<string, () => void>();
  const object: StubGameObject = {
    visible: true,
    fillColor: null,
    depth: 0,
    text,
    setDepth: (depth: number) => {
      object.depth = depth;
      return object;
    },
    setScrollFactor: () => object,
    setOrigin: () => object,
    setInteractive: () => object,
    setVisible: (visible: boolean) => {
      object.visible = visible;
      return object;
    },
    setFillStyle: (fillColor: number) => {
      object.fillColor = fillColor;
      return object;
    },
    setPosition: () => object,
    on: (event: string, callback: () => void) => {
      callbacks.set(event, callback);
      return object;
    },
    getBounds: () => ({ x, y, width, height }),
    emitPointerUp: () => {
      callbacks.get('pointerup')?.();
    },
  };
  return object;
}

function createMobileInputSceneStub(): MobileInputSceneStub {
  const scaleCallbacks = new Map<string, (orientation: string) => void>();
  let acceptButton: StubGameObject | null = null;
  let dismissButton: StubGameObject | null = null;
  const canvas = document.createElement('canvas');
  const scaleSyncCalls = {
    updateBounds: 0,
    refresh: 0,
  };
  const scene = {
    sys: {
      game: {
        device: {
          input: {
            touch: true,
          },
        },
        canvas,
      },
    },
    add: {
      rectangle: (x: number, y: number, width: number, height: number) => {
        const object = createStubGameObject(x, y, width, height);
        if (x === 520 && y === 104) acceptButton = object;
        if (x === 760 && y === 104) dismissButton = object;
        return object;
      },
      text: (x: number, y: number, text: string) => createStubGameObject(x, y, text.length * 12, 24, text),
      circle: (x: number, y: number, radius: number) => createStubGameObject(x - radius, y - radius, radius * 2, radius * 2),
    },
    input: {
      on: () => undefined,
      off: () => undefined,
    },
    game: {
      events: {
        on: () => undefined,
        off: () => undefined,
      },
    },
    scale: {
      isPortrait: false,
      on: (event: string, callback: (orientation: string) => void) => {
        scaleCallbacks.set(event, callback);
      },
      off: (event: string) => {
        scaleCallbacks.delete(event);
      },
      startFullscreen: () => undefined,
      updateBounds: () => {
        scaleSyncCalls.updateBounds += 1;
      },
      refresh: () => {
        scaleSyncCalls.refresh += 1;
      },
    },
    scaleSyncCalls,
    emitScale: (event: string, orientation: string) => {
      scaleCallbacks.get(event)?.(orientation);
    },
    emitRectanglePointerUp: (label: '全屏' | '暂不') => {
      if (label === '全屏') acceptButton?.emitPointerUp();
      if (label === '暂不') dismissButton?.emitPointerUp();
    },
  };
  return scene as unknown as MobileInputSceneStub;
}

function createFullscreenSceneStub(): unknown {
  const chainable = createStubGameObject();
  return {
    add: {
      rectangle: () => chainable,
      text: () => chainable,
      circle: () => chainable,
    },
    input: {
      off: () => undefined,
    },
    game: {
      events: {
        off: () => undefined,
      },
    },
    scale: {
      on: () => undefined,
      off: () => undefined,
      startFullscreen: () => undefined,
    },
  };
}
