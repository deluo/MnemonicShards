/**
 * MnemonicShards - 主应用文件
 * 组件化入口：分割 / 恢复 / 全局擦除
 */

import { MnemonicInput } from './components/MnemonicInput.js';
import { ShareManager } from './components/ShareManager.js';
import { RecoveryTabManager } from './components/RecoveryTabManager.js';
import { ShardVisualizer } from './components/ShardVisualizer.js';
import { Toast } from './components/Toast.js';
import { getElement, addEvent, toggleClass, setText } from './utils/dom.js';
import { MNEMONIC_CONFIG, SELECTORS, CSS_CLASSES, APP_CONFIG } from './constants/index.js';

/**
 * 主应用类
 */
class MnemonicSplitApp {
  constructor() {
    this.mnemonicInput = new MnemonicInput(MNEMONIC_CONFIG.DEFAULT_WORD_COUNT, {
      // 粘贴 12/24 词助记词时自动切换输入模式
      onWordCountAutoSwitch: (count) => this.setWordCount(count),
    });
    this.shareManager = new ShareManager({
      // 助记词相关的校验错误展示在输入状态条上
      onWordError: (message) => this.mnemonicInput.setStatusbar('error', message),
    });
    this.recoveryTabManager = new RecoveryTabManager();
    this.currentWordCount = MNEMONIC_CONFIG.DEFAULT_WORD_COUNT;
    this.wipeDisarmTimer = null;

    // 恢复结果"擦除"时同步清理恢复侧输入
    this.shareManager.onWipeRecovery = () => this.recoveryTabManager.clearAll();

    this.init();
  }

