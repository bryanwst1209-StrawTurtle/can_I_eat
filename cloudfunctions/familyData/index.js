/**
 * 云函数 familyData —— 家庭成员与历史记录的读写。
 *
 * 所有操作都在服务端反查出的 familyId 范围内进行，
 * 前端传来的任何 familyId 一律忽略（docs/design.md §7）。
 * 数据库集合权限设为「仅管理端可读写」，前端不直连数据库。
 */

const cloud = require('wx-server-sdk');
const { resolveFamily, authFailure } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 关注点白名单，与 analyze/lib/rules.js 的 CONCERNS 保持一致 */
const CONCERNS = [
  { key: 'hypertension', label: '高血压' },
  { key: 'lowSugar', label: '控糖' },
  { key: 'child', label: '儿童' },
  { key: 'lowFat', label: '控脂' },
];
const ALLOWED_KEYS = CONCERNS.map((c) => c.key);

exports.main = async (event) => {
  const { action } = event || {};

  let ctx;
  try {
    ctx = await resolveFamily(cloud, db);
  } catch (e) {
    return authFailure(e);
  }

  const handler = {
    listMembers, saveMember, removeMember, listScans, getScan,
  }[action];

  if (!handler) return { ok: false, errCode: 'UNKNOWN_ACTION', message: `未知操作：${action}` };

  try {
    return await handler(event, ctx);
  } catch (e) {
    console.error(action, e);
    return { ok: false, errCode: 'INTERNAL', message: '操作失败，请稍后重试' };
  }
};

async function listMembers(_event, ctx) {
  const res = await db.collection('members').where({ familyId: ctx.familyId }).get();
  const members = (res.data || []).map((m) => ({
    ...m,
    concernLabels: (m.concerns || []).map((k) => (CONCERNS.find((c) => c.key === k) || {}).label || k),
  }));
  return { ok: true, members, concerns: CONCERNS };
}

async function saveMember(event, ctx) {
  const { _id, name, concerns } = event;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, errCode: 'BAD_NAME', message: '成员名称不能为空' };
  }
  const cleaned = Array.isArray(concerns)
    ? [...new Set(concerns.filter((k) => ALLOWED_KEYS.includes(k)))]
    : [];

  if (_id) {
    // 先确认这条记录确实属于本家庭，防止改到别家的数据
    const existing = await db.collection('members').doc(_id).get().catch(() => null);
    if (!existing || !existing.data || existing.data.familyId !== ctx.familyId) {
      return { ok: false, errCode: 'NOT_FOUND', message: '成员不存在' };
    }
    await db.collection('members').doc(_id).update({
      data: { name: name.trim(), concerns: cleaned, updatedAt: db.serverDate() },
    });
    return { ok: true, _id };
  }

  const written = await db.collection('members').add({
    data: { familyId: ctx.familyId, name: name.trim(), concerns: cleaned, createdAt: db.serverDate() },
  });
  return { ok: true, _id: written._id };
}

async function removeMember(event, ctx) {
  const { _id } = event;
  if (!_id) return { ok: false, errCode: 'NO_ID', message: '缺少成员 id' };
  const existing = await db.collection('members').doc(_id).get().catch(() => null);
  if (!existing || !existing.data || existing.data.familyId !== ctx.familyId) {
    return { ok: false, errCode: 'NOT_FOUND', message: '成员不存在' };
  }
  await db.collection('members').doc(_id).remove();
  return { ok: true };
}

async function listScans(event, ctx) {
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = 20;
  const res = await db.collection('scans')
    .where({ familyId: ctx.familyId })
    .orderBy('createdAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .field({ productName: true, createdAt: true, fileIDs: true, 'judgement.overallLevel': true, 'judgement.overallText': true })
    .get();
  return { ok: true, records: res.data || [], page, pageSize };
}

async function getScan(event, ctx) {
  const { _id } = event;
  if (!_id) return { ok: false, errCode: 'NO_ID', message: '缺少记录 id' };
  const res = await db.collection('scans').doc(_id).get().catch(() => null);
  if (!res || !res.data || res.data.familyId !== ctx.familyId) {
    return { ok: false, errCode: 'NOT_FOUND', message: '记录不存在' };
  }
  return { ok: true, record: res.data };
}
