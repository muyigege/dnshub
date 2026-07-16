import { NextRequest, NextResponse } from 'next/server';
import {
  previewRollback,
  rollbackOperation,
  rollbackBatch,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * GET /api/operations/[id]/rollback?force=true
 * 预览回退计划（dryRun，不实际执行）
 */
export async function GET(
  request: NextRequest,
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

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const retentionDays = parseInt(searchParams.get('retentionDays') || '30');

    const plan = await previewRollback(operationId, { force, retentionDays });

    return NextResponse.json({
      success: true,
      data: {
        ...plan,
        requiresConfirmation: true,
        confirmRequired: true,
      },
    });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}

/**
 * POST /api/operations/[id]/rollback
 * 执行回退（必须显式传 confirm=true）
 *
 * Body:
 * - confirm: boolean (必填，必须为 true)
 * - force: boolean (可选，强制回退忽略并发冲突)
 */
export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({}));
    const { confirm = false, force = false } = body;

    if (!confirm) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '回退操作必须显式确认（confirm=true）。请先调用 GET 预览回退计划，确认后传 confirm=true 执行。',
        messageEn: 'Rollback requires explicit confirmation (confirm=true). Call GET to preview first, then pass confirm=true to execute.',
      }, { status: 400 });
    }

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `rb-${Date.now()}`,
    };

    const result = await rollbackOperation(operationId, context, { force, confirm: true });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
