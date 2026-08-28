/**
 * 云函数 extractLabel —— 图片转结构化标签。
 *
 * 唯一职责：把包装照片抄成 JSON。不含任何判断逻辑（docs/design.md §4）。
 * 校验失败重试一次，再失败明确报错让前端转手动录入，绝不返回猜测结果。
 */

const cloud = require('wx-server-sdk');
const { EXTRACT_PROMPT } = require('./lib/prompt');
const { validateLabel } = require('./lib/schema');
const { recognize, extractJSON, selfTest, TIMEOUT_MS, TOTAL_BUDGET_MS } = require('./lib/model');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_ATTEMPTS = 2;

exports.main = async (event) => {
  // 配置自检：在云开发控制台用 {"ping": true} 调用即可，不需要图片
  if (event && event.ping) return selfTest();

  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // 时间预算：宁可少试一次也不能让函数被平台掐断——
    // 被掐断时前端拿到的是「result expired」，连失败原因都看不到
    const budget = remaining();
    if (budget < 6000) {
      failures.push(`剩余时间不足（${(budget / 1000).toFixed(1)}秒），放弃第${attempt}次尝试`);
      break;
    }

    let content;
    let elapsedMs;
    try {
      const r = await recognize(imageBuffer, EXTRACT_PROMPT, 'image/jpeg', Math.min(TIMEOUT_MS, budget - 3000));
      content = r.content;
      elapsedMs = r.elapsedMs;
    } catch (e) {
      failures.push(`第${attempt}次调用失败：${e.message}`);
      continue;
    }

    const parsed = extractJSON(content);
    if (!parsed) {
      failures.push(`第${attempt}次：模型返回的不是合法 JSON（耗时 ${(elapsedMs / 1000).toFixed(1)}秒）`);
      continue;
    }

    const checked = validateLabel(parsed);
    if (!checked.ok) {
      failures.push(`第${attempt}次：schema 校验未通过（${checked.errors.join('；')}）`);
      continue;
    }

    return {
      ok: true,
      label: checked.label,
      attempts: attempt,
      // 识别耗时暴露出来，用于判断是否需要换更快的模型
      elapsedMs,
      totalMs: Date.now() - startedAt,
    };
  }

  // 都失败了：如实报错，转手动录入。不返回任何猜测结果。
  return {
    ok: false,
    errCode: 'EXTRACT_FAILED',
    message: '这张照片没能识别出来，可以重拍一张，或者手动填写关键数值',
    detail: failures,
    totalMs: Date.now() - startedAt,
  };
};
