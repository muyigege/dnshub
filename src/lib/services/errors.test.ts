import { describe, it, expect } from 'vitest';
import {
  DnsServiceError,
  ValidationError,
  NotFoundError,
  ConflictError,
  CapabilityUnsupportedError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  PartialFailureError,
  RollbackFailedError,
  RollbackConflictError,
  normalizeError,
} from './errors';

describe('DnsServiceError', () => {
  it('构造函数正确设置字段', () => {
    const err = new DnsServiceError({
      code: 'INTERNAL_ERROR',
      messageCn: '内部错误',
      messageEn: 'Internal error',
      details: 'stack trace',
    });
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.messageCn).toBe('内部错误');
    expect(err.messageEn).toBe('Internal error');
    expect(err.details).toBe('stack trace');
    expect(err.name).toBe('DnsServiceError');
    expect(err.message).toBe('Internal error'); // Error.message 用 messageEn
  });

  it('toPayload 返回标准载荷', () => {
    const err = new DnsServiceError({
      code: 'CONFLICT',
      messageCn: '冲突',
      messageEn: 'Conflict',
    });
    expect(err.toPayload()).toEqual({
      success: false,
      code: 'CONFLICT',
      messageCn: '冲突',
      messageEn: 'Conflict',
      details: undefined,
    });
  });

  it('httpStatus 返回正确的 HTTP 状态码', () => {
    expect(new ValidationError('a', 'b').httpStatus()).toBe(400);
    expect(new NotFoundError('a', 'b').httpStatus()).toBe(404);
    expect(new ConflictError('a', 'b').httpStatus()).toBe(409);
    expect(new CapabilityUnsupportedError('a', 'b').httpStatus()).toBe(422);
    expect(new ProviderAuthError('a', 'b').httpStatus()).toBe(401);
    expect(new ProviderRateLimitError('a', 'b').httpStatus()).toBe(429);
    expect(new ProviderUnavailableError('a', 'b').httpStatus()).toBe(503);
    expect(new RollbackConflictError('a', 'b').httpStatus()).toBe(409);
    expect(new DnsServiceError({ code: 'TIMEOUT', messageCn: 'a', messageEn: 'b' }).httpStatus()).toBe(504);
    expect(new DnsServiceError({ code: 'INTERNAL_ERROR', messageCn: 'a', messageEn: 'b' }).httpStatus()).toBe(500);
    expect(new DnsServiceError({ code: 'PARTIAL_FAILURE', messageCn: 'a', messageEn: 'b' }).httpStatus()).toBe(207);
    expect(new DnsServiceError({ code: 'ROLLBACK_FAILED', messageCn: 'a', messageEn: 'b' }).httpStatus()).toBe(500);
  });
});

describe('错误子类 code 与 name', () => {
  it('ValidationError', () => {
    const err = new ValidationError('参数错误', 'Invalid param', 'detail');
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('ValidationError');
    expect(err.details).toBe('detail');
  });

  it('NotFoundError', () => {
    const err = new NotFoundError('未找到', 'Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
  });

  it('ConflictError', () => {
    const err = new ConflictError('冲突', 'Conflict');
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
  });

  it('CapabilityUnsupportedError', () => {
    const err = new CapabilityUnsupportedError('不支持', 'Unsupported');
    expect(err.code).toBe('CAPABILITY_UNSUPPORTED');
    expect(err.name).toBe('CapabilityUnsupportedError');
  });

  it('ProviderAuthError', () => {
    const err = new ProviderAuthError('认证失败', 'Auth failed');
    expect(err.code).toBe('PROVIDER_AUTH_ERROR');
    expect(err.name).toBe('ProviderAuthError');
  });

  it('ProviderRateLimitError', () => {
    const err = new ProviderRateLimitError('限流', 'Rate limited');
    expect(err.code).toBe('PROVIDER_RATE_LIMIT');
    expect(err.name).toBe('ProviderRateLimitError');
  });

  it('ProviderUnavailableError', () => {
    const err = new ProviderUnavailableError('不可用', 'Unavailable');
    expect(err.code).toBe('PROVIDER_UNAVAILABLE');
    expect(err.name).toBe('ProviderUnavailableError');
  });

  it('PartialFailureError 携带 partialResults', () => {
    const partial = [{ id: 1, ok: true }, { id: 2, ok: false }];
    const err = new PartialFailureError('部分失败', 'Partial failure', partial);
    expect(err.code).toBe('PARTIAL_FAILURE');
    expect(err.name).toBe('PartialFailureError');
    expect(err.partialResults).toEqual(partial);
  });

  it('RollbackFailedError', () => {
    const err = new RollbackFailedError('回退失败', 'Rollback failed');
    expect(err.code).toBe('ROLLBACK_FAILED');
    expect(err.name).toBe('RollbackFailedError');
  });

  it('RollbackConflictError', () => {
    const err = new RollbackConflictError('回退冲突', 'Rollback conflict');
    expect(err.code).toBe('ROLLBACK_CONFLICT');
    expect(err.name).toBe('RollbackConflictError');
  });
});

describe('DnsServiceError instanceof 链', () => {
  it('所有子类都是 DnsServiceError 和 Error', () => {
    const errors = [
      new ValidationError('a', 'b'),
      new NotFoundError('a', 'b'),
      new ConflictError('a', 'b'),
      new CapabilityUnsupportedError('a', 'b'),
      new ProviderAuthError('a', 'b'),
      new ProviderRateLimitError('a', 'b'),
      new ProviderUnavailableError('a', 'b'),
      new RollbackFailedError('a', 'b'),
      new RollbackConflictError('a', 'b'),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(DnsServiceError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('normalizeError', () => {
  it('已是 DnsServiceError 原样返回', () => {
    const original = new ValidationError('a', 'b');
    const normalized = normalizeError(original);
    expect(normalized).toBe(original);
  });

  it('Error 包装为 INTERNAL_ERROR', () => {
    const normalized = normalizeError(new Error('boom'));
    expect(normalized.code).toBe('INTERNAL_ERROR');
    expect(normalized.messageEn).toBe('Internal server error');
    expect(normalized.messageCn).toBe('服务器内部错误');
    expect(normalized.details).toBe('boom');
    expect(normalized.cause).toBeInstanceOf(Error);
  });

  it('字符串包装为 INTERNAL_ERROR', () => {
    const normalized = normalizeError('something went wrong');
    expect(normalized.code).toBe('INTERNAL_ERROR');
    expect(normalized.details).toBe('something went wrong');
  });

  it('null 包装为 INTERNAL_ERROR', () => {
    const normalized = normalizeError(null);
    expect(normalized.code).toBe('INTERNAL_ERROR');
    expect(normalized.details).toBe('null');
  });
});
