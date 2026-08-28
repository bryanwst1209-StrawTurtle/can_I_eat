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

module.exports = { recognize, extractJSON, readConfig };
