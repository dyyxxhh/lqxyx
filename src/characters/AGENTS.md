# 角色系统 — Characters

**Scope:** `src/characters/`

## STRUCTURE
```
src/characters/
├── CharacterRegistry.ts    # 角色别名、行走/非行走列表、动画配置、方向解析
└── characterState.ts       # 角色类型定义 + 调试状态
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改角色动画帧 | `CharacterRegistry.ts` | `WALK_ANIMATIONS` 配置：up/down 用 `leftLeg/rightLeg`，left/right 用 `step/idle` |
| 改方向解析规则 | `CharacterRegistry.ts` | `resolveDirection()` — 斜向优先取上下方向 |
| 改角色别名 | `CharacterRegistry.ts` | `CHARACTER_ALIASES` — `yangYunBlue`/`yangYunRed` 均显示为 `杨云` |
| 改可行走角色列表 | `CharacterRegistry.ts` | `WALKABLE_CHARACTERS` / `NON_WALKABLE_CHARACTERS` |
| 改调试状态 | `characterState.ts` | `CharacterDebugState` — currentCharacterId / direction / animationKey / isMoving |

## CONVENTIONS
- **角色类型**: `WalkableCharacterId = 'yangYunBlue' | 'yangYunRed' | 'dongJihao'`；`NonWalkableCharacterId = 'danYuxuan' | 'qinHaorui'`；`CharacterId` = 两者 + `'unknown'`。
- **内部 ID 命名**: camelCase + 颜色后缀，如 `yangYunBlue`（蓝边=正常人格）、`yangYunRed`（红边=黑化人格）。两者显示名均为 `杨云`。
- **行走动画配置** (`WalkAnimationConfig`): `{ animationKey, frameKeys[], idleKey }`。
  - 上下方向：`frameKeys = ['...leftLeg', '...rightLeg']`（左右腿交替）
  - 左右方向：`frameKeys = ['...step', '...idle']`（迈步与静止交替）
- **方向解析**: `resolveDirection({x, y})` 规则：
  - `dy !== 0` → `dy < 0 ? 'up' : 'down'`（斜向优先上下）
  - `dy === 0 && dx !== 0` → `dx < 0 ? 'left' : 'right'`
  - 全零 → `'down'`（idle 默认）
- **动画 key 命名**: `walk:<characterId>:<direction>`，如 `walk:yangYunBlue:up`。
- **素材 key 命名**: `sprite.<characterId>.<direction>.<frame>`，如 `sprite.yangYunBlue.right.step`。

## ANTI-PATTERNS
- **Never** 在 `PlayScene` 中直接用 `yangYunRed` 硬编码作为默认角色；始终以 `saveState.controllableCharacterId` 为准。
- **Never** 给非行走角色（`danYuxuan`、`qinHaorui`）添加 `WALK_ANIMATIONS` 配置。
