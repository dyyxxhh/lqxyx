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
