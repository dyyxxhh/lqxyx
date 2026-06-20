import { beforeEach, describe, expect, it } from 'vitest';

import type { SaveState } from '../state/saveState';
import {
  SAVE_STATE_SCHEMA_VERSION,
  SAVE_STATE_STORAGE_KEY,
  clearSaveState,
  createDefaultSaveState,
  deserializeSaveState,
  exportSaveCode,
  hasValidSave,
  importSaveCode,
  loadSaveState,
  saveSaveState,
  serializeSaveState,
} from '../state/saveState';

function createCheckpointState(): SaveState {
  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    checkpointId: 'H',
    actId: 'act-1',
    floorId: '5F',
    roomId: 'communication-control-5f',
    position: { x: 620, y: 240, facing: 'up' },
    controllableCharacterId: 'dongJihao',
    task: '去班里偷同学手机报警',
    storyFlags: {
      danYuxuanBodyProneAndBloody: true,
      qinHaoruiBodyBloodyOnGround: true,
      yangYunReplaysB2Actions: true,
      communicationDisabled: true,
    },
    branchChoices: {
      'A-1': 'selected',
      'B-2': 'selected',
    },
    timers: {
      'survival-route-countdown': { status: 'running', durationMs: 120_000, remainingMs: 87_500 },
      'yang-yun-visible-failure-window': { status: 'paused', durationMs: 3_000, remainingMs: 2_250 },
    },
    inventory: ['dan-yuxuan-head', 'qin-haorui-head'],
    pickups: {
      'gt1-phone-cabinet': true,
      'gt2-phone-cabinet': false,
    },
    triggeredEvents: ['checkpoint:H', 'branch:B-2', 'timer:survival-route-countdown:start'],
  };
}

