/**
 * 分片管理组件
 * 负责分片生成、显示、复制和下载功能
 * 瞬态消息统一走 Toast；恢复结果内联展示并带复制/隐藏/擦除保护
 */

import { split, combine } from 'shamir-secret-sharing';
import { getElement, createElement, toggleElement, toggleClass, clearElement, addEvent } from '../utils/dom.js';
import { copyToClipboard, downloadFile, formatDateTime, base64ToBytes } from '../utils/helpers.js';
import { validateMnemonicChecksum } from '../utils/validation.js';
import { encryptWithPassword, decryptWithPassword, validatePasswordStrength, validatePasswordMatch } from '../utils/encryption.js';
import { SELECTORS, CSS_CLASSES } from '../constants/index.js';
import { Toast } from './Toast.js';
import { ShardVisualizer } from './ShardVisualizer.js';

export class ShareManager {
  /**
   * @param {Object} [options]
   * @param {Function} [options.onWordError] - 助记词相关的校验错误回调（展示在输入状态条上）
   */
  constructor(options = {}) {
    this.onWordError = options.onWordError;
    this.onWipeRecovery = null; // 由 main 注入：恢复结果擦除时清理恢复侧输入
    this.currentShares = [];
    this.currentThreshold = 0;
    this.copiedShares = new Set(); // 跟踪已复制的分片索引
    this.downloadedShares = new Set(); // 跟踪已下载的分片索引
    this.isEncryptionEnabled = false; // 加密是否启用
    this.encryptionPassword = ''; // 加密密码
  }

  /**
   * 初始化加密相关事件监听器
   */
  initEncryptionListeners() {
    const enableEncryptionCheckbox = getElement(SELECTORS.ENABLE_ENCRYPTION);
    const encryptionFields = getElement(SELECTORS.ENCRYPTION_FIELDS);

    // 加密选项切换
    addEvent(enableEncryptionCheckbox, 'change', () => {
      this.isEncryptionEnabled = enableEncryptionCheckbox.checked;
      toggleElement(encryptionFields, this.isEncryptionEnabled);

      // 如果禁用加密，清空密码字段
      if (!this.isEncryptionEnabled) {
        this.clearEncryptionFields();
      }

      // 结果已展示时同步卡片徽章与复制按钮的可用性
      this.refreshSharesView();
    });

    // 密码强度验证
    const encryptionPassword = getElement(SELECTORS.ENCRYPTION_PASSWORD);
    const passwordStrength = getElement(SELECTORS.PASSWORD_STRENGTH);
    addEvent(encryptionPassword, 'input', () => {
      const password = encryptionPassword.value;
      if (password) {
        const validation = validatePasswordStrength(password);
        passwordStrength.textContent = validation.message;
        passwordStrength.className = `password-strength ${validation.strength}`;
      } else {
        passwordStrength.textContent = '';
      }

      // 检查密码匹配
      this.checkPasswordMatch();
    });

    // 确认密码验证
    const confirmPassword = getElement(SELECTORS.CONFIRM_PASSWORD);
    addEvent(confirmPassword, 'input', () => {
      this.checkPasswordMatch();
    });
  }

  /**
   * 检查密码匹配
   */
  checkPasswordMatch() {
    const password = getElement(SELECTORS.ENCRYPTION_PASSWORD).value;
    const confirm = getElement(SELECTORS.CONFIRM_PASSWORD).value;
    const passwordMatch = getElement(SELECTORS.PASSWORD_MATCH);

    if (confirm) {
      const validation = validatePasswordMatch(password, confirm);
      passwordMatch.textContent = validation.message;
      passwordMatch.className = `password-match ${validation.isValid ? 'valid' : 'invalid'}`;
    } else {
      passwordMatch.textContent = '';
    }
  }

  /**
   * 验证加密设置
   * @returns {Object} 验证结果
   */
  validateEncryptionSettings() {
    if (!this.isEncryptionEnabled) {
      return { isValid: true };
    }

    const password = getElement(SELECTORS.ENCRYPTION_PASSWORD).value;
    const confirm = getElement(SELECTORS.CONFIRM_PASSWORD).value;

    // 验证密码强度
    const strengthValidation = validatePasswordStrength(password);
    if (strengthValidation.strength === 'weak') {
      return { isValid: false, error: '密码过于简单，请使用至少8个字符，包含字母、数字和符号的组合' };
    }

    // 验证密码匹配
    const matchValidation = validatePasswordMatch(password, confirm);
    if (!matchValidation.isValid) {
      return { isValid: false, error: '两次输入的密码不匹配' };
    }

    this.encryptionPassword = password;
    return { isValid: true };
  }

