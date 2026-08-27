/**
 * 云函数 extractLabel —— 图片转结构化标签。
 *
 * 唯一职责：把包装照片抄成 JSON。不含任何判断逻辑（docs/design.md §4）。
 * 校验失败重试一次，再失败明确报错让前端转手动录入，绝不返回猜测结果。
 */

const cloud = require('wx-server-sdk');
const { 提取指令 } = require('./lib/prompt');
const { 校验标签 } = require('./lib/schema');
const { 识别图片, 抽取JSON } = require('./lib/model');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const 最大重试 = 1;

exports.main = async (event) => {
  const { fileID } = event || {};
  if (!fileID) {
    return { ok: false, 错误码: 'NO_FILE', 提示: '未收到图片' };
  }

  // 下载云存储中的图片
  let 图片Buffer;
  try {
    const res = await cloud.downloadFile({ fileID });
    图片Buffer = res.fileContent;
  } catch (e) {
    return { ok: false, 错误码: 'DOWNLOAD_FAILED', 提示: '图片读取失败，请重新拍摄', 详情: String(e.message || e) };
  }

  const 失败记录 = [];

  for (let 次 = 0; 次 <= 最大重试; 次++) {
    let 原始文本;
    try {
      原始文本 = await 识别图片(图片Buffer, 提取指令);
    } catch (e) {
      失败记录.push(`第${次 + 1}次调用失败：${e.message}`);
      continue;
    }

    const 解析 = 抽取JSON(原始文本);
    if (!解析) {
      失败记录.push(`第${次 + 1}次：模型返回的不是合法 JSON`);
      continue;
    }

    const 校验 = 校验标签(解析);
    if (!校验.ok) {
      失败记录.push(`第${次 + 1}次：schema 校验未通过（${校验.错误.join('；')}）`);
      continue;
    }

    return { ok: true, 标签: 校验.标签, 尝试次数: 次 + 1 };
  }

  // 两次都失败：如实报错，转手动录入。不返回任何猜测结果。
  return {
    ok: false,
    错误码: 'EXTRACT_FAILED',
    提示: '这张照片没能识别出来，可以重拍一张，或者手动填写关键数值',
    详情: 失败记录,
  };
};
