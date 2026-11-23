/**
 * 加密工具模块
 * 使用 OpenPGP 实现对称加密和解密功能
 */

import * as openpgp from 'openpgp';

export const PGP_ARMOR_HEADER = '-----BEGIN PGP MESSAGE-----';

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
 * 文本按 ASCII 装甲解析；二进制数据先探测装甲头，命中则按文本处理，否则按 PGP 二进制包解析
 *
 * @param {string|ArrayBuffer|Uint8Array} encryptedData - 加密内容（装甲字符串或二进制）
 * @param {string} password - 解密密码
 * @returns {Promise<string>} - 返回解密后的明文
 * @throws {Error} - 密码错误或格式不兼容时抛出
 */
export async function decryptWithPassword(encryptedData, password) {
  if (!encryptedData) {
    throw new Error('加密数据不能为空');
  }

  if (!password || typeof password !== 'string') {
    throw new Error('密码必须是非空字符串');
  }

  let data = encryptedData;
  if (data instanceof ArrayBuffer) {
    data = new Uint8Array(data);
  }

  if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
    throw new Error('不支持的加密数据格式');
  }

  try {
    let message;
    if (typeof data === 'string') {
      message = await openpgp.readMessage({ armoredMessage: data });
    } else {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
      message = text.startsWith(PGP_ARMOR_HEADER)
        ? await openpgp.readMessage({ armoredMessage: text })
        : await openpgp.readMessage({ binaryMessage: data });
    }

    const { data: decrypted } = await openpgp.decrypt({ message, passwords: [password] });
    return decrypted;
  } catch (error) {
    const reason = error?.message || String(error);

    // openpgp 对错误密码抛 'Session key decryption failed.'
    if (reason.includes('Session key decryption failed') || reason.includes('密码错误')) {
      throw new Error('密码错误，无法解密');
    }

    throw new Error('GPG 文件格式可能不兼容，请确认文件是通过标准的 GPG 工具或本工具生成的');
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

  // 根据分数确定强度等级（加密分片面临离线暴力破解，长度建议以 12 位为基准）
  if (score < 3) {
    return {
      strength: 'weak',
      message: '密码强度弱：建议使用至少12位字符，包含大小写字母、数字和特殊字符',
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
