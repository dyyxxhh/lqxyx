import { describe, expect, it } from 'vitest';

import { assetManifest } from '../data/assets';
import {
  CHARACTER_ALIASES,
  getDisplayName,
  getIdleAnimationKey,
  getWalkAnimationKey,
  isWalkable,
  NON_WALKABLE_CHARACTERS,
  resolveDirection,
  WALK_ANIMATIONS,
  WALKABLE_CHARACTERS,
  type WalkAnimationConfig,
} from '../characters/CharacterRegistry';
import type { CharacterDirection } from '../characters/characterState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a set of all valid asset keys from the manifest for cross-validation. */
function buildValidAssetKeySet(): Set<string> {
  return new Set(assetManifest.map((entry) => entry.key));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('character walkable / non-walkable lists', () => {
  it('WALKABLE_CHARACTERS has exactly 3 entries: yangYunBlue, yangYunRed, dongJihao', () => {
    expect(WALKABLE_CHARACTERS).toHaveLength(3);
    expect(WALKABLE_CHARACTERS).toContain('yangYunBlue');
    expect(WALKABLE_CHARACTERS).toContain('yangYunRed');
    expect(WALKABLE_CHARACTERS).toContain('dongJihao');
  });

  it('NON_WALKABLE_CHARACTERS includes danYuxuan and qinHaorui — NOT configurable as walkable', () => {
    expect(NON_WALKABLE_CHARACTERS).toHaveLength(2);
    expect(NON_WALKABLE_CHARACTERS).toContain('danYuxuan');
    expect(NON_WALKABLE_CHARACTERS).toContain('qinHaorui');

    // danYuxuan and qinHaorui must NOT appear in WALKABLE_CHARACTERS
    expect(WALKABLE_CHARACTERS).not.toContain('danYuxuan');
    expect(WALKABLE_CHARACTERS).not.toContain('qinHaorui');
  });

  it('isWalkable returns true for walkable IDs, false for non-walkable IDs', () => {
    for (const id of WALKABLE_CHARACTERS) {
      expect(isWalkable(id)).toBe(true);
    }
    for (const id of NON_WALKABLE_CHARACTERS) {
      expect(isWalkable(id)).toBe(false);
    }
    expect(isWalkable('unknown')).toBe(false);
  });
});

describe('display names', () => {
  it('getDisplayName returns "杨云" for both yangYunBlue and yangYunRed', () => {
    expect(getDisplayName('yangYunBlue')).toBe('杨云');
    expect(getDisplayName('yangYunRed')).toBe('杨云');
  });

  it('getDisplayName returns "董继豪" for dongJihao', () => {
    expect(getDisplayName('dongJihao')).toBe('董继豪');
  });

  it('getDisplayName returns "但宇轩" for danYuxuan', () => {
    expect(getDisplayName('danYuxuan')).toBe('但宇轩');
  });

  it('getDisplayName returns "秦浩睿" for qinHaorui', () => {
    expect(getDisplayName('qinHaorui')).toBe('秦浩睿');
  });

  it('getDisplayName NEVER returns "杨云红边" or "杨云蓝边"', () => {
    const allDisplayNames = Object.values(CHARACTER_ALIASES);
    expect(allDisplayNames).not.toContain('杨云红边');
    expect(allDisplayNames).not.toContain('杨云蓝边');
  });

});

describe('resolveDirection — diagonal movement', () => {
  it('cardinal directions', () => {
    expect(resolveDirection({ x: 1, y: 0 })).toBe('right');
    expect(resolveDirection({ x: -1, y: 0 })).toBe('left');
    expect(resolveDirection({ x: 0, y: -1 })).toBe('up');
    expect(resolveDirection({ x: 0, y: 1 })).toBe('down');
  });

  it('diagonal NE/SE/NW/SW — vertical preferred', () => {
    // NE: x=1, y=-1 → up (dy !== 0, dy < 0)
    expect(resolveDirection({ x: 1, y: -1 })).toBe('up');
    // SE: x=1, y=1 → down
    expect(resolveDirection({ x: 1, y: 1 })).toBe('down');
    // NW: x=-1, y=-1 → up
    expect(resolveDirection({ x: -1, y: -1 })).toBe('up');
    // SW: x=-1, y=1 → down
    expect(resolveDirection({ x: -1, y: 1 })).toBe('down');
  });

  it('zero vector returns idle default (down)', () => {
    expect(resolveDirection({ x: 0, y: 0 })).toBe('down');
  });
});

describe('WALK_ANIMATIONS completeness', () => {
  const validKeys = buildValidAssetKeySet();

  it('has up/down/left/right entries for each walkable character', () => {
    for (const characterId of WALKABLE_CHARACTERS) {
      const directions = WALK_ANIMATIONS[characterId];
      const keys = Object.keys(directions).sort();
      expect(keys).toHaveLength(4);
      expect(keys).toContain('up');
      expect(keys).toContain('down');
      expect(keys).toContain('left');
      expect(keys).toContain('right');
    }
  });

  it('all animation frame keys reference valid asset manifest keys', () => {
    for (const characterId of WALKABLE_CHARACTERS) {
      const directions = WALK_ANIMATIONS[characterId];

      for (const [direction, config] of Object.entries(directions) as [
        CharacterDirection,
        WalkAnimationConfig,
      ][]) {
        // Idle key must exist in the manifest
        expect(
          validKeys.has(config.idleKey),
          `${characterId} ${direction}: idle key "${config.idleKey}" not in asset manifest`,
        ).toBe(true);

        // Every frame key must exist in the manifest
        for (const frameKey of config.frameKeys) {
          expect(
            validKeys.has(frameKey),
            `${characterId} ${direction}: frame key "${frameKey}" not in asset manifest`,
          ).toBe(true);
        }
      }
    }
  });

  it('getWalkAnimationKey and getIdleAnimationKey return correct values', () => {
    for (const characterId of WALKABLE_CHARACTERS) {
      for (const direction of ['up', 'down', 'left', 'right'] as CharacterDirection[]) {
        const config = WALK_ANIMATIONS[characterId][direction];

        expect(getWalkAnimationKey(characterId, direction)).toBe(
          config.animationKey,
        );
        expect(getIdleAnimationKey(characterId, direction)).toBe(
          config.idleKey,
        );
      }
    }
  });

  it('left and right walk animations alternate the step frame with the idle frame', () => {
    for (const characterId of WALKABLE_CHARACTERS) {
      for (const direction of ['left', 'right'] as const) {
        const config = WALK_ANIMATIONS[characterId][direction];

        expect(config.frameKeys).toEqual([
          `sprite.${characterId}.${direction}.step`,
          config.idleKey,
        ]);
      }
    }
  });
});
