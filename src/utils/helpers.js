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

// 敏感内容复制后自动清除剪贴板的延迟（毫秒）
const SENSITIVE_CLIPBOARD_CLEAR_DELAY = 60000;

/**
 * 复制敏感文本（助记词、明文分片）到剪贴板，延迟后自动清除。
 * 清除前先读回剪贴板确认内容仍是本次复制的文本：
 * 用户已复制其他内容时不动剪贴板；浏览器拒绝在无手势环境读取
 * （如 Firefox 的定时回调）时静默跳过，不做无条件覆盖
 * @param {string} text - 要复制的敏感内容
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copySensitiveToClipboard(text) {
  const success = await copyToClipboard(text);
  if (!success) return false;

  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === text) {
        await navigator.clipboard.writeText('');
      }
    } catch (error) {
      // 无法确认剪贴板当前内容，跳过以免误清用户后续复制的内容
    }
  }, SENSITIVE_CLIPBOARD_CLEAR_DELAY);

  return true;
}

// 密码生成字符集：大小写字母、数字、符号，排除易混淆字符（0/O、1/l/I）
const PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*-_=+';

/**
 * 用密码学安全随机数生成密码
 * @param {number} length - 密码长度
 * @returns {string} 生成的密码
 */
export function generateStrongPassword(length = 16) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => PASSWORD_CHARSET[v % PASSWORD_CHARSET.length]).join('');
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
