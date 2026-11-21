/**
 * 助记词输入组件
 * 负责处理助记词输入、验证和自动完成功能
 * 错误与提示通过固定高度状态条（#wordsStatusbar）展示，避免布局抖动
 */

import { getElement, createElement, toggleElement, toggleClass, addEvent, clearElement } from '../utils/dom.js';
import { isValidBIP39Word } from '../utils/validation.js';
import { debounce } from '../utils/helpers.js';
import { BIP39_WORDLIST } from '../constants/bip39-words.js';
import { UI_CONFIG, SELECTORS, CSS_CLASSES } from '../constants/index.js';
import { Toast } from './Toast.js';

export class MnemonicInput {
  /**
   * @param {number} wordCount - 初始助记词数量
   * @param {Object} [options] - 可选配置
   * @param {Function} [options.onWordCountAutoSwitch] - 粘贴完整助记词后自动切换词数时的回调
   */
  constructor(wordCount = 12, options = {}) {
    this.wordCount = wordCount;
    this.onWordCountAutoSwitch = options.onWordCountAutoSwitch;
    // 联想状态：输入框索引 -> { values: string[], activeIndex: number }
    this.suggestionState = new Map();

    // 点击输入区外时立即收起所有联想
    this.outsidePointerDownHandler = (e) => {
      if (e.target.closest('.input-wrapper')) return;
      this.hideAllSuggestions();
    };
    document.addEventListener('pointerdown', this.outsidePointerDownHandler);
  }

  /**
   * 设置助记词数量
   * @param {number} count - 助记词数量
   */
  setWordCount(count) {
    this.wordCount = count;
    this.renderInputs();
  }

  /**
   * 渲染输入框
   */
  renderInputs() {
    const container = getElement(SELECTORS.WORDS_GRID);
    if (!container) return;

    // 保存当前输入的值
    const currentValues = new Map();
    for (let i = 1; i <= this.wordCount; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (input && input.value.trim()) {
        currentValues.set(i, input.value.trim());
      }
    }

    clearElement(container);

    for (let i = 1; i <= this.wordCount; i++) {
      const wordInput = this.createWordInput(i);
      container.appendChild(wordInput);

      // 恢复之前输入的值
      if (currentValues.has(i)) {
        const input = getElement(SELECTORS.WORD_INPUT(i));
        if (input) {
          input.value = currentValues.get(i);
          // 恢复验证样式
          this.validateAndStyleInput(input, i);
        }
      }
    }

    this.refreshStatusbar();
  }

  /**
   * 创建单个助记词输入框
   * @param {number} index - 输入框索引
   * @returns {Element} 输入框元素
   */
  createWordInput(index) {
    const wrapper = createElement('div', ['word-input']);

    const inputContainer = createElement('div', ['input-wrapper']);

    const input = createElement('input', [], {
      type: 'text',
      id: `word${index}`,
      placeholder: '',
      autocomplete: 'off',
      // 关闭拼写检查与移动端自动大写/纠正，避免输入被静默改写
      spellcheck: 'false',
      autocapitalize: 'off',
      autocorrect: 'off',
      // ARIA combobox 模式：联想列表可键盘操作
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': 'false',
      'aria-controls': `suggestions${index}`,
    });

    const label = createElement('label', [], {
      for: `word${index}`,
    });
    label.textContent = `${index}. 单词`;

    const suggestionsDiv = createElement('div', ['autocomplete-suggestions'], {
      id: `suggestions${index}`,
      role: 'listbox',
    });

    inputContainer.appendChild(input);
    inputContainer.appendChild(label);
    inputContainer.appendChild(suggestionsDiv);
    wrapper.appendChild(inputContainer);

    this.attachInputListeners(input, index);

    return wrapper;
  }

  /**
   * 为输入框添加事件监听器
   * @param {Element} input - 输入框元素
   * @param {number} index - 输入框索引
   */
  attachInputListeners(input, index) {
    const debouncedHandler = debounce(() => {
      this.handleInputChange(input, index);
    }, UI_CONFIG.DELAY.DEBOUNCE);

    addEvent(input, 'input', debouncedHandler);

    // 失焦时立即校验并收起联想（选中建议由 mousedown preventDefault 保证不触发失焦）
    addEvent(input, 'blur', () => {
      this.validateAndStyleInput(input, index);
      this.hideSuggestions(index);
    });

    addEvent(input, 'focus', (e) => {
      if (e.target.value.trim().length > 0) {
        this.handleInputChange(input, index);
      }
    });

    // 在第一个输入框粘贴完整助记词时自动分发到各输入框
    addEvent(input, 'paste', (e) => this.handlePaste(e, index));

    // 键盘导航：联想可见时 ↑↓ 选择、Enter 选中、Esc 关闭；否则 Enter 跳格
    addEvent(input, 'keydown', (e) => this.handleInputKeydown(e, input, index));
  }

