/**
 * 分片管理组件
 * 负责分片生成、显示、复制和下载功能
 * 瞬态消息统一走 Toast；恢复结果内联展示并带复制/隐藏/擦除保护
 */

import { split, combine } from 'shamir-secret-sharing';
import { getElement, createElement, toggleElement, toggleClass, clearElement, addEvent } from '../utils/dom.js';
import {
  copyToClipboard,
  copySensitiveToClipboard,
  generateStrongPassword,
  downloadFile,
  formatDateTime,
  base64ToBytes,
} from '../utils/helpers.js';
import { validateMnemonicChecksum } from '../utils/validation.js';
import { computeMnemonicFingerprint, computeShareChecksum } from '../utils/integrity.js';
import { encryptWithPassword, decryptWithPassword, validatePasswordStrength, validatePasswordMatch } from '../utils/encryption.js';
import { SELECTORS, CSS_CLASSES, ENCRYPTION_CONFIG } from '../constants/index.js';
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
    this.currentFingerprint = ''; // 助记词指纹（仅展示/比对用，不写入分片）
    this.copiedShares = new Set(); // 跟踪已复制的分片索引
    this.downloadedShares = new Set(); // 跟踪已下载的分片索引
    this.isEncryptionEnabled = false; // 加密是否启用
    this.encryptionPassword = ''; // 加密密码
  }

  /**
   * 初始化助记词指纹行（静态元素，按钮事件只绑定一次）
   */
  initFingerprintRow() {
    const copyBtn = getElement(SELECTORS.FINGERPRINT_COPY_BTN);
    addEvent(copyBtn, 'click', async () => {
      if (!this.currentFingerprint) return;
      const success = await copyToClipboard(this.formatFingerprint(this.currentFingerprint));
      if (success) {
        Toast.success('指纹已复制到剪贴板');
      } else {
        Toast.error('复制到剪贴板失败');
      }
    });
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

    // 生成强密码：密码学随机，同时填入密码与确认框并触发强度/匹配反馈
    addEvent(getElement(SELECTORS.GENERATE_PASSWORD_BTN), 'click', () => {
      const password = generateStrongPassword(ENCRYPTION_CONFIG.GENERATED_PASSWORD_LENGTH);
      const passwordInput = getElement(SELECTORS.ENCRYPTION_PASSWORD);
      passwordInput.value = password;
      getElement(SELECTORS.CONFIRM_PASSWORD).value = password;
      passwordInput.dispatchEvent(new Event('input'));
      Toast.info(`已生成 ${ENCRYPTION_CONFIG.GENERATED_PASSWORD_LENGTH} 位强密码，请立即抄写到与分片分开保管的位置`);
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

    // 长度硬下限：加密分片文件可被离线暴力破解，8 位常规标准在此场景不够
    if (password.length < ENCRYPTION_CONFIG.MIN_PASSWORD_LENGTH) {
      return {
        isValid: false,
        error: `加密密码至少需要 ${ENCRYPTION_CONFIG.MIN_PASSWORD_LENGTH} 位字符（分片文件泄露后将面临离线暴力破解，建议用「生成强密码」按钮）`,
      };
    }

    // 验证密码强度
    const strengthValidation = validatePasswordStrength(password);
    if (strengthValidation.strength === 'weak') {
      return { isValid: false, error: '密码过于简单，请使用大小写字母、数字和符号的组合，或直接用「生成强密码」按钮' };
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

      // 生成分片（v1.2 格式：分片 JSON 内嵌可选校验码字段，兼容标准 GPG 工具与旧格式分片）
      // 先归一化（小写、单空格）再分片：与校验和/指纹的归一化基准一致，
      // 保证同一助记词无论输入大小写如何，分片内容字节稳定可复现
      const mnemonic = words.map((word) => word.trim().toLowerCase()).join(' ');
      const secretBytes = new TextEncoder().encode(mnemonic);
      const rawShares = await split(secretBytes, totalShares, threshold);

      // 助记词指纹：展示给用户抄写保管（与分片分开存放），不写入任何分片
      this.currentFingerprint = computeMnemonicFingerprint(mnemonic);

      // 转换为 Base64 格式，分片行与其校验码一并持有（渲染/下载时无需回头再解析）
      this.currentShares = rawShares.map((share, index) => {
        const shareData = {
          index: index + 1,
          threshold: threshold,
          total: totalShares,
          data: btoa(String.fromCharCode(...share)),
        };
        // 分片校验码（v1.2+ 可选字段）：data 解码字节的 SHA-256 前 5 字节的
        // Crockford Base32 编码。仅供人工核对与恢复时定位损坏分片，恢复算法不使用它
        shareData.checksum = computeShareChecksum(shareData);
        return { share: btoa(JSON.stringify(shareData)), checksum: shareData.checksum };
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
    this.updateFingerprintRow();
    this.updateSummary();
  }

  /**
   * 显示/更新助记词指纹行（提示用户抄写保管，与分片分开存放）
   */
  updateFingerprintRow() {
    const row = getElement(SELECTORS.FINGERPRINT_ROW);
    const value = getElement(SELECTORS.FINGERPRINT_VALUE);

    if (!this.currentFingerprint) {
      toggleElement(row, false);
      return;
    }

    value.textContent = this.formatFingerprint(this.currentFingerprint);
    toggleElement(row, true);
  }

  /**
   * 指纹展示格式：4+4 分组便于抄写，如 "F3A1 9C2B"
   * @param {string} hex - 8 位大写十六进制指纹
   * @returns {string}
   */
  formatFingerprint(hex) {
    return `${hex.slice(0, 4)} ${hex.slice(4)}`;
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
   * @param {Object} share - 分片对象 { share: 分片内容行, checksum: 分片校验码 }
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

    // 分片校验码徽章：提示用户核对抄录内容（v1.2+ 分片携带 checksum 字段）
    const checksumBadge = createElement('span', ['share-badge', 'share-badge-checksum']);
    checksumBadge.textContent = `校验码 ${share.checksum}`;
    checksumBadge.title = '分片校验码：人工核对分片是否抄录/损坏用；恢复输入时会自动逐张校验并定位坏片';
    titleGroup.appendChild(checksumBadge);

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

      addEvent(copyBtn, 'click', () => this.copyShare(copyBtn, share.share, index));
      buttons.appendChild(copyBtn);
    }

    const downloadBtn = createElement('button', ['download-btn', 'btn-sm'], { type: 'button' });
    downloadBtn.textContent = this.downloadedShares.has(index) ? '已下载' : '下载';
    addEvent(downloadBtn, 'click', () => this.downloadShare(share.share, index, downloadBtn, share.checksum));
    buttons.appendChild(downloadBtn);

    header.appendChild(titleGroup);
    header.appendChild(buttons);

    const content = createElement('div', ['share-content', 'is-collapsed']);
    content.textContent = share.share;
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
    // 明文分片是助记词的秘密共享分量，按敏感内容处理：复制后自动清除剪贴板
    const success = await copySensitiveToClipboard(shareContent);

    if (success) {
      // 永久标记这个分片为已复制
      this.copiedShares.add(shareIndex);

      button.textContent = '已复制';
      toggleClass(button, CSS_CLASSES.COPIED, true);
      this.updateSummary();
      Toast.info('分片已复制，60 秒后自动清除剪贴板');
    } else {
      Toast.error('复制到剪贴板失败');
    }
  }

  /**
   * 下载分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   * @param {Element} button - 下载按钮
   * @param {string} checksum - 分片校验码
   */
  async downloadShare(shareContent, shareIndex, button, checksum) {
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
        success = this.downloadStandardShare(shareContent, shareIndex, checksum);
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
   * @param {string} checksum - 分片校验码
   * @returns {boolean} 是否下载成功
   */
  downloadStandardShare(shareContent, shareIndex, checksum) {
    // 标准格式，包含应用信息和安全提示
    const fileContent = [
      `MnemonicShards 分片 ${shareIndex}`,
      '='.repeat(50),
      '',
      '分片内容:',
      shareContent,
      '',
      `分片校验码: ${checksum}（人工核对用；恢复输入时工具会自动校验并定位损坏分片）`,
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
   * 分片级校验码（v1.2+）不符的分片会被点名：富余分片足够时自动跳过并提示，
   * 否则恢复失败并列出坏片，避免带病合并产出无意义结果
   * @param {Object[]} shares - 已解析的分片对象数组
   * @param {Object} [options]
   * @param {boolean} [options.drillMode] - 演练模式：全程不渲染助记词明文，只输出指纹比对结论
   * @param {string|null} [options.drillFingerprint] - 演练模式预期指纹（归一化 8 位 hex）；
   *   为 null 时仅验证分片可完整合并并通过 BIP39 校验和（不比对身份）
   * @returns {Promise<boolean>} 是否恢复成功（演练模式下指纹一致才算成功）
   */
  async recoverMnemonicWithShares(shares, { drillMode = false, drillFingerprint = null } = {}) {
    this.setRecoverBtnBusy(true);

    try {
      if (shares.length === 0) {
        throw new Error('没有找到有效的分片数据');
      }

      // 校验码不符的分片单独分区：Shamir 单片无法自证，校验码是唯一的坏片信号
      const badShares = shares.filter((s) => s.checksumOk === false);
      const goodShares = shares.filter((s) => s.checksumOk !== false);
      const skippedBadIndices = badShares.map((s) => s.index);

      const threshold = shares[0].threshold;
      if (goodShares.length < threshold) {
        if (badShares.length > 0) {
          throw new Error(
            `恢复失败：分片 ${this.formatShareIndices(skippedBadIndices)} 校验码不匹配（可能抄录有误或已损坏），` +
              `剩余有效分片不足以恢复（需要 ${threshold} 个，有效 ${goodShares.length} 个）。` +
              '请重新核对上述分片的抄录，或换用其他分片。',
          );
        }
        throw new Error(`分片数量不足。至少需要 ${threshold} 个分片，但只提供了 ${shares.length} 个。`);
      }

      const recoveredMnemonic = await this.recoverFromShareData(goodShares.slice(0, threshold));

      if (drillMode) {
        // 演练模式：只比对指纹，任何情况下不渲染助记词明文
        const actualFingerprint = computeMnemonicFingerprint(recoveredMnemonic);
        const fingerprintChecked = Boolean(drillFingerprint);
        const matched = !fingerprintChecked || actualFingerprint === drillFingerprint;
        this.displayDrillRecoverResult({
          matched,
          fingerprintChecked,
          expectedFingerprint: drillFingerprint,
          actualFingerprint,
          usedShares: threshold,
          threshold,
          skippedBadIndices,
        });
        return matched;
      }

      this.displayRecoverResult(recoveredMnemonic, shares.length, threshold, skippedBadIndices);
      return true;
    } catch (error) {
      this.displayRecoverError(error.message);
      return false;
    } finally {
      this.setRecoverBtnBusy(false);
    }
  }

  /**
   * 分片序号列表格式化为 "#3、#5"
   * @param {number[]} indices - 分片序号数组
   * @returns {string}
   */
  formatShareIndices(indices) {
    return indices.map((i) => `#${i}`).join('、');
  }

  /**
   * 显示恢复结果（带复制 / 隐藏 / 擦除保护）
   * @param {string} mnemonic - 恢复的助记词
   * @param {number} usedShares - 使用的分片数
   * @param {number} threshold - 所需分片数
   * @param {number[]} [skippedBadIndices] - 因校验码不符被跳过的分片序号
   */
  displayRecoverResult(mnemonic, usedShares, threshold, skippedBadIndices = []) {
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

    card.append(title, meta);

    if (skippedBadIndices.length > 0) {
      const skipWarn = createElement('div', ['recover-card-warning']);
      skipWarn.textContent = `已跳过校验码不符的分片：${this.formatShareIndices(skippedBadIndices)}，请重新核对这些分片的抄录`;
      card.append(skipWarn);
    }

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
      // 敏感内容复制：60 秒后自动清除剪贴板（期间复制过其他内容则不动）
      const success = await copySensitiveToClipboard(mnemonic);
      if (success) {
        Toast.success('助记词已复制，60 秒后自动清除剪贴板');
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

    card.append(mnemonicDiv, actions, hint);
    resultDiv.appendChild(card);
  }

  /**
   * 显示演练模式结果（只输出指纹比对结论，助记词明文不进入 DOM）
   * @param {Object} outcome
   * @param {boolean} outcome.matched - 是否通过（提供了指纹时指纹一致，未提供时校验和通过）
   * @param {boolean} outcome.fingerprintChecked - 是否进行了指纹比对
   * @param {string} outcome.expectedFingerprint - 预期指纹（8 位 hex，未比对时为 null）
   * @param {string} outcome.actualFingerprint - 恢复结果的实际指纹
   * @param {number} outcome.usedShares - 实际合并使用的分片数
   * @param {number} outcome.threshold - 所需分片数
   * @param {number[]} outcome.skippedBadIndices - 因校验码不符被跳过的分片序号
   */
  displayDrillRecoverResult({
    matched,
    fingerprintChecked,
    expectedFingerprint,
    actualFingerprint,
    usedShares,
    threshold,
    skippedBadIndices,
  }) {
    const resultDiv = this.getActiveRecoverResultDiv();

    clearElement(resultDiv);

    const card = createElement('div', ['recover-card', matched ? null : 'is-error']);

    const title = createElement('div', ['recover-card-title']);
    title.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${matched ? 'i-check' : 'i-warning'}"/></svg>`;
    title.appendChild(
      document.createTextNode(matched ? (fingerprintChecked ? '演练通过 · 指纹一致' : '演练通过 · 未比对指纹') : '指纹不一致'),
    );

    const meta = createElement('div', ['recover-card-meta']);
    meta.textContent = `使用 ${usedShares} 个分片（需要 ${threshold} 个） · ${formatDateTime()}`;

    card.append(title, meta);

    if (skippedBadIndices.length > 0) {
      const skipWarn = createElement('div', ['recover-card-warning']);
      skipWarn.textContent = `已跳过校验码不符的分片：${this.formatShareIndices(skippedBadIndices)}，请重新核对这些分片的抄录`;
      card.append(skipWarn);
    }

    const fingerprintDiv = createElement('div', ['recover-card-fingerprint', 'mono']);
    fingerprintDiv.textContent = !fingerprintChecked
      ? `未提供预期指纹，仅验证分片可完整恢复（助记词未显示）。本次恢复结果的指纹：${this.formatFingerprint(actualFingerprint)}`
      : matched
        ? `✓ ${this.formatFingerprint(actualFingerprint)} 与预期指纹一致`
        : `实际 ${this.formatFingerprint(actualFingerprint)} ≠ 预期 ${this.formatFingerprint(expectedFingerprint)}`;
    card.append(fingerprintDiv);

    const actions = createElement('div', ['recover-card-actions']);

    const wipeBtn = createElement('button', ['btn', 'btn-danger-outline', 'btn-sm'], { type: 'button' });
    wipeBtn.textContent = '擦除';
    addEvent(wipeBtn, 'click', () => {
      clearElement(resultDiv);
      this.onWipeRecovery?.();
      Toast.info('已擦除演练数据');
    });

    actions.appendChild(wipeBtn);
    card.append(actions);

    const hint = createElement('div', ['recover-card-hint']);
    if (!fingerprintChecked) {
      hint.textContent =
        '备份可完整恢复、结果合法。若这份分片尚未建立指纹（旧版生成），请把上方指纹抄写到保管卡；下次演练输入它即可比对身份。';
    } else if (matched) {
      hint.textContent =
        '恢复结果与创建时的助记词一致，备份有效。本次演练全程未显示助记词；如需查看明文，请关闭演练模式重新恢复。';
    } else {
      hint.textContent =
        '请先核对保管卡上的指纹是否抄写有误；若指纹确认无误，说明这组分片对应的不是预期的助记词。本次未显示助记词明文。';
    }
    card.append(hint);

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
    this.currentFingerprint = '';
    this.copiedShares.clear();
    this.downloadedShares.clear();
    this.clearEncryptionFields();

    toggleElement(getElement(SELECTORS.SHARES_RESULT), false);
    clearElement(getElement(SELECTORS.SHARES_LIST));
    this.updateFingerprintRow();
  }
}
