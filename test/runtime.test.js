const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 云函数运行时兼容性检查。
 *
 * 微信云函数默认运行时是 Node 16，而本地开发用的是更新的版本。
 * 用了 Node 18+ 才有的全局 API，本地跑得好好的，部署上去才炸——
 * 而且报错要等到真正调用那一刻，前面所有步骤都白配。
 *
 * 这里把 Node 16 上不存在的东西列成黑名单静态拦住。
 * 如果哪天云开发把默认运行时升上去了，再来放宽。
 */

const CF_DIR = path.join(__dirname, '../cloudfunctions');

/** Node 16 上不可用（或行为不同）的全局 API */
const FORBIDDEN = [
  { pattern: /(^|[^.\w])fetch\s*\(/, name: 'fetch()', hint: 'Node 18 才成为全局，改用 https 模块' },
  { pattern: /(^|[^.\w])FormData\s*\(/, name: 'FormData', hint: 'Node 18 才成为全局' },
  { pattern: /(^|[^.\w])Blob\s*\(/, name: 'Blob', hint: 'Node 18 才成为全局' },
  { pattern: /AbortSignal\s*\.\s*timeout/, name: 'AbortSignal.timeout', hint: 'Node 17.3+ 才有' },
  { pattern: /(^|[^.\w])structuredClone\s*\(/, name: 'structuredClone()', hint: 'Node 17 才有' },
  { pattern: /\.findLast(Index)?\s*\(/, name: 'Array.findLast', hint: 'Node 18 才有' },
  { pattern: /\.at\s*\(\s*-/, name: '负索引 .at(-n)', hint: 'Node 16.6+ 才有，谨慎使用' },
  { pattern: /require\s*\(\s*['"]node:test['"]\s*\)/, name: 'node:test', hint: '测试框架不应出现在云函数里' },
];

function cloudFunctionSources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        out.push(full);
      }
    }
  };
  walk(CF_DIR);
  return out;
}

test('能找到云函数源码', () => {
  assert.ok(cloudFunctionSources().length >= 8, '云函数源码文件数量异常');
});

test('云函数不使用 Node 16 上没有的全局 API', () => {
  for (const file of cloudFunctionSources()) {
    const src = fs.readFileSync(file, 'utf-8');
    // 去掉注释，避免注释里提到 fetch 就被误伤
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const { pattern, name, hint } of FORBIDDEN) {
      assert.ok(
        !pattern.test(code),
        `${path.relative(CF_DIR, file)} 使用了 ${name}——${hint}`
      );
    }
  }
});

test('每个云函数都有 package.json 且声明了 wx-server-sdk', () => {
  for (const dir of fs.readdirSync(CF_DIR)) {
    const full = path.join(CF_DIR, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const pkgPath = path.join(full, 'package.json');
    assert.ok(fs.existsSync(pkgPath), `${dir} 缺少 package.json，上传时不会安装依赖`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    assert.ok(pkg.dependencies && pkg.dependencies['wx-server-sdk'], `${dir} 未声明 wx-server-sdk`);
    assert.ok(fs.existsSync(path.join(full, 'index.js')), `${dir} 缺少 index.js`);
  }
});

test('两个云函数下的 auth.js 副本保持一致', () => {
  // 云函数各自独立部署，auth.js 是有意重复的。
  // 但两份漂移会导致鉴权行为不一致，这是安全相关的，必须锁住。
  const a = fs.readFileSync(path.join(CF_DIR, 'analyze/lib/auth.js'), 'utf-8');
  const b = fs.readFileSync(path.join(CF_DIR, 'familyData/lib/auth.js'), 'utf-8');
  assert.strictEqual(a, b, 'analyze 与 familyData 下的 auth.js 内容不一致，改了一处忘了另一处');
});
