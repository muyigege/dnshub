import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsRecords, dnsProviders, domains } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';
import { handleCloudError, successResponse, validateRequired } from '@/lib/api';

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
        code: 'MISSING_PARAM',
        messageCn: '缺少 domainId 参数',
        messageEn: 'Missing domainId parameter',
      }, { status: 400 });
    }

    const records = await db.select().from(dnsRecords).where(eq(dnsRecords.domainId, domainId));
    return NextResponse.json(successResponse(records));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}

/**
 * POST /api/records
 * 创建 DNS 记录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domainId, type, name, content, ttl = 600, priority } = body;

    // 验证必填字段
    const validationError = validateRequired({ domainId, type, name, content }, ['domainId', 'type', 'name', 'content']);
    if (validationError) {
      return NextResponse.json(validationError, { status: 400 });
    }

    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));
    if (!domain) {
      return NextResponse.json({
        success: false,
        code: 'DOMAIN_NOT_FOUND',
        messageCn: '域名不存在',
        messageEn: 'Domain not found',
      }, { status: 404 });
    }

    // 获取服务商信息
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));
    if (!provider) {
      return NextResponse.json({
        success: false,
        code: 'PROVIDER_NOT_FOUND',
        messageCn: '服务商不存在',
        messageEn: 'Provider not found',
      }, { status: 404 });
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 调用 Provider API 创建记录
    const result = await dnsProvider.addRecord(domain.name, { type, name, content, ttl, priority });

    if (!result.success || !result.data) {
      return NextResponse.json(handleCloudError(result.error, provider.type), { status: 500 });
    }

    // 保存到数据库
    const [created] = await db
      .insert(dnsRecords)
      .values({
        domainId,
        type,
        name,
        content,
        ttl,
        priority,
        providerRecordId: result.data.id,
        isActive: true,
      })
      .returning();

    return NextResponse.json(successResponse(created));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}