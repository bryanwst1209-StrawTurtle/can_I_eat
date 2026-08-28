/**
 * 云函数 analyze —— 把确认后的标签变成带证据链的判定结果。
 *
 * 组合四个纯逻辑模块：normalize → evaluate，以及 verifySC → decodeSC。
 * 本文件只做编排与数据存取，不含任何判断逻辑。
 */

const cloud = require('wx-server-sdk');
const { resolveFamily, authFailure } = require('./lib/auth');
const { normalize } = require('./lib/normalize');
const { evaluate } = require('./lib/evaluate');
const { RULES, CONCERNS } = require('./lib/rules');
const { verifySC, decodeSC } = require('./lib/sc');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { label, fileID } = event || {};
  if (!label) return { ok: false, errCode: 'NO_LABEL', message: '未收到标签数据' };

  // 身份与家庭归属：服务端反查，不信任前端
  let ctx;
  try {
    ctx = await resolveFamily(cloud, db);
  } catch (e) {
    return authFailure(e);
  }

  // 只取本家庭的成员；规则表为全局共享
  const [memberRes, ruleRes] = await Promise.all([
    db.collection('members').where({ familyId: ctx.familyId }).get().catch(() => ({ data: [] })),
    db.collection('rules').get().catch(() => ({ data: [] })),
  ]);

  const concernLabel = Object.fromEntries(CONCERNS.map((c) => [c.key, c.label]));
  const members = (memberRes.data || []).map((m) => ({
    name: m.name,
    concerns: m.concerns || [],
    concernLabels: (m.concerns || []).map((k) => concernLabel[k] || k),
  }));
  const rules = (ruleRes.data || []).length > 0 ? ruleRes.data : RULES;

  const normalized = normalize(label);
  const judgement = evaluate({
    normalized,
    ingredients: label.ingredients || [],
    members,
    rules,
  });

  const scCheck = checkSC(label.scCode, await loadTables());

  // 存历史快照（含原图 fileID，便于事后回溯是抄错还是判错）
  let scanId = null;
  try {
    const written = await db.collection('scans').add({
      data: {
        familyId: ctx.familyId,
        createdBy: ctx.openid,
        fileID: fileID || null,
        productName: label.productName || null,
        label,
        normalized,
        judgement,
        scCheck,
        createdAt: db.serverDate(),
      },
    });
    scanId = written._id;
  } catch (e) {
    // 存历史失败不应挡住用户看结果
    console.error('写入 scans 失败', e);
  }

  return { ok: true, scanId, judgement, scCheck, normalized };
};

function checkSC(scCode, tables) {
  if (!scCode) {
    return { hasCode: false, message: '包装上未识别到食品生产许可证编号（SC 号）' };
  }
  const verified = verifySC(scCode);
  const out = { hasCode: true, raw: scCode, result: verified.result, message: verified.message };

  // 只有校验码算法能得出否定结论；查表仅用于展示（docs/design.md §6）
  // unverified 表示算法待验证，此时同样正常解码展示，只是不下真伪结论
  if (verified.result === 'valid' || verified.result === 'unverified') {
    const decoded = decodeSC(verified.parsed, tables);
    out.origin = decoded.origin;
    out.category = decoded.category;
    out.misses = decoded.misses;
    out.dataVersion = decoded.dataVersion;
  }
  return out;
}

async function loadTables() {
  try {
    const [r, c] = await Promise.all([
      db.collection('regions').limit(1000).get(),
      db.collection('categories').limit(1000).get(),
    ]);
    const regions = {};
    for (const row of r.data || []) regions[row.code] = row.name;
    const categories = {};
    for (const row of c.data || []) categories[row.code] = row.name;
    const first = (r.data || [])[0] || null;
    return {
      regions,
      categories,
      version: first ? { source: first.source, date: first.fetchedAt } : null,
    };
  } catch (e) {
    console.error('读取区划/类别表失败', e);
    return { regions: {}, categories: {}, version: null };
  }
}
