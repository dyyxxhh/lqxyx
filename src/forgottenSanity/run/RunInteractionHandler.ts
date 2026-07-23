// src/forgottenSanity/run/RunInteractionHandler.ts
// 对局交互处理子模块（spec#5 §5.1 拆分）。
// 职责：移动 / 击退 / fistDash 冲刺 / 普攻 / 大招 / 交互优先级（宝箱→纸条→vault→撤离）/
//       宝箱破译 / 纸条阅读 / vault door 解锁 / 可走性检测。
// 共享状态由 RunSharedState 注入；撤离结算通过 onEvacuate 回调反向调用 RunLifecycle。
import {
  PLAYER_BASE_SPEED,
  PLAYER_RUN_SPEED,
} from '../combat/DamageType';
import type {
  ForgottenSanityChestSpawn,
  ForgottenSanityNoteSpawn,
} from '../map/forgottenSanityMapState';
import { rectContains } from '../map/forgottenSanityMapState';
import {
  rollLootTable,
  NORMAL_CHEST_LOOT_TABLE,
  GILDED_CHEST_LOOT_TABLE,
} from '../loot/LootTable';
import type { LootItem } from '../loot/LootItem';
import { ChestDecrypt } from '../loot/ChestDecrypt';
import { NOTE_CONTENTS } from '../notes/noteContent';
import { assignNoteContent } from '../notes/assignNoteContent';
import { saveNotesState } from '../state/forgottenSanityState';
import type { RunSharedState, RunInteractionCallbacks } from './runTypes';

const CHEST_INTERACT_DISTANCE = 80;
const EXIT_INTERACT_DISTANCE = 60;
const NOTE_INTERACT_DISTANCE = 80;

/**
 * 交互处理子模块。由 RunLifecycle 在构造器中期（manifest/renderer 就绪后）实例化，
 * 通过 bindInput() 在步骤 15 接入键盘回调。所有状态读写均经 RunSharedState 引用。
 */
export class RunInteractionHandler {
  constructor(
    private readonly state: RunSharedState,
    private readonly callbacks: RunInteractionCallbacks,
  ) {}

  // ───────────────────────────────────────────────────────────────────
  // 可走性检测：玩家中心点必须在某个房间/走廊的 walkableBounds 内，且不在 collisionZone 内
  // ───────────────────────────────────────────────────────────────────
  checkWalkable(x: number, y: number): boolean {
    // 在任一房间或走廊的 walkableBounds 内
    let inWalkable = false;
    for (const room of this.state.manifest.rooms) {
      if (rectContains(room.walkableBounds, { x, y })) {
        inWalkable = true;
        break;
      }
    }
    if (!inWalkable) {
      for (const corridor of this.state.manifest.corridors) {
        if (rectContains(corridor.bounds, { x, y })) {
          inWalkable = true;
          break;
        }
      }
    }
    if (!inWalkable) return false;

    // 不在 collisionZone 内（墙壁）
    for (const zone of this.state.renderer.getCollisionZones()) {
      if (rectContains(zone, { x, y })) return false;
    }
    return true;
  }

  // ───────────────────────────────────────────────────────────────────
  // 击退（spec §5.10 杨云红边冲撞命中后由 CombatManager 触发）
  // ───────────────────────────────────────────────────────────────────
  applyKnockback(vx: number, vy: number, durationMs: number): void {
    this.state.knockbackVx = vx;
    this.state.knockbackVy = vy;
    this.state.knockbackRemainingMs = durationMs;
  }

