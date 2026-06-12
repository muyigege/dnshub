'use server';

import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * 获取所有操作日志
 */
export async function getOperationLogs(limit: number = 100): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const logs = await db
      .select()
      .from(operationLogs)
      .orderBy(operationLogs.createdAt)
      .limit(limit);

    return {
      success: true,
      data: logs,
    };
  } catch (error) {
    console.error('Get operation logs error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取操作日志失败',
    };
  }
}

/**
 * 获取特定实体的操作日志
 */
export async function getEntityLogs(
  entityType: string,
  entityId: number,
  limit: number = 50
): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  try {
    const logs = await db
      .select()
      .from(operationLogs)
      .where(
        and(
          eq(operationLogs.entityType, entityType),
          eq(operationLogs.entityId, entityId)
        )
      )
      .orderBy(operationLogs.createdAt)
      .limit(limit);

    return {
      success: true,
      data: logs,
    };
  } catch (error) {
    console.error('Get entity logs error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取实体日志失败',
    };
  }
}
