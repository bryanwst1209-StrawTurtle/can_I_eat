# 能吃吗（can_I_eat）

家用食品标签解读小程序。拍一张包装，识别配料表与营养成分表，按家庭成员各自的关注点给出带证据链的判断。

只给家人用，通过微信小程序**体验版**分发，不上架、不推广。

## 它做什么

拍照 → 模型把包装抄成结构化数据 → **人工核对一遍** → 确定性规则按各人体质判定 → 输出每条结论都能追溯到依据的报告。

**它不做的事**：不核对 GB 执行标准、不联网查 SC 许可、不查官方抽检、不查保健食品批文、不查条码商品库。原因见 [docs/design.md](docs/design.md) §9。

## 三条设计底线

1. **模型只负责「抄」，不负责「判断」。** 所有结论来自可读的规则数据，因此可复现、可解释。
2. **缺失即声明，绝不当作 0。** 没识别到钠含量就明说「无法判断」，绝不因为缺数据而报绿灯。
3. **查不到 ≠ 非法。** SC 号查表失败只显示「未知」，只有校验码算法能得出否定结论。

完整设计见 [docs/design.md](docs/design.md)。

## 目录

```
miniprogram/          小程序前端
  pages/scan          拍照入口
  pages/confirm       识别结果核对（强制步骤，不可跳过）
  pages/report        证据化报告
  pages/family        家庭成员与关注点
  pages/history       历史记录
cloudfunctions/
  extractLabel/       图片 → 标签 JSON（唯一与模型打交道的地方）
  analyze/            标签 → 判定结果 + SC 核验
    lib/normalize.js  单位归一化      ┐
    lib/evaluate.js   判定引擎        │ 纯函数，
    lib/rules.js      规则数据        │ 全部有单元测试
    lib/sc.js         SC 校验与解码   ┘
  familyData/         成员与历史的读写
data/                 区划表、类别表等基础数据
scripts/              数据整理脚本
test/                 单元测试
```

## 跑测试

```bash
npm test
```

零依赖，用 Node 内置测试运行器。

## 部署清单

这几件事只能你自己做：

1. **注册小程序**，拿到 AppID，填进 `project.config.json`。
2. **开通云开发**，拿到环境 ID，填进 `miniprogram/app.js` 的 `云环境`。
3. **申请视觉模型 API**（豆包 / 通义 / 智谱等，走 OpenAI 兼容协议的都行），
   在云函数 `extractLabel` 的配置里设三个环境变量：
   `MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME`。
   **不要把 key 写进代码。**
4. **建数据库集合**：`families`、`members`、`scans`、`rules`、`regions`、`categories`。
   权限全部设为**「仅管理端可读写」**——前端不直连数据库，所有读写走云函数。
5. **建家庭记录**：在 `families` 集合手动加一条，`成员openid` 字段填家人的 openid 数组。
   openid 可以在「家庭成员」页面上看到（未加入家庭时会提示并显示）。
6. **灌基础数据**：`node scripts/seed.js` 产出 `dist/*.jsonl`，在云开发控制台导入。
   区划表需要先自行下载整理，见 [scripts/fetch-regions.md](scripts/fetch-regions.md)。
7. **上传云函数**，在开发者工具里右键三个云函数目录分别上传并部署。
8. **加体验成员**，把家人的微信号加进去（未认证个人主体上限 15 人）。

## 待办

- [ ] 从家里翻几个包装，把真实 SC 号填进 `test/sc.real-samples.test.js`，验证校验码算法与国标一致
- [ ] 拍 20 张真实包装建 extractLabel 的识别回归集
- [ ] 核对 `data/categories.json` 与官方《食品生产许可分类目录》
- [ ] 下载并整理近四年行政区划表
