import Phaser from 'phaser';
import { schoolMaps } from '../data/maps';
import type { FloorId, RoomId, MapRectangle } from '../data/maps';

function toGeomRect(r: MapRectangle): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height);
}

function findRoom(roomId: RoomId) {
  for (const floor of Object.values(schoolMaps.floors)) {
    const room = floor.rooms[roomId];
    if (room) return room;
  }
  return undefined;
}

export class CollisionManager {
  /**
   * Returns the full corridor bounds for a given floor.
   */
  getCorridorBounds(floorId: FloorId): Phaser.Geom.Rectangle {
    const floor = schoolMaps.floors[floorId];
    return toGeomRect(floor.corridor.bounds);
  }

  /**
   * Returns walkable zones within the corridor for a given floor.
   */
  getWalkableZones(floorId: FloorId): Phaser.Geom.Rectangle[] {
    const floor = schoolMaps.floors[floorId];
    return floor.corridor.walkableBounds.map(toGeomRect);
  }

  /**
   * Returns all collision zones for the corridor (walls, etc).
   */
  getCorridorCollisionZones(floorId: FloorId): Phaser.Geom.Rectangle[] {
    const floor = schoolMaps.floors[floorId];
    return floor.corridor.collisionZones.map(toGeomRect);
  }

  /**
   * Furniture is visual-only; desks and chairs should not create air-wall collisions.
   */
  getFurnitureCollisions(_roomId: RoomId): Phaser.Geom.Rectangle[] {
    return [];
  }

  getRoomBounds(roomId: RoomId): Phaser.Geom.Rectangle {
    const room = findRoom(roomId);
    return room ? toGeomRect(room.bounds) : new Phaser.Geom.Rectangle(0, 0, 0, 0);
  }

  getRoomWalkableZones(roomId: RoomId): Phaser.Geom.Rectangle[] {
    return findRoom(roomId)?.walkableBounds.map(toGeomRect) ?? [];
  }

  getRoomCollisionZones(roomId: RoomId): Phaser.Geom.Rectangle[] {
    return this.getFurnitureCollisions(roomId);
  }

  getRoomWalkableBounds(roomId: RoomId): Phaser.Geom.Rectangle {
    const zones = this.getRoomWalkableZones(roomId);
    if (zones.length === 0) {
      return new Phaser.Geom.Rectangle(0, 0, 0, 0);
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const zone of zones) {
      left = Math.min(left, zone.x);
      top = Math.min(top, zone.y);
      right = Math.max(right, zone.x + zone.width);
      bottom = Math.max(bottom, zone.y + zone.height);
    }
    return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  }

  isRoomWalkable(x: number, y: number, roomId: RoomId): boolean {
    const insideWalkableZone = this.getRoomWalkableZones(roomId).some((zone) => zone.contains(x, y));
    if (!insideWalkableZone) {
      return false;
    }
    return this.getRoomCollisionZones(roomId).every((zone) => !zone.contains(x, y));
  }

  /**
   * Returns the aggregate walkable bounds for a corridor floor.
   * For backwards compatibility, returns the first walkable zone merged.
   */
  getWalkableBounds(floorId: FloorId): Phaser.Geom.Rectangle {
    const zones = this.getWalkableZones(floorId);
    if (zones.length === 0) {
      return new Phaser.Geom.Rectangle(0, 0, 0, 0);
    }
    // Merge all walkable zones into one bounding rectangle
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const zone of zones) {
      left = Math.min(left, zone.x);
      top = Math.min(top, zone.y);
      right = Math.max(right, zone.x + zone.width);
      bottom = Math.max(bottom, zone.y + zone.height);
    }
    return new Phaser.Geom.Rectangle(left, top, right - left, bottom - top);
  }

  /**
   * Checks whether a world point is walkable (not inside any collision zone).
   */
  isWalkable(x: number, y: number, floorId: FloorId): boolean {
    const zones = this.getCorridorCollisionZones(floorId);
    for (const zone of zones) {
      if (zone.contains(x, y)) {
        return false;
      }
    }
    return true;
  }
}