  /**
   * 处理输入框键盘事件
   * @param {KeyboardEvent} e - 键盘事件
   * @param {Element} input - 输入框元素
   * @param {number} index - 输入框索引
   */
  handleInputKeydown(e, input, index) {
    const state = this.suggestionState.get(index);

    if (state && state.values.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveActiveSuggestion(index, 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveActiveSuggestion(index, -1);
        return;
      }
      if (e.key === 'Enter') {
        // 联想可见时 Enter 选中高亮项，不再跳格
        e.preventDefault();
        e.stopPropagation();
        this.selectWord(state.values[state.activeIndex], index);
        return;
      }
      if (e.key === 'Escape') {
        this.hideSuggestions(index);
        return;
      }
    }

    if (e.key !== 'Enter') return;
    e.preventDefault();

    const nextInput = getElement(SELECTORS.WORD_INPUT(index + 1));
    if (nextInput) {
      nextInput.focus();
    } else {
      getElement(SELECTORS.GENERATE_BTN).click();
    }
  }

  /**
   * 处理粘贴事件：完整助记词（多个单词）粘贴到第一个输入框时自动分发
   * @param {ClipboardEvent} e - 粘贴事件
   * @param {number} index - 输入框索引
   */
  handlePaste(e, index) {
    if (index !== 1) return;

    const words = e.clipboardData
      .getData('text')
      .trim()
      .split(/[\s,;、，；]+/)
      .filter(Boolean)
      .map((word) => word.toLowerCase());

    // 单个单词按正常粘贴处理
    if (words.length <= 1) return;

    e.preventDefault();

    // 粘贴 12/24 个单词时自动切换到对应的输入模式
    if (words.length !== this.wordCount && (words.length === 12 || words.length === 24) && this.onWordCountAutoSwitch) {
      this.onWordCountAutoSwitch(words.length);
    }

    const count = Math.min(words.length, this.wordCount);
    for (let i = 1; i <= count; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (!input) break;
      input.value = words[i - 1];
      this.validateAndStyleInput(input, i);
    }

    // 粘贴的词数超过输入框数量时多余部分会被丢弃，必须显式告知避免静默丢失
    if (words.length > this.wordCount) {
      Toast.info(`检测到 ${words.length} 个单词，已填入前 ${this.wordCount} 个，请核对助记词长度是否为 ${this.wordCount} 词`);
    }

    // 聚焦到下一个未填写的输入框，方便继续输入或补齐
    const nextIndex = Math.min(count + 1, this.wordCount);
    getElement(SELECTORS.WORD_INPUT(nextIndex))?.focus();
    this.refreshStatusbar();
  }

  /**
   * 处理输入变化
   * @param {Element} input - 输入框元素
   * @param {number} index - 输入框索引
   */
  handleInputChange(input, index) {
    const value = input.value.trim().toLowerCase();

    if (value.length === 0) {
      this.hideSuggestions(index);
      this.refreshStatusbar();
      return;
    }

    // 仅在输入框持有焦点时显示联想，避免自动填充等无焦点输入留下悬空建议
    if (document.activeElement !== input) {
      this.hideSuggestions(index);
      this.refreshStatusbar();
      return;
    }

    // 显示建议
    this.showSuggestions(value, index);
    this.refreshStatusbar();
  }

  /**
   * 验证并样式化输入框
   * @param {Element} input - 输入框元素
   * @param {number} index - 输入框索引
   */
  validateAndStyleInput(input, index) {
    const value = input.value.trim();

    if (value.length === 0) {
      toggleClass(input, CSS_CLASSES.VALID_WORD, false);
      toggleClass(input, CSS_CLASSES.INVALID_WORD, false);
    } else if (isValidBIP39Word(value)) {
      toggleClass(input, CSS_CLASSES.INVALID_WORD, false);
      toggleClass(input, CSS_CLASSES.VALID_WORD, true);
    } else {
      // 只标红提示，不清空用户输入（清空会导致用户正在抄录的内容被静默删除）
      toggleClass(input, CSS_CLASSES.VALID_WORD, false);
      toggleClass(input, CSS_CLASSES.INVALID_WORD, true);
    }

    this.refreshStatusbar();
  }

