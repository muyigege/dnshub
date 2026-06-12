import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * POST /api/ai-config/[id]/toggle
 * 切换 AI 配置激活状态
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const { id } = await params;
    const configId = parseInt(id);

    const body = await request.json();
    const { isActive } = body;

    // 如果激活此配置，需要先将其他配置设为不激活
    if (isActive) {
      await db.update(aiConfigurations).set({ isActive: false }).where(sql`${aiConfigurations.isActive} = true`);
    }

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(aiConfigurations.id, configId))
      .returning();

    if (!updatedConfig) {
      return NextResponse.json(
        { success: false, error: 'AI 配置不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updatedConfig });
  } catch (error) {
    console.error('Toggle AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle AI configuration',
      },
      { status: 500 }
    );
  }
}
