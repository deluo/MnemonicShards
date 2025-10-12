/**
 * 国际化管理器
 * 处理语言切换和文本翻译
 */

import {
  LANGUAGES,
  TRANSLATIONS,
  DEFAULT_LANGUAGE,
  LANGUAGE_NAMES
} from '../constants/i18n.js';

/**
 * 国际化管理器类
 */
export class I18nManager {
  constructor() {
    this.currentLanguage = this.loadLanguageFromStorage() || DEFAULT_LANGUAGE;
    this.listeners = [];
  }

  /**
   * 从本地存储加载语言偏好
   * @returns {string} 语言代码
   */
  loadLanguageFromStorage() {
    try {
      return localStorage.getItem('mnemonicShards_language');
    } catch {
      return null;
    }
  }

  /**
   * 保存语言偏好到本地存储
   * @param {string} language - 语言代码
   */
  saveLanguageToStorage(language) {
    try {
      localStorage.setItem('mnemonicShards_language', language);
    } catch {
      // 静默处理存储失败
    }
  }

  /**
   * 获取当前语言
   * @returns {string} 当前语言代码
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * 设置当前语言
   * @param {string} language - 语言代码
   */
  setLanguage(language) {
    if (!Object.values(LANGUAGES).includes(language)) {
      console.warn(`Unsupported language: ${language}`);
      return;
    }

    this.currentLanguage = language;
    this.saveLanguageToStorage(language);
    this.updatePageLanguage();
    this.updateAllElements();
    this.notifyListeners();
  }

  /**
   * 获取翻译文本
   * @param {string} key - 翻译键
   * @param {...any} params - 参数（用于函数类型的翻译）
   * @returns {string} 翻译后的文本
   */
  t(key, ...params) {
    const translations = TRANSLATIONS[this.currentLanguage];
    const translation = this.getNestedValue(translations, key);

    if (typeof translation === 'function') {
      return translation(...params);
    }

    if (translation === undefined) {
      // 回退到英文
      const fallback = this.getNestedValue(TRANSLATIONS[LANGUAGES.EN], key);
      if (typeof fallback === 'function') {
        return fallback(...params);
      }
      return fallback || key;
    }

    return translation;
  }

  /**
   * 获取嵌套对象的值
   * @param {object} obj - 目标对象
   * @param {string} path - 路径（如 'errors.fillAllWords'）
   * @returns {any} 值
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 添加语言变化监听器
   * @param {Function} listener - 监听器函数
   */
  addListener(listener) {
    this.listeners.push(listener);
  }

  /**
   * 移除语言变化监听器
   * @param {Function} listener - 监听器函数
   */
  removeListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentLanguage);
      } catch (error) {
        console.error('Error in i18n listener:', error);
      }
    });
  }

  /**
   * 更新页面语言属性
   */
  updatePageLanguage() {
    const htmlElement = document.documentElement;
    htmlElement.setAttribute('lang', this.currentLanguage === LANGUAGES.ZH ? 'zh-CN' : 'en');
  }

  /**
   * 更新所有带有 data-i18n 属性的元素
   */
  updateAllElements() {
    const elements = document.querySelectorAll('[data-i18n]');

    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);

      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        if (element.type === 'submit' || element.type === 'button') {
          element.value = translation;
        } else {
          element.placeholder = translation;
        }
      } else {
        element.innerHTML = translation;
      }
    });

    // 更新所有带有 data-i18n-placeholder 的元素
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const translation = this.t(key);
      element.placeholder = translation;
    });
  }

  /**
   * 切换到指定语言
   * @param {string} language - 语言代码
   */
  switchTo(language) {
    this.setLanguage(language);
  }

  /**
   * 切换语言（在当前两种语言间切换）
   */
  toggleLanguage() {
    const newLanguage = this.currentLanguage === LANGUAGES.EN ? LANGUAGES.ZH : LANGUAGES.EN;
    this.switchTo(newLanguage);
  }

  /**
   * 获取所有可用语言
   * @returns {Array} 语言选项数组
   */
  getAvailableLanguages() {
    return Object.values(LANGUAGES).map(code => ({
      code,
      name: LANGUAGE_NAMES[code],
      isCurrent: code === this.currentLanguage
    }));
  }

  /**
   * 初始化国际化
   */
  init() {
    this.updatePageLanguage();
    this.updateAllElements();
  }
}

// 创建全局国际化实例
export const i18n = new I18nManager();

// 导出便捷函数
export const t = (key, ...params) => i18n.t(key, ...params);
export const setLanguage = (language) => i18n.setLanguage(language);
export const getCurrentLanguage = () => i18n.getCurrentLanguage();
export const toggleLanguage = () => i18n.toggleLanguage();