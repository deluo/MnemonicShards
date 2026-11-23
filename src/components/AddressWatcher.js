/**
 * 地址观察组件
 * 从助记词离线派生 BTC 收款地址与账户级扩展公钥（zpub/ypub/xpub），
 * 供 BlueWallet 等钱包扫码导入观察钱包
 *
 * 隐私分层：
 * - 地址列表默认明文（主流程需要），首尾 8 位高亮、中间淡化
 * - zpub 默认模糊遮蔽，点按显示后 60 秒自动回遮蔽；复制需两段式确认
 * - 二维码统一走弹层，关闭弹层时立即回遮蔽 zpub
 * - 账户私钥在派生完成后立即抹除，内存中仅保留公钥链
 */

import QRCode from 'qrcode';
import { getElement, createElement, toggleElement, toggleClass, clearElement, addEvent, setText } from '../utils/dom.js';
import { copyToClipboard, bindTwoStepConfirm } from '../utils/helpers.js';
import { validateMnemonicChecksum } from '../utils/validation.js';
import { mnemonicToSeed, deriveAccount, deriveAddress } from '../utils/derivation.js';
import { DERIVATION_CONFIG, SELECTORS, CSS_CLASSES } from '../constants/index.js';
import { Toast } from './Toast.js';

export class AddressWatcher {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onError] - 校验失败回调（写入观察模式状态条）
   */
  constructor(options = {}) {
    this.onError = options.onError;

    // 派生上下文（仅内存，不落盘；账户私钥已抹除，仅保留公钥链）
    this.words = null;
    this.passphrase = '';
    this.presetId = DERIVATION_CONFIG.DEFAULT_PRESET_ID;
    this.accountKey = null;
    this.xpub = '';
    this.shownCount = 0;

    this.remaskTimer = null; // zpub 显示态自动回遮蔽定时器

    // zpub 复制（两段式确认：隐私事件不响应误触）
    this.resetZpubCopyBtn = bindTwoStepConfirm(getElement(SELECTORS.ZPUB_COPY_BTN), {
      label: '复制 zpub',
      confirmLabel: '确认复制？',
      onConfirm: async () => {
        const success = await copyToClipboard(this.xpub);
        if (success) {
          Toast.success('zpub 已复制到剪贴板');
        } else {
          Toast.error('复制到剪贴板失败');
        }
      },
    });

    this.init();
  }

  /**
   * 初始化事件监听
   */
  init() {
    // 路径预设切换
    getElement(SELECTORS.PATH_PRESET_GROUP)
      .querySelectorAll('button[data-preset]')
      .forEach((btn) => {
        addEvent(btn, 'click', () => this.handlePresetClick(btn));
      });

    // 显示更多地址
    addEvent(getElement(SELECTORS.SHOW_MORE_ADDRESSES_BTN), 'click', () => this.showMore());

    // zpub 卡片操作
    addEvent(getElement(SELECTORS.ZPUB_REVEAL_BTN), 'click', () => this.toggleZpubMask());
    addEvent(getElement(SELECTORS.ZPUB_QR_BTN), 'click', () => {
      if (!this.xpub) return;
      this.showQr('观察钱包 zpub（扫描导入）', this.xpub);
    });

    // 二维码弹层关闭
    addEvent(getElement(SELECTORS.QR_CLOSE_BTN), 'click', () => this.hideQr());
    addEvent(getElement(`${SELECTORS.QR_MODAL} .qr-modal-backdrop`), 'click', () => this.hideQr());

    // ESC 关闭二维码弹层（与全局 ESC 关闭 Toast 并存）
    addEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape' && getElement(SELECTORS.QR_MODAL).style.display !== 'none') {
        this.hideQr();
      }
    });
  }

  /**
   * 获取当前路径预设配置
   * @returns {Object} 路径预设
   */
  getPreset() {
    return DERIVATION_CONFIG.PATH_PRESETS.find((p) => p.id === this.presetId);
  }

  /**
   * 处理路径预设按钮点击：未派生前仅更新选中态，派生后立即重算
   * @param {Element} btn - 预设按钮
   */
  async handlePresetClick(btn) {
    const presetId = btn.dataset.preset;
    if (!presetId || presetId === this.presetId) return;

    this.presetId = presetId;
    this.updatePresetButtons();

    // 尚未派生过时仅记录选择，等"派生地址"时生效
    if (!this.words) return;

    const btnEl = getElement(SELECTORS.DERIVE_BTN);
    btnEl.disabled = true;
    try {
      await this.derive(this.words, this.passphrase, { silent: true });
    } finally {
      btnEl.disabled = false;
    }
  }

  /**
   * 同步路径预设按钮选中态
   */
  updatePresetButtons() {
    const presetGroup = getElement(SELECTORS.PATH_PRESET_GROUP);
    presetGroup?.querySelectorAll('button[data-preset]').forEach((btn) => {
      const isActive = btn.dataset.preset === this.presetId;
      toggleClass(btn, 'active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  /**
   * 从助记词派生地址与扩展公钥
   * @param {string[]} words - 助记词数组（调用方已完成逐词校验）
   * @param {string} [passphrase] - BIP39 passphrase，无则空串
   * @param {Object} [options]
   * @param {boolean} [options.silent] - 静默模式（预设切换时复用，不弹成功提示）
   * @returns {Promise<boolean>} 是否派生成功
   */
  async derive(words, passphrase = '', { silent = false } = {}) {
    // BIP39 校验和前置：防止对抄错的助记词派生出"看起来正常"的错误地址
    const check = await validateMnemonicChecksum(words);
    if (!check.isValid) {
      this.onError?.('助记词校验和验证失败：单词拼写或顺序可能有误，无法派生地址，请逐词核对。');
      return false;
    }

    try {
      this.words = [...words];
      this.passphrase = passphrase;

      const preset = this.getPreset();
      const seed = await mnemonicToSeed(this.words.join(' '), this.passphrase);
      const { accountKey, xpub } = deriveAccount(seed, preset);

      // 收款链（/0/*）为非加固派生，抹除账户私钥后仅用公钥链即可继续派生地址
      accountKey.wipePrivateData();
      this.accountKey = accountKey;
      this.xpub = xpub;
      this.shownCount = DERIVATION_CONFIG.ADDR_PAGE_SIZE;

      this.renderResult();
      if (!silent) {
        Toast.success('地址派生成功');
      }
      return true;
    } catch (error) {
      Toast.error(`地址派生失败：${error.message}`);
      return false;
    }
  }

  /**
   * 更新路径摘要行（含 passphrase 使用提示，不回显内容）
   */
  updatePathSummary() {
    const preset = this.getPreset();
    const summary = getElement(SELECTORS.OBSERVE_PATH_SUMMARY);
    clearElement(summary);
    summary.appendChild(
      document.createTextNode(`${preset.label} · 路径 ${preset.path} · 收款链 /0 · 已显示 ${this.shownCount} 个地址`),
    );
    if (this.passphrase) {
      const badge = createElement('span', ['passphrase-badge']);
      badge.textContent = '已使用 passphrase';
      summary.appendChild(badge);
    }
  }

  /**
   * 渲染派生结果：路径摘要 + 地址列表 + zpub 导出卡片
   */
  renderResult() {
    this.updatePathSummary();

    // 地址列表
    const list = getElement(SELECTORS.OBSERVE_ADDRESS_LIST);
    clearElement(list);
    for (let i = 0; i < this.shownCount; i++) {
      list.appendChild(this.createAddressRow(i));
    }

    // zpub 卡片：默认遮蔽，重置显示/复制状态
    const zpubText = getElement(SELECTORS.ZPUB_TEXT);
    zpubText.textContent = this.xpub;
    toggleClass(zpubText, CSS_CLASSES.MASKED, true);
    setText(getElement(SELECTORS.ZPUB_REVEAL_BTN), '显示');
    this.resetZpubCopyBtn();
    this.clearRemaskTimer();

    toggleElement(getElement(SELECTORS.OBSERVE_RESULT), true);
  }

  /**
   * 创建单个地址行：序号徽章 + 首/尾高亮的地址 + 复制 + 二维码
   * @param {number} index - 地址序号（收款链 /0 下的序号）
   * @returns {Element} 地址行元素
   */
  createAddressRow(index) {
    const address = deriveAddress(this.accountKey, this.getPreset(), index);
    const edge = DERIVATION_CONFIG.ADDR_EDGE_CHARS;

    const row = createElement('div', ['address-row']);

    const pathBadge = createElement('span', ['address-path']);
    pathBadge.textContent = `0/${index}`;

    const addressEl = createElement('span', ['address-value']);

    // 首 8 位与末 8 位高亮（比对地址时的关键字符），中间淡化
    const head = createElement('span', ['addr-edge']);
    head.textContent = address.slice(0, edge);
    const mid = createElement('span', ['addr-mid']);
    mid.textContent = address.slice(edge, -edge);
    const tail = createElement('span', ['addr-edge']);
    tail.textContent = address.slice(-edge);
    addressEl.append(head, mid, tail);

    const buttons = createElement('div', ['address-buttons']);

    const copyBtn = createElement('button', ['copy-btn', 'btn-sm'], { type: 'button' });
    copyBtn.textContent = '复制';
    addEvent(copyBtn, 'click', async () => {
      // 永远复制完整地址，与展示层的截断/淡化无关
      const success = await copyToClipboard(address);
      if (success) {
        Toast.success('已复制完整地址，粘贴后请核对首尾 8 位');
      } else {
        Toast.error('复制到剪贴板失败');
      }
    });

    const qrBtn = createElement('button', ['download-btn', 'btn-sm'], { type: 'button' });
    qrBtn.textContent = '二维码';
    addEvent(qrBtn, 'click', () => this.showQr(`收款地址 0/${index}`, address));

    buttons.append(copyBtn, qrBtn);
    row.append(pathBadge, addressEl, buttons);

    return row;
  }

  /**
   * 追加显示更多地址
   */
  showMore() {
    if (!this.accountKey) return;

    const list = getElement(SELECTORS.OBSERVE_ADDRESS_LIST);
    const prevCount = this.shownCount;
    this.shownCount += DERIVATION_CONFIG.ADDR_PAGE_SIZE;

    for (let i = prevCount; i < this.shownCount; i++) {
      list.appendChild(this.createAddressRow(i));
    }

    this.updatePathSummary();
  }

  /**
   * 切换 zpub 遮蔽状态；显示态启动自动回遮蔽定时器
   */
  toggleZpubMask() {
    const zpubText = getElement(SELECTORS.ZPUB_TEXT);
    const masked = toggleClass(zpubText, CSS_CLASSES.MASKED);

    setText(getElement(SELECTORS.ZPUB_REVEAL_BTN), masked ? '显示' : '隐藏');
    this.clearRemaskTimer();

    if (!masked) {
      this.remaskTimer = setTimeout(() => this.maskZpub(), DERIVATION_CONFIG.ZPUB_REMASK_DELAY);
    }
  }

  /**
   * 遮蔽 zpub 文本（自动回遮蔽 / 二维码弹层关闭时调用）
   */
  maskZpub() {
    toggleClass(getElement(SELECTORS.ZPUB_TEXT), CSS_CLASSES.MASKED, true);
    setText(getElement(SELECTORS.ZPUB_REVEAL_BTN), '显示');
    this.clearRemaskTimer();
  }

  /**
   * 清除自动回遮蔽定时器
   */
  clearRemaskTimer() {
    clearTimeout(this.remaskTimer);
    this.remaskTimer = null;
  }

  /**
   * 显示二维码弹层
   * 注意：弹层打开期间不做任何定时遮蔽，避免扫码进行到一半内容被糊掉；
   * 关闭弹层时统一回遮蔽 zpub
   * @param {string} title - 弹层标题
   * @param {string} value - 二维码内容
   */
  async showQr(title, value) {
    setText(getElement(SELECTORS.QR_MODAL_TITLE), title);

    const canvas = getElement(SELECTORS.QR_CANVAS);
    try {
      await QRCode.toCanvas(canvas, value, {
        width: 280,
        margin: 4,
        color: { dark: '#1a1a1a', light: '#ffffff' },
      });
    } catch (error) {
      Toast.error(`二维码生成失败：${error.message}`);
      return;
    }

    toggleElement(getElement(SELECTORS.QR_MODAL), true);
  }

  /**
   * 关闭二维码弹层并立即回遮蔽 zpub
   */
  hideQr() {
    toggleElement(getElement(SELECTORS.QR_MODAL), false);
    this.maskZpub();
  }

  /**
   * 清空观察模式全部状态与结果（页脚"擦除所有数据"使用）
   */
  clearAll() {
    this.words = null;
    this.passphrase = '';
    this.accountKey = null;
    this.xpub = '';
    this.shownCount = 0;

    this.clearRemaskTimer();
    this.resetZpubCopyBtn();

    toggleElement(getElement(SELECTORS.OBSERVE_RESULT), false);
    clearElement(getElement(SELECTORS.OBSERVE_ADDRESS_LIST));
    clearElement(getElement(SELECTORS.OBSERVE_PATH_SUMMARY));
    clearElement(getElement(SELECTORS.ZPUB_TEXT));
    setText(getElement(SELECTORS.ZPUB_REVEAL_BTN), '显示');

    this.hideQr();
  }
}
