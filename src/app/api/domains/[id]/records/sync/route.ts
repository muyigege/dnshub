import { NextRequest, NextResponse } from 'next/server';
import {
  syncRecords,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * POST /api/domains/[id]/records/sync
 * 同步指定域名的 DNS 记录（从服务商拉取最新数据）
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const domainId = Number.parseInt(id, 10);

    if (Number.isNaN(domainId)) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '域名 ID 无效',
        messageEn: 'Invalid domain id',
      }, { status: 400 });
    }

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
    };

    const summary = await syncRecords(domainId, context);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
