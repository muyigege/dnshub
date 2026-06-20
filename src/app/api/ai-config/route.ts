import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { encrypt } from '@/lib/encryption';
import { decryptAIConfigurationForClient, getAIConfigErrorMessage, normalizeAIChatCompletionsUrl } from '@/lib/ai-config-helpers';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    const configs = await db.select().from(aiConfigurations).orderBy(aiConfigurations.createdAt);
    const decryptedConfigs = configs.map(decryptAIConfigurationForClient);
    const decryptionWarnings = decryptedConfigs
      .filter((config) => config.apiKeyStatus !== 'ok')
      .map((config) => ({ id: config.id, name: config.name, message: config.apiKeyError }));

    return NextResponse.json({
      success: true,
      data: decryptedConfigs,
      decryptionWarnings,
    });
  } catch (error) {
    console.error('Get AI configurations error:', error);
    return NextResponse.json(
      {
        success: false,
        error: getAIConfigErrorMessage(error),
        messageCn: '加载 AI 配置失败',
        messageEn: 'Failed to load AI configurations',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, providerType, apiUrl, modelId, apiKey } = body;

    if (!name || !providerType || !apiUrl || !modelId || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          messageCn: '请填写所有必填字段',
          messageEn: 'Please fill all required fields',
        },
        { status: 400 }
      );
    }

    const encryptedApiKey = encrypt(String(apiKey));

    await db
      .update(aiConfigurations)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(sql`${aiConfigurations.isActive} = true`);

    const [newConfig] = await db
      .insert(aiConfigurations)
      .values({
        name: String(name).trim(),
        providerType: String(providerType),
        apiUrl: normalizeAIChatCompletionsUrl(String(apiUrl)),
        modelId: String(modelId).trim(),
        apiKey: encryptedApiKey,
        isActive: true,
      })
      .returning();

    const safeConfig = decryptAIConfigurationForClient(newConfig);

    return NextResponse.json({
      success: true,
      data: { ...safeConfig, apiKey: '' },
    });
  } catch (error) {
    console.error('Create AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: getAIConfigErrorMessage(error),
        messageCn: '保存 AI 配置失败',
        messageEn: 'Failed to save AI configuration',
      },
      { status: 500 }
    );
  }
}
