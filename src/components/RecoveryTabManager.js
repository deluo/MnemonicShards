/**
 * 恢复Tab管理器
 * 负责处理tab切换、文件上传和分片解析功能
 */

import { getElement, createElement, toggleElement, toggleClass, setHTML, clearElement, addEvent } from '../utils/dom.js';
import { validateShareCollection } from '../utils/validation.js';
import { validatePasswordMatch, decryptWithPassword, detectGpgFormat } from '../utils/encryption.js';
import { t } from '../utils/i18n.js';
import { passwordDialog } from './PasswordDialog.js';

export class RecoveryTabManager {
  constructor() {
    this.activeTab = 'paste'; // 'paste' | 'upload'
    this.uploadedFiles = [];
    this.parsedShares = [];
    this.isEncryptionEnabled = false;
    this.encryptionPassword = '';
    this.currentThreshold = 0;
    this.validShareCount = 0;
    this.pendingFiles = []; // 待处理的文件
    this.hasEncryptedFiles = false; // 是否有加密文件
    this.uploadPassword = ''; // 上传文件时的解密密码
    this.passwordVisible = false; // 密码是否可见

    this.init();
  }

  /**
   * 初始化
   */
  init() {
    this.setupTabSwitching();
    this.setupFileUpload();
    this.setupDragAndDrop();
    this.setupEncryptionPassword();
  }

  /**
   * 设置Tab切换
   */
  setupTabSwitching() {
    const pasteTabBtn = getElement('#pasteTabBtn');
    const uploadTabBtn = getElement('#uploadTabBtn');
    const pasteTab = getElement('#pasteTab');
    const uploadTab = getElement('#uploadTab');

    if (!pasteTabBtn || !uploadTabBtn || !pasteTab || !uploadTab) return;

    // Tab按钮点击事件
    addEvent(pasteTabBtn, 'click', () => this.switchTab('paste'));
    addEvent(uploadTabBtn, 'click', () => this.switchTab('upload'));
  }

  /**
   * 切换Tab
   * @param {string} tabType - Tab类型
   */
  switchTab(tabType) {
    if (this.activeTab === tabType) return;

    const pasteTabBtn = getElement('#pasteTabBtn');
    const uploadTabBtn = getElement('#uploadTabBtn');
    const pasteTab = getElement('#pasteTab');
    const uploadTab = getElement('#uploadTab');

    // 更新按钮状态
    toggleClass(pasteTabBtn, 'active', tabType === 'paste');
    toggleClass(uploadTabBtn, 'active', tabType === 'upload');

    // 更新内容显示
    toggleClass(pasteTab, 'active', tabType === 'paste');
    toggleClass(uploadTab, 'active', tabType === 'upload');

    // 清空上一个tab的结果显示
    if (this.activeTab === 'paste') {
      const pasteResultDiv = getElement('#pasteRecoverResult');
      if (pasteResultDiv) {
        setHTML(pasteResultDiv, '');
      }
    } else if (this.activeTab === 'upload') {
      const uploadResultDiv = getElement('#uploadRecoverResult');
      if (uploadResultDiv) {
        setHTML(uploadResultDiv, '');
      }
    }

    this.activeTab = tabType;

    // 切换Tab后重新验证状态
    this.validateCurrentTab();
  }

  /**
   * 设置文件上传
   */
  setupFileUpload() {
    const selectFilesBtn = getElement('#selectFilesBtn');
    const fileInput = getElement('#fileInput');
    const clearFilesBtn = getElement('#clearFilesBtn');

    if (!selectFilesBtn || !fileInput) return;

    // 点击选择文件按钮
    addEvent(selectFilesBtn, 'click', () => {
      fileInput.click();
    });

    // 文件选择事件
    addEvent(fileInput, 'change', (e) => {
      this.handleFileSelect(e.target.files);
    });

    // 清空文件按钮
    if (clearFilesBtn) {
      addEvent(clearFilesBtn, 'click', () => {
        this.clearAllFiles();
      });
    }
  }

