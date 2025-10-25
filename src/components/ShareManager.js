/**
 * 分片管理组件
 * 负责分片生成、显示、复制和下载功能
 */

import { split, combine } from 'shamir-secret-sharing';
import { getElement, createElement, toggleElement, toggleClass, setHTML, clearElement, addEvent } from '../utils/dom.js';
import { copyToClipboard, downloadFile, formatDateTime, base64Encode } from '../utils/helpers.js';
import { validateMnemonic, validateShareCollection } from '../utils/validation.js';
import { SELECTORS, CSS_CLASSES, ERROR_MESSAGES, SUCCESS_MESSAGES, INFO_MESSAGES, FILE_TEMPLATES } from '../constants/index.js';
import { t } from '../utils/i18n.js';
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
      return { isValid: false, error: '加密字段缺失，请刷新页面重试' };
    }

    const password = encryptionPassword.value;
    const confirm = confirmPassword.value;

    // 验证密码强度
    const strengthValidation = validatePasswordStrength(password);
    if (strengthValidation.strength === 'weak') {
      return { isValid: false, error: '密码过于简单，请使用至少8个字符，包含字母、数字和特殊字符' };
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
        this.showError(validation.errors[0]);
        return false;
      }

      // 验证加密设置
      const encryptionValidation = this.validateEncryptionSettings();
      if (!encryptionValidation.isValid) {
        this.showError(encryptionValidation.error);
        return false;
      }

      // 生成分片
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
      this.showSuccess(SUCCESS_MESSAGES.SHARES_GENERATED);
      return true;
    } catch (error) {
      this.showError(ERROR_MESSAGES.GENERATE_FAILED(error.message));
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
    title.textContent = t('share', index);

    const buttons = createElement('div', ['share-buttons']);

    const copyBtn = createElement('button', ['copy-btn']);

    // 检查这个分片是否已经被复制过
    if (this.copiedShares.has(index)) {
      copyBtn.textContent = t('success.copySuccess');
      toggleClass(copyBtn, CSS_CLASSES.COPIED, true);
    } else {
      copyBtn.textContent = t('copy');
    }

    addEvent(copyBtn, 'click', () => this.copyShare(copyBtn, share, index));

    const downloadBtn = createElement('button', ['download-btn']);
    downloadBtn.textContent = t('download');
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

      button.textContent = t('success.copySuccess');
      toggleClass(button, CSS_CLASSES.COPIED, true);
    } else {
      this.showError(t('errors.copyFailed'));
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
      this.showError(t('errors.downloadFailed') + ': ' + error.message);
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
      this.showInfo(t('encryption.encryptingShare', shareIndex));

      // 对分片内容进行加密
      const encryptedContent = await encryptWithPassword(shareContent, this.encryptionPassword);

      // 加密完成后立即清除密码
      this.clearEncryptionPassword();

      // 使用.txt.gpg扩展名
      const filename = `${t('shareFilePrefix')}${shareIndex}.txt.gpg`;

      // 加密分片保存为纯GPG格式，不添加额外文本
      const success = downloadFile(encryptedContent, filename);

      if (success) {
        this.showSuccess(t('success.encryptedShareDownloaded', shareIndex));
      } else {
        this.showError(t('errors.downloadFailed'));
      }
    } catch (error) {
      // 即使出错也要清除密码
      this.clearEncryptionPassword();
      throw new Error(t('encryption.encryptionFailed') + ': ' + error.message);
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
    const filename = `${t('shareFilePrefix')}${shareIndex}.${fileExtension}`;

    // 使用标准格式，包含应用信息和安全提示
    const fileData = FILE_TEMPLATES.SHARE_CONTENT(shareIndex, shareContent);
    const fileContent = this.formatShareFileContent(fileData);

    const success = downloadFile(fileContent, filename);
    if (success) {
      this.showSuccess(t('success.shareDownloaded', shareIndex));
    } else {
      this.showError(t('errors.downloadFailed'));
    }
  }

  /**
   * 格式化分片文件内容
   * @param {Object} fileData - 文件数据
   * @returns {string} 格式化后的文件内容
   */
  formatShareFileContent(fileData) {
    let content = `${t('fileTemplate.appName')} ${t('share', fileData.index)}\n${'='.repeat(50)}\n\n`;

    content += `${t('fileTemplate.shareContent')}:\n${fileData.content}\n\n${'='.repeat(50)}\n${t('fileTemplate.generatedTime')}: ${fileData.timestamp}\n\n${t(
      'fileTemplate.securityTips',
    )}:\n- ${t('fileTemplate.tip1')}\n- ${t('fileTemplate.tip2')}\n- ${t('fileTemplate.tip3')}`;

    return content;
  }

  /**
   * 验证分片输入
   */
  validateShareInput() {
    const input = getElement(SELECTORS.RECOVER_INPUT);
    const statusDiv = getElement(SELECTORS.INPUT_STATUS);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    if (!input || !statusDiv || !recoverBtn) {
      return;
    }

    const inputText = input.value.trim();

    if (!inputText) {
      this.updateStatus('waiting', t('waitingForInput'));
      recoverBtn.disabled = true;
      return;
    }

    const shareStrings = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (shareStrings.length === 0) {
      this.updateStatus('waiting', t('waitingForInput'));
      recoverBtn.disabled = true;
      return;
    }

    const validation = validateShareCollection(shareStrings);

    if (!validation.isValid) {
      if (validation.validCount === 0) {
        this.updateStatus('invalid', t('errors.invalidShareFormat'));
      } else if (validation.errors && validation.errors.some((error) => error.includes('检测到重复的分片索引'))) {
        this.updateStatus('invalid', t('errors.duplicateShares'));
      } else {
        this.updateStatus('insufficient', t('errors.insufficientShares', validation.threshold, validation.validCount));
      }
      recoverBtn.disabled = true;
    } else {
      this.updateStatus('valid', t('info.validShares', validation.validCount, validation.threshold));
      recoverBtn.disabled = false;
    }
  }

  /**
   * 恢复助记词
   * @returns {Promise<boolean>} 是否恢复成功
   */
  async recoverMnemonic() {
    const input = getElement(SELECTORS.RECOVER_INPUT);
    const resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    if (!input || !resultDiv || !recoverBtn) {
      return false;
    }

    const inputText = input.value.trim();

    if (!inputText) {
      this.showError(ERROR_MESSAGES.EMPTY_WORDS);
      return false;
    }

    // 显示处理状态
    recoverBtn.disabled = true;
    recoverBtn.textContent = t('info.recovering');

    try {
      const shareStrings = inputText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // 检查是否可能是加密分片（无法解析为标准格式）
      let isEncrypted = false;
      const validShareData = [];

      for (const shareStr of shareStrings) {
        try {
          const shareData = JSON.parse(atob(shareStr));
          if (shareData.threshold && shareData.index && shareData.data) {
            validShareData.push(shareData);
          }
        } catch (e) {
          // 如果无法解析为标准格式，可能是加密分片
          isEncrypted = true;
        }
      }

      // 如果没有找到有效的标准分片，尝试解密
      if (validShareData.length === 0 && isEncrypted) {
        // 使用密码对话框获取密码
        let password = '';
        let isRetry = false;

        try {
          password = await this.getPasswordFromDialog(isRetry);
        } catch (error) {
          // 用户取消了密码输入
          throw new Error(t('encryption.passwordRequired'));
        }

        // 尝试解密分片
        this.showInfo(t('encryption.decryptingShares'));

        for (const shareStr of shareStrings) {
          try {
            const decryptedShare = await decryptWithPassword(shareStr, password);
            const shareData = JSON.parse(atob(decryptedShare));
            if (shareData.threshold && shareData.index && shareData.data) {
              validShareData.push(shareData);
            }
          } catch (e) {
            // 解密失败，可能是密码错误
            if (e.message.includes('密码错误')) {
              // 如果是密码错误，尝试重试
              isRetry = true;
              try {
                password = await this.getPasswordFromDialog(isRetry);
                // 重试解密当前分片
                const decryptedShare = await decryptWithPassword(shareStr, password);
                const shareData = JSON.parse(atob(decryptedShare));
                if (shareData.threshold && shareData.index && shareData.data) {
                  validShareData.push(shareData);
                }
              } catch (retryError) {
                if (retryError.message.includes('密码错误')) {
                  throw new Error(t('encryption.invalidPassword'));
                }
                // 其他解密错误，继续尝试下一个分片
              }
            }
            // 其他解密错误，继续尝试下一个分片
          }
        }

        // 如果解密后仍然没有有效分片
        if (validShareData.length === 0) {
          throw new Error(t('encryption.decryptionFailed') + t('errors.noValidShares'));
        }
      }

      if (validShareData.length === 0) {
        throw new Error(t('errors.noValidShares'));
      }

      const threshold = validShareData[0].threshold;

      if (validShareData.length < threshold) {
        throw new Error(t('errors.insufficientShares', threshold, validShareData.length));
      }

      // 转换为 Uint8Array 格式
      const shares = validShareData.slice(0, threshold).map((data) => {
        const binaryString = atob(data.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });

      const recoveredBytes = await combine(shares);
      const recoveredMnemonic = new TextDecoder().decode(recoveredBytes);

      this.displayRecoverResult(recoveredMnemonic, validShareData.length, threshold);
      return true;
    } catch (error) {
      this.displayRecoverError(error.message);
      return false;
    } finally {
      // 恢复按钮状态
      recoverBtn.disabled = false;
      recoverBtn.textContent = t('recoverBtn');
      // 清理密码
      this.clearUploadEncryptionPassword();
    }
  }

  /**
   * 使用自定义分片数据恢复助记词
   * @param {Array} shares - 分片数据数组
   * @param {string} encryptionPassword - 加密密码（已弃用，现在使用弹框获取）
   * @returns {Promise<boolean>} 是否恢复成功
   */
  async recoverMnemonicWithShares(shares, encryptionPassword) {
    const resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    if (!resultDiv || !recoverBtn) {
      return false;
    }

    if (!shares || shares.length === 0) {
      this.showError(ERROR_MESSAGES.EMPTY_WORDS);
      return false;
    }

    // 显示处理状态
    recoverBtn.disabled = true;
    recoverBtn.textContent = t('info.recovering');

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
          throw new Error(t('encryption.passwordRequired'));
        }

        this.showInfo(t('encryption.decryptingShares'));

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
                  throw new Error(t('encryption.invalidPassword'));
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
          throw new Error(t('encryption.decryptionFailed') + t('errors.noValidShares'));
        }

        // 使用解密后的分片继续处理
        const threshold = finalShares[0].threshold;
        if (finalShares.length < threshold) {
          throw new Error(t('errors.insufficientShares', threshold, finalShares.length));
        }

        // 转换为 Uint8Array 格式
        const shareBytes = finalShares.slice(0, threshold).map((data) => {
          const binaryString = atob(data.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        });

        const recoveredBytes = await combine(shareBytes);
        const recoveredMnemonic = new TextDecoder().decode(recoveredBytes);

        this.displayRecoverResult(recoveredMnemonic, finalShares.length, threshold);
        return true;
      }

      if (validShareData.length === 0) {
        throw new Error(t('errors.noValidShares'));
      }

      const threshold = validShareData[0].threshold;

      if (validShareData.length < threshold) {
        throw new Error(t('errors.insufficientShares', threshold, validShareData.length));
      }

      // 转换为 Uint8Array 格式
      const shareBytes = validShareData.slice(0, threshold).map((data) => {
        const binaryString = atob(data.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      });

      const recoveredBytes = await combine(shareBytes);
      const recoveredMnemonic = new TextDecoder().decode(recoveredBytes);

      this.displayRecoverResult(recoveredMnemonic, validShareData.length, threshold);
      return true;
    } catch (error) {
      this.displayRecoverError(error.message);
      return false;
    } finally {
      // 恢复按钮状态
      recoverBtn.disabled = false;
      recoverBtn.textContent = t('recoverBtn');
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

    // 将助记词按单词分割并添加样式
    const words = mnemonic
      .split(' ')
      .map((word) => `<span class="word">${word}</span>`)
      .join(' ');

    const resultHTML = `
      <div class="alert alert-success">
        <strong>${t('success.recoverySuccess')}</strong><br>
        <strong>${t('mnemonic')}：</strong><br>
        <span class="recovered-mnemonic">${words}</span><br>
        <strong>${t('sharesUsed')}：</strong>${usedShares} ${t('shares')}（${t('need')} ${threshold} ${t('shares')}）<br>
        <strong>${t('recoveryTime')}：</strong>${formatDateTime()}
      </div>
    `;

    setHTML(resultDiv, resultHTML);
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
    strongElement.textContent = t('errors.recoveryFailed');
    alertDiv.appendChild(strongElement);

    const errorTextSpan = document.createElement('span');
    errorTextSpan.textContent = errorMessage;
    alertDiv.appendChild(errorTextSpan);

    alertDiv.appendChild(document.createElement('br'));

    const smallElement = document.createElement('small');
    smallElement.textContent = t('errors.checkShareFormat');
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

    // 设置消息
    statusDiv.innerHTML = `<span class="status-text">${message}</span>`;
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
      setHTML(alertElement, message);
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
