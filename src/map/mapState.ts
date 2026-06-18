import type { FloorId, RoomId } from '../data/maps';
import { getSceneDebugState } from '../game/scaffoldState';

export type { FloorId, RoomId };

export interface MapDebugState {
  currentFloorId: FloorId | null;
  currentRoomId: RoomId | null;
  elevatorTransitioning: boolean;
}

export function createInitialMapDebugState(): MapDebugState {
  return {
    currentFloorId: null,
    currentRoomId: null,
    elevatorTransitioning: false,
  };
}

export function setMapDebugState(partial: Partial<MapDebugState>): MapDebugState {
  const state = getSceneDebugState();
  state.map = { ...state.map, ...partial };
  return state.map;
}
