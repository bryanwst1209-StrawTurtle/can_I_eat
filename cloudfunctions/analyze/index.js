/**
 * 云函数 analyze —— 把确认后的标签变成带证据链的判定结果。
 *
 * 组合四个纯逻辑模块：normalize → evaluate，以及 verifySC → decodeSC。
 * 本文件只做编排与数据存取，不含任何判断逻辑。
 */

const cloud = require('wx-server-sdk');
const { 取家庭归属 } = require('./lib/auth');
const { normalize } = require('./lib/normalize');
const { evaluate } = require('./lib/evaluate');
const { 规则: 默认规则 } = require('./lib/rules');
const { parseSC, verifySC, decodeSC } = require('./lib/sc');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { 标签, fileID } = event || {};
  if (!标签) return { ok: false, 错误码: 'NO_LABEL', 提示: '未收到标签数据' };

  // 身份与家庭归属：服务端反查，不信任前端
  let 归属;
  try {
    归属 = await 取家庭归属(cloud, db);
  } catch (e) {
    return {
      ok: false,
      错误码: e.code || 'AUTH_FAILED',
      提示: e.code === 'NOT_IN_FAMILY'
        ? '这个微信号还没加入家庭，请把 openid 加到 families 集合里'
        : '身份校验失败',
      openid: e.openid,
    };
  }

  // 只取本家庭的成员，规则表为全局共享
  const [成员结果, 规则结果] = await Promise.all([
    db.collection('members').where({ familyId: 归属.familyId }).get().catch(() => ({ data: [] })),
    db.collection('rules').get().catch(() => ({ data: [] })),
  ]);

  const 成员 = (成员结果.data || []).map((m) => ({ 名称: m.名称, 关注点: m.关注点 || [] }));
  const 规则 = (规则结果.data || []).length > 0 ? 规则结果.data : 默认规则;

  // 营养判定
  const 归一 = normalize(标签);
  const 判定 = evaluate({ 归一, 配料: 标签.配料 || [], 成员, 规则 });

  // SC 核验：两层边界不可混淆
  const SC核验 = 做SC核验(标签.SC号, await 取表());

  // 存历史快照（含原图 fileID，便于事后回溯是抄错还是判错）
  const 记录 = {
    familyId: 归属.familyId,
    创建者openid: 归属.openid,
    fileID: fileID || null,
    商品名称: 标签.商品名称 || null,
    标签,
    归一,
    判定,
    SC核验,
    创建时间: db.serverDate(),
  };
  let scanId = null;
  try {
    const 写入 = await db.collection('scans').add({ data: 记录 });
    scanId = 写入._id;
  } catch (e) {
    // 存历史失败不应挡住用户看结果
    console.error('写入 scans 失败', e);
  }

  return { ok: true, scanId, 判定, SC核验, 归一 };
};

function 做SC核验(SC号, 表) {
  if (!SC号) {
    return { 有编号: false, 说明: '包装上未识别到食品生产许可证编号（SC 号）' };
  }
  const 校验 = verifySC(SC号);
  const 结果 = { 有编号: true, 原文: SC号, 结论: 校验.结论, 说明: 校验.说明 };

  // 只有校验码算法能得出否定结论；查表仅用于展示（docs/design.md §6）
  if (校验.结论 === 'valid') {
    const 解码 = decodeSC(校验.解析, 表);
    结果.产地 = 解码.产地;
    结果.类别 = 解码.类别;
    结果.未命中 = 解码.未命中;
    结果.数据版本 = 解码.数据版本;
  }
  return 结果;
}

async function 取表() {
  try {
    const [r, c] = await Promise.all([
      db.collection('regions').limit(1000).get(),
      db.collection('categories').limit(1000).get(),
    ]);
    const regions = {};
    for (const row of r.data || []) regions[row.代码] = row.名称;
    const categories = {};
    for (const row of c.data || []) categories[row.代码] = row.名称;
    const 版本 = (r.data || [])[0] || null;
    return {
      regions,
      categories,
      版本: 版本 ? { 来源: 版本.来源, 日期: 版本.抓取日期 } : null,
    };
  } catch (e) {
    console.error('读取区划/类别表失败', e);
    return { regions: {}, categories: {}, 版本: null };
  }
}
