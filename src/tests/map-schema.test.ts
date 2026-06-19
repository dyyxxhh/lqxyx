import { describe, expect, it } from "vitest";
import { schoolMaps, type DoorInteraction, type InRoomDoor, type RoomArea, type RoomId } from "../data/maps";

interface RoomAreaWithDoors extends RoomArea {
  inRoomDoors: InRoomDoor[];
}

const corridor4F = schoolMaps.floors["4F"].corridor;
const corridor5F = schoolMaps.floors["5F"].corridor;

function allRooms(): RoomArea[] {
  return Object.values(schoolMaps.floors).flatMap((floor) => Object.values(floor.rooms).filter((room): room is RoomArea => room !== undefined));
}

function getDoor(id: string) {
  return Object.values(schoolMaps.floors).flatMap((floor) => floor.corridor.doors).find((door) => door.id === id)!;
}

function isRoomTransition(interaction: DoorInteraction): interaction is Extract<DoorInteraction, { type: "roomTransition" }> {
  return interaction.type === "roomTransition";
}

function linkedEntryDoorId(door: InRoomDoor): string | undefined {
  if ("entryDoorId" in door && typeof door.entryDoorId === "string") {
    return door.entryDoorId;
  }
  return undefined;
}

describe("map schema", () => {
  it("map-schema: defines 4F and 5F corridor foundations with bounds, placeholders, and spawns", () => {
    expect(Object.keys(schoolMaps.floors).sort()).toEqual(["4F", "5F"]);

    for (const floor of Object.values(schoolMaps.floors)) {
      expect(floor.corridor.kind).toBe("corridor");
      expect(floor.corridor.walkableBounds.length).toBeGreaterThan(0);
      expect(floor.corridor.collisionZones.length).toBeGreaterThan(0);
      expect(floor.corridor.occlusionZones.length).toBeGreaterThan(0);
      expect(floor.corridor.spawnPoints.length).toBeGreaterThan(0);
      expect(floor.corridor.floorTile.assetKey).toBe("floor.tile");
    }
  });

  it("map-schema: encodes the exact 4F left-side door order", () => {
    const leftDoorLabels = corridor4F.doors
      .filter((door) => door.side === "left")
      .sort((left, right) => left.order - right.order)
      .map((door) => door.label);

    expect(leftDoorLabels).toEqual([
      "GT2前门",
      "GT2后门",
      "GT1前门",
      "GT1后门",
      "高一一班前门",
      "高一一班后门",
      "高一二班前门",
      "高一二班后门",
    ]);
  });

  it("map-schema: every roomTransition spawnPointId exists in its target room", () => {
    const rooms = allRooms();

    for (const floor of Object.values(schoolMaps.floors)) {
      for (const door of floor.corridor.doors) {
        if (!isRoomTransition(door.interaction)) continue;
        const interaction = door.interaction;

        const room = rooms.find((candidate) => candidate.id === interaction.targetRoomId);

        expect(room).toBeDefined();
        expect(room?.spawnPoints.map((spawnPoint) => spawnPoint.id)).toContain(interaction.spawnPointId);
      }
    }
  });

  it("map-schema: every room entryDoorId resolves to a visible matching corridor roomTransition door", () => {
    const corridorDoors = Object.values(schoolMaps.floors).flatMap((floor) => floor.corridor.doors);

    for (const room of allRooms()) {
      for (const entryDoorId of room.entryDoorIds) {
        const door = corridorDoors.find((candidate) => candidate.id === entryDoorId);

        expect(door).toBeDefined();
        expect(door).toEqual(expect.objectContaining({
          visible: true,
          kind: "roomDoor",
          floorId: room.floorId,
          roomId: room.id,
        }));
        expect(door?.interaction).toEqual(expect.objectContaining({
          type: "roomTransition",
          targetRoomId: room.id,
        }));
      }
    }
  });

  it("map-schema: 4F classrooms are taller than the viewport so camera-view triggers have off-screen space", () => {
    const classrooms = Object.values(schoolMaps.floors["4F"].rooms).filter(
      (room): room is RoomArea => room?.kind === "classroom",
    );

    expect(classrooms.length).toBeGreaterThan(0);
    expect(schoolMaps.floors["4F"].rooms["gt1-classroom"]?.bounds).toEqual({ x: 0, y: 0, width: 960, height: 1280 });
    for (const room of classrooms) {
      expect(room.bounds.height).toBeGreaterThan(720);
    }
  });

  it("map-schema: keeps 4F classroom front/back doors sorted with exact pair and between-pair gaps", () => {
    const leftDoorsByY = corridor4F.doors
      .filter((door) => door.side === "left")
      .sort((left, right) => left.bounds.y - right.bounds.y);

    expect(leftDoorsByY.map((door) => door.id)).toEqual([
      "4f-gt2-front",
      "4f-gt2-back",
      "4f-gt1-front",
      "4f-gt1-back",
      "4f-class-1-1-front",
      "4f-class-1-1-back",
      "4f-class-1-2-front",
      "4f-class-1-2-back",
    ]);
    expect(leftDoorsByY.map((door) => door.bounds.y)).toEqual([100, 260, 516, 676, 932, 1092, 1348, 1508]);

    const pairs = [
      ["4f-gt2-front", "4f-gt2-back"],
      ["4f-gt1-front", "4f-gt1-back"],
      ["4f-class-1-1-front", "4f-class-1-1-back"],
      ["4f-class-1-2-front", "4f-class-1-2-back"],
    ] as const;

    for (const [frontId, backId] of pairs) {
      const front = getDoor(frontId);
      const back = getDoor(backId);
      const visibleGap = back.bounds.y - (front.bounds.y + front.bounds.height);
      expect(visibleGap).toBe(32);
    }

    for (let pairIndex = 0; pairIndex < pairs.length - 1; pairIndex += 1) {
      const previousBack = getDoor(pairs[pairIndex][1]);
      const nextFront = getDoor(pairs[pairIndex + 1][0]);
      expect(nextFront.bounds.y - previousBack.bounds.y).toBe(256);
    }
  });

  it("map-schema: encodes right-side elevator and floor-specific right-side room doors", () => {
    expect(corridor4F.doors.filter((door) => door.kind === "elevator")).toEqual([
      expect.objectContaining({ label: "电梯", side: "right", bounds: expect.objectContaining({ y: 388 }), interaction: { type: "elevator", targetFloorId: "5F" } }),
    ]);
    expect(corridor4F.doors.filter((door) => door.roomId === "office-4f").map((door) => ({ label: door.label, y: door.bounds.y }))).toEqual([
      { label: "办公室前门", y: 804 },
      { label: "办公室后门", y: 964 },
    ]);

    expect(corridor5F.doors.filter((door) => door.label.includes("办公室前门"))).toEqual([]);
    expect(corridor5F.doors.filter((door) => door.roomId === "communication-control-5f").map((door) => door.label)).toEqual([
      "学校通信控制室后门",
    ]);
  });

  it("map-schema: keeps 5F left-side class doors visible but non-interactive", () => {
    const fiveFloorClassDoors = corridor5F.doors.filter((door) => door.side === "left" && door.kind === "backgroundDoor");

    expect(fiveFloorClassDoors.map((door) => door.label)).toEqual([
      "五楼普通班级一前门",
      "五楼普通班级一后门",
      "五楼普通班级二前门",
      "五楼普通班级二后门",
      "五楼普通班级三前门",
      "五楼普通班级三后门",
      "五楼普通班级四前门",
      "五楼普通班级四后门",
    ]);
    expect(fiveFloorClassDoors).toHaveLength(8);
    expect(fiveFloorClassDoors.every((door) => door.visible === true)).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.interaction.type === "none")).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.roomId === undefined)).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.storyTargetId === undefined)).toBe(true);
  });

  it("map-schema: enumerates 4F/5F door side, order, type, and label rules", () => {
    expect(
      corridor4F.doors
        .filter((door) => door.side === "left")
        .sort((left, right) => left.order - right.order)
        .map((door) => ({ order: door.order, kind: door.kind, label: door.label })),
    ).toEqual([
      { order: 1, kind: "roomDoor", label: "GT2前门" },
      { order: 2, kind: "roomDoor", label: "GT2后门" },
      { order: 3, kind: "roomDoor", label: "GT1前门" },
      { order: 4, kind: "roomDoor", label: "GT1后门" },
      { order: 5, kind: "roomDoor", label: "高一一班前门" },
      { order: 6, kind: "roomDoor", label: "高一一班后门" },
      { order: 7, kind: "roomDoor", label: "高一二班前门" },
      { order: 8, kind: "roomDoor", label: "高一二班后门" },
    ]);

    expect(
      corridor4F.doors
        .filter((door) => door.side === "right")
        .sort((left, right) => left.order - right.order)
        .map((door) => ({ order: door.order, kind: door.kind, label: door.label })),
    ).toEqual([
      { order: 1, kind: "elevator", label: "电梯" },
      { order: 2, kind: "roomDoor", label: "办公室前门" },
      { order: 3, kind: "roomDoor", label: "办公室后门" },
    ]);

    expect(
      corridor5F.doors
        .filter((door) => door.side === "right")
        .sort((left, right) => left.order - right.order)
        .map((door) => ({ order: door.order, kind: door.kind, label: door.label })),
    ).toEqual([
      { order: 1, kind: "elevator", label: "电梯" },
      { order: 2, kind: "roomDoor", label: "学校通信控制室后门" },
    ]);
  });

  it("map-schema: places the 5F principal office front door on the left as order 9", () => {
    const leftDoors = corridor5F.doors
      .filter((door) => door.side === "left")
      .sort((left, right) => left.order - right.order);
    const eighthDoor = leftDoors.find((door) => door.order === 8);
    const principalDoor = leftDoors.find((door) => door.id === "principals-office-front-5f");

    expect(principalDoor).toEqual(
      expect.objectContaining({
        id: "principals-office-front-5f",
        label: "校长办公室",
        floorId: "5F",
        side: "left",
        order: 9,
        kind: "roomDoor",
        roomId: "principals-office-5f",
        storyTargetId: "五楼校长办公室门口",
        interaction: { type: "roomTransition", targetRoomId: "principals-office-5f", spawnPointId: "principals-office-front-entry" },
      }),
    );
    expect(eighthDoor).toBeDefined();
    expect(principalDoor?.bounds.x).toBe(eighthDoor!.bounds.x);
    expect(principalDoor?.bounds.width).toBe(eighthDoor!.bounds.width);
    expect(principalDoor?.bounds.height).toBe(eighthDoor!.bounds.height);
    expect(principalDoor!.bounds.y).toBeGreaterThan(eighthDoor!.bounds.y + eighthDoor!.bounds.height);
  });

  it("map-schema: keeps 5F bounds and walkable area only long enough for the order-9 principal door", () => {
    const principalDoor = corridor5F.doors.find((door) => door.id === "principals-office-front-5f");
    expect(principalDoor).toBeDefined();

    const doorBottom = principalDoor!.bounds.y + principalDoor!.bounds.height;
    const walkableBottom = Math.max(...corridor5F.walkableBounds.map((bounds) => bounds.y + bounds.height));
    const corridorBottom = corridor5F.bounds.y + corridor5F.bounds.height;

    expect(walkableBottom).toBeGreaterThanOrEqual(doorBottom + 80);
    expect(corridorBottom).toBeGreaterThanOrEqual(doorBottom + 80);
  });

  it("map-schema: defines a real 5F principal office room reached only by the left front door", () => {
    const room = schoolMaps.floors["5F"].rooms["principals-office-5f"];

    expect(room).toEqual(
      expect.objectContaining({
        id: "principals-office-5f",
        label: "校长办公室",
        floorId: "5F",
        kind: "office",
        entryDoorIds: ["principals-office-front-5f"],
      }),
    );
    expect(room?.spawnPoints).toContainEqual({ id: "principals-office-front-entry", x: 760, y: 420, facing: "left" });
  });

  it("map-schema: preserves 5F right side as elevator plus communication-control back door only", () => {
    expect(
      corridor5F.doors
        .filter((door) => door.side === "right")
        .sort((left, right) => left.order - right.order)
        .map((door) => ({ id: door.id, order: door.order, roomId: door.roomId, label: door.label })),
    ).toEqual([
      { id: "5f-elevator", order: 1, roomId: undefined, label: "电梯" },
      { id: "5f-communication-control-back", order: 2, roomId: "communication-control-5f", label: "学校通信控制室后门" },
    ]);
  });

  it("map-schema: exposes the communication device as a room interaction target", () => {
    const room = schoolMaps.floors["5F"].rooms["communication-control-5f"];

    expect(room?.interactionTargets).toEqual([
      expect.objectContaining({
        id: "communication-device",
        label: "钢制通信设备",
        storyTargetId: "communication-device",
        render: expect.objectContaining({ assetKey: "communication.steelInteractable", material: "steel" }),
      }),
    ]);
  });

  it("map-schema: non-classroom rooms (office, principals office, communication control) have no desk collision/occlusion zones and walkable bounds fill the room", () => {
    const nonClassroomIds: RoomId[] = ["office-4f", "principals-office-5f", "communication-control-5f"];

    for (const roomId of nonClassroomIds) {
      const room = allRooms().find((candidate) => candidate.id === roomId);
      expect(room, `room ${roomId} missing`).toBeDefined();
      expect(room!.kind).not.toBe("classroom");
      expect(room!.collisionZones).toEqual([]);
      expect(room!.occlusionZones).toEqual([]);
      // walkable should reach within wallThickness (12) of room bounds, eliminating the bottom "air wall"
      const walkable = room!.walkableBounds[0]!;
      expect(walkable.x).toBeLessThanOrEqual(12);
      expect(walkable.y).toBeLessThanOrEqual(12);
      expect(walkable.x + walkable.width).toBeGreaterThanOrEqual(room!.bounds.width - 12);
      expect(walkable.y + walkable.height).toBeGreaterThanOrEqual(room!.bounds.height - 12);
      // bounds height should be a multiple of the rendered floor tile size (120) so the bottom row does not overflow past the wall
      expect(room!.bounds.height % 120).toBe(0);
    }
  });

  it("map-schema: same-class 4F front/back door gap is exactly 32px", () => {
    const pairs = [
      ["4f-gt2-front", "4f-gt2-back"],
      ["4f-gt1-front", "4f-gt1-back"],
      ["4f-class-1-1-front", "4f-class-1-1-back"],
      ["4f-class-1-2-front", "4f-class-1-2-back"],
    ] as const;

    for (const [frontId, backId] of pairs) {
      const front = getDoor(frontId);
      const back = getDoor(backId);
      const visibleGap = back.bounds.y - (front.bounds.y + front.bounds.height);
      expect(visibleGap).toBe(32);
    }
  });

  it("map-schema: 4F left door order is GT2 front/back, GT1 front/back, class-1-1 front/back, class-1-2 front/back", () => {
    const leftDoors = corridor4F.doors
      .filter((door) => door.side === "left")
      .sort((a, b) => a.order - b.order);

    const expectedOrder = [
      { label: "GT2前门", kind: "roomDoor", roomId: "gt2-classroom" },
      { label: "GT2后门", kind: "roomDoor", roomId: "gt2-classroom" },
      { label: "GT1前门", kind: "roomDoor", roomId: "gt1-classroom" },
      { label: "GT1后门", kind: "roomDoor", roomId: "gt1-classroom" },
      { label: "高一一班前门", kind: "roomDoor", roomId: "class-1-1" },
      { label: "高一一班后门", kind: "roomDoor", roomId: "class-1-1" },
      { label: "高一二班前门", kind: "roomDoor", roomId: "class-1-2" },
      { label: "高一二班后门", kind: "roomDoor", roomId: "class-1-2" },
    ];

    expect(leftDoors.map((d) => ({ label: d.label, kind: d.kind, roomId: d.roomId }))).toEqual(expectedOrder);
  });

  it("map-schema: each 4F classroom has exact right-top/right-bottom in-room doors linked to entry spawns", () => {
    const classrooms = Object.values(schoolMaps.floors["4F"].rooms).filter(
      (room): room is RoomArea => room?.kind === "classroom",
    );

    for (const room of classrooms) {
      const roomWithDoors = room as RoomAreaWithDoors;
      expect(roomWithDoors.inRoomDoors).toHaveLength(2);
      expect(roomWithDoors.inRoomDoors.map(linkedEntryDoorId)).toEqual(room.entryDoorIds);
      expect(roomWithDoors.inRoomDoors.map((door) => door.bounds)).toEqual([
        { x: 840, y: 80, width: 24, height: 128 },
        { x: 840, y: 1072, width: 24, height: 128 },
      ]);

      for (const entryDoorId of room.entryDoorIds) {
        const corridorDoor = getDoor(entryDoorId);
        const interaction = corridorDoor.interaction;
        if (interaction.type !== "roomTransition") {
          expect(interaction.type).toBe("roomTransition");
          continue;
        }

        const spawnPoint = room.spawnPoints.find((spawn) => spawn.id === interaction.spawnPointId);
        const inRoomDoor = roomWithDoors.inRoomDoors.find((door) => linkedEntryDoorId(door) === entryDoorId);
        const expectedSpawnY = entryDoorId.includes("front") ? 144 : 1136;

        expect(spawnPoint).toBeDefined();
        expect(inRoomDoor).toBeDefined();
        expect(inRoomDoor).toEqual(expect.objectContaining({ visible: true }));
        expect(spawnPoint!.y).toBe(expectedSpawnY);

        const doorCenterX = inRoomDoor!.bounds.x + inRoomDoor!.bounds.width / 2;
        const doorCenterY = inRoomDoor!.bounds.y + inRoomDoor!.bounds.height / 2;
        const walkable = room.walkableBounds[0];
        expect(doorCenterX).toBeGreaterThanOrEqual(walkable.x);
        expect(doorCenterX).toBeLessThanOrEqual(walkable.x + walkable.width);
        expect(doorCenterY).toBeGreaterThanOrEqual(walkable.y);
        expect(doorCenterY).toBeLessThanOrEqual(walkable.y + walkable.height);
        expect(doorCenterY).toBe(spawnPoint!.y);
      }
    }
  });

  it("map-schema: every enterable room has exactly one inRoomDoor per entryDoorId, each visible, linked to existing corridor door, center inside walkable bounds, and corresponding roomTransition spawn y equals door center y", () => {
    const rooms = allRooms();

    for (const room of rooms) {
      const roomWithDoors = room as RoomAreaWithDoors;

      expect(roomWithDoors.inRoomDoors).toHaveLength(room.entryDoorIds.length);

      for (const entryDoorId of room.entryDoorIds) {
        const matchingDoors = roomWithDoors.inRoomDoors.filter((door) => linkedEntryDoorId(door) === entryDoorId);
        expect(matchingDoors).toHaveLength(1);

        const inRoomDoor = matchingDoors[0]!;
        expect(inRoomDoor).toEqual(expect.objectContaining({ visible: true }));

        const corridorDoor = getDoor(entryDoorId);
        expect(corridorDoor).toBeDefined();
        expect(corridorDoor.interaction).toEqual(
          expect.objectContaining({ type: "roomTransition", targetRoomId: room.id }),
        );

        const interaction = corridorDoor.interaction;
        if (interaction.type !== "roomTransition") continue;

        const spawnPoint = room.spawnPoints.find((spawn) => spawn.id === interaction.spawnPointId);
        expect(spawnPoint).toBeDefined();

        const doorCenterX = inRoomDoor.bounds.x + inRoomDoor.bounds.width / 2;
        const doorCenterY = inRoomDoor.bounds.y + inRoomDoor.bounds.height / 2;
        const walkable = room.walkableBounds[0];
        expect(doorCenterX).toBeGreaterThanOrEqual(walkable.x);
        expect(doorCenterX).toBeLessThanOrEqual(walkable.x + walkable.width);
        expect(doorCenterY).toBeGreaterThanOrEqual(walkable.y);
        expect(doorCenterY).toBeLessThanOrEqual(walkable.y + walkable.height);
        expect(doorCenterY).toBe(spawnPoint!.y);
      }
    }
  });

  it("map-schema: uses programmatic wood-colored horizontal bars for every door", () => {
    const doors = Object.values(schoolMaps.floors).flatMap((floor) => floor.corridor.doors);

    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((door) => door.render.assetKey === "doors.wallWoodBars")).toBe(true);
    expect(doors.every((door) => door.render.shape === "horizontalBar")).toBe(true);
    expect(doors.every((door) => door.render.material === "wood")).toBe(true);
  });
});
