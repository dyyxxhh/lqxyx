import { beforeEach, describe, expect, it } from 'vitest';

import type { SaveState } from '../state/saveState';
import {
  SAVE_STATE_SCHEMA_VERSION,
  SAVE_STATE_STORAGE_KEY,
  clearSaveState,
  createDefaultSaveState,
  deserializeSaveState,
  exportSaveJson,
  hasValidSave,
  importSaveJson,
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
      position: { x: 640, y: 920, facing: 'down' },
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

  it('save-json: exports and imports full save state plus Yang Yun replay buffer after storage is cleared', () => {
    const checkpointState = createCheckpointState();
    const replayBuffer = [
      { t: 0, x: 620, y: 240, floorId: '5F', roomId: 'communication-control-5f', direction: 'up' },
      { t: 600, x: 760, y: 520, floorId: '4F', roomId: 'gt1-classroom', direction: 'down' },
    ];
    saveSaveState(checkpointState);
    localStorage.setItem('ying-zhong-jiu.replay-buffer.v1', JSON.stringify(replayBuffer));

    const exported = exportSaveJson();

    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') {
      clearSaveState();
      localStorage.clear();

      const imported = importSaveJson(exported.json);

      expect(imported.status).toBe('imported');
      expect(imported.status === 'imported' ? imported.state : null).toEqual(checkpointState);
      expect(localStorage.getItem('ying-zhong-jiu.replay-buffer.v1')).toBe(JSON.stringify(replayBuffer));
      expect(loadSaveState()).toEqual({ status: 'valid', state: imported.status === 'imported' ? imported.state : createDefaultSaveState() });
    }
  });

  it('save-json: exports no-save when no valid save exists', () => {
    expect(exportSaveJson()).toEqual({ status: 'no-save' });
  });

  it('save-json: rejects malformed JSON and invalid save bundles without changing current save', () => {
    const checkpointState = createCheckpointState();
    saveSaveState(checkpointState);

    expect(importSaveJson('{not-json')).toEqual({ status: 'invalid-json' });
    expect(importSaveJson(JSON.stringify({ kind: 'wrong' }))).toEqual({ status: 'invalid-save' });
    expect(loadSaveState()).toEqual({ status: 'valid', state: checkpointState });
  });

  it('save-json: preserves arbitrary local fields that four-digit checkpoint codes could not represent', () => {
    const checkpointState = createCheckpointState();
    saveSaveState(checkpointState);

    const exported = exportSaveJson();

    expect(exported.status).toBe('exported');
    if (exported.status === 'exported') {
      const imported = importSaveJson(exported.json);

      expect(imported.status === 'imported' ? imported.state.position : null).toEqual(checkpointState.position);
      expect(imported.status === 'imported' ? imported.state.timers : null).toEqual(checkpointState.timers);
      expect(imported.status === 'imported' ? imported.state.triggeredEvents : null).toEqual(checkpointState.triggeredEvents);
    }
  });
});
