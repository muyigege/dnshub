/**
 * DnsRecordService — DNS 记录业务层
 *
 * 统一封装 DNS 记录的 CRUD，所有入口（Web UI / REST / AI / MCP）共用此层。
 *
 * 职责：
 * - 参数校验（类型、必填、格式）
 * - Provider 能力校验（记录类型是否支持、proxy 是否支持）
 * - 冲突检测（同名同类型记录）
 * - 操作前快照保存（用于补偿回退）
 * - Provider 调用（含超时和错误转换）
 * - 本地数据库同步
 * - 审计日志写入（统一格式 + 脱敏）
 * - 错误标准化（抛出 DnsServiceError）
 *
 * 关键修复（vs 旧代码）：
 * - POST /api/records 之前完全不写审计日志 → 现在统一写入
 * - ai-magic/execute 操作云端后不写本地 DB → 现在统一同步
 * - 审计日志 entityType/action/source 格式不统一 → 现在统一为 record/CREATE|UPDATE|DELETE/source
 */

import { db } from '@/lib/db/connection';
import { dnsRecords, domains } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  createProviderInstanceForDomain,
  createProviderInstanceForDomainName,
  createProviderInstance,
  getDomainEntity,
  getProviderCapability,
  getRecordEntity,
  resolveProviderType,
  type DomainEntity,
  type ProviderEntity,
} from './provider-service';
import {
  writeAuditLog,
  generateBatchId,
  type AuditContext,
  type OperationStatus,
} from './audit-logger';
import {
  DnsServiceError,
  ValidationError,
  NotFoundError,
  ConflictError,
  CapabilityUnsupportedError,
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
  normalizeError,
} from './errors';
import type { IDNSProvider, DNSRecordType, DNSRecordData } from '@/lib/providers/base';

// ============================================================
// 类型定义
// ============================================================

export interface CreateRecordInput {
  domainId: number;
  type: DNSRecordType | string;
  name: string;
  content: string;
  ttl?: number;
  priority?: number | null;
  proxied?: boolean;
}

export interface UpdateRecordInput {
  type?: DNSRecordType | string;
  name?: string;
  content?: string;
  ttl?: number;
  priority?: number | null;
  proxied?: boolean;
}

export interface RecordSnapshot {
  id: number;
  domainId: number;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority: number | null;
  providerRecordId: string | null;
  isActive: boolean;
  // Cloudflare 代理状态（仅 A/AAAA/CNAME 时有意义；其他服务商为 null）
  proxied: boolean | null;
  // 该记录是否可被代理（Provider 返回的只读能力字段）
  proxiable: boolean | null;
}

export interface CreateRecordResult {
  record: RecordSnapshot;
  operationId: number;
}

export interface UpdateRecordResult {
  record: RecordSnapshot;
  before: RecordSnapshot;
  operationId: number;
}

export interface DeleteRecordResult {
  before: RecordSnapshot;
  operationId: number;
}

export interface SetProxyResult {
  record: RecordSnapshot;
  before: RecordSnapshot;
  operationId: number;
}

export interface BatchMutationItem {
  action: 'create' | 'update' | 'delete';
  // create 用
  input?: CreateRecordInput;
  // update 用
  recordId?: number;
  changes?: UpdateRecordInput;
  // 用于跨域名批量（可选，update/delete 时若不提供则用 recordId 查 domain）
  domainId?: number;
}

