Page({
  data: {
    成员: [],
    允许关注点: [],
    加载中: true,
    错误: '',
    编辑中: null, // {_id, 名称, 关注点:[]}
    选中: {},     // 关注点 -> 是否选中，供 WXML 直接读
  },

  onShow() { this.加载(); },

  async 加载() {
    this.setData({ 加载中: true, 错误: '' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'familyData', data: { action: '列出成员' },
      });
      if (!result || !result.ok) {
        // NOT_IN_FAMILY 时把 openid 显示出来，便于手动写进 families 集合
        this.setData({
          加载中: false,
          错误: (result && result.提示) || '加载失败',
          openid: result && result.openid,
        });
        return;
      }
      this.setData({
        成员: result.成员,
        允许关注点: result.允许关注点,
        加载中: false,
      });
    } catch (e) {
      this.setData({ 加载中: false, 错误: String(e.errMsg || e.message || e) });
    }
  },

  新增() {
    this.进入编辑({ _id: null, 名称: '', 关注点: [] });
  },

  编辑(e) {
    const m = this.data.成员[e.currentTarget.dataset.序];
    this.进入编辑({ _id: m._id, 名称: m.名称, 关注点: [...(m.关注点 || [])] });
  },

  /** WXML 表达式不支持 indexOf，选中态在这里算好再传给视图 */
  进入编辑(编辑中) {
    this.setData({ 编辑中, 选中: 建选中表(编辑中.关注点) });
  },

  改名(e) {
    this.setData({ '编辑中.名称': e.detail.value });
  },

  切换关注点(e) {
    const k = e.currentTarget.dataset.关注点;
    const 现有 = this.data.编辑中.关注点;
    const 新的 = 现有.includes(k) ? 现有.filter((x) => x !== k) : [...现有, k];
    this.setData({ '编辑中.关注点': 新的, 选中: 建选中表(新的) });
  },

  取消() { this.setData({ 编辑中: null, 选中: {} }); },

  async 保存() {
    const { _id, 名称, 关注点 } = this.data.编辑中;
    if (!名称.trim()) {
      wx.showToast({ title: '请填名称', icon: 'none' });
      return;
    }
    const { result } = await wx.cloud.callFunction({
      name: 'familyData', data: { action: '保存成员', _id, 名称, 关注点 },
    });
    if (!result || !result.ok) {
      wx.showToast({ title: (result && result.提示) || '保存失败', icon: 'none' });
      return;
    }
    this.setData({ 编辑中: null, 选中: {} });
    this.加载();
  },

  async 删除() {
    const { _id } = this.data.编辑中;
    if (!_id) { this.setData({ 编辑中: null, 选中: {} }); return; }
    const 确认 = await new Promise((r) =>
      wx.showModal({ title: '删除成员', content: '确定删掉这位家庭成员？', success: (res) => r(res.confirm) }));
    if (!确认) return;
    await wx.cloud.callFunction({ name: 'familyData', data: { action: '删除成员', _id } });
    this.setData({ 编辑中: null, 选中: {} });
    this.加载();
  },

  复制openid() {
    wx.setClipboardData({ data: this.data.openid || '' });
  },
});
