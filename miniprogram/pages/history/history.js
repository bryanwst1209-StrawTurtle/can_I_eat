Page({
  data: { records: [], loading: true, error: '' },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData', data: { action: 'listScans', page: 0 },
      });
      if (!result || !result.ok) {
        this.setData({ loading: false, error: (result && result.message) || '加载失败' });
        return;
      }
      this.setData({
        records: (result.records || []).map((r) => ({ ...r, timeText: formatTime(r.createdAt) })),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false, error: String(e.errMsg || e.message || e) });
    }
  },

  open(e) {
    wx.navigateTo({ url: `/pages/report/report?id=${e.currentTarget.dataset.id}` });
  },
});

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
