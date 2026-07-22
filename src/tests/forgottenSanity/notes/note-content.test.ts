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
