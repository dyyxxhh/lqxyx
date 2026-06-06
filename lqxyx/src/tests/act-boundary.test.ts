import { describe, expect, it } from "vitest";
import { storyManifest } from "../data/story";

describe("story act boundary", () => {
  it("act-boundary: reserves later acts as metadata without playable event chains", () => {
    const laterActs = storyManifest.acts.filter((act) => act.id !== "act-1");

    expect(laterActs.length).toBeGreaterThan(0);
    expect(laterActs.every((act) => act.status === "reserved")).toBe(true);
    expect(laterActs.every((act) => act.checkpoints.length === 0)).toBe(true);
    expect(laterActs.every((act) => act.branches.length === 0)).toBe(true);
    expect(laterActs.every((act) => act.timers.length === 0)).toBe(true);
    expect(laterActs.every((act) => act.tasks.length === 0)).toBe(true);
    expect(laterActs.every((act) => act.endings.length === 0)).toBe(true);
    expect(laterActs.every((act) => act.characters.length === 0)).toBe(true);
  });
});
