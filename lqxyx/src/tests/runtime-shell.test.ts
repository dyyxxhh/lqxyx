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
import { clearSaveState, createDefaultSaveState, exportSaveJson, importSaveJson, loadSaveState, saveSaveState, SAVE_STATE_SCHEMA_VERSION } from '../state/saveState';

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

  it('PlayScene branch panel exposes a prompt plus numbered touch-safe choices', () => {
    const objects: RuntimeMenuObject[] = [];
    const scene = Object.create(PlayScene.prototype) as {
      add: RuntimeMenuAdd;
      branchBg: RuntimeMenuObject | null;
      branchButtons: RuntimeMenuObject[];
      branchTexts: RuntimeMenuObject[];
      branchIds: string[];
      eventEngine: { selectBranch: (branchId: string) => void };
      buildBranchChoices: (branchIds: readonly string[]) => void;
      getBranchVisualDebugState: () => {
        prompt?: { text: string; bounds: { visible: boolean } };
        buttons: Array<{ bounds: { width: number; height: number } }>;
        labels: Array<{ text: string; bounds: { y: number; height: number } }>;
      };
    };
    scene.add = createRuntimeMenuAdd(objects);
    scene.branchBg = runtimeMenuObject({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: 600, height: 200 });
    scene.branchButtons = [];
    scene.branchTexts = [];
    scene.branchIds = [];
    scene.eventEngine = { selectBranch: vi.fn() };

    scene.buildBranchChoices(['A-1', 'A-2']);

    const visual = scene.getBranchVisualDebugState();
    expect(visual.prompt?.bounds.visible).toBe(true);
    expect(visual.prompt?.text.trim().length).toBeGreaterThan(0);
    expect(visual.labels.map((label) => label.text)).toEqual([
      expect.stringMatching(/^1[.、]/),
      expect.stringMatching(/^2[.、]/),
    ]);
    expect(visual.buttons.every((button) => button.bounds.width >= 44 && button.bounds.height >= 44)).toBe(true);
    expect(visual.labels[0]!.bounds.y + visual.labels[0]!.bounds.height).toBeLessThanOrEqual(visual.labels[1]!.bounds.y);
  }, 15_000);

  it('PlayScene refreshes story entities after replay state advances in the same frame', () => {
    const calls: string[] = [];
    const scene = Object.create(PlayScene.prototype) as {
      inputManager: { update: () => void };
      eventEngine: { updatePlayerPosition: (position: { x: number; y: number }) => void; update: (delta: number) => void };
      cameras: { main: { centerOn: (x: number, y: number) => void } };
      playerPosition: { x: number; y: number };
      endingActive: boolean;
      blackOverlay: null;
      updateYangYunReplay: (time: number, delta: number) => void;
      refreshStoryEntities: () => void;
      update: (time: number, delta: number) => void;
    };
    scene.inputManager = { update: vi.fn() };
    scene.eventEngine = { updatePlayerPosition: vi.fn(), update: vi.fn() };
    scene.cameras = { main: { centerOn: vi.fn() } };
    scene.playerPosition = { x: 100, y: 200 };
    scene.endingActive = true;
    scene.blackOverlay = null;
    scene.updateYangYunReplay = vi.fn(() => calls.push('replay'));
    scene.refreshStoryEntities = vi.fn(() => calls.push('entities'));

    scene.update(1_000, 16);

    expect(calls).toEqual(['replay', 'entities']);
  }, 15_000);

  it('PlayScene allows elevator transitions during the 30s survival wait', () => {
    const scene = Object.create(PlayScene.prototype) as {
      mapRenderer: { startElevatorTransition: (floorId: string, complete: () => void) => void };
      currentFloor: string;
      currentRoom: string | null;
      inRoom: boolean;
      eventEngine: {
        getCurrentState: () => string;
        hasRunningTimer: (timerId: string) => boolean;
        updateLocation: (floorId: string, roomId: string | null) => void;
        updatePlayerPosition: (position: { x: number; y: number }) => void;
        attemptBlockedDoor: (doorId: string) => boolean;
        isInteractionTargetInCurrentLocation: () => boolean;
      };
      playerSprite: { setPosition: (x: number, y: number) => void };
      playerPosition: { x: number; y: number };
      currentDirection: string;
      syncCharacterDebugState: () => void;
      refreshStoryEntities: () => void;
      handleDoorInteraction: (door: {
        id: string;
        floorId: string;
        side: string;
        bounds: { x: number; y: number; width: number; height: number };
        interaction: { type: 'elevator'; targetFloorId: '5F' };
      }) => boolean;
    };
    scene.mapRenderer = { startElevatorTransition: vi.fn((_floorId: string, complete: () => void) => complete()) };
    scene.currentFloor = '4F';
    scene.currentRoom = null;
    scene.inRoom = false;
    scene.eventEngine = {
      getCurrentState: vi.fn(() => 'waiting'),
      hasRunningTimer: vi.fn((timerId: string) => timerId === 'survival-ending-countdown'),
      updateLocation: vi.fn(),
      updatePlayerPosition: vi.fn(),
      attemptBlockedDoor: vi.fn(() => false),
      isInteractionTargetInCurrentLocation: vi.fn(() => false),
    };
    scene.playerSprite = { setPosition: vi.fn() };
    scene.playerPosition = { x: 520, y: 920 };
    scene.currentDirection = 'down';
    scene.syncCharacterDebugState = vi.fn();
    scene.refreshStoryEntities = vi.fn();

    expect(scene.handleDoorInteraction({
      id: '4f-elevator',
      floorId: '4F',
      side: 'right',
      bounds: { x: 500, y: 880, width: 40, height: 120 },
      interaction: { type: 'elevator', targetFloorId: '5F' },
    })).toBe(true);

    expect(scene.mapRenderer.startElevatorTransition).toHaveBeenCalledWith('5F', expect.any(Function));
    expect(scene.eventEngine.updateLocation).toHaveBeenCalledWith('5F', null);
    expect(scene.refreshStoryEntities).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('PlayScene refreshes story entities immediately after switchView changes rooms', () => {
    const calls: string[] = [];
    const scene = Object.create(PlayScene.prototype) as {
      mapRenderer: { renderRoom: (roomId: string) => void; renderCorridor: (floorId: string) => void };
      currentFloor: string;
      currentRoom: string | null;
      inRoom: boolean;
      eventEngine: { updateLocation: (floorId: string, roomId: string | null) => void; updatePlayerPosition: (position: { x: number; y: number }) => void };
      playerPosition: { x: number; y: number };
      playerSprite: { setPosition: (x: number, y: number) => void; setTexture: (key: string) => void };
      currentDirection: string;
      currentCharacter: 'yangYunRed';
      textures: { exists: (key: string) => boolean };
      activeTextureKey: string | null;
      syncCharacterDebugState: () => void;
      refreshStoryEntities: () => void;
      handleSwitchView: (floorId: '4F', roomId: 'gt2-classroom', position?: { x: number; y: number }, facing?: 'left') => void;
    };
    scene.mapRenderer = {
      renderRoom: vi.fn((roomId: string) => calls.push(`render:${roomId}`)),
      renderCorridor: vi.fn((floorId: string) => calls.push(`render:${floorId}`)),
    };
    scene.currentFloor = '4F';
    scene.currentRoom = 'gt1-classroom';
    scene.inRoom = true;
    scene.eventEngine = {
      updateLocation: vi.fn((floorId: string, roomId: string | null) => calls.push(`location:${floorId}:${roomId ?? 'corridor'}`)),
      updatePlayerPosition: vi.fn(),
    };
    scene.playerPosition = { x: 760, y: 520 };
    scene.playerSprite = { setPosition: vi.fn(), setTexture: vi.fn() };
    scene.currentDirection = 'down';
    scene.currentCharacter = 'yangYunRed';
    scene.textures = { exists: vi.fn(() => true) };
    scene.activeTextureKey = null;
    scene.syncCharacterDebugState = vi.fn();
    scene.refreshStoryEntities = vi.fn(() => calls.push(`entities:${scene.currentRoom ?? 'corridor'}`));

    scene.handleSwitchView('4F', 'gt2-classroom', { x: 772, y: 144 }, 'left');

    expect(calls).toEqual([
      'render:gt2-classroom',
      'location:4F:gt2-classroom',
      'entities:gt2-classroom',
    ]);
  }, 15_000);

  it('GameScene settings can export and import full JSON save files from the menu', () => {
    resetSceneDebugState();
    localStorage.clear();
    const scene = Object.create(GameScene.prototype) as {
      saveCodeStatusText: { setText: (text: string) => void } | null;
      continueButton: unknown | null;
      createContinueButton: () => void;
      showExportSaveCode: () => void;
      showImportSaveCode: () => void;
    };
    const statusText = { setText: vi.fn() };
    scene.saveCodeStatusText = statusText;
    scene.continueButton = null;
    scene.createContinueButton = vi.fn(() => { scene.continueButton = {}; });
    const savedPrompt = window.prompt;
    const prompt = vi.fn((_message: string, value?: string) => value ?? null);
    window.prompt = prompt;
    const state = {
      ...createDefaultSaveState(),
      checkpointId: 'H' as const,
      floorId: '5F' as const,
      roomId: 'communication-control-5f' as const,
      position: { x: 620, y: 240, facing: 'up' as const },
      controllableCharacterId: 'dongJihao' as const,
      task: '自定义完整存档',
      storyFlags: { communicationDisabled: true, yangYunReplaysB2Actions: true, yangYunAutoTracksAfterReplay: true },
      branchChoices: { 'B-2': 'selected' as const },
      timers: { 'survival-route-countdown': { status: 'running' as const, durationMs: 120_000, remainingMs: 72_000 } },
      inventory: ['borrowed-phone'],
      pickups: { danYuxuanHead: true, qinHaoruiHead: false },
      triggeredEvents: ['checkpoint-H', 'yang-yun-replay-started'],
    };
    saveSaveState(state);

    scene.showExportSaveCode();
    const exported = exportSaveJson();
    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') {
      clearSaveState();
      prompt.mockReturnValueOnce(exported.json);
      scene.showImportSaveCode();
    }

    expect(prompt).toHaveBeenCalledWith('复制 JSON 存档', expect.stringContaining('"timers"'));
    expect(prompt).toHaveBeenCalledWith('粘贴 JSON 存档', '');
    expect(scene.createContinueButton).toHaveBeenCalledTimes(1);
    expect(statusText.setText).toHaveBeenLastCalledWith('导入成功');
    const imported = loadSaveState();
    expect(imported.status).toBe('valid');
    expect(imported.status === 'valid' ? imported.state.checkpointId : null).toBe('H');
    expect(imported.status === 'valid' ? imported.state.task : null).toBe('自定义完整存档');
    expect(imported.status === 'valid' ? imported.state.timers['survival-route-countdown']?.remainingMs : null).toBe(72_000);
    expect(imported.status === 'valid' ? imported.state.triggeredEvents : null).toContain('yang-yun-replay-started');
    window.prompt = savedPrompt;
  }, 15_000);

  it('GameScene completed save import replaces the existing enabled continue affordance', () => {
    resetSceneDebugState();
    localStorage.clear();
    const objects: RuntimeMenuObject[] = [];
    const scene = Object.create(GameScene.prototype) as {
      add: RuntimeMenuAdd;
      saveCodeStatusText: { setText: (text: string) => void } | null;
      continueButton: unknown | null;
      continueAvailable: boolean;
      createContinueButton: () => void;
      showImportSaveCode: () => void;
    };
    scene.add = createRuntimeMenuAdd(objects);
    const statusText = { setText: vi.fn() };
    scene.saveCodeStatusText = statusText;
    scene.continueButton = null;
    scene.continueAvailable = false;
    const savedPrompt = window.prompt;
    const completedJson = exportJsonForState({
      ...createDefaultSaveState(),
      checkpointId: 'I',
      triggeredEvents: ['ending-survival-false-report'],
    });
    window.prompt = vi.fn(() => completedJson);

    scene.createContinueButton();
    scene.continueAvailable = true;
    scene.showImportSaveCode();

    expect(liveCompletedAffordanceTexts(objects)).toEqual(['第一幕已完成', '敬请期待']);
    expect(liveContinueAffordanceTexts(objects)).toEqual(['敬请期待']);
    expect(liveContinueAffordanceRectangles(objects)).toHaveLength(1);
    expect(liveContinueAffordanceRectangles(objects).some((object) => object.interactive)).toBe(false);
    expect(scene.continueAvailable).toBe(false);
    expect(statusText.setText).toHaveBeenLastCalledWith('导入成功');
    window.prompt = savedPrompt;
  }, 15_000);

  it('GameScene non-completed save import leaves one enabled continue affordance', () => {
    resetSceneDebugState();
    localStorage.clear();
    const objects: RuntimeMenuObject[] = [];
    const scene = Object.create(GameScene.prototype) as {
      add: RuntimeMenuAdd;
      saveCodeStatusText: { setText: (text: string) => void } | null;
      continueButton: unknown | null;
      continueAvailable: boolean;
      showImportSaveCode: () => void;
    };
    scene.add = createRuntimeMenuAdd(objects);
    const statusText = { setText: vi.fn() };
    scene.saveCodeStatusText = statusText;
    scene.continueButton = null;
    scene.continueAvailable = false;
    const savedPrompt = window.prompt;
    const normalJson = exportJsonForState({
      ...createDefaultSaveState(),
      checkpointId: 'H',
      task: '继续调查',
      triggeredEvents: ['checkpoint-H'],
    });
    window.prompt = vi.fn(() => normalJson);

    scene.showImportSaveCode();

    expect(liveContinueAffordanceTexts(objects)).toEqual(['继续游戏']);
    expect(liveContinueAffordanceRectangles(objects)).toHaveLength(1);
    expect(liveContinueAffordanceRectangles(objects).filter((object) => object.interactive)).toHaveLength(1);
    expect(scene.continueAvailable).toBe(true);
    expect(statusText.setText).toHaveBeenLastCalledWith('导入成功');
    window.prompt = savedPrompt;
  }, 15_000);

  it('GameScene invalid save import keeps the existing continue affordance without duplication', () => {
    resetSceneDebugState();
    localStorage.clear();
    const objects: RuntimeMenuObject[] = [];
    const scene = Object.create(GameScene.prototype) as {
      add: RuntimeMenuAdd;
      saveCodeStatusText: { setText: (text: string) => void } | null;
      continueButton: unknown | null;
      continueAvailable: boolean;
      createContinueButton: () => void;
      showImportSaveCode: () => void;
    };
    scene.add = createRuntimeMenuAdd(objects);
    const statusText = { setText: vi.fn() };
    scene.saveCodeStatusText = statusText;
    scene.continueButton = null;
    scene.continueAvailable = true;
    const savedPrompt = window.prompt;
    window.prompt = vi.fn(() => '{not-json');

    scene.createContinueButton();
    scene.showImportSaveCode();

    expect(liveContinueAffordanceTexts(objects)).toEqual(['继续游戏']);
    expect(liveContinueAffordanceRectangles(objects)).toHaveLength(1);
    expect(liveContinueAffordanceRectangles(objects).filter((object) => object.interactive)).toHaveLength(1);
    expect(statusText.setText).toHaveBeenLastCalledWith('JSON 格式错误');
    window.prompt = savedPrompt;
  }, 15_000);

  it('JSON save import rejects malformed JSON without overwriting the current save', () => {
    localStorage.clear();
    const currentState = {
      ...createDefaultSaveState(),
      checkpointId: 'G' as const,
      task: '保留原存档',
    };
    saveSaveState(currentState);

    expect(importSaveJson('{not-json')).toEqual({ status: 'invalid-json' });

    const loaded = loadSaveState();
    expect(loaded.status).toBe('valid');
    expect(loaded.status === 'valid' ? loaded.state.task : null).toBe('保留原存档');
  });

  it('GameScene menu reserves space for a continue button before settings controls', () => {
    const scene = new GameScene() as unknown as {
      CONTINUE_Y: number;
      SETTINGS_TITLE_Y: number;
    };

    expect(scene.CONTINUE_Y + 36).toBeLessThan(scene.SETTINGS_TITLE_Y);
  }, 15_000);

  it('GameScene menu background overlay covers the full game viewport', () => {
    stubCanvasContext();
    resetSceneDebugState();
    const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];
    const makeRect = (x: number, y: number, width: number, height: number) => {
      rectangles.push({ x, y, width, height });
      return chainable({ x, y, width, height });
    };
    const scene = new GameScene() as unknown as GameScene & {
      add: { rectangle: typeof makeRect; text: (...args: unknown[]) => Record<string, unknown>; image: (...args: unknown[]) => Record<string, unknown>; graphics: () => Record<string, unknown> };
      cameras: { main: { setBounds: () => void } };
      events: { off: () => void; once: () => void };
      input: { keyboard: null };
      scene: { start: () => void; isActive: () => boolean };
      sys: { game: { device: { input: { touch: boolean } } }; scale: { gameSize: { width: number; height: number } } };
      textures: { exists: () => boolean };
    };
    scene.add = { rectangle: makeRect, text: () => chainable(), image: () => chainable(), graphics: () => chainable() };
    scene.cameras = { main: { setBounds: vi.fn() } };
    scene.events = { off: vi.fn(), once: vi.fn() };
    scene.input = { keyboard: null, on: vi.fn() } as never;
    scene.scene = { start: vi.fn(), isActive: vi.fn(() => true) };
    scene.sys = { game: { device: { input: { touch: false } } }, scale: { gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT } } };
    scene.textures = { exists: vi.fn(() => false) };

    scene.create();

    expect(rectangles).toContainEqual({ x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, width: GAME_WIDTH, height: GAME_HEIGHT });
  }, 15_000);

  it('GameScene completed save shows unclickable 敬请期待 instead of continue action', () => {
    stubCanvasContext();
    resetSceneDebugState();
    localStorage.clear();
    saveSaveState({
      ...createDefaultSaveState(),
      schemaVersion: SAVE_STATE_SCHEMA_VERSION,
      checkpointId: 'I',
      task: '活着',
      triggeredEvents: ['ending-survival-false-report'],
    });
    const labels: string[] = [];
    const startCalls = vi.fn();
    const scene = new GameScene() as unknown as GameScene & {
      add: { rectangle: (...args: unknown[]) => Record<string, unknown>; text: (_x: number, _y: number, text: string) => Record<string, unknown>; image: (...args: unknown[]) => Record<string, unknown>; graphics: () => Record<string, unknown> };
      cameras: { main: { setBounds: () => void } };
      events: { off: () => void; once: () => void };
      input: { keyboard: null; on: () => void };
      scene: { start: () => void; isActive: () => boolean };
      sys: { game: { device: { input: { touch: boolean } } }; scale: { gameSize: { width: number; height: number } } };
      textures: { exists: () => boolean };
    };
    scene.add = {
      rectangle: () => chainable(),
      text: (_x: number, _y: number, text: string) => { labels.push(text); return chainable(); },
      image: () => chainable(),
      graphics: () => chainable(),
    };
    scene.cameras = { main: { setBounds: vi.fn() } };
    scene.events = { off: vi.fn(), once: vi.fn() };
    scene.input = { keyboard: null, on: vi.fn() };
    scene.scene = { start: startCalls, isActive: vi.fn(() => true) };
    scene.sys = { game: { device: { input: { touch: false } } }, scale: { gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT } } };
    scene.textures = { exists: vi.fn(() => false) };

    scene.create();

    expect(labels).toContain('第一幕已完成');
    expect(labels).toContain('敬请期待');
    expect(labels).not.toContain('继续游戏');
    expect(startCalls).not.toHaveBeenCalledWith('PlayScene');
  }, 15_000);

  it('GameScene minor ending save still shows an enabled continue action', () => {
    stubCanvasContext();
    resetSceneDebugState();
    localStorage.clear();
    saveSaveState({
      ...createDefaultSaveState(),
      checkpointId: 'H',
      task: '去班里偷同学手机报警',
      triggeredEvents: ['checkpoint-H', 'ending-saozi'],
    });
    const labels: string[] = [];
    const scene = new GameScene() as unknown as GameScene & {
      add: { rectangle: (...args: unknown[]) => Record<string, unknown>; text: (_x: number, _y: number, text: string) => Record<string, unknown>; image: (...args: unknown[]) => Record<string, unknown>; graphics: () => Record<string, unknown> };
      cameras: { main: { setBounds: () => void } };
      events: { off: () => void; once: () => void };
      input: { keyboard: null; on: () => void };
      scene: { start: () => void; isActive: () => boolean };
      sys: { game: { device: { input: { touch: boolean } } }; scale: { gameSize: { width: number; height: number } } };
      textures: { exists: () => boolean };
      continueAvailable: boolean;
    };
    scene.add = {
      rectangle: () => chainable(),
      text: (_x: number, _y: number, text: string) => { labels.push(text); return chainable(); },
      image: () => chainable(),
      graphics: () => chainable(),
    };
    scene.cameras = { main: { setBounds: vi.fn() } };
    scene.events = { off: vi.fn(), once: vi.fn() };
    scene.input = { keyboard: null, on: vi.fn() };
    scene.scene = { start: vi.fn(), isActive: vi.fn(() => true) };
    scene.sys = { game: { device: { input: { touch: false } } }, scale: { gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT } } };
    scene.textures = { exists: vi.fn(() => false) };

    scene.create();

    expect(labels).toContain('继续游戏');
    expect(labels).not.toContain('第一幕已完成');
    expect(scene.continueAvailable).toBe(true);
  }, 15_000);
});

