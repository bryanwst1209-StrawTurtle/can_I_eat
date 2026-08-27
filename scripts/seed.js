#!/usr/bin/env node
/**
 * 把本地 data/ 下的基础数据灌进云数据库。
 *
 * 用法：在微信开发者工具的云开发控制台里手动导入，或用云开发 CLI。
 * 本脚本负责把 data/*.json 整理成可直接导入的 JSONL 格式（云开发导入要求每行一条记录）。
 *
 *   node scripts/seed.js
 *   # 产出 dist/regions.jsonl、dist/categories.jsonl、dist/rules.jsonl
 *   # 然后在云开发控制台 → 数据库 → 对应集合 → 导入
 */

const fs = require('fs');
const path = require('path');

const 根 = path.join(__dirname, '..');
const 出 = path.join(根, 'dist');
fs.mkdirSync(出, { recursive: true });

function 写JSONL(文件名, 记录数组) {
  const 内容 = 记录数组.map((r) => JSON.stringify(r)).join('\n');
  fs.writeFileSync(path.join(出, 文件名), 内容 + '\n', 'utf-8');
  console.log(`${文件名}：${记录数组.length} 条`);
}

// 类别表
const cat = JSON.parse(fs.readFileSync(path.join(根, 'data/categories.json'), 'utf-8'));
写JSONL('categories.jsonl', Object.entries(cat.数据).map(([代码, 名称]) => ({
  代码, 名称, 来源: cat.来源, 抓取日期: cat.抓取日期,
})));

// 区划表：合并所有年度，新年份覆盖旧年份，但旧年份独有的码要保留
const 区划文件 = fs.readdirSync(path.join(根, 'data'))
  .filter((f) => /^regions-\d{4}\.json$/.test(f))
  .sort(); // 年份升序，后面的覆盖前面的

if (区划文件.length === 0) {
  console.log('regions：没有找到 data/regions-<年份>.json，跳过。见 scripts/fetch-regions.md');
} else {
  const 合并 = new Map();
  for (const f of 区划文件) {
    const j = JSON.parse(fs.readFileSync(path.join(根, 'data', f), 'utf-8'));
    for (const [代码, 名称] of Object.entries(j.数据)) {
      合并.set(代码, { 代码, 名称, 来源: j.来源, 年份: j.年份, 抓取日期: j.抓取日期 });
    }
  }
  写JSONL('regions.jsonl', [...合并.values()]);
}

// 规则表
const { 规则 } = require(path.join(根, 'cloudfunctions/analyze/lib/rules.js'));
写JSONL('rules.jsonl', 规则);

console.log('\n完成。到云开发控制台 → 数据库 → 对应集合 → 导入，选择 dist/ 下的文件。');
