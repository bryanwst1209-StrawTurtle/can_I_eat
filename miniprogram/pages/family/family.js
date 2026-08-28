Page({
  data: {
    members: [],
    concerns: [],       // [{key, label}]
    selected: {},       // key -> 是否选中；WXML 表达式不支持 indexOf，在这里算好
    editing: null,      // {_id, name, concerns:[]}
    loading: true,
    error: '',
    openid: '',
  },

  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData', data: { action: 'listMembers' },
      });
      if (!result || !result.ok) {
        // 未加入家庭 / 集合不存在时把 openid 显示出来，便于手动写进 families
        this.setData({
          loading: false,
          error: (result && result.message) || '加载失败',
          openid: (result && result.openid) || '',
        });
        return;
      }
      this.setData({ members: result.members, concerns: result.concerns, loading: false });
    } catch (e) {
      this.setData({ loading: false, error: String(e.errMsg || e.message || e) });
    }
  },

  add() { this.startEdit({ _id: null, name: '', concerns: [] }); },

  edit(e) {
    const m = this.data.members[e.currentTarget.dataset.idx];
    this.startEdit({ _id: m._id, name: m.name, concerns: [...(m.concerns || [])] });
  },

  startEdit(editing) {
    this.setData({ editing, selected: toMap(editing.concerns) });
  },

  onName(e) { this.setData({ 'editing.name': e.detail.value }); },

  toggleConcern(e) {
    const k = e.currentTarget.dataset.key;
    const cur = this.data.editing.concerns;
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    this.setData({ 'editing.concerns': next, selected: toMap(next) });
  },

  cancel() { this.setData({ editing: null, selected: {} }); },

  async save() {
    const { _id, name, concerns } = this.data.editing;
    if (!name.trim()) {
      wx.showToast({ title: '请填名称', icon: 'none' });
      return;
    }
    const { result } = await wx.cloud.callFunction({
      name: 'familyData', data: { action: 'saveMember', _id, name, concerns },
    });
    if (!result || !result.ok) {
      wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
      return;
    }
    this.setData({ editing: null, selected: {} });
    this.load();
  },

  async remove() {
    const { _id } = this.data.editing;
    if (!_id) { this.setData({ editing: null, selected: {} }); return; }
    const confirmed = await new Promise((r) =>
      wx.showModal({ title: '删除成员', content: '确定删掉这位家庭成员？', success: (res) => r(res.confirm) }));
    if (!confirmed) return;
    await wx.cloud.callFunction({ name: 'familyData', data: { action: 'removeMember', _id } });
    this.setData({ editing: null, selected: {} });
    this.load();
  },

  copyOpenid() {
    wx.setClipboardData({ data: this.data.openid || '' });
  },
});

function toMap(keys) {
  const m = {};
  for (const k of keys || []) m[k] = true;
  return m;
}
