/**
 * 视觉模型适配层。
 *
 * 全项目只有这一个文件知道用的是哪家模型——换模型只动这里（docs/design.md §2.2.1）。
 * 走 OpenAI 兼容的 chat/completions 协议，国内主流厂商（豆包/通义/智谱等）均提供该协议，
 * 因此换厂商通常只需改环境变量，不必改代码。
 *
 * 环境变量（在微信开发者工具的云函数配置里设置，不要写进代码）：
 *   MODEL_BASE_URL  如 https://ark.cn-beijing.volces.com/api/v3
 *   MODEL_API_KEY   厂商签发的 key
 *   MODEL_NAME      具体的视觉模型 id
 */

const TIMEOUT_MS = 30000;

function readConfig() {
  const { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME } = process.env;
  const missing = [];
  if (!MODEL_BASE_URL) missing.push('MODEL_BASE_URL');
  if (!MODEL_API_KEY) missing.push('MODEL_API_KEY');
  if (!MODEL_NAME) missing.push('MODEL_NAME');
  if (missing.length) {
    throw new Error(`云函数环境变量未配置：${missing.join('、')}。请在微信开发者工具的云函数配置中填写。`);
  }
  return { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME };
}

/**
 * 调用视觉模型识别图片
 * @param {Buffer} 图片Buffer
 * @param {string} 指令 提取 prompt
 * @param {string} 图片类型 如 'image/jpeg'
 * @returns {Promise<string>} 模型返回的原始文本
 */
async function recognize(imageBuffer, prompt, mimeType = 'image/jpeg') {
  const { MODEL_BASE_URL, MODEL_API_KEY, MODEL_NAME } = readConfig();
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${MODEL_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODEL_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0, // 抄写任务不需要创造性，且要可复现
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new Error(`模型接口返回 ${resp.status}：${detail.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('模型返回内容为空');
    }
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`模型接口超时（${TIMEOUT_MS / 1000}秒）`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
 * 分别区分三种失败，因为它们的修法完全不同：
 *   环境变量没填 / key 无效 / 模型名不存在
 * 否则只能从一句「识别失败」倒着猜。
 */
async function selfTest() {
  let cfg;
  try {
    cfg = readConfig();
  } catch (e) {
    return { ok: false, stage: 'env', message: e.message };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${cfg.MODEL_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.MODEL_API_KEY}` },
      body: JSON.stringify({
        model: cfg.MODEL_NAME,
        max_tokens: 8,
        messages: [{ role: 'user', content: '回复 ok 两个字母，不要其他内容' }],
      }),
    });

    const body = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, stage: 'auth', message: `密钥被拒绝（HTTP ${resp.status}）。检查 MODEL_API_KEY`, detail: body.slice(0, 300) };
    }
    if (resp.status === 404 || /model.*not.*(found|exist)|invalid.*model/i.test(body)) {
      return { ok: false, stage: 'model', message: `模型名 ${cfg.MODEL_NAME} 不被接受。到厂商控制台核对可用的模型 id`, detail: body.slice(0, 300) };
    }
    if (!resp.ok) {
      return { ok: false, stage: 'http', message: `接口返回 HTTP ${resp.status}`, detail: body.slice(0, 300) };
    }

    return {
      ok: true,
      message: '模型接通',
      baseUrl: cfg.MODEL_BASE_URL,
      model: cfg.MODEL_NAME,
      // 只回显 key 的头尾，确认填的是不是同一把，但不整个打出来
      keyHint: `${cfg.MODEL_API_KEY.slice(0, 4)}…${cfg.MODEL_API_KEY.slice(-4)}`,
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { ok: false, stage: 'network', message: `连接超时（${TIMEOUT_MS / 1000}秒）。检查 MODEL_BASE_URL 是否正确、是否境内可达` };
    }
    return { ok: false, stage: 'network', message: `连接失败：${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { recognize, extractJSON, readConfig, selfTest };