describe('checkpoint save state manager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save-state: round-trips exact first-act checkpoint fields through localStorage', () => {
    const checkpointState = createCheckpointState();

    saveSaveState(checkpointState);

    expect(localStorage.getItem(SAVE_STATE_STORAGE_KEY)).not.toBeNull();
    expect(loadSaveState()).toEqual({ status: 'valid', state: checkpointState });
  });

  it('save-state: preserves timer, branch, flag, inventory, pickup, and triggered-event data through serialization', () => {
    const checkpointState = createCheckpointState();

    const parsed = deserializeSaveState(serializeSaveState(checkpointState));

    expect(parsed).toEqual({ status: 'valid', state: checkpointState });
    expect(parsed.status === 'valid' ? parsed.state.timers : {}).toEqual(checkpointState.timers);
    expect(parsed.status === 'valid' ? parsed.state.branchChoices : {}).toEqual(checkpointState.branchChoices);
    expect(parsed.status === 'valid' ? parsed.state.storyFlags : {}).toEqual(checkpointState.storyFlags);
    expect(parsed.status === 'valid' ? parsed.state.inventory : []).toEqual(checkpointState.inventory);
    expect(parsed.status === 'valid' ? parsed.state.pickups : {}).toEqual(checkpointState.pickups);
    expect(parsed.status === 'valid' ? parsed.state.triggeredEvents : []).toEqual(checkpointState.triggeredEvents);
  });

  it('save-state: accepts the real 5F principal office room in checkpoint saves', () => {
    const principalOfficeState: SaveState = {
      ...createCheckpointState(),
      roomId: 'principals-office-5f',
      position: { x: 760, y: 420, facing: 'left' },
      task: '前往五楼校长办公室',
    };

    expect(deserializeSaveState(serializeSaveState(principalOfficeState))).toEqual({
      status: 'valid',
      state: principalOfficeState,
    });
  });

  it('save-state: reports no-save and uses safe defaults without a stored checkpoint', () => {
    expect(loadSaveState()).toEqual({ status: 'empty', state: createDefaultSaveState() });
    expect(hasValidSave()).toBe(false);
    expect(createDefaultSaveState()).toEqual({
      schemaVersion: SAVE_STATE_SCHEMA_VERSION,
      checkpointId: 'A',
      actId: 'act-1',
      floorId: '4F',
      roomId: null,
      position: { x: 560, y: 920, facing: 'down' },
      controllableCharacterId: 'yangYunBlue',
      task: '无',
      storyFlags: { communicationDisabled: false },
      branchChoices: {},
      timers: {},
      inventory: [],
      pickups: {},
      triggeredEvents: [],
    });
  });

  it('save-state: rejects version mismatch, clears storage, and returns defaults', () => {
    localStorage.setItem(SAVE_STATE_STORAGE_KEY, JSON.stringify({ ...createCheckpointState(), schemaVersion: 0 }));

    expect(loadSaveState()).toEqual({
      status: 'invalid',
      reason: 'version-mismatch',
      state: createDefaultSaveState(),
    });
    expect(localStorage.getItem(SAVE_STATE_STORAGE_KEY)).toBeNull();
    expect(hasValidSave()).toBe(false);
  });

  it('save-state: recovers from corrupt JSON without crashing and clears storage', () => {
    localStorage.setItem(SAVE_STATE_STORAGE_KEY, '{not valid json');

    expect(loadSaveState()).toEqual({
      status: 'invalid',
      reason: 'corrupt-json',
      state: createDefaultSaveState(),
    });
    expect(localStorage.getItem(SAVE_STATE_STORAGE_KEY)).toBeNull();
  });

  it('save-state: rejects malformed required fields and clears storage', () => {
    localStorage.setItem(SAVE_STATE_STORAGE_KEY, JSON.stringify({ ...createCheckpointState(), checkpointId: 'Z' }));

    expect(loadSaveState()).toEqual({
      status: 'invalid',
      reason: 'invalid-shape',
      state: createDefaultSaveState(),
    });
    expect(localStorage.getItem(SAVE_STATE_STORAGE_KEY)).toBeNull();
  });

  it('save-state: detects a valid save for future Continue-button state', () => {
    expect(hasValidSave()).toBe(false);

    saveSaveState(createCheckpointState());

    expect(hasValidSave()).toBe(true);

    clearSaveState();

    expect(hasValidSave()).toBe(false);
  });

  it('save-code: exports and imports a self-contained four-digit progress code after storage is cleared', () => {
    const checkpointState = createCheckpointState();
    saveSaveState(checkpointState);

    const exported = exportSaveCode();

    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') {
      expect(exported.code).toMatch(/^\d{4}$/);
      expect(exported.code).toBe('1007');
      clearSaveState();
      localStorage.clear();

      const imported = importSaveCode(exported.code);

      expect(imported.status).toBe('imported');
      expect(imported.status === 'imported' ? imported.state.checkpointId : null).toBe('H');
      expect(imported.status === 'imported' ? imported.state.task : null).toBe('去班里偷同学手机报警');
      expect(imported.status === 'imported' ? imported.state.storyFlags.communicationDisabled : null).toBe(true);
      expect(loadSaveState()).toEqual({ status: 'valid', state: imported.status === 'imported' ? imported.state : createDefaultSaveState() });
    }
  });

  it('save-code: imports a known numeric progress code without any local codebook state', () => {
    localStorage.clear();

    const imported = importSaveCode('1003');

    expect(imported.status).toBe('imported');
    if (imported.status === 'imported') {
      expect(imported.state.checkpointId).toBe('D');
      expect(imported.state.task).toBe('去办公室');
      expect(imported.state.floorId).toBe('4F');
      expect(imported.state.roomId).toBe('gt2-classroom');
      expect(loadSaveState()).toEqual({ status: 'valid', state: imported.state });
    }
  });

  it('save-code: exports no-save and imports default progress code without localStorage aliases', () => {
    expect(exportSaveCode()).toEqual({ status: 'no-save' });

    const imported = importSaveCode('1000');

    expect(imported).toEqual({ status: 'imported', state: createDefaultSaveState() });
    expect(loadSaveState()).toEqual({ status: 'valid', state: createDefaultSaveState() });
  });

  it('save-code: rejects malformed and unknown codes without changing current save', () => {
    const checkpointState = createCheckpointState();
    saveSaveState(checkpointState);

    expect(importSaveCode('12')).toEqual({ status: 'invalid-code' });
    expect(importSaveCode('abcd')).toEqual({ status: 'invalid-code' });
    expect(importSaveCode('12345')).toEqual({ status: 'invalid-code' });
    expect(importSaveCode('9999')).toEqual({ status: 'unknown-code' });
    expect(loadSaveState()).toEqual({ status: 'valid', state: checkpointState });
  });

  it('save-code: does not preserve arbitrary local-only fields outside the finite progress state', () => {
    const checkpointState = createCheckpointState();
    saveSaveState(checkpointState);

    const exported = exportSaveCode();

    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') {
      const imported = importSaveCode(exported.code);

      expect(imported.status === 'imported' ? imported.state.position : null).not.toEqual(checkpointState.position);
      expect(imported.status === 'imported' ? imported.state.timers : null).toEqual({});
      expect(imported.status === 'imported' ? imported.state.triggeredEvents : null).toEqual(['checkpoint:H']);
    }
  });
});
