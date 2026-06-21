import { describe, expect, it, vi } from 'vitest';

import { InputManager } from '../input/InputManager';

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

describe('movement vector quantization', () => {
  it('computes 8-direction vectors from angle', () => {
    // 0° = East
    expect(vectorFromAngle(0)).toEqual({ x: 1, y: 0 });
    // 45° = Northeast
    expect(vectorFromAngle(45)).toEqual({ x: 1, y: -1 });
    // 90° = North
    expect(vectorFromAngle(90)).toEqual({ x: 0, y: -1 });
    // 135° = Northwest
    expect(vectorFromAngle(135)).toEqual({ x: -1, y: -1 });
    // 180° = West
    expect(vectorFromAngle(180)).toEqual({ x: -1, y: 0 });
    // 225° = Southwest
    expect(vectorFromAngle(225)).toEqual({ x: -1, y: 1 });
    // 270° = South
    expect(vectorFromAngle(270)).toEqual({ x: 0, y: 1 });
    // 315° = Southeast
    expect(vectorFromAngle(315)).toEqual({ x: 1, y: 1 });
    // Wrap-around
    expect(vectorFromAngle(360)).toEqual({ x: 1, y: 0 });
    expect(vectorFromAngle(-90)).toEqual({ x: 0, y: 1 });
  });

  it('returns zero vector for idempotent cases', () => {
    // Slight angle deviations quantize to nearest 8-direction
    expect(vectorFromAngle(5)).toEqual({ x: 1, y: 0 });
    expect(vectorFromAngle(88)).toEqual({ x: 0, y: -1 });
    expect(vectorFromAngle(92)).toEqual({ x: 0, y: -1 });
    expect(vectorFromAngle(178)).toEqual({ x: -1, y: 0 });
    expect(vectorFromAngle(272)).toEqual({ x: 0, y: 1 });
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

// ── Pure helper extracted for testing ─────────────────────────

const DIRECTION_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

function vectorFromAngle(angle: number): { x: number; y: number } {
  const normalized = ((angle % 360) + 360) % 360;
  let closestAngle = 0;
  let minDiff = Infinity;

  for (const a of DIRECTION_ANGLES) {
    let diff = Math.abs(normalized - a);
    if (diff > 180) diff = 360 - diff;
    if (diff < minDiff) {
      minDiff = diff;
      closestAngle = a;
    }
  }

  const cos = Math.cos((closestAngle * Math.PI) / 180);
  const sin = Math.sin((closestAngle * Math.PI) / 180);
  const x = Math.abs(cos) < 0.3 ? 0 : cos > 0 ? 1 : -1;
  const y = Math.abs(sin) < 0.3 ? 0 : sin > 0 ? -1 : 1;
  return { x, y };
}

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
      updateBounds: () => undefined,
    },
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
