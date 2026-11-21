/**
 * 恢复Tab管理器
 * 负责处理tab切换、文件上传和分片解析功能
 * 加密分片在恢复前通过内联密码区解密，恢复入口统一消费标准分片对象
 */

import { getElement, createElement, toggleElement, toggleClass, clearElement, addEvent } from '../utils/dom.js';
import { debounce } from '../utils/helpers.js';
import { parseShareData, validateShareCollection } from '../utils/validation.js';
import { decryptWithPassword, PGP_ARMOR_HEADER } from '../utils/encryption.js';
import { UI_CONFIG, SELECTORS, CSS_CLASSES } from '../constants/index.js';
import { Toast } from './Toast.js';

export class RecoveryTabManager {
  constructor() {
    this.activeTab = 'paste'; // 'paste' | 'upload'
    this.uploadedFiles = [];
    this.uploadPassword = ''; // 上传文件时的解密密码
    this.passwordVisible = false;

    this.init();
  }

  /**
   * 初始化
   */
  init() {
    this.setupTabSwitching();
    this.setupFileUpload();
    this.setupEncryptionPassword();
    this.setupRecoverInputListener();
  }

  /**
   * 粘贴输入框监听（防抖，避免逐字符解析分片造成卡顿）
   */
  setupRecoverInputListener() {
    const input = getElement(SELECTORS.RECOVER_INPUT);
    addEvent(input, 'input', debounce(() => this.validateCurrentTab(), UI_CONFIG.DELAY.DEBOUNCE));
  }

  /**
   * 设置Tab切换
   */
  setupTabSwitching() {
    addEvent(getElement(SELECTORS.PASTE_TAB_BTN), 'click', () => this.switchTab('paste'));
    addEvent(getElement(SELECTORS.UPLOAD_TAB_BTN), 'click', () => this.switchTab('upload'));
  }

  /**
   * 切换Tab
   * @param {string} tabType - Tab类型
   */
  switchTab(tabType) {
    if (this.activeTab === tabType) return;

    const isPaste = tabType === 'paste';
    toggleClass(getElement(SELECTORS.PASTE_TAB_BTN), CSS_CLASSES.ACTIVE, isPaste);
    toggleClass(getElement(SELECTORS.UPLOAD_TAB_BTN), CSS_CLASSES.ACTIVE, !isPaste);
    toggleClass(getElement(SELECTORS.PASTE_TAB), CSS_CLASSES.ACTIVE, isPaste);
    toggleClass(getElement(SELECTORS.UPLOAD_TAB), CSS_CLASSES.ACTIVE, !isPaste);

    // 清空上一个tab的结果显示
    const prevResult = getElement(
      this.activeTab === 'paste' ? SELECTORS.PASTE_RECOVER_RESULT : SELECTORS.UPLOAD_RECOVER_RESULT,
    );
    clearElement(prevResult);

    this.activeTab = tabType;

    // 切换Tab后重新验证状态
    this.validateCurrentTab();
  }

  /**
   * 设置文件上传（点击选择 + 拖放）
   */
  setupFileUpload() {
    const uploadArea = getElement(SELECTORS.UPLOAD_AREA);
    const fileInput = getElement(SELECTORS.FILE_INPUT);

    addEvent(getElement(SELECTORS.SELECT_FILES_BTN), 'click', () => {
      fileInput.click();
    });

    // 点击整个上传区域（按钮除外，避免重复触发）也可选择文件
    addEvent(uploadArea, 'click', (e) => {
      if (e.target.closest('.upload-btn')) return;
      fileInput.click();
    });

    addEvent(fileInput, 'change', () => {
      this.handleFileSelect(fileInput.files);
    });

    addEvent(getElement(SELECTORS.CLEAR_FILES_BTN), 'click', () => {
      this.clearAllFiles();
    });

    addEvent(uploadArea, 'dragover', (e) => {
      e.preventDefault();
      toggleClass(uploadArea, 'dragover', true);
    });

    addEvent(uploadArea, 'dragleave', () => {
      toggleClass(uploadArea, 'dragover', false);
    });

    addEvent(uploadArea, 'drop', (e) => {
      e.preventDefault();
      toggleClass(uploadArea, 'dragover', false);
      this.handleFileSelect(e.dataTransfer.files);
    });
  }

