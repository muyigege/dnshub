import { NextResponse } from 'next/server';

/**
 * 标准化错误响应格式
 * 所有 API 路由必须使用此格式返回错误
 */
export interface StandardErrorResponse {
  success: false;
  code: string;
  messageCn: string;
  messageEn: string;
  details?: string; // 可选的详细错误信息（仅用于调试）
}

/**
 * 标准化成功响应格式
 */
export interface StandardSuccessResponse<T = any> {
  success: true;
  data: T;
}

/**
 * 云服务商错误拦截器
 * 将原始云服务商错误转换为标准化双语错误响应
 */
export function handleCloudError(error: any, providerType?: string): StandardErrorResponse {
  // 后端控制台日志（仅用于内部排查，不暴露给用户）
  console.error('[Internal Cloud Error Log]:', {
    provider: providerType || 'unknown',
    error: error?.message || error,
    code: error?.code,
    stack: error?.stack?.slice(0, 200),
  });

  // 1. 拦截网络错误：断网、DNS解析失败、服务商宕机
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND' || error?.name === 'FetchError' || error?.name === 'NetworkError') {
    return {
      success: false,
      code: 'NETWORK_TIMEOUT',
      messageCn: '与云服务商建立连接超时，请检查服务器网络或服务商状态',
      messageEn: 'Connection to cloud provider timed out, please check server network',
    };
  }

  // 2. 拦截 SSL/TLS 错误
  if (error?.code === 'CERT_HAS_EXPIRED' || error?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return {
      success: false,
      code: 'SSL_ERROR',
      messageCn: 'SSL证书验证失败，请检查服务器证书配置',
      messageEn: 'SSL certificate verification failed, please check server certificate',
    };
  }

  // 3. 深度拦截 Cloudflare 原始异常
  if (providerType === 'cloudflare' || error?.messages || error?.errors) {
    const firstErr = error?.errors?.[0] || {};
    const errorCode = firstErr.code || error?.code;

    // Cloudflare 错误码映射
    const cfErrorMap: Record<number, { code: string; cn: string; en: string }> = {
      1000: { code: 'CF_AUTH_FAILED', cn: 'Cloudflare API Token 无效或已过期', en: 'Invalid or expired Cloudflare API Token' },
      1001: { code: 'CF_AUTH_FAILED', cn: 'Cloudflare API Token 无效', en: 'Invalid Cloudflare API Token' },
      1002: { code: 'CF_PERMISSION_DENIED', cn: 'Cloudflare API Token 权限不足', en: 'Cloudflare API Token lacks required permissions' },
      1003: { code: 'CF_AUTH_FAILED', cn: 'Cloudflare 认证信息缺失', en: 'Missing Cloudflare authentication' },
      9103: { code: 'CF_AUTH_FAILED', cn: 'Cloudflare 凭证无效', en: 'Invalid Cloudflare credentials' },
      9109: { code: 'CF_ZONE_NOT_FOUND', cn: '域名不存在于 Cloudflare 账户中', en: 'Zone not found in Cloudflare account' },
      9110: { code: 'CF_RECORD_NOT_FOUND', cn: 'DNS 记录不存在', en: 'DNS record not found' },
      81057: { code: 'CF_RECORD_DUPLICATE', cn: 'DNS 记录已存在', en: 'DNS record already exists' },
      10004: { code: 'CF_RATE_LIMIT', cn: 'Cloudflare API 请求频率超限', en: 'Cloudflare API rate limit exceeded' },
    };

    if (errorCode && cfErrorMap[errorCode]) {
      const mapped = cfErrorMap[errorCode];
      return { success: false, code: mapped.code, messageCn: mapped.cn, messageEn: mapped.en };
    }

    // 通用 Cloudflare 错误
    if (error?.message?.includes('authentication') || error?.message?.includes('Unauthorized')) {
      return {
        success: false,
        code: 'CF_AUTH_FAILED',
        messageCn: 'Cloudflare 认证失败，请检查 API Token',
        messageEn: 'Cloudflare authentication failed, please check API Token',
      };
    }

    if (error?.message?.includes('rate limit') || error?.message?.includes('Too Many Requests')) {
      return {
        success: false,
        code: 'CF_RATE_LIMIT',
        messageCn: 'Cloudflare API 请求频率超限，请稍后重试',
        messageEn: 'Cloudflare API rate limit exceeded, please retry later',
      };
    }
  }

  // 4. 深度拦截阿里云 SDK 异常
  if (providerType === 'aliyun' || error?.Code) {
    const aliErrorCode = error?.Code || '';

    const aliErrorMap: Record<string, { code: string; cn: string; en: string }> = {
      'InvalidAccessKeyId.NotFound': { code: 'ALI_AUTH_FAILED', cn: '阿里云 AccessKey ID 不存在', en: 'Aliyun AccessKey ID not found' },
      'SignatureDoesNotMatch': { code: 'ALI_AUTH_FAILED', cn: '阿里云 AccessKey Secret 签名校验失败', en: 'Aliyun AccessKey Secret signature mismatch' },
      'InvalidAccessKeyId': { code: 'ALI_AUTH_FAILED', cn: '阿里云 AccessKey ID 无效', en: 'Invalid Aliyun AccessKey ID' },
      'Forbidden': { code: 'ALI_PERMISSION_DENIED', cn: '阿里云 API 权限不足', en: 'Insufficient Aliyun API permissions' },
      'DomainNotExist': { code: 'ALI_DOMAIN_NOT_FOUND', cn: '域名不存在于阿里云账户中', en: 'Domain not found in Aliyun account' },
      'DomainRecordDuplicate': { code: 'ALI_RECORD_DUPLICATE', cn: 'DNS 记录已存在', en: 'DNS record already exists' },
      'RecordNotExist': { code: 'ALI_RECORD_NOT_FOUND', cn: 'DNS 记录不存在', en: 'DNS record not found' },
      'Throttling': { code: 'ALI_RATE_LIMIT', cn: '阿里云 API 请求频率超限', en: 'Aliyun API rate limit exceeded' },
      'ServiceUnavailable': { code: 'ALI_SERVICE_ERROR', cn: '阿里云服务暂时不可用', en: 'Aliyun service temporarily unavailable' },
    };

    if (aliErrorCode && aliErrorMap[aliErrorCode]) {
      const mapped = aliErrorMap[aliErrorCode];
      return { success: false, code: mapped.code, messageCn: mapped.cn, messageEn: mapped.en };
    }

    // 通用阿里云认证错误
    if (aliErrorCode.includes('AuthFailure') || aliErrorCode.includes('Signature')) {
      return {
        success: false,
        code: 'ALI_AUTH_FAILED',
        messageCn: '阿里云认证失败，请检查 AccessKey',
        messageEn: 'Aliyun authentication failed, please check AccessKey',
      };
    }
  }

  // 5. 深度拦截腾讯云 SDK 异常
  if (providerType === 'tencent' || error?.Response?.Error) {
    const tencentError = error?.Response?.Error;
    const tencentErrorCode = tencentError?.Code || '';

    const tencentErrorMap: Record<string, { code: string; cn: string; en: string }> = {
      'AuthFailure.SecretIdNotFound': { code: 'TENCENT_AUTH_FAILED', cn: '腾讯云 SecretId 不存在', en: 'Tencent SecretId not found' },
      'AuthFailure.SignatureFailure': { code: 'TENCENT_AUTH_FAILED', cn: '腾讯云 SecretKey 签名校验失败', en: 'Tencent SecretKey signature mismatch' },
      'AuthFailure.InvalidSecretId': { code: 'TENCENT_AUTH_FAILED', cn: '腾讯云 SecretId 无效', en: 'Invalid Tencent SecretId' },
      'UnauthorizedOperation': { code: 'TENCENT_PERMISSION_DENIED', cn: '腾讯云 API 权限不足', en: 'Insufficient Tencent API permissions' },
      'InvalidParameter.DomainNotExist': { code: 'TENCENT_DOMAIN_NOT_FOUND', cn: '域名不存在于腾讯云账户中', en: 'Domain not found in Tencent account' },
      'InvalidParameter.RecordDuplicate': { code: 'TENCENT_RECORD_DUPLICATE', cn: 'DNS 记录已存在', en: 'DNS record already exists' },
      'InvalidParameter.RecordNotExist': { code: 'TENCENT_RECORD_NOT_FOUND', cn: 'DNS 记录不存在', en: 'DNS record not found' },
      'RequestLimitExceeded': { code: 'TENCENT_RATE_LIMIT', cn: '腾讯云 API 请求频率超限', en: 'Tencent API rate limit exceeded' },
      'InternalError': { code: 'TENCENT_SERVICE_ERROR', cn: '腾讯云服务内部错误', en: 'Tencent service internal error' },
    };

    if (tencentErrorCode && tencentErrorMap[tencentErrorCode]) {
      const mapped = tencentErrorMap[tencentErrorCode];
      return { success: false, code: mapped.code, messageCn: mapped.cn, messageEn: mapped.en };
    }

    // 通用腾讯云认证错误
    if (tencentErrorCode.includes('AuthFailure') || tencentErrorCode.includes('Signature')) {
      return {
        success: false,
        code: 'TENCENT_AUTH_FAILED',
        messageCn: '腾讯云认证失败，请检查 SecretId/SecretKey',
        messageEn: 'Tencent authentication failed, please check SecretId/SecretKey',
      };
    }
  }

  // 6. 通用错误拦截（基于错误消息关键词）
  const errStr = String(error?.message || error || '').toUpperCase();

  if (errStr.includes('AUTH') || errStr.includes('UNAUTHORIZED') || errStr.includes('FORBIDDEN')) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      messageCn: '认证失败，请检查服务商凭证配置',
      messageEn: 'Authentication failed, please check provider credentials',
    };
  }

  if (errStr.includes('RATE') || errStr.includes('LIMIT') || errStr.includes('THROTTLE')) {
    return {
      success: false,
      code: 'RATE_LIMIT',
      messageCn: '请求过于频繁，已被云服务商触发限流保护',
      messageEn: 'Too many requests, rate limited by cloud provider',
    };
  }

  if (errStr.includes('NOT FOUND') || errStr.includes('NOTEXIST') || errStr.includes('DOES NOT EXIST')) {
    return {
      success: false,
      code: 'NOT_FOUND',
      messageCn: '请求的资源不存在',
      messageEn: 'Requested resource not found',
    };
  }

  if (errStr.includes('INVALID') || errStr.includes('PARAM')) {
    return {
      success: false,
      code: 'INVALID_PARAM',
      messageCn: '请求参数无效',
      messageEn: 'Invalid request parameters',
    };
  }

  if (errStr.includes('DECRYPTION') || errStr.includes('ENCRYPT')) {
    return {
      success: false,
      code: 'DECRYPTION_FAILED',
      messageCn: '数据解密失败，请检查加密密钥配置',
      messageEn: 'Data decryption failed, please check encryption key',
    };
  }

  // 7. 默认服务器错误
  return {
    success: false,
    code: 'SERVER_ERROR',
    messageCn: '服务商接口内部错误，请稍后再试',
    messageEn: 'Cloud provider server error, please try again later',
  };
}

/**
 * 创建标准化成功响应
 */
export function successResponse<T>(data: T): StandardSuccessResponse<T> {
  return { success: true, data };
}

/**
 * 创建标准化错误响应（用于 NextResponse）
 */
export function errorResponse(error: any, providerType?: string, status = 400): NextResponse {
  const errPayload = handleCloudError(error, providerType);
  return NextResponse.json(errPayload, { status });
}

/**
 * 验证必需参数
 * 如果参数缺失，返回标准化错误响应
 */
export function validateRequired(params: Record<string, any>, requiredFields: string[]): StandardErrorResponse | null {
  for (const field of requiredFields) {
    if (!params[field] || (typeof params[field] === 'string' && params[field].trim() === '')) {
      return {
        success: false,
        code: 'MISSING_PARAM',
        messageCn: `缺少必需参数: ${field}`,
        messageEn: `Missing required parameter: ${field}`,
      };
    }
  }
  return null;
}

/**
 * 获取本地化错误消息（根据请求头语言）
 */
export function getLocalizedError(error: StandardErrorResponse, acceptLanguage?: string): string {
  const isZh = acceptLanguage?.includes('zh') || acceptLanguage?.includes('CN');
  return isZh ? error.messageCn : error.messageEn;
}