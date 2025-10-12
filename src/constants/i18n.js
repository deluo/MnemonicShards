/**
 * 国际化语言包
 * 支持中文和英文两种语言
 */

export const LANGUAGES = {
  EN: 'en',
  ZH: 'zh',
};

export const LANGUAGE_NAMES = {
  [LANGUAGES.EN]: 'English',
  [LANGUAGES.ZH]: '中文',
};

export const TRANSLATIONS = {
  [LANGUAGES.EN]: {
    // 页面标题和描述
    appTitle: 'MnemonicShards',
    appDescription: 'Securely split your mnemonic phrase into multiple shards. Any specified number of shards can recover the original mnemonic.',

    // 配置区域
    configTitle: 'Configuration Options',
    wordCountLabel: 'Mnemonic Word Count',
    words12: '12 words',
    words24: '24 words',
    totalSharesLabel: 'Total Shares',
    thresholdLabel: 'Shares Required for Recovery',
    sharesOption: (count) => `${count} shares`,

    // 输入区域
    inputTitle: 'Enter Mnemonic Phrase',
    generateBtn: 'Generate Shares',

    // 恢复区域
    recoverTitle: 'Recover Mnemonic Phrase',
    recoverInstructions: `
      <strong>Instructions:</strong><br />
      1. Paste each shard into the text box below, one shard per line<br />
      2. Shard format should be complete Base64 encoded string<br />
      3. Minimum number of shards must be reached for recovery<br />
      4. Extra shards will be automatically ignored
    `,
    recoverBtn: 'Recover Mnemonic',
    recoverPlaceholder: `Paste shard contents here, one shard per line...\\n\\n💡 Tip: Paste multiple shards at once, system will handle line breaks automatically\\n\\nExample format:\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjEsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjIsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjMsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9`,
    waitingForInput: 'Waiting for shard input...',

    // 结果区域
    sharesTitle: 'Generated Shares',
    securityTip: `<strong>Security Tip:</strong> Store these shards in different secure locations. Any <span id="thresholdDisplay"></span> shares can recover the complete mnemonic.`,

    // 安全提示
    securityNotice:
      '<strong>Security Mode:</strong> Using professional-grade Shamir Secret Sharing algorithm, runs completely offline, data never leaves your device. Recommended to use in disconnected environment for maximum security.',

    // 错误和提示信息
    errors: {
      fillAllWords: 'Please fill in all mnemonic words!',
      invalidWord: (index) => `Word ${index} is not a valid BIP39 word, please select a valid word from the suggestions.`,
      invalidWordCleared: (index) =>
        `<strong>Invalid mnemonic:</strong> Word ${index} is not a valid BIP39 word and has been automatically cleared. Please select a valid word from the suggestions.`,
      duplicateWords: (words) => `Duplicate words found: ${words.join(', ')}. Each word should be unique.`,
      invalidShareFormat: 'Invalid share format. Please check your input.',
      insufficientShares: (required, provided) => `Insufficient shares. Need at least ${required} shares, but got ${provided}.`,
      recoveryFailed: 'Recovery failed: ',
      noValidShares: 'No valid shard data found',
      checkShareFormat: 'Please check if the shard format is correct, ensure each line contains a complete shard',
      copyFailed: 'Failed to copy to clipboard',
      downloadFailed: 'Download failed, please try again',
    },

    success: {
      sharesGenerated: 'Shares generated successfully! Please save these shards securely.',
      mnemonicRecovered: 'Mnemonic recovered successfully!',
      copySuccess: 'Copied to clipboard!',
      shareDownloaded: (index) => `Share ${index} downloaded`,
      recoverySuccess: 'Recovery successful!',
    },

    warnings: {
      duplicateWordsDetected: 'Duplicate words detected:',
      uniqueWordsNote: 'Words in the mnemonic should be unique, please check and modify duplicate words.',
      duplicateWords: (words) => `Duplicate words detected: ${words.join(', ')}`,
    },

    info: {
      recovering: 'Recovering...',
      validShares: (valid, threshold) => `Detected ${valid} valid shares (need ${threshold}), recovery can start`,
    },

    // 按钮操作
    copy: 'Copy',
    download: 'Download',
    share: (index) => `Share ${index}`,

    // 单词标签
    wordLabel: (index) => `${index}. Word`,
    position: 'Position',

    // 文件相关
    shareFilePrefix: 'Share',

    // 状态文本
    mnemonic: 'Mnemonic',
    shares: 'shares',
    sharesUsed: 'Shares used',
    need: 'need',
    recoveryTime: 'Recovery time',

    // 文件模板
    fileTemplate: {
      appName: 'MnemonicShards',
      shareContent: 'Share content',
      generatedTime: 'Generated time',
      securityTips: 'Security tips',
      tip1: 'Please keep this file in a secure location',
      tip2: 'Do not share the shard with untrusted people',
      tip3: 'Any specified number of shards can recover the original mnemonic',
    },

    // 语言切换
    language: 'Language',
  },

  [LANGUAGES.ZH]: {
    // 页面标题和描述
    appTitle: 'MnemonicShards',
    appDescription: '安全地将助记词分割成多个分片，任意指定数量的分片即可恢复原始助记词',

    // 配置区域
    configTitle: '配置选项',
    wordCountLabel: '助记词数量',
    words12: '12 个单词',
    words24: '24 个单词',
    totalSharesLabel: '分片总数',
    thresholdLabel: '恢复所需分片数',
    sharesOption: (count) => `${count} 个分片`,

    // 输入区域
    inputTitle: '输入助记词',
    generateBtn: '生成分片',

    // 恢复区域
    recoverTitle: '恢复助记词',
    recoverInstructions: `
      <strong>使用说明：</strong><br />
      1. 将每个分片粘贴到下方文本框中，每行一个分片<br />
      2. 分片格式应为完整的 Base64 编码字符串<br />
      3. 至少需要达到设定的最小分片数量才能恢复<br />
      4. 多余的分片会被自动忽略
    `,
    recoverBtn: '恢复助记词',
    recoverPlaceholder: `请在此处粘贴分片内容，每行一个分片...\\n\\n💡 提示：直接粘贴多个分片，系统会自动处理换行\\n\\n示例格式：\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjEsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjIsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9\\neyJ0aHJlc2hvbGQiOjMsInNoYXJlSW5kZXgiOjMsImRhdGEiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9`,
    waitingForInput: '等待输入分片...',

    // 结果区域
    sharesTitle: '生成的分片',
    securityTip: `<strong>安全提示：</strong> 请将这些分片分别保存在不同的安全位置。任意 <span id="thresholdDisplay"></span> 个分片即可恢复完整的助记词。`,

    // 安全提示
    securityNotice: '<strong>安全模式：</strong> 使用专业级 Shamir 秘密分享算法，完全离线运行，数据不会离开您的设备。建议在断网环境中使用以获得最高安全性。',

    // 错误和提示信息
    errors: {
      fillAllWords: '请填写所有助记词！',
      invalidWord: (index) => `第 ${index} 个单词不是有效的 BIP39 单词，请从建议列表中选择有效的单词。`,
      invalidWordCleared: (index) => `<strong>无效助记词：</strong> 第 ${index} 个输入框中的单词不是有效的 BIP39 单词，已自动清空。请从建议列表中选择有效的单词。`,
      duplicateWords: (words) => `发现重复单词：${words.join(', ')}。每个单词应该是唯一的。`,
      invalidShareFormat: '无效的分片格式。请检查您的输入。',
      insufficientShares: (required, provided) => `分片数量不足。至少需要 ${required} 个分片，但只提供了 ${provided} 个。`,
      recoveryFailed: '恢复失败：',
      noValidShares: '没有找到有效的分片数据',
      checkShareFormat: '请检查分片格式是否正确，确保每行一个完整的分片',
      copyFailed: '复制到剪贴板失败',
      downloadFailed: '下载失败，请重试',
    },

    success: {
      sharesGenerated: '分片生成成功！请安全保存这些分片。',
      mnemonicRecovered: '助记词恢复成功！',
      copySuccess: '已复制到剪贴板！',
      shareDownloaded: (index) => `分片 ${index} 已下载`,
      recoverySuccess: '恢复成功！',
    },

    warnings: {
      duplicateWordsDetected: '检测到重复单词：',
      uniqueWordsNote: '助记词中的单词应该是唯一的，请检查并修改重复的单词。',
      duplicateWords: (words) => `检测到重复单词：${words.join(', ')}`,
    },

    info: {
      recovering: '正在恢复...',
      validShares: (valid, threshold) => `检测到 ${valid} 个有效分片（需要 ${threshold} 个），可以开始恢复`,
    },

    // 按钮操作
    copy: '复制',
    download: '下载',
    share: (index) => `分片 ${index}`,

    // 单词标签
    wordLabel: (index) => `${index}. 单词`,
    position: '位置',

    // 文件相关
    shareFilePrefix: '分片',

    // 状态文本
    mnemonic: '助记词',
    shares: '个',
    sharesUsed: '使用分片数',
    need: '需要',
    recoveryTime: '恢复时间',

    // 文件模板
    fileTemplate: {
      appName: 'MnemonicShards',
      shareContent: '分片内容',
      generatedTime: '生成时间',
      securityTips: '安全提示',
      tip1: '请将此文件保存在安全的位置',
      tip2: '不要将分片分享给不信任的人',
      tip3: '任意指定数量的分片即可恢复原始助记词',
    },

    // 语言切换
    language: '语言',
  },
};

// 默认语言为英文
export const DEFAULT_LANGUAGE = LANGUAGES.EN;