  /**
   * 清空导出侧的密码输入与反馈
   */
  clearEncryptionFields() {
    getElement(SELECTORS.ENCRYPTION_PASSWORD).value = '';
    getElement(SELECTORS.CONFIRM_PASSWORD).value = '';
    getElement(SELECTORS.PASSWORD_STRENGTH).textContent = '';
    getElement(SELECTORS.PASSWORD_MATCH).textContent = '';
    this.encryptionPassword = '';
  }

  /**
   * 清除内存中的加密密码（安全清理）
   */
  clearEncryptionPassword() {
    this.encryptionPassword = '';
  }

  /**
   * 生成分片
   * @param {string[]} words - 助记词数组（调用方已完成逐词校验）
   * @param {number} totalShares - 总分片数
   * @param {number} threshold - 恢复所需分片数
   * @returns {Promise<boolean>} 是否生成成功
   */
  async generateShares(words, totalShares, threshold) {
    try {
      // 验证 BIP39 校验和，防止拼写/顺序错误的助记词被静默分片
      const checksum = await validateMnemonicChecksum(words);
      if (!checksum.isValid) {
        this.onWordError?.('助记词校验和验证失败：单词拼写或顺序可能有误，请逐词核对后再生成分片。');
        return false;
      }

      // 验证加密设置
      const encryptionValidation = this.validateEncryptionSettings();
      if (!encryptionValidation.isValid) {
        Toast.error(encryptionValidation.error);
        return false;
      }

      // 生成分片（保持 v1 格式，兼容标准 GPG 工具与既有分片）
      const mnemonic = words.join(' ');
      const secretBytes = new TextEncoder().encode(mnemonic);
      const rawShares = await split(secretBytes, totalShares, threshold);

      // 转换为 Base64 格式
      this.currentShares = rawShares.map((share, index) => {
        const shareData = {
          index: index + 1,
          threshold: threshold,
          total: totalShares,
          data: btoa(String.fromCharCode(...share)),
        };
        return btoa(JSON.stringify(shareData));
      });

      this.currentThreshold = threshold;

      // 重置复制状态
      this.copiedShares.clear();
      this.downloadedShares.clear();

      // 显示分片
      this.displayShares();
      Toast.success('分片生成成功！请安全保存这些分片。');
      return true;
    } catch (error) {
      Toast.error(`生成分片失败：${error.message}`);
      return false;
    }
  }

  /**
   * 显示分片
   */
  displayShares() {
    const resultDiv = getElement(SELECTORS.SHARES_RESULT);
    const sharesList = getElement(SELECTORS.SHARES_LIST);

    clearElement(sharesList);

    this.currentShares.forEach((share, index) => {
      const shareItem = this.createShareItem(share, index + 1);
      sharesList.appendChild(shareItem);
    });

    toggleElement(resultDiv, true);
    this.updateSummary();
  }

  /**
   * 加密开关变化后同步已展示的分片卡片
   */
  refreshSharesView() {
    const resultDiv = getElement(SELECTORS.SHARES_RESULT);
    if (this.currentShares.length === 0 || resultDiv.style.display === 'none') return;

    this.displayShares();
  }

  /**
   * 更新分片汇总行
   */
  updateSummary() {
    getElement(SELECTORS.COPIED_COUNT).textContent = String(this.copiedShares.size);
    getElement(SELECTORS.DOWNLOADED_COUNT).textContent = String(this.downloadedShares.size);
    getElement(SELECTORS.TOTAL_COUNT).textContent = String(this.currentShares.length);
    getElement(SELECTORS.THRESHOLD_DISPLAY).textContent = String(this.currentThreshold);
  }

