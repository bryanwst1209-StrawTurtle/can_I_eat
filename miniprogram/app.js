App({
  globalData: {
    云环境: '', // 部署时填入云开发环境 ID
    当前标签: null,
    当前结果: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库版本过低，请使用 2.2.3 以上版本');
      return;
    }
    wx.cloud.init({
      env: this.globalData.云环境 || undefined,
      traceUser: true,
    });
  },
});
