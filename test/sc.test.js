const test = require('node:test');
const assert = require('node:assert');
const { mod11_10 } = require('../cloudfunctions/analyze/lib/checkdigit');
const { parseSC, verifySC, decodeSC } = require('../cloudfunctions/analyze/lib/sc');

/** 用算法自身生成一个校验位正确的 SC 号，用于往返测试 */
function makeValidSC(body13) {
  return 'SC' + body13 + mod11_10(body13.split('').map(Number));
}

test('校验码算法：同样的输入总得到同样的输出', () => {
  const a = mod11_10([1, 0, 6, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1]);
  const b = mod11_10([1, 0, 6, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1]);
  assert.strictEqual(a, b);
  assert.ok(a >= 0 && a <= 9, '校验码必须是一位数字');
});

test('往返：算出的校验码能通过验证', () => {
  for (const body of ['1061101010000', '2010203040506', '1234567890123']) {
    const sc = makeValidSC(body);
    assert.strictEqual(verifySC(sc).result, 'valid', `${sc} 应当校验通过`);
  }
});

test('改动任意一位，校验应当失败', () => {
  const sc = makeValidSC('1061101010000');
  assert.strictEqual(verifySC('SC2' + sc.slice(3)).result, 'invalid');
});

test('格式不合法的输入返回 malformed，而不是 invalid', () => {
  // malformed 表示「看不懂」，invalid 表示「看懂了且是错的」，两者不能混
  for (const bad of ['', 'SC123', '1061101010000', 'ABCDEFGHIJKLMNOP', null, undefined, 12345]) {
    assert.strictEqual(verifySC(bad).result, 'malformed', `${bad} 应为 malformed`);
  }
});

test('容忍空格与小写', () => {
  const sc = makeValidSC('1061101010000');
  assert.strictEqual(verifySC(sc.toLowerCase()).result, 'valid');
  assert.strictEqual(verifySC(` ${sc.slice(0, 5)} ${sc.slice(5)} `).result, 'valid');
});

test('解析：拆出类别码、区划码、顺序码', () => {
  const p = parseSC('SC10611010100001');
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.categoryCode, '106');
  assert.strictEqual(p.regionCode, '110101');
  assert.strictEqual(p.serial, '0000');
});

test('decodeSC 查不到时返回「未知」，绝不返回「非法」', () => {
  // 本项目的 fail-safe 核心：老证用的是历史区划码，用新表查不到，
  // 若判为非法就会冤枉合法产品（docs/design.md §6）
  const p = parseSC('SC10632101000001');
  const out = decodeSC(p, { regions: {}, categories: {}, version: { source: '测试' } });

  assert.strictEqual(out.origin, null);
  assert.strictEqual(out.category, null);
  assert.strictEqual(out.misses.length, 2);
  assert.match(out.misses[0], /可能为历史区划/);
  // 关键断言：返回值里不存在任何表示「不合格」的字段
  assert.ok(!('invalid' in out) && !('result' in out));
});

test('decodeSC 命中时返回可读的产地与类别', () => {
  const p = parseSC('SC12411010100001');
  const out = decodeSC(p, {
    regions: { 110101: '北京市东城区' },
    categories: { 124: '糕点' },
    version: { source: '民政部', date: '2025-01-01' },
  });
  assert.strictEqual(out.origin, '北京市东城区');
  assert.strictEqual(out.category, '糕点');
  assert.deepStrictEqual(out.misses, []);
  assert.strictEqual(out.dataVersion.source, '民政部');
});