  /**
   * 创建分片项
   * @param {string} share - 分片内容
   * @param {number} index - 分片索引
   * @returns {Element} 分片项元素
   */
  createShareItem(share, index) {
    const total = this.currentShares.length;
    const shareItem = createElement('div', ['share-item']);

    const header = createElement('div', ['share-header']);

    const titleGroup = createElement('div', ['share-title-group']);
    titleGroup.appendChild(ShardVisualizer.mini(index, total));

    const title = createElement('div', ['share-title']);
    title.textContent = `分片 ${index}`;
    titleGroup.appendChild(title);

    // 加密模式：显示锁徽章，且不提供复制入口（避免"以为复制的是密文实际是明文"的陷阱）
    if (this.isEncryptionEnabled) {
      const badge = createElement('span', ['share-badge']);
      badge.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>';
      badge.appendChild(document.createTextNode('已加密'));
      titleGroup.appendChild(badge);
    }

    const buttons = createElement('div', ['share-buttons']);

    if (!this.isEncryptionEnabled) {
      const copyBtn = createElement('button', ['copy-btn', 'btn-sm'], { type: 'button' });

      // 检查这个分片是否已经被复制过
      if (this.copiedShares.has(index)) {
        copyBtn.textContent = '已复制';
        toggleClass(copyBtn, CSS_CLASSES.COPIED, true);
      } else {
        copyBtn.textContent = '复制';
      }

      addEvent(copyBtn, 'click', () => this.copyShare(copyBtn, share, index));
      buttons.appendChild(copyBtn);
    }

    const downloadBtn = createElement('button', ['download-btn', 'btn-sm'], { type: 'button' });
    downloadBtn.textContent = this.downloadedShares.has(index) ? '已下载' : '下载';
    addEvent(downloadBtn, 'click', () => this.downloadShare(share, index, downloadBtn));
    buttons.appendChild(downloadBtn);

    header.appendChild(titleGroup);
    header.appendChild(buttons);

    const content = createElement('div', ['share-content', 'is-collapsed']);
    content.textContent = share;
    content.title = '点击展开或收起';

    const expandBtn = createElement('button', ['text-btn', 'share-expand'], { type: 'button' });
    expandBtn.textContent = '展开完整内容';

    const toggleCollapse = () => {
      const collapsed = toggleClass(content, 'is-collapsed');
      expandBtn.textContent = collapsed ? '展开完整内容' : '收起';
    };

    addEvent(content, 'click', toggleCollapse);
    addEvent(expandBtn, 'click', toggleCollapse);

    shareItem.append(header, content, expandBtn);

    return shareItem;
  }

  /**
   * 复制分片
   * @param {Element} button - 复制按钮
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   */
  async copyShare(button, shareContent, shareIndex) {
    const success = await copyToClipboard(shareContent);

    if (success) {
      // 永久标记这个分片为已复制
      this.copiedShares.add(shareIndex);

      button.textContent = '已复制';
      toggleClass(button, CSS_CLASSES.COPIED, true);
      this.updateSummary();
    } else {
      Toast.error('复制到剪贴板失败');
    }
  }

  /**
   * 下载分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   * @param {Element} button - 下载按钮
   */
  async downloadShare(shareContent, shareIndex, button) {
    try {
      let success;
      if (this.isEncryptionEnabled) {
        const encryptionValidation = this.validateEncryptionSettings();
        if (!encryptionValidation.isValid) {
          Toast.error(encryptionValidation.error);
          return;
        }
        success = await this.downloadEncryptedShare(shareContent, shareIndex);
      } else {
        success = this.downloadStandardShare(shareContent, shareIndex);
      }

      if (success) {
        this.downloadedShares.add(shareIndex);
        button.textContent = '已下载';
        this.updateSummary();
      }
    } catch (error) {
      Toast.error('下载失败，请重试：' + error.message);
    }
  }

  /**
   * 下载加密分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   * @returns {Promise<boolean>} 是否下载成功
   */
  async downloadEncryptedShare(shareContent, shareIndex) {
    Toast.info(`正在加密分片 ${shareIndex}...`);

    try {
      const encryptedContent = await encryptWithPassword(shareContent, this.encryptionPassword);
      const success = downloadFile(encryptedContent, `分片${shareIndex}.txt.gpg`);

      if (success) {
        Toast.success(`加密分片 ${shareIndex} 已下载`);
      } else {
        Toast.error('下载失败，请重试');
      }

      return success;
    } finally {
      // 加密结束后立即清除内存中的密码
      this.clearEncryptionPassword();
    }
  }

