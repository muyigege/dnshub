import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * POST /api/domains - 手动添加域名
 */
export async function POST(request: NextRequest) {
  try {

    const body = await request.json();
    const { providerId, name } = body;

    if (!providerId || !name) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 检查服务商是否存在
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return NextResponse.json(
        { success: false, error: '服务商不存在' },
        { status: 404 }
      );
    }

    // 检查域名是否已存在
    const [existing] = await db
      .select()
      .from(domains)
      .where(eq(domains.name, name));

    if (existing) {
      return NextResponse.json(
        { success: false, error: '域名已存在' },
        { status: 400 }
      );
    }

    // 插入新域名
    const [created] = await db
      .insert(domains)
      .values({
        providerId,
        name,
        isActive: true,
        lastSyncedAt: new Date().toISOString(),
      })
      .returning();

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'CREATE',
      entityType: 'domain',
      entityId: created.id,
      details: JSON.stringify({ providerId, name }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath('/domains');

    return NextResponse.json({
      success: true,
      data: created,
    });
  } catch (error) {
    console.error('Add domain error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '添加域名失败',
      },
      { status: 500 }
    );
  }
}
