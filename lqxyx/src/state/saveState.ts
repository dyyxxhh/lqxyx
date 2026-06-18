import type { ActId, BranchId, CharacterId, CheckpointId } from '../data/story';
import type { FloorId, RoomId, SpawnPoint } from '../data/maps';

export const SAVE_STATE_STORAGE_KEY = 'ying-zhong-jiu.checkpoint-save.v1';
export const SAVE_STATE_SCHEMA_VERSION = 1;

export type SaveStateSchemaVersion = typeof SAVE_STATE_SCHEMA_VERSION;
export type SaveTimerStatus = 'running' | 'paused' | 'stopped';
export type BranchChoiceStatus = 'selected' | 'rejected' | 'resolved';

export interface SavePosition {
  readonly x: number;
  readonly y: number;
  readonly facing: SpawnPoint['facing'];
}

export interface SaveTimerState {
  readonly status: SaveTimerStatus;
  readonly durationMs: number;
  readonly remainingMs: number;
}

export interface SaveState {
  readonly schemaVersion: SaveStateSchemaVersion;
  readonly checkpointId: CheckpointId;
  readonly actId: ActId;
  readonly floorId: FloorId;
  readonly roomId: RoomId | null;
  readonly position: SavePosition;
  readonly controllableCharacterId: CharacterId;
  readonly task: string;
  readonly storyFlags: Readonly<Record<string, boolean>>;
  readonly branchChoices: Readonly<Partial<Record<BranchId, BranchChoiceStatus>>>;
  readonly timers: Readonly<Record<string, SaveTimerState>>;
  readonly inventory: readonly string[];
  readonly pickups: Readonly<Record<string, boolean>>;
  readonly triggeredEvents: readonly string[];
}

export type InvalidSaveReason = 'corrupt-json' | 'version-mismatch' | 'invalid-shape';

export const DEFAULT_STORY_FLAGS: Readonly<Record<string, boolean>> = {
  communicationDisabled: false,
};

export type SaveLoadResult =
  | { readonly status: 'valid'; readonly state: SaveState }
  | { readonly status: 'empty'; readonly state: SaveState }
  | { readonly status: 'invalid'; readonly reason: InvalidSaveReason; readonly state: SaveState };

export interface SaveDebugState {
  readonly storageKey: typeof SAVE_STATE_STORAGE_KEY;
  readonly schemaVersion: SaveStateSchemaVersion;
  readonly status: SaveLoadResult['status'];
  readonly hasValidSave: boolean;
  readonly invalidReason: InvalidSaveReason | null;
  readonly checkpointId: CheckpointId;
  readonly actId: ActId;
}

const validCheckpoints: readonly CheckpointId[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const validActs: readonly ActId[] = ['act-1', 'act-2', 'act-3'];
const validFloors: readonly FloorId[] = ['4F', '5F'];
const validRooms: readonly RoomId[] = [
  'gt2-classroom',
  'gt1-classroom',
  'class-1-1',
  'class-1-2',
  'office-4f',
  'communication-control-5f',
  'principals-office-5f',
];
const validCharacters: readonly CharacterId[] = ['yangYunBlue', 'yangYunRed', 'dongJihao', 'danYuxuan', 'qinHaorui', 'unknown'];
const validFacings: readonly SpawnPoint['facing'][] = ['up', 'down', 'left', 'right'];
const validBranches: readonly BranchId[] = ['A-1', 'A-2', 'B-1', 'B-2'];
const validBranchChoiceStatuses: readonly BranchChoiceStatus[] = ['selected', 'rejected', 'resolved'];
const validTimerStatuses: readonly SaveTimerStatus[] = ['running', 'paused', 'stopped'];

export function createDefaultSaveState(): SaveState {
  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    checkpointId: 'A',
    actId: 'act-1',
    floorId: '4F',
    roomId: null,
    position: { x: 560, y: 920, facing: 'down' },
    controllableCharacterId: 'yangYunBlue',
    task: '无',
    storyFlags: { ...DEFAULT_STORY_FLAGS },
    branchChoices: {},
    timers: {},
    inventory: [],
    pickups: {},
    triggeredEvents: [],
  };
}

export function serializeSaveState(state: SaveState): string {
  const validated = toSaveState(state);

  if (!validated) {
    throw new Error('Cannot serialize malformed save state');
  }

  return JSON.stringify(validated);
}

export function deserializeSaveState(raw: string): SaveLoadResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'corrupt-json', state: createDefaultSaveState() };
  }

  if (!isRecord(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: createDefaultSaveState() };
  }

  if (parsed.schemaVersion !== SAVE_STATE_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'version-mismatch', state: createDefaultSaveState() };
  }

  const state = toSaveState(parsed);

  if (!state) {
    return { status: 'invalid', reason: 'invalid-shape', state: createDefaultSaveState() };
  }

  return { status: 'valid', state };
}