  /**
   * 下载标准分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   * @returns {boolean} 是否下载成功
   */
  downloadStandardShare(shareContent, shareIndex) {
    // 标准格式，包含应用信息和安全提示
    const fileContent = [
      `MnemonicShards 分片 ${shareIndex}`,
      '='.repeat(50),
      '',
      '分片内容:',
      shareContent,
      '',
      '='.repeat(50),
      `生成时间: ${formatDateTime()}`,
      '',
      '安全提示:',
      '- 请将此文件保存在安全的位置',
      '- 不要将分片分享给不信任的人',
      '- 任意指定数量的分片即可恢复原始助记词',
    ].join('\n');

    const success = downloadFile(fileContent, `分片${shareIndex}.txt`);
    if (success) {
      Toast.success(`分片 ${shareIndex} 已下载`);
    } else {
      Toast.error('下载失败，请重试');
    }

    return success;
  }

  /**
   * 从分片对象数组恢复助记词并验证结果
   * Shamir 库不校验重建结果的完整性，必须由调用方验证 BIP39 校验和，
   * 否则损坏或抄录错误的分片会静默产出错误助记词
   * @param {Object[]} shareDataList - 解析后的分片对象数组（数量已达到阈值）
   * @returns {Promise<string>} 验证通过的助记词
   * @throws {Error} 恢复结果未通过 BIP39 验证
   */
  async recoverFromShareData(shareDataList) {
    const dataShares = shareDataList.map((s) => base64ToBytes(s.data));
    const mnemonic = new TextDecoder().decode(await combine(dataShares));

    const words = mnemonic.trim().split(/\s+/).filter(Boolean);
    const check = await validateMnemonicChecksum(words);
    if (!check.isValid) {
      throw new Error(this.getRecoveryValidationMessage(check));
    }

    return mnemonic;
  }

