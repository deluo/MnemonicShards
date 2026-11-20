/**
 * 分片管理组件
 * 负责分片生成、显示、复制和下载功能
 */

import { split, combine } from 'shamir-secret-sharing';
import { getElement, createElement, toggleElement, toggleClass, setText, clearElement, addEvent } from '../utils/dom.js';
import { copyToClipboard, downloadFile, formatDateTime, base64Encode, base64ToBytes } from '../utils/helpers.js';
import { validateMnemonic, validateShareCollection, validateMnemonicChecksum } from '../utils/validation.js';
import { BIP39_WORDLIST } from '../constants/bip39-words.js';
import { SELECTORS, CSS_CLASSES, FILE_TEMPLATES } from '../constants/index.js';
import { encryptWithPassword, decryptWithPassword, validatePasswordStrength, validatePasswordMatch } from '../utils/encryption.js';
import { passwordDialog } from './PasswordDialog.js';

export class ShareManager {
  constructor() {
    this.currentShares = [];
    this.currentThreshold = 0;
    this.copiedShares = new Set(); // 跟踪已复制的分片索引
    this.isEncryptionEnabled = false; // 加密是否启用
    this.encryptionPassword = ''; // 加密密码
    this.encryptedShares = []; // 加密后的分片
  }

  /**
   * 初始化加密相关事件监听器
   */
  initEncryptionListeners() {
    const enableEncryptionCheckbox = getElement(SELECTORS.ENABLE_ENCRYPTION);
    const encryptionFields = getElement(SELECTORS.ENCRYPTION_FIELDS);
    const encryptionPassword = getElement(SELECTORS.ENCRYPTION_PASSWORD);
    const confirmPassword = getElement(SELECTORS.CONFIRM_PASSWORD);
    const passwordStrength = getElement(SELECTORS.PASSWORD_STRENGTH);
    const passwordMatch = getElement(SELECTORS.PASSWORD_MATCH);

    if (!enableEncryptionCheckbox || !encryptionFields) return;

    // 加密选项切换
    addEvent(enableEncryptionCheckbox, 'change', () => {
      this.isEncryptionEnabled = enableEncryptionCheckbox.checked;
      toggleElement(encryptionFields, this.isEncryptionEnabled);

      // 如果禁用加密，清空密码字段
      if (!this.isEncryptionEnabled) {
        if (encryptionPassword) encryptionPassword.value = '';
        if (confirmPassword) confirmPassword.value = '';
        if (passwordStrength) passwordStrength.textContent = '';
        if (passwordMatch) passwordMatch.textContent = '';
        this.encryptionPassword = '';
      }
    });

    // 密码强度验证
    if (encryptionPassword && passwordStrength) {
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
    }

    // 确认密码验证
    if (confirmPassword && passwordMatch) {
      addEvent(confirmPassword, 'input', () => {
        this.checkPasswordMatch();
      });
    }
  }

