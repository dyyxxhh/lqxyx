export type FloorId = "4F" | "5F";
export type AreaKind = "corridor" | "classroom" | "office" | "communicationControl";
export type EntityScope = "corridorOnly" | "roomOnly" | "sharedDoorSurface";

export type RoomId =
  | "gt2-classroom"
  | "gt1-classroom"
  | "class-1-1"
  | "class-1-2"
  | "office-4f"
  | "communication-control-5f";

export type DoorId =
  | "4f-gt2-front"
  | "4f-gt2-back"
  | "4f-gt1-front"
  | "4f-gt1-back"
  | "4f-class-1-1-front"
  | "4f-class-1-1-back"
  | "4f-class-1-2-front"
  | "4f-class-1-2-back"
  | "4f-office-front"
  | "4f-office-back"
  | "4f-elevator"
  | "5f-background-class-1-front"
  | "5f-background-class-1-back"
  | "5f-background-class-2-front"
  | "5f-background-class-2-back"
  | "5f-communication-control-back"
  | "5f-elevator";

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapRectangle extends MapPoint {
  width: number;
  height: number;
}

export interface SpawnPoint extends MapPoint {
  id: string;
  facing: "up" | "down" | "left" | "right";
}

export interface DoorRenderMetadata {
  assetKey: "doors.wallWoodBars";
  material: "wood";
  color: "#8b5a2b";
  shape: "horizontalBar";
  thickness: number;
}

export type DoorInteraction =
  | { type: "roomTransition"; targetRoomId: RoomId; spawnPointId: string }
  | { type: "elevator"; targetFloorId: FloorId }
  | { type: "none" };

export interface CorridorDoor {
  id: DoorId;
  label: string;
  floorId: FloorId;
  side: "left" | "right";
  order: number;
  kind: "roomDoor" | "elevator" | "backgroundDoor";
  bounds: MapRectangle;
  visible: true;
  entityScope: "sharedDoorSurface";
  render: DoorRenderMetadata;
  interaction: DoorInteraction;
  roomId?: RoomId;
  storyTargetId?: string;
}

export interface FloorTileMetadata {
  assetKey: "floor.tile";
  tileWidth: number;
  tileHeight: number;
}

export interface MapArea {
  id: string;
  label: string;
  floorId: FloorId;
  kind: AreaKind;
  entityScope: EntityScope;
  bounds: MapRectangle;
  walkableBounds: MapRectangle[];
  collisionZones: MapRectangle[];
  occlusionZones: MapRectangle[];
  spawnPoints: SpawnPoint[];
  floorTile: FloorTileMetadata;
}

export interface CorridorArea extends MapArea {
  kind: "corridor";
  entityScope: "corridorOnly";
  doors: CorridorDoor[];
}

export interface RoomArea extends MapArea {
  id: RoomId;
  kind: Exclude<AreaKind, "corridor">;
  entityScope: "roomOnly";
  entryDoorIds: DoorId[];
}

export interface RenderContextBoundary {
  id: string;
  includeEntityScopes: EntityScope[];
  excludeEntityScopes: EntityScope[];
  entityIds: string[];
}

export interface FloorMap {
  id: FloorId;
  label: string;
  corridor: CorridorArea;
  rooms: Partial<Record<RoomId, RoomArea>>;
  renderContexts: {
    corridor: RenderContextBoundary;
    rooms: RenderContextBoundary;
  };
}

export interface SchoolMapManifest {
  id: "ying-zhong-jiu-school";
  coordinateSystem: {
    origin: "top-left";
    unit: "design-pixel-placeholder";
    sourceReference: "design-corridor-image";
  };
  floors: Record<FloorId, FloorMap>;
}

const doorRender: DoorRenderMetadata = {
  assetKey: "doors.wallWoodBars",
  material: "wood",
  color: "#8b5a2b",
  shape: "horizontalBar",
  thickness: 10,
};

const floorTile: FloorTileMetadata = {
  assetKey: "floor.tile",
  tileWidth: 64,
  tileHeight: 64,
};

function rect(x: number, y: number, width: number, height: number): MapRectangle {
  return { x, y, width, height };
}

function spawn(id: string, x: number, y: number, facing: SpawnPoint["facing"]): SpawnPoint {
  return { id, x, y, facing };
}

function roomDoor(
  id: DoorId,
  label: string,
  floorId: FloorId,
  side: CorridorDoor["side"],
  order: number,
  bounds: MapRectangle,
  roomId: RoomId,
  spawnPointId: string,
  storyTargetId?: string,
): CorridorDoor {
  return {
    id,
    label,
    floorId,
    side,
    order,
    kind: "roomDoor",
    bounds,
    visible: true,
    entityScope: "sharedDoorSurface",
    render: doorRender,
    interaction: { type: "roomTransition", targetRoomId: roomId, spawnPointId },
    roomId,
    ...(storyTargetId ? { storyTargetId } : {}),
  };
}

