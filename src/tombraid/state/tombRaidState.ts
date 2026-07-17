// src/tombraid/state/tombRaidState.ts
// 摸金模式 4-key 独立存档 schema + 读写 + 起手包（纯 TS，无 Phaser import）。
// spec §8.1 / §8.3 / §8.4 / §8.5

export const TOMB_RAID_STASH_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.stash.v1';
export const TOMB_RAID_UPGRADES_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.upgrades.v1';
export const TOMB_RAID_BEST_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.best.v1';
export const TOMB_RAID_PROGRESS_STORAGE_KEY = 'ying-zhong-jiu.tomb-raid.progress.v1';
export const TOMB_RAID_SCHEMA_VERSION = 1;

export type TombRaidUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';

const UPGRADE_IDS: readonly TombRaidUpgradeId[] = [
  'physique',
  'swift',
  'pickup',
  'sharp',
  'lucky',
  'armory',
];

export interface TombRaidStashItem {
  readonly itemId: string;
  readonly quantity: number;
}

export interface TombRaidStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly TombRaidStashItem[];
}

export interface TombRaidUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<TombRaidUpgradeId, number>>;
}

export interface TombRaidBestState {
  readonly schemaVersion: number;
  readonly bestSanity: number;
}

export interface TombRaidProgressState {
  readonly schemaVersion: number;
  readonly starterPackGranted: boolean;
}

export type TombRaidInvalidReason = 'corrupt-json' | 'version-mismatch' | 'invalid-shape';

export type TombRaidLoadResult<T> =
  | { readonly status: 'valid'; readonly state: T }
  | { readonly status: 'empty'; readonly state: T }
  | { readonly status: 'invalid'; readonly reason: TombRaidInvalidReason; readonly state: T };

export type GrantStarterPackResult =
  | { readonly granted: true; readonly stash: TombRaidStashState; readonly progress: TombRaidProgressState }
  | { readonly granted: false; readonly stash: TombRaidStashState; readonly progress: TombRaidProgressState };

const STARTER_PACK_ITEMS: readonly TombRaidStashItem[] = [
  { itemId: 'weapon.ruler', quantity: 1 },
  { itemId: 'consumable.celery', quantity: 3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStashState(value: unknown): value is TombRaidStashState {
  if (!isRecord(value)) return false;
  if (typeof value.sanity !== 'number') return false;
  if (!Array.isArray(value.items)) return false;
  return value.items.every(
    (item) => isRecord(item) && typeof item.itemId === 'string' && typeof item.quantity === 'number',
  );
}

function isUpgradesState(value: unknown): value is TombRaidUpgradesState {
  if (!isRecord(value)) return false;
  const tiers = value.tiers;
  if (!isRecord(tiers)) return false;
  return UPGRADE_IDS.every((id) => typeof tiers[id] === 'number');
}

function isBestState(value: unknown): value is TombRaidBestState {
  return isRecord(value) && typeof value.bestSanity === 'number';
}

function isProgressState(value: unknown): value is TombRaidProgressState {
  return isRecord(value) && typeof value.starterPackGranted === 'boolean';
}

function loadTyped<T>(
  storage: Storage,
  key: string,
  guard: (value: unknown) => value is T,
  fallback: () => T,
): TombRaidLoadResult<T> {
  const raw = storage.getItem(key);
  if (raw === null) {
    return { status: 'empty', state: fallback() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'corrupt-json', state: fallback() };
  }
  if (!isRecord(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  if (parsed.schemaVersion !== TOMB_RAID_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'version-mismatch', state: fallback() };
  }
  if (!guard(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  return { status: 'valid', state: parsed };
}

export function createDefaultStashState(): TombRaidStashState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, sanity: 0, items: [] };
}

export function createDefaultUpgradesState(): TombRaidUpgradesState {
  return {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    tiers: { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0 },
  };
}

export function createDefaultBestState(): TombRaidBestState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, bestSanity: 0 };
}

export function createDefaultProgressState(): TombRaidProgressState {
  return { schemaVersion: TOMB_RAID_SCHEMA_VERSION, starterPackGranted: false };
}

export function loadStashState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidStashState> {
  return loadTyped(storage, TOMB_RAID_STASH_STORAGE_KEY, isStashState, createDefaultStashState);
}

export function loadUpgradesState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidUpgradesState> {
  return loadTyped(storage, TOMB_RAID_UPGRADES_STORAGE_KEY, isUpgradesState, createDefaultUpgradesState);
}

export function loadBestState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidBestState> {
  return loadTyped(storage, TOMB_RAID_BEST_STORAGE_KEY, isBestState, createDefaultBestState);
}

export function loadProgressState(storage: Storage = localStorage): TombRaidLoadResult<TombRaidProgressState> {
  return loadTyped(storage, TOMB_RAID_PROGRESS_STORAGE_KEY, isProgressState, createDefaultProgressState);
}

export function saveStashState(state: TombRaidStashState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_STASH_STORAGE_KEY, JSON.stringify(state));
}

export function saveUpgradesState(state: TombRaidUpgradesState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_UPGRADES_STORAGE_KEY, JSON.stringify(state));
}

export function saveBestState(state: TombRaidBestState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_BEST_STORAGE_KEY, JSON.stringify(state));
}

export function saveProgressState(state: TombRaidProgressState, storage: Storage = localStorage): void {
  storage.setItem(TOMB_RAID_PROGRESS_STORAGE_KEY, JSON.stringify(state));
}

function mergeStashItems(
  existing: readonly TombRaidStashItem[],
  additions: readonly TombRaidStashItem[],
): readonly TombRaidStashItem[] {
  const quantities = new Map<string, number>();
  for (const item of existing) {
    quantities.set(item.itemId, item.quantity);
  }
  for (const item of additions) {
    quantities.set(item.itemId, (quantities.get(item.itemId) ?? 0) + item.quantity);
  }
  return Array.from(quantities.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function grantStarterPackIfNeeded(storage: Storage = localStorage): GrantStarterPackResult {
  const progress = loadProgressState(storage);
  if (progress.state.starterPackGranted) {
    return { granted: false, stash: loadStashState(storage).state, progress: progress.state };
  }
  const stash = loadStashState(storage).state;
  const merged = mergeStashItems(stash.items, STARTER_PACK_ITEMS);
  const newStash: TombRaidStashState = {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    sanity: stash.sanity,
    items: merged,
  };
  const newProgress: TombRaidProgressState = {
    schemaVersion: TOMB_RAID_SCHEMA_VERSION,
    starterPackGranted: true,
  };
  saveStashState(newStash, storage);
  saveProgressState(newProgress, storage);
  return { granted: true, stash: newStash, progress: newProgress };
}
