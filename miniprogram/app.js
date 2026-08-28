App({
  globalData: {
    envId: 'cloudbase-d0g5ogyub05b69f8f',
    currentLabel: null,
    currentFileIDs: [],
    currentResult: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库版本过低，请使用 2.2.3 以上版本');
      return;
    }
    wx.cloud.init({
      env: this.globalData.envId || undefined,
      traceUser: true,
    });
  },
});
