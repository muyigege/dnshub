/**
 * OperationQueryService — 操作日志查询层
 *
 * 为 MCP 只读工具和 REST API 提供统一的操作日志查询接口。
 * 写入由 AuditLogger 负责，此处仅提供只读查询。
 */

import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { NotFoundError } from './errors';

export interface OperationListFilter {
  action?: string;
  status?: string;
  source?: string;
  providerId?: number;
  domainId?: number;
  batchId?: string;
  startTime?: string;
  endTime?: string;
}

export interface OperationListResult {
  data: ParsedOperationLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ParsedOperationLog {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  details: unknown;
  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  batchId: string | null;
  parentOperationId: number | null;
  source: string;
  actor: string | null;
  clientName: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  providerId: number | null;
  domainId: number | null;
  recordId: number | null;
  beforeSnapshot: unknown;
  requestedSnapshot: unknown;
  afterSnapshot: unknown;
  startedAt: string | null;
  completedAt: string | null;
  rollbackOf: number | null;
  rolledBackAt: string | null;
  errorCode: string | null;
}

function parseLogRow(row: typeof operationLogs.$inferSelect): ParsedOperationLog {
  let beforeSnapshot: unknown = null;
  let afterSnapshot: unknown = null;
  let requestedSnapshot: unknown = null;
  let details: unknown = null;
  try { if (row.beforeSnapshot) beforeSnapshot = JSON.parse(row.beforeSnapshot); } catch {}
  try { if (row.afterSnapshot) afterSnapshot = JSON.parse(row.afterSnapshot); } catch {}
  try { if (row.requestedSnapshot) requestedSnapshot = JSON.parse(row.requestedSnapshot); } catch {}
  try { if (row.details) details = JSON.parse(row.details); } catch {}

  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    details,
    status: row.status,
    errorMessage: row.errorMessage,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    batchId: row.batchId,
    parentOperationId: row.parentOperationId,
    source: row.source,
    actor: row.actor,
    clientName: row.clientName,
    requestId: row.requestId,
    idempotencyKey: row.idempotencyKey,
    providerId: row.providerId,
    domainId: row.domainId,
    recordId: row.recordId,
    beforeSnapshot,
    requestedSnapshot,
    afterSnapshot,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    rollbackOf: row.rollbackOf,
    rolledBackAt: row.rolledBackAt,
    errorCode: row.errorCode,
  };
}

/**
 * 分页查询操作日志
 */
export async function listOperations(
  filter: OperationListFilter = {},
  page = 1,
  pageSize = 20
): Promise<OperationListResult> {
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filter.action) conditions.push(eq(operationLogs.action, filter.action));
  if (filter.status) conditions.push(eq(operationLogs.status, filter.status));
  if (filter.source) conditions.push(eq(operationLogs.source, filter.source));
  if (filter.providerId !== undefined) conditions.push(eq(operationLogs.providerId, filter.providerId));
  if (filter.domainId !== undefined) conditions.push(eq(operationLogs.domainId, filter.domainId));
  if (filter.batchId) conditions.push(eq(operationLogs.batchId, filter.batchId));
  if (filter.startTime) conditions.push(gte(operationLogs.createdAt, filter.startTime));
  if (filter.endTime) conditions.push(lte(operationLogs.createdAt, filter.endTime));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(operationLogs)
      .where(where ?? sql`1=1`)
      .orderBy(desc(operationLogs.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(operationLogs)
      .where(where ?? sql`1=1`),
  ]);

  const total = totalRows[0]?.count ?? 0;

  return {
    data: rows.map(parseLogRow),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 获取单条操作详情
 */
export async function getOperation(operationId: number): Promise<ParsedOperationLog> {
  const rows = await db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.id, operationId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError(
      `操作 ${operationId} 不存在`,
      `Operation ${operationId} not found`
    );
  }

  return parseLogRow(rows[0]);
}

/**
 * 幂等检查：根据 idempotencyKey 查询已存在的成功操作。
 * 用于 MCP 写操作幂等：如果同 key 的成功操作已存在，返回其结果而非重复执行。
 */
export async function findOperationByIdempotencyKey(
  idempotencyKey: string,
  source = 'mcp'
): Promise<ParsedOperationLog | null> {
  const rows = await db
    .select()
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.idempotencyKey, idempotencyKey),
        eq(operationLogs.source, source),
        eq(operationLogs.status, 'success')
      )
    )
    .orderBy(desc(operationLogs.createdAt))
    .limit(1);

  if (rows.length === 0) return null;
  return parseLogRow(rows[0]);
}
