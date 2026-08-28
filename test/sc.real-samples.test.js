const test = require('node:test');
const assert = require('node:assert');
const { verifySC, CHECKDIGIT_VERIFIED } = require('../cloudfunctions/analyze/lib/sc');
const { mod11_10 } = require('../cloudfunctions/analyze/lib/checkdigit');

/**
 * 真实 SC 号验证。
 *
 * sc.test.js 里的往返测试只能证明算法自洽，不能证明它与国标一致——
 * 如果 MOD 11,10 实现有偏差，往返测试照样全绿。唯一的验证手段是真实证件。
 *
 * 2026-08-27 实测结论：**本实现与真实 SC 号不符**。
 * 因此 sc.js 里的 CHECKDIGIT_VERIFIED 置为 false，
 * verifySC 一律返回 unverified，不对真伪下结论。
 *
 * 继续收集样本。凑够 5 个来源可查的真证并全部通过后，
 * 才可以把 CHECKDIGIT_VERIFIED 翻成 true。
 */

/** 每个样本都要能溯源，否则无法判断是样本错还是算法错 */
const REAL_SAMPLES = [
  {
    code: 'SC10631011602563',
    holder: '上海好味来生物科技有限公司',
    product: '三麟苏打汽水',
    source: '国家企业信用信息公示系统可查，许可明细含果汁型碳酸饮料',
    verifiedOn: '2026-08-27',
  },
];

test('真实样本本身格式合法', () => {
  for (const s of REAL_SAMPLES) {
    const r = verifySC(s.code);
    assert.notStrictEqual(r.result, 'malformed', `${s.code} 连格式都不对，样本可能抄错了`);
  }
});

test('算法未验证时，绝不对真实证件下否定结论', () => {
  // 这是本项目最重要的一条安全断言：
  // 宁可什么都不说，也不能用一个没验证过的算法指认合法产品造假
  for (const s of REAL_SAMPLES) {
    const r = verifySC(s.code);
    assert.notStrictEqual(
      r.result, 'invalid',
      `${s.code}（${s.holder}）是真证，绝不允许被判为 invalid`
    );
  }
});

test('记录当前算法与真实校验位的偏差，供后续排查', () => {
  // 这个测试不会失败，只是把事实打印出来。
  // 算法修对之后，下面的 matches 应当全为 true，届时再翻 CHECKDIGIT_VERIFIED。
  const rows = REAL_SAMPLES.map((s) => {
    const body = s.code.slice(2, 15).split('').map(Number);
    return {
      code: s.code,
      actual: Number(s.code.slice(15)),
      computed: mod11_10(body),
      holder: s.holder,
    };
  });
  for (const r of rows) {
    console.log(`  ${r.code}  真实末位 ${r.actual}  本实现算出 ${r.computed}  ${r.actual === r.computed ? '✓' : '✗ 不符'}  ${r.holder}`);
  }
  assert.ok(rows.length > 0);
});

test('CHECKDIGIT_VERIFIED 只有在样本足够且全部通过时才可为 true', () => {
  if (!CHECKDIGIT_VERIFIED) return; // 当前状态，跳过

  assert.ok(REAL_SAMPLES.length >= 5, '样本少于 5 个就不该把算法标记为已验证');
  for (const s of REAL_SAMPLES) {
    const r = verifySC(s.code);
    assert.strictEqual(r.result, 'valid', `${s.code}（${s.holder}）应当校验通过：${r.message}`);
  }
});
