// src/forgottenSanity/state/forgottenSanityState.ts
// 被遗忘的理智 4-key 独立存档 schema + 读写 + 起手包（纯 TS，无 Phaser import）。
// spec §8.1 / §8.3 / §8.4 / §8.5

export const FORGOTTEN_SANITY_STASH_STORAGE_KEY = 'ying-zhong-jiu.forgotten-sanity.stash.v1';
export const FORGOTTEN_SANITY_UPGRADES_STORAGE_KEY = 'ying-zhong-jiu.forgotten-sanity.upgrades.v1';
export const FORGOTTEN_SANITY_BEST_STORAGE_KEY = 'ying-zhong-jiu.forgotten-sanity.best.v1';
export const FORGOTTEN_SANITY_PROGRESS_STORAGE_KEY = 'ying-zhong-jiu.forgotten-sanity.progress.v1';
export const FORGOTTEN_SANITY_SCHEMA_VERSION = 1;

export type ForgottenSanityUpgradeId = 'physique' | 'swift' | 'pickup' | 'sharp' | 'lucky' | 'armory';

const UPGRADE_IDS: readonly ForgottenSanityUpgradeId[] = [
  'physique',
  'swift',
  'pickup',
  'sharp',
  'lucky',
  'armory',
];

export interface ForgottenSanityStashItem {
  readonly itemId: string;
  readonly quantity: number;
}

export interface ForgottenSanityStashState {
  readonly schemaVersion: number;
  readonly sanity: number;
  readonly items: readonly ForgottenSanityStashItem[];
}

export interface ForgottenSanityUpgradesState {
  readonly schemaVersion: number;
  readonly tiers: Readonly<Record<ForgottenSanityUpgradeId, number>>;
}

export interface ForgottenSanityBestState {
  readonly schemaVersion: number;
  readonly bestSanity: number;
}

export interface ForgottenSanityProgressState {
  readonly schemaVersion: number;
  readonly starterPackGranted: boolean;
}

export type ForgottenSanityInvalidReason = 'corrupt-json' | 'version-mismatch' | 'invalid-shape';

export type ForgottenSanityLoadResult<T> =
  | { readonly status: 'valid'; readonly state: T }
  | { readonly status: 'empty'; readonly state: T }
  | { readonly status: 'invalid'; readonly reason: ForgottenSanityInvalidReason; readonly state: T };

export type GrantStarterPackResult =
  | { readonly granted: true; readonly stash: ForgottenSanityStashState; readonly progress: ForgottenSanityProgressState }
  | { readonly granted: false; readonly stash: ForgottenSanityStashState; readonly progress: ForgottenSanityProgressState };

const STARTER_PACK_ITEMS: readonly ForgottenSanityStashItem[] = [
  { itemId: 'weapon.ruler', quantity: 1 },
  { itemId: 'consumable.celery', quantity: 3 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStashState(value: unknown): value is ForgottenSanityStashState {
  if (!isRecord(value)) return false;
  if (typeof value.sanity !== 'number') return false;
  if (!Array.isArray(value.items)) return false;
  return value.items.every(
    (item) => isRecord(item) && typeof item.itemId === 'string' && typeof item.quantity === 'number',
  );
}

function isUpgradesState(value: unknown): value is ForgottenSanityUpgradesState {
  if (!isRecord(value)) return false;
  const tiers = value.tiers;
  if (!isRecord(tiers)) return false;
  return UPGRADE_IDS.every((id) => typeof tiers[id] === 'number');
}

function isBestState(value: unknown): value is ForgottenSanityBestState {
  return isRecord(value) && typeof value.bestSanity === 'number';
}

function isProgressState(value: unknown): value is ForgottenSanityProgressState {
  return isRecord(value) && typeof value.starterPackGranted === 'boolean';
}

function loadTyped<T>(
  storage: Storage,
  key: string,
  guard: (value: unknown) => value is T,
  fallback: () => T,
): ForgottenSanityLoadResult<T> {
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
  if (parsed.schemaVersion !== FORGOTTEN_SANITY_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'version-mismatch', state: fallback() };
  }
  if (!guard(parsed)) {
    return { status: 'invalid', reason: 'invalid-shape', state: fallback() };
  }
  return { status: 'valid', state: parsed };
}

export function createDefaultStashState(): ForgottenSanityStashState {
  return { schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION, sanity: 0, items: [] };
}

export function createDefaultUpgradesState(): ForgottenSanityUpgradesState {
  return {
    schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION,
    tiers: { physique: 0, swift: 0, pickup: 0, sharp: 0, lucky: 0, armory: 0 },
  };
}

export function createDefaultBestState(): ForgottenSanityBestState {
  return { schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION, bestSanity: 0 };
}

export function createDefaultProgressState(): ForgottenSanityProgressState {
  return { schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION, starterPackGranted: false };
}

export function loadStashState(storage: Storage = localStorage): ForgottenSanityLoadResult<ForgottenSanityStashState> {
  return loadTyped(storage, FORGOTTEN_SANITY_STASH_STORAGE_KEY, isStashState, createDefaultStashState);
}

export function loadUpgradesState(storage: Storage = localStorage): ForgottenSanityLoadResult<ForgottenSanityUpgradesState> {
  return loadTyped(storage, FORGOTTEN_SANITY_UPGRADES_STORAGE_KEY, isUpgradesState, createDefaultUpgradesState);
}

export function loadBestState(storage: Storage = localStorage): ForgottenSanityLoadResult<ForgottenSanityBestState> {
  return loadTyped(storage, FORGOTTEN_SANITY_BEST_STORAGE_KEY, isBestState, createDefaultBestState);
}

export function loadProgressState(storage: Storage = localStorage): ForgottenSanityLoadResult<ForgottenSanityProgressState> {
  return loadTyped(storage, FORGOTTEN_SANITY_PROGRESS_STORAGE_KEY, isProgressState, createDefaultProgressState);
}

export function saveStashState(state: ForgottenSanityStashState, storage: Storage = localStorage): void {
  storage.setItem(FORGOTTEN_SANITY_STASH_STORAGE_KEY, JSON.stringify(state));
}

export function saveUpgradesState(state: ForgottenSanityUpgradesState, storage: Storage = localStorage): void {
  storage.setItem(FORGOTTEN_SANITY_UPGRADES_STORAGE_KEY, JSON.stringify(state));
}

export function saveBestState(state: ForgottenSanityBestState, storage: Storage = localStorage): void {
  storage.setItem(FORGOTTEN_SANITY_BEST_STORAGE_KEY, JSON.stringify(state));
}

export function saveProgressState(state: ForgottenSanityProgressState, storage: Storage = localStorage): void {
  storage.setItem(FORGOTTEN_SANITY_PROGRESS_STORAGE_KEY, JSON.stringify(state));
}

function mergeStashItems(
  existing: readonly ForgottenSanityStashItem[],
  additions: readonly ForgottenSanityStashItem[],
): readonly ForgottenSanityStashItem[] {
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
  const newStash: ForgottenSanityStashState = {
    schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION,
    sanity: stash.sanity,
    items: merged,
  };
  const newProgress: ForgottenSanityProgressState = {
    schemaVersion: FORGOTTEN_SANITY_SCHEMA_VERSION,
    starterPackGranted: true,
  };
  saveStashState(newStash, storage);
  saveProgressState(newProgress, storage);
  return { granted: true, stash: newStash, progress: newProgress };
}
