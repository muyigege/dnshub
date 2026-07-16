import { NextRequest, NextResponse } from 'next/server';
import {
  createRecord,
  listRecords,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * GET /api/records?domainId=xxx
 * 获取指定域名的所有 DNS 记录
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = parseInt(searchParams.get('domainId') || '');

    if (!domainId) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '缺少 domainId 参数',
        messageEn: 'Missing domainId parameter',
      }, { status: 400 });
    }

    const records = await listRecords(domainId);
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}

/**
 * POST /api/records
 * 创建 DNS 记录
 *
 * 已修复（vs 旧代码）：旧 POST 完全不写审计日志，现在通过 Service 层统一写入。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domainId, type, name, content, ttl, priority, proxied } = body;

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
    };

    const result = await createRecord(
      { domainId, type, name, content, ttl, priority, proxied },
      context
    );

    return NextResponse.json({ success: true, data: result.record }, { status: 201 });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
