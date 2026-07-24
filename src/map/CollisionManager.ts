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

/**
 * Computes the aggregate bounding rectangle of a set of zones. Returns a
 * zero-sized rectangle when the set is empty.
 */
function computeBounds(zones: readonly Phaser.Geom.Rectangle[]): Phaser.Geom.Rectangle {
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

export class CollisionManager {
  // ── Memoization caches ─────────────────────────────────────
  // `schoolMaps` is static (loaded once at module eval and never mutated at
  // runtime), so the derived Phaser.Geom.Rectangle arrays/bounds are valid for
  // the lifetime of the manager. `clampToWalkable` is called every movement
  // frame and previously allocated fresh arrays + rectangles via `.map(toGeomRect)`
  // on each call — caching eliminates that per-frame GC pressure.
  // Callers only READ the returned arrays (`.some`/`.every`/iteration); none
  // mutate them, so sharing cached references is safe.
  private readonly corridorBoundsCache = new Map<FloorId, Phaser.Geom.Rectangle>();
  private readonly walkableZonesCache = new Map<FloorId, Phaser.Geom.Rectangle[]>();
  private readonly corridorCollisionZonesCache = new Map<FloorId, Phaser.Geom.Rectangle[]>();
  private readonly walkableBoundsCache = new Map<FloorId, Phaser.Geom.Rectangle>();
  private readonly roomBoundsCache = new Map<RoomId, Phaser.Geom.Rectangle>();
  private readonly roomWalkableZonesCache = new Map<RoomId, Phaser.Geom.Rectangle[]>();
  private readonly roomWalkableBoundsCache = new Map<RoomId, Phaser.Geom.Rectangle>();

  /**
   * Returns the full corridor bounds for a given floor.
   */
  getCorridorBounds(floorId: FloorId): Phaser.Geom.Rectangle {
    const cached = this.corridorBoundsCache.get(floorId);
    if (cached) return cached;
    const floor = schoolMaps.floors[floorId];
    const rect = toGeomRect(floor.corridor.bounds);
    this.corridorBoundsCache.set(floorId, rect);
    return rect;
  }

  /**
   * Returns walkable zones within the corridor for a given floor.
   */
  getWalkableZones(floorId: FloorId): Phaser.Geom.Rectangle[] {
    const cached = this.walkableZonesCache.get(floorId);
    if (cached) return cached;
    const floor = schoolMaps.floors[floorId];
    const zones = floor.corridor.walkableBounds.map(toGeomRect);
    this.walkableZonesCache.set(floorId, zones);
    return zones;
  }

  /**
   * Returns all collision zones for the corridor (walls, etc).
   */
  getCorridorCollisionZones(floorId: FloorId): Phaser.Geom.Rectangle[] {
    const cached = this.corridorCollisionZonesCache.get(floorId);
    if (cached) return cached;
    const floor = schoolMaps.floors[floorId];
    const zones = floor.corridor.collisionZones.map(toGeomRect);
    this.corridorCollisionZonesCache.set(floorId, zones);
    return zones;
  }

  /**
   * Furniture is visual-only; desks and chairs should not create air-wall collisions.
   */
  getFurnitureCollisions(_roomId: RoomId): Phaser.Geom.Rectangle[] {
    return [];
  }

  getRoomBounds(roomId: RoomId): Phaser.Geom.Rectangle {
    const cached = this.roomBoundsCache.get(roomId);
    if (cached) return cached;
    const room = findRoom(roomId);
    const rect = room ? toGeomRect(room.bounds) : new Phaser.Geom.Rectangle(0, 0, 0, 0);
    this.roomBoundsCache.set(roomId, rect);
    return rect;
  }

  getRoomWalkableZones(roomId: RoomId): Phaser.Geom.Rectangle[] {
    const cached = this.roomWalkableZonesCache.get(roomId);
    if (cached) return cached;
    const zones = findRoom(roomId)?.walkableBounds.map(toGeomRect) ?? [];
    this.roomWalkableZonesCache.set(roomId, zones);
    return zones;
  }

  getRoomCollisionZones(roomId: RoomId): Phaser.Geom.Rectangle[] {
    return this.getFurnitureCollisions(roomId);
  }

  getRoomWalkableBounds(roomId: RoomId): Phaser.Geom.Rectangle {
    const cached = this.roomWalkableBoundsCache.get(roomId);
    if (cached) return cached;
    const bounds = computeBounds(this.getRoomWalkableZones(roomId));
    this.roomWalkableBoundsCache.set(roomId, bounds);
    return bounds;
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
    const cached = this.walkableBoundsCache.get(floorId);
    if (cached) return cached;
    const bounds = computeBounds(this.getWalkableZones(floorId));
    this.walkableBoundsCache.set(floorId, bounds);
    return bounds;
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
