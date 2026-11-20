/**
 * MnemonicShards - 主应用文件
 * 重构后的主文件，使用组件化架构提高可维护性
 */

import { MnemonicInput } from './components/MnemonicInput.js';
import { ShareManager } from './components/ShareManager.js';
import { RecoveryTabManager } from './components/RecoveryTabManager.js';
import { getElement, addEvent, toggleClass } from './utils/dom.js';
import { MNEMONIC_CONFIG, SELECTORS, CSS_CLASSES } from './constants/index.js';

/**
 * 主应用类
 */
class MnemonicSplitApp {
  constructor() {
    this.mnemonicInput = new MnemonicInput(MNEMONIC_CONFIG.DEFAULT_WORD_COUNT);
    this.shareManager = new ShareManager();
    this.recoveryTabManager = new RecoveryTabManager();
    this.currentWordCount = MNEMONIC_CONFIG.DEFAULT_WORD_COUNT;

    this.init();
  }

  /**
   * 初始化应用
   */
  init() {
    this.setupEventListeners();
    this.updateThresholdOptions();
    this.setInitialState();
    this.shareManager.initEncryptionListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 助记词数量切换
    const words12Btn = getElement('#words12');
    const words24Btn = getElement('#words24');

    if (words12Btn) {
      addEvent(words12Btn, 'click', () => this.setWordCount(12));
    }
    if (words24Btn) {
      addEvent(words24Btn, 'click', () => this.setWordCount(24));
    }

    // 分片配置变更
    const totalSharesSelect = getElement(SELECTORS.TOTAL_SHARES);
    if (totalSharesSelect) {
      addEvent(totalSharesSelect, 'change', () => this.updateThresholdOptions());
    }

    // 生成分片按钮
    const generateBtn = getElement(SELECTORS.GENERATE_BTN);
    if (generateBtn) {
      addEvent(generateBtn, 'click', () => this.handleGenerateShares());
    }

    // 恢复功能 - 由 RecoveryTabManager 处理输入，此处绑定恢复按钮
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);
    if (recoverBtn) {
      addEvent(recoverBtn, 'click', () => this.handleRecoverMnemonic());
    }

