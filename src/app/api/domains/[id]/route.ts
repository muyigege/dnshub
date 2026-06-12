import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { domains, operationLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * DELETE /api/domains/[id] - 删除指定域名
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const domainId = parseInt(id, 10);

    if (isNaN(domainId)) {
      return NextResponse.json(
        { success: false, error: '无效的域名 ID' },
        { status: 400 }
      );
    }

    // 获取域名信息
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId));

    if (!domain) {
      return NextResponse.json(
        { success: false, error: '域名不存在' },
        { status: 404 }
      );
    }

    // 删除域名
    await db.delete(domains).where(eq(domains.id, domainId));

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'DELETE',
      entityType: 'domain',
      entityId: domainId,
      details: JSON.stringify({ name: domain.name, providerId: domain.providerId }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath('/domains');

    return NextResponse.json({
      success: true,
      message: '域名已删除',
    });
  } catch (error) {
    console.error('Delete domain error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除域名失败',
      },
      { status: 500 }
    );
  }
}
