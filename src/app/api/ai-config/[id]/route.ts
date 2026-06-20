import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { encrypt } from '@/lib/encryption';
import { decryptAIConfigurationForClient, getAIConfigErrorMessage, normalizeAIChatCompletionsUrl } from '@/lib/ai-config-helpers';
import { eq, sql } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const configId = Number.parseInt(id, 10);

    if (Number.isNaN(configId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid config id', messageCn: '配置 ID 无效', messageEn: 'Invalid config id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, providerType, apiUrl, modelId, apiKey, isActive } = body;

    const updateData: Partial<typeof aiConfigurations.$inferInsert> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (providerType !== undefined) updateData.providerType = String(providerType);
    if (apiUrl !== undefined) updateData.apiUrl = normalizeAIChatCompletionsUrl(String(apiUrl));
    if (modelId !== undefined) updateData.modelId = String(modelId).trim();
    if (apiKey !== undefined) {
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'API Key is required', messageCn: '请填写 API Key', messageEn: 'API Key is required' },
          { status: 400 }
        );
      }
      updateData.apiKey = encrypt(String(apiKey));
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    if (isActive === true) {
      await db
        .update(aiConfigurations)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(sql`${aiConfigurations.isActive} = true`);
    }

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ ...updateData, updatedAt: new Date().toISOString() })
      .where(eq(aiConfigurations.id, configId))
      .returning();

    if (!updatedConfig) {
      return NextResponse.json(
        { success: false, error: 'AI config not found', messageCn: 'AI 配置不存在', messageEn: 'AI configuration not found' },
        { status: 404 }
      );
    }

    const safeConfig = decryptAIConfigurationForClient(updatedConfig);

    return NextResponse.json({
      success: true,
      data: { ...safeConfig, apiKey: '' },
    });
  } catch (error) {
    console.error('Update AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: getAIConfigErrorMessage(error),
        messageCn: '更新 AI 配置失败',
        messageEn: 'Failed to update AI configuration',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const configId = Number.parseInt(id, 10);

    if (Number.isNaN(configId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid config id', messageCn: '配置 ID 无效', messageEn: 'Invalid config id' },
        { status: 400 }
      );
    }

    await db.delete(aiConfigurations).where(eq(aiConfigurations.id, configId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: getAIConfigErrorMessage(error),
        messageCn: '删除 AI 配置失败',
        messageEn: 'Failed to delete AI configuration',
      },
      { status: 500 }
    );
  }
}
