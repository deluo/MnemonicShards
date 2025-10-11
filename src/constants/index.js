/**
 * 应用常量配置
 */

// 应用信息
export const APP_CONFIG = {
  NAME: '助记词分片工具',
  DESCRIPTION: '安全地将助记词分割成多个分片，任意指定数量的分片即可恢复原始助记词',
  VERSION: '1.0.0'
};

// 助记词配置
export const MNEMONIC_CONFIG = {
  WORD_COUNTS: [12, 24],
  DEFAULT_WORD_COUNT: 12,
  MIN_SHARES: 3,
  MAX_SHARES: 7,
  DEFAULT_TOTAL_SHARES: 5,
  DEFAULT_THRESHOLD: 3
};

// UI配置
export const UI_CONFIG = {
  // 移动端断点
  MOBILE_BREAKPOINT: 768,

  // 动画时长（毫秒）
  ANIMATION_DURATION: {
    FAST: 150,
    NORMAL: 200,
    SLOW: 300
  },

  // 延迟时间（毫秒）
  DELAY: {
    DEBOUNCE: 100,
    AUTO_HIDE_ALERT: 3000,
    BLUR_DELAY: 200,
    COPY_FEEDBACK: 2000
  },

  // 建议列表配置
  SUGGESTIONS: {
    MAX_SUGGESTIONS: 5,
    MOBILE_MAX_HEIGHT: '150px',
    MOBILE_BOTTOM_OFFSET: '20px'
  },

  // 文件下载配置
  DOWNLOAD: {
    FILE_PREFIX: '分片',
    FILE_EXTENSION: '.txt'
  }
};

// DOM选择器
export const SELECTORS = {
  // 容器
  CONTAINER: '.container',
  MAIN_CONTENT: '.main-content',

  // 控件
  WORDS_GRID: '#wordsGrid',
  TOTAL_SHARES: '#totalShares',
  THRESHOLD: '#threshold',

  // 按钮
  GENERATE_BTN: '#generateBtn',
  RECOVER_BTN: '#recoverBtn',

  // 输入框
  RECOVER_INPUT: '#recoverInput',

  // 结果区域
  SHARES_RESULT: '#sharesResult',
  SHARES_LIST: '#sharesList',
  RECOVER_RESULT: '#recoverResult',

  // 提示区域
  INPUT_ERROR_ALERT: '#inputErrorAlert',
  DUPLICATE_ALERT: '#duplicateAlert',
  GENERAL_ERROR_ALERT: '#generalErrorAlert',
  SUCCESS_ALERT: '#successAlert',
  INPUT_STATUS: '#inputStatus',

  // 显示
  THRESHOLD_DISPLAY: '#thresholdDisplay',

  // 动态生成
  WORD_INPUT: (index) => `#word${index}`,
  SUGGESTIONS: (index) => `#suggestions${index}`
};

// CSS类名
export const CSS_CLASSES = {
  // 状态类
  ACTIVE: 'active',
  DISABLED: 'disabled',

  // 验证状态
  VALID_WORD: 'valid-word',
  INVALID_WORD: 'invalid-word',
  DUPLICATE_WORD: 'duplicate-word',

  // 提示类
  ALERT: 'alert',
  ALERT_SUCCESS: 'alert-success',
  ALERT_ERROR: 'alert-error',
  ALERT_INFO: 'alert-info',
  ALERT_WARNING: 'alert-warning',

  // 输入状态
  INPUT_STATUS: 'input-status',
  INPUT_WAITING: 'waiting',
  INPUT_VALID: 'valid',
  INPUT_INVALID: 'invalid',
  INPUT_INSUFFICIENT: 'insufficient',

  // 按钮状态
  COPIED: 'copied'
};

// 错误消息
export const ERROR_MESSAGES = {
  EMPTY_WORDS: '请填写所有助记词！',
  INVALID_WORD: (index) => `第 ${index} 个单词不是有效的 BIP39 单词，请从建议列表中选择有效的单词。`,
  DUPLICATE_WORDS: (words) => `检测到重复单词：${words}。助记词中的单词应该是唯一的，请修改重复的单词。`,
  INVALID_SHARE_FORMAT: '未检测到有效分片，请检查格式',
  INSUFFICIENT_SHARES: (valid, threshold) => `需要至少 ${threshold} 个分片，当前只有 ${valid} 个`,
  NO_VALID_SHARES: '没有找到有效的分片数据',
  COPY_FAILED: '复制失败，请手动复制',
  DOWNLOAD_FAILED: '下载失败，请重试',
  GENERATE_FAILED: (error) => `生成分片失败: ${error}`,
  RECOVER_FAILED: (error) => `恢复失败：${error}`
};

// 成功消息
export const SUCCESS_MESSAGES = {
  SHARES_GENERATED: '分片生成成功！请安全保存这些分片。',
  SHARE_DOWNLOADED: (index) => `分片 ${index} 已下载`,
  SHARE_COPIED: '已复制到剪贴板'
};

// 信息消息
export const INFO_MESSAGES = {
  WAITING_SHARES: '等待输入分片...',
  VALID_SHARES: (valid, threshold) => `检测到 ${valid} 个有效分片（需要 ${threshold} 个），可以开始恢复`,
  INVALID_FORMAT: '分片格式错误，请检查输入'
};

// 文件模板
export const FILE_TEMPLATES = {
  SHARE_CONTENT: (index, content) =>
    `助记词分片 ${index}\n${'='.repeat(50)}\n\n分片内容：\n${content}\n\n${'='.repeat(50)}\n生成时间：${new Date().toLocaleString()}\n\n安全提示：\n- 请将此文件保存在安全的位置\n- 不要将分片分享给不信任的人\n- 任意指定数量的分片即可恢复原始助记词`
};

// BIP39相关
export const BIP39_CONFIG = {
  WORDLIST_URL: './constants/bip39-words.js'
};