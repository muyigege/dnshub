import { NextRequest, NextResponse } from 'next/server';
import {
  setProxy,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * POST /api/records/[id]/proxy
 * 切换 Cloudflare 记录的代理状态（proxied）。
 *
 * 请求体：
 *   { "proxied": true | false }
 *
 * 仅对支持代理的 Provider（Cloudflare）和可代理的记录类型（A/AAAA/CNAME）生效。
 * 其他情况抛出 CapabilityUnsupportedError（HTTP 400）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);
    if (!recordId) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '记录 ID 无效',
        messageEn: 'Invalid record id',
      }, { status: 400 });
    }

    const body = await request.json();
    const { proxied } = body;

    if (typeof proxied !== 'boolean') {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '缺少 proxied 字段或类型不是 boolean',
        messageEn: 'proxied field is required and must be boolean',
      }, { status: 400 });
    }

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
    };

    const result = await setProxy(recordId, proxied, context);

    return NextResponse.json({
      success: true,
      data: result.record,
      message: proxied
        ? '已开启 Cloudflare 代理'
        : '已关闭 Cloudflare 代理',
    });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
