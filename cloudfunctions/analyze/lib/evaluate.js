/**
 * 判定引擎——本项目的核心，纯函数，无网络、无 IO（docs/design.md §4）。
 *
 * 输入归一化后的标签 + 家庭成员画像 + 规则表，输出带完整证据链的判定结果。
 * 模型只负责「抄」，判断全部在这里，因此结论可复现、可解释、可追溯（§2.3）。
 */

const { NUTRIENT_LABEL } = require('./normalize');

/** 等级由轻到重。比较严重程度时用索引。 */
const LEVELS = ['ok', 'info', 'warn', 'danger'];

function worse(a, b) {
  return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

const COMPARATORS = {
  '>': (v, t) => v > t,
  '>=': (v, t) => v >= t,
  '<': (v, t) => v < t,
  '<=': (v, t) => v <= t,
};

/** 措辞约束：不出现「不能吃」等绝对化表述（docs/design.md §8） */
const VERDICT_TEXT = {
  ok: '未发现需要注意的项',
  info: '有几项信息值得留意',
  warn: '不太建议，有指标偏高',
  danger: '不建议食用，建议咨询医生',
};

const DISCLAIMER =
  '本结论依据包装标注信息与公开标准自动生成，仅供家庭参考，不构成医疗或营养建议。如有健康状况，请咨询医生或注册营养师。';

/**
 * 判断一条数值规则是否命中
 * @returns {{hit: boolean, measured?: number, unit?: string, missing?: string}}
 */
function matchMetricRule(rule, normalized) {
  const item = normalized.nutrients[rule.metric];
  const name = NUTRIENT_LABEL[rule.metric] || rule.metric;
  // 缺失即声明，绝不当作 0（docs/design.md §8）
  if (!item || item.value == null) {
    return { hit: false, missing: `未识别到${name}含量，「${rule.summary}」一项无法判断` };
  }
  const cmp = COMPARATORS[rule.op];
  if (!cmp) return { hit: false, missing: `规则 ${rule.id} 的比较符「${rule.op}」无效` };
  return { hit: cmp(item.value, rule.threshold), measured: item.value, unit: item.unit };
}

/**
 * 判断一条配料规则是否命中
 */
function matchIngredientRule(rule, ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { hit: false, missing: `未识别到配料表，「${rule.summary}」一项无法判断` };
  }
  const matched = [];
  for (const item of ingredients) {
    for (const kw of rule.ingredientKeywords) {
      if (typeof item === 'string' && item.includes(kw)) matched.push(item);
    }
  }
  return { hit: matched.length > 0, matchedIngredients: [...new Set(matched)] };
}

/**
 * 把命中的规则转成一条带证据的结论
 */
function toFinding(rule, match, basis) {
  const basisLabel = basis === 'per100ml' ? '100ml' : '100g';
  let fact;
  if (rule.metric) {
    const name = NUTRIENT_LABEL[rule.metric] || rule.metric;
    fact = `${name} ${match.measured}${match.unit}/${basisLabel}，${rule.op} 阈值 ${rule.threshold}${rule.unit}`;
  } else {
    fact = `配料表中检出：${match.matchedIngredients.join('、')}`;
  }
  return {
    ruleId: rule.id,
    level: rule.level,
    summary: rule.summary,
    fact,
    evidence: rule.evidence,
    thresholdKind: rule.thresholdKind,
    thresholdKindLabel: rule.thresholdKind === 'standard' ? '标准明文' : '工具设定',
    basisLabel: `每${basisLabel}`,
  };
}

/**
 * 主入口
 *
 * @param {object} input
 * @param {object} input.normalized normalize() 的输出
 * @param {string[]} input.ingredients 配料表
 * @param {Array<{name: string, concerns: string[]}>} input.members 家庭成员；为空时退化为通用判断
 * @param {Array} input.rules 规则表
 */
function evaluate({ normalized, ingredients = [], members = [], rules = [] }) {
  if (!normalized || !normalized.basis) {
    return {
      basis: null,
      overallLevel: 'info',
      overallText: VERDICT_TEXT.info,
      personalized: false,
      general: [],
      perMember: [],
      undetermined: (normalized && normalized.unresolved) || ['营养成分表未能归一化，无法进行任何数值判断'],
      conversions: [],
      disclaimer: DISCLAIMER,
    };
  }

  const undetermined = [...(normalized.unresolved || [])];

  /** concerns 传 null 表示只跑通用规则 */
  const run = (concerns) => {
    const findings = [];
    for (const rule of rules) {
      const audiences = rule.audiences || [];
      const isGeneral = audiences.length === 0;
      if (concerns === null
        ? !isGeneral
        : isGeneral || !audiences.some((a) => concerns.includes(a))) continue;

      const match = rule.metric
        ? matchMetricRule(rule, normalized)
        : matchIngredientRule(rule, ingredients);

      if (match.missing) {
        if (!undetermined.includes(match.missing)) undetermined.push(match.missing);
        continue;
      }
      if (match.hit) findings.push(toFinding(rule, match, normalized.basis));
    }
    return findings;
  };

  const general = run(null);
  let overallLevel = general.reduce((acc, f) => worse(acc, f.level), 'ok');

  const perMember = members.map((m) => {
    const concerns = m.concerns || [];
    const hits = run(concerns);
    // 成员等级同时受通用结论影响——高钠对谁都是高钠
    const level = [...hits, ...general].reduce((acc, f) => worse(acc, f.level), 'ok');
    overallLevel = worse(overallLevel, level);
    return { name: m.name, concerns, concernLabels: m.concernLabels || [], level, verdict: VERDICT_TEXT[level], hits };
  });

  return {
    basis: normalized.basis,
    basisLabel: normalized.basis === 'per100ml' ? '每 100 毫升' : '每 100 克',
    overallLevel,
    overallText: VERDICT_TEXT[overallLevel],
    personalized: members.length > 0,
    general,
    perMember,
    undetermined,
    conversions: normalized.conversions || [],
    disclaimer: DISCLAIMER,
  };
}

module.exports = { evaluate, worse, LEVELS, VERDICT_TEXT, DISCLAIMER };