  /**
   * 设置拖拽上传
   */
  setupDragAndDrop() {
    const uploadArea = getElement('#uploadArea');
    if (!uploadArea) return;

    // 防止默认拖拽行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
      addEvent(uploadArea, eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    // 拖拽进入
    ['dragenter', 'dragover'].forEach((eventName) => {
      addEvent(uploadArea, eventName, () => {
        toggleClass(uploadArea, 'drag-over', true);
      });
    });

    // 拖拽离开
    addEvent(uploadArea, 'dragleave', () => {
      toggleClass(uploadArea, 'drag-over', false);
    });

    // 文件放下
    addEvent(uploadArea, 'drop', (e) => {
      toggleClass(uploadArea, 'drag-over', false);
      this.handleFileSelect(e.dataTransfer.files);
    });
  }

  /**
   * 处理文件选择
   * @param {FileList} files - 文件列表
   */
  async handleFileSelect(files) {
    if (!files || files.length === 0) return;

    // 验证文件类型和大小
    const validFiles = this.validateFiles(files);
    if (validFiles.length === 0) return;

    // 检查是否有加密文件
    this.hasEncryptedFiles = validFiles.some((file) => file.name.endsWith('.gpg'));

    // 直接处理文件
    await this.processFiles(validFiles);

    // 如果有加密文件，显示密码输入区域
    if (this.hasEncryptedFiles) {
      this.togglePasswordSection(true, true);
    }
  }

  /**
   * 处理文件列表
   * @param {Array} files - 文件列表
   */
  async processFiles(files) {
    // 处理每个文件
    for (const file of files) {
      await this.processFile(file);
    }

    // 更新UI
    this.updateFilesList();

    // 即使没有加密文件，也要验证当前状态
    this.validateCurrentShares();
  }

  /**
   * 验证文件
   * @param {FileList} files - 文件列表
   * @returns {Array} 有效文件列表
   */
  validateFiles(files) {
    const validFiles = [];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
      // 检查文件类型
      const validExtensions = ['.txt', '.gpg'];
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

      if (!validExtensions.includes(fileExtension)) {
        this.showError(t('errors.fileTypeNotSupported', file.name));
        continue;
      }

      // 检查文件大小
      if (file.size > maxSize) {
        this.showError(t('errors.fileTooLarge', file.name));
        continue;
      }

      // 检查重复文件
      if (this.uploadedFiles.some((f) => f.name === file.name)) {
        this.showError(t('errors.duplicateFile', file.name));
        continue;
      }

      validFiles.push(file);
    }

    return validFiles;
  }

