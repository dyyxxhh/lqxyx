// src/forgottenSanity/run/RunTestHooks.ts
// 对局测试钩子子模块（spec#5 §5.1 拆分 / plan 2026-07-19 Task 23）。
// 仅供 DEV / E2E 调用，通过 ForgottenSanityScene.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__
// 暴露给 window。每个 *ForTest 方法对应 ForgottenSanityTestHooks 接口的一项。
// 共享状态由 RunSharedState 注入；宝箱/纸条破译通过 RunInteractionHandler 反向调用。
import type {
  ForgottenSanityChestSpawn,
  ForgottenSanityNoteSpawn,
} from '../map/forgottenSanityMapState';
import { rectContains } from '../map/forgottenSanityMapState';
import { saveNotesState } from '../state/forgottenSanityState';
import type { RunSharedState } from './runTypes';
import type { RunInteractionHandler } from './RunInteractionHandler';

// 与 RunInteractionHandler 保持一致的纸条交互半径（spec §6）
const NOTE_INTERACT_DISTANCE = 80;

/**
 * 测试钩子子模块。由 RunLifecycle 在构造器末尾实例化（此时 state + interaction 均就绪）。
 * 不参与正常运行时流程；仅响应 E2E / 手动 QA 通过 window 钩子发起的查询与注入。
 */
export class RunTestHooks {
  constructor(
    private readonly state: RunSharedState,
    private readonly interaction: RunInteractionHandler,
  ) {}

  /** 给玩家加 1 把仓库钥匙（spec §10.1 测试用）。 */
  giveVaultKeyForTest(): void {
    this.state.inventory.add('material.vaultKey', 1);
  }

  /** 把玩家瞬移到 vault door 交互点（spec §10.1 测试用）。 */
  movePlayerToVaultDoorForTest(): void {
    this.state.playerX = this.state.vaultDoorX;
    this.state.playerY = this.state.vaultDoorY;
    this.state.playerSprite?.setPosition(this.state.playerX, this.state.playerY);
  }

  /** 把玩家瞬移到指定房间中心（E2E fog-of-war / 战斗摘要测试用）。
   *  roomId 支持语义别名 'entrance'/'exit'/'vault'（解析为 manifest 对应房间）。 */
  movePlayerToForTest(roomId: string): void {
    const resolved = this.resolveRoomIdForTest(roomId);
    const room = this.state.manifest.rooms.find((r) => r.id === resolved);
    if (room === undefined) return;
    this.state.playerX = room.bounds.x + room.bounds.width / 2;
    this.state.playerY = room.bounds.y + room.bounds.height / 2;
    this.state.playerSprite?.setPosition(this.state.playerX, this.state.playerY);
  }

