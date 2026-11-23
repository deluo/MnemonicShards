/**
 * 通用工具函数
 */

import { addEvent } from './dom.js';

// 两段式确认的自动复原时长（毫秒）
const CONFIRM_RESET_DELAY = 3000;

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 绑定两段式确认按钮：首次点击进入待确认态（切换文案，3 秒未确认自动复原），
 * 再次点击执行动作并复原。用于擦除、复制敏感内容等不易撤销或隐私敏感操作的防误触。
 * @param {Element} button - 按钮元素
 * @param {Object} config
 * @param {string} config.label - 常态文案
 * @param {string} config.confirmLabel - 待确认态文案
 * @param {Function} config.onConfirm - 确认后执行的动作
 * @returns {Function} 强制复原函数（外部清空数据时重置按钮态用）
 */
export function bindTwoStepConfirm(button, { label, confirmLabel, onConfirm }) {
  let timer = null;

  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    delete button.dataset.armed;
    button.textContent = label;
  };

  addEvent(button, 'click', () => {
    if (button.dataset.armed === 'true') {
      disarm();
      onConfirm();
      return;
    }

    button.dataset.armed = 'true';
    button.textContent = confirmLabel;
    timer = setTimeout(disarm, CONFIRM_RESET_DELAY);
  });

  return disarm;
}

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期时间字符串
 */
export function formatDateTime(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 下载文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} [mimeType='text/plain'] - MIME类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Base64 字符串转字节数组
 * @param {string} base64 - Base64编码的字符串
 * @returns {Uint8Array} 字节数组
 */
export function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
