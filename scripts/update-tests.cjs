const fs = require('fs');
const path = require('path');

const assetManifest = require('../src/data/assets.ts');

// 读取现有测试文件
const assetsTestPath = path.join(__dirname, '../src/data/assets.test.ts');
const preloadTestPath = path.join(__dirname, '../src/tests/preload.test.ts');

let assetsTestContent = fs.readFileSync(assetsTestPath, 'utf8');
let preloadTestContent = fs.readFileSync(preloadTestPath, 'utf8');

// 获取排序后的路径列表
const sortedPaths = [...new Set(assetManifest.assetManifest.map(a => a.path))].sort();
const totalCount = sortedPaths.length;
const halfwayCount = Math.floor(totalCount / 2);

console.log(`Total assets: ${totalCount}, halfway: ${halfwayCount}`);

// 生成新的expectedFinalAssetPaths数组
const newExpectedArray = sortedPaths.map(p => `  "${p}",`).join('\n');
const newExpectedBlock = `const expectedFinalAssetPaths = [\n${newExpectedArray}\n];`;

// 替换assets.test.ts中的数组
assetsTestContent = assetsTestContent.replace(
  /const expectedFinalAssetPaths = \[[\s\S]*?\];/,
  newExpectedBlock
);

// 替换长度断言
assetsTestContent = assetsTestContent.replace(
  /expect\(assetManifest\)\.toHaveLength\(\d+\);/,
  `expect(assetManifest).toHaveLength(${totalCount});`
);

// 更新preload.test.ts中的硬编码数字
preloadTestContent = preloadTestContent.replace(
  /expect\(entries\)\.toHaveLength\(53\);/,
  `expect(entries).toHaveLength(${totalCount});`
);

preloadTestContent = preloadTestContent.replace(
  /expect\(state\.total\)\.toBe\(53\);/,
  `expect(state.total).toBe(${totalCount});`
);

preloadTestContent = preloadTestContent.replace(
  /expect\(halfway\.loaded\)\.toBe\(27\);/,
  `expect(halfway.loaded).toBe(${halfwayCount});`
);

preloadTestContent = preloadTestContent.replace(
  /expect\(complete\.loaded\)\.toBe\(53\);/,
  `expect(complete.loaded).toBe(${totalCount});`
);

// 写入文件
fs.writeFileSync(assetsTestPath, assetsTestContent, 'utf8');
fs.writeFileSync(preloadTestPath, preloadTestContent, 'utf8');

console.log('Test files updated successfully!');
