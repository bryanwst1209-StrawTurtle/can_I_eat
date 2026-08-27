const test = require('node:test');
const assert = require('node:assert');
const { verifySC } = require('../cloudfunctions/analyze/lib/sc');

/**
 * 真实 SC 号验证。
 *
 * 上面 sc.test.js 里的往返测试只能证明算法自洽，不能证明算法与国标一致——
 * 如果 MOD 11,10 实现有偏差，往返测试照样全绿。
 * 唯一的验证手段是拿真实包装上的 SC 号来跑（docs/design.md §11）。
 *
 * 待办：从家里橱柜翻几个包装，把 SC 号抄进下面的数组，删掉 skip。
 * 如果出现校验不通过，先怀疑本实现而不是包装。
 */
const 真实样本 = [
  // 'SC10632010200123',
];

test('真实包装上的 SC 号应当全部校验通过', { skip: 真实样本.length === 0 && '尚未录入真实样本' }, () => {
  for (const sc of 真实样本) {
    const r = verifySC(sc);
    assert.strictEqual(r.结论, 'valid', `${sc} 校验未通过：${r.说明}`);
  }
});
