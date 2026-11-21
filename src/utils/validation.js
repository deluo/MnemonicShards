/**
 * 验证工具函数
 */

import { BIP39_WORDLIST } from '../constants/bip39-words.js';

// BIP39 标准支持的助记词数量（ENT 及对应校验和位数）
const BIP39_VALID_WORD_COUNTS = [12, 15, 18, 21, 24];

/**
 * 验证是否为有效的 BIP39 单词
 * @param {string} word - 要验证的单词
 * @returns {boolean} 是否为有效单词
 */
export function isValidBIP39Word(word) {
  if (!word) return false;
  return BIP39_WORDLIST.includes(word.trim().toLowerCase());
}

/**
 * 解析分片数据
 * @param {string} shareString - Base64编码的分片字符串
 * @returns {Object|null} 解析后的分片数据，无效时返回 null
 */
export function parseShareData(shareString) {
  try {
    const data = JSON.parse(atob(shareString.trim()));
    return data.threshold && data.index !== undefined && data.data ? data : null;
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
 * @param {string[]} words - 助记词数组
 * @returns {Promise<Object>} 验证结果
 *   { isValid: boolean, reason?: 'count'|'word'|'checksum', count?: number, word?: string }
 */
export async function validateMnemonicChecksum(words) {
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
    const index = BIP39_WORDLIST.indexOf(normalized[i]);
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
 * @param {string[]|Object[]} shares - 分片字符串数组或分片对象数组
 * @returns {Object} 验证结果 { isValid, validCount, threshold, hasDuplicates }
 */
export function validateShareCollection(shares) {
  const validShares = [];
  const indices = new Set();

  for (const share of shares) {
    const data = typeof share === 'string' ? parseShareData(share) : share;
    if (data?.threshold && data.index !== undefined && data.data) {
      validShares.push(data);
      indices.add(data.index);
    }
  }

  const threshold = validShares[0]?.threshold ?? 0;
  const hasDuplicates = indices.size !== validShares.length;

  return {
    isValid: validShares.length > 0 && !hasDuplicates && validShares.length >= threshold,
    validCount: validShares.length,
    threshold,
    hasDuplicates,
  };
}