function backgroundDoor(
  id: DoorId,
  label: string,
  floorId: FloorId,
  order: number,
  bounds: MapRectangle,
): CorridorDoor {
  return {
    id,
    label,
    floorId,
    side: "left",
    order,
    kind: "backgroundDoor",
    bounds,
    visible: true,
    entityScope: "sharedDoorSurface",
    render: doorRender,
    interaction: { type: "none" },
  };
}

function elevatorDoor(id: DoorId, floorId: FloorId, targetFloorId: FloorId, order: number, bounds: MapRectangle): CorridorDoor {
  return {
    id,
    label: "电梯",
    floorId,
    side: "right",
    order,
    kind: "elevator",
    bounds,
    visible: true,
    entityScope: "sharedDoorSurface",
    render: doorRender,
    interaction: { type: "elevator", targetFloorId },
  };
}

function room(
  id: RoomId,
  label: string,
  floorId: FloorId,
  kind: RoomArea["kind"],
  entryDoorIds: DoorId[],
  spawnPoints: SpawnPoint[],
): RoomArea {
  return {
    id,
    label,
    floorId,
    kind,
    entityScope: "roomOnly",
    bounds: rect(0, 0, 960, 540),
    walkableBounds: [rect(96, 96, 768, 360)],
    collisionZones: [rect(128, 128, 192, 96), rect(512, 128, 192, 96)],
    occlusionZones: [rect(128, 96, 192, 48), rect(512, 96, 192, 48)],
    spawnPoints,
    floorTile,
    entryDoorIds,
  };
}

const corridorBounds = rect(0, 0, 1280, 1920);
const corridorWalkable = [rect(300, 80, 520, 1760)];
const corridorCollision = [rect(0, 0, 260, 1920), rect(860, 0, 420, 1920), rect(260, 0, 600, 56), rect(260, 1864, 600, 56)];
const corridorOcclusion = [rect(260, 0, 600, 96), rect(260, 1824, 600, 96)];

const fourthFloorLeftDoors: CorridorDoor[] = [
  roomDoor("4f-gt2-front", "GT2前门", "4F", "left", 1, rect(240, 180, 128, 24), "gt2-classroom", "gt2-front-entry", "GT2 classroom front door"),
  roomDoor("4f-gt2-back", "GT2后门", "4F", "left", 2, rect(240, 320, 128, 24), "gt2-classroom", "gt2-back-entry"),
  roomDoor("4f-gt1-front", "GT1前门", "4F", "left", 3, rect(240, 520, 128, 24), "gt1-classroom", "gt1-front-entry", "GT1 classroom front door"),
  roomDoor("4f-gt1-back", "GT1后门", "4F", "left", 4, rect(240, 660, 128, 24), "gt1-classroom", "gt1-back-entry"),
  roomDoor("4f-class-1-1-front", "高一一班前门", "4F", "left", 5, rect(240, 900, 128, 24), "class-1-1", "class-1-1-front-entry"),
  roomDoor("4f-class-1-1-back", "高一一班后门", "4F", "left", 6, rect(240, 1040, 128, 24), "class-1-1", "class-1-1-back-entry"),
  roomDoor("4f-class-1-2-front", "高一二班前门", "4F", "left", 7, rect(240, 1280, 128, 24), "class-1-2", "class-1-2-front-entry"),
  roomDoor("4f-class-1-2-back", "高一二班后门", "4F", "left", 8, rect(240, 1420, 128, 24), "class-1-2", "class-1-2-back-entry"),
];

const fourthFloorDoors: CorridorDoor[] = [
  ...fourthFloorLeftDoors,
  roomDoor("4f-office-front", "办公室前门", "4F", "right", 1, rect(800, 980, 128, 24), "office-4f", "office-front-entry", "office front door"),
  roomDoor("4f-office-back", "办公室后门", "4F", "right", 2, rect(800, 1140, 128, 24), "office-4f", "office-back-entry", "office back door"),
  elevatorDoor("4f-elevator", "4F", "5F", 3, rect(800, 1540, 128, 24)),
];

const fifthFloorDoors: CorridorDoor[] = [
  backgroundDoor("5f-background-class-1-front", "五楼普通班级一前门", "5F", 1, rect(240, 360, 128, 24)),
  backgroundDoor("5f-background-class-1-back", "五楼普通班级一后门", "5F", 2, rect(240, 520, 128, 24)),
  backgroundDoor("5f-background-class-2-front", "五楼普通班级二前门", "5F", 3, rect(240, 760, 128, 24)),
  backgroundDoor("5f-background-class-2-back", "五楼普通班级二后门", "5F", 4, rect(240, 920, 128, 24)),
  roomDoor("5f-communication-control-back", "学校通信控制室后门", "5F", "right", 1, rect(800, 1140, 128, 24), "communication-control-5f", "communication-control-back-entry", "five-floor communication control back door"),
  elevatorDoor("5f-elevator", "5F", "4F", 2, rect(800, 1540, 128, 24)),
];

