const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/**
 * WXML 静态检查。
 *
 * 存在的理由：WXML 不经过 Node，只在微信开发者工具里编译，
 * 所以前端这一层本来没有任何自动化验证——中文标识符这种错误
 * 只能靠人点「编译」才暴露，且一次只报一个，改一个撞一个。
 *
 * 这里把已经踩过的坑固化成断言，让 npm test 就能拦住。
 */

const PAGES_DIR = path.join(__dirname, '../miniprogram/pages');

function allWxml() {
  const out = [];
  for (const dir of fs.readdirSync(PAGES_DIR)) {
    const full = path.join(PAGES_DIR, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.wxml')) out.push(path.join(full, f));
    }
  }
  return out;
}

const NON_ASCII = /[^\x00-\x7F]/;

test('WXML 里有页面文件可检查', () => {
  assert.ok(allWxml().length >= 5, '应当至少有五个页面的 wxml');
});

test('WXML 属性名必须是 ASCII', () => {
  // data-字段="x" 这类写法编译报 `unexpected character`
  for (const file of allWxml()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const tag of src.match(/<[a-zA-Z][^>]*>/g) || []) {
      for (const m of tag.matchAll(/[\s]([^\s=<>"'/]+)=["']/g)) {
        assert.ok(
          !NON_ASCII.test(m[1]),
          `${path.basename(file)} 属性名含非 ASCII 字符：${m[1]}`
        );
      }
    }
  }
});

test('WXML 表达式里的标识符必须是 ASCII', () => {
  // {{识别备注.length}} 会让解析器报 `unexpected 识 at pos0`。
  // 字符串字面量里的中文是允许的（那是给人看的文案）。
  for (const file of allWxml()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      const withoutStrings = m[1]
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""');
      assert.ok(
        !NON_ASCII.test(withoutStrings),
        `${path.basename(file)} 表达式含非 ASCII 标识符：{{${m[1].trim()}}}`
      );
    }
  }
});

test('WXML 表达式里不调用方法', () => {
  // WXML 表达式不支持 indexOf/includes/map 这类方法调用，
  // 写了不报错但静默失效——比报错更难查。选中态一律在 js 里算好。
  const 禁用 = ['indexOf(', 'includes(', '.map(', '.filter(', '.find(', 'split(', 'toFixed('];
  for (const file of allWxml()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      for (const bad of 禁用) {
        assert.ok(
          !m[1].includes(bad),
          `${path.basename(file)} 表达式里调用了 ${bad}：{{${m[1].trim()}}}`
        );
      }
    }
  }
});

test('页面 js 与 wxml 成对存在，且都在 app.json 的 pages 里注册', () => {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../miniprogram/app.json'), 'utf-8')
  );
  for (const file of allWxml()) {
    const base = file.replace(/\.wxml$/, '');
    assert.ok(fs.existsSync(`${base}.js`), `${path.basename(file)} 缺少同名 .js`);
    const route = path.relative(path.join(__dirname, '../miniprogram'), base);
    assert.ok(appJson.pages.includes(route), `${route} 未在 app.json 的 pages 中注册`);
  }
});
