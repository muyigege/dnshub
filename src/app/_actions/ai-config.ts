'use server';

import { db } from '@/lib/db/connection';
import { aiConfigurations } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { encrypt } from '@/lib/encryption';
import {
  decryptAIConfigurationForClient,
  decryptAIConfigurationForRuntime,
  getAIConfigErrorMessage,
  normalizeAIChatCompletionsUrl,
} from '@/lib/ai-config-helpers';
import { revalidatePath } from 'next/cache';

export async function getAIConfigurations() {
  try {
    const configs = await db.select().from(aiConfigurations).orderBy(aiConfigurations.createdAt);
    return { success: true, data: configs.map(decryptAIConfigurationForClient) };
  } catch (error) {
    console.error('Get AI configurations error:', error);
    return {
      success: false,
      error: getAIConfigErrorMessage(error),
    };
  }
}

export async function getActiveAIConfiguration() {
  try {
    const configs = await db
      .select()
      .from(aiConfigurations)
      .where(sql`${aiConfigurations.isActive} = true`)
      .orderBy(desc(aiConfigurations.updatedAt));

    if (configs.length === 0) {
      return { success: false, error: 'No active AI configuration found' };
    }

    for (const config of configs) {
      try {
        return { success: true, data: decryptAIConfigurationForRuntime(config) };
      } catch (error) {
        console.warn(`Skip unusable active AI config ${config.id}:`, error);
      }
    }

    return {
      success: false,
      error: 'Active AI configuration API Key is invalid. Please update the AI config API Key.',
    };
  } catch (error) {
    console.error('Get active AI configuration error:', error);
    return {
      success: false,
      error: getAIConfigErrorMessage(error),
    };
  }
}

export async function createAIConfiguration(data: {
  name: string;
  providerType: string;
  apiUrl: string;
  modelId: string;
  apiKey: string;
}) {
  try {
    const encryptedApiKey = encrypt(data.apiKey);

    await db
      .update(aiConfigurations)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(sql`${aiConfigurations.isActive} = true`);

    const [newConfig] = await db
      .insert(aiConfigurations)
      .values({
        name: data.name,
        providerType: data.providerType,
        apiUrl: normalizeAIChatCompletionsUrl(data.apiUrl),
        modelId: data.modelId,
        apiKey: encryptedApiKey,
        isActive: true,
      })
      .returning();

    revalidatePath('/ai-config');
    revalidatePath('/');

    return { success: true, data: newConfig };
  } catch (error) {
    console.error('Create AI configuration error:', error);
    return {
      success: false,
      error: getAIConfigErrorMessage(error),
    };
  }
}

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
    const updateData: Partial<typeof aiConfigurations.$inferInsert> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.providerType !== undefined) updateData.providerType = data.providerType;
    if (data.apiUrl !== undefined) updateData.apiUrl = normalizeAIChatCompletionsUrl(data.apiUrl);
    if (data.modelId !== undefined) updateData.modelId = data.modelId;
    if (data.apiKey !== undefined) updateData.apiKey = encrypt(data.apiKey);

    if (data.isActive === true) {
      await db
        .update(aiConfigurations)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(sql`${aiConfigurations.isActive} = true`);
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
      error: getAIConfigErrorMessage(error),
    };
  }
}

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
      error: getAIConfigErrorMessage(error),
    };
  }
}

export async function toggleAIConfigurationActive(id: number, isActive: boolean) {
  try {
    if (isActive) {
      await db
        .update(aiConfigurations)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(sql`${aiConfigurations.isActive} = true`);
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
      error: getAIConfigErrorMessage(error),
    };
  }
}

export async function testAIConfiguration(data: {
  apiUrl: string;
  modelId: string;
  apiKey: string;
}) {
  try {
    const response = await fetch(normalizeAIChatCompletionsUrl(data.apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.apiKey}`,
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

    // 检查响应类型，避免 URL 填错（如填了网站首页）时测试仍通过
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const bodySnippet = (await response.text()).slice(0, 200);
      throw new Error(
        `AI API 返回的不是 JSON（Content-Type: ${contentType || 'unknown'}），` +
        `请确认 URL 指向 /v1/chat/completions 端点。响应片段: ${bodySnippet}`
      );
    }

    return { success: true, message: 'Connection successful' };
  } catch (error) {
    console.error('Test AI configuration error:', error);
    return {
      success: false,
      error: getAIConfigErrorMessage(error),
    };
  }
}
