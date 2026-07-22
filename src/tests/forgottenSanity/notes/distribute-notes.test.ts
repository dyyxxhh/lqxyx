import { describe, expect, it } from "vitest";
import { createRng, distributeNotes } from "../../../forgottenSanity/map/ForgottenSanityMapGenerator";
import type {
  ForgottenSanityChestSpawn,
  ForgottenSanityRect,
  ForgottenSanityRoom,
} from "../../../forgottenSanity/map/forgottenSanityMapState";

function makeRoom(
  id: string,
  kind: ForgottenSanityRoom["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
): ForgottenSanityRoom {
  const bounds: ForgottenSanityRect = { x, y, width: w, height: h };
  const walkableBounds: ForgottenSanityRect = { x: x + 12, y: y + 12, width: w - 24, height: h - 24 };
  return {
    id,
    kind,
    label: id,
    bounds,
    walkableBounds,
    collisionZones: [],
    spawnPoint: { x: x + w / 2, y: y + h / 2 },
    cellIndex: 0,
  };
}

function makeChest(id: string, roomId: string, cx: number, cy: number): ForgottenSanityChestSpawn {
  return { id, roomId, kind: "normal", bounds: { x: cx - 24, y: cy - 24, width: 48, height: 48 } };
}

describe("distributeNotes", () => {
  it("produces 2-5 notes for any seed", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);
      const rooms = [
        makeRoom("r1", "classroom", 0, 0, 600, 600),
        makeRoom("r2", "trap", 700, 0, 600, 600),
        makeRoom("r3", "dark", 1400, 0, 600, 600),
      ];
      const chests: ForgottenSanityChestSpawn[] = [];
      const notes = distributeNotes(rng, rooms, chests);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      expect(notes.length).toBeLessThanOrEqual(5);
    }
  });

  it("never places notes in entrance/exit/vault rooms", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed + 1000);
      const rooms = [
        makeRoom("entrance", "entrance", 0, 0, 600, 600),
        makeRoom("exit", "exit", 700, 0, 600, 600),
        makeRoom("vault", "vault", 1400, 0, 600, 600),
        makeRoom("ok", "classroom", 0, 700, 600, 600),
      ];
      const notes = distributeNotes(rng, rooms, []);
      for (const n of notes) {
        const room = rooms.find((r) => r.id === n.roomId);
        expect(room).toBeDefined();
        expect(["entrance", "exit", "vault"]).not.toContain(room!.kind);
      }
    }
  });

  it("note bounds are 48x48 and centered inside walkableBounds of their room", () => {
    const rng = createRng(42);
    const rooms = [makeRoom("r1", "classroom", 0, 0, 600, 600)];
    const notes = distributeNotes(rng, rooms, []);
    for (const n of notes) {
      expect(n.bounds.width).toBe(48);
      expect(n.bounds.height).toBe(48);
      const cx = n.bounds.x + 24;
      const cy = n.bounds.y + 24;
      const room = rooms.find((r) => r.id === n.roomId)!;
      expect(cx).toBeGreaterThanOrEqual(room.walkableBounds.x);
      expect(cx).toBeLessThanOrEqual(room.walkableBounds.x + room.walkableBounds.width);
      expect(cy).toBeGreaterThanOrEqual(room.walkableBounds.y);
      expect(cy).toBeLessThanOrEqual(room.walkableBounds.y + room.walkableBounds.height);
    }
  });

  it("notes are at least 120px apart from each other (center-to-center)", () => {
    const rng = createRng(7);
    const rooms = [
      makeRoom("r1", "classroom", 0, 0, 900, 900),
      makeRoom("r2", "trap", 1000, 0, 900, 900),
      makeRoom("r3", "dark", 2000, 0, 900, 900),
      makeRoom("r4", "switchRoom", 0, 1000, 900, 900),
      makeRoom("r5", "hall", 1000, 1000, 900, 900),
    ];
    const notes = distributeNotes(rng, rooms, []);
    for (let i = 0; i < notes.length; i += 1) {
      for (let j = i + 1; j < notes.length; j += 1) {
        const a = notes[i]!;
        const b = notes[j]!;
        const dist = Math.hypot(
          (a.bounds.x + 24) - (b.bounds.x + 24),
          (a.bounds.y + 24) - (b.bounds.y + 24),
        );
        expect(dist).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it("notes are at least 60px from any chest (center-to-center)", () => {
    const rng = createRng(11);
    const rooms = [makeRoom("r1", "classroom", 0, 0, 900, 900)];
    const chests: ForgottenSanityChestSpawn[] = [
      makeChest("c1", "r1", 300, 300),
      makeChest("c2", "r1", 500, 500),
    ];
    const notes = distributeNotes(rng, rooms, chests);
    for (const n of notes) {
      const ncx = n.bounds.x + 24;
      const ncy = n.bounds.y + 24;
      for (const c of chests) {
        const ccx = c.bounds.x + 24;
        const ccy = c.bounds.y + 24;
        const dist = Math.hypot(ncx - ccx, ncy - ccy);
        expect(dist).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it("returns empty array when no eligible rooms exist", () => {
    const rng = createRng(1);
    const rooms = [
      makeRoom("entrance", "entrance", 0, 0, 600, 600),
      makeRoom("exit", "exit", 700, 0, 600, 600),
    ];
    const notes = distributeNotes(rng, rooms, []);
    expect(notes).toEqual([]);
  });

  it("does not throw when eligible rooms have insufficient space for full count", () => {
    const rng = createRng(3);
    const rooms = [makeRoom("r1", "classroom", 0, 0, 200, 200)];
    const notes = distributeNotes(rng, rooms, []);
    expect(notes.length).toBeLessThanOrEqual(5);
  });

  it("note ids are unique and follow note-<idx> pattern", () => {
    const rng = createRng(99);
    const rooms = [makeRoom("r1", "classroom", 0, 0, 900, 900)];
    const notes = distributeNotes(rng, rooms, []);
    const ids = notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    notes.forEach((n, i) => {
      expect(n.id).toBe(`note-${i}`);
    });
  });
});