  /**
   * 处理单个文件
   * @param {File} file - 文件对象
   */
  async processFile(file) {
    try {
      // 添加到上传列表
      const fileData = {
        name: file.name,
        size: file.size,
        type: file.type,
        content: '',
        status: 'processing',
        shareData: null,
        isEncrypted: file.name.endsWith('.gpg'),
        decryptedContent: null,
        contentFormat: 'text', // 'text' 或 'binary'
      };

      this.uploadedFiles.push(fileData);

      // 读取文件内容
      const content = await this.readFileContent(file);
      fileData.content = content;

      // 检测内容格式
      if (fileData.isEncrypted) {
        fileData.contentFormat = (content instanceof ArrayBuffer) ? 'binary' : 'text';
        fileData.status = 'encrypted';
      } else {
        // 非加密文件必须是文本格式
        if (typeof content !== 'string') {
          fileData.status = 'invalid';
          return;
        }
        fileData.contentFormat = 'text';

        // 解析分片内容
        const shareData = this.parseShareContent(content);
        if (shareData && !shareData.encrypted) {
          fileData.shareData = shareData;
          fileData.status = 'valid';
        } else {
          fileData.status = 'invalid';
        }
      }
    } catch (error) {
      const fileIndex = this.uploadedFiles.findIndex((f) => f.name === file.name);
      if (fileIndex !== -1) {
        this.uploadedFiles[fileIndex].status = 'invalid';
      }
    }
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
   * 重试解密
   * @param {Array} encryptedFiles - 加密文件列表
   * @param {string} password - 密码
   */
  async retryDecryption(encryptedFiles, password) {
    let decryptionSuccess = false;

    for (const file of encryptedFiles) {
      try {
        const decryptedContent = await decryptWithPassword(file.content, password);
        file.decryptedContent = decryptedContent;

        // 解析解密后的分片内容
        const shareData = this.parseShareContent(decryptedContent);
        if (shareData && !shareData.encrypted) {
          file.shareData = shareData;
          file.status = 'valid';
          decryptionSuccess = true;
        } else {
          file.status = 'invalid';
        }
      } catch (error) {
        file.status = 'invalid';
        // 提供更详细的错误信息
        if (error.message.includes('密码错误')) {
          // 密码错误，继续尝试其他文件
        } else if (error.message.includes('格式无效')) {
          // 格式错误，标记为无效但继续尝试其他文件
          console.warn(`文件 ${file.name} 格式无效:`, error.message);
        } else {
          // 其他错误
          console.warn(`文件 ${file.name} 解密失败:`, error.message);
        }
      }

      // 每解密一个文件就更新UI和验证状态
      this.updateFilesList();
      this.validateCurrentShares();
    }

    // 如果重试仍然失败，显示错误信息
    if (!decryptionSuccess) {
      this.showError(t('encryption.invalidPassword') || '密码错误或文件格式无效');
    }
  }

  /**
   * 验证当前分片状态
   */
  validateCurrentShares() {
    const statusDiv = getElement('#uploadStatus');
    const recoverBtn = getElement('#recoverBtn');

    if (!statusDiv || !recoverBtn) return;

    // 收集所有有效分片
    const allShares = this.uploadedFiles.filter((file) => file.status === 'valid' && file.shareData).map((file) => file.shareData);

    // 检查是否有待解密的文件
    const encryptedFiles = this.uploadedFiles.filter((file) => file.status === 'encrypted');

    if (allShares.length === 0 && encryptedFiles.length === 0) {
      this.updateStatus('invalid', t('errors.noValidShares'), statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    if (allShares.length === 0 && encryptedFiles.length > 0) {
      this.updateStatus('waiting', t('encryption.passwordRequired'), statusDiv);
      recoverBtn.disabled = false; // 允许用户点击恢复按钮，然后在恢复时弹出密码输入框
      return;
    }

    // 验证分片集合
    const validation = validateShareCollection(allShares);

    if (validation.isValid) {
      this.updateStatus('valid', t('sharesDecrypted', validation.validCount, validation.threshold), statusDiv);
      recoverBtn.disabled = false;
      this.currentThreshold = validation.threshold;
      this.validShareCount = validation.validCount;
    } else {
      if (validation.validCount < validation.threshold) {
        this.updateStatus('insufficient', t('insufficientSharesAfterDecryption', validation.threshold, validation.validCount), statusDiv);
      } else {
        this.updateStatus('invalid', t('errors.invalidShareFormat'), statusDiv);
      }
      recoverBtn.disabled = true;
    }
  }

  /**
   * 读取文件内容（支持GPG文件的智能格式检测）
   * @param {File} file - 文件对象
   * @returns {Promise<string|ArrayBuffer>} 文件内容
   */
  async readFileContent(file) {
    // 对于GPG文件，我们需要更谨慎的处理
    if (file.name.endsWith('.gpg')) {
      return this.readGpgFile(file);
    } else {
      // 非GPG文件，简单读取为文本
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  }

  /**
   * 读取GPG文件，智能检测格式
   * @param {File} file - GPG文件对象
   * @returns {Promise<string|ArrayBuffer>} 文件内容
   */
  async readGpgFile(file) {
    // 首先尝试读取为ArrayBuffer（二进制格式）
    try {
      const binaryResult = await this.readAsArrayBuffer(file);
      const format = detectGpgFormat(binaryResult);

      // 如果检测到是二进制PGP格式，直接返回
      if (format.type === 'binary-packet' || format.type === 'binary') {
        return binaryResult;
      }

      // 如果包含ASCII装甲头部，转换为文本
      if (format.type === 'ascii-armor') {
        try {
          const textContent = new TextDecoder('utf-8', { fatal: false }).decode(binaryResult);
          return textContent;
        } catch (decodeError) {
          // 如果解码失败，返回二进制格式
          return binaryResult;
        }
      }

      // 如果不确定，也尝试读取为文本格式
      const textResult = await this.readAsText(file);
      const trimmed = textResult.trim();

      // 如果包含PGP装甲标记，返回文本
      if (trimmed.startsWith('-----BEGIN PGP MESSAGE-----')) {
        return textResult;
      }

      // 如果文本很短或包含控制字符，很可能是二进制被误读
      if (trimmed.length < 200 || /[\x00-\x08\x0E-\x1F\x7F]/.test(trimmed)) {
        return binaryResult;
      }

      // 默认返回文本（假设是ASCII装甲格式）
      return textResult;
    } catch (error) {
      // 如果二进制读取失败，回退到文本读取
      console.warn('二进制读取失败，回退到文本模式:', error);
      return this.readAsText(file);
    }
  }

  /**
   * 读取文件为ArrayBuffer
   * @param {File} file - 文件对象
   * @returns {Promise<ArrayBuffer>} ArrayBuffer数据
   */
  readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file as binary'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 读取文件为文本
   * @param {File} file - 文件对象
   * @returns {Promise<string>} 文本数据
   */
  readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file as text'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * 解析分片内容
   * @param {string} content - 文件内容
   * @returns {Object|null} 分片数据
   */
  parseShareContent(content) {
    try {
      // 首先尝试直接解析整个内容（适用于单行分片）
      try {
        const trimmedContent = content.trim();
        // 检查是否是GPG格式（以-----BEGIN PGP MESSAGE-----开头）
        if (trimmedContent.startsWith('-----BEGIN PGP MESSAGE-----')) {
          return { encrypted: true, content: trimmedContent };
        }

        // 尝试解析为标准分片
        const shareData = JSON.parse(atob(trimmedContent));
        if (shareData.threshold && shareData.index !== undefined && shareData.data) {
          return shareData;
        }
      } catch (e) {
        // 继续尝试多行解析
      }

      // 尝试解析多行内容
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        try {
          // 检查是否是GPG格式
          if (line.startsWith('-----BEGIN PGP MESSAGE-----')) {
            return { encrypted: true, content: line };
          }

          const shareData = JSON.parse(atob(line));
          if (shareData.threshold && shareData.index !== undefined && shareData.data) {
            return shareData;
          }
        } catch (e) {
          // 继续尝试下一行
        }
      }

      // 如果所有解析都失败，可能是加密分片或其他格式，返回原始内容
      return { encrypted: true, content: content.trim() };
    } catch (error) {
      // 即使解析失败，也返回原始内容，让后续处理决定
      return { encrypted: true, content: content.trim() };
    }
  }

  /**
   * 更新文件列表UI
   */
  updateFilesList() {
    const uploadedFiles = getElement('#uploadedFiles');
    const filesList = getElement('#filesList');

    if (!uploadedFiles || !filesList) return;

    if (this.uploadedFiles.length === 0) {
      toggleElement(uploadedFiles, false);
      return;
    }

    toggleElement(uploadedFiles, true);
    clearElement(filesList);

    this.uploadedFiles.forEach((file, index) => {
      const fileItem = this.createFileItem(file, index);
      filesList.appendChild(fileItem);
    });
  }

  /**
   * 创建文件项
   * @param {Object} file - 文件数据
   * @param {number} index - 文件索引
   * @returns {Element} 文件项元素
   */
  createFileItem(file, index) {
    const fileItem = createElement('div', ['file-item']);

    const fileInfo = createElement('div', ['file-info']);

    const fileIcon = createElement('div', ['file-icon']);
    fileIcon.textContent = file.name.endsWith('.gpg') ? '🔒' : '📄';

    const fileDetails = createElement('div', ['file-details']);

    const fileName = createElement('div', ['file-name']);
    fileName.textContent = file.name;

    const fileStatus = createElement('div', ['file-status', file.status]);
    fileStatus.textContent = this.getFileStatusText(file.status);

    fileDetails.appendChild(fileName);
    fileDetails.appendChild(fileStatus);

    fileInfo.appendChild(fileIcon);
    fileInfo.appendChild(fileDetails);

    const fileRemove = createElement('button', ['file-remove']);
    fileRemove.textContent = '×';
    addEvent(fileRemove, 'click', () => this.removeFile(index));

    fileItem.appendChild(fileInfo);
    fileItem.appendChild(fileRemove);

    return fileItem;
  }

  /**
   * 获取文件状态文本
   * @param {string} status - 状态
   * @returns {string} 状态文本
   */
  getFileStatusText(status) {
    const statusTexts = t('fileStatus');
    if (typeof statusTexts === 'object') {
      return statusTexts[status] || statusTexts.unknown;
    }

    // 回退到英文
    switch (status) {
      case 'processing':
        return 'Processing...';
      case 'valid':
        return 'Valid share';
      case 'invalid':
        return 'Invalid format';
      case 'encrypted':
        return 'Encrypted - awaiting decryption';
      default:
        return 'Unknown status';
    }
  }

  /**
   * 移除文件
   * @param {number} index - 文件索引
   */
  removeFile(index) {
    this.uploadedFiles.splice(index, 1);
    this.updateFilesList();
    this.validateCurrentTab();
  }

  /**
   * 清空所有文件
   */
  clearAllFiles() {
    this.uploadedFiles = [];
    this.hasEncryptedFiles = false;
    this.uploadPassword = '';
    this.updateFilesList();
    this.validateCurrentTab();

    // 隐藏密码输入区域
    this.togglePasswordSection(false);
  }

  /**
   * 验证当前Tab
   */
  validateCurrentTab() {
    if (this.activeTab === 'paste') {
      this.validatePasteInput();
    } else {
      this.validateFileUpload();
    }
  }

  /**
   * 验证粘贴输入
   */
  validatePasteInput() {
    const input = getElement('#recoverInput');
    const statusDiv = getElement('#inputStatus');
    const recoverBtn = getElement('#recoverBtn');

    if (!input || !statusDiv || !recoverBtn) return;

    const inputText = input.value.trim();

    if (!inputText) {
      this.updateStatus('waiting', t('waitingForInput'), statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    const shareStrings = inputText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (shareStrings.length === 0) {
      this.updateStatus('waiting', t('waitingForInput'), statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    const validation = validateShareCollection(shareStrings);
    this.processValidationResult(validation, statusDiv, recoverBtn);
  }

  /**
   * 验证文件上传
   */
  validateFileUpload() {
    const statusDiv = getElement('#uploadStatus');
    const recoverBtn = getElement('#recoverBtn');

    if (!statusDiv || !recoverBtn) return;

    if (this.uploadedFiles.length === 0) {
      this.updateStatus('waiting', t('waitingForUpload'), statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    // 使用统一的验证方法
    this.validateCurrentShares();
  }

  /**
   * 处理验证结果
   * @param {Object} validation - 验证结果
   * @param {Element} statusDiv - 状态显示元素
   * @param {Element} recoverBtn - 恢复按钮
   */
  processValidationResult(validation, statusDiv, recoverBtn) {
    if (!validation.isValid) {
      if (validation.validCount === 0) {
        this.updateStatus('invalid', t('errors.invalidShareFormat'), statusDiv);
      } else if (validation.shareIndices.size !== validation.validCount) {
        this.updateStatus('invalid', t('errors.duplicateShares'), statusDiv);
      } else {
        this.updateStatus('insufficient', t('errors.insufficientShares', validation.threshold, validation.validCount), statusDiv);
      }
      recoverBtn.disabled = true;
    } else {
      this.updateStatus('valid', t('info.validShares', validation.validCount, validation.threshold), statusDiv);
      recoverBtn.disabled = false;
      this.currentThreshold = validation.threshold;
      this.validShareCount = validation.validCount;
    }
  }

  /**
   * 更新状态显示
   * @param {string} status - 状态类型
   * @param {string} message - 状态消息
   * @param {Element} statusDiv - 状态显示元素
   */
  updateStatus(status, message, statusDiv) {
    if (!statusDiv) return;

    // 移除所有状态类
    statusDiv.className = statusDiv.className.replace(/\b(input|upload)-\w+\b/g, '');

    // 添加新的状态类
    const statusClass = statusDiv.id === 'inputStatus' ? `input-${status}` : `upload-${status}`;
    toggleClass(statusDiv, statusClass, true);

    // 设置消息 - 使用安全的DOM操作，防止XSS攻击
    statusDiv.innerHTML = '';
    const spanElement = document.createElement('span');
    spanElement.className = 'status-text';
    spanElement.textContent = message;
    statusDiv.appendChild(spanElement);
  }

  /**
   * 获取当前分片数据
   * @returns {Array} 分片数据数组
   */
  getCurrentShares() {
    if (this.activeTab === 'paste') {
      const input = getElement('#recoverInput');
      if (!input) return [];

      const inputText = input.value.trim();
      if (!inputText) return [];

      return inputText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } else {
      // 返回有效的分片数据对象
      return this.uploadedFiles.filter((file) => file.status === 'valid' && file.shareData).map((file) => file.shareData);
    }
  }

  /**
   * 获取加密密码
   * @returns {string} 加密密码（现在总是返回空字符串，因为使用弹框输入）
   */
  getEncryptionPassword() {
    return '';
  }

  /**
   * 显示错误消息
   * @param {string} message - 错误消息
   */
  showError(message) {
    // 创建临时错误提示
    const errorAlert = createElement('div', ['alert', 'alert-error']);
    errorAlert.style.position = 'fixed';
    errorAlert.style.top = '20px';
    errorAlert.style.right = '20px';
    errorAlert.style.zIndex = '9999';
    errorAlert.style.maxWidth = '400px';
    errorAlert.textContent = message;

    document.body.appendChild(errorAlert);

    // 3秒后自动移除
    setTimeout(() => {
      if (errorAlert.parentNode) {
        errorAlert.parentNode.removeChild(errorAlert);
      }
    }, 3000);
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.uploadedFiles = [];
    this.parsedShares = [];
    this.isEncryptionEnabled = false;
    this.encryptionPassword = '';
    this.currentThreshold = 0;
    this.validShareCount = 0;
    this.pendingFiles = [];
    this.hasEncryptedFiles = false;
  }

  /**
   * 设置加密密码输入框
   */
  setupEncryptionPassword() {
    const passwordInput = getElement('#uploadEncryptionPassword');
    const passwordToggle = getElement('#uploadPasswordToggleBtn');
    const applyBtn = getElement('#applyDecryptionBtn');
    const skipBtn = getElement('#skipDecryptionBtn');

    if (!passwordInput || !passwordToggle || !applyBtn || !skipBtn) return;

    // 密码输入事件
    addEvent(passwordInput, 'input', () => {
      this.uploadPassword = passwordInput.value;
      // 移除密码复杂度检验
    });

    // 密码可见性切换
    addEvent(passwordToggle, 'click', () => {
      this.togglePasswordVisibility();
    });

    // 应用解密按钮
    addEvent(applyBtn, 'click', () => {
      this.applyDecryption();
    });

    // 跳过解密按钮
    addEvent(skipBtn, 'click', () => {
      this.skipDecryption();
    });

    // 回车键应用解密
    addEvent(passwordInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        this.applyDecryption();
      }
    });
  }

  /**
   * 切换密码可见性
   */
  togglePasswordVisibility() {
    const passwordInput = getElement('#uploadEncryptionPassword');
    const passwordToggle = getElement('#uploadPasswordToggleBtn');

    if (!passwordInput || !passwordToggle) return;

    this.passwordVisible = !this.passwordVisible;
    passwordInput.type = this.passwordVisible ? 'text' : 'password';
    passwordToggle.querySelector('.password-toggle-icon').textContent = this.passwordVisible ? 'Hide' : 'Show';
  }

  
  /**
   * 显示或隐藏密码输入区域
   * @param {boolean} show - 是否显示
   * @param {boolean} hasEncryptedFiles - 是否有加密文件
   */
  togglePasswordSection(show, hasEncryptedFiles = false) {
    const passwordSection = getElement('#encryptionPasswordSection');
    const uploadArea = getElement('#uploadArea');

    if (!passwordSection || !uploadArea) return;

    if (show && hasEncryptedFiles) {
      // 显示密码输入区域
      toggleElement(passwordSection, true);

      // 添加加密文件指示器
      this.addEncryptedFilesIndicator();

      // 聚焦到密码输入框
      setTimeout(() => {
        const passwordInput = getElement('#uploadEncryptionPassword');
        if (passwordInput) passwordInput.focus();
      }, 100);
    } else {
      // 隐藏密码输入区域
      toggleElement(passwordSection, false);
      this.removeEncryptedFilesIndicator();
    }
  }

  /**
   * 添加加密文件指示器
   */
  addEncryptedFilesIndicator() {
    const uploadArea = getElement('#uploadArea');
    if (!uploadArea) return;

    // 检查是否已存在指示器
    if (uploadArea.querySelector('.encrypted-files-indicator')) return;

    const indicator = createElement('div', ['encrypted-files-indicator']);

    // 创建安全的DOM结构，防止XSS攻击
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.textContent = '🔒';
    indicator.appendChild(iconSpan);

    const textSpan = document.createElement('span');
    textSpan.textContent = t('encryption.encryptedFileDetected') || '检测到加密文件，需要输入密码进行解密';
    indicator.appendChild(textSpan);

    // 插入到上传区域之前
    uploadArea.parentNode.insertBefore(indicator, uploadArea);
  }

  /**
   * 移除加密文件指示器
   */
  removeEncryptedFilesIndicator() {
    const indicator = document.querySelector('.encrypted-files-indicator');
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }

  /**
   * 应用解密
   */
  async applyDecryption() {
    if (!this.uploadPassword) {
      this.showError(t('encryption.passwordRequired') || '请输入解密密码');
      return;
    }

    // 获取所有加密文件
    const encryptedFiles = this.uploadedFiles.filter((file) => file.status === 'encrypted');

    if (encryptedFiles.length === 0) {
      this.showError(t('encryption.noEncryptedFiles') || '没有需要解密的文件');
      return;
    }

    // 尝试解密所有加密文件
    await this.retryDecryption(encryptedFiles, this.uploadPassword);

    // 隐藏密码输入区域
    this.togglePasswordSection(false);
  }

  /**
   * 跳过解密
   */
  skipDecryption() {
    // 隐藏密码输入区域
    this.togglePasswordSection(false);

    // 验证当前状态（只考虑未加密的文件）
    this.validateCurrentShares();
  }
}
