/**
 * SC（食品生产许可证）编号的解析、校验与解码。
 *
 * 分两层，边界不可混淆（docs/design.md §6）：
 *   第一层 verifySC —— 校验码算法，纯计算，可判定「编号系伪造」
 *   第二层 decodeSC —— 查表解码，仅用于展示，查不到即「未知」，绝不判为「非法」
 *
 * 标识符一律 ASCII：这些字段要在 WXML 里渲染，而 WXML 的表达式
 * 解析器不接受非 ASCII 标识符。中文只出现在给人看的字符串值里。
 */

const { mod11_10 } = require('./checkdigit');

/**
 * 校验码算法是否已用真实样本验证通过。
 *
 * 现状：false。
 * 实测真证 SC10631011602563（上海好味来生物科技有限公司，经国家企业信用信息
 * 公示系统可查，许可明细含果汁型碳酸饮料）末位为 3，而本实现算出 4。
 * 试过 ISO 7064 MOD 11,10 的多个变体与几种加权模型，均算不出 3，
 * 说明本实现与国标不一致，或 SC 用的根本不是这套算法。
 *
 * 在这个标志翻成 true 之前，verifySC 一律不产出「可能系伪造」这类否定结论——
 * 用一个错误的算法去指认一个合法产品造假，是本项目能犯的最严重的错误，
 * 比不给结论严重得多（docs/design.md §6、§8）。
 *
 * 翻成 true 的条件：test/sc.real-samples.test.js 里至少有 5 个来源可查的真证
 * 全部通过。样本不够就不要动它。
 */
const CHECKDIGIT_VERIFIED = false;

/** SC 号形如 SC + 14 位数字，大小写与空格均容忍 */
const SC_PATTERN = /^SC(\d{14})$/;

/**
 * 解析 SC 号的结构
 * @returns {{ok: true, body: number[], checkDigit: number, categoryCode: string, regionCode: string, serial: string}
 *          | {ok: false, reason: string}}
 */
function parseSC(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: '输入为空' };
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
  const m = SC_PATTERN.exec(cleaned);
  if (!m) return { ok: false, reason: '格式不符：应为 SC 加 14 位数字' };

  const digits = m[1].split('').map(Number);
  return {
    ok: true,
    body: digits.slice(0, 13),
    checkDigit: digits[13],
    categoryCode: m[1].slice(0, 3),
    regionCode: m[1].slice(3, 9),
    serial: m[1].slice(9, 13),
  };
}

/**
 * 第一层：校验码验证。
 *
 * 只有在 CHECKDIGIT_VERIFIED 为 true 时才会产出否定结论。
 * 算法未经真实样本验证时，一律返回 'unverified'——
 * 格式对不对能说，真伪不能说。
 *
 * @returns {{result: 'valid'|'invalid'|'unverified'|'malformed', message: string, parsed?: object, computed?: number}}
 */
function verifySC(raw) {
  const parsed = parseSC(raw);
  if (!parsed.ok) {
    return { result: 'malformed', message: parsed.reason };
  }

  const expected = mod11_10(parsed.body);
  const matches = expected === parsed.checkDigit;

  if (!CHECKDIGIT_VERIFIED) {
    return {
      result: 'unverified',
      message: '编号格式正确（SC 加 14 位数字）。校验位的算法尚未用足够的真实证件验证，因此本工具不对编号真伪下结论',
      parsed,
      computed: expected, // 仅供开发排查，不展示给用户
      matches,
    };
  }

  if (!matches) {
    return {
      result: 'invalid',
      message: `该编号校验位不符（末位应为 ${expected}，实际为 ${parsed.checkDigit}），可能录入有误或系伪造`,
      parsed,
      computed: expected,
      matches,
    };
  }
  return { result: 'valid', message: '编号格式与校验位均有效', parsed, computed: expected, matches };
}

/**
 * 第二层：查表解码。仅用于展示，永不产出「不合格」结论。
 *
 * @param {object} parsed parseSC 的结果
 * @param {{regions: Object<string,string>, categories: Object<string,string>, version: object}} tables
 *        表作为参数传入，使本函数保持可测的纯函数（docs/design.md §4）
 * @returns {{origin: string|null, category: string|null, misses: string[], dataVersion: object|null}}
 */
function decodeSC(parsed, tables) {
  const regions = (tables && tables.regions) || {};
  const categories = (tables && tables.categories) || {};
  const misses = [];

  const origin = regions[parsed.regionCode] || null;
  if (!origin) {
    misses.push(`产地代码 ${parsed.regionCode} 未在现行区划表中，可能为历史区划，无法进一步核实`);
  }

  const category = categories[parsed.categoryCode] || null;
  if (!category) {
    misses.push(`类别代码 ${parsed.categoryCode} 未在分类目录中，无法进一步核实`);
  }

  return {
    origin,
    category,
    misses,
    dataVersion: (tables && tables.version) || null,
  };
}

module.exports = { parseSC, verifySC, decodeSC, SC_PATTERN, CHECKDIGIT_VERIFIED };
