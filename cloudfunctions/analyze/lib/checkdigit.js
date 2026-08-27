/**
 * GB/T 17710-1999 规定的 MOD 11,10 校验算法（即 ISO 7064 MOD 11,10）。
 * SC 号第 14 位校验码由前 13 位本体码计算得出。
 *
 * 这是纯算法，零数据依赖，永不过期。
 * 它是唯一能得出「该编号有问题」结论的一层——见 docs/design.md §6。
 */

/**
 * 计算 MOD 11,10 校验码
 * @param {number[]} digits 本体码各位数字
 * @returns {number} 校验码（0-9）
 */
function mod11_10(digits) {
  let p = 10;
  for (const d of digits) {
    let m = (p + d) % 10;
    if (m === 0) m = 10;
    p = (m * 2) % 11;
  }
  return (11 - p) % 10;
}

module.exports = { mod11_10 };
