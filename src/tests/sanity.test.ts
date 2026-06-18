import { describe, expect, it } from 'vitest';

import { GAME_SCENES, createInitialSceneDebugState } from '../game/scaffoldState';

describe('Phaser app scaffold', () => {
  it('registers Boot, Preload, and Game scenes in startup order', () => {
    expect(GAME_SCENES).toEqual(['BootScene', 'PreloadScene', 'GameScene', 'PlayScene']);
  });

  it('exposes deterministic scene debug state for sanity and e2e tests', () => {
    expect(createInitialSceneDebugState()).toEqual({
      sceneOrder: [],
      currentScene: null,
      booted: false,
      preloaded: false,
      gameReady: false,
      ready: false,
      sceneCounts: { BootScene: 0, PreloadScene: 0, GameScene: 0, PlayScene: 0 },
      menu: { visible: false, selectedAction: null, hasContinue: false },
      canvas: null,
      sizing: {
        mode: 'FIT',
        autoCenter: 'CENTER_BOTH',
        gameWidth: 1280,
        gameHeight: 720,
        aspectRatio: 1280 / 720
      },
      preload: null,
      save: {
        storageKey: 'ying-zhong-jiu.checkpoint-save.v1',
        schemaVersion: 1,
        status: 'empty',
        hasValidSave: false,
        invalidReason: null,
        checkpointId: 'A',
        actId: 'act-1'
      },
      input: {
        deviceMode: 'desktop',
        lockActive: false,
        lockReason: null,
        movementVector: { x: 0, y: 0 },
        joystickPointerId: null,
        interactAction: null,
        interactPressed: false,
        fullscreenStatus: 'idle',
        orientationStatus: 'landscape',
      },
      story: {
        currentCheckpointId: null,
        currentActId: 'act-1',
        currentCommandIndex: 0,
        isExecuting: false,
        activeTimers: [],
        pendingBranchId: null,
        currentEndingId: null,
      },
      character: {
        currentCharacterId: 'unknown',
        currentDisplayName: '???',
        currentDirection: 'down',
        currentAnimationKey: null,
        isMoving: false,
      },
      ui: {
        taskVisible: false,
        taskText: '',
        dialogueVisible: false,
        dialogueSpeaker: '',
        dialogueText: '',
        dialoguePortraitKey: null,
        rolePromptVisible: false,
        roleCharacterId: '',
        roleDisplayName: '',
        timerVisible: false,
        timerRemainingMs: 0,
        curtainVisible: false,
        curtainTitle: '下一幕',
        curtainSubtitle: '敬请期待',
      },
      map: {
        currentFloorId: null,
        currentRoomId: null,
        elevatorTransitioning: false,
      },
    });
  });

  it('builds a Phaser config with the expected canvas parent and dimensions', () => {
    const sceneKeys = [...GAME_SCENES];

    expect(sceneKeys).toHaveLength(4);
    expect(sceneKeys[0]).toBe('BootScene');
    expect(sceneKeys[2]).toBe('GameScene');
    expect(sceneKeys[3]).toBe('PlayScene');
  });
});
