/**
 * 应用常量配置
 */

// 应用信息
export const APP_CONFIG = {
  VERSION: '1.0.0',
};

// 助记词配置
export const MNEMONIC_CONFIG = {
  WORD_COUNTS: [12, 24],
  DEFAULT_WORD_COUNT: 12,
};

// UI配置
export const UI_CONFIG = {
  // 输入防抖延迟（毫秒）
  DELAY: {
    DEBOUNCE: 100,
  },

  // 建议列表配置
  SUGGESTIONS: {
    MAX_SUGGESTIONS: 4,
  },
};

// DOM选择器
export const SELECTORS = {
  // 模式切换
  MODE_SPLIT_BTN: '#modeSplitBtn',
  MODE_RECOVER_BTN: '#modeRecoverBtn',
  MODE_SPLIT: '#splitMode',
  MODE_RECOVER: '#recoverMode',

  // 分割模式
  WORDS_12_BTN: '#words12',
  WORDS_24_BTN: '#words24',
  WORDS_GRID: '#wordsGrid',
  WORDS_STATUSBAR: '#wordsStatusbar',
  TOTAL_SHARES: '#totalShares',
  THRESHOLD: '#threshold',
  SHARD_VIZ: '#shardViz',
  GENERATE_BTN: '#generateBtn',
  SHARES_RESULT: '#sharesResult',
  SHARES_LIST: '#sharesList',

  // 分片汇总
  COPIED_COUNT: '#copiedCount',
  DOWNLOADED_COUNT: '#downloadedCount',
  TOTAL_COUNT: '#totalCount',
  THRESHOLD_DISPLAY: '#thresholdDisplay',

  // 加密导出
  ENABLE_ENCRYPTION: '#enableEncryption',
  ENCRYPTION_FIELDS: '#encryptionFields',
  ENCRYPTION_PASSWORD: '#encryptionPassword',
  CONFIRM_PASSWORD: '#confirmPassword',
  PASSWORD_STRENGTH: '#passwordStrength',
  PASSWORD_MATCH: '#passwordMatch',

  // 恢复模式
  RECOVER_BTN: '#recoverBtn',
  RECOVER_INPUT: '#recoverInput',
  INPUT_STATUS: '#inputStatus',
  PASTE_TAB_BTN: '#pasteTabBtn',
  UPLOAD_TAB_BTN: '#uploadTabBtn',
  PASTE_TAB: '#pasteTab',
  UPLOAD_TAB: '#uploadTab',
  PASTE_RECOVER_RESULT: '#pasteRecoverResult',
  UPLOAD_RECOVER_RESULT: '#uploadRecoverResult',
  UPLOAD_AREA: '#uploadArea',
  SELECT_FILES_BTN: '#selectFilesBtn',
  FILE_INPUT: '#fileInput',
  UPLOADED_FILES: '#uploadedFiles',
  FILES_LIST: '#filesList',
  CLEAR_FILES_BTN: '#clearFilesBtn',
  UPLOAD_STATUS: '#uploadStatus',
  ENCRYPTION_PASSWORD_SECTION: '#encryptionPasswordSection',
  UPLOAD_ENCRYPTION_PASSWORD: '#uploadEncryptionPassword',
  UPLOAD_PASSWORD_TOGGLE_BTN: '#uploadPasswordToggleBtn',
  APPLY_DECRYPTION_BTN: '#applyDecryptionBtn',
  SKIP_DECRYPTION_BTN: '#skipDecryptionBtn',

  // 页脚
  WIPE_ALL_BTN: '#wipeAllBtn',
  VERSION_LABEL: '#versionLabel',

  // 动态生成
  WORD_INPUT: (index) => `#word${index}`,
  SUGGESTIONS: (index) => `#suggestions${index}`,
};

// CSS类名
export const CSS_CLASSES = {
  // 状态类
  ACTIVE: 'active',

  // 验证状态
  VALID_WORD: 'valid-word',
  INVALID_WORD: 'invalid-word',
  DUPLICATE_WORD: 'duplicate-word',

  // 按钮状态
  COPIED: 'copied',
};
