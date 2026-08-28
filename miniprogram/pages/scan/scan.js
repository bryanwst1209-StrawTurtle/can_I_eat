const app = getApp();

Page({
  data: {
    scanning: false,
    progress: '',
    error: null,
  },

  onShow() {
    this.setData({ error: null });
  },

  takePhoto() { this.pick('camera'); },
  fromAlbum() { this.pick('album'); },

  pick(source) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source],
      sizeType: ['compressed'], // 压缩图足够识别，且上传更快
      success: (res) => this.uploadAndExtract(res.tempFiles[0].tempFilePath),
      fail: () => {},
    });
  },

  async uploadAndExtract(filePath) {
    this.setData({ scanning: true, progress: '正在上传照片…', error: null });
    try {
      const uploaded = await wx.cloud.uploadFile({
        cloudPath: `labels/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath,
      });

      this.setData({ progress: '正在识别标签…' });
      const { result } = await wx.cloud.callFunction({
        name: 'extractLabel',
        data: { fileID: uploaded.fileID },
      });

      if (!result || !result.ok) {
        this.setData({
          scanning: false,
          error: {
            message: (result && result.message) || '识别失败',
            canManual: true,
            fileID: uploaded.fileID,
          },
        });
        return;
      }

      // 识别结果必须经用户确认才能出结论（docs/design.md §2.3）
      app.globalData.currentLabel = result.label;
      app.globalData.currentFileID = uploaded.fileID;
      this.setData({ scanning: false });
      wx.navigateTo({ url: '/pages/confirm/confirm' });
    } catch (e) {
      this.setData({
        scanning: false,
        error: { message: '网络或云函数调用失败，请重试', detail: String(e.errMsg || e.message || e) },
      });
    }
  },

  manualEntry() {
    app.globalData.currentLabel = null;
    app.globalData.currentFileID = (this.data.error && this.data.error.fileID) || null;
    wx.navigateTo({ url: '/pages/confirm/confirm?manual=1' });
  },

  gotoFamily() { wx.navigateTo({ url: '/pages/family/family' }); },
  gotoHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
});
