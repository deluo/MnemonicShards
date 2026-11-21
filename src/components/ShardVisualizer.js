/**
 * 分片可视化组件（签名元素）
 * 将抽象的 k-of-n 阈值概念转化为可见的图形：
 * - render: 配置卡内的主可视化（n 个方块，k 个黄铜填充）
 * - mini: 分片卡头部的小型可视化（当前序号高亮）
 */

import { createElement, clearElement } from '../utils/dom.js';

/**
 * 渲染主可视化
 * @param {Element} container - 容器元素
 * @param {Object} config
 * @param {number} config.total - 分片总数 n
 * @param {number} config.threshold - 恢复所需分片数 k
 */
function render(container, { total, threshold }) {
  if (!container) return;

  clearElement(container);

  const row = createElement('div', ['shard-viz-row']);
  row.title = `示意：任意 ${threshold} 片组合均可恢复`;

  for (let i = 0; i < total; i++) {
    row.appendChild(createElement('span', ['shard-tile', i < threshold ? 'is-key' : null]));
  }

  const caption = createElement('div', ['shard-viz-caption']);
  caption.textContent = `任意 ${threshold} / ${total} 片即可恢复助记词`;

  container.append(row, caption);
}

/**
 * 创建分片卡用的小型可视化
 * @param {number} index - 当前分片序号（从 1 开始）
 * @param {number} total - 分片总数
 * @returns {Element} 可视化元素
 */
function mini(index, total) {
  const row = createElement('span', ['shard-viz-mini']);
  row.setAttribute('aria-hidden', 'true');
  row.title = `分片 ${index} / ${total}`;

  for (let i = 1; i <= total; i++) {
    row.appendChild(createElement('span', ['shard-dot', i === index ? 'is-on' : null]));
  }

  return row;
}

export const ShardVisualizer = { render, mini };
