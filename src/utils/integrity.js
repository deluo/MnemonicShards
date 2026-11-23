/**
 * 完整性校验工具（纯函数，可脱离 DOM 运行，scripts/verify-bip39.mjs 直接测试）
 *
 * 两个独立能力：
 * 1. 助记词指纹 —— 创建分片时展示，用户抄写保管（与分片分开存放）；
 *    恢复演练时比对，确认恢复结果与创建时一致，全程不显示助记词明文。
 *    指纹仅用于展示与比对，不写入分片 JSON、不写入分片文件。
 * 2. 分片校验码 —— 内嵌于分片 JSON 的可选 checksum 字段（v1.2+），用于
 *    人工核对与恢复输入时定位抄录/损坏的分片。Shamir 单片无法自证，
 *    必须在落片时随分片一起写入介质。恢复算法本身不使用该字段。
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { base64ToBytes } from './helpers.js';

// Crockford Base32 字母表：排除 I、L、O、U，避免手抄混淆
const CROCKFORD32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 字节转大写十六进制
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * 归一化助记词字符串：trim → 按空白拆分 → 单空格连接 → 转小写。
 * 指纹基于归一化形式，保证在不同工具、不同输入方式下可独立复现。
 * @param {string} mnemonic - 助记词字符串（单词以空白分隔）
 * @returns {string}
 */
function normalizeMnemonic(mnemonic) {
  return mnemonic.trim().split(/\s+/).join(' ').toLowerCase();
}

/**
 * 计算助记词指纹：SHA-256(归一化助记词) 前 4 字节的大写十六进制（8 位）。
 * 8 位 = 32 位校验强度，足以区分"是不是原来那份"，同时短到可以手抄。
 * @param {string} mnemonic - 助记词字符串
 * @returns {string} 8 位大写十六进制，如 "F3A19C2B"
 */
export function computeMnemonicFingerprint(mnemonic) {
  const normalized = normalizeMnemonic(mnemonic);
  const digest = sha256(new TextEncoder().encode(normalized));
  return bytesToHex(digest.slice(0, 4));
}

/**
 * 校验用户输入的指纹：剔除空格、连字符等非十六进制字符，
 * 恰好 8 位十六进制时返回大写形式，否则返回 null。
 * @param {string} input - 用户输入（可含空格/横线，如 "f3a1-9c2b"）
 * @returns {string|null} 归一化指纹，非法输入返回 null
 */
export function normalizeFingerprintInput(input) {
  const hex = String(input ?? '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase();
  return /^[0-9A-F]{8}$/.test(hex) ? hex : null;
}

/**
 * Crockford Base32 编码（大写，无填充）。
 * 本工具仅编码 5 字节 = 40 位 → 恰好 8 字符；
 * 位串用 Number 累加（远小于 2^53 安全整数范围）。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function crockford32Encode(bytes) {
  let value = 0;
  let bitCount = 0;
  for (const byte of bytes) {
    value = value * 256 + byte;
    bitCount += 8;
  }
  const totalChars = Math.ceil(bitCount / 5);
  let out = '';
  for (let i = 0; i < totalChars; i++) {
    out = CROCKFORD32_ALPHABET[value % 32] + out;
    value = Math.floor(value / 32);
  }
  return out;
}

/**
 * 计算分片校验码：data 字段 Base64 解码后的字节取 SHA-256 前 5 字节，
 * 编码为 8 个 Crockford Base32 字符。
 * @param {Object} shareData - 解析后的分片对象（含 data 字段）
 * @returns {string|null} 校验码；data 无法 Base64 解码时返回 null
 */
export function computeShareChecksum(shareData) {
  try {
    const bytes = base64ToBytes(shareData.data);
    return crockford32Encode(sha256(bytes).slice(0, 5));
  } catch (error) {
    return null;
  }
}

/**
 * 校验分片对象携带的 checksum 字段。
 * @param {Object} shareData - 解析后的分片对象
 * @returns {boolean|undefined} true=匹配；false=不匹配或 data 已损坏；
 *   undefined=旧格式分片（无 checksum 字段），跳过校验视为有效
 */
export function verifyShareChecksum(shareData) {
  if (typeof shareData?.checksum !== 'string' || shareData.checksum === '') {
    return undefined;
  }
  const computed = computeShareChecksum(shareData);
  return computed !== null && computed === shareData.checksum.toUpperCase();
}
