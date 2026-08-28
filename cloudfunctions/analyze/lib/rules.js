/**
 * 判定规则种子数据。
 *
 * 规则是数据不是代码（docs/design.md §5）——调阈值不改码，加关注点只加一条数据，
 * 结论永远可复现。上线后这份数据搬到云数据库 rules 集合，此处仅作初始灌入。
 *
 * 每条规则必须有 evidence（依据）。这是「证据化报告」的地基：
 * 报告里每条结论都能展开看出处。
 *
 * thresholdKind 区分两种阈值，不可混淆：
 *   'standard' 标准明文 —— 阈值直接来自国标条文，可直接引用
 *   'tool'     工具设定 —— 国标没有定义该阈值，是本工具基于参考值设定的经验线，需如实标明
 */

const RULES = [
  // ── 通用（audiences 为空表示对所有人生效）──────────────────
  {
    id: 'sodium-low',
    metric: 'sodium', op: '<=', threshold: 120, unit: 'mg',
    audiences: [], level: 'info',
    summary: '属于低钠食品',
    thresholdKind: 'standard',
    evidence: 'GB 28050-2011《预包装食品营养标签通则》：钠含量 ≤120mg/100g 可声称「低钠」',
  },
  {
    id: 'sodium-high',
    metric: 'sodium', op: '>', threshold: 800, unit: 'mg',
    audiences: [], level: 'warn',
    summary: '钠含量偏高',
    thresholdKind: 'tool',
    evidence: 'GB 28050 营养素参考值 NRV 钠为 2000mg/日；每 100g 超过 800mg 意味着单份摄入即占日参考值较大比例。国标未定义「高钠」，此阈值为本工具设定',
  },
  {
    id: 'transfat-present',
    metric: 'transFat', op: '>', threshold: 0.3, unit: 'g',
    audiences: [], level: 'warn',
    summary: '含反式脂肪酸',
    thresholdKind: 'standard',
    evidence: 'GB 28050-2011：反式脂肪酸含量 ≤0.3g/100g 时方可标示为「0」；超过即为实际含有',
  },
  {
    id: 'satfat-high',
    metric: 'satFat', op: '>', threshold: 10, unit: 'g',
    audiences: [], level: 'warn',
    summary: '饱和脂肪偏高',
    thresholdKind: 'tool',
    evidence: 'GB 28050 营养素参考值 NRV 饱和脂肪酸为 20g/日；每 100g 超过 10g 即占日参考值一半。国标未定义「高饱和脂肪」，此阈值为本工具设定',
  },
  {
    id: 'sugar-high',
    metric: 'sugar', op: '>', threshold: 15, unit: 'g',
    audiences: [], level: 'warn',
    summary: '含糖量偏高',
    thresholdKind: 'tool',
    evidence: '《中国居民膳食指南(2022)》建议每日添加糖摄入不超过 50g、最好控制在 25g 以下。国标未定义「高糖」，此阈值为本工具设定',
  },

  // ── 高血压 ────────────────────────────────────────────────
  {
    id: 'sodium-hypertension',
    metric: 'sodium', op: '>', threshold: 400, unit: 'mg',
    audiences: ['hypertension'], level: 'warn',
    summary: '钠含量对需控钠人群偏高',
    thresholdKind: 'tool',
    evidence: '《中国居民膳食指南(2022)》建议成人每日钠摄入低于 2000mg，高血压人群需更严格控制。此阈值为本工具在该建议基础上设定',
  },

  // ── 控糖 ──────────────────────────────────────────────────
  {
    id: 'sugar-diabetes',
    metric: 'sugar', op: '>', threshold: 5, unit: 'g',
    audiences: ['lowSugar'], level: 'warn',
    summary: '含糖量对需控糖人群偏高',
    thresholdKind: 'standard',
    evidence: 'GB 28050-2011：糖含量 ≤5g/100g 方可声称「低糖」，超过即不属于低糖食品',
  },
  {
    id: 'sweetener-present',
    ingredientKeywords: ['阿斯巴甜', '三氯蔗糖', '安赛蜜', '甜蜜素', '糖精钠', '纽甜', '赤藓糖醇', '木糖醇', '麦芽糖醇'],
    audiences: ['lowSugar'], level: 'info',
    summary: '含代糖，血糖影响较小，但部分糖醇过量可能引起胃肠不适',
    thresholdKind: 'tool',
    evidence: '依据配料表中检出的甜味剂成分。GB 2760《食品添加剂使用标准》允许上述甜味剂在限量内使用',
  },

  // ── 儿童 ──────────────────────────────────────────────────
  {
    id: 'transfat-child',
    metric: 'transFat', op: '>', threshold: 0.3, unit: 'g',
    audiences: ['child'], level: 'danger',
    summary: '含反式脂肪酸，不建议给儿童食用',
    thresholdKind: 'standard',
    evidence: 'GB 28050-2011：反式脂肪酸 ≤0.3g/100g 方可标示为「0」。《中国居民膳食指南(2022)》建议反式脂肪酸摄入越低越好',
  },
  {
    id: 'caffeine-child',
    ingredientKeywords: ['咖啡因', '瓜拉纳', '茶多酚', '咖啡浓缩液'],
    audiences: ['child'], level: 'warn',
    summary: '含咖啡因来源成分，不建议儿童摄入',
    thresholdKind: 'tool',
    evidence: '依据配料表中检出的咖啡因来源成分。多国膳食建议均不推荐儿童摄入咖啡因',
  },
];

/** 关注点的中文显示名。前端展示与云函数校验共用同一份定义。 */
const CONCERNS = [
  { key: 'hypertension', label: '高血压' },
  { key: 'lowSugar', label: '控糖' },
  { key: 'child', label: '儿童' },
  { key: 'lowFat', label: '控脂' },
];

module.exports = { RULES, CONCERNS };
