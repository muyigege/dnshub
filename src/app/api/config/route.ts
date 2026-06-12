import { NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders, aiConfigurations, domains, dnsRecords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/config/export
 * 导出所有配置数据（加密的凭据会被保留）
 */
export async function GET() {
  try {
    // 获取所有配置数据
    const providers = await db.select().from(dnsProviders);
    const aiConfigs = await db.select().from(aiConfigurations);
    
    // 获取域名和记录（不导出操作日志）
    const allDomains = await db.select().from(domains);
    const allRecords = await db.select().from(dnsRecords);

    // 构建导出数据
    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        providers,
        aiConfigs,
        domains: allDomains,
        records: allRecords,
      },
    };

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    console.error('Export config error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导出失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config/import
 * 导入配置数据
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, overwrite = false } = body;

    if (!data) {
      return NextResponse.json(
        { success: false, error: '缺少导入数据' },
        { status: 400 }
      );
    }

    // 如果不是覆盖模式，检查是否已有数据
    if (!overwrite) {
      const existingProviders = await db.select().from(dnsProviders);
      if (existingProviders.length > 0) {
        return NextResponse.json(
          { success: false, error: '系统已有配置数据，请使用 overwrite=true 参数覆盖' },
          { status: 400 }
        );
      }
    }

    // 如果是覆盖模式，先清空现有数据
    if (overwrite) {
      await db.delete(dnsRecords);
      await db.delete(domains);
      await db.delete(dnsProviders);
      await db.delete(aiConfigurations);
    }

    // 导入服务商配置
    if (data.providers && Array.isArray(data.providers)) {
      for (const provider of data.providers) {
        await db.insert(dnsProviders).values({
          name: provider.name,
          type: provider.type,
          credentials: provider.credentials,
          isActive: provider.isActive ?? true,
          createdAt: provider.createdAt ?? new Date().toISOString(),
          updatedAt: provider.updatedAt ?? new Date().toISOString(),
        });
      }
    }

    // 导入 AI 配置
    if (data.aiConfigs && Array.isArray(data.aiConfigs)) {
      for (const config of data.aiConfigs) {
        await db.insert(aiConfigurations).values({
          name: config.name,
          providerType: config.providerType ?? 'custom',
          apiUrl: config.apiUrl,
          modelId: config.modelId,
          apiKey: config.apiKey,
          isActive: config.isActive ?? true,
          createdAt: config.createdAt ?? new Date().toISOString(),
          updatedAt: config.updatedAt ?? new Date().toISOString(),
        });
      }
    }

    // 导入域名
    if (data.domains && Array.isArray(data.domains)) {
      for (const domain of data.domains) {
        await db.insert(domains).values({
          providerId: domain.providerId,
          name: domain.name,
          isActive: domain.isActive ?? true,
          lastSyncedAt: domain.lastSyncedAt,
          createdAt: domain.createdAt ?? new Date().toISOString(),
          updatedAt: domain.updatedAt ?? new Date().toISOString(),
        });
      }
    }

    // 导入 DNS 记录
    if (data.records && Array.isArray(data.records)) {
      for (const record of data.records) {
        await db.insert(dnsRecords).values({
          domainId: record.domainId,
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl ?? 600,
          priority: record.priority,
          providerRecordId: record.providerRecordId,
          isActive: record.isActive ?? true,
          createdAt: record.createdAt ?? new Date().toISOString(),
          updatedAt: record.updatedAt ?? new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '配置导入成功',
    });
  } catch (error) {
    console.error('Import config error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}