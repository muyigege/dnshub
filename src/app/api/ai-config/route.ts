import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { encrypt, decrypt } from '@/lib/encryption';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/ai-config
 * 获取所有 AI 配置
 */
export async function GET() {

  try {
    const configs = await db.select().from(aiConfigurations).orderBy(aiConfigurations.createdAt);

    // 解密 API Key
    const decryptedConfigs = configs.map((config: any) => ({
      ...config,
      apiKey: config.apiKey ? decrypt(config.apiKey) : '',
    }));

    return NextResponse.json({
      success: true,
      data: decryptedConfigs,
    });
  } catch (error) {
    console.error('Get AI configurations error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get AI configurations',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-config
 * 创建 AI 配置
 */
export async function POST(request: NextRequest) {

  try {
    const body = await request.json();

    const { name, providerType, apiUrl, modelId, apiKey } = body;

    if (!name || !providerType || !apiUrl || !modelId || !apiKey) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    const encryptedApiKey = encrypt(apiKey);

    // 如果激活此配置，需要先将其他配置设为不激活
    await db.update(aiConfigurations).set({ isActive: false }).where(sql`${aiConfigurations.isActive} = true`);

    const [newConfig] = await db
      .insert(aiConfigurations)
      .values({
        name,
        providerType,
        apiUrl,
        modelId,
        apiKey: encryptedApiKey,
        isActive: true,
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: newConfig,
    });
  } catch (error) {
    console.error('Create AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create AI configuration',
      },
      { status: 500 }
    );
  }
}
