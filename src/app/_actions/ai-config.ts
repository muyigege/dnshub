'use server';

import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/encryption';
import { revalidatePath } from 'next/cache';

/**
 * 获取所有 AI 配置
 */
export async function getAIConfigurations() {

  try {
    const configs = await db.select().from(aiConfigurations).orderBy(aiConfigurations.createdAt);

    // 解密 API Key
    const decryptedConfigs = configs.map((config: any) => ({
      ...config,
      apiKey: config.apiKey ? decrypt(config.apiKey) : '',
    }));

    return { success: true, data: decryptedConfigs };
  } catch (error) {
    console.error('Get AI configurations error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get AI configurations',
    };
  }
}

/**
 * 获取激活的 AI 配置
 */
export async function getActiveAIConfiguration() {

  try {
    const configs = await db
      .select()
      .from(aiConfigurations)
      .where(sql`${aiConfigurations.isActive} = true`)
      .limit(1);

    if (configs.length === 0) {
      return { success: false, error: 'No active AI configuration found' };
    }

    const config = configs[0];
    return {
      success: true,
      data: {
        ...config,
        apiKey: config.apiKey ? decrypt(config.apiKey) : '',
      },
    };
  } catch (error) {
    console.error('Get active AI configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active AI configuration',
    };
  }
}

/**
 * 创建 AI 配置
 */
export async function createAIConfiguration(data: {
  name: string;
  providerType: string;
  apiUrl: string;
  modelId: string;
  apiKey: string;
}) {

  try {
    const encryptedApiKey = encrypt(data.apiKey);

    const [newConfig] = await db
      .insert(aiConfigurations)
      .values({
        name: data.name,
        providerType: data.providerType,
        apiUrl: data.apiUrl,
        modelId: data.modelId,
        apiKey: encryptedApiKey,
        isActive: true, // 新创建的默认激活
      })
      .returning();

    revalidatePath('/ai-config');
    revalidatePath('/');

    return { success: true, data: newConfig };
  } catch (error) {
    console.error('Create AI configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create AI configuration',
    };
  }
}

/**
 * 更新 AI 配置
 */
export async function updateAIConfiguration(
  id: number,
  data: {
    name?: string;
    providerType?: string;
    apiUrl?: string;
    modelId?: string;
    apiKey?: string;
    isActive?: boolean;
  }
) {

  try {
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.providerType !== undefined) updateData.providerType = data.providerType;
    if (data.apiUrl !== undefined) updateData.apiUrl = data.apiUrl;
    if (data.modelId !== undefined) updateData.modelId = data.modelId;
    if (data.apiKey !== undefined) updateData.apiKey = encrypt(data.apiKey);

    // 如果激活此配置，需要先将其他配置设为不激活
    if (data.isActive === true) {
      await db.update(aiConfigurations).set({ isActive: false }).where(sql`${aiConfigurations.isActive} = true`);
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ ...updateData, updatedAt: new Date().toISOString() })
      .where(eq(aiConfigurations.id, id))
      .returning();

    revalidatePath('/ai-config');
    revalidatePath('/');

    return { success: true, data: updatedConfig };
  } catch (error) {
    console.error('Update AI configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update AI configuration',
    };
  }
}

/**
 * 删除 AI 配置
 */
export async function deleteAIConfiguration(id: number) {

  try {
    await db.delete(aiConfigurations).where(eq(aiConfigurations.id, id));

    revalidatePath('/ai-config');
    revalidatePath('/');

    return { success: true };
  } catch (error) {
    console.error('Delete AI configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete AI configuration',
    };
  }
}

/**
 * 切换 AI 配置激活状态
 */
export async function toggleAIConfigurationActive(id: number, isActive: boolean) {

  try {
    // 如果激活此配置，需要先将其他配置设为不激活
    if (isActive) {
      await db.update(aiConfigurations).set({ isActive: false }).where(sql`${aiConfigurations.isActive} = true`);
    }

    const [updatedConfig] = await db
      .update(aiConfigurations)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(eq(aiConfigurations.id, id))
      .returning();

    revalidatePath('/ai-config');
    revalidatePath('/');

    return { success: true, data: updatedConfig };
  } catch (error) {
    console.error('Toggle AI configuration active error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle AI configuration active',
    };
  }
}

/**
 * 测试 AI 配置连接
 */
export async function testAIConfiguration(data: {
  apiUrl: string;
  modelId: string;
  apiKey: string;
}) {

  try {
    const response = await fetch(data.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.apiKey}`,
      },
      body: JSON.stringify({
        model: data.modelId,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return { success: true, message: 'Connection successful' };
  } catch (error) {
    console.error('Test AI configuration error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test AI configuration',
    };
  }
}
