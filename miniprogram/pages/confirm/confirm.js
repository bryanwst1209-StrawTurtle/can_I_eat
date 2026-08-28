const app = getApp();

/** 展示与编辑的营养素顺序，与包装上的习惯顺序一致 */
const 营养素顺序 = ['能量', '蛋白质', '脂肪', '饱和脂肪', '反式脂肪', '碳水化合物', '糖', '膳食纤维', '钠'];
const 默认单位 = {
  能量: 'kJ', 蛋白质: 'g', 脂肪: 'g', 饱和脂肪: 'g', 反式脂肪: 'g',
  碳水化合物: 'g', 糖: 'g', 膳食纤维: 'g', 钠: 'mg',
};
const 基准选项 = [
  { 值: 'per100g', 文案: '每 100 克' },
  { 值: 'per100ml', 文案: '每 100 毫升' },
  { 值: 'perServing', 文案: '每份' },
];

Page({
  data: {
    手动: false,
    商品名称: '',
    配料文本: '',
    基准索引: 0,
    份重: '',
    份重单位: 'g',
    营养项: [],
    SC号: '',
    执行标准: '',
    识别备注: [],
    提交中: false,
    错误: '',
    基准选项,
  },

  onLoad(query) {
    const 手动 = query.手动 === '1';
    const 标签 = app.globalData.当前标签;

    if (!标签) {
      // 手动录入：给一张空表
      this.setData({
        手动: true,
        营养项: 营养素顺序.map((名称) => ({ 名称, 值: '', 单位: 默认单位[名称] })),
      });
      return;
    }

    const 索引 = Math.max(0, 基准选项.findIndex((o) => o.值 === 标签.基准.类型));
    this.setData({
      手动,
      商品名称: 标签.商品名称 || '',
      配料文本: (标签.配料 || []).join('、'),
      基准索引: 索引,
      份重: 标签.基准.份重 == null ? '' : String(标签.基准.份重),
      份重单位: 标签.基准.份重单位 || 'g',
      SC号: 标签.SC号 || '',
      执行标准: 标签.执行标准 || '',
      识别备注: 标签.识别备注 || [],
      营养项: 营养素顺序.map((名称) => {
        const 项 = (标签.营养成分 || {})[名称] || {};
        return {
          名称,
          值: 项.值 == null ? '' : String(项.值),
          单位: 项.单位 || 默认单位[名称],
        };
      }),
    });
  },

  改字段(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  改基准(e) {
    this.setData({ 基准索引: Number(e.detail.value) });
  },

  改营养(e) {
    const i = Number(e.currentTarget.dataset.idx);
    this.setData({ [`营养项[${i}].值`]: e.detail.value });
  },

  /** 把表单还原成 extractLabel 的标签结构 */
  组装标签() {
    const 类型 = 基准选项[this.data.基准索引].值;
    const 营养成分 = {};
    for (const 项 of this.data.营养项) {
      const 值 = 项.值 === '' ? null : Number(项.值);
      // 填了但不是数字，视为无效，按缺失处理而不是当成 0
      营养成分[项.名称] = {
        值: 值 == null || !isFinite(值) ? null : 值,
        单位: 项.单位,
      };
    }
    return {
      商品名称: this.data.商品名称 || null,
      配料: this.data.配料文本
        ? this.data.配料文本.split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean)
        : [],
      基准: {
        类型,
        份重: 类型 === 'perServing' && this.data.份重 !== '' ? Number(this.data.份重) : null,
        份重单位: 类型 === 'perServing' ? this.data.份重单位 : null,
      },
      营养成分,
      SC号: this.data.SC号 || null,
      执行标准: this.data.执行标准 || null,
      识别备注: this.data.识别备注,
    };
  },

  async 确认(){
    const 标签 = this.组装标签();

    if (标签.基准.类型 === 'perServing' && !标签.基准.份重) {
      this.setData({ 错误: '选了「每份」就必须填份重，否则无法换算成每100克' });
      return;
    }

    this.setData({ 提交中: true, 错误: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'analyze',
        data: { 标签, fileID: app.globalData.当前fileID || null },
      });

      if (!result || !result.ok) {
        this.setData({ 提交中: false, 错误: (result && result.提示) || '分析失败' });
        return;
      }

      app.globalData.当前结果 = result;
      app.globalData.当前标签 = 标签;
      this.setData({ 提交中: false });
      wx.navigateTo({ url: '/pages/report/report' });
    } catch (e) {
      this.setData({ 提交中: false, 错误: String(e.errMsg || e.message || e) });
    }
  },
});
