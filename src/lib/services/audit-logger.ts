/**
 * 统一审计日志写入器
 *
 * 职责：
 * - 统一 operationLogs 写入格式（消除 15+ 处手写 db.insert）
 * - 敏感数据脱敏（凭证、API Key、Authorization Header 不得写入）
 * - 支持批量操作和子操作关联
 * - 写入失败不能被静默忽略（记录到 stderr）
 *
 * 所有入口（Web UI / REST / AI / MCP）都必须通过此写入器记录审计日志。
 */

import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export type OperationSource = 'ui' | 'rest' | 'ai' | 'mcp' | 'system';

export type OperationAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'QUERY'
  | 'SYNC'
  | 'TEST_CONNECTION'
  | 'ROLLBACK'
  | 'BATCH';

export type OperationStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'partial'
  | 'rolled_back'
  | 'rollback_failed';

export interface AuditContext {
  source: OperationSource;
  actor?: string;
  clientName?: string;
  requestId?: string;
  idempotencyKey?: string;
  batchId?: string;
  parentOperationId?: number;
}

export interface AuditWriteParams {
  action: OperationAction | string;
  entityType: string;
  entityId: number;
  status: OperationStatus;
  details: Record<string, unknown>;
  errorMessage?: string;
  errorCode?: string;
  providerId?: number;
  domainId?: number;
  recordId?: number;
  beforeSnapshot?: Record<string, unknown>;
  requestedSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  rollbackOf?: number;
  context: AuditContext;
}

/**
 * 敏感字段黑名单——这些字段不得写入任何日志字段。
 */
const SENSITIVE_KEYS = new Set([
  'apiKey',
  'apiToken',
  'apiSecret',
  'secretApiKey',
  'accessKeyId',
  'accessKeySecret',
  'secretAccessKey',
  'secretId',
  'secretKey',
  'privateKey',
  'password',
  'authorization',
  'Authorization',
  'token',
  'credentials',
  'api_key',
  'access_key_id',
  'access_key_secret',
  'secret_access_key',
]);

/**
 * 递归脱敏：返回一个不含敏感字段的浅拷贝。
 * 对于敏感 key，值替换为 '[REDACTED]'。
 */
export function redactSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSensitive(obj[key]);
    }
  }
  return out;
}

/**
 * 生成 batchId（UUID v4 风格，无需外部依赖）
 */
export function generateBatchId(): string {
  // crypto.randomUUID 在 Node 19+ 可用，降级方案用 Math.random
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * 写入一条审计日志。
 *
 * 重要约束：
 * - details / beforeSnapshot / afterSnapshot 在写入前会被脱敏
 * - 写入失败会记录到 stderr，但不抛出错误（避免影响主流程）
 *   但调用方如果需要严格审计，可以通过 strictWrite=true 要求失败时抛错
 */
export async function writeAuditLog(params: AuditWriteParams, strictWrite = false): Promise<number | null> {
  const { context, details, beforeSnapshot, requestedSnapshot, afterSnapshot, ...rest } = params;

  // 脱敏后序列化
  const safeDetails = JSON.stringify(redactSensitive(details));
  const safeBefore = beforeSnapshot ? JSON.stringify(redactSensitive(beforeSnapshot)) : null;
  const safeRequested = requestedSnapshot ? JSON.stringify(redactSensitive(requestedSnapshot)) : null;
  const safeAfter = afterSnapshot ? JSON.stringify(redactSensitive(afterSnapshot)) : null;

  try {
    const [inserted] = await db
      .insert(operationLogs)
      .values({
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: safeDetails,
        status: params.status,
        errorMessage: params.errorMessage,
        errorCode: params.errorCode,
        createdBy: context.source,
        batchId: context.batchId,
        parentOperationId: context.parentOperationId,
        source: context.source,
        actor: context.actor,
        clientName: context.clientName,
        requestId: context.requestId,
        idempotencyKey: context.idempotencyKey,
        providerId: params.providerId,
        domainId: params.domainId,
        recordId: params.recordId,
        beforeSnapshot: safeBefore,
        requestedSnapshot: safeRequested,
        afterSnapshot: safeAfter,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
        rollbackOf: params.rollbackOf,
      })
      .returning({ id: operationLogs.id });

    return inserted?.id ?? null;
  } catch (err) {
    // 审计日志写入失败不能被静默忽略
    console.error('[AuditLogger] Failed to write audit log:', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      source: context.source,
      error: err instanceof Error ? err.message : String(err),
    });
    if (strictWrite) {
      throw err;
    }
    return null;
  }
}

/**
 * 更新已有审计日志的状态（用于 pending → running → success/failed 流程）
 */
export async function updateAuditLogStatus(
  logId: number,
  update: {
    status: OperationStatus;
    errorMessage?: string;
    errorCode?: string;
    afterSnapshot?: Record<string, unknown>;
    completedAt?: string;
  }
): Promise<void> {
  const setValues: Record<string, unknown> = {
    status: update.status,
  };
  if (update.errorMessage !== undefined) setValues.errorMessage = update.errorMessage;
  if (update.errorCode !== undefined) setValues.errorCode = update.errorCode;
  if (update.afterSnapshot !== undefined) {
    setValues.afterSnapshot = JSON.stringify(redactSensitive(update.afterSnapshot));
  }
  if (update.completedAt !== undefined) setValues.completedAt = update.completedAt;

  try {
    await db
      .update(operationLogs)
      .set(setValues)
      .where(sql`${operationLogs.id} = ${logId}`);
  } catch (err) {
    console.error(`[AuditLogger] Failed to update audit log ${logId}:`, err);
  }
}

/**
 * 标记一条操作为已回退
 */
export async function markRolledBack(logId: number, rolledBackAt: string): Promise<void> {
  try {
    await db
      .update(operationLogs)
      .set({
        status: 'rolled_back',
        rolledBackAt,
      })
      .where(sql`${operationLogs.id} = ${logId}`);
  } catch (err) {
    console.error(`[AuditLogger] Failed to mark log ${logId} as rolled_back:`, err);
  }
}