  /**
   * 处理文件选择
   * @param {FileList} files - 文件列表
   */
  async handleFileSelect(files) {
    if (!files?.length) return;

    // 验证文件类型和大小
    const validFiles = this.validateFiles(files);
    if (validFiles.length === 0) return;

    await this.processFiles(validFiles);

    // 存在加密文件时展开密码输入区
    if (validFiles.some((file) => file.name.endsWith('.gpg'))) {
      this.togglePasswordSection(true);
    }
  }

  /**
   * 处理文件列表
   * @param {File[]} files - 文件列表
   */
  async processFiles(files) {
    for (const file of files) {
      await this.processFile(file);
    }

    this.updateFilesList();
    this.validateCurrentTab();
  }

  /**
   * 验证文件
   * @param {FileList} files - 文件列表
   * @returns {File[]} 有效文件列表
   */
  validateFiles(files) {
    const validFiles = [];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

      if (!['.txt', '.gpg'].includes(fileExtension)) {
        Toast.error(`不支持的文件类型：${file.name}`);
        continue;
      }

      if (file.size > maxSize) {
        Toast.error(`文件过大：${file.name}`);
        continue;
      }

      if (this.uploadedFiles.some((f) => f.name === file.name)) {
        Toast.error(`重复文件：${file.name}`);
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
    const fileData = {
      name: file.name,
      content: null,
      status: 'processing',
      shareData: null,
      isEncrypted: file.name.endsWith('.gpg'),
    };
    this.uploadedFiles.push(fileData);

    try {
      fileData.content = await this.readFileContent(file);

      if (fileData.isEncrypted) {
        // 加密文件等待用户在内联密码区解密
        fileData.status = 'encrypted';
        return;
      }

      fileData.shareData = this.parseShareText(fileData.content);
      fileData.status = fileData.shareData ? 'valid' : 'invalid';
    } catch (error) {
      fileData.status = 'invalid';
    }
  }

  /**
   * 读取文件内容：.gpg 读取二进制后按是否为 ASCII 装甲决定返回文本或二进制
   * @param {File} file - 文件对象
   * @returns {Promise<string|ArrayBuffer>} 文件内容
   */
  async readFileContent(file) {
    if (file.name.endsWith('.gpg')) {
      const buffer = await this.readFileAs(file, 'readAsArrayBuffer');
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      return text.startsWith(PGP_ARMOR_HEADER) ? text : buffer;
    }
    return this.readFileAs(file, 'readAsText');
  }

  /**
   * 读取文件（FileReader 的 Promise 封装）
   * @param {File} file - 文件对象
   * @param {'readAsArrayBuffer'|'readAsText'} method - FileReader 读取方法
   * @returns {Promise<string|ArrayBuffer>} 读取结果
   */
  readFileAs(file, method) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader[method](file);
    });
  }

  /**
   * 解析分片文本：先整体解析，失败则逐行扫描
   * （兼容 .txt 中带说明头部的格式，取第一个有效分片）
   * @param {string} content - 文件内容
   * @returns {Object|null} 分片数据
   */
  parseShareText(content) {
    const whole = parseShareData(content);
    if (whole) return whole;

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const data = parseShareData(line);
      if (data) return data;
    }

    return null;
  }

  /**
   * 尝试用密码解密所有加密文件
   * @param {Object[]} encryptedFiles - 加密文件列表
   * @param {string} password - 密码
   * @returns {Promise<boolean>} 是否至少成功解密一个文件
   */
  async decryptEncryptedFiles(encryptedFiles, password) {
    let successCount = 0;

    for (const file of encryptedFiles) {
      try {
        const decryptedContent = await decryptWithPassword(file.content, password);
        file.shareData = this.parseShareText(decryptedContent);
        file.status = file.shareData ? 'valid' : 'invalid';
        if (file.shareData) successCount++;
      } catch (error) {
        // 密码错误保持 encrypted 以便重试；格式问题标记 invalid
        if (!error.message.includes('密码错误')) {
          file.status = 'invalid';
        }
      }
    }

    this.updateFilesList();
    this.validateCurrentTab();
    return successCount > 0;
  }

  /**
   * 更新文件列表UI
   */
  updateFilesList() {
    const uploadedFiles = getElement(SELECTORS.UPLOADED_FILES);
    const filesList = getElement(SELECTORS.FILES_LIST);

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
    fileIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${file.isEncrypted ? 'i-lock' : 'i-file'}"/></svg>`;

    const fileDetails = createElement('div', ['file-details']);

    const fileName = createElement('div', ['file-name']);
    fileName.textContent = file.name;

    const fileStatus = createElement('div', ['file-status', file.status]);
    fileStatus.textContent = this.getFileStatusText(file.status);

    fileDetails.appendChild(fileName);
    fileDetails.appendChild(fileStatus);

    fileInfo.appendChild(fileIcon);
    fileInfo.appendChild(fileDetails);

    const fileRemove = createElement('button', ['file-remove'], { type: 'button', 'aria-label': `移除文件 ${file.name}` });
    fileRemove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-cross"/></svg>';
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
    const statusTexts = {
      processing: '处理中...',
      valid: '有效分片',
      invalid: '格式无效',
      encrypted: '加密文件 - 等待解密',
    };
    return statusTexts[status] || statusTexts.invalid;
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
    const input = getElement(SELECTORS.RECOVER_INPUT);
    const statusDiv = getElement(SELECTORS.INPUT_STATUS);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    const inputText = input.value.trim();
    if (!inputText) {
      this.updateStatus('waiting', '等待输入分片...', statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    const shareStrings = inputText.split('\n').filter((line) => line.trim().length > 0);
    this.processValidationResult(validateShareCollection(shareStrings), statusDiv, recoverBtn);
  }

  /**
   * 验证文件上传
   */
  validateFileUpload() {
    const statusDiv = getElement(SELECTORS.UPLOAD_STATUS);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    if (this.uploadedFiles.length === 0) {
      this.updateStatus('waiting', '等待文件上传...', statusDiv);
      recoverBtn.disabled = true;
      return;
    }

    this.validateCurrentShares();
  }

  /**
   * 验证当前已上传文件中的分片
   */
  validateCurrentShares() {
    const statusDiv = getElement(SELECTORS.UPLOAD_STATUS);
    const recoverBtn = getElement(SELECTORS.RECOVER_BTN);

    const allShares = this.uploadedFiles
      .filter((file) => file.status === 'valid' && file.shareData)
      .map((file) => file.shareData);
    const encryptedFiles = this.uploadedFiles.filter((file) => file.status === 'encrypted');

    if (allShares.length === 0) {
      if (encryptedFiles.length > 0) {
        this.updateStatus('insufficient', '存在待解密的加密文件，请先输入密码解密', statusDiv);
      } else {
        this.updateStatus('invalid', '没有找到有效的分片数据', statusDiv);
      }
      recoverBtn.disabled = true;
      return;
    }

    this.processValidationResult(validateShareCollection(allShares), statusDiv, recoverBtn);
  }

  /**
   * 处理验证结果
   * @param {Object} validation - validateShareCollection 的返回值
   * @param {Element} statusDiv - 状态显示元素
   * @param {Element} recoverBtn - 恢复按钮
   */
  processValidationResult(validation, statusDiv, recoverBtn) {
    if (validation.validCount === 0) {
      this.updateStatus('invalid', '无效的分片格式。请检查您的输入。', statusDiv);
    } else if (validation.hasDuplicates) {
      this.updateStatus('invalid', '检测到重复的分片。每个分片应该是唯一的。', statusDiv);
    } else if (!validation.isValid) {
      this.updateStatus('insufficient', `分片数量不足。至少需要 ${validation.threshold} 个分片，但只提供了 ${validation.validCount} 个。`, statusDiv);
    } else {
      this.updateStatus('valid', `检测到 ${validation.validCount} 个有效分片（需要 ${validation.threshold} 个），可以开始恢复`, statusDiv);
    }

    recoverBtn.disabled = !validation.isValid;
  }

  /**
   * 更新状态显示
   * @param {string} status - 状态类型：'waiting' | 'valid' | 'invalid' | 'insufficient'
   * @param {string} message - 状态消息
   * @param {Element} statusDiv - 状态显示元素
   */
  updateStatus(status, message, statusDiv) {
    const prefix = statusDiv.id === 'inputStatus' ? 'input' : 'upload';
    statusDiv.className = `${prefix}-status ${prefix}-${status}`;

    const text = createElement('span', ['status-text']);
    text.textContent = message;
    statusDiv.replaceChildren(text);
  }

  /**
   * 获取当前分片数据（统一为标准分片对象）
   * @returns {Object[]} 分片对象数组
   */
  getCurrentShares() {
    if (this.activeTab === 'paste') {
      return getElement(SELECTORS.RECOVER_INPUT)
        .value.split('\n')
        .map((line) => parseShareData(line))
        .filter((data) => data?.threshold && data.index !== undefined && data.data);
    }

    return this.uploadedFiles
      .filter((file) => file.status === 'valid' && file.shareData)
      .map((file) => file.shareData);
  }

  /**
   * 清空恢复侧全部输入与状态（"擦除"动作使用）
   */
  clearAll() {
    getElement(SELECTORS.RECOVER_INPUT).value = '';
    getElement(SELECTORS.UPLOAD_ENCRYPTION_PASSWORD).value = '';
    this.uploadedFiles = [];
    this.uploadPassword = '';

    this.updateFilesList();
    this.togglePasswordSection(false);

    this.updateStatus('waiting', '等待输入分片...', getElement(SELECTORS.INPUT_STATUS));
    this.updateStatus('waiting', '等待文件上传...', getElement(SELECTORS.UPLOAD_STATUS));
    clearElement(getElement(SELECTORS.PASTE_RECOVER_RESULT));
    clearElement(getElement(SELECTORS.UPLOAD_RECOVER_RESULT));
    getElement(SELECTORS.RECOVER_BTN).disabled = true;
  }

  /**
   * 设置加密密码输入框
   */
  setupEncryptionPassword() {
    const passwordInput = getElement(SELECTORS.UPLOAD_ENCRYPTION_PASSWORD);

    addEvent(passwordInput, 'input', () => {
      this.uploadPassword = passwordInput.value;
    });

    // 密码可见性切换
    addEvent(getElement(SELECTORS.UPLOAD_PASSWORD_TOGGLE_BTN), 'click', () => {
      this.togglePasswordVisibility();
    });

    // 应用解密按钮
    addEvent(getElement(SELECTORS.APPLY_DECRYPTION_BTN), 'click', () => {
      this.applyDecryption();
    });

    // 跳过解密按钮
    addEvent(getElement(SELECTORS.SKIP_DECRYPTION_BTN), 'click', () => {
      this.togglePasswordSection(false);
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
    this.passwordVisible = !this.passwordVisible;
    const passwordInput = getElement(SELECTORS.UPLOAD_ENCRYPTION_PASSWORD);
    passwordInput.type = this.passwordVisible ? 'text' : 'password';
    getElement(SELECTORS.UPLOAD_PASSWORD_TOGGLE_BTN).querySelector('.password-toggle-icon').textContent =
      this.passwordVisible ? '隐藏' : '显示';
  }

  /**
   * 显示或隐藏密码输入区域
   * @param {boolean} show - 是否显示
   */
  togglePasswordSection(show) {
    toggleElement(getElement(SELECTORS.ENCRYPTION_PASSWORD_SECTION), show);

    if (show) {
      this.addEncryptedFilesIndicator();

      // 等待过渡动画使元素可见后再聚焦
      setTimeout(() => {
        getElement(SELECTORS.UPLOAD_ENCRYPTION_PASSWORD).focus();
      }, 100);
    } else {
      this.removeEncryptedFilesIndicator();
    }
  }

  /**
   * 添加加密文件指示器
   */
  addEncryptedFilesIndicator() {
    const uploadArea = getElement(SELECTORS.UPLOAD_AREA);
    // 指示器插入在上传区域之前，需在父节点上查重
    if (uploadArea.parentNode.querySelector('.encrypted-files-indicator')) return;

    const indicator = createElement('div', ['encrypted-files-indicator']);

    const iconSpan = createElement('span', ['icon']);
    iconSpan.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg>';

    const textSpan = createElement('span');
    textSpan.textContent = '检测到加密文件，需要输入密码进行解密';

    indicator.append(iconSpan, textSpan);
    uploadArea.parentNode.insertBefore(indicator, uploadArea);
  }

  /**
   * 移除加密文件指示器
   */
  removeEncryptedFilesIndicator() {
    document.querySelector('.encrypted-files-indicator')?.remove();
  }

  /**
   * 应用解密
   */
  async applyDecryption() {
    if (!this.uploadPassword) {
      Toast.error('解密需要密码');
      return;
    }

    const encryptedFiles = this.uploadedFiles.filter((file) => file.status === 'encrypted');
    if (encryptedFiles.length === 0) {
      Toast.error('没有需要解密的文件');
      return;
    }

    const anyDecrypted = await this.decryptEncryptedFiles(encryptedFiles, this.uploadPassword);

    if (anyDecrypted) {
      this.togglePasswordSection(false);
    } else {
      // 密码错误：保持密码区打开，允许用户原地重试
      Toast.error('密码无效，请检查后重试');
      getElement(SELECTORS.UPLOAD_ENCRYPTION_PASSWORD).focus();
    }
  }
}
