import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FORGOTTEN_SANITY_NOTES_STORAGE_KEY,
  FORGOTTEN_SANITY_SCHEMA_VERSION,
  createDefaultNotesState,
  isNotesState,
  loadNotesState,
  saveNotesState,
  atomicSaveMulti,
  type ForgottenSanityNotesState,
} from "../../../forgottenSanity/state/forgottenSanityState";

function makeStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial };
  return {
    get length() { return Object.keys(store).length; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
    key(i: number) { return Object.keys(store)[i] ?? null; },
    getItem(k: string) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null; },
    setItem(k: string, v: string) { store[k] = v; },
    removeItem(k: string) { delete store[k]; },
  } as Storage;
}

describe("notes state", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("default state has schemaVersion 1 and nextSequentialIndex 0", () => {
    const d = createDefaultNotesState();
    expect(d.schemaVersion).toBe(1);
    expect(d.nextSequentialIndex).toBe(0);
  });

  it("isNotesState accepts valid shape", () => {
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: 0 })).toBe(true);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: 5 })).toBe(true);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: 9 })).toBe(true);
  });

  it("isNotesState rejects invalid shapes", () => {
    expect(isNotesState(null)).toBe(false);
    expect(isNotesState({})).toBe(false);
    expect(isNotesState({ schemaVersion: 1 })).toBe(false);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: "0" })).toBe(false);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: -1 })).toBe(false);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: 1.5 })).toBe(false);
    expect(isNotesState({ schemaVersion: 1, nextSequentialIndex: NaN })).toBe(false);
    expect(isNotesState({ schemaVersion: 2, nextSequentialIndex: 0 })).toBe(false);
  });

  it("loadNotesState returns default when key absent", () => {
    const storage = makeStorage();
    const result = loadNotesState(storage);
    expect(result.state).toEqual(createDefaultNotesState());
  });

  it("loadNotesState returns stored state when valid", () => {
    const storage = makeStorage({
      [FORGOTTEN_SANITY_NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, nextSequentialIndex: 3 }),
    });
    expect(loadNotesState(storage).state.nextSequentialIndex).toBe(3);
  });

  it("loadNotesState falls back to default on corrupt JSON", () => {
    const storage = makeStorage({ [FORGOTTEN_SANITY_NOTES_STORAGE_KEY]: "{not json" });
    expect(loadNotesState(storage).state).toEqual(createDefaultNotesState());
  });

  it("loadNotesState falls back to default on version mismatch", () => {
    const storage = makeStorage({
      [FORGOTTEN_SANITY_NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 999, nextSequentialIndex: 0 }),
    });
    expect(loadNotesState(storage).state).toEqual(createDefaultNotesState());
  });

  it("loadNotesState falls back to default on invalid shape", () => {
    const storage = makeStorage({
      [FORGOTTEN_SANITY_NOTES_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1, nextSequentialIndex: -2 }),
    });
    expect(loadNotesState(storage).state).toEqual(createDefaultNotesState());
  });

  it("saveNotesState writes JSON to the notes key", () => {
    const storage = makeStorage();
    saveNotesState({ schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION, nextSequentialIndex: 4 }, storage);
    expect(storage.getItem(FORGOTTEN_SANITY_NOTES_STORAGE_KEY)).toBe(
      JSON.stringify({ schemaVersion: 1, nextSequentialIndex: 4 }),
    );
  });

  it("atomicSaveMulti rolls back on setItem failure", () => {
    const store: Record<string, string> = {
      existingKey: "original",
    };
    let callCount = 0;
    const storage: Storage = {
      get length() { return Object.keys(store).length; },
      clear() { for (const k of Object.keys(store)) delete store[k]; },
      key(i: number) { return Object.keys(store)[i] ?? null; },
      getItem(k: string) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k]! : null; },
      setItem(k: string, v: string) {
        callCount += 1;
        if (callCount === 2) throw new Error("disk full");
        store[k] = v;
      },
      removeItem(k: string) { delete store[k]; },
    } as Storage;
    const ok = atomicSaveMulti([
      { key: "k1", value: "v1" },
      { key: "existingKey", value: "v2" },
    ], storage);
    expect(ok).toBe(false);
    // rollback restores existingKey to original
    expect(storage.getItem("existingKey")).toBe("original");
    // k1 was written then rolled back (removed)
    expect(storage.getItem("k1")).toBe(null);
  });
});
