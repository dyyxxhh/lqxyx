import { describe, expect, it } from "vitest";
import { firstActCheckpoints, storyManifest, type StoryCommand } from "../data/story";

const firstAct = storyManifest.acts.find((act) => act.id === "act-1");

describe("story manifest", () => {
  it("story-manifest: covers first-act checkpoints A through I", () => {
    expect(firstAct?.status).toBe("playable");
    expect(firstActCheckpoints.map((checkpoint) => checkpoint.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
    ]);
  });

  it("story-manifest: includes required branches, timers, tasks, endings, and curtain", () => {
    expect(firstAct?.branches.map((branch) => branch.id).sort()).toEqual(["A-1", "A-2", "B-1", "B-2"]);
    expect(firstAct?.timers.map((timer) => timer.durationMs).sort((left, right) => left - right)).toEqual([
      10_000,
      30_000,
      120_000,
    ]);
    expect(firstAct?.tasks).toContain("无");
    expect(firstAct?.endings.map((ending) => ending.title).sort()).toEqual(["一分为二", "幸存", "臊子"]);
    expect(firstAct?.curtain).toEqual({ title: "下一幕", subtitle: "敬请期待" });
  });

  it("story-manifest: represents all black-screen dialogue waits as 500ms commands", () => {
    const checkpointCommands = firstActCheckpoints.flatMap((checkpoint) => checkpoint.commands);
    const branchCommands = firstAct?.branches.flatMap((branch) => branch.commands) ?? [];
    const waits = [...checkpointCommands, ...branchCommands].filter(
      (command) => command.type === "blackScreenDialogueWait",
    );

    expect(waits.length).toBeGreaterThan(0);
    expect(waits.every((wait) => wait.durationMs === 500)).toBe(true);
  });

  it("story-manifest: keeps Yang Yun red/blue as internal states with visible name 杨云", () => {
    const yangYunSwitches = firstActCheckpoints.flatMap((checkpoint) =>
      checkpoint.commands.filter(
        (command): command is Extract<StoryCommand, { type: "switchCharacter" }> =>
          command.type === "switchCharacter" && command.characterId.startsWith("yangYun"),
      ),
    );

    expect(yangYunSwitches.length).toBeGreaterThan(0);
    expect(yangYunSwitches.every((command) => command.visibleName === "杨云")).toBe(true);
    const forbiddenRedLabel = ["杨云", "红边"].join("");
    const forbiddenBlueLabel = ["杨云", "蓝边"].join("");

    expect(JSON.stringify(firstAct?.characters)).not.toContain(forbiddenRedLabel);
    expect(JSON.stringify(firstAct?.characters)).not.toContain(forbiddenBlueLabel);
  });

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
