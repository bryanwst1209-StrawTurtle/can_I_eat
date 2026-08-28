/**
 * 模型输出的 schema 校验。
 *
 * 模型偶尔会返回非法 JSON，或者幻觉出图上没有的数值。
 * 校验失败重试一次，再失败转手动录入，绝不猜测（docs/design.md §8）。
 */

const ALLOWED_UNITS = {
  energy: ['kJ', 'kcal'],
  protein: ['g'], fat: ['g'], satFat: ['g'], transFat: ['g'],
  carb: ['g'], sugar: ['g'], fiber: ['g'],
  sodium: ['mg', 'g'],
};

const ALLOWED_BASIS = ['per100g', 'per100ml', 'perServing'];

/** 营养素中文名，仅用于生成给人看的报错文案 */
const LABEL = {
  energy: '能量', protein: '蛋白质', fat: '脂肪', satFat: '饱和脂肪',
  transFat: '反式脂肪', carb: '碳水化合物', sugar: '糖',
  fiber: '膳食纤维', sodium: '钠',
};

/**
 * @returns {{ok: true, label: object} | {ok: false, errors: string[]}}
 */
function validateLabel(raw) {
  const errors = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['模型未返回 JSON 对象'] };
  }

  const basis = raw.basis || {};
  if (basis.type != null && !ALLOWED_BASIS.includes(basis.type)) {
    errors.push(`基准类型「${basis.type}」不是合法取值`);
  }
  if (basis.type === 'perServing') {
    if (typeof basis.servingSize !== 'number' || !isFinite(basis.servingSize) || basis.servingSize <= 0) {
      // 不是致命错误：normalize 会据此拒绝归一并如实告知用户
      errors.push('基准为每份但份重缺失或非法');
    }
  }

  const nutrients = raw.nutrients;
  if (nutrients != null && (typeof nutrients !== 'object' || Array.isArray(nutrients))) {
    errors.push('nutrients 不是对象');
  } else if (nutrients) {
    for (const [key, item] of Object.entries(nutrients)) {
      if (item == null) continue;
      const name = LABEL[key] || key;
      if (typeof item !== 'object') { errors.push(`${name}的结构非法`); continue; }
      if (item.value != null && (typeof item.value !== 'number' || !isFinite(item.value))) {
        errors.push(`${name}的值不是数字`);
      }
      if (item.value != null && item.value < 0) {
        errors.push(`${name}的值为负数，不可能`);
      }
      const allowed = ALLOWED_UNITS[key];
      if (item.value != null && allowed && !allowed.includes(item.unit)) {
        errors.push(`${name}的单位「${item.unit}」不在允许范围（${allowed.join('/')}）`);
      }
    }
  }

  if (raw.ingredients != null && !Array.isArray(raw.ingredients)) {
    errors.push('ingredients 不是数组');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, label: normalizeShape(raw) };
}

/** 补齐缺失字段，使下游不必到处判空 */
function normalizeShape(raw) {
  const nutrients = {};
  for (const key of Object.keys(ALLOWED_UNITS)) {
    const item = (raw.nutrients || {})[key];
    nutrients[key] = item && item.value != null
      ? { value: item.value, unit: item.unit }
      : { value: null, unit: null };
  }
  return {
    productName: raw.productName ?? null,
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
    basis: {
      type: raw.basis?.type ?? null,
      servingSize: raw.basis?.servingSize ?? null,
      servingUnit: raw.basis?.servingUnit ?? null,
    },
    nutrients,
    standard: raw.standard ?? null,
    scCode: raw.scCode ?? null,
    manufacturer: raw.manufacturer ?? null,
    origin: raw.origin ?? null,
    shelfLife: raw.shelfLife ?? null,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

module.exports = { validateLabel, normalizeShape, ALLOWED_UNITS, ALLOWED_BASIS, LABEL };
