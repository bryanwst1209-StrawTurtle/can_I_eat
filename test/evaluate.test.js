const test = require('node:test');
const assert = require('node:assert');
const { normalize } = require('../cloudfunctions/analyze/lib/normalize');
const { evaluate } = require('../cloudfunctions/analyze/lib/evaluate');
const { RULES } = require('../cloudfunctions/analyze/lib/rules');

const saltySnack = normalize({
  basis: { type: 'per100g' },
  nutrients: { sodium: { value: 1200, unit: 'mg' }, sugar: { value: 3, unit: 'g' } },
});

test('没有配置家庭成员时，退化为通用红绿灯', () => {
  const r = evaluate({ normalized: saltySnack, ingredients: ['小麦粉', '棕榈油', '食用盐'], members: [], rules: RULES });
  assert.strictEqual(r.personalized, false);
  assert.strictEqual(r.overallLevel, 'warn');
  assert.ok(r.general.some((f) => f.ruleId === 'sodium-high'));
});

test('配置成员后给出按人区分的结论', () => {
  const r = evaluate({
    normalized: saltySnack,
    ingredients: ['小麦粉', '棕榈油', '食用盐'],
    members: [
      { name: '爸爸', concerns: ['hypertension'] },
      { name: '孩子', concerns: ['child'] },
    ],
    rules: RULES,
  });
  assert.strictEqual(r.personalized, true);
  const dad = r.perMember.find((m) => m.name === '爸爸');
  assert.ok(dad.hits.some((f) => f.ruleId === 'sodium-hypertension'), '爸爸应命中控钠规则');
  const kid = r.perMember.find((m) => m.name === '孩子');
  assert.ok(!kid.hits.some((f) => f.ruleId === 'sodium-hypertension'), '孩子不应命中高血压规则');
});

test('每条结论都带得出结论的事实和依据——这是证据化的最低要求', () => {
  const r = evaluate({ normalized: saltySnack, ingredients: ['食用盐'], members: [], rules: RULES });
  assert.ok(r.general.length > 0);
  for (const f of r.general) {
    assert.ok(f.fact && f.fact.length > 0, `${f.ruleId} 缺少事实`);
    assert.ok(f.evidence && f.evidence.length > 0, `${f.ruleId} 缺少依据`);
    assert.ok(['standard', 'tool'].includes(f.thresholdKind), `${f.ruleId} 缺少 thresholdKind`);
    assert.ok(['标准明文', '工具设定'].includes(f.thresholdKindLabel));
  }
});

test('缺失的指标进入 undetermined，不会因为缺数据而给出绿灯', () => {
  // 本项目最危险的失败模式：钠没识别出来 → 当成 0 → 报绿灯「可以吃」
  const noSodium = normalize({ basis: { type: 'per100g' }, nutrients: { sugar: { value: 2, unit: 'g' } } });
  const r = evaluate({
    normalized: noSodium, ingredients: ['小麦粉'],
    members: [{ name: '爸爸', concerns: ['hypertension'] }], rules: RULES,
  });

  assert.ok(r.undetermined.some((s) => s.includes('钠')), '必须明确声明钠未能判断');
  assert.ok(!r.general.some((f) => f.ruleId === 'sodium-low'), '缺失不得被当作低钠');
  assert.ok(!r.general.some((f) => f.ruleId === 'sodium-high'));
});

test('归一化整体失败时不产出任何数值结论', () => {
  const broken = normalize({ nutrients: {} });
  const r = evaluate({ normalized: broken, ingredients: [], members: [], rules: RULES });
  assert.deepStrictEqual(r.general, []);
  assert.ok(r.undetermined.length > 0);
});

test('配料关键词规则：控糖成员命中代糖', () => {
  const zeroSugarDrink = normalize({
    basis: { type: 'per100ml' },
    nutrients: { sugar: { value: 0, unit: 'g' }, sodium: { value: 10, unit: 'mg' } },
  });
  const r = evaluate({
    normalized: zeroSugarDrink,
    ingredients: ['水', '二氧化碳', '三氯蔗糖', '安赛蜜'],
    members: [{ name: '妈妈', concerns: ['lowSugar'] }],
    rules: RULES,
  });
  const mom = r.perMember.find((m) => m.name === '妈妈');
  const sweetener = mom.hits.find((f) => f.ruleId === 'sweetener-present');
  assert.ok(sweetener, '应命中代糖规则');
  assert.match(sweetener.fact, /三氯蔗糖/);
});

test('反式脂肪对儿童是 danger，且拉高总体等级', () => {
  const withTransFat = normalize({
    basis: { type: 'per100g' },
    nutrients: { transFat: { value: 1.2, unit: 'g' }, sodium: { value: 50, unit: 'mg' } },
  });
  const r = evaluate({
    normalized: withTransFat, ingredients: ['氢化植物油'],
    members: [{ name: '孩子', concerns: ['child'] }], rules: RULES,
  });
  assert.strictEqual(r.overallLevel, 'danger');
  assert.strictEqual(r.perMember.find((m) => m.name === '孩子').level, 'danger');
});

test('措辞不出现绝对化表述', () => {
  const r = evaluate({ normalized: saltySnack, ingredients: [], members: [], rules: RULES });
  assert.ok(!JSON.stringify(r).includes('不能吃'), '不得出现「不能吃」这类绝对化表述');
  assert.ok(r.disclaimer.includes('不构成医疗'), '必须带免责声明');
});

test('通用风险会传导到每个成员——高钠对谁都是高钠', () => {
  const r = evaluate({
    normalized: saltySnack, ingredients: [],
    members: [{ name: '孩子', concerns: ['child'] }], rules: RULES,
  });
  assert.strictEqual(r.perMember.find((m) => m.name === '孩子').level, 'warn');
});

test('给用户看的文案里不出现内部字段名', () => {
  // sodium / transFat 这类是实现细节，泄漏到报告里就是 bug
  const r = evaluate({
    normalized: saltySnack, ingredients: ['食用盐'],
    members: [{ name: '爸爸', concerns: ['hypertension'] }], rules: RULES,
  });
  const 面向用户 = [
    ...r.general.map((f) => `${f.summary}${f.fact}`),
    ...r.perMember.flatMap((m) => m.hits.map((f) => `${f.summary}${f.fact}`)),
    ...r.undetermined,
  ].join(' ');
  for (const 内部名 of ['sodium', 'transFat', 'satFat', 'per100g']) {
    assert.ok(!面向用户.includes(内部名), `文案里泄漏了内部字段名 ${内部名}`);
  }
});
