// src/forgottenSanity/ForgottenSanityRunController.ts
// 被遗忘的理智 对局装配器门面（spec#5 §5.1 拆分）。
// 原 1116 行单体已拆为三个子模块：
//   - run/RunLifecycle.ts         构造器 14 步 + update + 撤离/放弃/死亡/精英 + spawn + HUD/Minimap
//   - run/RunInteractionHandler.ts 移动 / 攻击 / 交互优先级（宝箱→纸条→vault→撤离）/ 可走性
//   - run/RunTestHooks.ts         14 个 *ForTest 方法（E2E / 手动 QA 钩子）
// 本门面仅做委托，对外 API 与 ForgottenSanityTestHooks 钩子接口保持不变。
// 逐行审核编写，每个调用都有 API 依据。
// spec §1.2/§1.3/§2/§3/§4/§5/§6/§7/§8/§9/§10/§11，grill 2026-07-17。
import type Phaser from 'phaser';

import type { ForgottenSanityScene } from './ForgottenSanityScene';
import { RunLifecycle } from './run/RunLifecycle';

/**
 * 对局装配器门面。由 ForgottenSanityScene.create 实例化。
 * 职责：组合 Lifecycle / InteractionHandler / TestHooks 三个子模块，
 *       对外暴露统一 API（update / abandonRun / handleEliteDefeated / *ForTest 等）。
 * 所有逻辑已迁移至子模块；本类仅做单行委托。
 */
export class ForgottenSanityRunController {
  private readonly lifecycle: RunLifecycle;

  constructor(scene: ForgottenSanityScene & Phaser.Scene) {
    this.lifecycle = new RunLifecycle(scene);
  }

  // ───────────────────────────────────────────────────────────────────
  // 主循环 / 销毁（ForgottenSanityScene.update / destroyPlan6Ui 调用）
  // ───────────────────────────────────────────────────────────────────
  update(time: number, deltaMs: number): void {
    this.lifecycle.update(time, deltaMs);
  }

  destroy(): void {
    this.lifecycle.destroy();
  }

  // ───────────────────────────────────────────────────────────────────
  // 放弃对局 / 精英击杀（ForgottenSanityScene.PauseMenu / __testTriggerEliteDefeat 调用）
  // ───────────────────────────────────────────────────────────────────
  abandonRun(): void {
    this.lifecycle.abandonRun();
  }

  handleEliteDefeated(): void {
    this.lifecycle.handleEliteDefeated();
  }

  // ───────────────────────────────────────────────────────────────────
  // spec §11 测试钩子（ForgottenSanityScene.__YING_ZHONG_JIU_FORGOTTEN_SANITY_SCENE__ 暴露）
  // ───────────────────────────────────────────────────────────────────
  giveVaultKeyForTest(): void {
    this.lifecycle.testHooks.giveVaultKeyForTest();
  }

  movePlayerToVaultDoorForTest(): void {
    this.lifecycle.testHooks.movePlayerToVaultDoorForTest();
  }

  movePlayerToForTest(roomId: string): void {
    this.lifecycle.testHooks.movePlayerToForTest(roomId);
  }

  spawnChestForTest(roomId: string, isVaultChest: boolean): void {
    this.lifecycle.testHooks.spawnChestForTest(roomId, isVaultChest);
  }

  getInventorySummaryForTest(): { items: Record<string, number>; vaultKey: number } {
    return this.lifecycle.testHooks.getInventorySummaryForTest();
  }

  getCombatSummaryForTest(): { enemyCount: number; duplicateCount: number; farRoomCount: number } {
    return this.lifecycle.testHooks.getCombatSummaryForTest();
  }

  getVaultStateForTest(): { doorUnlocked: boolean; chestsOpened: number } {
    return this.lifecycle.testHooks.getVaultStateForTest();
  }

  getExploredCellsForTest(): number[] {
    return this.lifecycle.testHooks.getExploredCellsForTest();
  }

  spawnNoteForTest(roomId: string): void {
    this.lifecycle.testHooks.spawnNoteForTest(roomId);
  }

  getNoteStateForTest(): { nextSequentialIndex: number; readThisRun: string[] } {
    return this.lifecycle.testHooks.getNoteStateForTest();
  }

  readNearestNoteForTest(): boolean {
    return this.lifecycle.testHooks.readNearestNoteForTest();
  }

  isNoteOverlayActiveForTest(): boolean {
    return this.lifecycle.testHooks.isNoteOverlayActiveForTest();
  }

  closeNoteOverlayForTest(): void {
    this.lifecycle.testHooks.closeNoteOverlayForTest();
  }

  movePlayerToNoteForTest(): void {
    this.lifecycle.testHooks.movePlayerToNoteForTest();
  }

  forceNotesStateForTest(nextSequentialIndex: number): void {
    this.lifecycle.testHooks.forceNotesStateForTest(nextSequentialIndex);
  }
}
