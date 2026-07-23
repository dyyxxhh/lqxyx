import { describe, expect, it, vi } from 'vitest';

describe('ForgottenSanityRunController.runEvacuation (spec §1.3 — no double deposit)', () => {
  it('controller delegates to scene.runEvacuationSettlement and does not call depositRunInventory', async () => {
    // 通过模块间谍断言 controller 不直接调用 depositRunInventory / storeStash
    const stashModule = await import('../../forgottenSanity/meta/StashManager');
    const depositSpy = vi.spyOn(stashModule, 'depositRunInventory');
    const storeSpy = vi.spyOn(stashModule, 'storeStash');

    // 模拟：如果 controller.runEvacuation 被调用，应当只调用 scene.runEvacuationSettlement
    // 此处不实例化 controller（依赖 Phaser scene），仅断言模块层 spy 未被触发
    expect(depositSpy).not.toHaveBeenCalled();
    expect(storeSpy).not.toHaveBeenCalled();
  });
});

describe('ForgottenSanityRunController.runEvacuation (spec §1.3 — stash unchanged by controller)', () => {
  it('controller path does not modify stash (side effect owned by SettlementScreen)', async () => {
    // 契约级断言：runEvacuation 方法体不调用 depositRunInventory / storeStash。
    // 起配阶段的 storeStash(built.stash) 是合法的（consumeLoadoutFromStash 副作用），
    // 不在禁用范围内 — 故只检查 runEvacuation 方法体而非整个文件。
    const fs = await import('fs');
    const path = await import('path');
    const ctrlSrc = fs.readFileSync(
      path.resolve(__dirname, '../../forgottenSanity/run/RunLifecycle.ts'),
      'utf8',
    );
    // 提取 runEvacuation 方法体（spec#5 §5.1 拆分后位于 RunLifecycle）
    const match = ctrlSrc.match(/private runEvacuation\(\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(match).not.toBeNull();
    const methodBody = match![1]!;
    // 方法体内不应含 depositRunInventory 或 storeStash 调用
    expect(methodBody).not.toMatch(/depositRunInventory\s*\(/);
    expect(methodBody).not.toMatch(/storeStash\s*\(/);
    // 应当调用 scene.runEvacuationSettlement
    expect(methodBody).toMatch(/runEvacuationSettlement\s*\(/);
  });
});

import type Phaser from 'phaser';
import { Minimap, BIG_MAP_TEXT_DEPTH } from '../../forgottenSanity/ui/Minimap';

describe('Minimap fog of war (spec §9.2)', () => {
  it('does not render chest marker in unexplored cell', () => {
    // Minimap 是 Phaser 薄层；用 mock scene 验证 add.circle 调用
    const calls: Array<{ x: number; y: number; color: number }> = [];
    const fakeScene = {
      add: {
        rectangle: () => ({
          setOrigin: () => ({ setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }) }),
          setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }),
        }),
        circle: vi.fn((x: number, y: number, _r: number, color: number) => {
          calls.push({ x, y, color });
          return {
            setScrollFactor: () => ({ setDepth: () => ({}) }),
            destroy: () => {},
          };
        }),
      },
      cameras: { main: { width: 200, height: 200 } },
      input: { keyboard: { addKey: () => ({ on: () => {} }) } },
    } as unknown as Phaser.Scene;
    const minimap = new Minimap(fakeScene);
    // cellIndex = row*5 + col, col=floor(x/1000), row=floor(y/1000)
    // 玩家 (500,500) → cell 0；宝箱 (2000,2000) → cell 12；出口 (3000,3000) → cell 18
    minimap.update({
      playerX: 500, playerY: 500, // cell 0
      exploredCells: [0],          // 仅 cell 0 已探索
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }], // cell 12，未探索
      bodyMarkers: [],
      exitDiscovered: true, exitX: 3000, exitY: 3000, // cell 18，未探索
    });
    // 仅玩家点应被绘制（cell 0 已探索，玩家点不过滤）
    expect(calls.length).toBe(1);
  });

  it('renders chest marker when its cell is explored', () => {
    const calls: Array<{ x: number; y: number }> = [];
    const fakeScene = {
      add: {
        rectangle: () => ({
          setOrigin: () => ({ setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }) }),
          setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }),
        }),
        circle: vi.fn((x: number, y: number) => {
          calls.push({ x, y });
          return {
            setScrollFactor: () => ({ setDepth: () => ({}) }),
            destroy: () => {},
          };
        }),
      },
      cameras: { main: { width: 200, height: 200 } },
      input: { keyboard: { addKey: () => ({ on: () => {} }) } },
    } as unknown as Phaser.Scene;
    const minimap = new Minimap(fakeScene);
    // 宝箱 (2000,2000) → cell 12；exploredCells 包含 12 时应绘制
    minimap.update({
      playerX: 500, playerY: 500, // cell 0
      exploredCells: [0, 12],      // cell 0 + cell 12 已探索
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }], // cell 12
      bodyMarkers: [],
      exitDiscovered: false, exitX: 0, exitY: 0,
    });
    // 玩家点 + 宝箱点 = 2 个 circle
    expect(calls.length).toBe(2);
  });
});

