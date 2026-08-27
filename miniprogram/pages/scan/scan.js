const app = getApp();

Page({
  data: {
    识别中: false,
    进度文案: '',
    错误: null,
  },

  onShow() {
    this.setData({ 错误: null });
  },

  拍照() { this.取图('camera'); },
  相册() { this.取图('album'); },

  取图(来源) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [来源],
      sizeType: ['compressed'], // 压缩图足够识别，且上传更快
      success: (res) => this.上传并识别(res.tempFiles[0].tempFilePath),
      fail: () => {},
    });
  },

  async 上传并识别(路径) {
    this.setData({ 识别中: true, 进度文案: '正在上传照片…', 错误: null });
    try {
      const 上传 = await wx.cloud.uploadFile({
        cloudPath: `labels/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
        filePath: 路径,
      });

      this.setData({ 进度文案: '正在识别标签…' });
      const { result } = await wx.cloud.callFunction({
        name: 'extractLabel',
        data: { fileID: 上传.fileID },
      });

      if (!result || !result.ok) {
        this.setData({
          识别中: false,
          错误: {
            提示: (result && result.提示) || '识别失败',
            可手动: true,
            fileID: 上传.fileID,
          },
        });
        return;
      }

      // 识别结果必须经用户确认才能出结论（docs/design.md §2.3）
      app.globalData.当前标签 = result.标签;
      app.globalData.当前fileID = 上传.fileID;
      this.setData({ 识别中: false });
      wx.navigateTo({ url: '/pages/confirm/confirm' });
    } catch (e) {
      this.setData({
        识别中: false,
        错误: { 提示: '网络或云函数调用失败，请重试', 详情: String(e.errMsg || e.message || e) },
      });
    }
  },

  手动录入() {
    app.globalData.当前标签 = null;
    app.globalData.当前fileID = (this.data.错误 && this.data.错误.fileID) || null;
    wx.navigateTo({ url: '/pages/confirm/confirm?手动=1' });
  },

  去成员() { wx.navigateTo({ url: '/pages/family/family' }); },
  去历史() { wx.navigateTo({ url: '/pages/history/history' }); },
});
