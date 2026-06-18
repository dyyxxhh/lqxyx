import { describe, expect, it } from "vitest";
import { schoolMaps } from "../data/maps";
import { storyManifest, type StoryPhysicalTarget, type StoryPhysicalTargetRequirement } from "../data/story";

/**
 * Physical target coordinate drift tests.
 *
 * These tests assert that interaction physicalTarget points match the
 * center of the corresponding map door bounds.  Currently story.ts
 * has stale coordinates (principal y=1696 instead of 2012, office
 * y=1044/1204 instead of 868/1028) so these tests are expected to
 * FAIL RED until story.ts is corrected.
 */

/** Return the center point of a MapRectangle. */
function centerOf(r: { x: number; y: number; width: number; height: number }) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Find a corridor door by its id. */
function doorById(floorId: string, doorId: string) {
  const floor = schoolMaps.floors[floorId as "4F" | "5F"];
  if (!floor) throw new Error(`Unknown floor ${floorId}`);
  const door = floor.corridor.doors.find((d) => d.id === doorId);
  if (!door) throw new Error(`Door ${doorId} not found on floor ${floorId}`);
  return door;
}

/** Find an interaction command by its target label. */
function interactionByTarget(target: string) {
  const act1 = storyManifest.acts.find((a) => a.id === "act-1");
  if (!act1) throw new Error("act-1 not found");
  const allCommands = [
    ...act1.checkpoints.flatMap((cp) => cp.commands),
    ...act1.branches.flatMap((b) => b.commands),
  ];
  const cmd = allCommands.find(
    (c): c is Extract<(typeof allCommands)[number], { type: "interaction" }> =>
      c.type === "interaction" && c.target === target,
  );
  if (!cmd) throw new Error(`Interaction target "${target}" not found`);
  return cmd;
}

function singlePhysicalTarget(requirement: StoryPhysicalTargetRequirement | undefined): StoryPhysicalTarget {
  if (!requirement) throw new Error("Expected physicalTarget");
  if (!("points" in requirement)) throw new Error("Expected a single physicalTarget");
  return requirement;
}

describe("story physical targets match map door centers", () => {
  it("五楼校长办公室门口 → principals-office-front-5f center (288, 2012)", () => {
    const interaction = interactionByTarget("五楼校长办公室门口");
    const door = doorById("5F", "principals-office-front-5f");
    const expected = centerOf(door.bounds);

    const physicalTarget = singlePhysicalTarget(interaction.physicalTarget);
    expect(physicalTarget.points[0]!.x).toBe(expected.x);
    expect(physicalTarget.points[0]!.y).toBe(expected.y);
  });

  it("办公室门口两门任一 → 4f-office-front center (832, 868) and 4f-office-back center (832, 1028)", () => {
    const interaction = interactionByTarget("办公室门口两门任一");
    const frontDoor = doorById("4F", "4f-office-front");
    const backDoor = doorById("4F", "4f-office-back");
    const frontCenter = centerOf(frontDoor.bounds);
    const backCenter = centerOf(backDoor.bounds);

    const physicalTarget = singlePhysicalTarget(interaction.physicalTarget);
    expect(physicalTarget.points).toHaveLength(2);

    // Order-independent match: each point must match one of the two door centers
    const points = physicalTarget.points;
    const matchedFront = points.some((p) => p.x === frontCenter.x && p.y === frontCenter.y);
    const matchedBack = points.some((p) => p.x === backCenter.x && p.y === backCenter.y);
    expect(matchedFront).toBe(true);
    expect(matchedBack).toBe(true);
  });

  it("办公室电话 → (620, 180) radius 48", () => {
    const interaction = interactionByTarget("办公室电话");
    const physicalTarget = singlePhysicalTarget(interaction.physicalTarget);
    expect(physicalTarget.points[0]!.x).toBe(620);
    expect(physicalTarget.points[0]!.y).toBe(180);
    expect(physicalTarget.points[0]!.radiusPx).toBe(48);
  });

  it("五楼学校通信 → (620, 240) radius 48", () => {
    const interaction = interactionByTarget("五楼学校通信");
    const physicalTarget = singlePhysicalTarget(interaction.physicalTarget);
    expect(physicalTarget.points[0]!.x).toBe(620);
    expect(physicalTarget.points[0]!.y).toBe(240);
    expect(physicalTarget.points[0]!.radiusPx).toBe(48);
  });
});
