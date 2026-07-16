import { NextRequest, NextResponse } from 'next/server';
import {
  updateRecord,
  deleteRecord,
  getRecord,
  DnsServiceError,
  normalizeError,
  type AuditContext,
} from '@/lib/services';

/**
 * GET /api/records/[id]
 * 获取单条 DNS 记录
 */
export async function GET(
  _request: NextRequest,
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

    const record = await getRecord(recordId);
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}

/**
 * PUT /api/records/[id]
 * 更新 DNS 记录
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);
    const body = await request.json();
    const { type, name, content, ttl, priority, proxied } = body;

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
    };

    const result = await updateRecord(
      recordId,
      { type, name, content, ttl, priority, proxied },
      context
    );

    return NextResponse.json({ success: true, data: result.record });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}

/**
 * DELETE /api/records/[id]
 * 删除 DNS 记录
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id);

    const context: AuditContext = {
      source: 'rest',
      requestId: crypto.randomUUID?.() ?? `req-${Date.now()}`,
    };

    await deleteRecord(recordId, context);

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
