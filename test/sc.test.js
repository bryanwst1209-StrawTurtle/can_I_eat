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

test('往返：算出的校验码与实现自洽', () => {
  // 注意：这只证明算法自洽，不证明它与国标一致。
  // 真实证件的验证在 sc.real-samples.test.js，目前结论是不一致。
  for (const body of ['1061101010000', '2010203040506', '1234567890123']) {
    const sc = makeValidSC(body);
    assert.strictEqual(verifySC(sc).matches, true, `${sc} 应与本实现自洽`);
  }
});

test('算法未验证时，即使校验位对不上也不判为 invalid', () => {
  // CHECKDIGIT_VERIFIED 为 false 期间的 fail-safe 行为：
  // 只说格式，不说真伪。改对算法并验证后，这个测试要改回断言 invalid。
  const sc = makeValidSC('1061101010000');
  const r = verifySC('SC2' + sc.slice(3));
  assert.strictEqual(r.result, 'unverified');
  assert.strictEqual(r.matches, false, '内部仍应记录校验位不符，供开发排查');
  assert.ok(!r.message.includes('伪造'), '未验证的算法不得输出「伪造」字样');
});

test('格式不合法的输入返回 malformed，而不是 invalid', () => {
  // malformed 表示「看不懂」，invalid 表示「看懂了且是错的」，两者不能混
  for (const bad of ['', 'SC123', '1061101010000', 'ABCDEFGHIJKLMNOP', null, undefined, 12345]) {
    assert.strictEqual(verifySC(bad).result, 'malformed', `${bad} 应为 malformed`);
  }
});

test('容忍空格与小写', () => {
  // 断言解析成功即可，不断言真伪结论——后者取决于 CHECKDIGIT_VERIFIED
  const sc = makeValidSC('1061101010000');
  for (const variant of [sc.toLowerCase(), ` ${sc.slice(0, 5)} ${sc.slice(5)} `]) {
    const r = verifySC(variant);
    assert.notStrictEqual(r.result, 'malformed', `${variant} 应当能被解析`);
    assert.strictEqual(r.matches, true);
  }
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
