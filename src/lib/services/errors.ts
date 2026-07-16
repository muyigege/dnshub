/**
 * 统一错误类型定义
 *
 * 所有业务层抛出的错误都应该是 DnsServiceError 的子类，
 * 路由层通过 toErrorResponse() 转换为标准 HTTP 响应。
 *
 * 设计原则：
 * - 不暴露内部堆栈给客户端
 * - 错误码标准化，便于前端 i18n 和 MCP 客户端处理
 * - 保留 cause 用于内部排查
 */

export type DnsErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PARTIAL_FAILURE'
  | 'ROLLBACK_FAILED'
  | 'ROLLBACK_CONFLICT'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

const errorCodeToHttpStatus: Record<DnsErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CAPABILITY_UNSUPPORTED: 422,
  PROVIDER_AUTH_ERROR: 401,
  PROVIDER_RATE_LIMIT: 429,
  PROVIDER_UNAVAILABLE: 503,
  PARTIAL_FAILURE: 207,
  ROLLBACK_FAILED: 500,
  ROLLBACK_CONFLICT: 409,
  TIMEOUT: 504,
  INTERNAL_ERROR: 500,
};

export interface DnsErrorPayload {
  success: false;
  code: DnsErrorCode;
  messageCn: string;
  messageEn: string;
  details?: string;
}

export class DnsServiceError extends Error {
  readonly code: DnsErrorCode;
  readonly messageCn: string;
  readonly messageEn: string;
  readonly details?: string;
  readonly cause?: unknown;

  constructor(params: {
    code: DnsErrorCode;
    messageCn: string;
    messageEn: string;
    details?: string;
    cause?: unknown;
  }) {
    super(params.messageEn);
    this.name = 'DnsServiceError';
    this.code = params.code;
    this.messageCn = params.messageCn;
    this.messageEn = params.messageEn;
    this.details = params.details;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
  }

  toPayload(): DnsErrorPayload {
    return {
      success: false,
      code: this.code,
      messageCn: this.messageCn,
      messageEn: this.messageEn,
      details: this.details,
    };
  }

  httpStatus(): number {
    return errorCodeToHttpStatus[this.code];
  }
}

export class ValidationError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'VALIDATION_ERROR', messageCn, messageEn, details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'NOT_FOUND', messageCn, messageEn, details });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'CONFLICT', messageCn, messageEn, details });
    this.name = 'ConflictError';
  }
}

export class CapabilityUnsupportedError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'CAPABILITY_UNSUPPORTED', messageCn, messageEn, details });
    this.name = 'CapabilityUnsupportedError';
  }
}

export class ProviderAuthError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'PROVIDER_AUTH_ERROR', messageCn, messageEn, details });
    this.name = 'ProviderAuthError';
  }
}

export class ProviderRateLimitError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'PROVIDER_RATE_LIMIT', messageCn, messageEn, details });
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderUnavailableError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'PROVIDER_UNAVAILABLE', messageCn, messageEn, details });
    this.name = 'ProviderUnavailableError';
  }
}

export class PartialFailureError extends DnsServiceError {
  readonly partialResults: unknown[];
  constructor(messageCn: string, messageEn: string, partialResults: unknown[], details?: string) {
    super({ code: 'PARTIAL_FAILURE', messageCn, messageEn, details });
    this.name = 'PartialFailureError';
    this.partialResults = partialResults;
  }
}

export class RollbackFailedError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'ROLLBACK_FAILED', messageCn, messageEn, details });
    this.name = 'RollbackFailedError';
  }
}

export class RollbackConflictError extends DnsServiceError {
  constructor(messageCn: string, messageEn: string, details?: string) {
    super({ code: 'ROLLBACK_CONFLICT', messageCn, messageEn, details });
    this.name = 'RollbackConflictError';
  }
}

/**
 * 将任意错误转换为 DnsServiceError。
 * 已是 DnsServiceError 的原样返回，其他错误包装为 INTERNAL_ERROR。
 */
export function normalizeError(err: unknown): DnsServiceError {
  if (err instanceof DnsServiceError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new DnsServiceError({
    code: 'INTERNAL_ERROR',
    messageCn: '服务器内部错误',
    messageEn: 'Internal server error',
    details: msg,
    cause: err,
  });
}
