/**
 * 家庭归属鉴权。
 *
 * 铁律（docs/design.md §7）：familyId 必须由服务端依据 openid 反查，
 * 绝不接受前端传参。openid 由微信侧注入，前端无法伪造；
 * 若信任前端传来的 familyId，任何人改一个参数就能读到别家的数据，
 * 而这种越权在正常使用中永不触发，常规测试发现不了。
 *
 * 本文件在 analyze 与 familyData 两个云函数下各有一份副本——
 * 云函数各自独立部署，一个小文件的重复优于引入依赖同步机制。
 * 修改时两处都要改。
 */

/**
 * @returns {Promise<{openid: string, familyId: string, family: object}>}
 * @throws {Error} 带 code 与 openid 字段：NO_OPENID / NO_COLLECTION / DB_ERROR / NOT_IN_FAMILY
 */
async function 取家庭归属(cloud, db) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    const e = new Error('未能获取调用者身份');
    e.code = 'NO_OPENID';
    throw e;
  }

  let res;
  try {
    res = await db.collection('families')
      .where({ 成员openid: OPENID })
      .limit(1)
      .get();
  } catch (原因) {
    // 集合还没建时也走这里。openid 必须带出去——
    // 用户正是要拿它去 families 里建第一条记录，不给就把人卡死了。
    const 集合不存在 = /collection.*not.*exist|DATABASE_COLLECTION_NOT_EXIST/i.test(
      String(原因 && (原因.errMsg ||原因.message || 原因))
    );
    const e = new Error(集合不存在 ? 'families 集合尚未创建' : '读取 families 集合失败');
    e.code = 集合不存在 ? 'NO_COLLECTION' : 'DB_ERROR';
    e.openid = OPENID;
    e.原始错误 = String(原因 && (原因.errMsg || 原因.message || 原因));
    throw e;
  }

  if (!res.data || res.data.length === 0) {
    const e = new Error('当前微信号尚未加入任何家庭');
    e.code = 'NOT_IN_FAMILY';
    e.openid = OPENID;
    throw e;
  }

  return { openid: OPENID, familyId: res.data[0]._id, family: res.data[0] };
}

/** 把鉴权异常转成给前端看的响应。openid 一律带上。 */
function 鉴权失败响应(e) {
  const 提示 = {
    NO_OPENID: '没能拿到你的微信身份，请重新进入小程序',
    NO_COLLECTION: '云数据库里还没有 families 集合，请先在云开发控制台创建',
    DB_ERROR: '读取数据库失败，请稍后重试',
    NOT_IN_FAMILY: '这个微信号还没加入家庭',
  }[e.code] || '身份校验失败';

  return { ok: false, 错误码: e.code || 'AUTH_FAILED', 提示, openid: e.openid, 详情: e.原始错误 };
}

module.exports = { 取家庭归属, 鉴权失败响应 };
