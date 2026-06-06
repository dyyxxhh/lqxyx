import { describe, expect, it } from "vitest";
import { schoolMaps } from "../data/maps";

describe("room render boundaries", () => {
  it("room-render-boundaries: separates corridor render entities from room render entities", () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      expect(floor.renderContexts.corridor.includeEntityScopes).toEqual(["corridorOnly", "sharedDoorSurface"]);
      expect(floor.renderContexts.corridor.excludeEntityScopes).toEqual(["roomOnly"]);
      expect(floor.renderContexts.rooms.includeEntityScopes).toEqual(["roomOnly"]);
      expect(floor.renderContexts.rooms.excludeEntityScopes).toEqual(["corridorOnly", "sharedDoorSurface"]);
    }
  });

  it("room-render-boundaries: assigns corridor-only and room-only entities to disjoint render sets", () => {
    for (const floor of Object.values(schoolMaps.floors)) {
      const corridorOnlyIds = new Set(floor.renderContexts.corridor.entityIds);
      const roomOnlyIds = new Set(floor.renderContexts.rooms.entityIds);

      expect(floor.corridor.entityScope).toBe("corridorOnly");
      expect(corridorOnlyIds.has(floor.corridor.id)).toBe(true);

      for (const room of Object.values(floor.rooms)) {
        expect(room.entityScope).toBe("roomOnly");
        expect(roomOnlyIds.has(room.id)).toBe(true);
        expect(corridorOnlyIds.has(room.id)).toBe(false);
      }
    }
  });

  it("room-render-boundaries: keeps room transitions off non-interactive 5F background class doors", () => {
    const fiveFloorBackgroundDoors = schoolMaps.floors["5F"].corridor.doors.filter(
      (door) => door.kind === "backgroundDoor",
    );

    expect(fiveFloorBackgroundDoors).toHaveLength(4);
    expect(fiveFloorBackgroundDoors.every((door) => door.interaction.type !== "roomTransition")).toBe(true);
  });
});
