/**
 * DOM 操作工具函数
 */

/**
 * 获取DOM元素
 * @param {string} selector - CSS选择器
 * @returns {Element|null} DOM元素
 */
export function getElement(selector) {
  return document.querySelector(selector);
}

/**
 * 创建DOM元素
 * @param {string} tagName - 标签名
 * @param {string[]} [classNames] - 类名数组
 * @param {Object} [attributes] - 属性对象
 * @returns {Element} 创建的DOM元素
 */
export function createElement(tagName, classNames = [], attributes = {}) {
  const element = document.createElement(tagName);

  if (classNames.length > 0) {
    element.className = classNames.filter(Boolean).join(' ');
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });

  return element;
}

/**
 * 显示/隐藏元素
 * @param {Element|string} element - DOM元素或选择器
 * @param {boolean} show - 是否显示
 */
export function toggleElement(element, show) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.style.display = show ? '' : 'none';
}

/**
 * 添加/移除CSS类
 * @param {Element|string} element - DOM元素或选择器
 * @param {string} className - 类名
 * @param {boolean} [add] - 是否添加类（缺省时在添加与移除间切换）
 * @returns {boolean} 切换后元素是否包含该类
 */
export function toggleClass(element, className, add) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return false;

  return el.classList.toggle(className, add);
}

/**
 * 设置元素文本内容
 * @param {Element|string} element - DOM元素或选择器
 * @param {string} text - 文本内容
 */
export function setText(element, text) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.textContent = text;
}

/**
 * 清空元素内容
 * @param {Element|string} element - DOM元素或选择器
 */
export function clearElement(element) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.textContent = '';
}

/**
 * 为元素添加事件监听器
 * @param {Element|string} element - DOM元素或选择器
 * @param {string} event - 事件名
 * @param {Function} handler - 事件处理函数
 * @param {Object} [options] - 事件选项
 */
export function addEvent(element, event, handler, options = {}) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.addEventListener(event, handler, options);
}