  /**
   * 更新状态条：错误（无效词）> 警告（重复词）> 正常（全部有效）> 静默
   * 固定高度，状态切换不引起布局抖动
   */
  refreshStatusbar() {
    let firstInvalidIndex = -1;
    const filled = [];

    for (let i = 1; i <= this.wordCount; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (!input) continue;

      const value = input.value.trim();
      if (!value) continue;

      filled.push(value.toLowerCase());
      if (firstInvalidIndex === -1 && !isValidBIP39Word(value)) {
        firstInvalidIndex = i;
      }
    }

    if (firstInvalidIndex !== -1) {
      this.setStatusbar('error', `第 ${firstInvalidIndex} 个单词不是有效的 BIP39 单词，请修正后再生成分片`);
      return;
    }

    const duplicates = new Set();
    const seen = new Set();
    for (const word of filled) {
      if (seen.has(word)) {
        duplicates.add(word);
      } else {
        seen.add(word);
      }
    }

    this.updateDuplicateStyling(duplicates);

    if (duplicates.size > 0) {
      this.setStatusbar('warn', `检测到重复单词：${Array.from(duplicates).join('、')}（BIP39 允许重复，请核对输入）`);
      return;
    }

    if (filled.length === this.wordCount) {
      this.setStatusbar('ok', `${this.wordCount} 个单词全部有效`);
      return;
    }

    this.setStatusbar(null);
  }

  /**
   * 更新重复单词的字段样式
   * @param {Set} duplicates - 重复单词集合
   */
  updateDuplicateStyling(duplicates) {
    for (let i = 1; i <= this.wordCount; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (!input) continue;

      const word = input.value.trim().toLowerCase();
      const isDuplicate = word && duplicates.has(word);
      toggleClass(input, CSS_CLASSES.DUPLICATE_WORD, isDuplicate);
    }
  }

  /**
   * 设置状态条内容
   * @param {string|null} kind - 'error' | 'warn' | 'ok' | null（静默）
   * @param {string} [message] - 状态消息
   */
  setStatusbar(kind, message) {
    const bar = getElement(SELECTORS.WORDS_STATUSBAR);
    if (!bar) return;

    clearElement(bar);
    bar.className = 'statusbar';

    if (!kind) return;

    bar.classList.add(`is-${kind}`);

    const iconName = kind === 'ok' ? 'i-check' : 'i-warning';
    const icon = createElement('span', ['statusbar-icon']);
    icon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${iconName}"/></svg>`;

    const text = createElement('span', ['statusbar-text']);
    text.textContent = message;

    bar.append(icon, text);
  }

  /**
   * 搜索BIP39单词
   * @param {string} query - 查询字符串
   * @returns {string[]} 匹配的单词列表
   */
  searchWords(query) {
    if (!query) {
      return [];
    }

    return BIP39_WORDLIST.filter((word) => word.startsWith(query)).slice(0, UI_CONFIG.SUGGESTIONS.MAX_SUGGESTIONS);
  }

  /**
   * 显示建议列表
   * @param {string} query - 查询字符串
   * @param {number} wordIndex - 输入框索引
   */
  showSuggestions(query, wordIndex) {
    const suggestions = this.searchWords(query);
    const suggestionsDiv = getElement(SELECTORS.SUGGESTIONS(wordIndex));

    if (!suggestionsDiv || suggestions.length === 0) {
      this.hideSuggestions(wordIndex);
      return;
    }

    // 同一时间只保留一处联想
    this.hideAllSuggestions(wordIndex);

    clearElement(suggestionsDiv);
    // CSS 对联想列表默认 display:none，toggleElement 置空内联样式无法显示，
    // 必须显式设为 block 才能覆盖类默认值
    suggestionsDiv.style.display = 'block';
    this.renderSuggestionItems(suggestionsDiv, suggestions, wordIndex);

    this.suggestionState.set(wordIndex, { values: suggestions, activeIndex: 0 });

    const input = getElement(SELECTORS.WORD_INPUT(wordIndex));
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', `${input.id}-opt-0`);
  }

  /**
   * 判断输入框是否靠近词表网格右侧边缘
   * @param {Element} input - 输入框元素
   * @returns {boolean} 是否靠近右侧
   */
  isInputNearRightEdge(input) {
    const grid = input.closest('.words-grid');
    if (!grid) return false;

    const gridRect = grid.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    return inputRect.left - gridRect.left > gridRect.width * 0.6;
  }

  /**
   * 渲染建议项
   * @param {Element} container - 建议容器
   * @param {string[]} suggestions - 建议列表
   * @param {number} wordIndex - 输入框索引
   */
  renderSuggestionItems(container, suggestions, wordIndex) {
    const suggestionsContainer = createElement('div', ['suggestions-container']);

    // 靠近右侧时建议词块靠右排列
    const input = getElement(SELECTORS.WORD_INPUT(wordIndex));
    if (input) {
      suggestionsContainer.style.justifyContent = this.isInputNearRightEdge(input) ? 'flex-end' : 'flex-start';
    }

    suggestions.forEach((word, i) => {
      const suggestionItem = this.createSuggestionItem(word, wordIndex, i);
      suggestionsContainer.appendChild(suggestionItem);
    });

    container.appendChild(suggestionsContainer);
  }