  /**
   * 检查密码匹配
   */
  checkPasswordMatch() {
    const encryptionPassword = getElement(SELECTORS.ENCRYPTION_PASSWORD);
    const confirmPassword = getElement(SELECTORS.CONFIRM_PASSWORD);
    const passwordMatch = getElement(SELECTORS.PASSWORD_MATCH);

    if (!encryptionPassword || !confirmPassword || !passwordMatch) return;

    const password = encryptionPassword.value;
    const confirm = confirmPassword.value;

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

    const encryptionPassword = getElement(SELECTORS.ENCRYPTION_PASSWORD);
    const confirmPassword = getElement(SELECTORS.CONFIRM_PASSWORD);

    if (!encryptionPassword || !confirmPassword) {
      return { isValid: false, error: '加密字段缺失' };
    }

    const password = encryptionPassword.value;
    const confirm = confirmPassword.value;

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
   * 清除加密密码（安全清理）
   */
  clearEncryptionPassword() {
    this.encryptionPassword = '';
  }

  clearUploadEncryptionPassword() {
    this.uploadEncryptionPassword = '';
  }

  /**
   * 生成分片
   * @param {string[]} words - 助记词数组
   * @param {number} totalShares - 总分片数
   * @param {number} threshold - 恢复所需分片数
   * @returns {Promise<boolean>} 是否生成成功
   */
  async generateShares(words, totalShares, threshold) {
    try {
      // 验证助记词
      const validation = validateMnemonic(words);
      if (!validation.isValid) {
        this.showError('请填写所有助记词！');
        return false;
      }

      // 验证 BIP39 校验和，防止拼写/顺序错误的助记词被静默分片
      const checksum = await validateMnemonicChecksum(BIP39_WORDLIST, words);
      if (!checksum.isValid) {
        this.showError('助记词校验和验证失败：单词拼写或顺序可能有误，请逐词核对后再生成分片。');
        return false;
      }

      // 验证加密设置
      const encryptionValidation = this.validateEncryptionSettings();
      if (!encryptionValidation.isValid) {
        this.showError(encryptionValidation.error);
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
      this.encryptedShares = []; // 重置加密分片数组

      // 重置复制状态
      this.copiedShares.clear();

      // 显示分片
      this.displayShares();
      this.showSuccess('分片生成成功！请安全保存这些分片。');
      return true;
    } catch (error) {
      this.showError(`生成分片失败：${error.message}`);
      return false;
    }
  }

  /**
   * 显示分片
   */
  displayShares() {
    const resultDiv = getElement(SELECTORS.SHARES_RESULT);
    const sharesList = getElement(SELECTORS.SHARES_LIST);
    const thresholdDisplay = getElement(SELECTORS.THRESHOLD_DISPLAY);

    if (!resultDiv || !sharesList || !thresholdDisplay) return;

    thresholdDisplay.textContent = this.currentThreshold;
    clearElement(sharesList);

    this.currentShares.forEach((share, index) => {
      const shareItem = this.createShareItem(share, index + 1);
      sharesList.appendChild(shareItem);
    });

    toggleElement(resultDiv, true);
  }

  /**
   * 创建分片项
   * @param {string} share - 分片内容
   * @param {number} index - 分片索引
   * @returns {Element} 分片项元素
   */
  createShareItem(share, index) {
    const shareItem = createElement('div', ['share-item']);

    const header = createElement('div', ['share-header']);

    const title = createElement('div', ['share-title']);
    title.textContent = `分片 ${index}`;

    const buttons = createElement('div', ['share-buttons']);

    const copyBtn = createElement('button', ['copy-btn']);

    // 检查这个分片是否已经被复制过
    if (this.copiedShares.has(index)) {
      copyBtn.textContent = '已复制到剪贴板！';
      toggleClass(copyBtn, CSS_CLASSES.COPIED, true);
    } else {
      copyBtn.textContent = '复制';
    }

    addEvent(copyBtn, 'click', () => this.copyShare(copyBtn, share, index));

    const downloadBtn = createElement('button', ['download-btn']);
    downloadBtn.textContent = '下载';
    addEvent(downloadBtn, 'click', () => this.downloadShare(share, index));

    buttons.appendChild(copyBtn);
    buttons.appendChild(downloadBtn);

    header.appendChild(title);
    header.appendChild(buttons);

    const content = createElement('div', ['share-content']);
    content.textContent = share;

    shareItem.appendChild(header);
    shareItem.appendChild(content);

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

      button.textContent = '已复制到剪贴板！';
      toggleClass(button, CSS_CLASSES.COPIED, true);
    } else {
      this.showError('复制到剪贴板失败');
    }
  }

  /**
   * 下载分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   */
  async downloadShare(shareContent, shareIndex) {
    try {
      // 检查是否启用了加密选项
      const encryptionValidation = this.validateEncryptionSettings();

      // 如果启用了加密但验证失败，显示错误信息
      if (this.isEncryptionEnabled && !encryptionValidation.isValid) {
        this.showError(encryptionValidation.error);
        return;
      }

      if (this.isEncryptionEnabled && encryptionValidation.isValid) {
        // 加密模式：下载加密分片
        await this.downloadEncryptedShare(shareContent, shareIndex);
      } else {
        // 非加密模式：下载标准分片
        this.downloadStandardShare(shareContent, shareIndex);
      }
    } catch (error) {
      this.showError('下载失败，请重试' + ': ' + error.message);
    }
  }

  /**
   * 下载加密分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   */
  async downloadEncryptedShare(shareContent, shareIndex) {
    try {
      // 显示加密进度提示
      this.showInfo(`正在加密分片 ${shareIndex}...`);

      // 对分片内容进行加密
      const encryptedContent = await encryptWithPassword(shareContent, this.encryptionPassword);

      // 加密完成后立即清除密码
      this.clearEncryptionPassword();

      // 使用.txt.gpg扩展名
      const filename = `分片${shareIndex}.txt.gpg`;

      // 加密分片保存为纯GPG格式，不添加额外文本
      const success = downloadFile(encryptedContent, filename);

      if (success) {
        this.showSuccess(`加密分片 ${shareIndex} 已下载`);
      } else {
        this.showError('下载失败，请重试');
      }
    } catch (error) {
      // 即使出错也要清除密码
      this.clearEncryptionPassword();
      throw new Error('加密失败：' + error.message);
    }
  }

  /**
   * 下载标准分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   */
  downloadStandardShare(shareContent, shareIndex) {
    // 使用.txt扩展名
    const fileExtension = 'txt';
    const filename = `分片${shareIndex}.${fileExtension}`;

    // 使用标准格式，包含应用信息和安全提示
    const fileData = FILE_TEMPLATES.SHARE_CONTENT(shareIndex, shareContent);
    const fileContent = this.formatShareFileContent(fileData);

    const success = downloadFile(fileContent, filename);
    if (success) {
      this.showSuccess(`分片 ${shareIndex} 已下载`);
    } else {
      this.showError('下载失败，请重试');
    }
  }

  /**
   * 格式化分片文件内容
   * @param {Object} fileData - 文件数据
   * @returns {string} 格式化后的文件内容
   */
  formatShareFileContent(fileData) {
    let content = `MnemonicShards 分片 ${fileData.index}\n${'='.repeat(50)}\n\n`;

    content += `分片内容:\n${fileData.content}\n\n${'='.repeat(50)}\n生成时间: ${fileData.timestamp}\n\n安全提示:\n- 请将此文件保存在安全的位置\n- 不要将分片分享给不信任的人\n- 任意指定数量的分片即可恢复原始助记词`;

    return content;
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
    const check = await validateMnemonicChecksum(BIP39_WORDLIST, words);
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
      case 'word':
        return `恢复失败：还原结果包含不在 BIP39 词表中的单词："${check.word}"。`;
      case 'checksum':
      default:
        return '恢复失败：还原结果未通过 BIP39 校验和验证。分片可能已损坏、抄录有误或不属于同一组助记词。';
    }
  }