export interface BatchMutationItemResult {
  action: 'create' | 'update' | 'delete';
  success: boolean;
  recordId?: number;
  operationId?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface BatchMutationResult {
  batchId: string;
  results: BatchMutationItemResult[];
  totalSuccess: number;
  totalFailed: number;
  status: OperationStatus;
}

// ============================================================
// 内部工具
// ============================================================

const SUPPORTED_RECORD_TYPES: Set<string> = new Set([
  'A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'SOA', 'CAA',
]);

/** proxied 仅对 Cloudflare 的 A/AAAA/CNAME 生效 */
const PROXIABLE_RECORD_TYPES: Set<string> = new Set(['A', 'AAAA', 'CNAME']);

function now(): string {
  return new Date().toISOString();
}

function toRecordSnapshot(row: typeof dnsRecords.$inferSelect): RecordSnapshot {
  return {
    id: row.id,
    domainId: row.domainId,
    type: row.type,
    name: row.name,
    content: row.content,
    ttl: row.ttl,
    priority: row.priority,
    providerRecordId: row.providerRecordId,
    isActive: row.isActive,
    proxied: row.proxied ?? null,
    proxiable: row.proxiable ?? null,
  };
}

function validateRecordType(type: string): asserts type is DNSRecordType {
  if (!SUPPORTED_RECORD_TYPES.has(type.toUpperCase())) {
    throw new ValidationError(
      `不支持的记录类型: ${type}`,
      `Unsupported record type: ${type}`
    );
  }
}

/**
 * 校验 proxied 是否对当前 provider 和记录类型有效。
 */
function validateProxied(
  proxied: boolean | undefined,
  providerEntity: ProviderEntity,
  recordType: string
): void {
  if (proxied === undefined) return;
  const capability = getProviderCapability(providerEntity.type);
  if (proxied && !capability.supportsProxy) {
    throw new CapabilityUnsupportedError(
      `服务商 ${providerEntity.name} 不支持代理状态（proxied）`,
      `Provider ${providerEntity.name} does not support proxied status`
    );
  }
  if (proxied && !PROXIABLE_RECORD_TYPES.has(recordType.toUpperCase())) {
    throw new CapabilityUnsupportedError(
      `记录类型 ${recordType} 不支持代理，仅 A/AAAA/CNAME 支持`,
      `Record type ${recordType} cannot be proxied, only A/AAAA/CNAME are supported`
    );
  }
}

/**
 * 将 Provider 调用结果转换为 DnsServiceError。
 * 复用 handleCloudError 的错误码映射逻辑。
 */
function providerErrorToServiceError(
  err: unknown,
  providerType?: string
): DnsServiceError {
  // 已经是 DnsServiceError
  if (err instanceof DnsServiceError) return err;

  const errStr = String(err instanceof Error ? err.message : err).toLowerCase();

  // 认证类
  if (errStr.includes('auth') || errStr.includes('unauthorized') || errStr.includes('forbidden') || errStr.includes('401') || errStr.includes('403')) {
    return new ProviderAuthError(
      '服务商认证失败，请检查凭证配置',
      'Provider authentication failed, please check credentials',
      err instanceof Error ? err.message : String(err)
    );
  }
  // 限流
  if (errStr.includes('rate') || errStr.includes('limit') || errStr.includes('throttle') || errStr.includes('429')) {
    return new ProviderRateLimitError(
      '请求过于频繁，已被服务商限流',
      'Rate limited by provider',
      err instanceof Error ? err.message : String(err)
    );
  }
  // 未找到
  if (errStr.includes('not found') || errStr.includes('notexist') || errStr.includes('does not exist') || errStr.includes('404')) {
    return new NotFoundError(
      '请求的资源不存在',
      'Requested resource not found',
      err instanceof Error ? err.message : String(err)
    );
  }
  // 冲突/重复
  if (errStr.includes('duplicate') || errStr.includes('conflict') || errStr.includes('already exist') || errStr.includes('409')) {
    return new ConflictError(
      '资源已存在或冲突',
      'Resource already exists or conflicts',
      err instanceof Error ? err.message : String(err)
    );
  }
  // 网络/超时
  if (errStr.includes('timeout') || errStr.includes('econnrefused') || errStr.includes('etimedout') || errStr.includes('enotfound')) {
    return new ProviderUnavailableError(
      '与服务商建立连接超时',
      'Connection to provider timed out',
      err instanceof Error ? err.message : String(err)
    );
  }

  return normalizeError(err);
}

/**
 * 调用 Provider 方法，统一错误转换。
 */
async function callProvider<T>(
  fn: () => Promise<{ success: boolean; data?: T; error?: any }>,
  providerType?: string
): Promise<T> {
  let result: { success: boolean; data?: T; error?: any };
  try {
    result = await fn();
  } catch (err) {
    throw providerErrorToServiceError(err, providerType);
  }

  if (!result.success) {
    throw providerErrorToServiceError(result.error, providerType);
  }

  if (result.data === undefined || result.data === null) {
    throw providerErrorToServiceError(new Error('Provider returned empty data'), providerType);
  }

  return result.data;
}

// ============================================================
// 公共 API：CRUD
// ============================================================

/**
 * 列出指定域名的所有 DNS 记录
 */
export async function listRecords(domainId: number): Promise<RecordSnapshot[]> {
  const rows = await db
    .select()
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));
  return rows.map(toRecordSnapshot);
}

