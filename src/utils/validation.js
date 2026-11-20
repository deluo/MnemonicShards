/**
 * 验证工具函数
 */

// BIP39 标准支持的助记词数量（ENT 及对应校验和位数）
const BIP39_VALID_WORD_COUNTS = [12, 15, 18, 21, 24];

/**
 * 验证是否为有效的 BIP39 单词
 * @param {string[]} wordList - BIP39单词列表
 * @param {string} word - 要验证的单词
 * @returns {boolean} 是否为有效单词
 */
export function isValidBIP39Word(wordList, word) {
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    return false;
  }
  return wordList.includes(word.trim().toLowerCase());
}

/**
 * 验证分片数据格式
 * @param {string} shareString - Base64编码的分片字符串
 * @returns {boolean} 是否为有效格式
 */
export function isValidShareFormat(shareString) {
  if (!shareString || typeof shareString !== 'string') {
    return false;
  }

  try {
    const shareData = JSON.parse(atob(shareString.trim()));
    // 只检查必要字段（threshold、index、data），允许额外字段存在
    const hasRequiredFields = !!(shareData.threshold && shareData.index && shareData.data);
    return hasRequiredFields;
  } catch (error) {
    return false;
  }
}

/**
 * 解析分片数据
 * @param {string} shareString - Base64编码的分片字符串
 * @returns {Object|null} 解析后的分片数据或null
 */
export function parseShareData(shareString) {
  if (!isValidShareFormat(shareString)) {
    return null;
  }

  try {
    const decoded = atob(shareString.trim());
    const parsed = JSON.parse(decoded);
    return parsed;
  } catch (error) {
    return null;
  }
}

/**
 * 验证助记词完整性
 * 注意：BIP39 助记词允许出现重复单词（12 词重复概率约 3%，24 词约 13%），
 * 因此重复单词只作为提示返回，不计入 errors，不阻断流程。
 * @param {string[]} words - 助记词数组
 * @returns {Object} 验证结果 { isValid: boolean, errors: string[], duplicates: string[] }
 */
export function validateMnemonic(words) {
  const errors = [];
  const wordSet = new Set();
  const duplicates = new Set();

  // 检查空单词
  if (words.some((word) => !word || word.trim().length === 0)) {
    errors.push('存在空单词，请填写所有助记词');
  }

  // 收集重复单词（仅提示，不阻断）
  words.forEach((word) => {
    const trimmedWord = word.trim().toLowerCase();
    if (wordSet.has(trimmedWord)) {
      duplicates.add(trimmedWord);
    } else {
      wordSet.add(trimmedWord);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    duplicates: Array.from(duplicates),
  };
}

/**
 * 验证 BIP39 助记词校验和
 * 按 BIP39 规范：单词索引拼接为位串，前 ENT 位为熵，后 MS 位为
 * SHA-256(熵) 的前 MS 位，两者必须一致。
 * @param {string[]} wordList - BIP39单词列表
 * @param {string[]} words - 助记词数组
 * @returns {Promise<Object>} 验证结果
 *   { isValid: boolean, reason?: 'count'|'word'|'checksum', count?: number, word?: string }
 */
export async function validateMnemonicChecksum(wordList, words) {
  if (!Array.isArray(words) || words.length === 0) {
    return { isValid: false, reason: 'count', count: 0 };
  }

  const normalized = words.map((word) => word.trim().toLowerCase());
  const wordCount = normalized.length;

  if (!BIP39_VALID_WORD_COUNTS.includes(wordCount)) {
    return { isValid: false, reason: 'count', count: wordCount };
  }

  // 单词索引 → 11 位二进制位串
  const bits = new Uint8Array(wordCount * 11);
  for (let i = 0; i < wordCount; i++) {
    const index = wordList.indexOf(normalized[i]);
    if (index === -1) {
      return { isValid: false, reason: 'word', word: normalized[i] };
    }
    for (let b = 0; b < 11; b++) {
      bits[i * 11 + b] = (index >> (10 - b)) & 1;
    }
  }

  const totalBits = wordCount * 11;
  const entropyBits = (totalBits / 33) * 32;
  const checksumBits = totalBits - entropyBits;

  // 前 entropyBits 位 → 熵字节
  const entropy = new Uint8Array(entropyBits / 8);
  for (let i = 0; i < entropyBits; i++) {
    if (bits[i]) {
      entropy[i >> 3] |= 1 << (7 - (i & 7));
    }
  }

  // SHA-256(熵) 的前 checksumBits 位必须与位串末尾一致
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));
  for (let i = 0; i < checksumBits; i++) {
    const expected = (digest[i >> 3] >> (7 - (i & 7))) & 1;
    if (expected !== bits[entropyBits + i]) {
      return { isValid: false, reason: 'checksum' };
    }
  }

  return { isValid: true };
}

/**
 * 验证分片集合
 * @param {string[]|Object[]} shareStrings - 分片字符串数组或分片对象数组
 * @returns {Object} 验证结果 { isValid: boolean, validCount: number, threshold: number, errors: string[] }
 */
export function validateShareCollection(shareStrings) {
  const errors = [];
  let validCount = 0;
  let threshold = 0;
  const shareIndices = new Set();
  const thresholdCandidates = new Set();
  const validShareData = [];

  shareStrings.forEach((shareStr, index) => {
    let shareData = null;

    // 如果已经是对象，直接使用
    if (typeof shareStr === 'object' && shareStr !== null) {
      shareData = shareStr;
    } else {
      // 否则尝试解析字符串
      shareData = parseShareData(shareStr);
    }

    if (shareData && shareData.threshold && shareData.index !== undefined && shareData.data) {
      validCount++;
      validShareData.push(shareData);
      // 收集所有可能的阈值
      if (shareData.threshold) {
        thresholdCandidates.add(shareData.threshold);
      }
      shareIndices.add(shareData.index);
    } else {
      errors.push(`第 ${index + 1} 行：无效的分片格式`);
    }
  });

  // 确定最终阈值：优先使用第一个有效分片的阈值
  if (validShareData.length > 0 && validShareData[0].threshold) {
    threshold = validShareData[0].threshold;
  } else if (thresholdCandidates.size > 0) {
    // 如果第一个分片没有阈值，使用最常见的阈值
    const thresholdCounts = {};
    thresholdCandidates.forEach((t) => {
      thresholdCounts[t] = (thresholdCounts[t] || 0) + 1;
    });

    // 找出出现次数最多的阈值
    let maxCount = 0;
    thresholdCandidates.forEach((t) => {
      if (thresholdCounts[t] > maxCount) {
        maxCount = thresholdCounts[t];
        threshold = t;
      }
    });
  } else {
    // 如果没有检测到有效阈值，使用默认值
    threshold = 3;
  }

  // 检查是否有足够的有效分片
  if (validCount === 0) {
    errors.push('未检测到有效分片');
  } else if (validCount < threshold) {
    errors.push(`需要至少 ${threshold} 个分片，当前只有 ${validCount} 个`);
  }

  // 检查是否有重复的分片索引
  if (shareIndices.size !== validCount) {
    errors.push('检测到重复的分片索引');
  }

  const result = {
    isValid: errors.length === 0 && validCount >= threshold,
    validCount,
    threshold,
    errors,
    shareIndices: Array.from(shareIndices),
  };

  return result;
}
