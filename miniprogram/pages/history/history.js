Page({
  data: { 记录: [], 加载中: true, 错误: '' },

  onShow() { this.加载(); },

  async 加载() {
    this.setData({ 加载中: true, 错误: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData', data: { action: '列出历史', 页: 0 },
      });
      if (!result || !result.ok) {
        this.setData({ 加载中: false, 错误: (result && result.提示) || '加载失败' });
        return;
      }
      this.setData({
        记录: (result.记录 || []).map((r) => ({
          ...r,
          时间文案: 格式化时间(r.创建时间),
        })),
        加载中: false,
      });
    } catch (e) {
      this.setData({ 加载中: false, 错误: String(e.errMsg || e.message || e) });
    }
  },

  打开(e) {
    wx.navigateTo({ url: `/pages/report/report?id=${e.currentTarget.dataset.id}` });
  },
});

function 格式化时间(t) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
