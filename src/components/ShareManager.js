/**
 * 分片管理组件
 * 负责分片生成、显示、复制和下载功能
 */

import { split, combine } from 'shamir-secret-sharing';
import { getElement, createElement, toggleElement, toggleClass, setHTML, clearElement, addEvent } from '../utils/dom.js';
import { copyToClipboard, downloadFile, formatDateTime, base64Encode } from '../utils/helpers.js';
import { validateMnemonic, validateShareCollection } from '../utils/validation.js';
import { SELECTORS, CSS_CLASSES, ERROR_MESSAGES, SUCCESS_MESSAGES, INFO_MESSAGES, FILE_TEMPLATES } from '../constants/index.js';

export class ShareManager {
  constructor() {
    this.currentShares = [];
    this.currentThreshold = 0;
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
    title.textContent = `分片 ${index}`;

    const buttons = createElement('div', ['share-buttons']);

    const copyBtn = createElement('button', ['copy-btn']);
    copyBtn.textContent = '复制';
    addEvent(copyBtn, 'click', () => this.copyShare(copyBtn, share));

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
   */
  async copyShare(button, shareContent) {
    const success = await copyToClipboard(shareContent);

    if (success) {
      const originalText = button.textContent;
      button.textContent = '已复制';
      toggleClass(button, CSS_CLASSES.COPIED, true);

      setTimeout(() => {
        button.textContent = originalText;
        toggleClass(button, CSS_CLASSES.COPIED, false);
      }, 2000);
    } else {
      this.showError(ERROR_MESSAGES.COPY_FAILED);
    }
  }

  /**
   * 下载分片
   * @param {string} shareContent - 分片内容
   * @param {number} shareIndex - 分片索引
   */
  downloadShare(shareContent, shareIndex) {
    const fileContent = FILE_TEMPLATES.SHARE_CONTENT(shareIndex, shareContent);
    const filename = `分片${shareIndex}.txt`;

    const success = downloadFile(fileContent, filename);
    if (success) {
      this.showSuccess(SUCCESS_MESSAGES.SHARE_DOWNLOADED(shareIndex));
    } else {
      this.showError(ERROR_MESSAGES.DOWNLOAD_FAILED);
    }
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
      this.updateStatus('waiting', INFO_MESSAGES.WAITING_SHARES);
      recoverBtn.disabled = true;
      return;
    }

    const shareStrings = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (shareStrings.length === 0) {
      this.updateStatus('waiting', INFO_MESSAGES.WAITING_SHARES);
      recoverBtn.disabled = true;
      return;
    }

    const validation = validateShareCollection(shareStrings);

    if (!validation.isValid) {
      if (validation.validCount === 0) {
        this.updateStatus('invalid', INFO_MESSAGES.INVALID_FORMAT);
      } else {
        this.updateStatus('insufficient', ERROR_MESSAGES.INSUFFICIENT_SHARES(validation.validCount, validation.threshold));
      }
      recoverBtn.disabled = true;
    } else {
      this.updateStatus('valid', INFO_MESSAGES.VALID_SHARES(validation.validCount, validation.threshold));
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
    recoverBtn.textContent = '正在恢复...';

    try {
      const shareStrings = inputText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // 解析分片数据
      const validShareData = [];
      for (const shareStr of shareStrings) {
        try {
          const shareData = JSON.parse(atob(shareStr));
          if (shareData.threshold && shareData.index && shareData.data) {
            validShareData.push(shareData);
          }
        } catch (e) {
          // 跳过无效分片
        }
      }

      if (validShareData.length === 0) {
        throw new Error(ERROR_MESSAGES.NO_VALID_SHARES);
      }

      const threshold = validShareData[0].threshold;

      if (validShareData.length < threshold) {
        throw new Error(ERROR_MESSAGES.INSUFFICIENT_SHARES(validShareData.length, threshold));
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
      recoverBtn.textContent = '恢复助记词';
    }
  }
  /**
   * 显示恢复结果
   * @param {string} mnemonic - 恢复的助记词
   * @param {number} usedShares - 使用的分片数
   * @param {number} threshold - 所需分片数
   */
  displayRecoverResult(mnemonic, usedShares, threshold) {
    const resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    if (!resultDiv) return;

    const resultHTML = `
      <div class="alert alert-success">
        <strong>恢复成功！</strong><br>
        <strong>助记词：</strong><span style="font-family: 'Courier New', monospace; background: #f8f9fa; padding: 2px 6px; border-radius: 4px;">${mnemonic}</span><br>
        <strong>使用分片数：</strong>${usedShares} 个（需要 ${threshold} 个）<br>
        <strong>恢复时间：</strong>${formatDateTime()}
      </div>
    `;

    setHTML(resultDiv, resultHTML);
  }

  /**
   * 显示恢复错误
   * @param {string} errorMessage - 错误消息
   */
  displayRecoverError(errorMessage) {
    const resultDiv = getElement(SELECTORS.RECOVER_RESULT);
    if (!resultDiv) return;

    const errorHTML = `
      <div class="alert alert-error">
        <strong>恢复失败：</strong>${errorMessage}<br>
        <small>请检查分片格式是否正确，确保每行一个完整的分片</small>
      </div>
    `;

    setHTML(resultDiv, errorHTML);
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
   * 清理资源
   */
  destroy() {
    this.currentShares = [];
    this.currentThreshold = 0;
  }
}
