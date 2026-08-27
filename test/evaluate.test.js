const test = require('node:test');
const assert = require('node:assert');
const { normalize } = require('../cloudfunctions/analyze/lib/normalize');
const { evaluate } = require('../cloudfunctions/analyze/lib/evaluate');
const { 规则 } = require('../cloudfunctions/analyze/lib/rules');

const 高钠零食 = normalize({
  基准: { 类型: 'per100g' },
  营养成分: { 钠: { 值: 1200, 单位: 'mg' }, 糖: { 值: 3, 单位: 'g' } },
});

test('没有配置家庭成员时，退化为通用红绿灯', () => {
  const r = evaluate({ 归一: 高钠零食, 配料: ['小麦粉', '棕榈油', '食用盐'], 成员: [], 规则 });
  assert.strictEqual(r.个性化, false);
  assert.strictEqual(r.总体等级, 'warn');
  assert.ok(r.通用结论.some((c) => c.规则id === 'sodium-high'));
});

test('配置成员后给出按人区分的结论', () => {
  const r = evaluate({
    归一: 高钠零食,
    配料: ['小麦粉', '棕榈油', '食用盐'],
    成员: [
      { 名称: '爸爸', 关注点: ['高血压'] },
      { 名称: '孩子', 关注点: ['儿童'] },
    ],
    规则,
  });
  assert.strictEqual(r.个性化, true);
  const 爸爸 = r.成员结论.find((m) => m.名称 === '爸爸');
  assert.ok(爸爸.命中.some((c) => c.规则id === 'sodium-hypertension'), '爸爸应命中控钠规则');
  const 孩子 = r.成员结论.find((m) => m.名称 === '孩子');
  assert.ok(!孩子.命中.some((c) => c.规则id === 'sodium-hypertension'), '孩子不应命中高血压规则');
});

test('每条结论都带得出结论的事实和依据——这是证据化的最低要求', () => {
  const r = evaluate({ 归一: 高钠零食, 配料: ['食用盐'], 成员: [], 规则 });
  for (const c of r.通用结论) {
    assert.ok(c.事实 && c.事实.length > 0, `${c.规则id} 缺少事实`);
    assert.ok(c.依据 && c.依据.length > 0, `${c.规则id} 缺少依据`);
    assert.ok(['标准明文', '工具设定'].includes(c.阈值性质), `${c.规则id} 缺少阈值性质`);
  }
});

test('缺失的指标进入「未判断」，不会因为缺数据而给出绿灯', () => {
  // 本项目最危险的失败模式：钠没识别出来 → 当成 0 → 报绿灯「可以吃」
  const 缺钠 = normalize({
    基准: { 类型: 'per100g' },
    营养成分: { 糖: { 值: 2, 单位: 'g' } },
  });
  const r = evaluate({ 归一: 缺钠, 配料: ['小麦粉'], 成员: [{ 名称: '爸爸', 关注点: ['高血压'] }], 规则 });

  assert.ok(r.未判断.some((s) => s.includes('钠')), '必须明确声明钠未能判断');
  assert.ok(!r.通用结论.some((c) => c.规则id === 'sodium-low'), '缺失不得被当作低钠');
  assert.ok(!r.通用结论.some((c) => c.规则id === 'sodium-high'));
});

test('归一化整体失败时不产出任何数值结论', () => {
  const 废 = normalize({ 营养成分: {} });
  const r = evaluate({ 归一: 废, 配料: [], 成员: [], 规则 });
  assert.deepStrictEqual(r.通用结论, []);
  assert.ok(r.未判断.length > 0);
});

test('配料关键词规则：控糖成员命中代糖', () => {
  const 无糖饮料 = normalize({
    基准: { 类型: 'per100ml' },
    营养成分: { 糖: { 值: 0, 单位: 'g' }, 钠: { 值: 10, 单位: 'mg' } },
  });
  const r = evaluate({
    归一: 无糖饮料,
    配料: ['水', '二氧化碳', '三氯蔗糖', '安赛蜜'],
    成员: [{ 名称: '妈妈', 关注点: ['控糖'] }],
    规则,
  });
  const 妈妈 = r.成员结论.find((m) => m.名称 === '妈妈');
  const 代糖 = 妈妈.命中.find((c) => c.规则id === 'sweetener-present');
  assert.ok(代糖, '应命中代糖规则');
  assert.match(代糖.事实, /三氯蔗糖/);
});

test('反式脂肪对儿童是 danger，且拉高总体等级', () => {
  const 含反式 = normalize({
    基准: { 类型: 'per100g' },
    营养成分: { 反式脂肪: { 值: 1.2, 单位: 'g' }, 钠: { 值: 50, 单位: 'mg' } },
  });
  const r = evaluate({ 归一: 含反式, 配料: ['氢化植物油'], 成员: [{ 名称: '孩子', 关注点: ['儿童'] }], 规则 });
  assert.strictEqual(r.总体等级, 'danger');
  const 孩子 = r.成员结论.find((m) => m.名称 === '孩子');
  assert.strictEqual(孩子.等级, 'danger');
});

test('措辞不出现绝对化表述', () => {
  const r = evaluate({ 归一: 高钠零食, 配料: [], 成员: [], 规则 });
  const 全文 = JSON.stringify(r);
  assert.ok(!全文.includes('不能吃'), '不得出现「不能吃」这类绝对化表述');
  assert.ok(r.免责声明.includes('不构成医疗'), '必须带免责声明');
});

test('通用风险会传导到每个成员——高钠对谁都是高钠', () => {
  const r = evaluate({ 归一: 高钠零食, 配料: [], 成员: [{ 名称: '孩子', 关注点: ['儿童'] }], 规则 });
  const 孩子 = r.成员结论.find((m) => m.名称 === '孩子');
  assert.strictEqual(孩子.等级, 'warn', '通用高钠应影响所有成员的等级');
});