  /**
   * 创建建议项
   * @param {string} word - 单词
   * @param {number} wordIndex - 输入框索引
   * @param {number} itemIndex - 建议项索引
   * @returns {Element} 建议项元素
   */
  createSuggestionItem(word, wordIndex, itemIndex) {
    const item = createElement('div', ['suggestion-item', itemIndex === 0 ? 'is-active' : null], {
      id: `word${wordIndex}-opt-${itemIndex}`,
      role: 'option',
      'aria-selected': itemIndex === 0 ? 'true' : 'false',
    });
    item.textContent = word;

    // 鼠标按下时阻止输入框失焦，保证点击选中可靠
    addEvent(item, 'mousedown', (e) => e.preventDefault());
    addEvent(item, 'click', () => this.selectWord(word, wordIndex));

    return item;
  }

  /**
   * 移动联想高亮项
   * @param {number} wordIndex - 输入框索引
   * @param {number} delta - 移动方向（1 向下 / -1 向上）
   */
  moveActiveSuggestion(wordIndex, delta) {
    const state = this.suggestionState.get(wordIndex);
    if (!state || state.values.length === 0) return;

    const count = state.values.length;
    state.activeIndex = (state.activeIndex + delta + count) % count;

    const input = getElement(SELECTORS.WORD_INPUT(wordIndex));
    const suggestionsDiv = getElement(SELECTORS.SUGGESTIONS(wordIndex));

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach((item, i) => {
      toggleClass(item, 'is-active', i === state.activeIndex);
      item.setAttribute('aria-selected', i === state.activeIndex ? 'true' : 'false');
    });

    input.setAttribute('aria-activedescendant', `${input.id}-opt-${state.activeIndex}`);
  }

  /**
   * 选择单词
   * @param {string} word - 单词
   * @param {number} wordIndex - 输入框索引
   */
  selectWord(word, wordIndex) {
    const input = getElement(SELECTORS.WORD_INPUT(wordIndex));

    input.value = word;
    toggleClass(input, CSS_CLASSES.INVALID_WORD, false);
    toggleClass(input, CSS_CLASSES.VALID_WORD, true);

    this.hideSuggestions(wordIndex);
    this.refreshStatusbar();

    // 自动跳转到下一个输入框
    if (wordIndex < this.wordCount) {
      getElement(SELECTORS.WORD_INPUT(wordIndex + 1)).focus();
    }
  }

  /**
   * 隐藏建议列表
   * @param {number} wordIndex - 输入框索引
   */
  hideSuggestions(wordIndex) {
    const suggestionsDiv = getElement(SELECTORS.SUGGESTIONS(wordIndex));
    toggleElement(suggestionsDiv, false);
    clearElement(suggestionsDiv);

    this.suggestionState.delete(wordIndex);

    const input = getElement(SELECTORS.WORD_INPUT(wordIndex));
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  /**
   * 收起所有输入框的联想（点击外部 / 全局唯一联想约束）
   * @param {number} [exceptIndex] - 保留联想的输入框索引
   */
  hideAllSuggestions(exceptIndex) {
    for (let i = 1; i <= this.wordCount; i++) {
      if (i !== exceptIndex) {
        this.hideSuggestions(i);
      }
    }
  }

  /**
   * 清除全部输入与状态（页脚"擦除所有数据"使用）
   */
  clearAll() {
    for (let i = 1; i <= this.wordCount; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (!input) continue;

      input.value = '';
      toggleClass(input, CSS_CLASSES.VALID_WORD, false);
      toggleClass(input, CSS_CLASSES.INVALID_WORD, false);
      toggleClass(input, CSS_CLASSES.DUPLICATE_WORD, false);
      this.hideSuggestions(i);
    }

    this.setStatusbar(null);
  }

  /**
   * 验证所有输入
   * @returns {Object} 验证结果
   */
  validateAllInputs() {
    const words = [];
    let hasEmpty = false;
    let hasInvalidWord = false;
    let invalidWordIndex = -1;

    for (let i = 1; i <= this.wordCount; i++) {
      const input = getElement(SELECTORS.WORD_INPUT(i));
      if (!input) continue;

      const word = input.value.trim();
      if (!word) {
        hasEmpty = true;
        break;
      }

      if (!isValidBIP39Word(word)) {
        hasInvalidWord = true;
        invalidWordIndex = i;
        break;
      }

      words.push(word);
    }

    return {
      isValid: !hasEmpty && !hasInvalidWord,
      words,
      hasEmpty,
      hasInvalidWord,
      invalidWordIndex,
    };
  }
}