    // 键盘快捷键
    addEvent(document, 'keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /**
   * 设置初始状态
   */
  setInitialState() {
    this.updateWordCountButtons();
    this.mnemonicInput.renderInputs(); // 初始化输入框
    this.shareManager.hideAllAlerts();
  }

  /**
   * 设置助记词数量
   * @param {number} count - 助记词数量
   */
  setWordCount(count) {
    if (!MNEMONIC_CONFIG.WORD_COUNTS.includes(count)) {
      return;
    }

    this.currentWordCount = count;
    this.mnemonicInput.setWordCount(count);
    this.updateWordCountButtons();
    this.shareManager.hideAllAlerts();
  }

  /**
   * 更新助记词数量按钮状态
   */
  updateWordCountButtons() {
    const words12Btn = getElement('#words12');
    const words24Btn = getElement('#words24');

    if (words12Btn) {
      toggleClass(words12Btn, CSS_CLASSES.ACTIVE, this.currentWordCount === 12);
    }
    if (words24Btn) {
      toggleClass(words24Btn, CSS_CLASSES.ACTIVE, this.currentWordCount === 24);
    }
  }

  /**
   * 更新阈值选项
   */
  updateThresholdOptions() {
    const totalSharesSelect = getElement(SELECTORS.TOTAL_SHARES);
    const thresholdSelect = getElement(SELECTORS.THRESHOLD);

    if (!totalSharesSelect || !thresholdSelect) return;

    const totalShares = parseInt(totalSharesSelect.value);
    const currentThreshold = parseInt(thresholdSelect.value);

    thresholdSelect.innerHTML = '';

    for (let i = 2; i <= totalShares; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i} 个分片`;

      if (i === Math.min(currentThreshold, totalShares)) {
        option.selected = true;
      }

      thresholdSelect.appendChild(option);
    }
  }

  /**
   * 处理生成分片
   */
  async handleGenerateShares() {
    const validation = this.mnemonicInput.validateAllInputs();

    if (!validation.isValid) {
      if (validation.hasEmpty) {
        this.shareManager.showError('请填写所有助记词！');
      } else if (validation.hasInvalidWord) {
        this.shareManager.showError(`第 ${validation.invalidWordIndex} 个单词不是有效的 BIP39 单词，请从建议列表中选择有效的单词。`);
        this.focusInvalidInput(validation.invalidWordIndex);
      }
      return;
    }

    const totalShares = parseInt(getElement(SELECTORS.TOTAL_SHARES).value);
    const threshold = parseInt(getElement(SELECTORS.THRESHOLD).value);

    const success = await this.shareManager.generateShares(validation.words, totalShares, threshold);

    if (success) {
      this.scrollToResult();
    }
  }

  /**
   * 处理恢复助记词
   */
  async handleRecoverMnemonic() {
    try {
      // 获取当前分片数据
      const shares = this.recoveryTabManager.getCurrentShares();

      if (shares.length === 0) {
        this.shareManager.showError('没有找到有效的分片数据');
        return;
      }

      // 显示处理状态
      const recoverBtn = getElement(SELECTORS.RECOVER_BTN);
      if (recoverBtn) {
        recoverBtn.disabled = true;
        recoverBtn.textContent = '正在恢复...';
      }

      // 调用ShareManager的恢复方法
      const success = await this.shareManager.recoverMnemonicWithShares(shares);

      if (success) {
        this.scrollToResult();
      }
    } catch (error) {
      this.shareManager.showError('恢复失败：' + error.message);
    } finally {
      // 恢复按钮状态
      const recoverBtn = getElement(SELECTORS.RECOVER_BTN);
      if (recoverBtn) {
        recoverBtn.disabled = false;
        recoverBtn.textContent = '恢复助记词';
      }
    }
  }

  /**
   * 聚焦到无效输入框
   * @param {number} index - 输入框索引
   */
  focusInvalidInput(index) {
    const input = getElement(SELECTORS.WORD_INPUT(index));
    if (input) {
      toggleClass(input, CSS_CLASSES.INVALID_WORD, true);
      input.focus();
    }
  }

  /**
   * 滚动到结果区域
   */
  scrollToResult() {
    const resultDiv = getElement(SELECTORS.SHARES_RESULT) || getElement(SELECTORS.RECOVER_RESULT);
    if (resultDiv) {
      resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * 处理键盘快捷键
   * @param {KeyboardEvent} e - 键盘事件
   */
  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter 生成分片或恢复助记词
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();

      const recoverInput = getElement(SELECTORS.RECOVER_INPUT);
      const isActiveInRecover = recoverInput && document.activeElement === recoverInput;

      if (isActiveInRecover && !getElement(SELECTORS.RECOVER_BTN).disabled) {
        this.handleRecoverMnemonic();
      } else if (!isActiveInRecover) {
        this.handleGenerateShares();
      }
    }

    // ESC 清除所有提示
    if (e.key === 'Escape') {
      this.shareManager.hideAllAlerts();
    }
  }

  /**
   * 销毁应用，清理资源
   */
  destroy() {
    this.mnemonicInput.destroy();
    this.shareManager.destroy();
    if (this.recoveryTabManager) {
      this.recoveryTabManager.destroy();
    }
  }
}

// 创建全局应用实例
let app;

/**
 * 初始化应用
 */
function initApp() {
  try {
    app = new MnemonicSplitApp();
  } catch (error) {
    // 初始化失败必须可见，静默吞错会让用户面对一个无响应的页面
    console.error('应用初始化失败:', error);
  }
}

/**
 * index.html 内联事件处理器需要的全局函数
 * （仅绑定页面实际使用的：setWordCount / generateShares / validateShares）
 */
function bindGlobalFunctions() {
  window.setWordCount = (count) => {
    if (app) {
      app.setWordCount(count);
    }
  };

  window.generateShares = () => {
    if (app) {
      app.handleGenerateShares();
    }
  };

  window.validateShares = () => {
    if (app && app.recoveryTabManager) {
      app.recoveryTabManager.validateCurrentTab();
    }
  };
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  bindGlobalFunctions();
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
  if (app) {
    app.destroy();
  }
});
