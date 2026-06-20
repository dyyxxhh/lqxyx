import { describe, expect, it } from "vitest";
import {
  storyManifest,
  firstActCheckpoints,
  firstActBranches,
  type StoryCommand,
  type CheckpointId,
  type BranchId,
} from "../data/story";

const firstAct = storyManifest.acts.find((act) => act.id === "act-1");

function allCommands(): StoryCommand[] {
  const checkpointCmds = firstActCheckpoints.flatMap((c) => c.commands);
  const branchCmds = firstActBranches.flatMap((b) => b.commands);
  return [...checkpointCmds, ...branchCmds];
}

describe("Coverage Audit — Manifest Completeness", () => {
  it("all checkpoints A–I are present and ordered", () => {
    const ids = firstActCheckpoints.map((c) => c.id);
    expect(ids).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  });

  it("each checkpoint has a playable character assigned", () => {
    for (const cp of firstActCheckpoints) {
      expect(cp.playableCharacter).toBeTruthy();
      expect([
        "yangYunBlue",
        "yangYunRed",
        "dongJihao",
      ]).toContain(cp.playableCharacter);
    }
  });

  it("each checkpoint has at least one command", () => {
    for (const cp of firstActCheckpoints) {
      expect(cp.commands.length).toBeGreaterThan(0);
    }
  });

  it("all branches A-1, A-2, B-1, B-2 are declared", () => {
    const ids = firstActBranches.map((b) => b.id).sort();
    expect(ids).toEqual(["A-1", "A-2", "B-1", "B-2"]);
  });

  it("each branch has a valid fromCheckpoint and commands", () => {
    const validCheckpoints = firstActCheckpoints.map((c) => c.id);
    for (const branch of firstActBranches) {
      expect(validCheckpoints).toContain(branch.fromCheckpoint);
      expect(branch.commands.length).toBeGreaterThan(0);
    }
  });

  it("A-1 rejoins at checkpoint D", () => {
    const a1 = firstActBranches.find((b) => b.id === "A-1");
    expect(a1?.rejoinsCheckpoint).toBe("D");
  });

  it("A-2 rejoins at checkpoint D (via inlined A-1 commands)", () => {
    const a2 = firstActBranches.find((b) => b.id === "A-2");
    expect(a2?.rejoinsCheckpoint).toBe("D");
  });

  it("B-1 rejoins at checkpoint G", () => {
    const b1 = firstActBranches.find((b) => b.id === "B-1");
    expect(b1?.rejoinsCheckpoint).toBe("G");
  });

  it("B-2 rejoins at checkpoint H", () => {
    const b2 = firstActBranches.find((b) => b.id === "B-2");
    expect(b2?.rejoinsCheckpoint).toBe("H");
  });

  it("all three timers are declared with correct durations", () => {
    expect(firstAct?.timers.length).toBe(3);
    const durations = firstAct?.timers
      .map((t) => t.durationMs)
      .sort((a, b) => a - b);
    expect(durations).toEqual([10_000, 30_000, 120_000]);
  });

  it("A-2-auto-eat-dan-yuxuan timer starts at checkpoint C", () => {
    const timer = firstAct?.timers.find(
      (t) => t.id === "A-2-auto-eat-dan-yuxuan",
    );
    expect(timer?.startsAt).toBe("C");
    expect(timer?.durationMs).toBe(10_000);
  });

  it("survival-route-countdown timer starts at checkpoint H", () => {
    const timer = firstAct?.timers.find(
      (t) => t.id === "survival-route-countdown",
    );
    expect(timer?.startsAt).toBe("H");
    expect(timer?.durationMs).toBe(120_000);
  });

  it("survival-ending-countdown timer starts at checkpoint I", () => {
    const timer = firstAct?.timers.find(
      (t) => t.id === "survival-ending-countdown",
    );
    expect(timer?.startsAt).toBe("I");
    expect(timer?.durationMs).toBe(30_000);
  });

  it("all three endings are declared", () => {
    const titles = firstAct?.endings.map((e) => e.title).sort();
    expect(titles).toEqual(["一分为二", "幸存", "躁子"]);
  });

  it("ending split-in-two returns to checkpoint G", () => {
    const ending = firstAct?.endings.find((e) => e.id === "split-in-two");
    expect(ending?.returnsToCheckpoint).toBe("G");
    expect(ending?.kind).toBe("minor");
  });

  it("ending saozi is minor and returns to checkpoint H", () => {
    const ending = firstAct?.endings.find((e) => e.id === "saozi");
    expect(ending?.title).toBe("躁子");
    expect(ending?.kind).toBe("minor");
    expect(ending?.returnsToCheckpoint).toBe("H");
  });

  it("ending survival-false-report is major with no return checkpoint", () => {
    const ending = firstAct?.endings.find(
      (e) => e.id === "survival-false-report",
    );
    expect(ending?.kind).toBe("major");
    expect(ending?.returnsToCheckpoint).toBeUndefined();
  });

  it("first-act curtain has title 下一幕 and subtitle 敬请期待", () => {
    expect(firstAct?.curtain).toEqual({
      title: "下一幕",
      subtitle: "敬请期待",
    });
  });

  it("curtain command appears in checkpoint I's last commands", () => {
    const i = firstActCheckpoints.find((c) => c.id === "I");
    const curtainIdx = i?.commands.findLastIndex(
      (cmd) => cmd.type === "curtain",
    );
    expect(curtainIdx).toBeGreaterThan(0);
  });

  it("checkpoint C timer starts before branch A-1 blocks in command order", () => {
    const c = firstActCheckpoints.find((cp) => cp.id === "C");
    const timerIdx = c?.commands.findIndex(
      (cmd) => cmd.type === "timer",
    );
    const branchIdx = c?.commands.findIndex(
      (cmd) => cmd.type === "branch",
    );
    expect(timerIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(-1);
    expect(timerIdx!).toBeLessThan(branchIdx!);
  });

  it("checkpoint E switchView yangYunRed appears after 董继豪 dialogues", () => {
    const e = firstActCheckpoints.find((cp) => cp.id === "E");
    const cmds = e?.commands ?? [];

    const djDialogueIdx = cmds.findIndex(
      (cmd) =>
        cmd.type === "dialogue" && cmd.speaker === "董继豪" &&
        cmd.text === "真的……",
    );
    const switchViewIdx = cmds.findIndex(
      (cmd) =>
        cmd.type === "switchView" && cmd.characterId === "yangYunRed",
    );

    expect(djDialogueIdx).toBeGreaterThan(-1);
    expect(switchViewIdx).toBeGreaterThan(-1);
    expect(switchViewIdx!).toBeGreaterThan(djDialogueIdx!);
  });

  it("branch A-2 contains inlined A-1 commands (not branch A-1)", () => {
    const a2 = firstActBranches.find((b) => b.id === "A-2");
    const hasBranchA1 = a2?.commands.some(
      (cmd) => cmd.type === "branch" && cmd.id === "A-1",
    );
    expect(hasBranchA1).toBeFalsy();

    const hasGotoCheckpointD = a2?.commands.some(
      (cmd) => cmd.type === "gotoCheckpoint" && cmd.id === "D",
    );
    expect(hasGotoCheckpointD).toBeTruthy();

    const hasDeathFlash = a2?.commands.some(
      (cmd) => cmd.type === "deathFlash",
    );
    expect(hasDeathFlash).toBeTruthy();
  });

  it("checkpoint G lists both B-1 and B-2 as consecutive branch commands", () => {
    const g = firstActCheckpoints.find((cp) => cp.id === "G");
    const branchCmds = g?.commands.filter(
      (cmd) => cmd.type === "branch",
    );
    expect(branchCmds?.length).toBe(2);
    expect(branchCmds![0].id).toBe("B-1");
    expect(branchCmds![1].id).toBe("B-2");
  });

  it("no later-act checkpoints exist beyond I", () => {
    const laterActs = storyManifest.acts.filter((act) => act.id !== "act-1");
    for (const act of laterActs) {
      expect(act.status).toBe("reserved");
      expect(act.checkpoints).toHaveLength(0);
      expect(act.branches).toHaveLength(0);
      expect(act.timers).toHaveLength(0);
    }
  });

  it("no Yang Yun red/blue border labels appear in user-facing text", () => {
    const forbiddenRed = "杨云红边";
    const forbiddenBlue = "杨云蓝边";
    const allText = JSON.stringify(firstActCheckpoints) +
      JSON.stringify(firstActBranches) +
      JSON.stringify(firstAct?.characters);

    expect(allText).not.toContain(forbiddenRed);
    expect(allText).not.toContain(forbiddenBlue);
  });

  it("all switchCharacter commands for Yang Yun use visibleName 杨云", () => {
    const yangSwitches = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "switchCharacter" }> =>
        cmd.type === "switchCharacter" &&
        cmd.characterId.startsWith("yangYun"),
    );
    expect(yangSwitches.length).toBeGreaterThan(0);
    expect(yangSwitches.every((s) => s.visibleName === "杨云")).toBe(true);
  });

  it("all dialogue speakers are non-empty strings", () => {
    const dialogues = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "dialogue" }> =>
        cmd.type === "dialogue",
    );
    expect(dialogues.length).toBeGreaterThan(0);
    expect(dialogues.every((d) => d.speaker.length > 0)).toBe(true);
    expect(dialogues.every((d) => d.text.length > 0)).toBe(true);
  });

  it("all task commands have valid text", () => {
    const tasks = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "task" }> =>
        cmd.type === "task",
    );
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => typeof t.text === "string")).toBe(true);
  });

  it("all timer commands have valid IDs and durations", () => {
    const timerCmds = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "timer" }> =>
        cmd.type === "timer",
    );
    expect(timerCmds.length).toBeGreaterThan(0);
    for (const t of timerCmds) {
      expect(t.id.length).toBeGreaterThan(0);
      if (t.action !== "stop") {
        expect(t.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it("all interaction commands have valid input types", () => {
    const interactions = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "interaction" }> =>
        cmd.type === "interaction",
    );
    expect(interactions.length).toBeGreaterThan(0);
    const validInputs = ["F", "Q", "choice", "proximity", "timer"];
    expect(interactions.every((i) => validInputs.includes(i.input))).toBe(true);
  });

  it("all fade commands have reasonable durations", () => {
    const fades = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "fade" }> =>
        cmd.type === "fade",
    );
    expect(fades.length).toBeGreaterThan(0);
    expect(fades.every((f) => f.durationMs >= 100 && f.durationMs <= 5000)).toBe(
      true,
    );
  });

  it("all blackScreen commands have non-zero duration", () => {
    const blackScreens = allCommands().filter(
      (cmd): cmd is Extract<StoryCommand, { type: "blackScreen" }> =>
        cmd.type === "blackScreen",
    );
    expect(blackScreens.length).toBeGreaterThan(0);
    expect(blackScreens.every((b) => b.durationMs > 0)).toBe(true);
  });

  it("celery death flash sequence has correct frame count", () => {
    const a2 = firstActBranches.find((b) => b.id === "A-2");
    const celeryFlash = a2?.commands.find(
      (cmd) => cmd.type === "deathFlash" && cmd.id === "celery",
    );
    expect(celeryFlash?.type).toBe("deathFlash");
    if (celeryFlash?.type === "deathFlash") {
      expect(celeryFlash.sequence.length).toBeGreaterThan(0);
      const totalMs = celeryFlash.sequence.reduce(
        (sum, f) => sum + f.durationMs,
        0,
      );
      expect(totalMs).toBe(4200);
    }
  });

  it("ruler death flash appears in B-1 branch", () => {
    const b1 = firstActBranches.find((b) => b.id === "B-1");
    const rulerFlash = b1?.commands.find(
      (cmd) => cmd.type === "deathFlash" && cmd.id === "ruler",
    );
    expect(rulerFlash).toBeTruthy();
  });

  it("checkpoint B has setFlag for danYuxuan body state", () => {
    const b = firstActCheckpoints.find((cp) => cp.id === "B");
    const flag = b?.commands.find(
      (cmd) =>
        cmd.type === "setFlag" && cmd.id === "danYuxuanBodyProneAndBloody",
    );
    expect(flag?.type).toBe("setFlag");
    if (flag?.type === "setFlag") {
      expect(flag.value).toBe(true);
    }
  });

  it("checkpoint D has setFlag for qinHaorui body state", () => {
    const d = firstActCheckpoints.find((cp) => cp.id === "D");
    const flag = d?.commands.find(
      (cmd) =>
        cmd.type === "setFlag" && cmd.id === "qinHaoruiBodyBloodyOnGround",
    );
    expect(flag?.type).toBe("setFlag");
    if (flag?.type === "setFlag") {
      expect(flag.value).toBe(true);
    }
  });

  it("checkpoint I sets phoneCabinetInteractionDisabled flag", () => {
    const i = firstActCheckpoints.find((cp) => cp.id === "I");
    const flag = i?.commands.find(
      (cmd) =>
        cmd.type === "setFlag" &&
        cmd.id === "phoneCabinetInteractionDisabled",
    );
    expect(flag?.type).toBe("setFlag");
    if (flag?.type === "setFlag") {
      expect(flag.value).toBe(true);
    }
  });
});