  /**
   * 使用自定义分片数据恢复助记词
   * @param {Array} shares - 分片数据数组
   * @returns {Promise<boolean>} 是否恢复成功
   */
  async recoverMnemonicWithShares(shares) {
    const resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    if (!resultDiv || !recoverBtn) {
      return false;
    }

    if (!shares || shares.length === 0) {
      this.showError('请填写所有助记词！');
      return false;
    }

    // 显示处理状态
    recoverBtn.disabled = true;
    recoverBtn.textContent = '正在恢复...';

    try {
      // 检查是否可能是加密分片
      let isEncrypted = false;
      const validShareData = [];

      for (const share of shares) {
        if (share.encrypted) {
          isEncrypted = true;
          // 对于加密分片，直接添加到有效列表，让解密逻辑处理
          validShareData.push(share);
          continue;
        }

        try {
          // 如果是字符串，尝试解析
          if (typeof share === 'string') {
            // 检查是否是GPG格式
            if (share.startsWith('-----BEGIN PGP MESSAGE-----')) {
              isEncrypted = true;
              validShareData.push({ encrypted: true, content: share });
              continue;
            }

            const shareData = JSON.parse(atob(share));
            if (shareData.threshold && shareData.index && shareData.data) {
              validShareData.push(shareData);
            }
          } else if (share.threshold && share.index && share.data) {
            // 如果已经是对象格式
            validShareData.push(share);
          }
        } catch (e) {
          // 解析失败，可能是加密分片
          isEncrypted = true;
          // 尝试作为加密分片处理
          validShareData.push({ encrypted: true, content: share });
        }
      }

      // 如果有加密分片，尝试解密
      if (isEncrypted) {
        let password = '';
        let isRetry = false;

        // 使用对话框获取密码
        try {
          password = await this.getPasswordFromDialog(isRetry);
        } catch (error) {
          // 用户取消了密码输入
          throw new Error('解密需要密码');
        }

        this.showInfo('正在解密分片...');

        const encryptedShares = validShareData.filter((share) => share.encrypted);
        const decryptedShares = [];
        let decryptionSuccess = false;

        for (const encryptedShare of encryptedShares) {
          try {
            const decryptedShare = await decryptWithPassword(encryptedShare.content, password);
            const shareData = JSON.parse(atob(decryptedShare));
            if (shareData.threshold && shareData.index && shareData.data) {
              decryptedShares.push(shareData);
              decryptionSuccess = true;
            }
          } catch (e) {
            // 解密失败，可能是密码错误
            if (e.message.includes('密码错误')) {
              // 如果是密码错误，尝试重试
              isRetry = true;
              try {
                password = await this.getPasswordFromDialog(isRetry);
                // 重试解密当前分片
                const decryptedShare = await decryptWithPassword(encryptedShare.content, password);
                const shareData = JSON.parse(atob(decryptedShare));
                if (shareData.threshold && shareData.index && shareData.data) {
                  decryptedShares.push(shareData);
                  decryptionSuccess = true;
                }
              } catch (retryError) {
                if (retryError.message.includes('密码错误')) {
                  throw new Error('密码无效，请检查后重试');
                }
                // 其他解密错误，继续尝试下一个分片
              }
            }
            // 其他解密错误，继续尝试下一个分片
          }
        }

        // 替换加密分片为解密后的分片
        const finalShares = validShareData.filter((share) => !share.encrypted).concat(decryptedShares);

        // 如果解密后仍然没有有效分片
        if (finalShares.length === 0) {
          throw new Error('解密失败：' + '没有找到有效的分片数据');
        }

        // 使用解密后的分片继续处理
        const threshold = finalShares[0].threshold;
        if (finalShares.length < threshold) {
          throw new Error(`分片数量不足。至少需要 ${threshold} 个分片，但只提供了 ${finalShares.length} 个。`);
        }

        const recoveredMnemonic = await this.recoverFromShareData(finalShares.slice(0, threshold));

        this.displayRecoverResult(recoveredMnemonic, finalShares.length, threshold);
        return true;
      }

      if (validShareData.length === 0) {
        throw new Error('没有找到有效的分片数据');
      }

      const threshold = validShareData[0].threshold;

      if (validShareData.length < threshold) {
        throw new Error(`分片数量不足。至少需要 ${threshold} 个分片，但只提供了 ${validShareData.length} 个。`);
      }

      const recoveredMnemonic = await this.recoverFromShareData(validShareData.slice(0, threshold));

      this.displayRecoverResult(recoveredMnemonic, validShareData.length, threshold);
      return true;
    } catch (error) {
      this.displayRecoverError(error.message);
      return false;
    } finally {
      // 恢复按钮状态
      recoverBtn.disabled = false;
      recoverBtn.textContent = '恢复助记词';
      // 清理密码
      this.clearUploadEncryptionPassword();
    }
  }

