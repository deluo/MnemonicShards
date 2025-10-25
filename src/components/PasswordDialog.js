/**
 * 密码输入对话框组件
 * 用于简化密码输入流程，支持密码错误重试
 */

import { getElement, createElement, toggleElement, addEvent } from '../utils/dom.js';
import { t } from '../utils/i18n.js';

export class PasswordDialog {
  constructor() {
    this.isVisible = false;
    this.currentPassword = '';
    this.resolveCallback = null;
    this.rejectCallback = null;
    this.isRetry = false;
  }

  /**
   * 显示密码输入对话框
   * @param {boolean} isRetry - 是否是重试（密码错误后）
   * @returns {Promise<string>} 返回用户输入的密码
   */
  show(isRetry = false) {
    return new Promise((resolve, reject) => {
      this.isRetry = isRetry;
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
      this.createDialog();
      this.isVisible = true;
    });
  }

  /**
   * 创建对话框
   */
  createDialog() {
    // 如果对话框已存在，先移除
    this.removeDialog();

    // 创建遮罩层
    const overlay = createElement('div', ['password-dialog-overlay']);

    // 创建对话框容器
    const dialog = createElement('div', ['password-dialog']);

    // 创建标题
    const title = createElement('h3', ['password-dialog-title']);
    title.textContent = this.isRetry ? t('passwordDialog.retryTitle') : t('passwordDialog.title');

    // 创建消息
    const message = createElement('p', ['password-dialog-message']);
    message.textContent = this.isRetry ? t('passwordDialog.retryMessage') : t('passwordDialog.message');

    // 创建密码输入组
    const inputGroup = createElement('div', ['password-input-group']);

    const label = createElement('label', ['password-label']);
    label.setAttribute('for', 'dialogPasswordInput');
    label.textContent = t('encryption.passwordLabel');

    // 创建密码输入容器
    const passwordWrapper = createElement('div', ['password-input-wrapper']);

    const input = createElement('input', ['password-input']);
    input.id = 'dialogPasswordInput';
    input.type = 'password';
    input.placeholder = t('encryption.passwordPlaceholder');
    input.autocomplete = 'new-password';

    // 创建密码可见/隐藏切换按钮
    const toggleBtn = createElement('button', ['password-toggle-btn']);
    toggleBtn.type = 'button';
    toggleBtn.innerHTML = '👁️';
    toggleBtn.setAttribute('aria-label', 'Toggle password visibility');

    passwordWrapper.appendChild(input);
    passwordWrapper.appendChild(toggleBtn);

    inputGroup.appendChild(label);
    inputGroup.appendChild(passwordWrapper);

    // 创建按钮组
    const buttonGroup = createElement('div', ['password-dialog-buttons']);

    const confirmBtn = createElement('button', ['btn', 'btn-primary']);
    confirmBtn.textContent = t('passwordDialog.confirm');
    confirmBtn.id = 'dialogConfirmBtn';

    const cancelBtn = createElement('button', ['btn', 'btn-secondary']);
    cancelBtn.textContent = t('passwordDialog.cancel');
    cancelBtn.id = 'dialogCancelBtn';

    buttonGroup.appendChild(confirmBtn);
    buttonGroup.appendChild(cancelBtn);

    // 组装对话框
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(inputGroup);
    dialog.appendChild(buttonGroup);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 设置事件监听
    this.setupEventListeners(input, confirmBtn, cancelBtn, toggleBtn);

    // 聚焦到密码输入框
    setTimeout(() => input.focus(), 100);
  }

  /**
   * 设置事件监听器
   * @param {Element} input - 密码输入框
   * @param {Element} confirmBtn - 确认按钮
   * @param {Element} cancelBtn - 取消按钮
   * @param {Element} toggleBtn - 密码可见/隐藏切换按钮
   */
  setupEventListeners(input, confirmBtn, cancelBtn, toggleBtn) {
    // 密码输入事件
    addEvent(input, 'input', () => {
      this.currentPassword = input.value;
    });

    // 密码可见/隐藏切换
    addEvent(toggleBtn, 'click', () => {
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
      toggleBtn.innerHTML = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    // 回车键确认
    addEvent(input, 'keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleConfirm();
      }
    });

    // 确认按钮点击
    addEvent(confirmBtn, 'click', () => {
      this.handleConfirm();
    });

    // 取消按钮点击
    addEvent(cancelBtn, 'click', () => {
      this.handleCancel();
    });

    // 点击遮罩层关闭
    const overlay = getElement('.password-dialog-overlay');
    if (overlay) {
      addEvent(overlay, 'click', (e) => {
        if (e.target === overlay) {
          this.handleCancel();
        }
      });
    }
  }

  /**
   * 处理确认操作
   */
  handleConfirm() {
    if (!this.currentPassword) {
      // 显示错误提示
      const input = getElement('#dialogPasswordInput');
      if (input) {
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 2000);
      }
      return;
    }

    this.removeDialog();
    this.isVisible = false;

    if (this.resolveCallback) {
      this.resolveCallback(this.currentPassword);
    }
  }

  /**
   * 处理取消操作
   */
  handleCancel() {
    this.removeDialog();
    this.isVisible = false;

    if (this.rejectCallback) {
      this.rejectCallback(new Error('User cancelled password input'));
    }
  }

  /**
   * 移除对话框
   */
  removeDialog() {
    const overlay = getElement('.password-dialog-overlay');
    if (overlay) {
      document.body.removeChild(overlay);
    }
  }

  /**
   * 检查对话框是否可见
   * @returns {boolean} 是否可见
   */
  isDialogVisible() {
    return this.isVisible;
  }
}

// 创建全局实例
export const passwordDialog = new PasswordDialog();
