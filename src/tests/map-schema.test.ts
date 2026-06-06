import { describe, expect, it } from "vitest";
import { schoolMaps } from "../data/maps";

const corridor4F = schoolMaps.floors["4F"].corridor;
const corridor5F = schoolMaps.floors["5F"].corridor;

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

  it("map-schema: encodes right-side elevator and floor-specific right-side room doors", () => {
    expect(corridor4F.doors.filter((door) => door.kind === "elevator")).toEqual([
      expect.objectContaining({ label: "电梯", side: "right", interaction: { type: "elevator", targetFloorId: "5F" } }),
    ]);
    expect(corridor4F.doors.filter((door) => door.roomId === "office-4f").map((door) => door.label)).toEqual([
      "办公室前门",
      "办公室后门",
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
    ]);
    expect(fiveFloorClassDoors).toHaveLength(4);
    expect(fiveFloorClassDoors.every((door) => door.visible === true)).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.interaction.type === "none")).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.roomId === undefined)).toBe(true);
    expect(fiveFloorClassDoors.every((door) => door.storyTargetId === undefined)).toBe(true);
  });

  it("map-schema: uses programmatic wood-colored horizontal bars for every door", () => {
    const doors = Object.values(schoolMaps.floors).flatMap((floor) => floor.corridor.doors);

    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((door) => door.render.assetKey === "doors.wallWoodBars")).toBe(true);
    expect(doors.every((door) => door.render.shape === "horizontalBar")).toBe(true);
    expect(doors.every((door) => door.render.material === "wood")).toBe(true);
  });
});