function chainable(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { ...extra };
  object.setOrigin = () => object;
  object.setDepth = () => object;
  object.setVisible = () => object;
  object.setInteractive = () => object;
  object.setScrollFactor = () => object;
  object.setStrokeStyle = () => object;
  object.setShadow = () => object;
  object.setText = () => object;
  object.setFillStyle = () => object;
  object.setDisplaySize = () => object;
  object.setScale = () => object;
  object.setTexture = () => object;
  object.fillStyle = () => object;
  object.fillRect = () => object;
  object.fillRoundedRect = () => object;
  object.lineStyle = () => object;
  object.strokeRect = () => object;
  object.clear = () => object;
  object.destroy = () => object;
  object.on ??= () => object;
  return object;
}

type RuntimeMenuObject = Record<string, unknown> & {
  destroyed: boolean;
  interactive: boolean;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

interface RuntimeMenuAdd {
  rectangle: (x: number, y: number, width: number, height: number) => RuntimeMenuObject;
  text: (x: number, y: number, text: string) => RuntimeMenuObject;
}

function createRuntimeMenuAdd(objects: RuntimeMenuObject[]): RuntimeMenuAdd {
  return {
    rectangle: (x: number, y: number, width: number, height: number) => {
      const object = runtimeMenuObject({ x, y, width, height });
      objects.push(object);
      return object;
    },
    text: (x: number, y: number, text: string) => {
      const object = runtimeMenuObject({ x, y, text });
      objects.push(object);
      return object;
    },
  };
}

function runtimeMenuObject(extra: Partial<RuntimeMenuObject>): RuntimeMenuObject {
  const object: RuntimeMenuObject = { ...extra, destroyed: false, interactive: false, visible: true };
  object.setOrigin = () => object;
  object.setDepth = () => object;
  object.setVisible = (visible: boolean) => { object.visible = visible; return object; };
  object.setInteractive = () => { object.interactive = true; return object; };
  object.setStrokeStyle = () => object;
  object.setShadow = () => object;
  object.setFillStyle = () => object;
  object.setScrollFactor = () => object;
  object.setSize = (width: number, height: number) => { object.width = width; object.height = height; return object; };
  object.setPosition = (x: number, y: number) => { object.x = x; object.y = y; return object; };
  object.on = () => object;
  object.destroy = () => { object.destroyed = true; return object; };
  object.getBounds = () => {
    const width = typeof object.width === 'number' ? object.width : typeof object.text === 'string' ? object.text.length * 20 : 0;
    const height = typeof object.height === 'number' ? object.height : typeof object.text === 'string' ? 28 : 0;
    const x = typeof object.x === 'number' ? object.x : 0;
    const y = typeof object.y === 'number' ? object.y : 0;
    return { x: x - width / 2, y: y - height / 2, width, height };
  };
  return object;
}

function liveContinueAffordanceTexts(objects: readonly RuntimeMenuObject[]): string[] {
  return objects
    .filter((object) => !object.destroyed && (object.text === '继续游戏' || object.text === '敬请期待'))
    .map((object) => object.text ?? '');
}

function liveCompletedAffordanceTexts(objects: readonly RuntimeMenuObject[]): string[] {
  return objects
    .filter((object) => !object.destroyed && (object.text === '第一幕已完成' || object.text === '敬请期待'))
    .map((object) => object.text ?? '');
}

function liveContinueAffordanceRectangles(objects: readonly RuntimeMenuObject[]): RuntimeMenuObject[] {
  return objects.filter((object) => !object.destroyed && object.width === 360 && object.height === 72);
}

function exportJsonForState(state: ReturnType<typeof createDefaultSaveState>): string {
  saveSaveState(state);
  const exported = exportSaveJson();
  if (exported.status !== 'exported') {
    throw new Error('Expected exportable save state');
  }
  clearSaveState();
  return exported.json;
}

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
