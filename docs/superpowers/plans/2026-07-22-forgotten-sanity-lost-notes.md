# 遗落的纸条（Lost Notes）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2-5 randomly-placed, non-pickup, H-key-interactable "lost notes" to the 被遗忘的理智 roguelike mode, with a full-screen text overlay (no title), per-note content lock + global sequential assignment persisted across runs, transitioning to uniform random after all 9 contents are seen.

**Architecture:** Mirror the existing chest system (`distributeChests` → `manifest.chests` → `createChestInteractions` → `onInteractPressed` chest branch → `ChestDecrypt` overlay). Notes get an analogous pipeline: `distributeNotes` → `manifest.notes` → `createNoteInteractions` → `onInteractPressed` note branch → new `NoteOverlay`. Persistence is a 5th localStorage key (`ying-zhong-jiu.forgotten-sanity.notes.v1`) holding only `nextSequentialIndex`. Content assignment is a pure function `assignNoteContent`.

**Tech Stack:** TypeScript (strict), Phaser 4, Vitest (unit), Playwright (E2E). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-forgotten-sanity-lost-notes-design.md`

---

## File Structure

### New files
- `src/forgottenSanity/notes/noteContent.ts` — 9 note contents + `NoteContent` interface (pure TS, no Phaser).
- `src/forgottenSanity/notes/assignNoteContent.ts` — pure function for content assignment (no Phaser).
- `src/forgottenSanity/ui/NoteOverlay.ts` — full-screen text overlay (imports type Phaser only).
- `src/tests/forgottenSanity/notes/note-content.test.ts`
- `src/tests/forgottenSanity/notes/assign-note-content.test.ts`
- `src/tests/forgottenSanity/notes/notes-state.test.ts`
- `src/tests/forgottenSanity/notes/distribute-notes.test.ts`
- `tests/e2e/forgotten-sanity-notes.spec.ts`

### Modified files
- `src/data/assets.ts` — add `note.遗落的纸条` entry.
- `src/data/assets.test.ts` — add path to `expectedFinalAssetPaths`, bump count 135→136.
- `src/forgottenSanity/map/forgottenSanityMapState.ts` — add `ForgottenSanityNoteSpawn` interface + `manifest.notes` field.
- `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts` — add `distributeNotes` + wire into `generateForgottenSanityMap`.
- `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` — add note sprite rendering.
- `src/forgottenSanity/state/forgottenSanityState.ts` — add notes state guard/load/save.
- `src/forgottenSanity/ForgottenSanityRunController.ts` — add note interaction methods + onInteractPressed branch + test hooks.
- `src/forgottenSanity/ForgottenSanityScene.ts` — extend `ForgottenSanityTestHooks` interface + mount hooks + `handleEsc` note priority.

---

## Task 1: Note content data module

**Files:**
- Create: `src/forgottenSanity/notes/noteContent.ts`
- Test: `src/tests/forgottenSanity/notes/note-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/forgottenSanity/notes/note-content.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { NOTE_CONTENTS, NOTE_CONTENT_COUNT, type NoteContent } from "../../../forgottenSanity/notes/noteContent";

