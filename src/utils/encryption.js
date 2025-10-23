/**
 * 加密工具模块
 * 使用 OpenPGP 实现对称加密和解密功能
 */

import * as openpgp from 'openpgp';

/**
 * 使用密码对文本进行对称加密
 *
 * @param {string} plaintext - 需要加密的明文
 * @param {string} password - 加密密码
 * @returns {Promise<string>} - 返回加密后的文本 (ASCII armored format)
 * @throws {Error} - 如果加密过程中出现错误
 */
export async function encryptWithPassword(plaintext, password) {
  try {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('明文必须是非空字符串');
    }

    if (!password || typeof password !== 'string') {
      throw new Error('密码必须是非空字符串');
    }

    // 使用 OpenPGP 进行对称加密，配置与标准GPG兼容的参数
    const message = await openpgp.createMessage({ text: plaintext });
    const encrypted = await openpgp.encrypt({
      message,
      passwords: [password],
      format: 'armored', // 输出 ASCII armored 格式
      config: {
        preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
        preferredHashAlgorithm: openpgp.enums.hash.sha256,
        preferredCompressionAlgorithm: openpgp.enums.compression.zip,
        s2kIterationCountByte: 0x90, // 高迭代次数增强安全性
        aeadProtect: false, // 禁用AEAD以增强与GPG的兼容性
      },
    });

    return encrypted;
  } catch (error) {
    throw new Error(`加密失败: ${error.message}`);
  }
}

/**
 * 使用密码对加密文本进行解密
 *
 * @param {string} encryptedText - 需要解密的加密文本 (ASCII armored format)
 * @param {string} password - 解密密码
 * @returns {Promise<string>} - 返回解密后的明文
 * @throws {Error} - 如果解密过程中出现错误或密码不正确
 */
export async function decryptWithPassword(encryptedText, password) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('加密文本必须是非空字符串');
    }

    if (!password || typeof password !== 'string') {
      throw new Error('密码必须是非空字符串');
    }

    // 使用 OpenPGP 进行对称解密
    const message = await openpgp.readMessage({ armoredMessage: encryptedText });
    const { data: decrypted } = await openpgp.decrypt({
      message,
      passwords: [password],
    });

    return decrypted;
  } catch (error) {
    // 特殊处理密码错误的情况
    if (error.message.includes('Incorrect password') || error.message.includes('Session key decryption failed')) {
      throw new Error('密码错误，无法解密');
    }
    throw new Error(`解密失败: ${error.message}`);
  }
}

/**
 * 验证密码强度
 *
 * @param {string} password - 需要验证的密码
 * @returns {Object} - 返回验证结果对象，包含 strength (强度等级) 和 message (描述信息)
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return {
      strength: 'weak',
      message: '密码不能为空',
    };
  }

  const length = password.length;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  // 计算密码强度分数
  let score = 0;
  if (length >= 8) score += 1;
  if (length >= 12) score += 1;
  if (hasUpperCase) score += 1;
  if (hasLowerCase) score += 1;
  if (hasNumbers) score += 1;
  if (hasSpecialChar) score += 1;

  // 根据分数确定强度等级
  if (score < 3) {
    return {
      strength: 'weak',
      message: '密码强度弱：建议使用至少8位字符，包含大小写字母、数字和特殊字符',
    };
  } else if (score < 5) {
    return {
      strength: 'medium',
      message: '密码强度中等：建议增加密码长度和复杂度',
    };
  } else {
    return {
      strength: 'strong',
      message: '密码强度强：密码安全性高',
    };
  }
}

/**
 * 验证两个密码是否匹配
 *
 * @param {string} password - 第一个密码
 * @param {string} confirmPassword - 需要匹配的第二个密码
 * @returns {Object} - 返回验证结果对象，包含 isValid (是否匹配) 和 message (描述信息)
 */
export function validatePasswordMatch(password, confirmPassword) {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      message: '密码不能为空',
    };
  }

  if (!confirmPassword || typeof confirmPassword !== 'string') {
    return {
      isValid: false,
      message: '确认密码不能为空',
    };
  }

  if (password !== confirmPassword) {
    return {
      isValid: false,
      message: '两次输入的密码不匹配',
    };
  }

  return {
    isValid: true,
    message: '密码匹配成功',
  };
}

/**
 * 生成随机密码
 *
 * @param {number} length - 密码长度，默认为16
 * @param {Object} options - 密码生成选项
 * @param {boolean} options.includeUppercase - 是否包含大写字母，默认为true
 * @param {boolean} options.includeLowercase - 是否包含小写字母，默认为true
 * @param {boolean} options.includeNumbers - 是否包含数字，默认为true
 * @param {boolean} options.includeSpecialChars - 是否包含特殊字符，默认为true
 * @returns {string} - 生成的随机密码
 */
export function generateRandomPassword(length = 16, options = {}) {
  const { includeUppercase = true, includeLowercase = true, includeNumbers = true, includeSpecialChars = true } = options;

  let charset = '';
  if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (includeNumbers) charset += '0123456789';
  if (includeSpecialChars) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!charset) {
    throw new Error('至少需要选择一种字符类型');
  }

  let password = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }

  return password;
}

/**
 * 安全地比较两个字符串，防止时序攻击
 *
 * @param {string} a - 第一个字符串
 * @param {string} b - 第二个字符串
 * @returns {boolean} - 如果字符串相等返回true，否则返回false
 */
export function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