  /**
   * 显示恢复结果
   * @param {string} mnemonic - 恢复的助记词
   * @param {number} usedShares - 使用的分片数
   * @param {number} threshold - 所需分片数
   */
  displayRecoverResult(mnemonic, usedShares, threshold) {
    // 根据当前活动的tab选择结果显示区域
    const activeTabBtn = getElement('.tab-btn.active');
    let resultDiv;

    if (activeTabBtn && activeTabBtn.id === 'pasteTabBtn') {
      resultDiv = getElement(SELECTORS.PASTE_RECOVER_RESULT);
    } else if (activeTabBtn && activeTabBtn.id === 'uploadTabBtn') {
      resultDiv = getElement(SELECTORS.UPLOAD_RECOVER_RESULT);
    } else {
      // 回退到原来的方式
      resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    }

    if (!resultDiv) return;

    // 清空之前的内容
    clearElement(resultDiv);

    // 创建安全的DOM结构，防止XSS攻击：
    // 恢复结果完全由输入分片决定（攻击者可控），必须用 textContent 渲染，禁止拼 HTML
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-success';

    const titleStrong = document.createElement('strong');
    titleStrong.textContent = '恢复成功！';
    alertDiv.appendChild(titleStrong);
    alertDiv.appendChild(document.createElement('br'));

    const mnemonicLabel = document.createElement('strong');
    mnemonicLabel.textContent = '助记词：';
    alertDiv.appendChild(mnemonicLabel);
    alertDiv.appendChild(document.createElement('br'));

    const mnemonicSpan = document.createElement('span');
    mnemonicSpan.className = 'recovered-mnemonic';
    mnemonic
      .trim()
      .split(/\s+/)
      .forEach((word, index, words) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = word;
        mnemonicSpan.appendChild(wordSpan);
        if (index < words.length - 1) {
          mnemonicSpan.appendChild(document.createTextNode(' '));
        }
      });
    alertDiv.appendChild(mnemonicSpan);
    alertDiv.appendChild(document.createElement('br'));

    const sharesLabel = document.createElement('strong');
    sharesLabel.textContent = '使用分片数：';
    alertDiv.appendChild(sharesLabel);
    alertDiv.appendChild(document.createTextNode(`${usedShares} 个（需要 ${threshold} 个）`));
    alertDiv.appendChild(document.createElement('br'));

    const timeLabel = document.createElement('strong');
    timeLabel.textContent = '恢复时间：';
    alertDiv.appendChild(timeLabel);
    alertDiv.appendChild(document.createTextNode(formatDateTime()));

