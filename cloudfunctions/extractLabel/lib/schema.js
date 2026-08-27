/**
 * 模型输出的 schema 校验。
 *
 * 模型偶尔会返回非法 JSON，或者幻觉出图上没有的数值。
 * 校验失败重试一次，再失败转手动录入，绝不猜测（docs/design.md §8）。
 */

const 允许单位 = {
  能量: ['kJ', 'kcal'],
  蛋白质: ['g'], 脂肪: ['g'], 饱和脂肪: ['g'], 反式脂肪: ['g'],
  碳水化合物: ['g'], 糖: ['g'], 膳食纤维: ['g'],
  钠: ['mg', 'g'],
};

const 允许基准类型 = ['per100g', 'per100ml', 'perServing'];

/**
 * @returns {{ok: true, 标签: object} | {ok: false, 错误: string[]}}
 */
function 校验标签(原始) {
  const 错误 = [];

  if (原始 === null || typeof 原始 !== 'object' || Array.isArray(原始)) {
    return { ok: false, 错误: ['模型未返回 JSON 对象'] };
  }

  // 基准
  const 基准 = 原始.基准 || {};
  if (基准.类型 != null && !允许基准类型.includes(基准.类型)) {
    错误.push(`基准类型「${基准.类型}」不是合法取值`);
  }
  if (基准.类型 === 'perServing') {
    if (typeof 基准.份重 !== 'number' || !isFinite(基准.份重) || 基准.份重 <= 0) {
      // 不是致命错误：normalize 会据此拒绝归一并如实告知用户
      错误.push('基准为每份但份重缺失或非法');
    }
  }

  // 营养成分
  const 营养 = 原始.营养成分;
  if (营养 != null && (typeof 营养 !== 'object' || Array.isArray(营养))) {
    错误.push('营养成分不是对象');
  } else if (营养) {
    for (const [名称, 项] of Object.entries(营养)) {
      if (项 == null) continue;
      if (typeof 项 !== 'object') { 错误.push(`${名称} 的结构非法`); continue; }
      if (项.值 != null && (typeof 项.值 !== 'number' || !isFinite(项.值))) {
        错误.push(`${名称} 的值不是数字`);
      }
      if (项.值 != null && 项.值 < 0) {
        错误.push(`${名称} 的值为负数，不可能`);
      }
      const 允许 = 允许单位[名称];
      if (项.值 != null && 允许 && !允许.includes(项.单位)) {
        错误.push(`${名称} 的单位「${项.单位}」不在允许范围（${允许.join('/')}）`);
      }
    }
  }

  // 配料
  if (原始.配料 != null && !Array.isArray(原始.配料)) {
    错误.push('配料不是数组');
  }

  if (错误.length > 0) return { ok: false, 错误 };
  return { ok: true, 标签: 规范化结构(原始) };
}

/** 补齐缺失字段，使下游不必到处判空 */
function 规范化结构(原始) {
  const 营养成分 = {};
  for (const 名称 of Object.keys(允许单位)) {
    const 项 = (原始.营养成分 || {})[名称];
    营养成分[名称] = 项 && 项.值 != null
      ? { 值: 项.值, 单位: 项.单位 }
      : { 值: null, 单位: null };
  }
  return {
    商品名称: 原始.商品名称 ?? null,
    配料: Array.isArray(原始.配料) ? 原始.配料 : [],
    基准: {
      类型: 原始.基准?.类型 ?? null,
      份重: 原始.基准?.份重 ?? null,
      份重单位: 原始.基准?.份重单位 ?? null,
    },
    营养成分,
    执行标准: 原始.执行标准 ?? null,
    SC号: 原始.SC号 ?? null,
    生产商: 原始.生产商 ?? null,
    产地: 原始.产地 ?? null,
    保质期: 原始.保质期 ?? null,
    识别备注: Array.isArray(原始.识别备注) ? 原始.识别备注 : [],
  };
}

module.exports = { 校验标签, 规范化结构, 允许单位, 允许基准类型 };
