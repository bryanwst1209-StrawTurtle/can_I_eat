const test = require('node:test');
const assert = require('node:assert');
const { normalize, convertUnit } = require('../cloudfunctions/analyze/lib/normalize');

test('每份基准换算到每100g', () => {
  const r = normalize({
    basis: { type: 'perServing', servingSize: 30, servingUnit: 'g' },
    nutrients: { sodium: { value: 360, unit: 'mg' } },
  });
  assert.strictEqual(r.basis, 'per100g');
  assert.strictEqual(r.nutrients.sodium.value, 1200);
  assert.match(r.conversions[0], /每份 30g/);
});

test('每100g基准原样保留', () => {
  const r = normalize({ basis: { type: 'per100g' }, nutrients: { sugar: { value: 12.5, unit: 'g' } } });
  assert.strictEqual(r.nutrients.sugar.value, 12.5);
  assert.deepStrictEqual(r.conversions, []);
});

test('液体保持 per100ml 基准，不猜密度做 ml→g 换算', () => {
  // 猜密度就是在编造包装上没有的数据（docs/design.md §8）
  const r = normalize({ basis: { type: 'per100ml' }, nutrients: { sugar: { value: 10.6, unit: 'g' } } });
  assert.strictEqual(r.basis, 'per100ml');
  assert.strictEqual(r.nutrients.sugar.value, 10.6);
});

test('缺失的数值被声明为未归一，绝不当作 0', () => {
  const r = normalize({
    basis: { type: 'per100g' },
    nutrients: { sodium: { value: null, unit: 'mg' }, sugar: { value: 3, unit: 'g' } },
  });
  assert.strictEqual(r.nutrients.sodium, undefined, '缺失项不应出现在结果里');
  assert.ok(r.unresolved.some((s) => s.includes('钠')));
});

test('标为每份但没识别到份重时，整体拒绝归一而不是蒙一个份重', () => {
  const r = normalize({ basis: { type: 'perServing' }, nutrients: { sodium: { value: 360, unit: 'mg' } } });
  assert.strictEqual(r.basis, null);
  assert.deepStrictEqual(r.nutrients, {});
  assert.match(r.unresolved[0], /未识别到份重/);
});

test('未识别到基准时同样拒绝归一', () => {
  const r = normalize({ nutrients: { sodium: { value: 1, unit: 'mg' } } });
  assert.strictEqual(r.basis, null);
  assert.match(r.unresolved[0], /未识别到营养成分表的标注基准/);
});

test('单位换算：质量与能量', () => {
  assert.strictEqual(convertUnit(1, 'g', 'mg'), 1000);
  assert.strictEqual(convertUnit(500, 'mg', 'g'), 0.5);
  assert.ok(Math.abs(convertUnit(100, 'kcal', 'kJ') - 418.4) < 0.001);
  assert.strictEqual(convertUnit(1, 'g', '朵'), null, '无法换算时返回 null 而不是 0');
  assert.strictEqual(convertUnit(null, 'g', 'mg'), null);
});

test('未归一项的文案用中文营养素名，不暴露内部字段名', () => {
  const r = normalize({ basis: { type: 'per100g' }, nutrients: { satFat: { value: null, unit: 'g' } } });
  assert.ok(r.unresolved[0].includes('饱和脂肪'), '应显示中文名');
  assert.ok(!r.unresolved[0].includes('satFat'), '不应把内部字段名给用户看');
});
