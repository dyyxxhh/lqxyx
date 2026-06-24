import { describe, expect, it, vi } from 'vitest';

// Mock Phaser before any imports that pull it in
vi.mock('phaser', () => {
  class Rectangle {
    x = 0;
    y = 0;
    width = 0;
    height = 0;
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
  const PhaserMath = {
    Distance: {
      Between(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      },
    },
  };
  return {
    default: { Geom: { Rectangle }, Math: PhaserMath },
  };
});

import { schoolMaps } from '../data/maps';
import { CLASSROOM_DESK_TARGET_HEIGHT, MapRenderer } from '../map/MapRenderer';
import { CollisionManager } from '../map/CollisionManager';
import { createInitialMapDebugState, setMapDebugState } from '../map/mapState';
import { createInitialSceneDebugState, GAME_HEIGHT, GAME_WIDTH } from '../game/scaffoldState';

function chainableObject(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const object: Record<string, unknown> = { ...extra };
  object.setOrigin = (x: number, y?: number) => {
    object.originX = x;
    object.originY = y;
    return object;
  };
  object.setDepth = (depth: number) => {
    object.depth = depth;
    return object;
  };
  object.setTileScale = (x: number, y: number) => {
    object.tileScaleX = x;
    object.tileScaleY = y;
    return object;
  };
  object.setStrokeStyle = (width: number, color: number, alpha = 1) => {
    object.strokeWidth = width;
    object.strokeColor = color;
    object.strokeAlpha = alpha;
    return object;
  };
  object.setInteractive = () => object;
  object.eventHandlers = new Map<string, () => void>();
  object.on = (event: string, handler: () => void) => {
    (object.eventHandlers as Map<string, () => void>).set(event, handler);
    return object;
  };
  object.destroy = () => undefined;
  return object;
}

function createMockScene() {
  const images: Record<string, unknown>[] = [];
  const tileSprites: Record<string, unknown>[] = [];
  const rectangles: Record<string, unknown>[] = [];
  const texts: Record<string, unknown>[] = [];
  const graphicsOps: Record<string, unknown>[] = [];
  const textureFrames = new Set<string>();
  const textureAdd = vi.fn((name: string) => {
    textureFrames.add(name);
    return { name };
  });

  return {
    images,
    tileSprites,
    rectangles,
    texts,
    graphicsOps,
    textureAdd,
    scene: {
      cameras: {
        main: {
          setBounds: vi.fn(),
          fadeOut: vi.fn(),
          fadeIn: vi.fn(),
          once: vi.fn(),
        },
      },
      textures: {
        exists: (key: string) => key === 'furniture.classroomDeskChairs' || key === 'floor.tile',
        get: (key: string) => {
          if (key !== 'floor.tile') throw new Error(`Unexpected texture key: ${key}`);
          return {
            has: (frame: string) => textureFrames.has(frame),
            add: textureAdd,
          };
        },
      },
      add: {
        tileSprite: vi.fn((x: number, y: number, width: number, height: number, key: string, frame?: string) => {
          const tileSprite = chainableObject({ x, y, width, height, key, frame });
          tileSprites.push(tileSprite);
          return tileSprite;
        }),
        rectangle: vi.fn((x: number, y: number, width: number, height: number, color?: number, alpha?: number) => {
          const rectangle = chainableObject({ x, y, width, height, color, alpha });
          rectangles.push(rectangle);
          return rectangle;
        }),
        circle: vi.fn(() => chainableObject()),
        text: vi.fn((x: number, y: number, text: string, style?: Record<string, unknown>) => {
          const textObject = chainableObject({ x, y, text, style });
          texts.push(textObject);
          return textObject;
        }),
        image: vi.fn((x: number, y: number, key: string, frame?: string) => {
          const image = chainableObject({ x, y, key, frame, width: 479, height: 603, scaleX: 1, scaleY: 1 });
          image.setScale = (scale: number) => {
            image.scaleX = scale;
            image.scaleY = scale;
            return image;
          };
          image.setDisplaySize = (displayWidth: number, displayHeight: number) => {
            image.displayWidth = displayWidth;
            image.displayHeight = displayHeight;
            return image;
          };
          images.push(image);
          return image;
        }),
        graphics: vi.fn(() => {
          const graphics = chainableObject();
          graphics.fillStyle = (color: number, alpha = 1) => {
            graphicsOps.push({ op: 'fillStyle', color, alpha });
            return graphics;
          };
          graphics.lineStyle = (width: number, color: number, alpha = 1) => {
            graphicsOps.push({ op: 'lineStyle', width, color, alpha });
            return graphics;
          };
          graphics.fillRect = (x: number, y: number, width: number, height: number) => {
            graphicsOps.push({ op: 'fillRect', x, y, width, height });
            return graphics;
          };
          graphics.fillRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
            graphicsOps.push({ op: 'fillRoundedRect', x, y, width, height, radius });
            return graphics;
          };
          graphics.strokeRect = (x: number, y: number, width: number, height: number) => {
            graphicsOps.push({ op: 'strokeRect', x, y, width, height });
            return graphics;
          };
          graphics.clear = () => graphics;
          return graphics;
        }),
      },
      time: { delayedCall: vi.fn() },
    },
  };
}

