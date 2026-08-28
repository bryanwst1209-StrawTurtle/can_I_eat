/**
 * 营养成分单位归一化。
 *
 * 包装上的基准有三种：每 100g、每 100ml、每份（如「每份 30g」）。
 * 只有归一到统一基准才能与阈值比较。
 *
 * 重要：不做 ml → g 的换算。
 * 换算需要密度，而密度在包装上没有。猜一个密度就是在编造数据，
 * 违反「宁可少给结论，不能给错结论」（docs/design.md §8）。
 * 因此液体保持 per100ml 基准，规则侧也按该基准比较。
 */

/** 能量单位换算：1 kcal = 4.184 kJ */
const KJ_PER_KCAL = 4.184;

/** 质量单位到 mg 的换算系数 */
const MASS_TO_MG = { mg: 1, g: 1000, 'μg': 0.001, ug: 0.001 };

/** 各营养素的规范单位 */
const CANONICAL_UNIT = {
  energy: 'kJ', protein: 'g', fat: 'g', satFat: 'g', transFat: 'g',
  carb: 'g', sugar: 'g', fiber: 'g', sodium: 'mg',
};

/** 营养素的中文显示名，只用于生成给人看的文案 */
const NUTRIENT_LABEL = {
  energy: '能量', protein: '蛋白质', fat: '脂肪', satFat: '饱和脂肪',
  transFat: '反式脂肪', carb: '碳水化合物', sugar: '糖',
  fiber: '膳食纤维', sodium: '钠',
};

/**
 * 把单个营养素的值换算成目标单位
 * @returns {number|null} 无法换算时返回 null，绝不返回 0
 */
function convertUnit(value, unit, targetUnit) {
  if (typeof value !== 'number' || !isFinite(value)) return null;
  if (unit === targetUnit) return value;

  if (targetUnit === 'kJ' && unit === 'kcal') return value * KJ_PER_KCAL;
  if (targetUnit === 'kcal' && unit === 'kJ') return value / KJ_PER_KCAL;

  const from = MASS_TO_MG[unit];
  const to = MASS_TO_MG[targetUnit];
  if (from != null && to != null) return (value * from) / to;

  return null;
}

/**
 * 归一化营养成分表
 *
 * @param {object} label extractLabel 的输出（经用户确认后）
 * @param {{type: 'per100g'|'per100ml'|'perServing', servingSize: number, servingUnit: 'g'|'ml'}} label.basis
 * @param {Object<string, {value: number|null, unit: string}>} label.nutrients
 * @returns {{basis: 'per100g'|'per100ml'|null, nutrients: object, conversions: string[], unresolved: string[]}}
 */
function normalize(label) {
  const basis = (label && label.basis) || {};
  const source = (label && label.nutrients) || {};
  const conversions = [];
  const unresolved = [];

  let targetBasis;
  let factor;

  if (basis.type === 'per100g') {
    targetBasis = 'per100g';
    factor = 1;
  } else if (basis.type === 'per100ml') {
    targetBasis = 'per100ml';
    factor = 1;
  } else if (basis.type === 'perServing') {
    const size = basis.servingSize;
    if (typeof size !== 'number' || !isFinite(size) || size <= 0) {
      return {
        basis: null,
        nutrients: {},
        conversions: [],
        unresolved: ['标注为「每份」但未识别到份重，无法归一到 100g/100ml 基准'],
      };
    }
    const unit = basis.servingUnit === 'ml' ? 'ml' : 'g';
    targetBasis = unit === 'ml' ? 'per100ml' : 'per100g';
    factor = 100 / size;
    conversions.push(
      `原标注基准为每份 ${size}${unit}，各项数值乘以 ${factor.toFixed(3)} 换算为每 100${unit}`
    );
  } else {
    return {
      basis: null,
      nutrients: {},
      conversions: [],
      unresolved: ['未识别到营养成分表的标注基准（每100g / 每100ml / 每份）'],
    };
  }

  const nutrients = {};
  for (const [key, item] of Object.entries(source)) {
    const name = NUTRIENT_LABEL[key] || key;
    // 缺失即声明，绝不当作 0（docs/design.md §8）
    if (!item || item.value == null) {
      unresolved.push(`未识别到${name}的数值`);
      continue;
    }
    const targetUnit = CANONICAL_UNIT[key] || item.unit;
    const converted = convertUnit(item.value, item.unit, targetUnit);
    if (converted == null) {
      unresolved.push(`${name}的单位「${item.unit}」无法换算为${targetUnit}`);
      continue;
    }
    nutrients[key] = {
      value: Math.round(converted * factor * 1000) / 1000,
      unit: targetUnit,
    };
  }

  return { basis: targetBasis, nutrients, conversions, unresolved };
}

module.exports = { normalize, convertUnit, KJ_PER_KCAL, CANONICAL_UNIT, NUTRIENT_LABEL };
