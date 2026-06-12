import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { encrypt, decrypt } from '@/lib/encryption';
import { eq, sql } from 'drizzle-orm';

/**
 * PUT /api/ai-config/[id]
 * 更新 AI 配置
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const { id } = await params;
    const configId = parseInt(id);

    const body = await request.json();
    const { name, providerType, apiUrl, modelId, apiKey, isActive } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (providerType !== undefined) updateData.providerType = providerType;
    if (apiUrl !== undefined) updateData.apiUrl = apiUrl;
    if (modelId !== undefined) updateData.modelId = modelId;
    if (apiKey !== undefined) updateData.apiKey = encrypt(apiKey);
    if (isActive !== undefined) updateData.isActive = isActive;

    // 如果激活此配置，需要先将其他配置设为不激活
    if (isActive === true) {
      await db.update(aiConfigurations).set({ isActive: false }).where(sql`${aiConfigurations.isActive} = true`);
    }

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ ...updateData, updatedAt: new Date().toISOString() })
      .where(eq(aiConfigurations.id, configId))
      .returning();

    if (!updatedConfig) {
      return NextResponse.json(
        { success: false, error: 'AI 配置不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedConfig,
    });
  } catch (error) {
    console.error('Update AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update AI configuration',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-config/[id]
 * 删除 AI 配置
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const { id } = await params;
    const configId = parseInt(id);

    await db.delete(aiConfigurations).where(eq(aiConfigurations.id, configId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete AI configuration',
      },
      { status: 500 }
    );
  }
}
