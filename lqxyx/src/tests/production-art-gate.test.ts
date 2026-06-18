import { describe, expect, it } from 'vitest';

import {
  approvedProgrammaticAssets,
  assetManifest,
  buildSupplementAssetReport,
  getMissingAssetBlockers,
  validateProductionArtGate,
  type MissingAssetBlocker,
} from '../data/assets';

const sampleMissingSupplementBlocker: MissingAssetBlocker = {
  key: 'supplement.missing-demo',
  productionStatus: 'BLOCKER_FOR_FINAL_ART',
  usage: 'Test-only missing supplement asset.',
  sceneOrRequirement: 'Production art gate regression fixture.',
  suggestedDimensions: '128x128 png',
  blockerReason: 'No supplied final asset path exists for this requirement.',
};

describe('production art gate', () => {
  it('keeps missing supplement blockers from being marked final complete', () => {
    expect(
      validateProductionArtGate({
        finalAssets: assetManifest,
        approvedImplementations: approvedProgrammaticAssets,
        missingBlockers: [sampleMissingSupplementBlocker],
        markFinalComplete: true,
      }),
    ).toEqual([
      'Cannot mark first-act production art final complete while missing supplement blockers remain: supplement.missing-demo',
    ]);
  });

  it('allows final completion when current first-act supplement blockers are empty', () => {
    expect(getMissingAssetBlockers()).toEqual([]);

    expect(
      validateProductionArtGate({
        finalAssets: assetManifest,
        approvedImplementations: approvedProgrammaticAssets,
        missingBlockers: getMissingAssetBlockers(),
        markFinalComplete: true,
      }),
    ).toEqual([]);
  });

  it('reports supplied assets, approved implementations, and empty supplement blockers distinctly', () => {
    const report = buildSupplementAssetReport();

    expect(report).toContain('Current first-act supplement blockers: empty');
    expect(report).toContain('doors.wallWoodBars: approved programmatic wood wall bars');
    expect(report).toContain('communication.steelInteractable: approved programmatic steel interactable');
    expect(report).toContain('officeFurniture.reuseDeskChairs: approved reuse of furniture.classroomDeskChairs');
    expect(report).toContain('prop.phone: supplied final asset at 最终素材/电话.png');
    expect(report).toContain('prop.phoneCabinetFront: supplied final asset at 最终素材/手机柜-正着.png');
    expect(report).toContain('prop.phoneCabinetAngled: supplied final asset at 最终素材/手机柜-斜着.png');
    expect(report).toContain('prop.celery: supplied final asset at 最终素材/芹菜（字面意思）.png');
    expect(report).toContain('prop.ruler: supplied final asset at 最终素材/尺子（字面意思）.png');
  });
});
