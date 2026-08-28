/**
 * 云函数 extractLabel —— 图片转结构化标签。
 *
 * 唯一职责：把包装照片抄成 JSON。不含任何判断逻辑（docs/design.md §4）。
 * 校验失败重试一次，再失败明确报错让前端转手动录入，绝不返回猜测结果。
 */

const cloud = require('wx-server-sdk');
const { EXTRACT_PROMPT } = require('./lib/prompt');
const { validateLabel } = require('./lib/schema');
const { recognize, extractJSON } = require('./lib/model');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_RETRY = 1;

exports.main = async (event) => {
  const { fileID } = event || {};
  if (!fileID) {
    return { ok: false, errCode: 'NO_FILE', message: '未收到图片' };
  }

  let imageBuffer;
  try {
    const res = await cloud.downloadFile({ fileID });
    imageBuffer = res.fileContent;
  } catch (e) {
    return {
      ok: false, errCode: 'DOWNLOAD_FAILED',
      message: '图片读取失败，请重新拍摄',
      detail: String(e.message || e),
    };
  }

  const failures = [];

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    let text;
    try {
      text = await recognize(imageBuffer, EXTRACT_PROMPT);
    } catch (e) {
      failures.push(`第${attempt + 1}次调用失败：${e.message}`);
      continue;
    }

    const parsed = extractJSON(text);
    if (!parsed) {
      failures.push(`第${attempt + 1}次：模型返回的不是合法 JSON`);
      continue;
    }

    const checked = validateLabel(parsed);
    if (!checked.ok) {
      failures.push(`第${attempt + 1}次：schema 校验未通过（${checked.errors.join('；')}）`);
      continue;
    }

    return { ok: true, label: checked.label, attempts: attempt + 1 };
  }

  // 两次都失败：如实报错，转手动录入。不返回任何猜测结果。
  return {
    ok: false,
    errCode: 'EXTRACT_FAILED',
    message: '这张照片没能识别出来，可以重拍一张，或者手动填写关键数值',
    detail: failures,
  };
};
