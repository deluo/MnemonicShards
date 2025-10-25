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
 * 使用密码对加密内容进行解密
 *
 * @param {string|ArrayBuffer} encryptedData - 需要解密的加密内容 (ASCII armored string 或 binary ArrayBuffer)
 * @param {string} password - 解密密码
 * @returns {Promise<string>} - 返回解密后的明文
 * @throws {Error} - 如果解密过程中出现错误或密码不正确
 */
export async function decryptWithPassword(encryptedData, password) {
  try {
    if (!encryptedData) {
      throw new Error('加密数据不能为空');
    }

    if (!password || typeof password !== 'string') {
      throw new Error('密码必须是非空字符串');
    }

    let message;
    let decryptedSuccess = false;
    const errors = [];

    // 尝试多种解密方式以确保兼容性
    const tryDecrypt = async (method, data, description) => {
      try {
        if (method === 'armored') {
          message = await openpgp.readMessage({ armoredMessage: data });
        } else if (method === 'binary') {
          message = await openpgp.readMessage({ binaryMessage: data });
        }

        const { data: decrypted } = await openpgp.decrypt({
          message,
          passwords: [password],
        });

        decryptedSuccess = true;
        return decrypted;
      } catch (error) {
        errors.push(`${description}: ${error.message}`);
        return null;
      }
    };

    // 如果是字符串格式
    if (typeof encryptedData === 'string') {
      // 尝试直接作为ASCII装甲格式
      const result1 = await tryDecrypt('armored', encryptedData, '字符串-ASCII装甲');
      if (result1) return result1;

      // 如果ASCII装甲失败，尝试转换为二进制再解密
      const encoder = new TextEncoder();
      const binaryData = encoder.encode(encryptedData);
      const result2 = await tryDecrypt('binary', binaryData, '字符串-转二进制');
      if (result2) return result2;

    } else if (encryptedData instanceof ArrayBuffer) {
      const uint8Data = new Uint8Array(encryptedData);

      // 尝试直接作为二进制格式
      const result1 = await tryDecrypt('binary', uint8Data, 'ArrayBuffer-二进制');
      if (result1) return result1;

      // 如果二进制失败，尝试转换为文本作为ASCII装甲格式
      try {
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const textContent = textDecoder.decode(encryptedData);
        if (textContent.includes('-----BEGIN PGP MESSAGE-----')) {
          const result2 = await tryDecrypt('armored', textContent, 'ArrayBuffer-转ASCII装甲');
          if (result2) return result2;
        }
      } catch (textError) {
        // 忽略文本解码错误
      }
    } else {
      throw new Error('不支持的加密数据格式');
    }

    // 如果所有方法都失败了，分析错误原因
    if (!decryptedSuccess) {
      // 检查是否是密码错误
      const passwordError = errors.some(err =>
        err.includes('Incorrect password') ||
        err.includes('Session key decryption failed') ||
        err.includes('Invalid session key')
      );

      if (passwordError) {
        throw new Error('密码错误，无法解密');
      }

      // 检查是否是格式错误
      const formatError = errors.some(err =>
        err.includes('not a valid') ||
        err.includes('Invalid') ||
        err.includes('ASCII armor') ||
        err.includes('No data')
      );

      if (formatError) {
        console.warn('解密尝试失败详情:', errors);
        throw new Error('GPG文件格式可能不兼容，请确认文件是通过标准的GPG工具或本工具生成的');
      }

      // 其他未知错误
      throw new Error(`解密失败: ${errors[0] || '未知错误'}`);
    }

    // 这里不应该到达，但为了类型安全
    throw new Error('解密过程中发生未知错误');
  } catch (error) {
    // 如果是我们自己抛出的错误，直接传递
    if (error.message.includes('密码错误') ||
        error.message.includes('格式') ||
        error.message.includes('不支持的加密数据格式')) {
      throw error;
    }

    // 其他未知错误
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
 * 检测GPG文件格式类型
 *
 * @param {string|ArrayBuffer|Uint8Array} data - 文件数据
 * @returns {Object} - 返回检测结果对象，包含 type (格式类型) 和 isBinary (是否为二进制)
 */
export function detectGpgFormat(data) {
  try {
    if (!data) {
      return { type: 'unknown', isBinary: false };
    }

    // 如果是字符串，检查是否包含PGP装甲标记
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('-----BEGIN PGP MESSAGE-----')) {
        return { type: 'ascii-armor', isBinary: false };
      }
      // 可能是二进制数据被错误地当作字符串读取
      return { type: 'unknown-text', isBinary: false };
    }

    // 如果是ArrayBuffer或Uint8Array，检查是否为二进制PGP格式
    let uint8Data;
    if (data instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      uint8Data = data;
    } else {
      return { type: 'unknown', isBinary: false };
    }

    // 检查是否为ASCII装甲格式的字节
    const header = '-----BEGIN PGP MESSAGE-----';
    const headerBytes = new TextEncoder().encode(header);

    // 检查开头是否匹配ASCII装甲头部
    if (uint8Data.length >= headerBytes.length) {
      let isArmor = true;
      for (let i = 0; i < headerBytes.length; i++) {
        if (uint8Data[i] !== headerBytes[i]) {
          isArmor = false;
          break;
        }
      }
      if (isArmor) {
        return { type: 'ascii-armor', isBinary: false };
      }
    }

    // 检查是否包含二进制PGP标记
    // PGP二进制包通常以特定的字节序列开头
    if (uint8Data.length >= 2) {
      // 检查常见的PGP数据包标签
      const packetTag = uint8Data[0];
      // PGP数据包的bit 7-6是版本号，bit 5-0是包类型
      if ((packetTag & 0x80) === 0x80) {
        // 这看起来像一个PGP数据包
        return { type: 'binary-packet', isBinary: true };
      }
    }

    // 如果都不是，可能是其他二进制格式
    return { type: 'binary', isBinary: true };
  } catch (error) {
    return { type: 'unknown', isBinary: false };
  }
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
