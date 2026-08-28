/**
 * 云函数 familyData —— 家庭成员与历史记录的读写。
 *
 * 所有操作都在服务端反查出的 familyId 范围内进行，
 * 前端传来的任何 familyId 一律忽略（docs/design.md §7）。
 * 数据库集合权限设为「仅管理端可读写」，前端不直连数据库。
 */

const cloud = require('wx-server-sdk');
const { 取家庭归属, 鉴权失败响应 } = require('./lib/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 允许的关注点取值——与 rules.js 里的「适用人群」保持一致 */
const 允许关注点 = ['高血压', '控糖', '儿童', '控脂'];

exports.main = async (event) => {
  const { action } = event || {};

  let 归属;
  try {
    归属 = await 取家庭归属(cloud, db);
  } catch (e) {
    return 鉴权失败响应(e);
  }

  const 处理 = {
    列出成员: 列出成员,
    保存成员: 保存成员,
    删除成员: 删除成员,
    列出历史: 列出历史,
    读取历史: 读取历史,
  }[action];

  if (!处理) return { ok: false, 错误码: 'UNKNOWN_ACTION', 提示: `未知操作：${action}` };

  try {
    return await 处理(event, 归属);
  } catch (e) {
    console.error(action, e);
    return { ok: false, 错误码: 'INTERNAL', 提示: '操作失败，请稍后重试' };
  }
};

async function 列出成员(_event, 归属) {
  const res = await db.collection('members').where({ familyId: 归属.familyId }).get();
  return { ok: true, 成员: res.data || [], 允许关注点 };
}

async function 保存成员(event, 归属) {
  const { _id, 名称, 关注点 } = event;
  if (!名称 || typeof 名称 !== 'string' || 名称.trim().length === 0) {
    return { ok: false, 错误码: 'BAD_NAME', 提示: '成员名称不能为空' };
  }
  const 净化关注点 = Array.isArray(关注点)
    ? [...new Set(关注点.filter((k) => 允许关注点.includes(k)))]
    : [];

  if (_id) {
    // 先确认这条记录确实属于本家庭，防止改到别家的数据
    const 现有 = await db.collection('members').doc(_id).get().catch(() => null);
    if (!现有 || !现有.data || 现有.data.familyId !== 归属.familyId) {
      return { ok: false, 错误码: 'NOT_FOUND', 提示: '成员不存在' };
    }
    await db.collection('members').doc(_id).update({
      data: { 名称: 名称.trim(), 关注点: 净化关注点, 更新时间: db.serverDate() },
    });
    return { ok: true, _id };
  }

  const 写入 = await db.collection('members').add({
    data: {
      familyId: 归属.familyId,
      名称: 名称.trim(),
      关注点: 净化关注点,
      创建时间: db.serverDate(),
    },
  });
  return { ok: true, _id: 写入._id };
}

async function 删除成员(event, 归属) {
  const { _id } = event;
  if (!_id) return { ok: false, 错误码: 'NO_ID', 提示: '缺少成员 id' };
  const 现有 = await db.collection('members').doc(_id).get().catch(() => null);
  if (!现有 || !现有.data || 现有.data.familyId !== 归属.familyId) {
    return { ok: false, 错误码: 'NOT_FOUND', 提示: '成员不存在' };
  }
  await db.collection('members').doc(_id).remove();
  return { ok: true };
}

async function 列出历史(event, 归属) {
  const 页 = Math.max(0, Number(event.页) || 0);
  const 每页 = 20;
  const res = await db.collection('scans')
    .where({ familyId: 归属.familyId })
    .orderBy('创建时间', 'desc')
    .skip(页 * 每页)
    .limit(每页)
    .field({ 商品名称: true, 创建时间: true, fileID: true, '判定.总体等级': true, '判定.总体文案': true })
    .get();
  return { ok: true, 记录: res.data || [], 页, 每页 };
}

async function 读取历史(event, 归属) {
  const { _id } = event;
  if (!_id) return { ok: false, 错误码: 'NO_ID', 提示: '缺少记录 id' };
  const res = await db.collection('scans').doc(_id).get().catch(() => null);
  if (!res || !res.data || res.data.familyId !== 归属.familyId) {
    return { ok: false, 错误码: 'NOT_FOUND', 提示: '记录不存在' };
  }
  return { ok: true, 记录: res.data };
}
