const app = getApp();

Page({
  data: {
    judgement: null,
    scCheck: null,
    productName: '',
    expanded: {}, // ruleId -> 是否展开依据
    loading: false,
  },

  onLoad(query) {
    if (query.id) return this.loadFromHistory(query.id);

    const result = app.globalData.currentResult;
    if (!result) {
      wx.showToast({ title: '没有可显示的结果', icon: 'none' });
      return;
    }
    this.setData({
      judgement: result.judgement,
      scCheck: result.scCheck,
      productName: (app.globalData.currentLabel || {}).productName || '',
    });
  },

  async loadFromHistory(id) {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData',
        data: { action: 'getScan', _id: id },
      });
      if (!result || !result.ok) {
        wx.showToast({ title: (result && result.message) || '读取失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      this.setData({
        judgement: result.record.judgement,
        scCheck: result.record.scCheck,
        productName: result.record.productName || '',
        loading: false,
      });
    } catch (e) {
      wx.showToast({ title: '读取失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  toggleEvidence(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ [`expanded.${id}`]: !this.data.expanded[id] });
  },

  scanAgain() {
    wx.navigateBack({ delta: 99, fail: () => wx.reLaunch({ url: '/pages/scan/scan' }) });
  },
});
