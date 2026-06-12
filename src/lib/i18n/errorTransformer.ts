import { Language } from './translations';

// 标准化错误类型
export type StandardError = {
  code: string;
  messageZh: string;
  messageEn: string;
  originalError?: any;
};

// 错误代码映射
const errorMappings: Record<string, { zh: string; en: string }> = {
  // Cloudflare 错误
  'CF-10000': { zh: '认证失败，请检查 API Token', en: 'Authentication failed, please check API Token' },
  'CF-10001': { zh: 'API Token 无效', en: 'Invalid API Token' },
  'CF-10002': { zh: '权限不足，请检查 Token 权限范围', en: 'Permission denied, please check Token scope' },
  'CF-10003': { zh: '域名不存在', en: 'Domain not found' },
  'CF-10004': { zh: '记录不存在', en: 'Record not found' },
  'CF-10005': { zh: '记录已存在', en: 'Record already exists' },
  'CF-10006': { zh: '请求频率超限，请稍后重试', en: 'Rate limit exceeded, please retry later' },
  'CF-10007': { zh: 'DNS 记录类型不支持', en: 'DNS record type not supported' },
  'CF-10008': { zh: '记录内容格式无效', en: 'Invalid record content format' },
  
  // 阿里云错误
  'ALI-10000': { zh: '认证失败，请检查 AccessKey', en: 'Authentication failed, please check AccessKey' },
  'ALI-10001': { zh: 'AccessKey ID 无效', en: 'Invalid AccessKey ID' },
  'ALI-10002': { zh: 'AccessKey Secret 无效', en: 'Invalid AccessKey Secret' },
  'ALI-10003': { zh: '域名不存在或未添加', en: 'Domain not found or not added' },
  'ALI-10004': { zh: '记录不存在', en: 'Record not found' },
  'ALI-10005': { zh: '记录已存在', en: 'Record already exists' },
  'ALI-10006': { zh: '请求频率超限', en: 'Rate limit exceeded' },
  'ALI-10007': { zh: '域名格式无效', en: 'Invalid domain format' },
  
  // 腾讯云错误
  'TENCENT-10000': { zh: '认证失败，请检查 SecretId/Key', en: 'Authentication failed, please check SecretId/Key' },
  'TENCENT-10001': { zh: 'SecretId 无效', en: 'Invalid SecretId' },
  'TENCENT-10002': { zh: 'SecretKey 无效', en: 'Invalid SecretKey' },
  'TENCENT-10003': { zh: '域名不存在', en: 'Domain not found' },
  'TENCENT-10004': { zh: '记录不存在', en: 'Record not found' },
  'TENCENT-10005': { zh: '记录已存在', en: 'Record already exists' },
  'TENCENT-10006': { zh: '请求频率超限', en: 'Rate limit exceeded' },
  
  // 通用错误
  'NETWORK_ERROR': { zh: '网络连接超时或异常', en: 'Network connection timeout or error' },
  'UNKNOWN_ERROR': { zh: '未知错误', en: 'Unknown error' },
  'INVALID_INPUT': { zh: '输入内容无效', en: 'Invalid input' },
  'DECRYPTION_FAILED': { zh: '数据解密失败，请检查加密密钥', en: 'Data decryption failed, please check encryption key' },
  'FETCH_FAILED': { zh: '获取数据失败', en: 'Failed to fetch data' },
  'SAVE_FAILED': { zh: '保存失败', en: 'Failed to save' },
  'DELETE_FAILED': { zh: '删除失败', en: 'Failed to delete' },
};

// Cloudflare 错误识别
function parseCloudflareError(error: any): string {
  if (error?.errors?.[0]?.code) {
    return `CF-${error.errors[0].code}`;
  }
  if (error?.error?.code) {
    return `CF-${error.error.code}`;
  }
  if (error?.message?.includes('authentication')) {
    return 'CF-10000';
  }
  if (error?.message?.includes('rate limit')) {
    return 'CF-10006';
  }
  return 'UNKNOWN_ERROR';
}

// 阿里云错误识别
function parseAliyunError(error: any): string {
  if (error?.Code) {
    const code = error.Code;
    if (code.includes('InvalidAccessKeyId')) return 'ALI-10001';
    if (code.includes('SignatureDoesNotMatch')) return 'ALI-10002';
    if (code.includes('DomainNotExist')) return 'ALI-10003';
    if (code.includes('RecordNotExist')) return 'ALI-10004';
    if (code.includes('DomainRecordDuplicate')) return 'ALI-10005';
    if (code.includes('Throttling')) return 'ALI-10006';
    return 'ALI-10000';
  }
  return 'UNKNOWN_ERROR';
}

// 腾讯云错误识别
function parseTencentError(error: any): string {
  if (error?.Response?.Error?.Code) {
    const code = error.Response.Error.Code;
    if (code.includes('AuthFailure')) return 'TENCENT-10000';
    if (code.includes('InvalidSecretId')) return 'TENCENT-10001';
    if (code.includes('InvalidSecretKey')) return 'TENCENT-10002';
    if (code.includes('DomainNotExist')) return 'TENCENT-10003';
    if (code.includes('RecordNotExist')) return 'TENCENT-10004';
    if (code.includes('RecordDuplicate')) return 'TENCENT-10005';
    if (code.includes('RequestLimitExceeded')) return 'TENCENT-10006';
    return 'TENCENT-10000';
  }
  return 'UNKNOWN_ERROR';
}

// 中心化错误转换器
export function transformError(error: any, providerType?: string): StandardError {
  // 网络错误
  if (error?.name === 'TypeError' && error?.message?.includes('fetch')) {
    return {
      code: 'NETWORK_ERROR',
      messageZh: errorMappings['NETWORK_ERROR'].zh,
      messageEn: errorMappings['NETWORK_ERROR'].en,
      originalError: error,
    };
  }
  
  // 解密失败
  if (error?.message?.includes('Decryption failed') || error?.error === 'Decryption failed') {
    return {
      code: 'DECRYPTION_FAILED',
      messageZh: errorMappings['DECRYPTION_FAILED'].zh,
      messageEn: errorMappings['DECRYPTION_FAILED'].en,
      originalError: error,
    };
  }
  
  // 根据服务商类型解析错误
  let errorCode = 'UNKNOWN_ERROR';
  
  if (providerType === 'cloudflare') {
    errorCode = parseCloudflareError(error);
  } else if (providerType === 'aliyun') {
    errorCode = parseAliyunError(error);
  } else if (providerType === 'tencent') {
    errorCode = parseTencentError(error);
  } else {
    // 通用错误识别
    if (error?.message?.includes('fetch') || error?.message?.includes('network')) {
      errorCode = 'NETWORK_ERROR';
    } else if (error?.message?.includes('invalid')) {
      errorCode = 'INVALID_INPUT';
    }
  }
  
  const mapping = errorMappings[errorCode] || errorMappings['UNKNOWN_ERROR'];
  
  return {
    code: errorCode,
    messageZh: mapping.zh,
    messageEn: mapping.en,
    originalError: error,
  };
}

// 获取本地化错误消息
export function getErrorMessage(transformedError: StandardError, lang: Language): string {
  return lang === 'zh' ? transformedError.messageZh : transformedError.messageEn;
}

// 快捷函数：直接转换并获取本地化消息
export function formatError(error: any, lang: Language, providerType?: string): string {
  const transformed = transformError(error, providerType);
  return getErrorMessage(transformed, lang);
}