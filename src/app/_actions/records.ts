'use server';

import { db } from '@/lib/db/connection';
import { dnsProviders, domains, dnsRecords, operationLogs } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

/**
 * DNS 记录输入类型
 */
export interface RecordInput {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  domainId: number;
  type: string;
  name: string;
  content?: string;
  ttl?: number;
  priority?: number;
}

/**
 * 统一的 DNS 记录管理接口
 * 根据域名所属的服务商自动路由到对应的 Provider 实现
 */
export async function manageRecord(input: RecordInput): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, input.domainId));

    if (!domain) {
      return {
        success: false,
        error: '域名不存在',
      };
    }

    // 获取服务商信息
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!provider) {
      return {
        success: false,
        error: '服务商不存在',
      };
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 根据操作类型执行
    switch (input.action) {
      case 'CREATE':
        return await createRecord(dnsProvider, domain, input, provider.id);
      case 'UPDATE':
        return await updateRecord(dnsProvider, domain, input, provider.id);
      case 'DELETE':
        return await deleteRecord(dnsProvider, domain, input, provider.id);
      default:
        return {
          success: false,
          error: `不支持的操作类型: ${input.action}`,
        };
    }
  } catch (error) {
    console.error('Manage record error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '操作失败',
    };
  }
}

/**
 * 创建 DNS 记录
 */
async function createRecord(
  dnsProvider: any,
  domain: any,
  input: RecordInput,
  providerId: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // 验证必填字段
    if (!input.content) {
      return {
        success: false,
        error: '记录值不能为空',
      };
    }

    // 调用 Provider API 创建记录
    const result = await dnsProvider.addRecord(domain.name, {
      type: input.type as any,
      name: input.name,
      content: input.content!,
      ttl: input.ttl || 600,
      priority: input.priority,
    });

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || '创建记录失败',
      };
    }

    // 保存到数据库
    const [created] = await db
      .insert(dnsRecords)
      .values({
        domainId: input.domainId,
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl || 600,
        priority: input.priority,
        providerRecordId: result.data.id,
        isActive: true,
      })
      .returning();

    // 记录操作日志（包含新值）
    await db.insert(operationLogs).values({
      action: 'CREATE',
      entityType: 'record',
      entityId: created.id,
      details: JSON.stringify({
        domain: domain.name,
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl || 600,
        priority: input.priority,
      }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath(`/domains/${input.domainId}`);

    return {
      success: true,
      data: created,
    };
  } catch (error) {
    console.error('Create record error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建记录失败',
    };
  }
}

/**
 * 更新 DNS 记录
 */
async function updateRecord(
  dnsProvider: any,
  domain: any,
  input: RecordInput,
  providerId: number
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    // 获取本地记录（获取 providerRecordId）
    const [existingRecord] = await db
      .select()
      .from(dnsRecords)
      .where(
        and(
          eq(dnsRecords.domainId, input.domainId),
          eq(dnsRecords.type, input.type),
          eq(dnsRecords.name, input.name)
        )
      );

    if (!existingRecord) {
      return {
        success: false,
        error: '记录不存在',
      };
    }

    // 准备更新数据和变更记录
    const updateData: any = {};
    const changes: any = {
      domain: domain.name,
      type: input.type,
      name: input.name,
      oldValue: {},
      newValue: {},
    };

    if (input.content) {
      changes.oldValue.content = existingRecord.content;
      changes.newValue.content = input.content;
      updateData.content = input.content;
    }
    if (input.ttl) {
      changes.oldValue.ttl = existingRecord.ttl;
      changes.newValue.ttl = input.ttl;
      updateData.ttl = input.ttl;
    }
    if (input.priority !== undefined) {
      changes.oldValue.priority = existingRecord.priority;
      changes.newValue.priority = input.priority;
      updateData.priority = input.priority;
    }

    // 调用 Provider API 更新记录
    const result = await dnsProvider.updateRecord(
      domain.name,
      existingRecord.providerRecordId!,
      updateData
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || '更新记录失败',
      };
    }

    // 更新数据库
    const [updated] = await db
      .update(dnsRecords)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(dnsRecords.id, existingRecord.id))
      .returning();

    // 记录操作日志（包含旧值和新值）
    await db.insert(operationLogs).values({
      action: 'UPDATE',
      entityType: 'record',
      entityId: updated.id,
      details: JSON.stringify(changes),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath(`/domains/${input.domainId}`);

    return {
      success: true,
      data: updated,
    };
  } catch (error) {
    console.error('Update record error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新记录失败',
    };
  }
}

