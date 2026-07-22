import { describe, expect, it } from "vitest";
import { assignNoteContent } from "../../../forgottenSanity/notes/assignNoteContent";
import { NOTE_CONTENT_COUNT } from "../../../forgottenSanity/notes/noteContent";

// Deterministic RNG stub: returns a fixed sequence of values.
function makeRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i] ?? values[values.length - 1] ?? 0;
    i += 1;
    return v;
  };
}

describe("assignNoteContent", () => {
  it("sequential phase: first read of instance A assigns index 0 and advances nextSequentialIndex 0->1", () => {
    const readThisRun = new Map<string, number>();
    const result = assignNoteContent({
      nextSequentialIndex: 0,
      readThisRun,
      instanceId: "note-0",
      rng: makeRng([0.5]),
    });
    expect(result.contentIndex).toBe(0);
    expect(result.newNextSequentialIndex).toBe(1);
    expect(result.persisted).toBe(true);
  });

  it("re-reading same instance returns locked content, does not advance", () => {
    const readThisRun = new Map<string, number>([["note-0", 0]]);
    const result = assignNoteContent({
      nextSequentialIndex: 1,
      readThisRun,
      instanceId: "note-0",
      rng: makeRng([0.5]),
    });
    expect(result.contentIndex).toBe(0);
    expect(result.newNextSequentialIndex).toBe(1);
    expect(result.persisted).toBe(false);
  });

  it("sequential phase: first read of instance B assigns index 1 and advances 1->2", () => {
    const readThisRun = new Map<string, number>([["note-0", 0]]);
    const result = assignNoteContent({
      nextSequentialIndex: 1,
      readThisRun,
      instanceId: "note-1",
      rng: makeRng([0.5]),
    });
    expect(result.contentIndex).toBe(1);
    expect(result.newNextSequentialIndex).toBe(2);
    expect(result.persisted).toBe(true);
  });

  it("random phase (nextSequentialIndex >= 9): first read picks random index, does not advance, does not persist", () => {
    const readThisRun = new Map<string, number>();
    const result = assignNoteContent({
      nextSequentialIndex: 9,
      readThisRun,
      instanceId: "note-0",
      rng: makeRng([0.42]),
    });
    // floor(0.42 * 9) = 3
    expect(result.contentIndex).toBe(3);
    expect(result.newNextSequentialIndex).toBe(9);
    expect(result.persisted).toBe(false);
  });

  it("random phase: re-reading same instance returns locked value", () => {
    const readThisRun = new Map<string, number>([["note-0", 7]]);
    const result = assignNoteContent({
      nextSequentialIndex: 9,
      readThisRun,
      instanceId: "note-0",
      rng: makeRng([0.99]),
    });
    expect(result.contentIndex).toBe(7);
    expect(result.newNextSequentialIndex).toBe(9);
    expect(result.persisted).toBe(false);
  });

  it("random phase: different instances get independent random assignments", () => {
    const readThisRun = new Map<string, number>();
    const r1 = assignNoteContent({
      nextSequentialIndex: 9, readThisRun, instanceId: "note-0", rng: makeRng([0.0]),
    });
    // floor(0.0 * 9) = 0
    expect(r1.contentIndex).toBe(0);
    readThisRun.set("note-0", r1.contentIndex);
    const r2 = assignNoteContent({
      nextSequentialIndex: 9, readThisRun, instanceId: "note-1", rng: makeRng([0.5]),
    });
    // floor(0.5 * 9) = 4
    expect(r2.contentIndex).toBe(4);
  });

  it("contentIndex always in [0, NOTE_CONTENT_COUNT)", () => {
    const readThisRun = new Map<string, number>();
    for (let i = 0; i < 50; i += 1) {
      const r = assignNoteContent({
        nextSequentialIndex: 9,
        readThisRun,
        instanceId: `note-${i}`,
        rng: makeRng([Math.random()]),
      });
      expect(r.contentIndex).toBeGreaterThanOrEqual(0);
      expect(r.contentIndex).toBeLessThan(NOTE_CONTENT_COUNT);
    }
  });
});