  /**
   * 构造恢复校验失败的错误消息
   * @param {Object} check - validateMnemonicChecksum 的返回值
   * @returns {string} 错误消息
   */
  getRecoveryValidationMessage(check) {
    switch (check.reason) {
      case 'count':
        return `恢复失败：还原结果为 ${check.count} 个单词，不是有效的 BIP39 助记词长度。`;
      case 'word': {
        // 分片损坏时还原结果可能是二进制乱码，过滤不可见字符并截断后再回显
        const raw = String(check.word ?? '');
        const visible = raw.replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '');
        if (!visible) {
          return '恢复失败：还原结果包含无法识别的内容，分片可能已损坏或不属于同一组分片。';
        }
        const shown = visible.length > 32 ? `${visible.slice(0, 32)}…` : visible;
        return `恢复失败：还原结果包含不在 BIP39 词表中的单词："${shown}"。`;
      }
      case 'checksum':
      default:
        return '恢复失败：还原结果未通过 BIP39 校验和验证。分片可能已损坏、抄录有误或不属于同一组助记词。';
    }
  }

  /**
   * 统一设置恢复按钮忙碌状态
   * @param {boolean} busy - 是否忙碌
   */
  setRecoverBtnBusy(busy) {
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    recoverBtn.disabled = busy;
    recoverBtn.textContent = busy ? '正在恢复...' : '恢复助记词';
  }

  /**
   * 使用分片数据恢复助记词
   * @param {Object[]} shares - 已解析的分片对象数组
   * @returns {Promise<boolean>} 是否恢复成功
   */
  async recoverMnemonicWithShares(shares) {
    this.setRecoverBtnBusy(true);

    try {
      const shareDataList = shares.filter((s) => s?.threshold && s.index !== undefined && s.data);

      if (shareDataList.length === 0) {
        throw new Error('没有找到有效的分片数据');
      }

      const threshold = shareDataList[0].threshold;
      if (shareDataList.length < threshold) {
        throw new Error(`分片数量不足。至少需要 ${threshold} 个分片，但只提供了 ${shareDataList.length} 个。`);
      }

      const recoveredMnemonic = await this.recoverFromShareData(shareDataList.slice(0, threshold));

      this.displayRecoverResult(recoveredMnemonic, shareDataList.length, threshold);
      return true;
    } catch (error) {
      this.displayRecoverError(error.message);
      return false;
    } finally {
      this.setRecoverBtnBusy(false);
    }
  }

  /**
   * 显示恢复结果（带复制 / 隐藏 / 擦除保护）
   * @param {string} mnemonic - 恢复的助记词
   * @param {number} usedShares - 使用的分片数
   * @param {number} threshold - 所需分片数
   */
  displayRecoverResult(mnemonic, usedShares, threshold) {
    const resultDiv = this.getActiveRecoverResultDiv();

    clearElement(resultDiv);

    // 创建安全的DOM结构，防止XSS攻击：
    // 恢复结果完全由输入分片决定（攻击者可控），必须用 textContent 渲染，禁止拼 HTML
    const card = createElement('div', ['recover-card']);

    const title = createElement('div', ['recover-card-title']);
    title.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>';
    title.appendChild(document.createTextNode('恢复成功'));

    const meta = createElement('div', ['recover-card-meta']);
    meta.textContent = `使用 ${usedShares} 个分片（需要 ${threshold} 个） · ${formatDateTime()}`;

    const mnemonicDiv = createElement('div', ['recovered-mnemonic']);
    mnemonic
      .trim()
      .split(/\s+/)
      .forEach((word, index, words) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = word;
        mnemonicDiv.appendChild(wordSpan);
        if (index < words.length - 1) {
          mnemonicDiv.appendChild(document.createTextNode(' '));
        }
      });

    const actions = createElement('div', ['recover-card-actions']);

    const copyBtn = createElement('button', ['btn', 'btn-primary', 'btn-sm'], { type: 'button' });
    copyBtn.textContent = '复制助记词';
    addEvent(copyBtn, 'click', async () => {
      const success = await copyToClipboard(mnemonic);
      if (success) {
        Toast.success('助记词已复制到剪贴板');
      } else {
        Toast.error('复制到剪贴板失败');
      }
    });

    const maskBtn = createElement('button', ['btn', 'btn-secondary', 'btn-sm'], { type: 'button' });
    maskBtn.textContent = '隐藏';
    addEvent(maskBtn, 'click', () => {
      const masked = toggleClass(mnemonicDiv, 'is-masked');
      maskBtn.textContent = masked ? '显示' : '隐藏';
    });

    const wipeBtn = createElement('button', ['btn', 'btn-danger-outline', 'btn-sm'], { type: 'button' });
    wipeBtn.textContent = '擦除';
    addEvent(wipeBtn, 'click', () => {
      clearElement(resultDiv);
      this.onWipeRecovery?.();
      Toast.info('已擦除恢复数据');
    });

    actions.append(copyBtn, maskBtn, wipeBtn);

    const hint = createElement('div', ['recover-card-hint']);
    hint.textContent = '请勿截屏或录屏；助记词已恢复，建议立即转存到安全位置并擦除本页内容。';

    card.append(title, meta, mnemonicDiv, actions, hint);
    resultDiv.appendChild(card);
  }

  /**
   * 显示恢复错误
   * @param {string} errorMessage - 错误消息
   */
  displayRecoverError(errorMessage) {
    const resultDiv = this.getActiveRecoverResultDiv();

    clearElement(resultDiv);

    // 创建安全的DOM结构，防止XSS攻击
    const card = createElement('div', ['recover-card', 'is-error']);

    const title = createElement('div', ['recover-card-title']);
    title.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-warning"/></svg>';
    title.appendChild(document.createTextNode('恢复失败'));

    const text = createElement('span', ['recover-card-error-text']);
    text.textContent = errorMessage;

    const hint = createElement('span', ['recover-card-error-hint']);
    hint.textContent = '请检查分片格式是否正确，确保每行一个完整的分片。';

    card.append(title, text, hint);
    resultDiv.appendChild(card);
  }

  /**
   * 根据当前活动 Tab 选择结果展示区域
   * @returns {Element} 结果容器
   */
  getActiveRecoverResultDiv() {
    const activeTabBtn = getElement('.tab-btn.active');
    const selector =
      activeTabBtn?.id === 'uploadTabBtn' ? SELECTORS.UPLOAD_RECOVER_RESULT : SELECTORS.PASTE_RECOVER_RESULT;
    return getElement(selector);
  }

  /**
   * 清空分片结果区域（页脚"擦除所有数据"使用）
   */
  clearResults() {
    this.currentShares = [];
    this.currentThreshold = 0;
    this.copiedShares.clear();
    this.downloadedShares.clear();
    this.clearEncryptionFields();

    toggleElement(getElement(SELECTORS.SHARES_RESULT), false);
    clearElement(getElement(SELECTORS.SHARES_LIST));
  }
}
