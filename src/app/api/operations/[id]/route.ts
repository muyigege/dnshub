import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import {
  DnsServiceError,
  normalizeError,
} from '@/lib/services';

/**
 * GET /api/operations/[id]
 * 获取单条操作详情（含 before/after 快照、回退状态）
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const operationId = parseInt(id);
    if (!operationId) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '操作 ID 无效',
        messageEn: 'Invalid operation id',
      }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.id, operationId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        code: 'NOT_FOUND',
        messageCn: `操作 ${operationId} 不存在`,
        messageEn: `Operation ${operationId} not found`,
      }, { status: 404 });
    }

    const row = rows[0];
    let beforeSnapshot: unknown = null;
    let afterSnapshot: unknown = null;
    let requestedSnapshot: unknown = null;
    let details: unknown = null;

    try { if (row.beforeSnapshot) beforeSnapshot = JSON.parse(row.beforeSnapshot); } catch {}
    try { if (row.afterSnapshot) afterSnapshot = JSON.parse(row.afterSnapshot); } catch {}
    try { if (row.requestedSnapshot) requestedSnapshot = JSON.parse(row.requestedSnapshot); } catch {}
    try { if (row.details) details = JSON.parse(row.details); } catch {}

    return NextResponse.json({
      success: true,
      data: {
        ...row,
        beforeSnapshot,
        afterSnapshot,
        requestedSnapshot,
        details,
      },
    });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
