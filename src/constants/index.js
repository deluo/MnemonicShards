/**
 * 应用常量配置
 */

// 应用信息
export const APP_CONFIG = {
  VERSION: '1.3.0',
};

// BTC 地址派生配置（观察模式）
export const DERIVATION_CONFIG = {
  // 路径预设：扩展公钥版本字节决定 xpub/ypub/zpub 前缀，addressType 决定地址编码
  PATH_PRESETS: [
    {
      id: 'native',
      label: 'Native',
      path: "m/84'/0'/0'",
      addressType: 'p2wpkh',
      extVersions: { private: 0x04b2430c, public: 0x04b24746 }, // zprv / zpub
    },
    {
      id: 'nested',
      label: 'Nested',
      path: "m/49'/0'/0'",
      addressType: 'p2sh-p2wpkh',
      extVersions: { private: 0x049d7878, public: 0x049d7cb2 }, // yprv / ypub
    },
    {
      id: 'legacy',
      label: 'Legacy',
      path: "m/44'/0'/0'",
      addressType: 'p2pkh',
      extVersions: { private: 0x0488ade4, public: 0x0488b21e }, // xprv / xpub
    },
  ],
  DEFAULT_PRESET_ID: 'native',

  // 地址展示：首尾高亮位数（bc1q 前缀恒定，8 位才能露出有区分度的字符）
  ADDR_EDGE_CHARS: 8,
  // 地址列表分页大小
  ADDR_PAGE_SIZE: 10,
  // zpub 显示态自动回遮蔽延迟（毫秒）
  ZPUB_REMASK_DELAY: 60000,
  // 派生完成后内存中助记词/passphrase 的自动清除延迟（毫秒）。
  // 助记词仅在切换路径预设时需要复用，超时即清；已派生的地址与公钥不含私钥，可继续展示
  MNEMONIC_AUTO_CLEAR_MS: 5 * 60 * 1000,
};

// 助记词配置
export const MNEMONIC_CONFIG = {
  DEFAULT_WORD_COUNT: 12,
};

// 分片加密配置
export const ENCRYPTION_CONFIG = {
  // 密码长度硬下限：加密分片一旦泄露面临的是离线暴力破解，
  // 常规"8 位"标准在此场景下不够，低于该长度直接拦截
  MIN_PASSWORD_LENGTH: 12,
  // 内置生成器的密码长度
  GENERATED_PASSWORD_LENGTH: 16,
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
  MODE_OBSERVE_BTN: '#modeObserveBtn',
  MODE_SPLIT: '#splitMode',
  MODE_RECOVER: '#recoverMode',
  MODE_OBSERVE: '#observeMode',

  // 观察模式
  OBS_WORDS_12_BTN: '#obsWords12',
  OBS_WORDS_24_BTN: '#obsWords24',
  OBS_WORDS_GRID: '#obsWordsGrid',
  OBS_WORDS_STATUSBAR: '#obsWordsStatusbar',
  OBS_PASSPHRASE: '#obsPassphrase',
  PATH_PRESET_GROUP: '#pathPresetGroup',
  DERIVE_BTN: '#deriveBtn',
  OBSERVE_RESULT: '#observeResult',
  OBSERVE_PATH_SUMMARY: '#observePathSummary',
  OBSERVE_ADDRESS_LIST: '#observeAddressList',
  SHOW_MORE_ADDRESSES_BTN: '#showMoreAddressesBtn',
  ZPUB_TEXT: '#zpubText',
  ZPUB_REVEAL_BTN: '#zpubRevealBtn',
  ZPUB_COPY_BTN: '#zpubCopyBtn',
  ZPUB_QR_BTN: '#zpubQrBtn',

  // 二维码弹层
  QR_MODAL: '#qrModal',
  QR_MODAL_TITLE: '#qrModalTitle',
  QR_CANVAS: '#qrCanvas',
  QR_CLOSE_BTN: '#qrCloseBtn',

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

  // 助记词指纹（抄写保管，与分片分开存放；恢复演练时比对）
  FINGERPRINT_ROW: '#fingerprintRow',
  FINGERPRINT_VALUE: '#fingerprintValue',
  FINGERPRINT_COPY_BTN: '#fingerprintCopyBtn',

  // 加密导出
  ENABLE_ENCRYPTION: '#enableEncryption',
  ENCRYPTION_FIELDS: '#encryptionFields',
  ENCRYPTION_PASSWORD: '#encryptionPassword',
  GENERATE_PASSWORD_BTN: '#generatePasswordBtn',
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

  // 恢复演练模式（不显示助记词，只比对指纹）
  DRILL_MODE_TOGGLE: '#drillModeToggle',
  DRILL_FIELDS: '#drillFingerprintFields',
  DRILL_FINGERPRINT_INPUT: '#drillFingerprintInput',
  DRILL_FINGERPRINT_NOTE: '#drillFingerprintNote',

  // 页脚
  WIPE_ALL_BTN: '#wipeAllBtn',
  VERSION_LABEL: '#versionLabel',
};

// CSS类名
export const CSS_CLASSES = {
  // 状态类
  ACTIVE: 'active',

  // 验证状态
  VALID_WORD: 'valid-word',
  INVALID_WORD: 'invalid-word',
  DUPLICATE_WORD: 'duplicate-word',

  // 敏感信息遮蔽（zpub 等默认模糊展示）
  MASKED: 'is-blurred',

  // 按钮状态
  COPIED: 'copied',
};
