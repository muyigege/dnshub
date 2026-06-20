import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { decryptAIConfigurationForClient, getAIConfigErrorMessage } from '@/lib/ai-config-helpers';
import { eq, sql } from 'drizzle-orm';

export async function POST(
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
    const isActive = Boolean(body.isActive);

    if (isActive) {
      await db
        .update(aiConfigurations)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(sql`${aiConfigurations.isActive} = true`);
    }

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ isActive, updatedAt: new Date().toISOString() })
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
    console.error('Toggle AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: getAIConfigErrorMessage(error),
        messageCn: '切换 AI 配置失败',
        messageEn: 'Failed to toggle AI configuration',
      },
      { status: 500 }
    );
  }
}
