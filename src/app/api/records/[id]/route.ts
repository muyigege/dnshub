import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsRecords, dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';

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
    const { type, name, content, ttl, priority } = body;

    // 获取记录信息
    const [existingRecord] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, recordId));

    if (!existingRecord) {
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
    }

    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, existingRecord.domainId));

    if (!domain) {
      return NextResponse.json({ success: false, error: 'Domain not found' }, { status: 404 });
    }

    // 获取服务商信息
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 准备更新数据
    const updateData: any = {};
    if (type) updateData.type = type;
    if (name) updateData.name = name;
    if (content) updateData.content = content;
    if (ttl) updateData.ttl = ttl;
    if (priority !== undefined) updateData.priority = priority;

    // 调用 Provider API 更新记录
    const result = await dnsProvider.updateRecord(
      domain.name,
      existingRecord.providerRecordId!,
      updateData
    );

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update record' },
        { status: 500 }
      );
    }

    // 更新数据库
    const [updated] = await db
      .update(dnsRecords)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(dnsRecords.id, recordId))
      .returning();

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'UPDATE',
      entityType: 'record',
      entityId: recordId,
      details: JSON.stringify({
        domain: domain.name,
        updateData,
      }),
      status: 'success',
      createdBy: 'system',
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update record error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update record' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/records/[id]
 * 删除 DNS 记录
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const { id } = await params;
    const recordId = parseInt(id);

    // 获取记录信息
    const [existingRecord] = await db.select().from(dnsRecords).where(eq(dnsRecords.id, recordId));

    if (!existingRecord) {
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
    }

    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, existingRecord.domainId));

    if (!domain) {
      return NextResponse.json({ success: false, error: 'Domain not found' }, { status: 404 });
    }

    // 获取服务商信息
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 调用 Provider API 删除记录
    const result = await dnsProvider.deleteRecord(domain.name, existingRecord.providerRecordId!);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to delete record' },
        { status: 500 }
      );
    }

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'DELETE',
      entityType: 'record',
      entityId: recordId,
      details: JSON.stringify({
        domain: domain.name,
        type: existingRecord.type,
        name: existingRecord.name,
        content: existingRecord.content,
      }),
      status: 'success',
      createdBy: 'system',
    });

    // 删除数据库记录
    await db.delete(dnsRecords).where(eq(dnsRecords.id, recordId));

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Delete record error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete record' },
      { status: 500 }
    );
  }
}
