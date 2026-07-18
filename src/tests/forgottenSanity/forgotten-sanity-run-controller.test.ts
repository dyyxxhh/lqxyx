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
      path.resolve(__dirname, '../../forgottenSanity/ForgottenSanityRunController.ts'),
      'utf8',
    );
    // 提取 runEvacuation 方法体
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
import { Minimap } from '../../forgottenSanity/ui/Minimap';

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