const fourthFloorRooms: Record<Exclude<RoomId, "communication-control-5f">, RoomArea> = {
  "gt2-classroom": room("gt2-classroom", "GT2教室", "4F", "classroom", ["4f-gt2-front", "4f-gt2-back"], [
    spawn("gt2-front-entry", 760, 420, "left"),
    spawn("gt2-back-entry", 760, 260, "left"),
    spawn("gt2-phone-cabinet", 160, 260, "right"),
  ]),
  "gt1-classroom": room("gt1-classroom", "GT1教室", "4F", "classroom", ["4f-gt1-front", "4f-gt1-back"], [
    spawn("gt1-front-entry", 760, 420, "left"),
    spawn("gt1-back-entry", 760, 260, "left"),
    spawn("gt1-phone-cabinet", 160, 260, "right"),
  ]),
  "class-1-1": room("class-1-1", "高一一班", "4F", "classroom", ["4f-class-1-1-front", "4f-class-1-1-back"], [
    spawn("class-1-1-front-entry", 760, 420, "left"),
    spawn("class-1-1-back-entry", 760, 260, "left"),
  ]),
  "class-1-2": room("class-1-2", "高一二班", "4F", "classroom", ["4f-class-1-2-front", "4f-class-1-2-back"], [
    spawn("class-1-2-front-entry", 760, 420, "left"),
    spawn("class-1-2-back-entry", 760, 260, "left"),
  ]),
  "office-4f": room("office-4f", "四楼办公室", "4F", "office", ["4f-office-front", "4f-office-back"], [
    spawn("office-front-entry", 160, 420, "right"),
    spawn("office-back-entry", 160, 260, "right"),
    spawn("office-phone", 620, 180, "up"),
  ]),
};

const fifthFloorRooms: Pick<Record<RoomId, RoomArea>, "communication-control-5f"> = {
  "communication-control-5f": room(
    "communication-control-5f",
    "学校通信控制室",
    "5F",
    "communicationControl",
    ["5f-communication-control-back"],
    [spawn("communication-control-back-entry", 160, 260, "right"), spawn("communication-device", 620, 240, "up")],
  ),
};

function corridor(id: string, label: string, floorId: FloorId, doors: CorridorDoor[]): CorridorArea {
  return {
    id,
    label,
    floorId,
    kind: "corridor",
    entityScope: "corridorOnly",
    bounds: corridorBounds,
    walkableBounds: corridorWalkable,
    collisionZones: corridorCollision,
    occlusionZones: corridorOcclusion,
    spawnPoints: [
      spawn(`${floorId.toLowerCase()}-elevator-arrival`, 740, 1540, "left"),
      spawn(`${floorId.toLowerCase()}-corridor-center`, 560, 920, "down"),
    ],
    floorTile,
    doors,
  };
}

function renderContexts(floorId: FloorId, corridorId: string, doors: CorridorDoor[], rooms: Partial<Record<RoomId, RoomArea>>): FloorMap["renderContexts"] {
  return {
    corridor: {
      id: `${floorId}-corridor-render`,
      includeEntityScopes: ["corridorOnly", "sharedDoorSurface"],
      excludeEntityScopes: ["roomOnly"],
      entityIds: [corridorId, ...doors.map((door) => door.id)],
    },
    rooms: {
      id: `${floorId}-room-render`,
      includeEntityScopes: ["roomOnly"],
      excludeEntityScopes: ["corridorOnly", "sharedDoorSurface"],
      entityIds: Object.values(rooms).map((roomArea) => roomArea.id),
    },
  };
}

const corridor4F = corridor("4f-corridor", "四楼楼道", "4F", fourthFloorDoors);
const corridor5F = corridor("5f-corridor", "五楼楼道", "5F", fifthFloorDoors);

export const schoolMaps: SchoolMapManifest = {
  id: "ying-zhong-jiu-school",
  coordinateSystem: {
    origin: "top-left",
    unit: "design-pixel-placeholder",
    sourceReference: "design-corridor-image",
  },
  floors: {
    "4F": {
      id: "4F",
      label: "四楼",
      corridor: corridor4F,
      rooms: fourthFloorRooms,
      renderContexts: renderContexts("4F", corridor4F.id, fourthFloorDoors, fourthFloorRooms),
    },
    "5F": {
      id: "5F",
      label: "五楼",
      corridor: corridor5F,
      rooms: fifthFloorRooms,
      renderContexts: renderContexts("5F", corridor5F.id, fifthFloorDoors, fifthFloorRooms),
    },
  },
};
