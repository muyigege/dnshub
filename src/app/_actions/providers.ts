'use server';

import { db } from '@/lib/db/connection';
import { dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { encryptJSON, decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * 服务商类型（字符串类型，用于 Server Actions 序列化）
 */
export type ProviderTypeString = 'cloudflare' | 'aliyun' | 'tencent';

/**
 * 服务商输入类型（简化结构，避免复杂的嵌套对象）
 */
export interface ProviderInput {
  id?: number;
  name: string;
  type: ProviderTypeString;
  // 将凭证作为平铺的字符串字段，避免嵌套对象序列化问题
  apiToken?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  secretId?: string;
  secretKey?: string;
  isActive?: boolean;
}

/**
 * 添加或更新服务商
 */
export async function upsertProvider(input: ProviderInput): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const { type, name, apiToken, accessKeyId, accessKeySecret, secretId, secretKey } = input;

    // 根据类型构建凭证对象
    const credentials: Record<string, string> = {};

    if (type === 'cloudflare') {
      if (!apiToken) {
        return { success: false, error: 'Cloudflare 需要 API Token' };
      }
      credentials.apiToken = apiToken;
    } else if (type === 'aliyun') {
      if (!accessKeyId || !accessKeySecret) {
        return { success: false, error: '阿里云需要 AccessKey ID 和 Secret' };
      }
      credentials.accessKeyId = accessKeyId;
      credentials.accessKeySecret = accessKeySecret;
    } else if (type === 'tencent') {
      if (!secretId || !secretKey) {
        return { success: false, error: '腾讯云需要 Secret ID 和 Key' };
      }
      credentials.secretId = secretId;
      credentials.secretKey = secretKey;
    }

    // 加密凭证
    const encryptedCredentials = encryptJSON(credentials);

    // 创建或更新服务商
    if (input.id) {
      // 更新
      const [updated] = await db
        .update(dnsProviders)
        .set({
          name,
          type,
          credentials: encryptedCredentials,
          isActive: input.isActive ?? true,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dnsProviders.id, input.id))
        .returning();

      if (!updated) {
        return {
          success: false,
          error: '服务商不存在',
        };
      }

      // 记录操作日志
      await db.insert(operationLogs).values({
        action: 'UPDATE',
        entityType: 'provider',
        entityId: updated.id,
        details: JSON.stringify({ name, type }),
        status: 'success',
        createdBy: 'system',
      });

      // 重新验证缓存
      revalidatePath('/providers');

      return {
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          type: updated.type,
          isActive: updated.isActive,
        },
      };
    } else {
      // 创建
      const [created] = await db
        .insert(dnsProviders)
        .values({
          name,
          type,
          credentials: encryptedCredentials,
          isActive: input.isActive ?? true,
        })
        .returning();

      // 记录操作日志
      await db.insert(operationLogs).values({
        action: 'CREATE',
        entityType: 'provider',
        entityId: created.id,
        details: JSON.stringify({ name, type }),
        status: 'success',
        createdBy: 'system',
      });

      // 重新验证缓存
      revalidatePath('/providers');

      return {
        success: true,
        data: {
          id: created.id,
          name: created.name,
          type: created.type,
          isActive: created.isActive,
        },
      };
    }
  } catch (error) {
    console.error('Upsert provider error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '操作失败',
    };
  }
}

/**
 * 测试服务商连接
 */
export async function testProviderConnection(providerId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 获取服务商信息
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return {
        success: false,
        error: '服务商不存在',
      };
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例（将字符串转换为枚举）
    const providerTypeEnum = provider.type.toUpperCase() as keyof typeof ProviderType;
    const dnsProvider = DNSProviderFactory.create(ProviderType[providerTypeEnum], credentials);

    // 测试连接
    const result = await dnsProvider.testConnection();

    if (!result.success) {
      // 记录失败日志
      await db.insert(operationLogs).values({
        action: 'UPDATE',
        entityType: 'provider',
        entityId: providerId,
        details: JSON.stringify({ action: 'test_connection' }),
        status: 'failed',
        errorMessage: result.error,
        createdBy: 'system',
      });
    }

    return result;
  } catch (error) {
    console.error('Test provider connection error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '连接测试失败',
    };
  }
}

