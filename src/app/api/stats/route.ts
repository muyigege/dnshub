import { NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders, domains, dnsRecords } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * GET /api/stats
 * 获取系统统计数据
 */
export async function GET() {

  try {
    // 并行查询三个表的计数
    const providersResult = await db.select({ count: sql<number>`count(*)` }).from(dnsProviders);
    const domainsResult = await db.select({ count: sql<number>`count(*)` }).from(domains);
    const recordsResult = await db.select({ count: sql<number>`count(*)` }).from(dnsRecords);

    return NextResponse.json({
      success: true,
      data: {
        providers: providersResult[0]?.count || 0,
        domains: domainsResult[0]?.count || 0,
        records: recordsResult[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
