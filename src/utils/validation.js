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
 * @param {string[]} words - 助记词数组
 * @returns {Object} 验证结果 { isValid: boolean, errors: string[] }
 */
export function validateMnemonic(words) {
  const errors = [];
  const wordSet = new Set();
  const duplicates = new Set();

  // 检查空单词
  if (words.some((word) => !word || word.trim().length === 0)) {
    errors.push('存在空单词，请填写所有助记词');
  }

  // 检查重复单词
  words.forEach((word) => {
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
    duplicates: Array.from(duplicates),
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
  const thresholdCandidates = new Set();
  const validShareData = [];

  shareStrings.forEach((shareStr, index) => {
    const shareData = parseShareData(shareStr);

    if (shareData) {
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
