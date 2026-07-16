import { NextRequest, NextResponse } from 'next/server';
import {
  rollbackBatch,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * POST /api/operations/batch-rollback
 * 批量回退一个 batchId 下的所有操作（逆序）
 *
 * Body:
 * - batchId: string (必填)
 * - confirm: boolean (必填，必须为 true)
 * - force: boolean (可选)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, confirm = false, force = false } = body;

    if (!batchId) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '缺少 batchId',
        messageEn: 'Missing batchId',
      }, { status: 400 });
    }

    if (!confirm) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '批量回退必须显式确认（confirm=true）',
        messageEn: 'Batch rollback requires explicit confirmation (confirm=true)',
      }, { status: 400 });
    }

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `rb-batch-${Date.now()}`,
    };

    const result = await rollbackBatch(batchId, context, { force, confirm: true });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
