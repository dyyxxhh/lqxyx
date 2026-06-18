import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { buildSupplementAssetReport } from '../src/data/assets.ts';

const outputPath = process.argv[2] ?? '.omo/evidence/task-14-supplement-report.md';
const report = `${buildSupplementAssetReport()}\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, report, 'utf-8');
console.log(`wrote ${outputPath}`);
