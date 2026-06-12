import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsRecords, dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq, and } from 'drizzle-orm';
import { handleCloudError, successResponse } from '@/lib/api';

/**
 * POST /api/domains/[id]/records/sync
 * 同步域名的 DNS 记录
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  let provider: typeof dnsProviders.$inferSelect | undefined;

  try {
    const { id } = await params;
    const domainId = parseInt(id);

    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));

    if (!domain) {
      return NextResponse.json({ success: false, error: 'Domain not found' }, { status: 404 });
    }

    // 获取服务商信息
    const [foundProvider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!foundProvider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    provider = foundProvider;

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 获取 DNS 记录列表
    const recordsResult = await dnsProvider.listRecords(domain.name);

    if (!recordsResult.success || !recordsResult.data) {
      const errorPayload = handleCloudError(recordsResult.error, provider.type);
      return NextResponse.json(errorPayload, { status: 500 });
    }

    let syncedCount = 0;

    // 同步记录到数据库
    for (const record of recordsResult.data) {
      // 检查记录是否已存在
      const [existing] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, domainId),
            eq(dnsRecords.providerRecordId, record.id)
          )
        );

      if (existing) {
        // 更新
        await db
          .update(dnsRecords)
          .set({
            type: record.type,
            name: record.name,
            content: record.content,
            ttl: record.ttl,
            priority: record.priority,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(dnsRecords.id, existing.id));
      } else {
        // 创建
        await db.insert(dnsRecords).values({
          domainId,
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl,
          priority: record.priority,
          providerRecordId: record.id,
          isActive: true,
        });
        syncedCount++;
      }
    }

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'record',
      entityId: domainId,
      details: JSON.stringify({ synced: syncedCount, total: recordsResult.data.length }),
      status: 'success',
      createdBy: 'system',
    });

    return NextResponse.json({
      success: true,
      data: {
        synced: syncedCount,
        total: recordsResult.data.length,
      },
    });
  } catch (error) {
    console.error('Sync domain records error:', error);
    const errorPayload = handleCloudError(error, provider?.type);
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
