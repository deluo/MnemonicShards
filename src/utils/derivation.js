/**
 * BTC 地址派生工具
 * BIP39 助记词 → 种子 → BIP32 账户密钥 → 收款地址 / 账户级扩展公钥
 *
 * 边界：本模块只产出地址与扩展公钥（xpub/ypub/zpub），
 * 私钥仅存在于派生过程内存中，从不输出、从不展示
 */

import { HDKey } from '@scure/bip32';
import { bech32, base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';

// BIP39 默认派生参数
const PBKDF2_ITERATIONS = 2048;
const SEED_BITS = 512;

// hash160 = RIPEMD160(SHA256(x))，P2PKH/P2SH/P2WPKH 共用的地址哈希
function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

/**
 * BIP39 助记词转种子
 * PBKDF2-HMAC-SHA512，密码为 NFKD 归一化的助记词，盐为 "mnemonic" + NFKD 归一化的 passphrase
 * @param {string} mnemonic - 空格分隔的助记词
 * @param {string} [passphrase] - BIP39 passphrase（第 25 词），无则留空
 * @returns {Promise<Uint8Array>} 64 字节种子
 */
export async function mnemonicToSeed(mnemonic, passphrase = '') {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(mnemonic.normalize('NFKD')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-512',
      salt: encoder.encode(`mnemonic${passphrase}`.normalize('NFKD')),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    SEED_BITS,
  );

  return new Uint8Array(bits);
}

/**
 * P2WPKH（Native SegWit，bc1 开头）
 * @param {Uint8Array} publicKey - 压缩公钥
 * @returns {string} 地址
 */
function encodeP2WPKH(publicKey) {
  const program = hash160(publicKey);
  return bech32.encode('bc', [0, ...bech32.toWords(program)]);
}

/**
 * P2SH-P2WPKH（Nested SegWit，3 开头）
 * 赎回脚本为 0x0014 + 20 字节公钥哈希
 * @param {Uint8Array} publicKey - 压缩公钥
 * @returns {string} 地址
 */
function encodeP2SHP2WPKH(publicKey) {
  const witnessProgram = hash160(publicKey);
  const redeemScript = Uint8Array.of(0x00, 0x14, ...witnessProgram);
  const b58c = base58check(sha256);
  return b58c.encode(Uint8Array.of(0x05, ...hash160(redeemScript)));
}

/**
 * P2PKH（Legacy，1 开头）
 * @param {Uint8Array} publicKey - 压缩公钥
 * @returns {string} 地址
 */
function encodeP2PKH(publicKey) {
  const b58c = base58check(sha256);
  return b58c.encode(Uint8Array.of(0x00, ...hash160(publicKey)));
}

const ADDRESS_ENCODERS = {
  p2wpkh: encodeP2WPKH,
  'p2sh-p2wpkh': encodeP2SHP2WPKH,
  p2pkh: encodeP2PKH,
};

/**
 * 派生指定路径预设的账户密钥
 * @param {Uint8Array} seed - BIP39 种子
 * @param {Object} preset - DERIVATION_CONFIG.PATH_PRESETS 中的一项
 * @returns {Object} { accountKey: HDKey, xpub: string }
 */
export function deriveAccount(seed, preset) {
  const accountKey = HDKey.fromMasterSeed(seed, preset.extVersions).derive(preset.path);
  return { accountKey, xpub: accountKey.publicExtendedKey };
}

/**
 * 派生账户收款链（/0/*）第 index 个地址
 * @param {HDKey} accountKey - deriveAccount 返回的账户密钥
 * @param {Object} preset - 路径预设（决定地址编码类型）
 * @param {number} index - 地址序号（从 0 开始）
 * @returns {string} 地址
 */
export function deriveAddress(accountKey, preset, index) {
  const publicKey = accountKey.deriveChild(0).deriveChild(index).publicKey;
  return ADDRESS_ENCODERS[preset.addressType](publicKey);
}