  /**
   * 在指定房间中心生成一个宝箱并立即开始破译（spec §10.1 测试用）。
   * isVaultChest=true 时房间应 = vaultRoomId，ChestDecrypt 走 forceOpen() 免费开。
   * 不经过 findNearestChest 距离判定，直接 startChestDecrypt。
   */
  spawnChestForTest(roomId: string, isVaultChest: boolean): void {
    const targetRoomId = isVaultChest ? this.state.manifest.vaultRoomId : roomId;
    const room = this.state.manifest.rooms.find((r) => r.id === targetRoomId);
    if (room === undefined) return;
    const synthetic: ForgottenSanityChestSpawn = {
      id: `test-chest-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      roomId: targetRoomId,
      kind: 'normal',
      bounds: {
        x: room.bounds.x + room.bounds.width / 2 - 16,
        y: room.bounds.y + room.bounds.height / 2 - 16,
        width: 32,
        height: 32,
      },
    };
    this.interaction.startChestDecrypt(synthetic);
  }

  /** 背包摘要：items = { itemId: quantity }，vaultKey = 仓库钥匙数量。 */
  getInventorySummaryForTest(): { items: Record<string, number>; vaultKey: number } {
    const items: Record<string, number> = {};
    for (const entry of this.state.inventory.entries()) {
      items[entry.itemId] = entry.quantity;
    }
    return {
      items,
      vaultKey: this.state.inventory.quantity('material.vaultKey'),
    };
  }

  /** 战斗摘要：敌人总数 / 复制体数 / 远房（非玩家所在房间）敌人数。 */
  getCombatSummaryForTest(): { enemyCount: number; duplicateCount: number; farRoomCount: number } {
    const enemies = this.state.combatManager.enemies;
    const playerRoom = this.state.manifest.rooms.find(
      (r) => rectContains(r.bounds, { x: this.state.playerX, y: this.state.playerY }),
    );
    const playerRoomId = playerRoom?.id ?? null;
    return {
      enemyCount: enemies.length,
      duplicateCount: enemies.filter((e) => e.isDuplicate).length,
      farRoomCount: enemies.filter((e) => e.currentRoomId !== playerRoomId).length,
    };
  }

  /** vault 状态：门是否已解锁 / 已破译宝箱数（含 test spawn 的 vault chest）。 */
  getVaultStateForTest(): { doorUnlocked: boolean; chestsOpened: number } {
    return {
      doorUnlocked: this.state.renderer.vaultUnlocked,
      chestsOpened: this.state.chestDecrypts.size,
    };
  }

  /** 雾战已探索 cell 索引数组（spec §9.2）。 */
  getExploredCellsForTest(): number[] {
    return [...this.state.exploredCells];
  }

  /** spec §11 测试钩子：强制在某房间生成一张纸条实例（覆盖本局 manifest.notes）。 */
  spawnNoteForTest(roomId: string): void {
    const room = this.state.manifest.rooms.find((r) => r.id === roomId);
    if (room === undefined) return;
    const noteId = `note-test-${this.state.noteHitAreas.size}`;
    const fakeNote: ForgottenSanityNoteSpawn = {
      id: noteId,
      roomId,
      bounds: {
        x: room.spawnPoint.x - 24,
        y: room.spawnPoint.y - 24,
        width: 48,
        height: 48,
      },
    };
    // 注入到 manifest.notes（cast off readonly for test-only mutation）
    (this.state.manifest as unknown as { notes: ForgottenSanityNoteSpawn[] }).notes = [
      ...this.state.manifest.notes,
      fakeNote,
    ];
    const cx = fakeNote.bounds.x + 24;
    const cy = fakeNote.bounds.y + 24;
    const zone = this.state.scene.add.zone(cx, cy, NOTE_INTERACT_DISTANCE * 2, NOTE_INTERACT_DISTANCE * 2);
    zone.setInteractive();
    this.state.noteHitAreas.set(noteId, zone);
  }

  /** spec §11 测试钩子：返回当前 note 阅读进度。 */
  getNoteStateForTest(): { nextSequentialIndex: number; readThisRun: string[] } {
    return {
      nextSequentialIndex: this.state.notesState.nextSequentialIndex,
      readThisRun: [...this.state.readNoteInstancesThisRun.keys()],
    };
  }

  /** spec §11 测试钩子：模拟按 H 读最近纸条。返回是否成功打开 overlay。 */
  readNearestNoteForTest(): boolean {
    if (this.state.noteOverlayActive) return false;
    const note = this.interaction.findNearestNote();
    if (note === null) return false;
    this.interaction.startReadNote(note);
    return this.state.noteOverlayActive;
  }

  /** spec §11 测试钩子：返回当前 note overlay 是否可见。 */
  isNoteOverlayActiveForTest(): boolean {
    return this.state.noteOverlayActive;
  }

  /** spec §11 测试钩子 / handleEsc 用：关闭 note overlay。 */
  closeNoteOverlayForTest(): void {
    this.interaction.closeNoteOverlay();
  }

  /** spec §11 测试钩子：把玩家瞬移到最近的纸条旁。 */
  movePlayerToNoteForTest(): void {
    if (this.state.manifest.notes.length === 0) return;
    const note = this.state.manifest.notes[0]!;
    this.state.playerX = note.bounds.x + 24;
    this.state.playerY = note.bounds.y + 24;
    this.state.playerSprite?.setPosition(this.state.playerX, this.state.playerY);
  }

  /** spec §11 测试钩子：直接覆盖持久化 notesState（仅测试用）。 */
  forceNotesStateForTest(nextSequentialIndex: number): void {
    this.state.notesState = { schemaVersion: this.state.notesState.schemaVersion, nextSequentialIndex };
    saveNotesState(this.state.notesState);
  }

  /** 将语义别名解析为真实房间 ID（E2E 不知随机 room ID，用 'entrance'/'exit'/'vault'）。 */
  private resolveRoomIdForTest(roomId: string): string {
    if (roomId === 'entrance') return this.state.manifest.entranceRoomId;
    if (roomId === 'exit') return this.state.manifest.exitRoomId;
    if (roomId === 'vault') return this.state.manifest.vaultRoomId;
    return roomId;
  }
}
