import { getSceneDebugState } from '../game/scaffoldState';

export type DeviceMode = 'desktop' | 'mobile';

export type FullscreenStatus =
  | 'idle'
  | 'requested'
  | 'entered'
  | 'failed'
  | 'unsupported'
  | 'denied'
  | 'left';

export type OrientationStatus = 'landscape' | 'portrait';

export interface MovementVector {
  readonly x: number;
  readonly y: number;
}

export interface InputDebugState {
  readonly deviceMode: DeviceMode;
  readonly lockActive: boolean;
  readonly lockReason: string | null;
  readonly movementVector: MovementVector;
  readonly joystickPointerId: number | null;
  readonly interactAction: string | null;
  readonly interactPressed: boolean;
  readonly fullscreenStatus: FullscreenStatus;
  readonly orientationStatus: OrientationStatus;
}

export function createInitialInputDebugState(): InputDebugState {
  return {
    deviceMode: 'desktop',
    lockActive: false,
    lockReason: null,
    movementVector: { x: 0, y: 0 },
    joystickPointerId: null,
    interactAction: null,
    interactPressed: false,
    fullscreenStatus: 'idle',
    orientationStatus: 'landscape',
  };
}

export function setInputDebugState(partial: Partial<InputDebugState>): InputDebugState {
  const state = getSceneDebugState();
  state.input = { ...state.input, ...partial };
  return state.input;
}
