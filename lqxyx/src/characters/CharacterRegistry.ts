import type {
  CharacterDirection,
  CharacterId,
  NonWalkableCharacterId,
  WalkableCharacterId,
} from './characterState';

// ---------------------------------------------------------------------------
// Aliases
// ---------------------------------------------------------------------------

export const CHARACTER_ALIASES: Record<CharacterId, string> = {
  yangYunBlue: '杨云',
  yangYunRed: '杨云',
  dongJihao: '董继豪',
  danYuxuan: '但宇轩',
  qinHaorui: '秦浩睿',
  unknown: '???',
} as const;

// ---------------------------------------------------------------------------
// Walkable / non-walkable character lists
// ---------------------------------------------------------------------------

export const WALKABLE_CHARACTERS: readonly WalkableCharacterId[] = [
  'yangYunBlue',
  'yangYunRed',
  'dongJihao',
] as const;

export const NON_WALKABLE_CHARACTERS: readonly NonWalkableCharacterId[] = [
  'danYuxuan',
  'qinHaorui',
] as const;

// ---------------------------------------------------------------------------
// Walk animation configs
// ---------------------------------------------------------------------------

export interface WalkAnimationConfig {
  readonly animationKey: string;
  readonly frameKeys: readonly string[];
  readonly idleKey: string;
}

export const WALK_ANIMATIONS: Record<
  WalkableCharacterId,
  Record<CharacterDirection, WalkAnimationConfig>
> = {
  yangYunBlue: {
    up: {
      animationKey: 'walk:yangYunBlue:up',
      frameKeys: [
        'sprite.yangYunBlue.up.leftLeg',
        'sprite.yangYunBlue.up.rightLeg',
      ],
      idleKey: 'sprite.yangYunBlue.up.idle',
    },
    down: {
      animationKey: 'walk:yangYunBlue:down',
      frameKeys: [
        'sprite.yangYunBlue.down.leftLeg',
        'sprite.yangYunBlue.down.rightLeg',
      ],
      idleKey: 'sprite.yangYunBlue.down.idle',
    },
    left: {
      animationKey: 'walk:yangYunBlue:left',
      frameKeys: ['sprite.yangYunBlue.left.step', 'sprite.yangYunBlue.left.idle'],
      idleKey: 'sprite.yangYunBlue.left.idle',
    },
    right: {
      animationKey: 'walk:yangYunBlue:right',
      frameKeys: ['sprite.yangYunBlue.right.step', 'sprite.yangYunBlue.right.idle'],
      idleKey: 'sprite.yangYunBlue.right.idle',
    },
  },
  yangYunRed: {
    up: {
      animationKey: 'walk:yangYunRed:up',
      frameKeys: [
        'sprite.yangYunRed.up.leftLeg',
        'sprite.yangYunRed.up.rightLeg',
      ],
      idleKey: 'sprite.yangYunRed.up.idle',
    },
    down: {
      animationKey: 'walk:yangYunRed:down',
      frameKeys: [
        'sprite.yangYunRed.down.leftLeg',
        'sprite.yangYunRed.down.rightLeg',
      ],
      idleKey: 'sprite.yangYunRed.down.idle',
    },
    left: {
      animationKey: 'walk:yangYunRed:left',
      frameKeys: ['sprite.yangYunRed.left.step', 'sprite.yangYunRed.left.idle'],
      idleKey: 'sprite.yangYunRed.left.idle',
    },
    right: {
      animationKey: 'walk:yangYunRed:right',
      frameKeys: ['sprite.yangYunRed.right.step', 'sprite.yangYunRed.right.idle'],
      idleKey: 'sprite.yangYunRed.right.idle',
    },
  },
  dongJihao: {
    up: {
      animationKey: 'walk:dongJihao:up',
      frameKeys: [
        'sprite.dongJihao.up.leftLeg',
        'sprite.dongJihao.up.rightLeg',
      ],
      idleKey: 'sprite.dongJihao.up.idle',
    },
    down: {
      animationKey: 'walk:dongJihao:down',
      frameKeys: [
        'sprite.dongJihao.down.leftLeg',
        'sprite.dongJihao.down.rightLeg',
      ],
      idleKey: 'sprite.dongJihao.down.idle',
    },
    left: {
      animationKey: 'walk:dongJihao:left',
      frameKeys: ['sprite.dongJihao.left.step', 'sprite.dongJihao.left.idle'],
      idleKey: 'sprite.dongJihao.left.idle',
    },
    right: {
      animationKey: 'walk:dongJihao:right',
      frameKeys: ['sprite.dongJihao.right.step', 'sprite.dongJihao.right.idle'],
      idleKey: 'sprite.dongJihao.right.idle',
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getIdleAnimationKey(
  characterId: WalkableCharacterId,
  direction: CharacterDirection,
): string {
  return WALK_ANIMATIONS[characterId][direction].idleKey;
}

export function getWalkAnimationKey(
  characterId: WalkableCharacterId,
  direction: CharacterDirection,
): string {
  return WALK_ANIMATIONS[characterId][direction].animationKey;
}

/**
 * Resolve a movement vector to a character animation direction.
 *
 * Diagonal rule: vertical (up/down) is preferred when both axes are non-zero.
 * - If dy !== 0  → dy < 0 ? 'up' : 'down'
 * - If dy === 0 && dx !== 0 → dx < 0 ? 'left' : 'right'
 * - If dx === 0 && dy === 0 → 'down' (idle default)
 */
export function resolveDirection(vector: {
  readonly x: number;
  readonly y: number;
}): CharacterDirection {
  if (vector.y !== 0) {
    return vector.y < 0 ? 'up' : 'down';
  }

  if (vector.x !== 0) {
    return vector.x < 0 ? 'left' : 'right';
  }

  return 'down';
}

export function getDisplayName(characterId: CharacterId): string {
  return CHARACTER_ALIASES[characterId];
}

export function isWalkable(
  characterId: CharacterId,
): characterId is WalkableCharacterId {
  return (WALKABLE_CHARACTERS as readonly string[]).includes(characterId);
}
