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
 * @throws {Error} 带 code 字段：NO_OPENID / NOT_IN_FAMILY
 */
async function 取家庭归属(cloud, db) {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    const e = new Error('未能获取调用者身份');
    e.code = 'NO_OPENID';
    throw e;
  }

  const res = await db.collection('families')
    .where({ 成员openid: OPENID })
    .limit(1)
    .get();

  if (!res.data || res.data.length === 0) {
    const e = new Error('当前微信号尚未加入任何家庭');
    e.code = 'NOT_IN_FAMILY';
    e.openid = OPENID; // 便于手动把 openid 写进 families 集合
    throw e;
  }

  return { openid: OPENID, familyId: res.data[0]._id, family: res.data[0] };
}

module.exports = { 取家庭归属 };
