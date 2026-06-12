import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { domains, dnsProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/domains
 * 获取所有域名及其服务商信息
 */
export async function GET() {

  try {
    const result = await db
      .select({
        id: domains.id,
        name: domains.name,
        providerId: domains.providerId,
        isActive: domains.isActive,
        lastSyncedAt: domains.lastSyncedAt,
        createdAt: domains.createdAt,
        updatedAt: domains.updatedAt,
        providerName: dnsProviders.name,
        providerType: dnsProviders.type,
      })
      .from(domains)
      .leftJoin(dnsProviders, eq(domains.providerId, dnsProviders.id))
      .orderBy(domains.name);

    return NextResponse.json({
      success: true,
      data: result.map((row: any) => ({
        id: row.id,
        name: row.name,
        providerId: row.providerId,
        isActive: row.isActive,
        lastSyncedAt: row.lastSyncedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        providerName: row.providerName,
        providerType: row.providerType,
      })),
    });
  } catch (error) {
    console.error('Get domains error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取域名列表失败',
      },
      { status: 500 }
    );
  }
}
