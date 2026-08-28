const app = getApp();

Page({
  data: {
    scanning: false,
    progress: '',
    elapsed: 0,        // 已用秒数
    hint: '',          // 预期耗时提示
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

  /**
   * 8-9 秒的等待里，最难受的不是等，是不知道还要等多久。
   * 把已用时间和预期时长显示出来，体感差距比换模型还大。
   */
  startTimer() {
    this.stopTimer();
    this.setData({ elapsed: 0 });
    this._timer = setInterval(() => {
      this.setData({ elapsed: this.data.elapsed + 1 });
    }, 1000);
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onUnload() { this.stopTimer(); },

  async uploadAndExtract(filePath) {
    this.setData({ scanning: true, progress: '正在上传照片…', hint: '', error: null });
    this.startTimer();
    try {
      const uploaded = await wx.cloud.uploadFile({
        cloudPath: `labels/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath,
      });

      this.setData({ progress: '正在读包装上的字…', hint: '一般 8 到 10 秒' });
      const { result } = await wx.cloud.callFunction({
        name: 'extractLabel',
        data: { fileID: uploaded.fileID },
      });

      if (!result || !result.ok) {
        this.stopTimer();
        this.setData({
          scanning: false,
          error: {
            message: (result && result.message) || '识别失败',
            detail: result && Array.isArray(result.detail) ? result.detail.join('\n') : (result && result.detail),
            canManual: true,
            fileID: uploaded.fileID,
          },
        });
        return;
      }

      // 识别结果必须经用户确认才能出结论（docs/design.md §2.3）
      this.stopTimer();
      if (result.totalMs) console.log(`识别耗时 ${(result.totalMs / 1000).toFixed(1)} 秒`);
      app.globalData.currentLabel = result.label;
      app.globalData.currentFileID = uploaded.fileID;
      this.setData({ scanning: false });
      wx.navigateTo({ url: '/pages/confirm/confirm' });
    } catch (e) {
      this.stopTimer();
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
