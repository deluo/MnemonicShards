/**
 * 验证工具函数
 */

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
    return !!(shareData.threshold && shareData.index && shareData.data);
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
    return JSON.parse(atob(shareString.trim()));
  } catch (error) {
    return null;
  }
}

/**
 * 验证助记词完整性
 * @param {string[]} words - 助记词数组
 * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
 */
export function validateMnemonic(words) {
  const errors = [];
  const wordSet = new Set();
  const duplicates = new Set();

  // 检查空单词
  if (words.some(word => !word || word.trim().length === 0)) {
    errors.push('存在空单词，请填写所有助记词');
  }

  // 检查重复单词
  words.forEach(word => {
    const trimmedWord = word.trim().toLowerCase();
    if (wordSet.has(trimmedWord)) {
      duplicates.add(trimmedWord);
    } else {
      wordSet.add(trimmedWord);
    }
  });

  if (duplicates.size > 0) {
    const duplicateWords = Array.from(duplicates).join(', ');
    errors.push(`检测到重复单词：${duplicateWords}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    duplicates: Array.from(duplicates)
  };
}

/**
 * 验证分片集合
 * @param {string[]} shareStrings - 分片字符串数组
 * @returns {Object} 验证结果 { isValid: boolean, validCount: number, threshold: number, errors: string[] }
 */
export function validateShareCollection(shareStrings) {
  const errors = [];
  let validCount = 0;
  let threshold = 0;
  const shareIndices = new Set();

  shareStrings.forEach((shareStr, index) => {
    const shareData = parseShareData(shareStr);
    if (shareData) {
      validCount++;
      threshold = shareData.threshold;
      shareIndices.add(shareData.index);
    } else {
      errors.push(`第 ${index + 1} 行：无效的分片格式`);
    }
  });

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

  return {
    isValid: errors.length === 0 && validCount >= threshold,
    validCount,
    threshold,
    errors,
    shareIndices: Array.from(shareIndices)
  };
}