describe('map renderer', () => {
  const collision = new CollisionManager();

  // ── Map schema smoke ─────────────────────────────────────────

  it('map-renderer: schoolMaps has 4F and 5F corridors with doors and walkable bounds', () => {
    expect(Object.keys(schoolMaps.floors).sort()).toEqual(['4F', '5F']);

    for (const floor of Object.values(schoolMaps.floors)) {
      expect(floor.corridor.doors.length).toBeGreaterThan(0);
      expect(floor.corridor.walkableBounds.length).toBeGreaterThan(0);
      expect(floor.corridor.collisionZones.length).toBeGreaterThan(0);
    }
  });

  it('map-renderer: centers corridor walkable strip and spawn on the game midpoint', () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      const walkable = floor.corridor.walkableBounds[0];
      const centerSpawn = floor.corridor.spawnPoints.find((point) => point.id.endsWith('corridor-center'));

      expect(walkable).toBeDefined();
      expect(walkable!.x + walkable!.width / 2).toBe(GAME_WIDTH / 2);
      expect(centerSpawn?.x).toBe(GAME_WIDTH / 2);
    }
  });

  it('map-renderer: 4F left door labels match expected order', () => {
    const leftLabels = schoolMaps.floors['4F'].corridor.doors
      .filter((d) => d.side === 'left')
      .sort((a, b) => a.order - b.order)
      .map((d) => d.label);

    expect(leftLabels).toEqual([
      'GT2前门',
      'GT2后门',
      'GT1前门',
      'GT1后门',
      '高一一班前门',
      '高一一班后门',
      '高一二班前门',
      '高一二班后门',
    ]);
  });

  it('map-renderer: left corridor labels render inside the floor strip instead of clipping off-screen', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderCorridor('4F');

    const gt2FrontLabel = mock.texts.find((text) => text.text === 'GT2前门');
    expect(gt2FrontLabel).toMatchObject({ x: 388, originX: 0 });
    expect(gt2FrontLabel?.x as number).toBeGreaterThan(380);
  });

  it('map-renderer: floor metadata uses one real tile from the 2x2 source image', () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      expect(floor.corridor.floorTile).toMatchObject({
        assetKey: 'floor.tile',
        tileWidth: 192,
        tileHeight: 192,
      });
    }
  });

  it('map-renderer: corridor floor is composed from full-width columns x many rows of 120x120 cropped tile images, matching classroom scale', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderCorridor('4F');

    const floorImages = mock.images.filter((image) => image.key === 'floor.tile');
    expect(mock.tileSprites).toHaveLength(0);
    expect(floorImages.length).toBeGreaterThan(1);
    expect(floorImages.length).toBe(Math.ceil(1280 / 120) * Math.ceil(1920 / 120));
    expect(floorImages[0]).toMatchObject({
      key: 'floor.tile',
      frame: 'single-floor-tile-192',
      displayWidth: 120,
      displayHeight: 120,
    });
    const floorLeftEdge = Math.min(...floorImages.map((image) => (image.x as number) - (image.displayWidth as number) / 2));
    const floorRightEdge = Math.max(...floorImages.map((image) => (image.x as number) + (image.displayWidth as number) / 2));
    expect(floorLeftEdge).toBeLessThanOrEqual(0);
    expect(floorRightEdge).toBeGreaterThanOrEqual(1280);
    expect(mock.textureAdd).toHaveBeenCalledWith('single-floor-tile-192', 0, 192, 0, 192, 192);
  });

  it('map-renderer: room floor is composed from fixed 120x120 cropped tile images, not one tileSprite fill', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    const floorImages = mock.images.filter((image) => image.key === 'floor.tile');
    expect(mock.tileSprites).toHaveLength(0);
    expect(floorImages.length).toBeGreaterThan(1);
    expect(floorImages.length).toBe(8 * 11);
    expect(floorImages.every((image) => image.frame === 'single-floor-tile-192')).toBe(true);
    expect(floorImages.every((image) => image.displayWidth === 120 && image.displayHeight === 120)).toBe(true);
  });

  it('map-renderer: classroom render bounds and floor tiles fill the 1280x720 viewport without clipping tall room data', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt1-classroom');

    const lastSetBoundsCall = mock.scene.cameras.main.setBounds.mock.calls[mock.scene.cameras.main.setBounds.mock.calls.length - 1] ?? [];
    const [x, y, width, height] = lastSetBoundsCall;
    expect(width).toBeGreaterThanOrEqual(GAME_WIDTH);
    expect(height).toBeGreaterThanOrEqual(GAME_HEIGHT);
    expect((x as number) + (width as number) / 2).toBeCloseTo(480, 5);
    expect((y as number) + (height as number) / 2).toBeCloseTo(640, 5);

    const floorImages = mock.images.filter((image) => image.key === 'floor.tile');
    expect(floorImages.length).toBe(8 * 11);
    expect(floorImages.every((image) => (image.x as number) <= 960)).toBe(true);
  });

  it('map-renderer: corridor doors are vertical wall-overlap bars, not horizontal cross-corridor bars', () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      for (const door of floor.corridor.doors) {
        expect(door.bounds.height).toBeGreaterThan(door.bounds.width);
        if (door.side === 'left') {
          expect(door.bounds.x + door.bounds.width).toBeLessThanOrEqual(floor.corridor.walkableBounds[0]!.x);
        }
        if (door.side === 'right') {
          expect(door.bounds.x).toBeGreaterThanOrEqual(floor.corridor.walkableBounds[0]!.x + floor.corridor.walkableBounds[0]!.width);
        }
      }
    }
  });

  it('map-renderer: 5F left background doors stay non-interactive while principal office is a room door', () => {
    const fiveLeft = schoolMaps.floors['5F'].corridor.doors.filter(
      (d) => d.side === 'left',
    );
    const backgroundDoors = fiveLeft.filter((door) => door.kind === 'backgroundDoor');
    const principalDoor = fiveLeft.find((door) => door.id === 'principals-office-front-5f');

    expect(backgroundDoors).toHaveLength(8);
    for (const door of backgroundDoors) {
      expect(door.interaction.type).toBe('none');
      expect(door.roomId).toBeUndefined();
    }
    expect(principalDoor).toEqual(expect.objectContaining({
      kind: 'roomDoor',
      roomId: 'principals-office-5f',
      order: 9,
    }));
  });

  it('map-renderer: 5F has communication-control back door + elevator, NO office front door', () => {
    const fifthDoors = schoolMaps.floors['5F'].corridor.doors;

    expect(fifthDoors.filter((d) => d.label.includes('办公室前门'))).toEqual([]);
    expect(
      fifthDoors.filter((d) => d.roomId === 'communication-control-5f').map((d) => d.label),
    ).toEqual(['学校通信控制室后门']);

    const elevator = fifthDoors.find((d) => d.kind === 'elevator');
    expect(elevator).toBeDefined();
    expect(elevator!.interaction.type).toBe('elevator');
  });

  it('map-renderer: tryInteract reports room doors through callback without rendering room directly', () => {
    const mock = createMockScene();
    const onDoorInteraction = vi.fn();
    const renderer = new MapRenderer(mock.scene as never, '4F', onDoorInteraction);
    const gt1FrontDoor = schoolMaps.floors['4F'].corridor.doors.find((door) => door.id === '4f-gt1-front')!;

    renderer.renderCorridor('4F');
    const interacted = renderer.tryInteract(
      gt1FrontDoor.bounds.x + gt1FrontDoor.bounds.width / 2,
      gt1FrontDoor.bounds.y + gt1FrontDoor.bounds.height / 2,
    );

    expect(interacted).toBe(true);
    expect(onDoorInteraction).toHaveBeenCalledTimes(1);
    expect(onDoorInteraction).toHaveBeenCalledWith(expect.objectContaining({
      id: '4f-gt1-front',
      interaction: {
        type: 'roomTransition',
        targetRoomId: 'gt1-classroom',
        spawnPointId: 'gt1-front-entry',
      },
    }));
    expect(setMapDebugState({}).currentRoomId).toBeNull();
  });

  it('map-renderer: room-door pointerdown is intentionally unbound — interaction is F-key only', () => {
    const mock = createMockScene();
    const onDoorInteraction = vi.fn();
    const renderer = new MapRenderer(mock.scene as never, '4F', onDoorInteraction);
    const gt1FrontDoor = schoolMaps.floors['4F'].corridor.doors.find((door) => door.id === '4f-gt1-front')!;

    renderer.renderCorridor('4F');
    const gt1FrontHitArea = mock.rectangles.find(
      (rectangle) => rectangle.x === gt1FrontDoor.bounds.x + gt1FrontDoor.bounds.width / 2 && rectangle.y === gt1FrontDoor.bounds.y + gt1FrontDoor.bounds.height / 2,
    );

    expect(gt1FrontHitArea).toBeDefined();
    const pointerDownHandler = (gt1FrontHitArea!.eventHandlers as Map<string, () => void>).get('pointerdown');
    expect(pointerDownHandler).toBeUndefined();

    // Even invoking the (absent) handler must not produce a callback.
    pointerDownHandler?.();
    expect(onDoorInteraction).not.toHaveBeenCalled();
    expect(setMapDebugState({}).currentRoomId).toBeNull();
  });

  it('map-renderer: elevator doors on both floors have interaction.type === "elevator"', () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      const elevator = floor.corridor.doors.find((d) => d.kind === 'elevator');
      expect(elevator).toBeDefined();
      expect(elevator!.interaction.type).toBe('elevator');
    }
  });

  it('map-renderer: corridor render context excludes roomOnly; room render excludes corridorOnly', () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      expect(floor.renderContexts.corridor.includeEntityScopes).toContain('corridorOnly');
      expect(floor.renderContexts.corridor.excludeEntityScopes).toContain('roomOnly');

      expect(floor.renderContexts.rooms.includeEntityScopes).toEqual(['roomOnly']);
      expect(floor.renderContexts.rooms.excludeEntityScopes).toContain('corridorOnly');
    }
  });

  // ── CollisionManager ─────────────────────────────────────────

  it('map-renderer: CollisionManager.getFurnitureCollisions returns empty array (chairs/desks are pass-through)', () => {
    const collisions = collision.getFurnitureCollisions('gt2-classroom');

    expect(collisions).toEqual([]);
  });

  it('map-renderer: classroom desk/chair visual height is about one third of character height', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    const desks = mock.images.filter((image) => image.key === 'furniture.classroomDeskChairs');
    expect(desks.length).toBeGreaterThanOrEqual(2);
    for (const desk of desks) {
      expect(CLASSROOM_DESK_TARGET_HEIGHT).toBeGreaterThanOrEqual(44);
      expect(CLASSROOM_DESK_TARGET_HEIGHT).toBeLessThanOrEqual(52);
      expect((desk.height as number) * (desk.scaleY as number)).toBeCloseTo(CLASSROOM_DESK_TARGET_HEIGHT, 5);
    }
  });

  it('map-renderer: furniture collisions are empty (chairs/desks are pass-through)', () => {
    const lowerCollisions = collision.getFurnitureCollisions('gt2-classroom');

    expect(lowerCollisions).toEqual([]);
  });

  it('map-renderer: communication control room renders a visible steel device', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '5F');

    renderer.renderRoom('communication-control-5f');

    expect(mock.graphicsOps).toContainEqual({ op: 'fillStyle', color: 0x8f9aa3, alpha: 1 });
    expect(
      mock.graphicsOps.some(
        (op) => op.op === 'fillRoundedRect' && op.width === 96 && op.height === 72,
      ),
    ).toBe(true);
  });

  it('map-renderer: CollisionManager.isWalkable returns false inside collision zones', () => {
    expect(collision.isWalkable(50, 500, '4F')).toBe(false);
    expect(collision.isWalkable(400, 500, '4F')).toBe(true);
    expect(collision.isWalkable(960, 500, '4F')).toBe(false);
  });

  it('map-renderer: CollisionManager.getCorridorBounds returns full corridor rectangle', () => {
    const bounds = collision.getCorridorBounds('4F');
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(1920);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
  });

  it('map-renderer: CollisionManager.getWalkableBounds covers walkable zone for both floors', () => {
    for (const floorId of ['4F', '5F'] as const) {
      const bounds = collision.getWalkableBounds(floorId);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    }
  });

  it('map-renderer: CollisionManager.getRoomWalkableBounds aligns classroom walking area with visible 12px walls', () => {
    const bounds = collision.getRoomWalkableBounds('gt1-classroom');

    expect(bounds.x).toBe(12);
    expect(bounds.y).toBe(12);
    expect(bounds.width).toBe(936);
    expect(bounds.height).toBe(1256);
  });

  it('map-renderer: CollisionManager.isRoomWalkable removes classroom air walls while preserving visible wall collision', () => {
    expect(collision.isRoomWalkable(28, 28, 'gt1-classroom')).toBe(true);
    expect(collision.isRoomWalkable(8, 28, 'gt1-classroom')).toBe(false);
    expect(collision.isRoomWalkable(100, 100, 'gt1-classroom')).toBe(true);
    expect(collision.isRoomWalkable(136, 216, 'gt1-classroom')).toBe(true);
  });

  // ── Map state ────────────────────────────────────────────────

  it('map-renderer: createInitialMapDebugState returns defaults with null floors', () => {
    // Reset window state for deterministic test
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_SCENE_STATE__ = undefined;
    }

    const state = createInitialMapDebugState();
    expect(state.currentFloorId).toBeNull();
    expect(state.currentRoomId).toBeNull();
    expect(state.elevatorTransitioning).toBe(false);
  });

  it('map-renderer: setMapDebugState updates scaffold state in place', () => {
    // Initialize the scene state first
    if (typeof window !== 'undefined') {
      const init = createInitialSceneDebugState();
      (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_SCENE_STATE__ = init;
    }

    setMapDebugState({ currentFloorId: '4F', elevatorTransitioning: true });
    const updated = setMapDebugState({ currentRoomId: 'gt2-classroom' });

    expect(updated.currentFloorId).toBe('4F');
    expect(updated.currentRoomId).toBe('gt2-classroom');
    expect(updated.elevatorTransitioning).toBe(true);
  });

  // ── Map tiling S3 ────────────────────────────────────────────

  it('map-renderer: classroom renders 8 columns x 11 rows of floor tiles for tall rooms', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    const floorImages = mock.images.filter((image) => image.key === 'floor.tile');
    expect(floorImages).toHaveLength(88);

    const xPositions = [...new Set(floorImages.map((img) => (img.x as number)))].sort((a, b) => a - b);
    expect(xPositions).toHaveLength(8);

    const yPositions = [...new Set(floorImages.map((img) => (img.y as number)))].sort((a, b) => a - b);
    expect(yPositions).toHaveLength(11);
  });

  it('map-renderer: corridor floor tiles cover full corridor bounds at classroom scale', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderCorridor('4F');

    const floorImages = mock.images.filter((image) => image.key === 'floor.tile');
    const xPositions = [...new Set(floorImages.map((img) => (img.x as number)))].sort((a, b) => a - b);
    expect(xPositions.length).toBeGreaterThan(5);

    const tileLeftEdges = floorImages.map((image) => (image.x as number) - 60);
    const tileRightEdges = floorImages.map((image) => (image.x as number) + 60);
    expect(Math.min(...tileLeftEdges)).toBeLessThanOrEqual(0);
    expect(Math.max(...tileRightEdges)).toBeGreaterThanOrEqual(1280);

    const yPositions = [...new Set(floorImages.map((img) => (img.y as number)))].sort((a, b) => a - b);
    expect(yPositions.length).toBeGreaterThan(1);
    expect(floorImages.every((image) => image.displayWidth === 120 && image.displayHeight === 120)).toBe(true);

    const leftDoorSurface = mock.rectangles.find(
      (rectangle) => rectangle.color === 0x1a171c && rectangle.x === 230 && rectangle.width === 300,
    );
    expect(leftDoorSurface).toMatchObject({
      x: 230,
      y: 960,
      width: 300,
      height: 1920,
      depth: 2,
    });
  });

  // ── Furniture border S3 ─────────────────────────────────────

  it('map-renderer: no strokeRect around furniture collision zones in room render', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('class-1-1');

    const strokeRects = mock.graphicsOps.filter((op) => op.op === 'strokeRect');
    expect(strokeRects).toHaveLength(0);
  });

  it('map-renderer: no legacy gold spawn circles are drawn in renderCorridor', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderCorridor('4F');

    expect(mock.scene.add.circle).not.toHaveBeenCalled();
  });

  it('map-renderer: no legacy gold spawn circles are drawn in renderRoom', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    expect(mock.scene.add.circle).not.toHaveBeenCalled();
  });

  it('map-renderer: phone cabinet interaction targets render prop.phoneCabinetFront instead of prop.phone', () => {
    const mock = createMockScene();
    mock.scene.textures.exists = (key: string) => key === 'floor.tile' || key === 'furniture.classroomDeskChairs' || key === 'prop.phoneCabinetFront' || key === 'prop.phone';
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    const cabinetImages = mock.images.filter((image) => image.key === 'prop.phoneCabinetFront');
    const phoneImages = mock.images.filter((image) => image.key === 'prop.phone');
    expect(cabinetImages).toHaveLength(1);
    expect(phoneImages).toHaveLength(0);
  });

  // ── In-room door S4 ─────────────────────────────────────────

  it('map-renderer: in-room doors render only plain right-side rectangles without labels or callouts', () => {
    const mock = createMockScene();
    const renderer = new MapRenderer(mock.scene as never, '4F');

    renderer.renderRoom('gt2-classroom');

    const doorSizedObjects = mock.rectangles.filter(
      (r) => (r.width as number) === 24 && (r.height as number) === 128 && r.color === 0x5c4221,
    );
    expect(doorSizedObjects).toHaveLength(2);
    expect(doorSizedObjects).toEqual([
      expect.objectContaining({ strokeColor: 0xa37435, strokeWidth: 2 }),
      expect.objectContaining({ strokeColor: 0xa37435, strokeWidth: 2 }),
    ]);
    expect(doorSizedObjects.map((door) => ({ x: door.x, y: door.y, width: door.width, height: door.height }))).toEqual([
      { x: 852, y: 144, width: 24, height: 128 },
      { x: 852, y: 1136, width: 24, height: 128 },
    ]);
    expect(mock.rectangles).not.toContainEqual(expect.objectContaining({ color: 0x00e5ff }));
    expect(mock.rectangles).not.toContainEqual(expect.objectContaining({ color: 0xff4fd8 }));
    expect(mock.rectangles).not.toContainEqual(expect.objectContaining({ color: 0xffff00 }));
    expect(mock.texts.map((text) => text.text)).not.toContain('前门');
    expect(mock.texts.map((text) => text.text)).not.toContain('后门');

    const room = schoolMaps.floors['4F'].rooms['gt2-classroom']!;
    for (const inRoomDoor of room.inRoomDoors) {
      const doorCenterX = inRoomDoor.bounds.x + inRoomDoor.bounds.width / 2;
      const doorCenterY = inRoomDoor.bounds.y + inRoomDoor.bounds.height / 2;
      const walkable = room.walkableBounds[0]!;
      expect(doorCenterX).toBeGreaterThanOrEqual(walkable.x);
      expect(doorCenterX).toBeLessThanOrEqual(walkable.x + walkable.width);
      expect(doorCenterY).toBeGreaterThanOrEqual(walkable.y);
      expect(doorCenterY).toBeLessThanOrEqual(walkable.y + walkable.height);
    }
  });

  it('map-renderer: elevator transition fallback clears stuck state when camera fade events never fire', () => {
    vi.useFakeTimers();
    try {
      if (typeof window !== 'undefined') {
        const init = createInitialSceneDebugState();
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_SCENE_STATE__ = init;
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__ = {
          lock: vi.fn(),
          unlock: vi.fn(),
        };
      }
      const mock = createMockScene();
      const renderer = new MapRenderer(mock.scene as never, '4F');

      renderer.startElevatorTransition('5F');
      expect(setMapDebugState({}).elevatorTransitioning).toBe(true);

      vi.advanceTimersByTime(1200);

      const state = setMapDebugState({});
      expect(state.currentFloorId).toBe('5F');
      expect(state.elevatorTransitioning).toBe(false);
      expect(mock.scene.cameras.main.fadeOut).toHaveBeenCalledWith(500, 0, 0, 0);
      expect(mock.scene.cameras.main.fadeIn).toHaveBeenCalledWith(500, 0, 0, 0);
    } finally {
      vi.useRealTimers();
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__YING_ZHONG_JIU_INPUT_MANAGER__ = undefined;
      }
    }
  });
});