/**
 * 删除 DNS 记录
 */
async function deleteRecord(
  dnsProvider: any,
  domain: any,
  input: RecordInput,
  providerId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // 获取本地记录
    const [existingRecord] = await db
      .select()
      .from(dnsRecords)
      .where(
        and(
          eq(dnsRecords.domainId, input.domainId),
          eq(dnsRecords.type, input.type),
          eq(dnsRecords.name, input.name)
        )
      );

    if (!existingRecord) {
      return {
        success: false,
        error: '记录不存在',
      };
    }

    // 调用 Provider API 删除记录
    const result = await dnsProvider.deleteRecord(domain.name, existingRecord.providerRecordId!);

    if (!result.success) {
      return {
        success: false,
        error: result.error || '删除记录失败',
      };
    }

    // 记录操作日志（包含被删除的记录内容）
    await db.insert(operationLogs).values({
      action: 'DELETE',
      entityType: 'record',
      entityId: existingRecord.id,
      details: JSON.stringify({
        domain: domain.name,
        type: existingRecord.type,
        name: existingRecord.name,
        content: existingRecord.content,
        ttl: existingRecord.ttl,
        priority: existingRecord.priority,
      }),
      status: 'success',
      createdBy: 'system',
    });

    // 删除数据库记录
    await db.delete(dnsRecords).where(eq(dnsRecords.id, existingRecord.id));

    // 重新验证缓存
    revalidatePath(`/domains/${input.domainId}`);

    return {
      success: true,
    };
  } catch (error) {
    console.error('Delete record error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除记录失败',
    };
  }
}

/**
 * 获取域名的所有 DNS 记录
 */
export async function getDomainRecords(domainId: number): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const records = await db.select().from(dnsRecords).where(eq(dnsRecords.domainId, domainId));

    return {
      success: true,
      data: records,
    };
  } catch (error) {
    console.error('Get domain records error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取 DNS 记录失败',
    };
  }
}

/**
 * 同步域名的 DNS 记录
 */
export async function syncDomainRecords(domainId: number): Promise<{
  success: boolean;
  data?: { synced: number; total: number };
  error?: string;
}> {
  try {
    // 获取域名信息
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));

    if (!domain) {
      return {
        success: false,
        error: '域名不存在',
      };
    }

    // 获取服务商信息
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!provider) {
      return {
        success: false,
        error: '服务商不存在',
      };
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 获取 DNS 记录列表
    const recordsResult = await dnsProvider.listRecords(domain.name);

    if (!recordsResult.success || !recordsResult.data) {
      return {
        success: false,
        error: recordsResult.error || '获取 DNS 记录失败',
      };
    }

    let syncedCount = 0;

    // 同步记录到数据库
    for (const record of recordsResult.data) {
      // 检查记录是否已存在
      const [existing] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, domainId),
            eq(dnsRecords.providerRecordId, record.id)
          )
        );

      if (existing) {
        // 更新
        await db
          .update(dnsRecords)
          .set({
            type: record.type,
            name: record.name,
            content: record.content,
            ttl: record.ttl,
            priority: record.priority,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(dnsRecords.id, existing.id));
      } else {
        // 创建
        await db.insert(dnsRecords).values({
          domainId,
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl,
          priority: record.priority,
          providerRecordId: record.id,
          isActive: true,
        });
        syncedCount++;
      }
    }

    // 记录操作日志
    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'record',
      entityId: domainId,
      details: JSON.stringify({ synced: syncedCount, total: recordsResult.data.length }),
      status: 'success',
      createdBy: 'system',
    });

    // 重新验证缓存
    revalidatePath(`/domains/${domainId}`);

    return {
      success: true,
      data: {
        synced: syncedCount,
        total: recordsResult.data.length,
      },
    };
  } catch (error) {
    console.error('Sync domain records error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '同步 DNS 记录失败',
    };
  }
}
