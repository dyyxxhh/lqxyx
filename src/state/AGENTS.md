# 存档系统 — SaveState

**Scope:** `src/state/`

## STRUCTURE
```
src/state/
└── saveState.ts    # 存档 schema、序列化/反序列化、验证、默认值
```

## WHERE TO LOOK
| Task | File | Notes |
|------|------|-------|
| 改默认初始位置 | `saveState.ts` | `createDefaultSaveState()` — 4F 走廊中心 `560,920,down`，蓝边 |
| 改存档 key | `saveState.ts` | `SAVE_STATE_STORAGE_KEY = 'ying-zhong-jiu.checkpoint-save.v1'` |
| 改存档验证 | `saveState.ts` | `toSaveState()` — 校验 checkpointId/actId/floorId/roomId/characterId |
| 改存档 schema | `saveState.ts` | `SaveState` interface — 含 position / flags / branches / timers / inventory / pickups |

## CONVENTIONS
- **存档 key**: `ying-zhong-jiu.checkpoint-save.v1`，`schemaVersion = 1`。
- **默认值**: checkpoint `A`，act `act-1`，floor `4F`，room `null`，position `{x:560, y:920, facing:'down'}`，character `yangYunBlue`，task `无`，空 flags/branches/timers/inventory/pickups。
- **验证列表**: `validCheckpoints` (A~I), `validActs` (act-1~3), `validFloors` (4F/5F), `validRooms` (7 个), `validCharacters` (6 个), `validBranches` (A-1/A-2/B-1/B-2)。
- **加载结果**: `SaveLoadResult = {status:'valid'|'empty'|'invalid', state:SaveState, reason?:InvalidSaveReason}`。无效时自动回退到默认状态。
- **持久化**: `saveSaveState()` 写 `localStorage`；`loadSaveState()` 读并验证；`clearSaveState()` 删除。
- **调试状态**: `createSaveDebugState()` 暴露 storageKey、schemaVersion、status、hasValidSave、invalidReason、checkpointId、actId。
- **初始位置依据剧本**: 剧本开头 "你现在是杨云（蓝边）" → 默认 `controllableCharacterId: 'yangYunBlue'`，位置在 4F 走廊中心。

## ANTI-PATTERNS
- **Never** 修改存档 schema 而不 bump `SAVE_STATE_SCHEMA_VERSION`。
- **Never** 删除 `localStorage` 中的存档而不通过 `clearSaveState()`。
- **Never** 在 `toSaveState()` 外手动构造 `SaveState` — 可能绕过验证。