/**
 * 获取单条记录
 */
export async function getRecord(recordId: number): Promise<RecordSnapshot> {
  const row = await getRecordEntity(recordId);
  return toRecordSnapshot(row);
}

/**
 * 创建 DNS 记录。
 *
 * 流程：
 * 1. 参数校验
 * 2. 加载 domain + provider 实例
 * 3. 能力校验（记录类型、proxied）
 * 4. 冲突检测（同名同类型）
 * 5. 调用 Provider API
 * 6. 写入本地 DB
 * 7. 写入审计日志（before=null, after=record）
 */
export async function createRecord(
  input: CreateRecordInput,
  context: AuditContext
): Promise<CreateRecordResult> {
  const startedAt = now();

  // 1. 参数校验
  if (!input.domainId) {
    throw new ValidationError('缺少 domainId', 'Missing domainId');
  }
  if (!input.type) {
    throw new ValidationError('缺少记录类型', 'Missing record type');
  }
  if (!input.name) {
    throw new ValidationError('缺少记录名称', 'Missing record name');
  }
  if (!input.content) {
    throw new ValidationError('缺少记录内容', 'Missing record content');
  }
  validateRecordType(input.type);

  // 2. 加载 domain + provider
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(input.domainId);

  // 3. 能力校验
  validateProxied(input.proxied, providerEntity, input.type);

  // 4. 冲突检测（同名同类型）
  const existing = await db
    .select({ id: dnsRecords.id })
    .from(dnsRecords)
    .where(
      and(
        eq(dnsRecords.domainId, input.domainId),
        eq(dnsRecords.type, input.type.toUpperCase()),
        eq(dnsRecords.name, input.name),
        eq(dnsRecords.isActive, true)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new ConflictError(
      `域名 ${domain.name} 下已存在 ${input.type} 记录 ${input.name}`,
      `Record ${input.name} (${input.type}) already exists under ${domain.name}`,
      `existing record id: ${existing[0].id}`
    );
  }

  // 5. 调用 Provider API
  const providerRecord = await callProvider(
    () => provider.addRecord(domain.name, {
      type: input.type as DNSRecordType,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 600,
      priority: input.priority ?? undefined,
      proxied: input.proxied,
    }),
    providerEntity.type
  );

  // 6. 写入本地 DB
  const [inserted] = await db
    .insert(dnsRecords)
    .values({
      domainId: input.domainId,
      type: input.type.toUpperCase(),
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 600,
      priority: input.priority ?? null,
      providerRecordId: providerRecord.id,
      isActive: true,
      // Cloudflare proxied 能力模型
      proxied: providerRecord.proxied ?? input.proxied ?? null,
      proxiable: providerRecord.proxiable ?? null,
    })
    .returning();

  const record = toRecordSnapshot(inserted);
  const completedAt = now();

  // 7. 审计日志
  const operationId = await writeAuditLog({
    action: 'CREATE',
    entityType: 'record',
    entityId: record.id,
    status: 'success',
    details: {
      domain: domain.name,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority,
      providerRecordId: providerRecord.id,
      proxied: record.proxied,
      proxiable: record.proxiable,
    },
    providerId: providerEntity.id,
    domainId: domain.id,
    recordId: record.id,
    requestedSnapshot: {
      type: input.type,
      name: input.name,
      content: input.content,
      ttl: input.ttl ?? 600,
      priority: input.priority,
      proxied: input.proxied,
    },
    afterSnapshot: record as unknown as Record<string, unknown>,
    startedAt,
    completedAt,
    context,
  });

  return { record, operationId: operationId ?? 0 };
}

/**
 * 更新 DNS 记录。
 *
 * 流程：
 * 1. 加载已有记录（before 快照）
 * 2. 加载 domain + provider 实例
 * 3. 能力校验
 * 4. 调用 Provider API
 * 5. 更新本地 DB
 * 6. 写入审计日志（before + after）
 */
export async function updateRecord(
  recordId: number,
  changes: UpdateRecordInput,
  context: AuditContext
): Promise<UpdateRecordResult> {
  const startedAt = now();

  // 1. 加载已有记录
  const existingRow = await getRecordEntity(recordId);
  const before = toRecordSnapshot(existingRow);

  // 2. 加载 domain + provider
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(before.domainId);

  // 3. 能力校验
  const newType = changes.type ?? before.type;
  validateRecordType(newType);
  validateProxied(changes.proxied, providerEntity, newType);

  // 构建更新数据
  const updateData: Record<string, unknown> = {};
  if (changes.type !== undefined) updateData.type = changes.type.toUpperCase();
  if (changes.name !== undefined) updateData.name = changes.name;
  if (changes.content !== undefined) updateData.content = changes.content;
  if (changes.ttl !== undefined) updateData.ttl = changes.ttl;
  if (changes.priority !== undefined) updateData.priority = changes.priority;
  if (changes.proxied !== undefined) updateData.proxied = changes.proxied;

  // 4. 调用 Provider API
  if (!before.providerRecordId) {
    throw new NotFoundError(
      `记录 ${recordId} 缺少 providerRecordId，无法更新云端记录`,
      `Record ${recordId} has no providerRecordId, cannot update remote record`
    );
  }

  const providerRecord = await callProvider(
    () => provider.updateRecord(domain.name, before.providerRecordId!, {
      type: changes.type as DNSRecordType | undefined,
      name: changes.name,
      content: changes.content,
      ttl: changes.ttl,
      priority: changes.priority ?? undefined,
      proxied: changes.proxied,
    }),
    providerEntity.type
  );

  // Provider 返回的 proxiable/proxied 为权威值，覆盖本地
  if (providerRecord.proxiable !== undefined) updateData.proxiable = providerRecord.proxiable;
  if (providerRecord.proxied !== undefined) updateData.proxied = providerRecord.proxied;

  // 5. 更新本地 DB
  const [updated] = await db
    .update(dnsRecords)
    .set({
      ...updateData,
      updatedAt: now(),
    })
    .where(eq(dnsRecords.id, recordId))
    .returning();

  const after = toRecordSnapshot(updated);
  const completedAt = now();

  // 6. 审计日志
  const operationId = await writeAuditLog({
    action: 'UPDATE',
    entityType: 'record',
    entityId: recordId,
    status: 'success',
    details: {
      domain: domain.name,
      before: {
        type: before.type,
        name: before.name,
        content: before.content,
        ttl: before.ttl,
        priority: before.priority,
        proxied: before.proxied,
        proxiable: before.proxiable,
      },
      after: {
        type: after.type,
        name: after.name,
        content: after.content,
        ttl: after.ttl,
        priority: after.priority,
        proxied: after.proxied,
        proxiable: after.proxiable,
      },
    },
    providerId: providerEntity.id,
    domainId: domain.id,
    recordId: recordId,
    beforeSnapshot: before as unknown as Record<string, unknown>,
    requestedSnapshot: changes as unknown as Record<string, unknown>,
    afterSnapshot: after as unknown as Record<string, unknown>,
    startedAt,
    completedAt,
    context,
  });

  return { record: after, before, operationId: operationId ?? 0 };
}

/**
 * 删除 DNS 记录。
 *
 * 流程：
 * 1. 加载已有记录（before 快照，用于补偿重建）
 * 2. 加载 domain + provider 实例
 * 3. 调用 Provider API
 * 4. 删除本地 DB 记录
 * 5. 写入审计日志（before）
 */
export async function deleteRecord(
  recordId: number,
  context: AuditContext
): Promise<DeleteRecordResult> {
  const startedAt = now();

  // 1. 加载已有记录
  const existingRow = await getRecordEntity(recordId);
  const before = toRecordSnapshot(existingRow);

  // 2. 加载 domain + provider
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(before.domainId);

  // 3. 调用 Provider API
  if (!before.providerRecordId) {
    throw new NotFoundError(
      `记录 ${recordId} 缺少 providerRecordId，无法删除云端记录`,
      `Record ${recordId} has no providerRecordId, cannot delete remote record`
    );
  }

  await callProvider(
    () => provider.deleteRecord(domain.name, before.providerRecordId!),
    providerEntity.type
  );

  // 4. 删除本地 DB 记录
  await db.delete(dnsRecords).where(eq(dnsRecords.id, recordId));

  const completedAt = now();

  // 5. 审计日志
  const operationId = await writeAuditLog({
    action: 'DELETE',
    entityType: 'record',
    entityId: recordId,
    status: 'success',
    details: {
      domain: domain.name,
      type: before.type,
      name: before.name,
      content: before.content,
      ttl: before.ttl,
      priority: before.priority,
      providerRecordId: before.providerRecordId,
      proxied: before.proxied,
      proxiable: before.proxiable,
    },
    providerId: providerEntity.id,
    domainId: domain.id,
    recordId: recordId,
    beforeSnapshot: before as unknown as Record<string, unknown>,
    startedAt,
    completedAt,
    context,
  });

  return { before, operationId: operationId ?? 0 };
}

// ============================================================
// Cloudflare 代理状态切换
// ============================================================

/**
 * 切换 Cloudflare 记录的代理状态（proxied）。
 *
 * 这是 updateRecord 的特化版本，专用于只切换 proxied 的场景：
 * - 校验 provider 是否支持 proxy
 * - 校验记录类型是否可被代理（A/AAAA/CNAME）
 * - 调用 Provider API（仅传 proxied）
 * - 同步本地 DB
 * - 写入审计日志（action=UPDATE，details 标记 proxyOnly=true）
 *
 * 对于不支持代理的 provider，抛出 CapabilityUnsupportedError。
 */
export async function setProxy(
  recordId: number,
  proxied: boolean,
  context: AuditContext
): Promise<SetProxyResult> {
  const startedAt = now();

  // 1. 加载已有记录
  const existingRow = await getRecordEntity(recordId);
  const before = toRecordSnapshot(existingRow);

  // 2. 加载 domain + provider
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(before.domainId);

  // 3. 能力校验
  const capability = getProviderCapability(providerEntity.type);
  if (!capability.supportsProxy) {
    throw new CapabilityUnsupportedError(
      `服务商 ${providerEntity.name} 不支持代理状态（proxied）`,
      `Provider ${providerEntity.name} does not support proxied status`
    );
  }
  if (!PROXIABLE_RECORD_TYPES.has(before.type.toUpperCase())) {
    throw new CapabilityUnsupportedError(
      `记录类型 ${before.type} 不支持代理，仅 A/AAAA/CNAME 支持`,
      `Record type ${before.type} cannot be proxied, only A/AAAA/CNAME are supported`
    );
  }

  // 4. 调用 Provider API（仅切换 proxied）
  if (!before.providerRecordId) {
    throw new NotFoundError(
      `记录 ${recordId} 缺少 providerRecordId，无法更新云端记录`,
      `Record ${recordId} has no providerRecordId, cannot update remote record`
    );
  }

  const providerRecord = await callProvider(
    () => provider.updateRecord(domain.name, before.providerRecordId!, {
      proxied,
    }),
    providerEntity.type
  );

  // 5. 更新本地 DB
  const updateData: Record<string, unknown> = {
    proxied: providerRecord.proxied ?? proxied,
  };
  if (providerRecord.proxiable !== undefined) updateData.proxiable = providerRecord.proxiable;

  const [updated] = await db
    .update(dnsRecords)
    .set({
      ...updateData,
      updatedAt: now(),
    })
    .where(eq(dnsRecords.id, recordId))
    .returning();

  const after = toRecordSnapshot(updated);
  const completedAt = now();

  // 6. 审计日志
  const operationId = await writeAuditLog({
    action: 'UPDATE',
    entityType: 'record',
    entityId: recordId,
    status: 'success',
    details: {
      domain: domain.name,
      proxyOnly: true,
      before: {
        type: before.type,
        name: before.name,
        content: before.content,
        proxied: before.proxied,
        proxiable: before.proxiable,
      },
      after: {
        type: after.type,
        name: after.name,
        content: after.content,
        proxied: after.proxied,
        proxiable: after.proxiable,
      },
    },
    providerId: providerEntity.id,
    domainId: domain.id,
    recordId: recordId,
    beforeSnapshot: before as unknown as Record<string, unknown>,
    requestedSnapshot: { proxied },
    afterSnapshot: after as unknown as Record<string, unknown>,
    startedAt,
    completedAt,
    context,
  });

  return { record: after, before, operationId: operationId ?? 0 };
}

// ============================================================
// 批量操作
// ============================================================

/**
 * 批量变更记录。
 *
 * 每个子操作独立执行，失败不影响其他操作（不使用事务，因为 DNS 服务商不支持跨请求事务）。
 * 所有子操作共享一个 batchId，便于关联查询。
 *
 * 失败的子操作会记录到审计日志，状态为 failed。
 */
export async function batchMutateRecords(
  items: BatchMutationItem[],
  context: AuditContext
): Promise<BatchMutationResult> {
  const batchId = context.batchId ?? generateBatchId();
  const batchContext: AuditContext = { ...context, batchId };

  const results: BatchMutationItemResult[] = [];
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const item of items) {
    try {
      if (item.action === 'create') {
        if (!item.input) throw new ValidationError('批量 create 项缺少 input', 'Batch create item missing input');
        const { record, operationId } = await createRecord(item.input, batchContext);
        results.push({
          action: 'create',
          success: true,
          recordId: record.id,
          operationId,
        });
        totalSuccess++;
      } else if (item.action === 'update') {
        if (!item.recordId || !item.changes) {
          throw new ValidationError('批量 update 项缺少 recordId 或 changes', 'Batch update item missing recordId or changes');
        }
        const { record, operationId } = await updateRecord(item.recordId, item.changes, batchContext);
        results.push({
          action: 'update',
          success: true,
          recordId: record.id,
          operationId,
        });
        totalSuccess++;
      } else if (item.action === 'delete') {
        if (!item.recordId) {
          throw new ValidationError('批量 delete 项缺少 recordId', 'Batch delete item missing recordId');
        }
        const { operationId } = await deleteRecord(item.recordId, batchContext);
        results.push({
          action: 'delete',
          success: true,
          recordId: item.recordId,
          operationId,
        });
        totalSuccess++;
      } else {
        throw new ValidationError(`未知的批量操作类型: ${item.action}`, `Unknown batch action: ${item.action}`);
      }
    } catch (err) {
      const serviceErr = normalizeError(err);
      // 失败也写审计日志
      const entityId = item.recordId ?? 0;
      await writeAuditLog({
        action: item.action === 'create' ? 'CREATE' : item.action === 'update' ? 'UPDATE' : 'DELETE',
        entityType: 'record',
        entityId,
        status: 'failed',
        details: {
          domainId: item.input?.domainId ?? item.domainId,
          input: item.input,
          changes: item.changes,
        },
        errorMessage: serviceErr.messageEn,
        errorCode: serviceErr.code,
        context: batchContext,
      });
      results.push({
        action: item.action,
        success: false,
        recordId: item.recordId,
        error: {
          code: serviceErr.code,
          message: serviceErr.messageEn,
        },
      });
      totalFailed++;
    }
  }

  const status: OperationStatus = totalFailed === 0 ? 'success' : totalSuccess === 0 ? 'failed' : 'partial';

  return {
    batchId,
    results,
    totalSuccess,
    totalFailed,
    status,
  };
}

