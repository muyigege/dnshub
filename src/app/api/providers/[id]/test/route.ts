import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';
import { dnsProviders, operationLogs } from '@/lib/db/schema';
import { handleCloudError, successResponse } from '@/lib/api';

/**
 * POST /api/providers/[id]/test - 测试服务商连接
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const providerId = parseInt(id, 10);

    if (isNaN(providerId)) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_ID',
        messageCn: '无效的服务商 ID',
        messageEn: 'Invalid provider ID',
      }, { status: 400 });
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

    // 测试连接
    const result = await dnsProvider.testConnection();

    if (!result.success) {
      // 使用错误拦截器处理云服务商返回的错误
      const errorPayload = handleCloudError(result.error, provider.type);
      
      // 记录失败日志
      await db.insert(operationLogs).values({
        action: 'TEST',
        entityType: 'provider',
        entityId: providerId,
        details: JSON.stringify({ action: 'test_connection', error: errorPayload.code }),
        status: 'failed',
        errorMessage: errorPayload.messageCn,
        createdBy: 'system',
      });

      return NextResponse.json(errorPayload, { status: 400 });
    }

    return NextResponse.json(successResponse({ connected: true }));
  } catch (error) {
    // 获取服务商类型用于错误处理
    let providerType = 'unknown';
    try {
      const { id } = await params;
      const providerId = parseInt(id, 10);
      if (!isNaN(providerId)) {
        const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, providerId));
        if (provider) providerType = provider.type;
      }
    } catch {}
    
    return NextResponse.json(handleCloudError(error, providerType), { status: 500 });
  }
}