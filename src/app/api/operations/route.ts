import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { eq, and, desc, sql, gte, lte, like } from 'drizzle-orm';
import {
  DnsServiceError,
  normalizeError,
} from '@/lib/services';

/**
 * GET /api/operations
 * 查询操作日志列表（分页 + 筛选）
 *
 * 查询参数：
 * - page: 页码（默认 1）
 * - pageSize: 每页条数（默认 20，最大 100）
 * - action: 按操作类型筛选（CREATE/UPDATE/DELETE/SYNC/ROLLBACK）
 * - status: 按状态筛选（success/failed/partial/rolled_back/rollback_failed）
 * - source: 按来源筛选（ui/rest/ai/mcp/system）
 * - providerId: 按服务商筛选
 * - domainId: 按域名筛选
 * - batchId: 按批次筛选
 * - startTime: 起始时间（ISO）
 * - endTime: 结束时间（ISO）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (searchParams.get('action')) conditions.push(eq(operationLogs.action, searchParams.get('action')!));
    if (searchParams.get('status')) conditions.push(eq(operationLogs.status, searchParams.get('status')!));
    if (searchParams.get('source')) conditions.push(eq(operationLogs.source, searchParams.get('source')!));
    if (searchParams.get('providerId')) conditions.push(eq(operationLogs.providerId, parseInt(searchParams.get('providerId')!)));
    if (searchParams.get('domainId')) conditions.push(eq(operationLogs.domainId, parseInt(searchParams.get('domainId')!)));
    if (searchParams.get('batchId')) conditions.push(eq(operationLogs.batchId, searchParams.get('batchId')!));
    if (searchParams.get('startTime')) conditions.push(gte(operationLogs.createdAt, searchParams.get('startTime')!));
    if (searchParams.get('endTime')) conditions.push(lte(operationLogs.createdAt, searchParams.get('endTime')!));

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

    // 解析 JSON 字段
    const data = rows.map(row => {
      let beforeSnapshot: unknown = null;
      let afterSnapshot: unknown = null;
      let details: unknown = null;
      try { if (row.beforeSnapshot) beforeSnapshot = JSON.parse(row.beforeSnapshot); } catch {}
      try { if (row.afterSnapshot) afterSnapshot = JSON.parse(row.afterSnapshot); } catch {}
      try { if (row.details) details = JSON.parse(row.details); } catch {}
      return { ...row, beforeSnapshot, afterSnapshot, details };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
