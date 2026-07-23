// src/tests/forgottenSanity/run/run-lifecycle.test.ts
// RunLifecycle 子模块单测（spec#5 §7.1 / plan#5 Task 15）。
//
// RunLifecycle 构造器依赖完整 Phaser scene（renderer.render / add.rectangle /
// cameras.main.startFollow / input.keyboard.createCursorKeys / NoteOverlay.create 等），
// 在 jsdom 中直接实例化不现实。故沿用 forgotten-sanity-run-controller.test.ts 既有的
// 源码契约（source-contract）模式：通过 fs.readFileSync + regex 提取方法体，断言关键调用
// 与调用顺序。这与 AGENTS.md「as unknown as 模式」同属项目特有的可观察性约定。
//
// 注意：handleEliteDefeated / runEvacuation 的源码契约已在
// forgotten-sanity-run-controller.test.ts 覆盖，本文件不重复，聚焦以下新路径：
//   1. update() 主循环委派顺序（handleMovement → combatManager.update → syncHud → syncMinimap）
//   2. update() 玩家死亡早返回
//   3. abandonRun() 委派到 scene.runDeathSettlement
//   4. 构造器 14 步装配 RunSharedState 只读字段
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LIFECYCLE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../forgottenSanity/run/RunLifecycle.ts'),
  'utf8',
);

/** 提取指定方法体（支持 public/private/无修饰符）。`\n  }` 锚定方法体结束。 */
function extractMethodBody(methodName: string): string {
  const re = new RegExp(
    `^[ \\t]*(?:private\\s+|public\\s+)?${methodName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n  \\}`,
    'm',
  );
  const match = LIFECYCLE_SRC.match(re);
  expect(match, `方法 ${methodName} 应存在于 RunLifecycle.ts`).not.toBeNull();
  return match![1]!;
}

describe('RunLifecycle.update 主循环委派顺序 (spec §5.1)', () => {
  it('update 调用 handleMovement → combatManager.update → syncHud → syncMinimap（顺序正确）', () => {
    const body = extractMethodBody('update');
    // 1. 玩家死亡早返回（前置守卫）
    expect(body).toMatch(/if\s*\(this\.player\.isDead\)\s*return/);
    // 2. 委派 interaction.handleMovement
    expect(body).toMatch(/this\.interaction\.handleMovement\s*\(/);
    // 3. 委派 combatManager.setPlayerPosition（同步玩家坐标给战斗系统）
    expect(body).toMatch(/this\.combatManager\.setPlayerPosition\s*\(/);
    // 4. 委派 combatManager.update
    expect(body).toMatch(/this\.combatManager\.update\s*\(/);
    // 5. 同步 HUD / Minimap
    expect(body).toMatch(/this\.syncHud\s*\(/);
    expect(body).toMatch(/this\.syncMinimap\s*\(/);
    // 6. 撤离点检测
    expect(body).toMatch(/this\.checkExitProximity\s*\(/);

    // 顺序断言：handleMovement 必须在 combatManager.update 之前
    const handleMovementIdx = body.indexOf('this.interaction.handleMovement');
    const combatUpdateIdx = body.indexOf('this.combatManager.update');
    expect(handleMovementIdx).toBeGreaterThan(-1);
    expect(combatUpdateIdx).toBeGreaterThan(-1);
    expect(handleMovementIdx).toBeLessThan(combatUpdateIdx);

    // syncHud / syncMinimap 必须在 combatManager.update 之后
    const syncHudIdx = body.indexOf('this.syncHud');
    expect(combatUpdateIdx).toBeLessThan(syncHudIdx);
  });

  it('update 玩家死亡时早返回（无后续副作用）', () => {
    const body = extractMethodBody('update');
    // isDead 守卫必须出现在 handleMovement 之前
    const deadGuardIdx = body.indexOf('this.player.isDead');
    const handleMovementIdx = body.indexOf('this.interaction.handleMovement');
    expect(deadGuardIdx).toBeGreaterThan(-1);
    expect(handleMovementIdx).toBeGreaterThan(-1);
    expect(deadGuardIdx).toBeLessThan(handleMovementIdx);
  });
});

describe('RunLifecycle.abandonRun (plan 2026-07-19 Task 14 / M8)', () => {
  it('abandonRun 委派到 scene.runDeathSettlement（按死亡处理，不调撤离结算）', () => {
    const body = extractMethodBody('abandonRun');
    // 必须调用 runDeathSettlement
    expect(body).toMatch(/this\.scene\.runDeathSettlement\s*\(/);
    // 不应调用 runEvacuationSettlement（放弃 ≠ 撤离）
    expect(body).not.toMatch(/runEvacuationSettlement/);
    // 不应调用 depositRunInventory / storeStash（仓库不变）
    expect(body).not.toMatch(/depositRunInventory/);
    expect(body).not.toMatch(/storeStash/);
  });
});

describe('RunLifecycle 构造器 14 步装配 (spec §5.1 RunSharedState 字段)', () => {
  it('构造器初始化全部只读依赖字段（manifest / renderer / interaction / player / inventory / combatManager / testHooks）', () => {
    // 提取构造器方法体（constructor 特殊：无返回类型，参数为 scene）
    const ctorMatch = LIFECYCLE_SRC.match(
      /constructor\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}/,
    );
    expect(ctorMatch, 'RunLifecycle 构造器应存在').not.toBeNull();
    const ctorBody = ctorMatch![1]!;

    // 14 步装配关键赋值（this.X = ...）
    const expectedAssignments = [
      'this.manifest =',
      'this.rng =',
      'this.renderer =',
      'this.interaction = new RunInteractionHandler',
      'this.upgradeEffects =',
      'this.loadout =',
      'this.player = new PlayerCombat',
      'this.inventory = new Inventory',
      'this.combatManager = new CombatManager',
      'this.weaponCooldowns =',
      'this.weaponAdapter =',
      'this.testHooks = new RunTestHooks',
    ];
    for (const assignment of expectedAssignments) {
      expect(ctorBody, `构造器应包含赋值: ${assignment}`).toContain(assignment);
    }

    // 玩家初始位置 = entrance 房间 spawnPoint
    expect(ctorBody).toMatch(/this\.playerX\s*=\s*entrance\.spawnPoint\.x/);
    expect(ctorBody).toMatch(/this\.playerY\s*=\s*entrance\.spawnPoint\.y/);

    // 撤离点 = exit 房间中心
    expect(ctorBody).toMatch(/this\.exitX\s*=/);
    expect(ctorBody).toMatch(/this\.exitY\s*=/);

    // scene 依赖注入
    expect(ctorBody).toMatch(/this\.scene\.setCombatDeps\s*\(/);
    expect(ctorBody).toMatch(/this\.scene\.setCurrentLoadout\s*\(/);

    // 输入绑定
    expect(ctorBody).toMatch(/this\.interaction\.bindInput\s*\(/);

    // vault door 交互
    expect(ctorBody).toMatch(/createVaultDoorInteraction/);
  });
});
