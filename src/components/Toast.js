/**
 * 全局 Toast 组件
 * 统一的瞬态消息出口：右下角堆叠，成功/信息自动消失，错误常驻可关闭
 */

import { createElement } from '../utils/dom.js';

const AUTO_HIDE_DURATION = 4000;
const MAX_STACK_SIZE = 5;

let stack = null;

/**
 * 确保消息容器存在
 * @returns {Element} 容器元素
 */
function ensureStack() {
  if (!stack) {
    stack = createElement('div', ['toast-stack']);
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

/**
 * 显示一条消息
 * @param {string} type - 'success' | 'error' | 'info'
 * @param {string} message - 消息内容
 * @param {Object} [options]
 * @param {boolean} [options.autoHide] - 是否自动消失（错误默认常驻）
 * @param {number} [options.duration] - 自动消失时长
 */
function show(type, message, { autoHide = type !== 'error', duration = AUTO_HIDE_DURATION } = {}) {
  const container = ensureStack();

  const toast = createElement('div', ['toast', `toast-${type}`]);

  const iconName = type === 'success' ? 'i-check' : type === 'error' ? 'i-warning' : 'i-info';
  const icon = createElement('span', ['toast-icon']);
  icon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${iconName}"/></svg>`;

  const text = createElement('span', ['toast-text']);
  text.textContent = message;

  const close = createElement('button', ['toast-close'], { type: 'button', 'aria-label': '关闭提示' });
  close.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-cross"/></svg>';

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 200);
  };

  close.addEventListener('click', dismiss);

  toast.append(icon, text, close);
  container.appendChild(toast);

  // 下一帧再显示，保证过渡动画生效
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  if (autoHide) {
    setTimeout(dismiss, duration);
  }

  // 限制堆叠数量
  while (container.children.length > MAX_STACK_SIZE) {
    container.firstElementChild.remove();
  }
}

export const Toast = {
  success(message) {
    show('success', message);
  },
  error(message) {
    show('error', message);
  },
  info(message) {
    show('info', message);
  },
  dismissAll() {
    if (stack) {
      Array.from(stack.children).forEach((toast) => toast.remove());
    }
  },
};