export function saveSaveState(state: SaveState, storage: Storage = localStorage): void {
  storage.setItem(SAVE_STATE_STORAGE_KEY, serializeSaveState(state));
}

export function loadSaveState(storage: Storage = localStorage): SaveLoadResult {
  const raw = storage.getItem(SAVE_STATE_STORAGE_KEY);

  if (raw === null) {
    return { status: 'empty', state: createDefaultSaveState() };
  }

  const result = deserializeSaveState(raw);

  if (result.status === 'invalid') {
    storage.removeItem(SAVE_STATE_STORAGE_KEY);
  }

  return result;
}

export function hasValidSave(storage: Storage = localStorage): boolean {
  const raw = storage.getItem(SAVE_STATE_STORAGE_KEY);
  return raw !== null && deserializeSaveState(raw).status === 'valid';
}

export function clearSaveState(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_STATE_STORAGE_KEY);
}

export function createSaveDebugState(result: SaveLoadResult): SaveDebugState {
  return {
    storageKey: SAVE_STATE_STORAGE_KEY,
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    status: result.status,
    hasValidSave: result.status === 'valid',
    invalidReason: result.status === 'invalid' ? result.reason : null,
    checkpointId: result.state.checkpointId,
    actId: result.state.actId,
  };
}

function toSaveState(value: unknown): SaveState | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    value.schemaVersion !== SAVE_STATE_SCHEMA_VERSION ||
    !isOneOf(value.checkpointId, validCheckpoints) ||
    !isOneOf(value.actId, validActs) ||
    !isOneOf(value.floorId, validFloors) ||
    (value.roomId !== null && !isOneOf(value.roomId, validRooms)) ||
    !isOneOf(value.controllableCharacterId, validCharacters) ||
    typeof value.task !== 'string'
  ) {
    return null;
  }

  const position = toPosition(value.position);
  const storyFlags = toBooleanRecord(value.storyFlags);
  const branchChoices = toBranchChoices(value.branchChoices);
  const timers = toTimers(value.timers);
  const inventory = toStringArray(value.inventory);
  const pickups = toBooleanRecord(value.pickups);
  const triggeredEvents = toStringArray(value.triggeredEvents);

  if (!position || !storyFlags || !branchChoices || !timers || !inventory || !pickups || !triggeredEvents) {
    return null;
  }

  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    checkpointId: value.checkpointId,
    actId: value.actId,
    floorId: value.floorId,
    roomId: value.roomId,
    position,
    controllableCharacterId: value.controllableCharacterId,
    task: value.task,
    storyFlags: { ...DEFAULT_STORY_FLAGS, ...storyFlags },
    branchChoices,
    timers,
    inventory,
    pickups,
    triggeredEvents,
  };
}

function toPosition(value: unknown): SavePosition | null {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number' || !isOneOf(value.facing, validFacings)) {
    return null;
  }

  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    return null;
  }

  return { x: value.x, y: value.y, facing: value.facing };
}

function toBooleanRecord(value: unknown): Readonly<Record<string, boolean>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const booleans: Record<string, boolean> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (key.length === 0 || typeof entryValue !== 'boolean') {
      return null;
    }

    booleans[key] = entryValue;
  }

  return booleans;
}

function toBranchChoices(value: unknown): Readonly<Partial<Record<BranchId, BranchChoiceStatus>>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const choices: Partial<Record<BranchId, BranchChoiceStatus>> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (!isOneOf(key, validBranches) || !isOneOf(entryValue, validBranchChoiceStatuses)) {
      return null;
    }

    choices[key] = entryValue;
  }

  return choices;
}

function toTimers(value: unknown): Readonly<Record<string, SaveTimerState>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const timers: Record<string, SaveTimerState> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    if (!isRecord(entryValue) || !isOneOf(entryValue.status, validTimerStatuses)) {
      return null;
    }

    if (typeof entryValue.durationMs !== 'number' || typeof entryValue.remainingMs !== 'number') {
      return null;
    }

    if (!Number.isFinite(entryValue.durationMs) || !Number.isFinite(entryValue.remainingMs) || entryValue.durationMs < 0 || entryValue.remainingMs < 0) {
      return null;
    }

    timers[key] = {
      status: entryValue.status,
      durationMs: entryValue.durationMs,
      remainingMs: entryValue.remainingMs,
    };
  }

  return timers;
}

function toStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    return null;
  }

  return [...value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<const T extends string>(value: unknown, validValues: readonly T[]): value is T {
  return typeof value === 'string' && validValues.includes(value as T);
}
