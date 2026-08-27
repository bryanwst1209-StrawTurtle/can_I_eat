const test = require('node:test');
const assert = require('node:assert');
const { normalize, convertUnit } = require('../cloudfunctions/analyze/lib/normalize');

test('每份基准换算到每100g', () => {
  const r = normalize({
    基准: { 类型: 'perServing', 份重: 30, 份重单位: 'g' },
    营养成分: { 钠: { 值: 360, 单位: 'mg' } },
  });
  assert.strictEqual(r.基准, 'per100g');
  assert.strictEqual(r.营养成分.钠.值, 1200);
  assert.match(r.换算说明[0], /每份 30g/);
});

test('每100g基准原样保留', () => {
  const r = normalize({
    基准: { 类型: 'per100g' },
    营养成分: { 糖: { 值: 12.5, 单位: 'g' } },
  });
  assert.strictEqual(r.营养成分.糖.值, 12.5);
  assert.deepStrictEqual(r.换算说明, []);
});

test('液体保持 per100ml 基准，不猜密度做 ml→g 换算', () => {
  // 猜密度就是在编造包装上没有的数据（docs/design.md §8）
  const r = normalize({
    基准: { 类型: 'per100ml' },
    营养成分: { 糖: { 值: 10.6, 单位: 'g' } },
  });
  assert.strictEqual(r.基准, 'per100ml');
  assert.strictEqual(r.营养成分.糖.值, 10.6);
});

test('缺失的数值被声明为未归一，绝不当作 0', () => {
  const r = normalize({
    基准: { 类型: 'per100g' },
    营养成分: { 钠: { 值: null, 单位: 'mg' }, 糖: { 值: 3, 单位: 'g' } },
  });
  assert.strictEqual(r.营养成分.钠, undefined, '缺失项不应出现在结果里');
  assert.ok(r.无法归一.some((s) => s.includes('钠')));
});

test('标为每份但没识别到份重时，整体拒绝归一而不是蒙一个份重', () => {
  const r = normalize({
    基准: { 类型: 'perServing' },
    营养成分: { 钠: { 值: 360, 单位: 'mg' } },
  });
  assert.strictEqual(r.基准, null);
  assert.deepStrictEqual(r.营养成分, {});
  assert.match(r.无法归一[0], /未识别到份重/);
});

test('未识别到基准时同样拒绝归一', () => {
  const r = normalize({ 营养成分: { 钠: { 值: 1, 单位: 'mg' } } });
  assert.strictEqual(r.基准, null);
  assert.match(r.无法归一[0], /未识别到营养成分表的标注基准/);
});

test('单位换算：质量与能量', () => {
  assert.strictEqual(convertUnit(1, 'g', 'mg'), 1000);
  assert.strictEqual(convertUnit(500, 'mg', 'g'), 0.5);
  assert.ok(Math.abs(convertUnit(100, 'kcal', 'kJ') - 418.4) < 0.001);
  assert.strictEqual(convertUnit(1, 'g', '朵'), null, '无法换算时返回 null 而不是 0');
  assert.strictEqual(convertUnit(null, 'g', 'mg'), null);
});