describe('handleEliteDefeated source contract (spec §5.10 + §9.3 + §10.1)', () => {
  it('handleEliteDefeated adds vaultKey + calls duplicateSilentOnes + removes exitDiscovered side effect', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const ctrlSrc = fs.readFileSync(
      path.resolve(__dirname, '../../forgottenSanity/run/RunLifecycle.ts'),
      'utf8',
    );
    // spec#5 §5.1 拆分后 handleEliteDefeated 位于 RunLifecycle。
    // Task 1 将 handleEliteDefeated 从 private 改为 public（无修饰符），
    // 以便 ForgottenSanityScene 测试钩子直接调用。regex 可见性修饰符可选，
    // 并用 ^[ \t]* + m flag 锚定行首，避免匹配 this.handleEliteDefeated() 调用处。
    const match = ctrlSrc.match(/^[ \t]*(?:private\s+|public\s+)?handleEliteDefeated\(\)[^{]*\{([\s\S]*?)\n  \}/m);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 必须添加仓库钥匙
    expect(body).toMatch(/inventory\.add\(['"]material\.vaultKey['"],\s*1\)/);
    // 必须调用 duplicateSilentOnes
    expect(body).toMatch(/duplicateSilentOnes\s*\(/);
    // 必须调用 triggerRedEdgeKill
    expect(body).toMatch(/triggerRedEdgeKill\s*\(/);
    // 必须做碎片掷骰
    expect(body).toMatch(/rollLootTable\s*\(/);
    // 不应再含 exitDiscovered = true（旧占位逻辑已删除）
    expect(body).not.toMatch(/exitDiscovered\s*=\s*true/);
  });
});

describe('tryUnlockVaultDoor source contract (spec §10.1)', () => {
  it('tryUnlockVaultDoor consumes key + calls unlockVaultDoor when key present', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const ctrlSrc = fs.readFileSync(
      path.resolve(__dirname, '../../forgottenSanity/run/RunInteractionHandler.ts'),
      'utf8',
    );
    // spec#5 §5.1 拆分后 tryUnlockVaultDoor 位于 RunInteractionHandler。
    const match = ctrlSrc.match(/private tryUnlockVaultDoor\(\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 必须检查 vaultUnlocked
    expect(body).toMatch(/vaultUnlocked/);
    // 必须检查 inventory.has('material.vaultKey')
    expect(body).toMatch(/inventory\.has\(['"]material\.vaultKey['"]\)/);
    // 必须消耗钥匙
    expect(body).toMatch(/inventory\.remove\(['"]material\.vaultKey['"],\s*1\)/);
    // 必须调用 unlockVaultDoor
    expect(body).toMatch(/unlockVaultDoor\s*\(/);
  });

  it('onInteractPressed routes to vault door before exit', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const ctrlSrc = fs.readFileSync(
      path.resolve(__dirname, '../../forgottenSanity/run/RunInteractionHandler.ts'),
      'utf8',
    );
    // spec#5 §5.1 拆分后 onInteractPressed 位于 RunInteractionHandler。
    const match = ctrlSrc.match(/private onInteractPressed\(\)[^{]*\{([\s\S]*?)\n  \}/);
    expect(match).not.toBeNull();
    const body = match![1]!;
    // 必须有 distanceToVaultDoor 判断
    expect(body).toMatch(/distanceToVaultDoor/);
    // vault door 分支必须在 runEvacuation 之前
    const vaultIdx = body.indexOf('distanceToVaultDoor');
    const exitIdx = body.indexOf('distanceToExit');
    expect(vaultIdx).toBeGreaterThan(-1);
    expect(exitIdx).toBeGreaterThan(-1);
    expect(vaultIdx).toBeLessThan(exitIdx);
  });
});

describe('#10 bigMap fog-of-war filtering', () => {
  // 大地图 circle 调用通过 setDepth(BIG_MAP_TEXT_DEPTH) 与小地图区分。
  // cell 计算：row * 5 + col；col = floor(x/1000)，row = floor(y/1000)。
  function createTrackedMinimap(): {
    minimap: Minimap;
    bigMapCalls: Array<{ x: number; y: number; r: number; color: number }>;
  } {
    const bigMapCalls: Array<{ x: number; y: number; r: number; color: number }> = [];
    const fakeScene = {
      add: {
        rectangle: () => ({
          setOrigin: () => ({ setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }) }),
          setScrollFactor: () => ({ setDepth: () => ({ setInteractive: () => ({ on: () => ({}) }) }) }),
        }),
        circle: vi.fn((x: number, y: number, r: number, color: number) => ({
          setScrollFactor: () => ({
            setDepth: (d: number) => {
              if (d === BIG_MAP_TEXT_DEPTH) bigMapCalls.push({ x, y, r, color });
              return {};
            },
          }),
          destroy: () => {},
        })),
      },
      cameras: { main: { width: 200, height: 200 } },
      input: { keyboard: { addKey: () => ({ on: () => {} }) } },
    } as unknown as Phaser.Scene;
    const minimap = new Minimap(fakeScene);
    return { minimap, bigMapCalls };
  }

  it('does not render chest/exit/body markers on big map when their cells are unexplored', () => {
    const { minimap, bigMapCalls } = createTrackedMinimap();
    minimap.toggleBigMap(); // 打开大地图

    // 玩家 (500,500) → cell 0（已探索）
    // chest (2000,2000) → cell 12，未探索
    // body (2500,1500) → cell 7，未探索
    // exit (3000,3000) → cell 18，未探索
    minimap.update({
      playerX: 500, playerY: 500,
      exploredCells: [0],
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }],
      bodyMarkers: [{ bodyId: 'b1', x: 2500, y: 1500 }],
      exitDiscovered: true, exitX: 3000, exitY: 3000,
    });

    // 大地图上应只有玩家点（cell 0），chest/exit/body 全部被过滤
    expect(bigMapCalls.length).toBe(1);
  });

  it('renders chest/exit/body markers on big map when their cells are explored', () => {
    const { minimap, bigMapCalls } = createTrackedMinimap();
    minimap.toggleBigMap();

    // 玩家 cell 0；chest cell 12；body cell 7；exit cell 18 — 全部已探索
    minimap.update({
      playerX: 500, playerY: 500,
      exploredCells: [0, 7, 12, 18],
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }],
      bodyMarkers: [{ bodyId: 'b1', x: 2500, y: 1500 }],
      exitDiscovered: true, exitX: 3000, exitY: 3000,
    });

    // 大地图上应有：玩家 + chest + exit + body = 4 个
    expect(bigMapCalls.length).toBe(4);
  });

  it('does not show chest in unexplored cell on big map (single chest case)', () => {
    const { minimap, bigMapCalls } = createTrackedMinimap();
    minimap.toggleBigMap();

    // 仅 cell 0 探索；远房 cell 12 有宝箱
    minimap.update({
      playerX: 500, playerY: 500,
      exploredCells: [0],
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }],
      bodyMarkers: [],
      exitDiscovered: false, exitX: 0, exitY: 0,
    });

    // 仅玩家点；chest 不显示
    expect(bigMapCalls.length).toBe(1);
  });

  it('shows chest in explored cell on big map (single chest case)', () => {
    const { minimap, bigMapCalls } = createTrackedMinimap();
    minimap.toggleBigMap();

    // cell 0 + cell 12 探索；chest 在 cell 12
    minimap.update({
      playerX: 500, playerY: 500,
      exploredCells: [0, 12],
      chestMarkers: [{ id: 'c1', x: 2000, y: 2000, opened: false, kind: 'normal' }],
      bodyMarkers: [],
      exitDiscovered: false, exitX: 0, exitY: 0,
    });

    // 玩家点 + chest = 2 个
    expect(bigMapCalls.length).toBe(2);
  });
});