    resultDiv.appendChild(alertDiv);
  }

  /**
   * 显示恢复错误
   * @param {string} errorMessage - 错误消息
   */
  displayRecoverError(errorMessage) {
    // 根据当前活动的tab选择结果显示区域
    const activeTabBtn = getElement('.tab-btn.active');
    let resultDiv;

    if (activeTabBtn && activeTabBtn.id === 'pasteTabBtn') {
      resultDiv = getElement(SELECTORS.PASTE_RECOVER_RESULT);
    } else if (activeTabBtn && activeTabBtn.id === 'uploadTabBtn') {
      resultDiv = getElement(SELECTORS.UPLOAD_RECOVER_RESULT);
    } else {
      // 回退到原来的方式
      resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    }

    if (!resultDiv) return;

    // 清空之前的内容
    resultDiv.innerHTML = '';

    // 创建安全的DOM结构，防止XSS攻击
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-error';

    const strongElement = document.createElement('strong');
    strongElement.textContent = '恢复失败：';
    alertDiv.appendChild(strongElement);

    const errorTextSpan = document.createElement('span');
    errorTextSpan.textContent = errorMessage;
    alertDiv.appendChild(errorTextSpan);

    alertDiv.appendChild(document.createElement('br'));

    const smallElement = document.createElement('small');
    smallElement.textContent = '请检查分片格式是否正确，确保每行一个完整的分片';
    alertDiv.appendChild(smallElement);

    resultDiv.appendChild(alertDiv);
  }

  /**
   * 更新状态显示
   * @param {string} status - 状态类型
   * @param {string} message - 状态消息
   */
  updateStatus(status, message) {
    const statusDiv = getElement(SELECTORS.INPUT_STATUS);
    if (!statusDiv) return;

    // 移除所有状态类
    statusDiv.className = 'input-status';

    // 添加新的状态类
    toggleClass(statusDiv, `input-${status}`, true);

    // 设置消息 - 使用 textContent 防止消息内容被当作 HTML 执行
    statusDiv.innerHTML = '';
    const spanElement = document.createElement('span');
    spanElement.className = 'status-text';
    spanElement.textContent = message;
    statusDiv.appendChild(spanElement);
  }

  /**
   * 显示成功消息
   * @param {string} message - 消息内容
   */
  showSuccess(message) {
    this.showAlert('success', message);
  }

  /**
   * 显示错误消息
   * @param {string} message - 消息内容
   */
  showError(message) {
    this.showAlert('error', message);
  }

  /**
   * 显示信息消息
   * @param {string} message - 消息内容
   */
  showInfo(message) {
    this.showAlert('info', message);
  }

  /**
   * 显示提示消息
   * @param {string} type - 消息类型
   * @param {string} message - 消息内容
   */
  showAlert(type, message) {
    // 隐藏所有提示
    this.hideAllAlerts();

    let alertElement;
    switch (type) {
      case 'success':
        alertElement = getElement(SELECTORS.SUCCESS_ALERT);
        break;
      case 'error':
        alertElement = getElement(SELECTORS.GENERAL_ERROR_ALERT);
        break;
      case 'info':
        // 创建一个临时的信息提示
        alertElement = document.createElement('div');
        alertElement.className = 'alert alert-info';
        alertElement.style.display = 'none';
        const container = getElement('.main-content');
        if (container) {
          container.appendChild(alertElement);
        }
        break;
      default:
        alertElement = getElement(SELECTORS.GENERAL_ERROR_ALERT);
        break;
    }

    if (alertElement) {
      setText(alertElement, message);
      toggleElement(alertElement, true);

      // 3秒后自动隐藏
      setTimeout(() => {
        toggleElement(alertElement, false);
        // 如果是临时创建的info元素，移除它
        if (type === 'info' && alertElement.parentNode) {
          alertElement.parentNode.removeChild(alertElement);
        }
      }, 3000);
    }
  }

  /**
   * 隐藏所有提示
   */
  hideAllAlerts() {
    const alerts = [SELECTORS.INPUT_ERROR_ALERT, SELECTORS.DUPLICATE_ALERT, SELECTORS.GENERAL_ERROR_ALERT, SELECTORS.SUCCESS_ALERT];

    alerts.forEach((selector) => {
      const alert = getElement(selector);
      if (alert) {
        toggleElement(alert, false);
      }
    });
  }

  /**
   * 从对话框获取密码
   * @param {boolean} isRetry - 是否是重试
   * @returns {Promise<string>} 密码
   */
  async getPasswordFromDialog(isRetry = false) {
    return await passwordDialog.show(isRetry);
  }

  /**
   * 清理资源
   */
  destroy() {
    this.currentShares = [];
    this.currentThreshold = 0;
    this.copiedShares.clear();
  }
}
