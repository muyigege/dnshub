import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 从环境变量或本地持久文件获取加密密钥，避免进程重启后无法解密旧数据。
const loadEncryptionKey = (): string => {
  const envKey = process.env.ENCRYPTION_KEY?.trim();
  if (envKey) return envKey;

  const dataDir = path.resolve(process.cwd(), 'data');
  const keyPath = path.resolve(dataDir, 'encryption.key');

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(keyPath)) {
      const savedKey = fs.readFileSync(keyPath, 'utf8').trim();
      if (savedKey) return savedKey;
    }

    const generatedKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, `${generatedKey}\n`, { mode: 0o600 });
    return generatedKey;
  } catch (error) {
    console.warn('Failed to load persistent encryption key, using process-local fallback:', error);
    return crypto.randomBytes(32).toString('hex');
  }
};

const ENCRYPTION_KEY = loadEncryptionKey();
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 初始化向量长度
const SALT_LENGTH = 64; // 盐值长度
const TAG_LENGTH = 16; // 认证标签长度
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

/**
 * 派生密钥（使用 PBKDF2）
 */
const deriveKey = (salt: Buffer): Buffer => {
  return crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha256');
};

export const getEncryptionSecret = (): string => ENCRYPTION_KEY;

/**
 * 加密文本
 * @param plaintext - 待加密的明文
 * @returns 加密后的 Base64 字符串
 */
export const encrypt = (plaintext: string): string => {
  try {
    // 生成随机盐值和初始化向量
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // 派生密钥
    const key = deriveKey(salt);

    // 创建加密器
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // 加密数据
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    // 获取认证标签
    const tag = cipher.getAuthTag();

    // 组合：salt + iv + tag + encrypted
    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    // 返回 Base64 编码
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption failed');
  }
};

/**
 * 解密文本
 * @param ciphertext - 加密的 Base64 字符串
 * @returns 解密后的明文
 */
export const decrypt = (ciphertext: string): string => {
  try {
    // 解码 Base64
    const combined = Buffer.from(ciphertext, 'base64');

    // 提取各个部分
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, TAG_POSITION);
    const tag = combined.subarray(TAG_POSITION, ENCRYPTED_POSITION);
    const encrypted = combined.subarray(ENCRYPTED_POSITION);

    // 派生密钥
    const key = deriveKey(salt);

    // 创建解密器
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // 设置认证标签
    decipher.setAuthTag(tag);

    // 解密数据
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Decryption failed');
  }
};

/**
 * 加密 JSON 对象
 * @param obj - 待加密的 JSON 对象
 * @returns 加密后的 Base64 字符串
 */
export const encryptJSON = <T>(obj: T): string => {
  const jsonString = JSON.stringify(obj);
  return encrypt(jsonString);
};

/**
 * 解密 JSON 对象
 * @param ciphertext - 加密的 Base64 字符串
 * @returns 解密后的 JSON 对象
 */
export const decryptJSON = <T>(ciphertext: string): T => {
  const jsonString = decrypt(ciphertext);
  return JSON.parse(jsonString) as T;
};

/**
 * 验证加密/解密功能是否正常
 */
export const verifyEncryption = (): boolean => {
  try {
    const testData = 'Hello, Universal DNS Hub!';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    return decrypted === testData;
  } catch (error) {
    console.error('Encryption verification failed:', error);
    return false;
  }
};

// ============================================================
// 密码派生加解密 —— 用于导出/导入配置文件的密码保护
// ============================================================

const PASSWORD_SALT_LENGTH = 32;
const PASSWORD_IV_LENGTH = 16;
const PASSWORD_TAG_LENGTH = 16;
const PASSWORD_ITERATIONS = 200000; // 高强度迭代，防止暴力破解

/**
 * 用用户密码加密数据（用于导出配置文件时的密码保护）
 * 格式: salt(32B) + iv(16B) + tag(16B) + ciphertext
 * @param plaintext - 待加密的明文数据
 * @param password - 用户设定的密码
 * @returns Base64 编码的密文
 */
export const encryptWithPassword = (plaintext: string, password: string): string => {
  const salt = crypto.randomBytes(PASSWORD_SALT_LENGTH);
  const iv = crypto.randomBytes(PASSWORD_IV_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return combined.toString('base64');
};

/**
 * 用用户密码解密数据（用于导入配置文件时的密码验证）
 * @param encoded - Base64 编码的密文
 * @param password - 用户输入的密码
 * @returns 解密后的明文，密码错误抛出 Error
 */
export const decryptWithPassword = (encoded: string, password: string): string => {
  const combined = Buffer.from(encoded, 'base64');
  const salt = combined.subarray(0, PASSWORD_SALT_LENGTH);
  const iv = combined.subarray(PASSWORD_SALT_LENGTH, PASSWORD_SALT_LENGTH + PASSWORD_IV_LENGTH);
  const tag = combined.subarray(PASSWORD_SALT_LENGTH + PASSWORD_IV_LENGTH, PASSWORD_SALT_LENGTH + PASSWORD_IV_LENGTH + PASSWORD_TAG_LENGTH);
  const encrypted = combined.subarray(PASSWORD_SALT_LENGTH + PASSWORD_IV_LENGTH + PASSWORD_TAG_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};

// 导出类型定义
export type CredentialData = {
  [key: string]: string | number | boolean;
};
