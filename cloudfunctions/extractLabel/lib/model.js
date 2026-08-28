/**
 * 视觉模型适配层。
 *
 * 全项目只有这一个文件知道用的是哪家模型——换模型只动这里（docs/design.md §2.2.1）。
 * 走 OpenAI 兼容的 chat/completions 协议，国内主流厂商（豆包/通义/智谱等）均提供该协议，
 * 因此换厂商通常只需改环境变量，不必改代码。
 *
 * HTTP 用 Node 内置的 https 模块而不是 fetch：
 * 微信云函数的默认运行时是 Node 16，没有全局 fetch（fetch 是 Node 18 才成为全局的）。
 * 用 https 模块可以在任何 Node 版本上跑，也不引入依赖。
 *
 * 环境变量（在云函数配置里设置，不要写进代码）：
 *   MODEL_BASE_URL  如 https://ark.cn-beijing.volces.com/api/v3
 *   MODEL_API_KEY   厂商签发的 key
 *   MODEL_NAME      具体的视觉模型 id
 */

const https = require('https');
const { URL } = require('url');

/**
 * 单次请求超时。
 *
 * 必须留出重试和函数自身开销的余量：云函数执行超时 60 秒，
 * 若单次就给 50 秒，一次重试必然把总时长顶穿，重试反而保证了失败。
 * 25 秒 × 2 次 + 下载图片和编码的开销，仍在 60 秒内。
 */
const TIMEOUT_MS = 25000;

/** 整个 extractLabel 的时间预算，留 8 秒给函数收尾，避免被平台硬掐断 */
const TOTAL_BUDGET_MS = 52000;

function readConfig() {
  const { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME } = process.env;
  const missing = [];
  if (!MODEL_BASE_URL) missing.push('MODEL_BASE_URL');
  if (!MODEL_API_KEY) missing.push('MODEL_API_KEY');
  if (!MODEL_NAME) missing.push('MODEL_NAME');
  if (missing.length) {
    throw new Error(`云函数环境变量未配置：${missing.join('、')}。请在云开发控制台的云函数配置中填写。`);
  }
  return { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME };
}

/**
 * POST JSON，返回 { status, text }。不抛 HTTP 错误状态，交给调用方分类处理。
 */
function postJSON(urlString, headers, payload, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = Buffer.from(JSON.stringify(payload), 'utf-8');

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': body.length },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf-8') });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`请求超时（${timeoutMs / 1000}秒）`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function endpoint(baseUrl) {
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

/**
 * 调用视觉模型识别图片
 * @param {Buffer} imageBuffer
 * @param {string} prompt 提取指令
 * @returns {Promise<string>} 模型返回的原始文本
 */
async function recognize(imageBuffer, prompt, mimeType = 'image/jpeg', timeoutMs = TIMEOUT_MS) {
  const cfg = readConfig();
  const startedAt = Date.now();
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

  const { status, text } = await postJSON(
    endpoint(cfg.MODEL_BASE_URL),
    { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.MODEL_API_KEY}` },
    {
      model: cfg.MODEL_NAME,
      temperature: 0, // 抄写任务不需要创造性，且要可复现
      // 深度思考模型会先推理再输出，对「抄写」这种任务毫无收益，只增加几十秒延迟。
      // 火山方舟用 thinking.type 关闭；其他厂商忽略这个字段即可。
      ...(process.env.MODEL_THINKING === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    },
    timeoutMs
  );
  const elapsedMs = Date.now() - startedAt;

  if (status < 200 || status >= 300) {
    throw new Error(`模型接口返回 ${status}：${text.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`模型接口返回的不是 JSON：${text.slice(0, 200)}`);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('模型返回内容为空');
  }
  return { content, elapsedMs };
}

/**
 * 从模型返回的文本里抠出 JSON。
 * 模型常常会把 JSON 包在 ```json 代码块里，或前后带一句废话。
 */
function extractJSON(text) {
  const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * 配置自检：不拍照也能验证模型接得通。
 *
 * 分别区分几种失败，因为它们的修法完全不同：
 *   环境变量没填 / 密钥被拒 / 模型名不存在 / 网络不通
 * 否则只能从一句「识别失败」倒着猜。
 */
async function selfTest() {
  let cfg;
  try {
    cfg = readConfig();
  } catch (e) {
    return { ok: false, stage: 'env', message: e.message };
  }

  const startedAt = Date.now();
  try {
    const { status, text } = await postJSON(
      endpoint(cfg.MODEL_BASE_URL),
      { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.MODEL_API_KEY}` },
      {
        model: cfg.MODEL_NAME,
        max_tokens: 8,
        ...(process.env.MODEL_THINKING === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
        messages: [{ role: 'user', content: '回复 ok' }],
      },
      20000
    );

    if (status === 401 || status === 403) {
      return { ok: false, stage: 'auth', message: `密钥被拒绝（HTTP ${status}）。检查 MODEL_API_KEY`, detail: text.slice(0, 300) };
    }
    if (status === 404 || /model.*not.*(found|exist)|invalid.*model/i.test(text)) {
      return { ok: false, stage: 'model', message: `模型名 ${cfg.MODEL_NAME} 不被接受。到厂商控制台核对可用的模型 id`, detail: text.slice(0, 300) };
    }
    if (status < 200 || status >= 300) {
      return { ok: false, stage: 'http', message: `接口返回 HTTP ${status}`, detail: text.slice(0, 300) };
    }

    return {
      ok: true,
      message: '模型接通',
      // 纯文本往返耗时。识图会明显更慢，但这个数字能先看出模型快慢的量级
      elapsedMs: Date.now() - startedAt,
      thinking: process.env.MODEL_THINKING === 'disabled' ? '已关闭深度思考' : '未关闭深度思考（如果模型支持，建议设 MODEL_THINKING=disabled）',
      runtime: process.version,
      baseUrl: cfg.MODEL_BASE_URL,
      model: cfg.MODEL_NAME,
      // 只回显 key 的头尾，确认填的是不是同一把，但不整个打出来
      keyHint: `${cfg.MODEL_API_KEY.slice(0, 4)}…${cfg.MODEL_API_KEY.slice(-4)}`,
    };
  } catch (e) {
    return { ok: false, stage: 'network', message: `连接失败：${e.message}。检查 MODEL_BASE_URL 是否正确、云函数执行超时是否够长` };
  }
}

module.exports = { recognize, extractJSON, readConfig, selfTest, postJSON, TIMEOUT_MS, TOTAL_BUDGET_MS };
