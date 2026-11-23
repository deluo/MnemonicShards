/**
 * MnemonicShards - 主应用文件
 * 组件化入口：分割 / 恢复 / 观察 / 全局擦除
 */

import { MnemonicInput } from './components/MnemonicInput.js';
import { ShareManager } from './components/ShareManager.js';
import { RecoveryTabManager } from './components/RecoveryTabManager.js';
import { AddressWatcher } from './components/AddressWatcher.js';
import { ShardVisualizer } from './components/ShardVisualizer.js';
import { Toast } from './components/Toast.js';
import { getElement, addEvent, toggleClass, setText } from './utils/dom.js';
import { bindTwoStepConfirm } from './utils/helpers.js';
import { MNEMONIC_CONFIG, SELECTORS, CSS_CLASSES, APP_CONFIG } from './constants/index.js';

/**
 * 主应用类
 */
class MnemonicSplitApp {
  constructor() {
    this.mnemonicInput = new MnemonicInput(MNEMONIC_CONFIG.DEFAULT_WORD_COUNT, {
      // 12/24 词数切换按钮由组件自己管理（含粘贴完整助记词后的自动切换）
      wordCountButtons: [
        { count: 12, selector: SELECTORS.WORDS_12_BTN },
        { count: 24, selector: SELECTORS.WORDS_24_BTN },
      ],
    });
    this.shareManager = new ShareManager({
      // 助记词相关的校验错误展示在输入状态条上
      onWordError: (message) => this.mnemonicInput.setStatusbar('error', message),
    });
    this.recoveryTabManager = new RecoveryTabManager();
    // 观察模式：独立助记词输入实例（'obs-' 前缀避免 ID 冲突）
    this.observeInput = new MnemonicInput(MNEMONIC_CONFIG.DEFAULT_WORD_COUNT, {
      wordCountButtons: [
        { count: 12, selector: SELECTORS.OBS_WORDS_12_BTN },
        { count: 24, selector: SELECTORS.OBS_WORDS_24_BTN },
      ],
      idPrefix: 'obs-',
      wordsGridSelector: SELECTORS.OBS_WORDS_GRID,
      statusbarSelector: SELECTORS.OBS_WORDS_STATUSBAR,
      primaryActionSelector: SELECTORS.DERIVE_BTN,
      actionNoun: '派生地址',
    });
    this.addressWatcher = new AddressWatcher({
      // 派生前的校验错误展示在观察状态条上
      onError: (message) => this.observeInput.setStatusbar('error', message),
    });

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
    this.mnemonicInput.renderInputs(); // 初始化输入框
    this.observeInput.renderInputs();
    setText(getElement(SELECTORS.VERSION_LABEL), `v${APP_CONFIG.VERSION}`);
    this.shareManager.initEncryptionListeners();
    this.shareManager.initFingerprintRow();
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 顶部模式切换
    addEvent(getElement(SELECTORS.MODE_SPLIT_BTN), 'click', () => this.switchMode('split'));
    addEvent(getElement(SELECTORS.MODE_RECOVER_BTN), 'click', () => this.switchMode('recover'));
    addEvent(getElement(SELECTORS.MODE_OBSERVE_BTN), 'click', () => this.switchMode('observe'));

    // 分片配置变更
    addEvent(getElement(SELECTORS.TOTAL_SHARES), 'change', () => this.updateThresholdOptions());

    // 生成分片按钮
    addEvent(getElement(SELECTORS.GENERATE_BTN), 'click', () => this.handleGenerateShares());

    // 恢复功能 - 由 RecoveryTabManager 处理输入，此处绑定恢复按钮
    addEvent(getElement(SELECTORS.RECOVER_BTN), 'click', () => this.handleRecoverMnemonic());

    // 派生地址按钮（观察模式）
    addEvent(getElement(SELECTORS.DERIVE_BTN), 'click', () => this.handleDeriveAddresses());

    // 擦除所有数据（两段式确认）
    bindTwoStepConfirm(getElement(SELECTORS.WIPE_ALL_BTN), {
      label: '擦除所有数据',
      confirmLabel: '确认擦除？',
      onConfirm: () => this.wipeAllData(),
    });

    // 键盘快捷键
    addEvent(document, 'keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /**
   * 切换顶部模式（分割 / 恢复 / 观察）
   * @param {string} mode - 'split' | 'recover' | 'observe'
   */
  switchMode(mode) {
    const modes = {
      split: { btn: SELECTORS.MODE_SPLIT_BTN, panel: SELECTORS.MODE_SPLIT },
      recover: { btn: SELECTORS.MODE_RECOVER_BTN, panel: SELECTORS.MODE_RECOVER },
      observe: { btn: SELECTORS.MODE_OBSERVE_BTN, panel: SELECTORS.MODE_OBSERVE },
    };

    for (const [name, refs] of Object.entries(modes)) {
      const isActive = name === mode;
      toggleClass(getElement(refs.btn), CSS_CLASSES.ACTIVE, isActive);
      getElement(refs.btn).setAttribute('aria-pressed', String(isActive));
      toggleClass(getElement(refs.panel), CSS_CLASSES.ACTIVE, isActive);
    }
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
   * 词输入型主动作的公共骨架：校验 → 报错聚焦 → 锁定按钮执行 → 复原。
   * 生成分片与派生地址共用；计算期间锁定按钮避免重复提交。
   * @param {MnemonicInput} input - 词输入组件实例
   * @param {Object} action - 动作描述
   * @param {string} action.btnSelector - 动作按钮选择器
   * @param {string} action.busyLabel - 执行期间的按钮文案
   * @param {string} action.idleLabel - 常态按钮文案
   * @param {Function} action.run - 实际动作（接收校验后的词数组），返回是否成功
   * @param {Function} [action.onSuccess] - 成功后的回调（如滚动到结果区）
   */
  async runWordAction(input, { btnSelector, busyLabel, idleLabel, run, onSuccess }) {
    const validation = input.validateAllInputs();

    if (!validation.isValid) {
      if (validation.hasEmpty) {
        input.setStatusbar('error', '请填写所有助记词！');
      } else {
        input.setStatusbar('error', `第 ${validation.invalidWordIndex} 个单词不是有效的 BIP39 单词，请修正后再${input.actionNoun}`);
        input.focusInvalidInput(validation.invalidWordIndex);
      }
      return;
    }

    const btn = getElement(btnSelector);
    btn.disabled = true;
    btn.textContent = busyLabel;

    try {
      if (await run(validation.words)) {
        onSuccess?.();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = idleLabel;
    }
  }

  /**
   * 处理生成分片
   */
  handleGenerateShares() {
    this.runWordAction(this.mnemonicInput, {
      btnSelector: SELECTORS.GENERATE_BTN,
      busyLabel: '正在生成...',
      idleLabel: '生成分片',
      run: async (words) =>
        this.shareManager.generateShares(
          words,
          parseInt(getElement(SELECTORS.TOTAL_SHARES).value),
          parseInt(getElement(SELECTORS.THRESHOLD).value),
        ),
      onSuccess: () => this.scrollToResult('generate'),
    });
  }

  /**
   * 处理恢复助记词（普通模式显示助记词；演练模式只比对指纹，不显示明文）
   */
  async handleRecoverMnemonic() {
    const drill = this.recoveryTabManager.getDrillConfig();

    if (drill.hasInvalidInput) {
      Toast.error('演练指纹格式无效：应为 8 位十六进制字符（0-9、A-F），如 F3A19C2B');
      return;
    }

    const success = await this.shareManager.recoverMnemonicWithShares(this.recoveryTabManager.getCurrentShares(), {
      drillMode: drill.active,
      drillFingerprint: drill.fingerprint,
    });

    if (success) {
      this.scrollToResult('recover');
    }
  }

  /**
   * 处理派生地址（观察模式）
   */
  handleDeriveAddresses() {
    this.runWordAction(this.observeInput, {
      btnSelector: SELECTORS.DERIVE_BTN,
      busyLabel: '正在派生...',
      idleLabel: '派生地址',
      run: (words) => this.addressWatcher.derive(words, getElement(SELECTORS.OBS_PASSPHRASE).value),
      onSuccess: () => this.scrollToResult('observe'),
    });
  }

  /**
   * 擦除所有输入与结果数据（两段式确认按钮触发）
   */
  wipeAllData() {
    this.mnemonicInput.clearAll();
    this.shareManager.clearResults();
    this.recoveryTabManager.clearAll();
    this.observeInput.clearAll();
    this.addressWatcher.clearAll();
    getElement(SELECTORS.OBS_PASSPHRASE).value = '';
    Toast.info('已擦除所有输入与结果数据');
  }

  /**
   * 滚动到结果区域
   * @param {string} target - 'generate' 生成分片结果 | 'recover' 恢复结果 | 'observe' 派生结果
   */
  scrollToResult(target) {
    // 恢复结果渲染在当前活动 Tab 的结果区域内
    const resultDiv =
      target === 'recover'
        ? getElement('.tab-pane.active .recover-result-section')
        : target === 'observe'
          ? getElement(SELECTORS.OBSERVE_RESULT)
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
    // Ctrl/Cmd + Enter：按当前模式触发生成分片 / 恢复助记词 / 派生地址
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();

      const isObserveActive = getElement(SELECTORS.MODE_OBSERVE).classList.contains(CSS_CLASSES.ACTIVE);
      const recoverInput = getElement(SELECTORS.RECOVER_INPUT);

      if (document.activeElement === recoverInput) {
        if (!getElement(SELECTORS.RECOVER_BTN).disabled) {
          this.handleRecoverMnemonic();
        }
      } else if (isObserveActive) {
        this.handleDeriveAddresses();
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
