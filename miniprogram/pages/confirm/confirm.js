const app = getApp();

/** 展示与编辑的营养素顺序，与包装上的习惯顺序一致 */
const NUTRIENTS = [
  { key: 'energy', label: '能量', unit: 'kJ' },
  { key: 'protein', label: '蛋白质', unit: 'g' },
  { key: 'fat', label: '脂肪', unit: 'g' },
  { key: 'satFat', label: '饱和脂肪', unit: 'g' },
  { key: 'transFat', label: '反式脂肪', unit: 'g' },
  { key: 'carb', label: '碳水化合物', unit: 'g' },
  { key: 'sugar', label: '糖', unit: 'g' },
  { key: 'fiber', label: '膳食纤维', unit: 'g' },
  { key: 'sodium', label: '钠', unit: 'mg' },
];

const BASIS_OPTIONS = [
  { value: 'per100g', label: '每 100 克' },
  { value: 'per100ml', label: '每 100 毫升' },
  { value: 'perServing', label: '每份' },
];

Page({
  data: {
    manual: false,
    productName: '',
    ingredientsText: '',
    basisIndex: 0,
    basisOptions: BASIS_OPTIONS,
    isServing: false,
    servingSize: '',
    servingUnit: 'g',
    rows: [],
    scCode: '',
    standard: '',
    notes: [],
    submitting: false,
    error: '',
  },

  onLoad(query) {
    const label = app.globalData.currentLabel;

    if (!label) {
      // 手动录入：给一张空表
      this.setData({
        manual: true,
        rows: NUTRIENTS.map((n) => ({ ...n, value: '' })),
      });
      return;
    }

    const idx = Math.max(0, BASIS_OPTIONS.findIndex((o) => o.value === label.basis.type));
    this.setData({
      manual: query.manual === '1',
      productName: label.productName || '',
      ingredientsText: (label.ingredients || []).join('、'),
      basisIndex: idx,
      isServing: BASIS_OPTIONS[idx].value === 'perServing',
      servingSize: label.basis.servingSize == null ? '' : String(label.basis.servingSize),
      servingUnit: label.basis.servingUnit || 'g',
      scCode: label.scCode || '',
      standard: label.standard || '',
      notes: label.notes || [],
      rows: NUTRIENTS.map((n) => {
        const item = (label.nutrients || {})[n.key] || {};
        return { ...n, value: item.value == null ? '' : String(item.value), unit: item.unit || n.unit };
      }),
    });
  },

  onField(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onBasisChange(e) {
    const i = Number(e.detail.value);
    this.setData({ basisIndex: i, isServing: BASIS_OPTIONS[i].value === 'perServing' });
  },

  onNutrient(e) {
    const i = Number(e.currentTarget.dataset.idx);
    this.setData({ [`rows[${i}].value`]: e.detail.value });
  },

  /** 把表单还原成 extractLabel 的标签结构 */
  buildLabel() {
    const type = BASIS_OPTIONS[this.data.basisIndex].value;
    const nutrients = {};
    for (const row of this.data.rows) {
      const n = row.value === '' ? null : Number(row.value);
      // 填了但不是数字，视为无效，按缺失处理而不是当成 0
      nutrients[row.key] = {
        value: n == null || !isFinite(n) ? null : n,
        unit: row.unit,
      };
    }
    return {
      productName: this.data.productName || null,
      ingredients: this.data.ingredientsText
        ? this.data.ingredientsText.split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean)
        : [],
      basis: {
        type,
        servingSize: type === 'perServing' && this.data.servingSize !== '' ? Number(this.data.servingSize) : null,
        servingUnit: type === 'perServing' ? this.data.servingUnit : null,
      },
      nutrients,
      scCode: this.data.scCode || null,
      standard: this.data.standard || null,
      notes: this.data.notes,
    };
  },

  async submit() {
    const label = this.buildLabel();

    if (label.basis.type === 'perServing' && !label.basis.servingSize) {
      this.setData({ error: '选了「每份」就必须填份重，否则无法换算成每 100 克' });
      return;
    }

    this.setData({ submitting: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'analyze',
        data: { label, fileIDs: app.globalData.currentFileIDs || [] },
      });

      if (!result || !result.ok) {
        this.setData({ submitting: false, error: (result && result.message) || '分析失败' });
        return;
      }

      app.globalData.currentResult = result;
      app.globalData.currentLabel = label;
      this.setData({ submitting: false });
      wx.navigateTo({ url: '/pages/report/report' });
    } catch (e) {
      this.setData({ submitting: false, error: String(e.errMsg || e.message || e) });
    }
  },
});