/**
 * 同步域名列表
 */
export async function syncDomains(providerId: number): Promise<{
  success: boolean;
  data?: { synced: number; total: number };
  error?: string;
}> {
  try {
    // 获取服务商信息
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return {
        success: false,
        error: '服务商不存在',
      };
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例（将字符串转换为枚举）
    const providerTypeEnum = provider.type.toUpperCase() as keyof typeof ProviderType;
    const dnsProvider = DNSProviderFactory.create(ProviderType[providerTypeEnum], credentials);

    // 获取域名列表
    const domainsResult = await dnsProvider.listDomains();

    if (!domainsResult.success || !domainsResult.data) {
      return {
        success: false,
        error: domainsResult.error || '获取域名列表失败',
      };
    }

    let syncedCount = 0;

    // 同步域名到数据库
    for (const domain of domainsResult.data) {
      // 检查域名是否已存在
      const [existing] = await db
        .select()
        .from(domains)
        .where(
          and(
            eq(domains.providerId, providerId),
            eq(domains.name, domain.name)
          )
        );

      if (existing) {
        // 更新
        await db
          .update(domains)
          .set({
            name: domain.name,
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(domains.id, existing.id));
      } else {
        // 创建
        await db.insert(domains).values({
          providerId,
          name: domain.name,
          isActive: true,
          lastSyncedAt: new Date().toISOString(),
        });
        syncedCount++;
      }
    }

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'domain',
      entityId: providerId,
      details: JSON.stringify({ synced: syncedCount, total: domainsResult.data.length }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath('/domains');
    revalidatePath('/providers');

    return {
      success: true,
      data: {
        synced: syncedCount,
        total: domainsResult.data.length,
      },
    };
  } catch (error) {
    console.error('Sync domains error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '同步域名失败',
    };
  }
}

/**
 * 删除服务商
 */
export async function deleteProvider(providerId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 检查服务商是否存在
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return {
        success: false,
        error: '服务商不存在',
      };
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

    return {
      success: true,
    };
  } catch (error) {
    console.error('Delete provider error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除失败',
    };
  }
}

/**
 * 获取所有服务商列表
 */
export async function getProviders(): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const providers = await db.select({
      id: dnsProviders.id,
      name: dnsProviders.name,
      type: dnsProviders.type,
      isActive: dnsProviders.isActive,
      createdAt: dnsProviders.createdAt,
      updatedAt: dnsProviders.updatedAt,
    }).from(dnsProviders);

    return {
      success: true,
      data: providers,
    };
  } catch (error) {
    console.error('Get providers error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取服务商列表失败',
    };
  }
}

/**
 * 获取所有域名及其服务商信息
 */
export async function getDomainsWithProvider(): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const result = await db
      .select({
        id: domains.id,
        name: domains.name,
        providerId: domains.providerId,
        isActive: domains.isActive,
        lastSyncedAt: domains.lastSyncedAt,
        createdAt: domains.createdAt,
        updatedAt: domains.updatedAt,
        providerName: dnsProviders.name,
        providerType: dnsProviders.type,
      })
      .from(domains)
      .leftJoin(dnsProviders, eq(domains.providerId, dnsProviders.id))
      .orderBy(domains.name);

    return {
      success: true,
      data: result.map((row: any) => ({
        id: row.id,
        name: row.name,
        providerId: row.providerId,
        isActive: row.isActive,
        lastSyncedAt: row.lastSyncedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        providerName: row.providerName,
        providerType: row.providerType,
      })),
    };
  } catch (error) {
    console.error('Get domains with provider error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取域名列表失败',
    };
  }
}
