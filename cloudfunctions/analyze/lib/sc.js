/**
 * SC（食品生产许可证）编号的解析、校验与解码。
 *
 * 分两层，边界不可混淆（docs/design.md §6）：
 *   第一层 verifySC —— 校验码算法，纯计算，可判定「编号系伪造」
 *   第二层 decodeSC —— 查表解码，仅用于展示，查不到即「未知」，绝不判为「非法」
 */

const { mod11_10 } = require('./checkdigit');

/** SC 号形如 SC + 14 位数字，大小写与空格均容忍 */
const SC_PATTERN = /^SC(\d{14})$/;

/**
 * 解析 SC 号的结构
 * @param {string} raw 原始输入
 * @returns {{ok: true, 本体码: number[], 校验码: number, 类别码: string, 区划码: string, 顺序码: string} | {ok: false, 原因: string}}
 */
function parseSC(raw) {
  if (typeof raw !== 'string') return { ok: false, 原因: '输入为空' };
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  const m = SC_PATTERN.exec(cleaned);
  if (!m) return { ok: false, 原因: '格式不符：应为 SC 加 14 位数字' };

  const digits = m[1].split('').map(Number);
  return {
    ok: true,
    本体码: digits.slice(0, 13),
    校验码: digits[13],
    类别码: m[1].slice(0, 3),
    区划码: m[1].slice(3, 9),
    顺序码: m[1].slice(9, 13),
  };
}

/**
 * 第一层：校验码验证。这是唯一能产出否定结论的检查。
 * @param {string} raw
 * @returns {{结论: 'valid'|'invalid'|'malformed', 说明: string, 解析?: object}}
 */
function verifySC(raw) {
  const parsed = parseSC(raw);
  if (!parsed.ok) {
    return { 结论: 'malformed', 说明: parsed.原因 };
  }
  const expected = mod11_10(parsed.本体码);
  if (expected !== parsed.校验码) {
    return {
      结论: 'invalid',
      说明: `该编号校验位不符（末位应为 ${expected}，实际为 ${parsed.校验码}），可能录入有误或系伪造`,
      解析: parsed,
    };
  }
  return { 结论: 'valid', 说明: '编号格式与校验位均有效', 解析: parsed };
}

/**
 * 第二层：查表解码。仅用于展示，永不产出「不合格」结论。
 *
 * @param {object} parsed parseSC 的结果
 * @param {{regions: Object<string,string>, categories: Object<string,string>, 版本: object}} tables
 *        表作为参数传入，使本函数保持可测的纯函数（docs/design.md §4）
 * @returns {{产地: string|null, 类别: string|null, 未命中: string[], 数据版本: object}}
 */
function decodeSC(parsed, tables) {
  const regions = (tables && tables.regions) || {};
  const categories = (tables && tables.categories) || {};
  const 未命中 = [];

  const 产地 = regions[parsed.区划码] || null;
  if (!产地) 未命中.push(`产地代码 ${parsed.区划码} 未在现行区划表中，可能为历史区划，无法进一步核实`);

  const 类别 = categories[parsed.类别码] || null;
  if (!类别) 未命中.push(`类别代码 ${parsed.类别码} 未在分类目录中，无法进一步核实`);

  return {
    产地,
    类别,
    未命中,
    数据版本: (tables && tables.版本) || null,
  };
}

module.exports = { parseSC, verifySC, decodeSC, SC_PATTERN };
