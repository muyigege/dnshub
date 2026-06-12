import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { handleCloudError, successResponse, validateRequired } from '@/lib/api';

/**
 * POST /api/domains/sync - 从指定服务商同步域名
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId } = body;

    // 验证必填字段
    const validationError = validateRequired({ providerId }, ['providerId']);
    if (validationError) {
      return NextResponse.json(validationError, { status: 400 });
    }

    // 获取服务商信息
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return NextResponse.json({
        success: false,
        code: 'NOT_FOUND',
        messageCn: '服务商不存在',
        messageEn: 'Provider not found',
      }, { status: 404 });
    }

    // 解密凭证
    const credentials = decryptJSON<Record<string, string>>(provider.credentials);

    // 创建 Provider 实例
    const providerTypeEnum = provider.type.toUpperCase() as keyof typeof ProviderType;
    const dnsProvider = DNSProviderFactory.create(ProviderType[providerTypeEnum], credentials);

    // 获取域名列表
    const domainsResult = await dnsProvider.listDomains();

    if (!domainsResult.success || !domainsResult.data) {
      // 使用错误拦截器处理云服务商返回的错误
      return NextResponse.json(handleCloudError(domainsResult.error, provider.type), { status: 500 });
    }

    const remoteDomains = domainsResult.data;
    let synced = 0;
    let updated = 0;

    // 遍历远程域名，更新或插入到数据库
    for (const remoteDomain of remoteDomains) {
      // 检查是否已存在
      const [existing] = await db
        .select()
        .from(domains)
        .where(eq(domains.name, remoteDomain.name));

      if (existing) {
        // 更新已存在的域名
        await db
          .update(domains)
          .set({
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(domains.id, existing.id));
        updated++;
      } else {
        // 插入新域名
        await db.insert(domains).values({
          providerId: provider.id,
          name: remoteDomain.name,
          isActive: true,
          lastSyncedAt: new Date().toISOString(),
        });
        synced++;
      }
    }

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'domain',
      entityId: provider.id,
      details: JSON.stringify({
        providerId,
        totalRemote: remoteDomains.length,
        synced,
        updated,
      }),
      status: 'success',
      createdBy: 'system',
    });

    revalidatePath('/domains');

    return NextResponse.json(successResponse({
      totalRemote: remoteDomains.length,
      synced,
      updated,
      domains: remoteDomains.map((d) => ({ id: d.id, name: d.name, status: d.status })),
    }));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}