describe("noteContent", () => {
  it("exports exactly 9 contents", () => {
    expect(NOTE_CONTENTS).toHaveLength(9);
    expect(NOTE_CONTENT_COUNT).toBe(9);
  });

  it("every content has non-empty unique id and non-empty body", () => {
    const ids = new Set<string>();
    for (const c of NOTE_CONTENTS) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(0);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  it("bodies do not contain explicit numbering strings", () => {
    // spec §0: never show numbering to player
    for (const c of NOTE_CONTENTS) {
      expect(c.body).not.toMatch(/内容\s*[1-9]/);
      expect(c.body).not.toMatch(/^\s*[1-9][.、]/);
    }
  });

  it("ids follow note-content-1..9 pattern", () => {
    for (let i = 0; i < 9; i += 1) {
      expect(NOTE_CONTENTS[i]!.id).toBe(`note-content-${i + 1}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/forgottenSanity/notes/note-content.test.ts`
Expected: FAIL with "Failed to resolve import" or "NOTE_CONTENTS is not exported".

- [ ] **Step 3: Write minimal implementation**

Create `src/forgottenSanity/notes/noteContent.ts`:

```typescript
// src/forgottenSanity/notes/noteContent.ts
// 遗落的纸条内容数据（9 条，纯 TS，无 Phaser import）。
// spec §3：正文按用户原文照存，无标题、无编号。部分内容自带开头，部分为裸陈述。

export interface NoteContent {
  readonly id: string;   // "note-content-1" .. "note-content-9"
  readonly body: string; // 原文全文，无标题、无编号
}

export const NOTE_CONTENT_COUNT = 9;

export const NOTE_CONTENTS: readonly NoteContent[] = [
  {
    id: "note-content-1",
    body: "天气晴\n今天我上午去单位上班，把yokua波的持续观测搞定了，下午听说他妈的竟然敢这么干，我他妈的不干了。",
  },
  {
    id: "note-content-2",
    body: "研究员 U497261 需要离开，预计原因为心脏骤停。",
  },
  {
    id: "note-content-3",
    body: "已向***方位发送 yokua 波，正在持续观测。",
  },
  {
    id: "note-content-4",
    body: "已造成严重影响，需要发射***。",
  },
  {
    id: "note-content-5",
    body: "敬爱的楚博士：\n经过多日的观察，共发现一个实验体 185296 出现了「神迹」与严重的暴力倾向，借此向您询问后续方向。",
  },
  {
    id: "note-content-6",
    body: "敬爱的楚博士：\n收到，正在持续监测。",
  },
  {
    id: "note-content-7",
    body: "敬爱的楚博士：\n特殊实验体 185296 已自行完成分离，保留结果为 185296-2。",
  },
  {
    id: "note-content-8",
    body: "实验体 185297 发生特殊变化，需要注意。",
  },
  {
    id: "note-content-9",
    body: "实验体 185297 已确认遗失部分人类特征，无明显正面效果，yokua 负面案例已发现。",
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/forgottenSanity/notes/note-content.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/notes/noteContent.ts src/tests/forgottenSanity/notes/note-content.test.ts
git commit -m "feat(forgotten-sanity): add note content data module (9 contents)"
```

---

## Task 2: Notes state persistence

**Files:**
- Modify: `src/forgottenSanity/state/forgottenSanityState.ts`
- Test: `src/tests/forgottenSanity/notes/notes-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/forgottenSanity/notes/notes-state.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/forgottenSanity/notes/notes-state.test.ts`
Expected: FAIL with "FORGOTTEN_SANITY_NOTES_STORAGE_KEY is not exported" or similar.

- [ ] **Step 3: Write minimal implementation**

In `src/forgottenSanity/state/forgottenSanityState.ts`, add after line 8 (`FORGOTTEN_SANITY_PROGRESS_STORAGE_KEY`):

```typescript
export const FORGOTTEN_SANITY_NOTES_STORAGE_KEY = 'ying-zhong-jiu.forgotten-sanity.notes.v1';
```

Add after the `ForgottenSanityProgressState` interface (after line 46):

```typescript
export interface ForgottenSanityNotesState {
  readonly schemaVersion: number;
  readonly nextSequentialIndex: number;
}
```

Add after `isProgressState` (after line 119):

```typescript
export function isNotesState(value: unknown): value is ForgottenSanityNotesState {
  if (!isRecord(value)) return false;
  if (typeof value.nextSequentialIndex !== 'number') return false;
  if (!Number.isFinite(value.nextSequentialIndex)) return false;
  if (!Number.isInteger(value.nextSequentialIndex)) return false;
  if (value.nextSequentialIndex < 0) return false;
  return true;
}
```

Add after `createDefaultProgressState` (after line 215):

```typescript
export function createDefaultNotesState(): ForgottenSanityNotesState {
  return { schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION, nextSequentialIndex: 0 };
}
```

Add after `loadProgressState` (after line 231):

```typescript
export function loadNotesState(storage: Storage = localStorage): ForgottenSanityLoadResult<ForgottenSanityNotesState> {
  return loadTypedInternal(storage, FORGOTTEN_SANITY_NOTES_STORAGE_KEY, isNotesState, createDefaultNotesState);
}
```

Add after `saveProgressState` (after line 247):

```typescript
export function saveNotesState(state: ForgottenSanityNotesState, storage: Storage = localStorage): void {
  storage.setItem(FORGOTTEN_SANITY_NOTES_STORAGE_KEY, JSON.stringify(state));
}
```

(`atomicSaveMulti` already exists at lines 253-275; the test imports it for coverage.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/forgottenSanity/notes/notes-state.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 6: Commit**

```bash
git add src/forgottenSanity/state/forgottenSanityState.ts src/tests/forgottenSanity/notes/notes-state.test.ts
git commit -m "feat(forgotten-sanity): add notes state persistence (5th localStorage key)"
```

---

## Task 3: Content assignment pure function

**Files:**
- Create: `src/forgottenSanity/notes/assignNoteContent.ts`
- Test: `src/tests/forgottenSanity/notes/assign-note-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/forgottenSanity/notes/assign-note-content.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/forgottenSanity/notes/assign-note-content.test.ts`
Expected: FAIL with "assignNoteContent is not exported".

- [ ] **Step 3: Write minimal implementation**

Create `src/forgottenSanity/notes/assignNoteContent.ts`:

```typescript
// src/forgottenSanity/notes/assignNoteContent.ts
// 纯函数：根据持久化 nextSequentialIndex、本局 readNoteInstancesThisRun、instanceId 决定
// 某张纸条实例本次阅读应显示的内容索引。
// spec §4：每张实例首次阅读锁定；重读返回锁定值不推进；顺序阶段推进并持久化；
//          随机阶段（nextSequentialIndex >= 9）不持久化、不去重。

import { NOTE_CONTENT_COUNT } from "./noteContent";

export interface AssignNoteContentInput {
  /** 跨局持久化的「下一条顺序索引」（0..9）。>=9 表示已看完全部，进入随机阶段。 */
  readonly nextSequentialIndex: number;
  /** 本局已读纸条实例 -> 锁定的内容索引。本局内存，不持久化。 */
  readonly readThisRun: Map<string, number>;
  /** 当前正在阅读的纸条实例 ID。 */
  readonly instanceId: string;
  /** [0, 1) 随机数生成器（随机阶段用）。 */
  readonly rng: () => number;
}

export interface AssignNoteContentResult {
  /** 本次阅读应显示的内容索引（0..8）。 */
  readonly contentIndex: number;
  /** 调用后应写入持久化的新 nextSequentialIndex。 */
  readonly newNextSequentialIndex: number;
  /** 是否需要持久化 newNextSequentialIndex（仅顺序阶段首次阅读为 true）。 */
  readonly persisted: boolean;
}

export function assignNoteContent(input: AssignNoteContentInput): AssignNoteContentResult {
  const { nextSequentialIndex, readThisRun, instanceId, rng } = input;

  // 重读：返回本局锁定值，不推进，不持久化
  const locked = readThisRun.get(instanceId);
  if (locked !== undefined) {
    return { contentIndex: locked, newNextSequentialIndex: nextSequentialIndex, persisted: false };
  }

  // 随机阶段：从未看过的内容中均匀随机；本局锁定但不持久化、不推进
  if (nextSequentialIndex >= NOTE_CONTENT_COUNT) {
    const contentIndex = Math.floor(rng() * NOTE_CONTENT_COUNT);
    return { contentIndex, newNextSequentialIndex: nextSequentialIndex, persisted: false };
  }

  // 顺序阶段：分配当前索引，推进，持久化
  return {
    contentIndex: nextSequentialIndex,
    newNextSequentialIndex: nextSequentialIndex + 1,
    persisted: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/forgottenSanity/notes/assign-note-content.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/notes/assignNoteContent.ts src/tests/forgottenSanity/notes/assign-note-content.test.ts
git commit -m "feat(forgotten-sanity): add note content assignment pure function"
```

---

## Task 4: Map state schema (ForgottenSanityNoteSpawn + manifest.notes)

**Files:**
- Modify: `src/forgottenSanity/map/forgottenSanityMapState.ts`

This task adds type definitions only. No test (covered by generator test in Task 5).

- [ ] **Step 1: Add the ForgottenSanityNoteSpawn interface**

In `src/forgottenSanity/map/forgottenSanityMapState.ts`, add after the `ForgottenSanityChestSpawn` interface (after line 93):

```typescript
export interface ForgottenSanityNoteSpawn {
  readonly id: string;          // 如 "note-0", "note-1"
  readonly roomId: string;
  readonly bounds: ForgottenSanityRect; // { x, y, width: 48, height: 48 }，中心点为放置坐标
}
```

- [ ] **Step 2: Add notes field to ForgottenSanityMapManifest**

In the same file, modify the `ForgottenSanityMapManifest` interface. After `readonly chests: readonly ForgottenSanityChestSpawn[];` (line 114), add:

```typescript
  readonly notes: readonly ForgottenSanityNoteSpawn[];
```

- [ ] **Step 3: Run typecheck to find all callers that construct a manifest**

Run: `npx tsc --noEmit`
Expected: FAIL with errors in `ForgottenSanityMapGenerator.ts` (the `generateForgottenSanityMap` return literal missing `notes`). This is expected — Task 6 fixes it. Note the exact error lines for Task 6.

- [ ] **Step 4: Commit (type-only, intentionally leaves tsc red until Task 6)**

```bash
git add src/forgottenSanity/map/forgottenSanityMapState.ts
git commit -m "feat(forgotten-sanity): add ForgottenSanityNoteSpawn type + manifest.notes field"
```

---

## Task 5: distributeNotes generator function

**Files:**
- Modify: `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts`
- Test: `src/tests/forgottenSanity/notes/distribute-notes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/forgottenSanity/notes/distribute-notes.test.ts`:

```typescript
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
  // walkableBounds inset by 12px wall thickness, larger than 48px note
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
    // Run many seeds, assert count is always in [2,5]
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
    // Tiny room that can only fit a few notes before spacing constraint fails
    const rng = createRng(3);
    const rooms = [makeRoom("r1", "classroom", 0, 0, 200, 200)];
    const notes = distributeNotes(rng, rooms, []);
    // Should place fewer than 2 without throwing (spec §2 容错)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/forgottenSanity/notes/distribute-notes.test.ts`
Expected: FAIL with "distributeNotes is not exported".

- [ ] **Step 3: Write minimal implementation**

In `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts`, first update the import block at top (lines 4-26) to also import `ForgottenSanityNoteSpawn`. Add `type ForgottenSanityNoteSpawn,` to the existing import list from `./forgottenSanityMapState`.

Then add after the `distributeChests` function (after line 605), before `generateForgottenSanityMap`:

```typescript
// ---------------------------------------------------------------------------
// distributeNotes (spec §2 — 遗落的纸条)
// 每局纯随机 2-5 张，排除 entrance/exit/vault，spawnPoint ± 80px 抖动，
// 与宝箱 60px / 纸条之间 120px 间距，落在 walkableBounds 内。
// 容错：合法位置不足时少放，可为 0，不抛错。
// ---------------------------------------------------------------------------
const NOTE_SIZE = 48;
const NOTE_JITTER = 80;
const NOTE_MIN_DIST = 120;
const NOTE_CHEST_MIN_DIST = 60;
const NOTE_RETRY_LIMIT = 8;
const ALLOWED_NOTE_ROOM_KINDS: readonly ForgottenSanityRoomKind[] = [
  'classroom', 'trap', 'dark', 'switchRoom', 'hall',
];

function pointInRect(x: number, y: number, rect: ForgottenSanityRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function distributeNotes(
  rng: Rng,
  rooms: readonly ForgottenSanityRoom[],
  chests: readonly ForgottenSanityChestSpawn[],
): readonly ForgottenSanityNoteSpawn[] {
  const notes: ForgottenSanityNoteSpawn[] = [];
  const count = 2 + Math.floor(rng.next() * 4); // 纯随机 2-5

  const eligible = rooms.filter((r) => ALLOWED_NOTE_ROOM_KINDS.includes(r.kind));
  if (eligible.length === 0) return notes;

  for (let i = 0; i < count; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < NOTE_RETRY_LIMIT && !placed; attempt += 1) {
      const room = rng.pick(eligible);
      const wb = room.walkableBounds;
      const cx = room.spawnPoint.x + (rng.next() * 2 - 1) * NOTE_JITTER;
      const cy = room.spawnPoint.y + (rng.next() * 2 - 1) * NOTE_JITTER;
      // 中心点必须在 walkableBounds 内（留 NOTE_SIZE/2 余量）
      const minX = wb.x + NOTE_SIZE / 2;
      const maxX = wb.x + wb.width - NOTE_SIZE / 2;
      const minY = wb.y + NOTE_SIZE / 2;
      const maxY = wb.y + wb.height - NOTE_SIZE / 2;
      if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue;

      // 与已有纸条最小间距 120px
      let tooClose = false;
      for (const n of notes) {
        const nx = n.bounds.x + NOTE_SIZE / 2;
        const ny = n.bounds.y + NOTE_SIZE / 2;
        if (Math.hypot(nx - cx, ny - cy) < NOTE_MIN_DIST) { tooClose = true; break; }
      }
      if (tooClose) continue;

      // 与宝箱最小间距 60px
      for (const c of chests) {
        const ccx = c.bounds.x + c.bounds.width / 2;
        const ccy = c.bounds.y + c.bounds.height / 2;
        if (Math.hypot(ccx - cx, ccy - cy) < NOTE_CHEST_MIN_DIST) { tooClose = true; break; }
      }
      if (tooClose) continue;

      notes.push({
        id: `note-${i}`,
        roomId: room.id,
        bounds: { x: cx - NOTE_SIZE / 2, y: cy - NOTE_SIZE / 2, width: NOTE_SIZE, height: NOTE_SIZE },
      });
      placed = true;
    }
    // 若 NOTE_RETRY_LIMIT 次仍找不到合法位置，跳过此 i（容错：少放）
  }

  return notes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/forgottenSanity/notes/distribute-notes.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/forgottenSanity/map/ForgottenSanityMapGenerator.ts src/tests/forgottenSanity/notes/distribute-notes.test.ts
git commit -m "feat(forgotten-sanity): add distributeNotes generator (2-5 random notes)"
```

---

## Task 6: Wire distributeNotes into generateForgottenSanityMap

**Files:**
- Modify: `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts`

- [ ] **Step 1: Update generateForgottenSanityMap to call distributeNotes**

In `src/forgottenSanity/map/ForgottenSanityMapGenerator.ts`, in the `generateForgottenSanityMap` function (around line 624), find:

```typescript
  const chests = distributeChests(rng, rooms, vaultRoomId, hallRoomId);
  const baselineSanity = computeBaselineSanity(roomCount);
```

Replace with:

```typescript
  const chests = distributeChests(rng, rooms, vaultRoomId, hallRoomId);
  const notes = distributeNotes(rng, rooms, chests);
  const baselineSanity = computeBaselineSanity(roomCount);
```

- [ ] **Step 2: Add notes to the manifest return literal**

In the same function, find the `return {` block (around line 650). After `chests,` (line 658), add `notes,`:

```typescript
  return {
    id: 'ying-zhong-jiu-forgotten-sanity',
    seed,
    roomCount,
    bounds: { x: 0, y: 0, width: FORGOTTEN_SANITY_MAP_WIDTH, height: FORGOTTEN_SANITY_MAP_HEIGHT },
    grid: { cols: GRID_COLS, rows: GRID_ROWS, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT },
    rooms,
    corridors,
    doors,
    chests,
    notes,
    entranceRoomId,
    exitRoomId,
    vaultRoomId,
    hallRoomId,
    baselineSanity,
    floorTile: { tileWidth: FLOOR_TILE_SIZE, tileHeight: FLOOR_TILE_SIZE },
  };
```

(If the existing literal already has `floorTile`, preserve it. The key change is inserting `notes,` after `chests,`.)

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (Task 4's red error should now be resolved). If other files construct a manifest literal manually (e.g. in tests), fix them by adding `notes: []`.

- [ ] **Step 4: Run existing map-generator tests to detect seed-based breakage**

Run: `npx vitest run src/tests/forgottenSanity/map/forgotten-sanity-map-generator.test.ts`
Expected: Most tests PASS. If any test asserts the exact chest distribution for a fixed seed, it should still pass because `distributeNotes` runs AFTER `distributeChests` and does not retroactively modify chests. If a test fails because it asserts `Object.keys(manifest)` or deep-equals the manifest shape, update that test to include `notes`. Read the failing assertion and add `notes` to expected shape — do NOT skip the test.

- [ ] **Step 5: Run all forgottenSanity tests**

Run: `npx vitest run src/tests/forgottenSanity/`
Expected: PASS (all pre-existing + new tests).

- [ ] **Step 6: Commit**

```bash
git add src/forgottenSanity/map/ForgottenSanityMapGenerator.ts
git commit -m "feat(forgotten-sanity): wire distributeNotes into generateForgottenSanityMap"
```

---

## Task 7: Asset registration (note.遗落的纸条)

**Files:**
- Modify: `src/data/assets.ts`
- Modify: `src/data/assets.test.ts`

- [ ] **Step 1: Update the failing test first**

In `src/data/assets.test.ts`, add to `expectedFinalAssetPaths` array (insert alphabetically near the other `被遗忘的理智-记忆碎片/` paths — there are none currently, so add after line 145 `"最终素材/记忆碎片/黑色毕业照.png",` and before the closing `];`):

```typescript
  "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png",
```

Also update the count assertion on line 154 from `135` to `136`:

```typescript
    expect(assetManifest).toHaveLength(136);
```

- [ ] **Step 2: Add an explicit note.* count assertion**

After the `asset manifest` describe block's first `it()` (the one that checks 136 length), add a new test:

```typescript
  it("has exactly 1 note.* entry", () => {
    const noteEntries = assetManifest.filter((a) => a.key.startsWith("note."));
    expect(noteEntries).toHaveLength(1);
    expect(noteEntries[0]!.key).toBe("note.遗落的纸条");
    expect(noteEntries[0]!.path).toBe("最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png");
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/assets.test.ts`
Expected: FAIL with length mismatch (135 vs 136) and note.* entry not found.

- [ ] **Step 4: Add the manifest entry**

In `src/data/assets.ts`, find the last `loot.*` entry (around line 1094, before the `sprite.forgottenSanity.*` entries that start at line 1095). Insert immediately before the first `sprite.forgottenSanity.*` entry:

```typescript
  {
    key: "note.遗落的纸条",
    path: "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png",
    kind: "image",
    mimeType: "image/png",
    width: 512,
    height: 512,
    usage: "Forgotten Sanity mode lost note map sprite.",
    productionStatus: "FINAL_ASSET",
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/assets.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the asset file exists on disk**

Run: `ls -la "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png"`
Expected: File exists (verified earlier as 512×512 RGBA PNG, 91622 bytes).

- [ ] **Step 7: Verify the asset gets copied to public/ via the build pipeline**

Run: `npx vite build 2>&1 | head -50`
Expected: Build succeeds. Confirm `public/assets/final/被遗忘的理智-记忆碎片/遗落的纸条.png` exists (check `assetUrls.ts` `sourcePathToPublicAssetPath` strips `最终素材/` and prepends `/assets/final/`):

Run: `ls -la "public/assets/final/被遗忘的理智-记忆碎片/遗落的纸条.png" 2>&1 || ls public/assets/final/ | head`

If the file is not in `public/assets/final/`, find the existing copy script (likely a vite plugin in `vite.config.ts` or a prebuild step) and confirm it handles the `被遗忘的理智-记忆碎片/` subdirectory. If missing, copy the file manually as a one-time bootstrap:

```bash
mkdir -p "public/assets/final/被遗忘的理智-记忆碎片"
cp "最终素材/被遗忘的理智-记忆碎片/遗落的纸条.png" "public/assets/final/被遗忘的理智-记忆碎片/遗落的纸条.png"
```

- [ ] **Step 8: Run production art gate test**

Run: `npx vitest run src/tests/production-art-gate.test.ts`
Expected: PASS. If it fails because it enumerates all FINAL_ASSET paths, add the new path to its expected list (read the test to see what it asserts).

- [ ] **Step 9: Commit**

```bash
git add src/data/assets.ts src/data/assets.test.ts
git commit -m "feat(forgotten-sanity): register note.遗落的纸条 asset (note.* prefix)"
```

---

## Task 8: NoteOverlay UI component

**Files:**
- Create: `src/forgottenSanity/ui/NoteOverlay.ts`

This task creates the overlay class. UI behavior is exercised in E2E (Task 13); unit test is minimal because Phaser text objects need a scene.

- [ ] **Step 1: Create NoteOverlay.ts**

Create `src/forgottenSanity/ui/NoteOverlay.ts`:

```typescript
// src/forgottenSanity/ui/NoteOverlay.ts
// 遗落的纸条全屏阅读覆盖层（spec §7）。
// 仿 SettlementScreen：屏幕空间（setScrollFactor(0)），默认隐藏。
// 不显示任何标题、贴图、编号。仅正文 + 「收起」按钮。
import type Phaser from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT } from '../../game/scaffoldState';
import { UI_THEME, applyPixelStrokeStyle, applyPixelTextStyle } from '../../ui/uiTheme';

export const NOTE_BG_DEPTH = 1980;
export const NOTE_TEXT_DEPTH = 1982;
export const NOTE_BTN_DEPTH = 1983;

export interface NoteOverlayCallbacks {
  readonly onClose: () => void;
}

export class NoteOverlay {
  private bg: Phaser.GameObjects.Rectangle | null = null;
  private bodyText: Phaser.GameObjects.Text | null = null;
  private closeBtn: Phaser.GameObjects.Rectangle | null = null;
  private closeLabel: Phaser.GameObjects.Text | null = null;
  private visible = false;

  constructor(private scene: Phaser.Scene, private callbacks: NoteOverlayCallbacks) {}

  create(): void {
    this.bg = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 200, GAME_HEIGHT - 160,
      UI_THEME.colors.surface, 0.97,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_BG_DEPTH).setVisible(false);
    applyPixelStrokeStyle(this.bg, UI_THEME.stroke.medium, UI_THEME.colors.gold, 0.95);

    this.bodyText = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '',
      {
        align: 'left',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
        wordWrap: { width: GAME_WIDTH - 320 },
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_TEXT_DEPTH).setVisible(false);

    this.closeBtn = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, 160, 44, UI_THEME.colors.accent,
    )
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_BTN_DEPTH)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    applyPixelStrokeStyle(this.closeBtn, UI_THEME.stroke.thin, UI_THEME.colors.gold, 0.9);
    this.closeBtn.on('pointerup', () => {
      this.hide();
      this.callbacks.onClose();
    });

    this.closeLabel = applyPixelTextStyle(this.scene.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 100, '收起',
      {
        align: 'center',
        color: UI_THEME.colors.text,
        fontFamily: UI_THEME.font.ui,
        fontSize: '18px',
      },
    ))
      .setOrigin(0.5).setScrollFactor(0).setDepth(NOTE_TEXT_DEPTH).setVisible(false);
  }

  show(body: string): void {
    this.visible = true;
    this.bg?.setVisible(true);
    this.bodyText?.setVisible(true).setText(body);
    this.closeBtn?.setVisible(true);
    this.closeLabel?.setVisible(true);
  }

  hide(): void {
    this.visible = false;
    this.bg?.setVisible(false);
    this.bodyText?.setVisible(false);
    this.closeBtn?.setVisible(false);
    this.closeLabel?.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    this.bg?.destroy();
    this.bodyText?.destroy();
    this.closeBtn?.destroy();
    this.closeLabel?.destroy();
    this.bg = null;
    this.bodyText = null;
    this.closeBtn = null;
    this.closeLabel = null;
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/forgottenSanity/ui/NoteOverlay.ts
git commit -m "feat(forgotten-sanity): add NoteOverlay full-screen text component"
```

---

## Task 9: MapRenderer note sprite rendering

**Files:**
- Modify: `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts`

- [ ] **Step 1: Read the existing chest rendering code in ForgottenSanityMapRenderer.ts**

Run: `npx vitest run src/tests/forgottenSanity/map/forgotten-sanity-map-renderer.test.ts`
Then read `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts` to find the `renderChests` (or similar) method. Note the exact method name and where it's called from `create()` / `render()`.

Use Grep to find it:

```bash
# Use Grep tool with pattern "chest" in src/forgottenSanity/map/ForgottenSanityMapRenderer.ts
```

- [ ] **Step 2: Add a renderNotes method mirroring renderChests**

In `src/forgottenSanity/map/ForgottenSanityMapRenderer.ts`, add a method `renderNotes()` that iterates `this.manifest.notes`, renders each as a 48×48 sprite at depth 3 with key `note.遗落的纸条`, falling back to a graphics rectangle when the texture is missing. Pattern (adapt to match the existing `renderChests` style — read it first and mirror exactly):

```typescript
private renderNotes(): void {
  const NOTE_SPRITE_KEY = 'note.遗落的纸条';
  const NOTE_DEPTH = 3;
  for (const note of this.manifest.notes) {
    const cx = note.bounds.x + note.bounds.width / 2;
    const cy = note.bounds.y + note.bounds.height / 2;
    if (this.scene.textures.exists(NOTE_SPRITE_KEY)) {
      const sprite = this.scene.add.image(cx, cy, NOTE_SPRITE_KEY);
      sprite.setDisplaySize(note.bounds.width, note.bounds.height);
      sprite.setOrigin(0.5).setDepth(NOTE_DEPTH);
    } else {
      // fallback: 米色 48x48 矩形 + 暗边
      const g = this.scene.add.graphics();
      g.fillStyle(0xf5f0e1, 1);
      g.lineStyle(2, 0x3a2f25, 1);
      g.fillRect(note.bounds.x, note.bounds.y, note.bounds.width, note.bounds.height);
      g.strokeRect(note.bounds.x, note.bounds.y, note.bounds.width, note.bounds.height);
      g.setDepth(NOTE_DEPTH);
    }
  }
}
```

- [ ] **Step 3: Call renderNotes from the main render method**

Find where `renderChests()` (or the chest-rendering loop) is called in the renderer's `create()` / `render()` method. Add `this.renderNotes();` immediately after that call.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run map renderer tests**

Run: `npx vitest run src/tests/forgottenSanity/map/forgotten-sanity-map-renderer.test.ts`
Expected: PASS. If a test deep-equals the list of game objects created, it may need updating — read the failing assertion and add note sprites to the expected list. Do NOT skip.

- [ ] **Step 6: Commit**

```bash
git add src/forgottenSanity/map/ForgottenSanityMapRenderer.ts
git commit -m "feat(forgotten-sanity): render note sprites on map (depth 3, fallback graphics)"
```

---

## Task 10: RunController note interactions

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts`

- [ ] **Step 1: Add imports and state fields**

In `src/forgottenSanity/ForgottenSanityRunController.ts`, update imports. Add to the existing `import type { ... } from './map/forgottenSanityMapState';` block (around line 35-38):

```typescript
  type ForgottenSanityNoteSpawn,
```

Add new imports after the existing state import (line 57-59):

```typescript
import {
  loadNotesState,
  saveNotesState,
  type ForgottenSanityNotesState,
} from './state/forgottenSanityState';
import { NOTE_CONTENTS } from './notes/noteContent';
import { assignNoteContent } from './notes/assignNoteContent';
import { NoteOverlay } from './ui/NoteOverlay';
```

Add new instance fields after the chest fields (around line 118):

```typescript
  // 遗落的纸条交互（spec §6 / §7）
  private readonly noteHitAreas = new Map<string, Phaser.GameObjects.Zone>();
  private readonly readNoteInstancesThisRun = new Map<string, number>(); // instanceId -> contentIndex
  private noteOverlay: NoteOverlay | null = null;
  private noteOverlayActive = false;
  private notesState: ForgottenSanityNotesState;
```

- [ ] **Step 2: Initialize notesState and create overlay in constructor/init**

Find where `createChestInteractions()` is called in the constructor/init (search for `this.createChestInteractions()` — it's around line 270 area). Add immediately after that call:

```typescript
    this.notesState = loadNotesState().state;
    this.createNoteInteractions();
    this.noteOverlay = new NoteOverlay(this.scene, { onClose: () => this.closeNoteOverlay() });
    this.noteOverlay.create();
```

Add the constant near the other distance constants (around line 73-74):

```typescript
const NOTE_INTERACT_DISTANCE = 80;
```

- [ ] **Step 3: Add createNoteInteractions, findNearestNote, startReadNote, closeNoteOverlay methods**

Add these methods near `createChestInteractions` (after line 703):

```typescript
  // ───────────────────────────────────────────────────────────────────
  // 遗落的纸条交互（spec §6）
  // ───────────────────────────────────────────────────────────────────
  private createNoteInteractions(): void {
    for (const note of this.manifest.notes) {
      const cx = note.bounds.x + note.bounds.width / 2;
      const cy = note.bounds.y + note.bounds.height / 2;
      const zone = this.scene.add.zone(cx, cy, NOTE_INTERACT_DISTANCE * 2, NOTE_INTERACT_DISTANCE * 2);
      zone.setInteractive();
      this.noteHitAreas.set(note.id, zone);
    }
  }

  private findNearestNote(): ForgottenSanityNoteSpawn | null {
    let nearest: ForgottenSanityNoteSpawn | null = null;
    let nearestDist = Infinity;
    for (const note of this.manifest.notes) {
      const cx = note.bounds.x + note.bounds.width / 2;
      const cy = note.bounds.y + note.bounds.height / 2;
      const dist = Math.sqrt((cx - this.playerX) ** 2 + (cy - this.playerY) ** 2);
      if (dist < NOTE_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = note;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private startReadNote(note: ForgottenSanityNoteSpawn): void {
    if (this.noteOverlayActive) return;
    const result = assignNoteContent({
      nextSequentialIndex: this.notesState.nextSequentialIndex,
      readThisRun: this.readNoteInstancesThisRun,
      instanceId: note.id,
      rng: this.rng.next.bind(this.rng),
    });
    this.readNoteInstancesThisRun.set(note.id, result.contentIndex);
    if (result.persisted) {
      this.notesState = { schemaVersion: this.notesState.schemaVersion, nextSequentialIndex: result.newNextSequentialIndex };
      saveNotesState(this.notesState);
    }
    const content = NOTE_CONTENTS[result.contentIndex]!;
    this.combatManager.setFrozen(true);
    this.noteOverlayActive = true;
    this.noteOverlay?.show(content.body);
  }

  private closeNoteOverlay(): void {
    if (!this.noteOverlayActive) return;
    this.noteOverlay?.hide();
    this.noteOverlayActive = false;
    this.combatManager.setFrozen(false);
  }

  /** spec §11 测试钩子：返回当前 note overlay 是否可见。 */
  public isNoteOverlayActiveForTest(): boolean {
    return this.noteOverlayActive;
  }
```

- [ ] **Step 4: Add note branches to onInteractPressed**

Find `onInteractPressed` (around line 542). Read its current body. Update it to add the note branches per spec §6:

```typescript
  private onInteractPressed(): void {
    if (this.player.isDead) return;
    // 0. 阅读中再按 H 关闭
    if (this.noteOverlayActive) { this.closeNoteOverlay(); return; }
    // 1. 宝箱解密进行中
    if (this.activeChestId !== null) return;
    // 2. 最近宝箱
    const chest = this.findNearestChest();
    if (chest !== null) { this.startChestDecrypt(chest); return; }
    // 3. 最近纸条（spec §6）
    const note = this.findNearestNote();
    if (note !== null) { this.startReadNote(note); return; }
    // 4. 金库门
    if (this.distanceToVaultDoor() <= EXIT_INTERACT_DISTANCE) { this.tryUnlockVaultDoor(); return; }
    // 5. 出口
    if (this.distanceToExit() <= EXIT_INTERACT_DISTANCE) { this.runEvacuation(); }
  }
```

(If the existing `onInteractPressed` already has the chest/vault/exit branches, only insert the two new lines: the `if (this.noteOverlayActive)` block at top and the `findNearestNote` block between chest and vault door. Preserve any other branches already present.)

- [ ] **Step 5: Gate movement and attack while note overlay is active**

In `handleMovement` (around line 397), at the very top add:

```typescript
    if (this.noteOverlayActive) return;
```

In `onAttackPressed` and `onUltimatePressed` (find them via Grep), at the very top of each add:

```typescript
    if (this.noteOverlayActive) return;
```

- [ ] **Step 6: Destroy note overlay in destroy()**

Find the `destroy()` method (search for `destroy():` in the file). Add `this.noteOverlay?.destroy(); this.noteOverlay = null;` to it.

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Run all forgottenSanity unit tests**

Run: `npx vitest run src/tests/forgottenSanity/`
Expected: PASS (no regressions).

- [ ] **Step 9: Commit**

```bash
git add src/forgottenSanity/ForgottenSanityRunController.ts
git commit -m "feat(forgotten-sanity): wire note interactions into RunController (H key, overlay, freeze)"
```

---

## Task 11: RunController test hooks (*ForTest methods)

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityRunController.ts`

- [ ] **Step 1: Add *ForTest public methods**

In `src/forgottenSanity/ForgottenSanityRunController.ts`, add near the other `*ForTest` methods (after `movePlayerToForTest`, around line 879):

```typescript
  /** spec §11 测试钩子：强制在某房间生成一张纸条实例（覆盖本局 manifest.notes）。 */
  public spawnNoteForTest(roomId: string): void {
    const room = this.manifest.rooms.find((r) => r.id === roomId);
    if (room === undefined) return;
    const noteId = `note-test-${this.noteHitAreas.size}`;
    const fakeNote: ForgottenSanityNoteSpawn = {
      id: noteId,
      roomId,
      bounds: {
        x: room.spawnPoint.x - 24,
        y: room.spawnPoint.y - 24,
        width: 48,
        height: 48,
      },
    };
    // 注入到 manifest.notes（cast off readonly for test-only mutation）
    (this.manifest as { notes: ForgottenSanityNoteSpawn[] }).notes = [
      ...this.manifest.notes,
      fakeNote,
    ];
    const cx = fakeNote.bounds.x + 24;
    const cy = fakeNote.bounds.y + 24;
    const zone = this.scene.add.zone(cx, cy, NOTE_INTERACT_DISTANCE * 2, NOTE_INTERACT_DISTANCE * 2);
    zone.setInteractive();
    this.noteHitAreas.set(noteId, zone);
  }

  /** spec §11 测试钩子：返回当前 note 阅读进度。 */
  public getNoteStateForTest(): { nextSequentialIndex: number; readThisRun: string[] } {
    return {
      nextSequentialIndex: this.notesState.nextSequentialIndex,
      readThisRun: [...this.readNoteInstancesThisRun.keys()],
    };
  }

  /** spec §11 测试钩子：模拟按 H 读最近纸条。返回是否成功打开 overlay。 */
  public readNearestNoteForTest(): boolean {
    if (this.noteOverlayActive) return false;
    const note = this.findNearestNote();
    if (note === null) return false;
    this.startReadNote(note);
    return this.noteOverlayActive;
  }

  /** spec §11 测试钩子：把玩家瞬移到最近的纸条旁。 */
  public movePlayerToNoteForTest(): void {
    if (this.manifest.notes.length === 0) return;
    const note = this.manifest.notes[0]!;
    this.playerX = note.bounds.x + 24;
    this.playerY = note.bounds.y + 24;
    this.playerSprite?.setPosition(this.playerX, this.playerY);
  }

  /** spec §11 测试钩子：直接覆盖持久化 notesState（仅测试用）。 */
  public forceNotesStateForTest(nextSequentialIndex: number): void {
    this.notesState = { schemaVersion: this.notesState.schemaVersion, nextSequentialIndex };
    saveNotesState(this.notesState);
  }
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/forgottenSanity/ForgottenSanityRunController.ts
git commit -m "feat(forgotten-sanity): add note test hooks on RunController"
```

---

## Task 12: ForgottenSanityScene test hook mounting + handleEsc update

**Files:**
- Modify: `src/forgottenSanity/ForgottenSanityScene.ts`

- [ ] **Step 1: Extend ForgottenSanityTestHooks interface**

In `src/forgottenSanity/ForgottenSanityScene.ts`, update the `ForgottenSanityTestHooks` interface (lines 33-44) by adding these new members before the closing `}`:

```typescript
  __testSpawnNote(roomId: string): void;
  __testGetNoteState(): { nextSequentialIndex: number; readThisRun: string[] };
  __testReadNearestNote(): boolean;
  __testIsNoteOverlayVisible(): boolean;
  __testMovePlayerToNote(): void;
  __testForceNotesState(nextSequentialIndex: number): void;
```

- [ ] **Step 2: Mount the new hooks in create()**

In the `if (import.meta.env.DEV || process.env.NODE_ENV === 'test')` block (around line 180-226), add the new hook implementations to the `hooks` object literal, before `__testTogglePause`:

```typescript
        __testSpawnNote: (roomId) => {
          const ctrl = this.runController as unknown as { spawnNoteForTest?: (rId: string) => void } | null;
          ctrl?.spawnNoteForTest?.(roomId);
        },
        __testGetNoteState: () => {
          const ctrl = this.runController as unknown as {
            getNoteStateForTest?: () => { nextSequentialIndex: number; readThisRun: string[] };
          } | null;
          return ctrl?.getNoteStateForTest?.() ?? { nextSequentialIndex: 0, readThisRun: [] };
        },
        __testReadNearestNote: () => {
          const ctrl = this.runController as unknown as { readNearestNoteForTest?: () => boolean } | null;
          return ctrl?.readNearestNoteForTest?.() ?? false;
        },
        __testIsNoteOverlayVisible: () => {
          const ctrl = this.runController as unknown as { isNoteOverlayActiveForTest?: () => boolean } | null;
          return ctrl?.isNoteOverlayActiveForTest?.() ?? false;
        },
        __testMovePlayerToNote: () => {
          const ctrl = this.runController as unknown as { movePlayerToNoteForTest?: () => void } | null;
          ctrl?.movePlayerToNoteForTest?.();
        },
        __testForceNotesState: (nextSequentialIndex) => {
          const ctrl = this.runController as unknown as { forceNotesStateForTest?: (n: number) => void } | null;
          ctrl?.forceNotesStateForTest?.(nextSequentialIndex);
        },
```

- [ ] **Step 3: Update handleEsc to consume ESC when note overlay is active**

In `handleEsc()` (around line 265), update to check note overlay first:

```typescript
  public handleEsc(): void {
    // spec §6: note overlay 打开时 ESC 优先关闭，不落入 PauseMenu
    const ctrl = this.runController as unknown as { isNoteOverlayActiveForTest?: () => boolean; closeNoteOverlay?: () => void } | null;
    if (ctrl?.isNoteOverlayActiveForTest?.() === true) {
      // closeNoteOverlay is private; expose via duck-typing on the public test hook surface
      // Actually, add a public closeNoteOverlayForTest() — see Step 4
      (ctrl as unknown as { closeNoteOverlayForTest?: () => void })?.closeNoteOverlayForTest?.();
      return;
    }
    if (this.minimap?.isBigMapOpen()) {
      this.minimap.toggleBigMap();
      return;
    }
    this.togglePause();
  }
```

- [ ] **Step 4: Add a public closeNoteOverlayForTest method on RunController**

In `src/forgottenSanity/ForgottenSanityRunController.ts`, add a public wrapper near `isNoteOverlayActiveForTest`:

```typescript
  /** spec §11 测试钩子 / handleEsc 用：关闭 note overlay。 */
  public closeNoteOverlayForTest(): void {
    this.closeNoteOverlay();
  }
```

(Then update the `handleEsc` cast in Step 3 to use `closeNoteOverlayForTest` directly without the double cast — simplify to:

```typescript
  public handleEsc(): void {
    if (this.runController?.isNoteOverlayActiveForTest() === true) {
      this.runController.closeNoteOverlayForTest();
      return;
    }
    if (this.minimap?.isBigMapOpen()) {
      this.minimap.toggleBigMap();
      return;
    }
    this.togglePause();
  }
```

This requires `ForgottenSanityRunController` to expose `isNoteOverlayActiveForTest` and `closeNoteOverlayForTest` as public — which Step 4 of Task 11 and the above do.)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run forgotten-sanity-scene tests**

Run: `npx vitest run src/tests/forgottenSanity/forgotten-sanity-scene.test.ts src/tests/forgottenSanity/forgotten-sanity-scenes.test.ts`
Expected: PASS. If a test asserts the exact set of hook keys on `ForgottenSanityTestHooks`, update it to include the 6 new keys.

- [ ] **Step 7: Commit**

```bash
git add src/forgottenSanity/ForgottenSanityScene.ts src/forgottenSanity/ForgottenSanityRunController.ts
git commit -m "feat(forgotten-sanity): mount note test hooks + ESC closes note overlay"
```

---

## Task 13: E2E test spec

**Files:**
- Create: `tests/e2e/forgotten-sanity-notes.spec.ts`

- [ ] **Step 1: Read the existing E2E navigation helper**

Read `tests/e2e/forgotten-sanity-vault-door.spec.ts` to copy the `navigateToRunScene` and `readState` helpers exactly. Note the imports and the `GameWindow` type.

- [ ] **Step 2: Create the E2E spec**

Create `tests/e2e/forgotten-sanity-notes.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";
import type { GameWindow } from "./forgotten-sanity-vault-door.spec";

// 复用 vault-door spec 的导航 + readState 辅助（spec §11.2）
async function navigateToRunScene(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect.poll(
    async () => {
      const s = await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
      return s?.currentScene;
    },
    { timeout: 30_000 },
  ).toBe("GameScene");
  // 点击「被遗忘的理智」按钮（game coords 640, 440 — 同 vault-door spec）
  await page.mouse.click(640, 440);
  await expect.poll(
    async () => (await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_HUB_ACTIVE__)),
    { timeout: 15_000 },
  ).toBe(true);
  // 点击 hub「进入墓穴」面板（game coords 1072, 56）
  await page.mouse.click(1072, 56);
  await expect.poll(
    async () => {
      const s = await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_SCENE_STATE__);
      return s?.forgottenSanity?.scene;
    },
    { timeout: 20_000 },
  ).toBe("run");
}

// 重置 notes 持久化状态，确保测试从 nextSequentialIndex=0 开始
async function resetNotesState(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.removeItem("ying-zhong-jiu.forgotten-sanity.notes.v1");
  });
}

test.describe("遗落的纸条 (Forgotten Sanity lost notes)", () => {
  test.beforeEach(async ({ page }) => {
    await navigateToRunScene(page);
    await resetNotesState(page);
    // 重置后需要重新加载场景以让 RunController 重新读取 notesState
    // 通过放弃并重进实现
    await page.evaluate(() => {
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testForceNotesState(0);
    });
  });

  test("first read advances nextSequentialIndex 0->1, re-read does not advance", async ({ page }) => {
    // 1. 强制生成一张纸条
    await page.evaluate(() => {
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testSpawnNote("entrance");
    });
    // 2. 移动玩家到纸条旁
    await page.evaluate(() => {
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerToNote();
    });
    // 3. 按 H 打开
    await page.keyboard.press("H");
    await expect.poll(
      async () => (await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testIsNoteOverlayVisible())),
      { timeout: 5_000 },
    ).toBe(true);
    // 4. 断言 nextSequentialIndex 0 -> 1
    const after1 = await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetNoteState());
    expect(after1?.nextSequentialIndex).toBe(1);

    // 5. 按 H 关闭
    await page.keyboard.press("H");
    await expect.poll(
      async () => (await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testIsNoteOverlayVisible())),
      { timeout: 5_000 },
    ).toBe(false);

    // 6. 重读：nextSequentialIndex 仍为 1
    await page.keyboard.press("H");
    await page.keyboard.press("H");
    const after2 = await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetNoteState());
    expect(after2?.nextSequentialIndex).toBe(1);
  });

  test("ESC closes the overlay without pausing", async ({ page }) => {
    await page.evaluate(() => {
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testSpawnNote("entrance");
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerToNote();
    });
    await page.keyboard.press("H");
    await expect.poll(
      async () => (await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testIsNoteOverlayVisible())),
      { timeout: 5_000 },
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect.poll(
      async () => (await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testIsNoteOverlayVisible())),
      { timeout: 5_000 },
    ).toBe(false);
  });

  test("persistence across runs: nextSequentialIndex survives scene restart", async ({ page }) => {
    // 读一次，nextSequentialIndex 应为 1
    await page.evaluate(() => {
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testSpawnNote("entrance");
      (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testMovePlayerToNote();
    });
    await page.keyboard.press("H");
    await page.keyboard.press("H");
    const before = await page.evaluate(() => (window as GameWindow).__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__?.__testGetNoteState());
    expect(before?.nextSequentialIndex).toBe(1);

    // localStorage 应持久化了 1
    const stored = await page.evaluate(() => window.localStorage.getItem("ying-zhong-jiu.forgotten-sanity.notes.v1"));
    expect(stored).toContain('"nextSequentialIndex":1');
  });
});
```

- [ ] **Step 3: Run the E2E spec**

Run: `npx playwright test tests/e2e/forgotten-sanity-notes.spec.ts`
Expected: 3 tests PASS. If a test fails due to coordinate drift (the hub panel click at 1072,56 may differ on this codebase), read `tests/e2e/forgotten-sanity-vault-door.spec.ts` for the exact `navigateToRunScene` implementation and copy it verbatim — do not guess coordinates.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/forgotten-sanity-notes.spec.ts
git commit -m "test(forgotten-sanity): add E2E spec for lost notes interaction + persistence"
```

