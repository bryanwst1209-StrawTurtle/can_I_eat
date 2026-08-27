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
const MASS_TO_MG = { mg: 1, g: 1000, μg: 0.001, ug: 0.001 };

/**
 * 把单个营养素的值换算成目标单位
 * @returns {number|null} 无法换算时返回 null，绝不返回 0
 */
function convertUnit(值, 单位, 目标单位) {
  if (typeof 值 !== 'number' || !isFinite(值)) return null;
  if (单位 === 目标单位) return 值;

  if (目标单位 === 'kJ' && 单位 === 'kcal') return 值 * KJ_PER_KCAL;
  if (目标单位 === 'kcal' && 单位 === 'kJ') return 值 / KJ_PER_KCAL;

  const from = MASS_TO_MG[单位];
  const to = MASS_TO_MG[目标单位];
  if (from != null && to != null) return (值 * from) / to;

  return null;
}

/**
 * 归一化营养成分表
 *
 * @param {object} 标签 extractLabel 的输出（经用户确认后）
 * @param {{类型: 'per100g'|'per100ml'|'perServing', 份重: number, 份重单位: 'g'|'ml'}} 标签.基准
 * @param {Object<string, {值: number|null, 单位: string}>} 标签.营养成分
 * @returns {{基准: 'per100g'|'per100ml', 营养成分: object, 换算说明: string[], 无法归一: string[]}}
 */
function normalize(标签) {
  const 基准 = (标签 && 标签.基准) || {};
  const 原始 = (标签 && 标签.营养成分) || {};
  const 换算说明 = [];
  const 无法归一 = [];

  // 确定目标基准：每份的情况下由份重单位决定落到 100g 还是 100ml
  let 目标基准;
  let 倍率;

  if (基准.类型 === 'per100g') {
    目标基准 = 'per100g';
    倍率 = 1;
  } else if (基准.类型 === 'per100ml') {
    目标基准 = 'per100ml';
    倍率 = 1;
  } else if (基准.类型 === 'perServing') {
    const 份重 = 基准.份重;
    if (typeof 份重 !== 'number' || !isFinite(份重) || 份重 <= 0) {
      return {
        基准: null,
        营养成分: {},
        换算说明: [],
        无法归一: ['标注为「每份」但未识别到份重，无法归一到 100g/100ml 基准'],
      };
    }
    目标基准 = 基准.份重单位 === 'ml' ? 'per100ml' : 'per100g';
    倍率 = 100 / 份重;
    换算说明.push(
      `原标注基准为每份 ${份重}${基准.份重单位 || 'g'}，各项数值乘以 ${倍率.toFixed(3)} 换算为每 100${基准.份重单位 || 'g'}`
    );
  } else {
    return {
      基准: null,
      营养成分: {},
      换算说明: [],
      无法归一: ['未识别到营养成分表的标注基准（每100g / 每100ml / 每份）'],
    };
  }

  // 各营养素的规范单位
  const 规范单位 = {
    能量: 'kJ', 蛋白质: 'g', 脂肪: 'g', 饱和脂肪: 'g', 反式脂肪: 'g',
    碳水化合物: 'g', 糖: 'g', 膳食纤维: 'g', 钠: 'mg',
  };

  const 营养成分 = {};
  for (const [名称, 项] of Object.entries(原始)) {
    // 缺失即声明，绝不当作 0（docs/design.md §8）
    if (!项 || 项.值 == null) {
      无法归一.push(`未识别到${名称}的数值`);
      continue;
    }
    const 目标单位 = 规范单位[名称] || 项.单位;
    const 换算后 = convertUnit(项.值, 项.单位, 目标单位);
    if (换算后 == null) {
      无法归一.push(`${名称}的单位「${项.单位}」无法换算为${目标单位}`);
      continue;
    }
    营养成分[名称] = {
      值: Math.round(换算后 * 倍率 * 1000) / 1000,
      单位: 目标单位,
    };
  }

  return { 基准: 目标基准, 营养成分, 换算说明, 无法归一 };
}

module.exports = { normalize, convertUnit, KJ_PER_KCAL };