// ============================================================
// 同步（从服务商拉取最新记录）
// ============================================================

/**
 * 同步指定域名的 DNS 记录（从服务商拉取最新数据）。
 *
 * 沿用 dns-record-sync.ts 的匹配逻辑，但统一通过 Service 层调用。
 */
export async function syncRecords(
  domainId: number,
  context: AuditContext
): Promise<{ synced: number; updated: number; created: number; total: number }> {
  const startedAt = now();
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(domainId);

  const remoteRecords = await callProvider(
    () => provider.listRecords(domain.name),
    providerEntity.type
  );

  const localRows = await db
    .select()
    .from(dnsRecords)
    .where(eq(dnsRecords.domainId, domainId));

  let created = 0;
  let updated = 0;

  for (const remote of remoteRecords) {
    // 按 providerRecordId 优先匹配，兜底用 (type, name, content)
    let local = localRows.find(r => r.providerRecordId === remote.id);
    if (!local) {
      local = localRows.find(r =>
        r.type === remote.type &&
        r.name === remote.name &&
        r.content === remote.content
      );
    }

    if (local) {
      // 更新
      await db
        .update(dnsRecords)
        .set({
          type: remote.type,
          name: remote.name,
          content: remote.content,
          ttl: remote.ttl ?? local.ttl,
          priority: remote.priority ?? null,
          providerRecordId: remote.id,
          // Cloudflare proxied/proxiable 同步
          proxied: remote.proxied ?? null,
          proxiable: remote.proxiable ?? null,
          updatedAt: now(),
        })
        .where(eq(dnsRecords.id, local.id));
      updated++;
    } else {
      // 新增
      await db.insert(dnsRecords).values({
        domainId,
        type: remote.type,
        name: remote.name,
        content: remote.content,
        ttl: remote.ttl ?? 600,
        priority: remote.priority ?? null,
        providerRecordId: remote.id,
        isActive: true,
        // Cloudflare proxied/proxiable 同步
        proxied: remote.proxied ?? null,
        proxiable: remote.proxiable ?? null,
      });
      created++;
    }
  }

  // 更新域名同步时间
  await db
    .update(domains)
    .set({ lastSyncedAt: now(), updatedAt: now() })
    .where(eq(domains.id, domainId));

  const completedAt = now();

  await writeAuditLog({
    action: 'SYNC',
    entityType: 'domain',
    entityId: domainId,
    status: 'success',
    details: {
      domain: domain.name,
      total: remoteRecords.length,
      created,
      updated,
    },
    providerId: providerEntity.id,
    domainId,
    startedAt,
    completedAt,
    context,
  });

  return {
    synced: remoteRecords.length,
    updated,
    created,
    total: remoteRecords.length,
  };
}
