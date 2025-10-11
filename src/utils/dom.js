/**
 * DOM 操作工具函数
 */

/**
 * 安全获取DOM元素
 * @param {string} selector - CSS选择器
 * @returns {Element|null} DOM元素或null
 */
export function getElement(selector) {
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return null;
  }
}

/**
 * 安全获取多个DOM元素
 * @param {string} selector - CSS选择器
 * @returns {NodeList} DOM元素列表
 */
export function getElements(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (error) {
    console.warn(`Invalid selector: ${selector}`, error);
    return [];
  }
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
    element.className = classNames.join(' ');
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
 * @param {boolean} add - 是否添加类
 */
export function toggleClass(element, className, add) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.classList.toggle(className, add);
}

/**
 * 设置元素内容
 * @param {Element|string} element - DOM元素或选择器
 * @param {string} content - HTML内容
 */
export function setHTML(element, content) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.innerHTML = content;
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
  setHTML(element, '');
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

/**
 * 为元素移除事件监听器
 * @param {Element|string} element - DOM元素或选择器
 * @param {string} event - 事件名
 * @param {Function} handler - 事件处理函数
 */
export function removeEvent(element, event, handler) {
  const el = typeof element === 'string' ? getElement(element) : element;
  if (!el) return;

  el.removeEventListener(event, handler);
}