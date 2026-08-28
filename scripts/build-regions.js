#!/usr/bin/env node
/**
 * 把下载来的行政区划代码原始文件转成 data/regions-<年份>.json。
 *
 * 为什么要你手动下载：中国政府网站对境外网络不可达
 * （mca.gov.cn DNS 解析失败，stats.gov.cn 返回 403），
 * 而这份数据一年才更新一次，不值得为它折腾代理。
 *
 * 用法：
 *   1. 把下载的文件放到 data/raw/，按年份命名，如 data/raw/2025.html
 *      （.html / .txt / .csv 都行，脚本只认「6位数字 + 名称」这个模式）
 *   2. node scripts/build-regions.js
 *   3. node scripts/seed.js      产出可导入云数据库的 dist/regions.jsonl
 *
 * 数据源（在国内网络打开）：
 *   民政部   https://www.mca.gov.cn/n156/n186/          《中华人民共和国行政区划代码》
 *   统计局   https://www.stats.gov.cn/sj/tjbz/tjyqhdmhcxhfdm/   统计用区划代码（前6位即行政区划代码）
 *
 * 两个来源的 6 位代码是同一套（GB/T 2260），用哪个都行，
 * 但要把 --source 参数填对——报告里会显示「查表依据：<来源> <日期>」，
 * 来源写错就等于给用户看了一条假的证据链。
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rawDir = path.join(root, 'data/raw');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const source = arg('source', '国家统计局 统计用区划代码');
const fetchedAt = arg('date', new Date().toISOString().slice(0, 10));

if (!fs.existsSync(rawDir)) {
  console.error(`没有 ${rawDir}，先建目录并把下载的文件放进去`);
  process.exit(1);
}

const files = fs.readdirSync(rawDir).filter((f) => /^\d{4}\.(html?|txt|csv)$/i.test(f));
if (files.length === 0) {
  console.error('data/raw/ 下没有找到 <年份>.html / .txt / .csv 文件');
  console.error('例如：data/raw/2025.html');
  process.exit(1);
}

for (const f of files) {
  const year = f.slice(0, 4);
  const text = fs.readFileSync(path.join(rawDir, f), 'utf-8');
  const data = parse(text);

  const count = Object.keys(data).length;
  if (count === 0) {
    console.error(`${f}：一条都没解析出来，检查文件内容是否是「代码 + 名称」的列表`);
    continue;
  }

  const dest = path.join(root, 'data', `regions-${year}.json`);
  fs.writeFileSync(dest, JSON.stringify({ source, year, fetchedAt, data }, null, 2) + '\n', 'utf-8');
  console.log(`${f} → regions-${year}.json：${count} 条`);

  const provinces = Object.keys(data).filter((c) => c.endsWith('0000')).length;
  if (provinces < 30 || provinces > 40) {
    console.warn(`  ⚠ 省级代码 ${provinces} 个，正常应在 31-34 之间，可能没解析全`);
  }
}

/**
 * 从任意文本里抠出「6位代码 + 名称」。
 * HTML 先去标签，再逐行匹配，因此 html / txt / csv 用同一套逻辑。
 */
function parse(text) {
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(tr|p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '\t')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  const data = {};
  for (const line of plain.split(/\r?\n/)) {
    // 一行里可能有多组（表格被压成一行的情况）
    const re = /(\d{6})[\s\t,，]+([一-龥][一-龥A-Za-z·（）()]{0,30})/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const [, code, rawName] = m;
      const name = rawName.trim();
      // 全 0 结尾之外的代码也保留；名称过短的多半是误匹配
      if (name.length >= 2) data[code] = name;
    }
  }
  return data;
}