  /**
   * 初始化应用
   */
  init() {
    this.setupEventListeners();
    this.updateThresholdOptions();
    this.updateWordCountButtons();
    this.mnemonicInput.renderInputs(); // 初始化输入框
    setText(getElement(SELECTORS.VERSION_LABEL), `v${APP_CONFIG.VERSION}`);
    this.shareManager.initEncryptionListeners();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 顶部模式切换
    addEvent(getElement(SELECTORS.MODE_SPLIT_BTN), 'click', () => this.switchMode('split'));
    addEvent(getElement(SELECTORS.MODE_RECOVER_BTN), 'click', () => this.switchMode('recover'));

    // 助记词数量切换
    addEvent(getElement(SELECTORS.WORDS_12_BTN), 'click', () => this.setWordCount(12));
    addEvent(getElement(SELECTORS.WORDS_24_BTN), 'click', () => this.setWordCount(24));

    // 分片配置变更
    addEvent(getElement(SELECTORS.TOTAL_SHARES), 'change', () => this.updateThresholdOptions());

    // 生成分片按钮
    addEvent(getElement(SELECTORS.GENERATE_BTN), 'click', () => this.handleGenerateShares());

    // 恢复功能 - 由 RecoveryTabManager 处理输入，此处绑定恢复按钮
    addEvent(getElement(SELECTORS.RECOVER_BTN), 'click', () => this.handleRecoverMnemonic());

    // 擦除所有数据（两段式确认）
    addEvent(getElement(SELECTORS.WIPE_ALL_BTN), 'click', (e) => this.handleWipeAll(e.currentTarget));

    // 键盘快捷键
    addEvent(document, 'keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /**
   * 切换顶部模式（分割 / 恢复）
   * @param {string} mode - 'split' | 'recover'
   */
  switchMode(mode) {
    const isSplit = mode === 'split';

    toggleClass(getElement(SELECTORS.MODE_SPLIT_BTN), CSS_CLASSES.ACTIVE, isSplit);
    toggleClass(getElement(SELECTORS.MODE_RECOVER_BTN), CSS_CLASSES.ACTIVE, !isSplit);
    getElement(SELECTORS.MODE_SPLIT_BTN).setAttribute('aria-pressed', String(isSplit));
    getElement(SELECTORS.MODE_RECOVER_BTN).setAttribute('aria-pressed', String(!isSplit));

    toggleClass(getElement(SELECTORS.MODE_SPLIT), CSS_CLASSES.ACTIVE, isSplit);
    toggleClass(getElement(SELECTORS.MODE_RECOVER), CSS_CLASSES.ACTIVE, !isSplit);
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
  }

  /**
   * 更新助记词数量按钮状态
   */
  updateWordCountButtons() {
    toggleClass(getElement(SELECTORS.WORDS_12_BTN), CSS_CLASSES.ACTIVE, this.currentWordCount === 12);
    toggleClass(getElement(SELECTORS.WORDS_24_BTN), CSS_CLASSES.ACTIVE, this.currentWordCount === 24);
  }

  /**
   * 更新阈值选项并刷新分片可视化
   */
  updateThresholdOptions() {
    const totalSharesSelect = getElement(SELECTORS.TOTAL_SHARES);
    const thresholdSelect = getElement(SELECTORS.THRESHOLD);
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

    // 刷新 k-of-n 分片可视化
    ShardVisualizer.render(getElement(SELECTORS.SHARD_VIZ), {
      total: totalShares,
      threshold: parseInt(thresholdSelect.value),
    });
  }

  /**
   * 处理生成分片
   */
  async handleGenerateShares() {
    const validation = this.mnemonicInput.validateAllInputs();

    if (!validation.isValid) {
      if (validation.hasEmpty) {
        this.mnemonicInput.setStatusbar('error', '请填写所有助记词！');
      } else {
        this.mnemonicInput.setStatusbar('error', `第 ${validation.invalidWordIndex} 个单词不是有效的 BIP39 单词，请修正后再生成分片`);
        this.focusInvalidInput(validation.invalidWordIndex);
      }
      return;
    }

    const totalShares = parseInt(getElement(SELECTORS.TOTAL_SHARES).value);
    const threshold = parseInt(getElement(SELECTORS.THRESHOLD).value);

    // 生成涉及校验和与 Shamir 计算，期间锁定按钮避免重复提交
    const generateBtn = getElement(SELECTORS.GENERATE_BTN);
    generateBtn.disabled = true;
    generateBtn.textContent = '正在生成...';

    try {
      const success = await this.shareManager.generateShares(validation.words, totalShares, threshold);

      if (success) {
        this.scrollToResult('generate');
      }
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '生成分片';
    }
  }

  /**
   * 处理恢复助记词
   */
  async handleRecoverMnemonic() {
    const success = await this.shareManager.recoverMnemonicWithShares(this.recoveryTabManager.getCurrentShares());

    if (success) {
      this.scrollToResult('recover');
    }
  }

  /**
   * 擦除所有输入与结果数据（两段式确认，避免误触）
   * @param {Element} button - 擦除按钮
   */
  handleWipeAll(button) {
    if (button.dataset.armed === 'true') {
      this.mnemonicInput.clearAll();
      this.shareManager.clearResults();
      this.recoveryTabManager.clearAll();
      Toast.info('已擦除所有输入与结果数据');
      this.disarmWipeButton(button);
      return;
    }

    // 进入待确认状态，3 秒后自动复原
    button.dataset.armed = 'true';
    button.textContent = '确认擦除？';
    this.wipeDisarmTimer = setTimeout(() => this.disarmWipeButton(button), 3000);
  }

  /**
   * 复原擦除按钮状态
   * @param {Element} button - 擦除按钮
   */
  disarmWipeButton(button) {
    clearTimeout(this.wipeDisarmTimer);
    this.wipeDisarmTimer = null;
    delete button.dataset.armed;
    button.textContent = '擦除所有数据';
  }

  /**
   * 聚焦到无效输入框
   * @param {number} index - 输入框索引
   */
  focusInvalidInput(index) {
    const input = getElement(SELECTORS.WORD_INPUT(index));
    toggleClass(input, CSS_CLASSES.INVALID_WORD, true);
    input.focus();
  }

  /**
   * 滚动到结果区域
   * @param {string} target - 'generate' 生成分片结果 | 'recover' 恢复结果
   */
  scrollToResult(target) {
    // 恢复结果渲染在当前活动 Tab 的结果区域内
    const resultDiv =
      target === 'recover'
        ? getElement('.tab-pane.active .recover-result-section')
        : getElement(SELECTORS.SHARES_RESULT);

    if (resultDiv && resultDiv.children.length > 0) {
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
      if (document.activeElement === recoverInput) {
        if (!getElement(SELECTORS.RECOVER_BTN).disabled) {
          this.handleRecoverMnemonic();
        }
      } else {
        this.handleGenerateShares();
      }
    }

    // ESC 关闭所有 Toast
    if (e.key === 'Escape') {
      Toast.dismissAll();
    }
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new MnemonicSplitApp();
});
