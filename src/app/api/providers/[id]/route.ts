import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

// 导入 schema
import { dnsProviders, operationLogs } from '@/lib/db/schema';

/**
 * DELETE /api/providers/[id] - 删除服务商
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const providerId = parseInt(id, 10);

    if (isNaN(providerId)) {
      return NextResponse.json(
        { success: false, error: '无效的服务商 ID' },
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

    // 删除服务商（级联删除相关域名和记录）
    await db.delete(dnsProviders).where(eq(dnsProviders.id, providerId));

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'DELETE',
      entityType: 'provider',
      entityId: providerId,
      details: JSON.stringify({ name: provider.name, type: provider.type }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath('/providers');
    revalidatePath('/domains');

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Delete provider error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '删除失败',
      },
      { status: 500 }
    );
  }
}
