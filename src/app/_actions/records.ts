'use server';

import {
  createRecord,
  updateRecord,
  deleteRecord,
  syncRecords,
  listRecords,
  type AuditContext,
  type CreateRecordInput,
  type UpdateRecordInput,
} from '@/lib/services';
import { revalidatePath } from 'next/cache';

/**
 * DNS 记录输入类型（保留原签名以兼容）
 */
export interface RecordInput {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  domainId: number;
  type: string;
  name: string;
  content?: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

/**
 * 统一的 DNS 记录管理接口。
 *
 * 已重构为薄封装，复用 Service 层逻辑，确保与 REST/AI/MCP 行为一致。
 * 所有审计日志、能力校验、冲突检测、本地 DB 同步都由 Service 层统一处理。
 */
export async function manageRecord(input: RecordInput): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const context: AuditContext = {
    source: 'ui',
    requestId: `ui-${Date.now()}`,
  };

  try {
    if (input.action === 'CREATE') {
      if (!input.content) {
        return { success: false, error: 'CREATE 操作缺少 content' };
      }
      const result = await createRecord(
        {
          domainId: input.domainId,
          type: input.type,
          name: input.name,
          content: input.content,
          ttl: input.ttl ?? 600,
          priority: input.priority ?? null,
          proxied: input.proxied,
        },
        context
      );
      revalidatePath('/domains');
      return { success: true, data: result.record };
    }

    if (input.action === 'UPDATE') {
      if (!input.content) {
        return { success: false, error: 'UPDATE 操作缺少 content' };
      }
      // 注意：manageRecord 旧接口缺少 recordId，这里需要先按 (domainId, type, name) 查找
      // 保留旧行为：调用方应优先使用 REST API /api/records/[id]
      const { db } = await import('@/lib/db/connection');
      const { dnsRecords } = await import('@/lib/db/schema');
      const { eq, and } = await import('drizzle-orm');
      const [localRecord] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, input.domainId),
            eq(dnsRecords.type, input.type.toUpperCase()),
            eq(dnsRecords.name, input.name),
            eq(dnsRecords.isActive, true)
          )
        )
        .limit(1);

      if (!localRecord) {
        return { success: false, error: '记录不存在' };
      }

      const changes: UpdateRecordInput = {
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl,
        priority: input.priority,
        proxied: input.proxied,
      };
      const result = await updateRecord(localRecord.id, changes, context);
      revalidatePath('/domains');
      return { success: true, data: result.record };
    }

    if (input.action === 'DELETE') {
      const { db } = await import('@/lib/db/connection');
      const { dnsRecords } = await import('@/lib/db/schema');
      const { eq, and } = await import('drizzle-orm');
      const [localRecord] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, input.domainId),
            eq(dnsRecords.type, input.type.toUpperCase()),
            eq(dnsRecords.name, input.name),
            eq(dnsRecords.isActive, true)
          )
        )
        .limit(1);

      if (!localRecord) {
        return { success: false, error: '记录不存在' };
      }

      await deleteRecord(localRecord.id, context);
      revalidatePath('/domains');
      return { success: true };
    }

    return { success: false, error: `不支持的操作: ${input.action}` };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '操作失败',
    };
  }
}

/**
 * 同步指定域名的 DNS 记录
 */
export async function syncDomainRecords(domainId: number): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const context: AuditContext = {
    source: 'ui',
    requestId: `ui-sync-${Date.now()}`,
  };

  try {
    const summary = await syncRecords(domainId, context);
    revalidatePath('/domains');
    return { success: true, data: summary };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '同步失败',
    };
  }
}

/**
 * 创建 DNS 记录（保留独立函数签名）
 */
export async function createRecordAction(
  input: Omit<CreateRecordInput, 'domainId'> & { domainId: number }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const context: AuditContext = {
    source: 'ui',
    requestId: `ui-create-${Date.now()}`,
  };

  try {
    const result = await createRecord(input, context);
    revalidatePath('/domains');
    return { success: true, data: result.record };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '创建失败',
    };
  }
}

/**
 * 更新 DNS 记录（保留独立函数签名）
 */
export async function updateRecordAction(
  recordId: number,
  changes: UpdateRecordInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const context: AuditContext = {
    source: 'ui',
    requestId: `ui-update-${Date.now()}`,
  };

  try {
    const result = await updateRecord(recordId, changes, context);
    revalidatePath('/domains');
    return { success: true, data: result.record };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '更新失败',
    };
  }
}

/**
 * 删除 DNS 记录（保留独立函数签名）
 */
export async function deleteRecordAction(
  recordId: number
): Promise<{ success: boolean; error?: string }> {
  const context: AuditContext = {
    source: 'ui',
    requestId: `ui-delete-${Date.now()}`,
  };

  try {
    await deleteRecord(recordId, context);
    revalidatePath('/domains');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '删除失败',
    };
  }
}
