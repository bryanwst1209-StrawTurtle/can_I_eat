const app = getApp();

Page({
  data: {
    判定: null,
    SC核验: null,
    商品名称: '',
    展开: {}, // 规则id -> 是否展开依据
    加载中: false,
  },

  onLoad(query) {
    if (query.id) return this.从历史加载(query.id);

    const 结果 = app.globalData.当前结果;
    if (!结果) {
      wx.showToast({ title: '没有可显示的结果', icon: 'none' });
      return;
    }
    this.setData({
      判定: 结果.判定,
      SC核验: 结果.SC核验,
      商品名称: (app.globalData.当前标签 || {}).商品名称 || '',
    });
  },

  async 从历史加载(id) {
    this.setData({ 加载中: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData',
        data: { action: '读取历史', _id: id },
      });
      if (!result || !result.ok) {
        wx.showToast({ title: (result && result.提示) || '读取失败', icon: 'none' });
        this.setData({ 加载中: false });
        return;
      }
      this.setData({
        判定: result.记录.判定,
        SC核验: result.记录.SC核验,
        商品名称: result.记录.商品名称 || '',
        加载中: false,
      });
    } catch (e) {
      wx.showToast({ title: '读取失败', icon: 'none' });
      this.setData({ 加载中: false });
    }
  },

  切换依据(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ [`展开.${id}`]: !this.data.展开[id] });
  },

  再扫一个() {
    wx.navigateBack({ delta: 99, fail: () => wx.reLaunch({ url: '/pages/scan/scan' }) });
  },
});