---

## Task 14: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run`
Expected: All tests PASS (pre-existing 21 files + new note files). If any pre-existing test fails due to manifest shape change (Task 4/6 added `notes` field), fix it by adding `notes: []` to the expected manifest literal.

- [ ] **Step 2: Run full E2E suite**

Run: `npx playwright test`
Expected: All 28 pre-existing specs + 3 new note specs PASS.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS (tsc --noEmit + vite build both succeed).

- [ ] **Step 5: Run verify script**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 6: Manual smoke test (if dev server available)**

Run: `npm run dev`
Then in a browser:
1. Click 「被遗忘的理智」 from main menu.
2. Enter a run.
3. Explore rooms until finding a note sprite (米色 48×48 with paper texture).
4. Walk within 80px, press H.
5. Verify full-screen overlay appears with note body text, NO title, NO numbering.
6. Verify ESC and H both close it.
7. Walk away and back, press H again — same content (locked).
8. Find a different note, press H — different content (sequential advance).

- [ ] **Step 7: Final commit (if any test fixes from Step 1-5)**

```bash
git add -A
git commit -m "test(forgotten-sanity): fix pre-existing tests for manifest.notes field"
```

If no fixes needed, skip this step.

---

## Self-Review

**Spec coverage:**
- §0 目标 — Tasks 1-13 implement all 8 bullets.
- §1 归属与刷新时机 — Task 5/6 (per-run via distributeNotes in generateForgottenSanityMap).
- §2 放置规则 — Task 5 (room filter, jitter, dedup, tolerance).
- §3 内容数据 — Task 1 (noteContent.ts with exact 9 bodies).
- §4 内容分配逻辑 — Task 3 (assignNoteContent pure function).
- §5 持久化 — Task 2 (5th localStorage key, no schema bump).
- §6 交互 — Task 10 (H key, onInteractPressed branch, ESC consume in Task 12).
- §7 NoteOverlay — Task 8 (no title, depths 1980-1983, freeze combat).
- §8 地图渲染 — Task 9 (depth 3, fallback graphics).
- §9 资产注册 — Task 7 (note.* prefix, 512×512).
- §10 纯粹风味 — Task 10 (no inventory/stash/flag side effects, only nextSequentialIndex).
- §11 测试与可观测性 — Tasks 1,2,3,5 (unit) + Task 13 (E2E) + Tasks 11,12 (test hooks).
- §12 YAGNI — enforced by not implementing any of the listed anti-features.
- §13 受影响文件清单 — all listed files covered.
- §14 风险与边界 — addressed: RNG order (Task 6 calls after distributeChests), atomic save (Task 2), strict TS (every task runs tsc), existing tests (Task 14 Step 1).

**Placeholder scan:** No TBD/TODO. Every code step shows actual code. Task 9 has one step that says "read the existing renderChests method first" — this is intentional because the exact method name was not verified at plan-writing time; the step instructs the engineer to read before writing, with a complete code template to adapt. Task 13 has a note about copying `navigateToRunScene` verbatim — this is correct because E2E coordinates are environment-specific.

**Type consistency:** `ForgottenSanityNoteSpawn` (Task 4) used consistently in Tasks 5, 9, 10, 11. `assignNoteContent` signature (Task 3) matches usage in Task 10. `NoteOverlay` API (Task 8) matches usage in Task 10. Test hook names in Task 11 (`spawnNoteForTest`, `getNoteStateForTest`, etc.) match Task 12's interface additions. `ForgottenSanityNotesState` (Task 2) used in Tasks 10, 11.

No issues found. Plan ready for execution.
