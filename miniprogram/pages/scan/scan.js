const app = getApp();

/** SC 号和营养成分表常不在同一面，最多允许三张；每多一张都加钱加延迟 */
const MAX_IMAGES = 3;

Page({
  data: {
    shots: [],        // 已拍的本地临时路径
    maxImages: MAX_IMAGES,
    scanning: false,
    progress: '',
    elapsed: 0,       // 已用秒数
    hint: '',
    error: null,
  },

  onShow() {
    this.setData({ error: null });
  },

  onUnload() { this.stopTimer(); },

  takePhoto() { this.pick('camera'); },
  fromAlbum() { this.pick('album'); },

  pick(source) {
    const remaining = MAX_IMAGES - this.data.shots.length;
    if (remaining <= 0) return;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: [source],
      sizeType: ['compressed'], // 压缩图足够识别，且上传更快
      success: (res) => {
        const added = res.tempFiles.map((f) => f.tempFilePath);
        this.setData({ shots: [...this.data.shots, ...added].slice(0, MAX_IMAGES), error: null });
      },
      fail: () => {},
    });
  },

  preview(e) {
    wx.previewImage({
      current: this.data.shots[e.currentTarget.dataset.idx],
      urls: this.data.shots,
    });
  },

  removeShot(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ shots: this.data.shots.filter((_, i) => i !== idx) });
  },

  /**
   * 等待期间显示已用秒数。8-9 秒里最难受的不是等，是不知道还要多久。
   */
  startTimer() {
    this.stopTimer();
    this.setData({ elapsed: 0 });
    this._timer = setInterval(() => this.setData({ elapsed: this.data.elapsed + 1 }), 1000);
  },

  stopTimer() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  async start() {
    const shots = this.data.shots;
    if (shots.length === 0) return;

    const expect = shots.length === 1 ? '一般 8 到 10 秒' : `${shots.length} 张图，一般 12 到 20 秒`;
    this.setData({ scanning: true, progress: '正在上传照片…', hint: '', error: null });
    this.startTimer();

    try {
      const uploaded = await Promise.all(shots.map((filePath, i) =>
        wx.cloud.uploadFile({
          cloudPath: `labels/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`,
          filePath,
        })
      ));
      const fileIDs = uploaded.map((u) => u.fileID);

      this.setData({ progress: '正在读包装上的字…', hint: expect });
      const { result } = await wx.cloud.callFunction({
        name: 'extractLabel',
        data: { fileIDs },
      });

      this.stopTimer();

      if (!result || !result.ok) {
        this.setData({
          scanning: false,
          error: {
            message: (result && result.message) || '识别失败',
            detail: result && Array.isArray(result.detail) ? result.detail.join('\n') : (result && result.detail),
            canManual: true,
            fileIDs,
          },
        });
        return;
      }

      if (result.totalMs) console.log(`识别耗时 ${(result.totalMs / 1000).toFixed(1)} 秒，${result.imageCount} 张图`);

      // 识别结果必须经用户确认才能出结论（docs/design.md §2.3）
      app.globalData.currentLabel = result.label;
      app.globalData.currentFileIDs = fileIDs;
      this.setData({ scanning: false, shots: [] });
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
    app.globalData.currentFileIDs = (this.data.error && this.data.error.fileIDs) || [];
    this.setData({ shots: [] });
    wx.navigateTo({ url: '/pages/confirm/confirm?manual=1' });
  },

  gotoFamily() { wx.navigateTo({ url: '/pages/family/family' }); },
  gotoHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
});
