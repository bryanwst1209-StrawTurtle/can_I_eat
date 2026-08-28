#!/usr/bin/env node
/**
 * 把本地 data/ 下的基础数据整理成云开发可导入的 JSONL（每行一条记录）。
 *
 *   node scripts/seed.js
 *   # 产出 dist/regions.jsonl、dist/categories.jsonl、dist/rules.jsonl
 *   # 然后在云开发控制台 → 数据库 → 对应集合 → 导入
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

function writeJSONL(filename, records) {
  fs.writeFileSync(path.join(out, filename), records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  console.log(`${filename}：${records.length} 条`);
}

// 类别表
const cat = JSON.parse(fs.readFileSync(path.join(root, 'data/categories.json'), 'utf-8'));
writeJSONL('categories.jsonl', Object.entries(cat.data).map(([code, name]) => ({
  code, name, source: cat.source, fetchedAt: cat.fetchedAt,
})));

// 区划表：合并所有年度，新年份覆盖旧年份，但旧年份独有的码要保留
const regionFiles = fs.readdirSync(path.join(root, 'data'))
  .filter((f) => /^regions-\d{4}\.json$/.test(f))
  .sort(); // 年份升序，后面的覆盖前面的

if (regionFiles.length === 0) {
  console.log('regions：没有找到 data/regions-<年份>.json，跳过。见 scripts/fetch-regions.md');
} else {
  const merged = new Map();
  for (const f of regionFiles) {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf-8'));
    for (const [code, name] of Object.entries(j.data)) {
      merged.set(code, { code, name, source: j.source, year: j.year, fetchedAt: j.fetchedAt });
    }
  }
  writeJSONL('regions.jsonl', [...merged.values()]);
}

// 规则表
const { RULES } = require(path.join(root, 'cloudfunctions/analyze/lib/rules.js'));
writeJSONL('rules.jsonl', RULES);

console.log('\n完成。到云开发控制台 → 数据库 → 对应集合 → 导入，选择 dist/ 下的文件。');
