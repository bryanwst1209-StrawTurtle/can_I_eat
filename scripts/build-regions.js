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

const 根 = path.join(__dirname, '..');
const 原始目录 = path.join(根, 'data/raw');

const 参数 = process.argv.slice(2);
const 取参 = (名, 默认值) => {
  const i = 参数.indexOf(`--${名}`);
  return i > -1 && 参数[i + 1] ? 参数[i + 1] : 默认值;
};
const 来源 = 取参('source', '国家统计局 统计用区划代码');
const 抓取日期 = 取参('date', new Date().toISOString().slice(0, 10));

if (!fs.existsSync(原始目录)) {
  console.error(`没有 ${原始目录}，先建目录并把下载的文件放进去`);
  process.exit(1);
}

const 文件 = fs.readdirSync(原始目录).filter((f) => /^\d{4}\.(html?|txt|csv)$/i.test(f));
if (文件.length === 0) {
  console.error('data/raw/ 下没有找到 <年份>.html / .txt / .csv 文件');
  console.error('例如：data/raw/2025.html');
  process.exit(1);
}

for (const f of 文件) {
  const 年份 = f.slice(0, 4);
  const 原文 = fs.readFileSync(path.join(原始目录, f), 'utf-8');
  const 数据 = 解析(原文);

  const 条数 = Object.keys(数据).length;
  if (条数 === 0) {
    console.error(`${f}：一条都没解析出来，检查文件内容是否是「代码 + 名称」的列表`);
    continue;
  }

  const 出路 = path.join(根, 'data', `regions-${年份}.json`);
  fs.writeFileSync(出路, JSON.stringify({ 来源, 年份, 抓取日期, 数据 }, null, 2) + '\n', 'utf-8');
  console.log(`${f} → regions-${年份}.json：${条数} 条`);

  const 省级 = Object.keys(数据).filter((c) => c.endsWith('0000')).length;
  if (省级 < 30 || 省级 > 40) {
    console.warn(`  ⚠ 省级代码 ${省级} 个，正常应在 31-34 之间，可能没解析全`);
  }
}

/**
 * 从任意文本里抠出「6位代码 + 名称」。
 * HTML 先去标签，再逐行匹配，因此 html / txt / csv 用同一套逻辑。
 */
function 解析(原文) {
  const 纯文本 = 原文
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(tr|p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '\t')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

  const 数据 = {};
  for (const 行 of 纯文本.split(/\r?\n/)) {
    // 一行里可能有多组（表格被压成一行的情况）
    const re = /(\d{6})[\s\t,，]+([一-龥][一-龥A-Za-z·（）()]{0,30})/g;
    let m;
    while ((m = re.exec(行)) !== null) {
      const [, 代码, 名称原始] = m;
      const 名称 = 名称原始.trim();
      // 全 0 结尾之外的代码也保留；名称过短的多半是误匹配
      if (名称.length >= 2) 数据[代码] = 名称;
    }
  }
  return 数据;
}