  // ───────────────────────────────────────────────────────────────────
  // 移动
  // ───────────────────────────────────────────────────────────────────
  handleMovement(deltaMs: number): void {
    if (this.state.noteOverlayActive) return;
    // spec §3.2: fistDash 冲刺期间忽略键盘输入，按锁定方向推进（250px / 0.3s = 833 px/s）
    if (this.state.dashLockState !== null) {
      const dash = this.state.dashLockState;
      const dashSpeed = 833;
      const stepMs = Math.min(deltaMs, dash.activeMs);
      const dx = dash.dirX * dashSpeed * (stepMs / 1000);
      const dy = dash.dirY * dashSpeed * (stepMs / 1000);
      if (this.checkWalkable(this.state.playerX + dx, this.state.playerY)) {
        this.state.playerX += dx;
      } else {
        this.state.dashLockState = null; // 撞墙立即停止
      }
      if (this.state.dashLockState !== null && this.checkWalkable(this.state.playerX, this.state.playerY + dy)) {
        this.state.playerY += dy;
      } else if (this.state.dashLockState !== null) {
        this.state.dashLockState = null;
      }
      dash.activeMs -= stepMs;
      if (dash.activeMs <= 0) this.state.dashLockState = null;
      // 朝向仍按冲刺方向（用于攻击/视觉）
      this.state.facingX = dash.dirX;
      this.state.facingY = dash.dirY;
      // 地图边界钳制
      this.state.playerX = Math.max(0, Math.min(this.state.manifest.bounds.width, this.state.playerX));
      this.state.playerY = Math.max(0, Math.min(this.state.manifest.bounds.height, this.state.playerY));
      this.state.isMoving = true;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.state.cursors.left.isDown) dx -= 1;
    if (this.state.cursors.right.isDown) dx += 1;
    if (this.state.cursors.up.isDown) dy -= 1;
    if (this.state.cursors.down.isDown) dy += 1;

    this.state.isRunning = this.state.keyShift.isDown;
    this.state.isMoving = dx !== 0 || dy !== 0;

    if (!this.state.isMoving) {
      return;
    }

    // 归一化
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    // 朝向（攻击方向）
    this.state.facingX = dx;
    this.state.facingY = dy;

    // 速度（升级 swift +4%/tier × tier）
    const base = PLAYER_BASE_SPEED;
    const speed = this.state.isRunning && this.state.player.canRun()
      ? PLAYER_RUN_SPEED
      : base;
    const effective = this.state.player.getEffectiveSpeed(speed) * this.state.upgradeEffects.moveSpeedMultiplier;

    const stepX = dx * effective * (deltaMs / 1000);
    const stepY = dy * effective * (deltaMs / 1000);

    // 碰撞检测：分轴
    if (this.checkWalkable(this.state.playerX + stepX, this.state.playerY)) {
      this.state.playerX += stepX;
    }
    if (this.checkWalkable(this.state.playerX, this.state.playerY + stepY)) {
      this.state.playerY += stepY;
    }

    // 地图边界钳制
    this.state.playerX = Math.max(0, Math.min(this.state.manifest.bounds.width, this.state.playerX));
    this.state.playerY = Math.max(0, Math.min(this.state.manifest.bounds.height, this.state.playerY));
  }

  // ───────────────────────────────────────────────────────────────────
  // 攻击输入
  // ───────────────────────────────────────────────────────────────────
  onAttackPressed(): void {
    if (this.state.noteOverlayActive) return;
    if (this.state.player.isDead) return;
    const dir = { x: this.state.facingX, y: this.state.facingY };
    const timeMs = this.state.combatManager.getTimeMs();
    this.state.scene.performPlayerAttack(dir, timeMs);
  }

  onUltimatePressed(): void {
    if (this.state.noteOverlayActive) return;
    if (this.state.player.isDead) return;
    const dir = { x: this.state.facingX, y: this.state.facingY };
    const timeMs = this.state.combatManager.getTimeMs();
    this.state.weaponAdapter.performUltimate(dir, timeMs);
    // spec §3.2: fistDash 锁定向 + 250px/0.3s 实际冲刺（833 px/s）
    if (this.state.loadout.weaponId === 'weapon.fistGauntlet') {
      this.state.dashLockState = { activeMs: 300, dirX: dir.x, dirY: dir.y };
    }
  }

  private onInteractPressed(): void {
    if (this.state.player.isDead) return;
    // 0. 阅读中再按 H 关闭（spec §6）
    if (this.state.noteOverlayActive) { this.closeNoteOverlay(); return; }
    // 优先：正在破译的宝箱 → 推进；否则：附近宝箱 → 开始破译；否则：vault door；否则：撤离点
    if (this.state.activeChestId !== null) {
      // ChestDecrypt 自带 F 键 wiring，这里不重复处理
      return;
    }
    // 找最近未开启宝箱
    const chest = this.findNearestChest();
    if (chest !== null) {
      this.startChestDecrypt(chest);
      return;
    }
    // 3. 最近纸条（spec §6）
    const note = this.findNearestNote();
    if (note !== null) { this.startReadNote(note); return; }
    // spec §10.1: vault door
    if (this.distanceToVaultDoor() <= EXIT_INTERACT_DISTANCE) {
      this.tryUnlockVaultDoor();
      return;
    }
    // 撤离点
    if (this.distanceToExit() <= EXIT_INTERACT_DISTANCE) {
      this.callbacks.onEvacuate();
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 宝箱交互
  // ───────────────────────────────────────────────────────────────────
  createChestInteractions(): void {
    for (const chest of this.state.manifest.chests) {
      const cx = chest.bounds.x + chest.bounds.width / 2;
      const cy = chest.bounds.y + chest.bounds.height / 2;
      const zone = this.state.scene.add.zone(cx, cy, CHEST_INTERACT_DISTANCE * 2, CHEST_INTERACT_DISTANCE * 2);
      zone.setInteractive();
      this.state.chestHitAreas.set(chest.id, zone);
    }
  }

  findNearestChest(): ForgottenSanityChestSpawn | null {
    let nearest: ForgottenSanityChestSpawn | null = null;
    let nearestDist = Infinity;
    for (const chest of this.state.manifest.chests) {
      if (this.state.openedChests.has(chest.id)) continue;
      const cx = chest.bounds.x + chest.bounds.width / 2;
      const cy = chest.bounds.y + chest.bounds.height / 2;
      const dist = Math.sqrt((cx - this.state.playerX) ** 2 + (cy - this.state.playerY) ** 2);
      if (dist < CHEST_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = chest;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  startChestDecrypt(chest: ForgottenSanityChestSpawn): void {
    if (this.state.chestDecrypts.has(chest.id)) return;
    // spec §7.4：普通宝箱 NORMAL_CHEST_LOOT_TABLE / 鎏金 GILDED_CHEST_LOOT_TABLE
    const table = chest.kind === 'gilded' ? GILDED_CHEST_LOOT_TABLE : NORMAL_CHEST_LOOT_TABLE;
    const loot = rollLootTable(table, this.state.rng.next.bind(this.state.rng));
    const cx = chest.bounds.x + chest.bounds.width / 2;
    const cy = chest.bounds.y + chest.bounds.height / 2;
    const isVaultChest = chest.roomId === this.state.manifest.vaultRoomId;
    const decrypt = new ChestDecrypt({
      scene: this.state.scene,
      x: cx,
      y: cy,
      lootItems: loot,
      onLootCollected: (item: LootItem) => {
        this.state.inventory.add(item.id, 1);
      },
      isVaultChest,
    });
    this.state.chestDecrypts.set(chest.id, decrypt);
    this.state.activeChestId = chest.id;
  }

  // ───────────────────────────────────────────────────────────────────
  // 遗落的纸条交互（spec §6）
  // ───────────────────────────────────────────────────────────────────
  createNoteInteractions(): void {
    for (const note of this.state.manifest.notes) {
      const cx = note.bounds.x + note.bounds.width / 2;
      const cy = note.bounds.y + note.bounds.height / 2;
      const zone = this.state.scene.add.zone(cx, cy, NOTE_INTERACT_DISTANCE * 2, NOTE_INTERACT_DISTANCE * 2);
      zone.setInteractive();
      this.state.noteHitAreas.set(note.id, zone);
    }
  }

  findNearestNote(): ForgottenSanityNoteSpawn | null {
    let nearest: ForgottenSanityNoteSpawn | null = null;
    let nearestDist = Infinity;
    for (const note of this.state.manifest.notes) {
      const cx = note.bounds.x + note.bounds.width / 2;
      const cy = note.bounds.y + note.bounds.height / 2;
      const dist = Math.sqrt((cx - this.state.playerX) ** 2 + (cy - this.state.playerY) ** 2);
      if (dist < NOTE_INTERACT_DISTANCE && dist < nearestDist) {
        nearest = note;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  startReadNote(note: ForgottenSanityNoteSpawn): void {
    if (this.state.noteOverlayActive) return;
    const result = assignNoteContent({
      nextSequentialIndex: this.state.notesState.nextSequentialIndex,
      readThisRun: this.state.readNoteInstancesThisRun,
      instanceId: note.id,
      rng: this.state.rng.next.bind(this.state.rng),
    });
    this.state.readNoteInstancesThisRun.set(note.id, result.contentIndex);
    if (result.persisted) {
      this.state.notesState = { schemaVersion: this.state.notesState.schemaVersion, nextSequentialIndex: result.newNextSequentialIndex };
      saveNotesState(this.state.notesState);
    }
    const content = NOTE_CONTENTS[result.contentIndex]!;
    this.state.combatManager.setFrozen(true);
    this.state.noteOverlayActive = true;
    this.state.noteOverlay?.show(content.body);
  }

  closeNoteOverlay(): void {
    if (!this.state.noteOverlayActive) return;
    this.state.noteOverlay?.hide();
    this.state.noteOverlayActive = false;
    this.state.combatManager.setFrozen(false);
  }

  // ───────────────────────────────────────────────────────────────────
  // 撤离点 / vault door
  // ───────────────────────────────────────────────────────────────────
  createExitInteraction(): void {
    this.state.exitZone = this.state.scene.add.zone(
      this.state.exitX, this.state.exitY,
      EXIT_INTERACT_DISTANCE * 2, EXIT_INTERACT_DISTANCE * 2,
    );
    this.state.exitZone.setInteractive();
  }

  distanceToExit(): number {
    return Math.sqrt((this.state.exitX - this.state.playerX) ** 2 + (this.state.exitY - this.state.playerY) ** 2);
  }

  // spec §10.1: vault door 距离判定
  distanceToVaultDoor(): number {
    return Math.sqrt((this.state.vaultDoorX - this.state.playerX) ** 2 + (this.state.vaultDoorY - this.state.playerY) ** 2);
  }

  private tryUnlockVaultDoor(): void {
    if (this.state.renderer.vaultUnlocked) {
      (this.state.scene as unknown as { showToast?: (msg: string) => void }).showToast?.('已解锁');
      return;
    }
    if (!this.state.inventory.has('material.vaultKey')) {
      (this.state.scene as unknown as { showToast?: (msg: string) => void }).showToast?.('需要仓库钥匙');
      return;
    }
    this.state.inventory.remove('material.vaultKey', 1);
    this.state.renderer.unlockVaultDoor();
  }

  // ───────────────────────────────────────────────────────────────────
  // 输入接入（由 RunLifecycle 在构造器步骤 15 调用，此时 state.cursors/keyJ.. 已就绪）
  // ───────────────────────────────────────────────────────────────────
  bindInput(): void {
    // 攻击键单次触发
    this.state.keyJ.on('down', () => this.onAttackPressed());
    this.state.keyK.on('down', () => this.onUltimatePressed());
    this.state.keyH.on('down', () => this.onInteractPressed());
  }
}
