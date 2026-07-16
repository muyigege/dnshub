/**
 * RollbackService — 补偿式回退
 *
 * DNS 服务商不支持跨请求事务，因此采用补偿机制：
 * - CREATE 成功后，补偿操作是 DELETE
 * - UPDATE 前保存完整旧记录，补偿操作是恢复旧值
 * - DELETE 前保存完整记录，补偿操作是重新创建
 *
 * 关键约束：
 * - 回退前重新读取远端记录，检测记录是否已被其他用户修改（并发冲突）
 * - 检测到并发变化时默认拒绝强制覆盖
 * - 批量操作按执行成功顺序的逆序回退
 * - 记录每个补偿步骤的结果
 * - 不要把"修改本地 SQLite"当作远端 DNS 已回退
 */

import { db } from '@/lib/db/connection';
import { operationLogs, dnsRecords } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  createProviderInstanceForDomain,
  getDomainEntity,
  getRecordEntity,
} from './provider-service';
import {
  writeAuditLog,
  updateAuditLogStatus,
  markRolledBack,
  generateBatchId,
  type AuditContext,
  type OperationStatus,
} from './audit-logger';
import {
  DnsServiceError,
  NotFoundError,
  ConflictError,
  RollbackFailedError,
  RollbackConflictError,
  ValidationError,
  normalizeError,
} from './errors';
import type { DNSRecordType } from '@/lib/providers/base';

// ============================================================
// 类型定义
// ============================================================

export interface RollbackPlan {
  operationId: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  canRollback: boolean;
  reason?: string;
  compensatingAction: 'DELETE' | 'UPDATE' | 'CREATE';
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  warnings: string[];
}

export interface RollbackResult {
  operationId: number;
  rollbackOperationId: number;
  status: 'success' | 'failed' | 'partial';
  compensatingAction: 'DELETE' | 'UPDATE' | 'CREATE';
  message: string;
}

export interface BatchRollbackResult {
  batchId: string;
  results: RollbackResult[];
  totalSuccess: number;
  totalFailed: number;
  status: OperationStatus;
}

// ============================================================
// 回退预览（dryRun）
// ============================================================

/**
 * 预览一条操作的回退计划。
 *
 * 会检查：
 * - 操作是否存在
 * - 操作是否可回退（status=success，且有 beforeSnapshot/afterSnapshot）
 * - 操作是否在保留期内（默认 30 天）
 * - 远端记录是否已被并发修改（仅当 force=false 时检测）
 */
export async function previewRollback(
  operationId: number,
  options: { force?: boolean; retentionDays?: number } = {}
): Promise<RollbackPlan> {
  const { force = false, retentionDays = 30 } = options;

  const rows = await db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.id, operationId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError(
      `操作 ${operationId} 不存在`,
      `Operation ${operationId} not found`
    );
  }

  const op = rows[0];

  // 只能回退 CREATE/UPDATE/DELETE
  if (!['CREATE', 'UPDATE', 'DELETE'].includes(op.action)) {
    return {
      operationId,
      action: op.action as 'CREATE' | 'UPDATE' | 'DELETE',
      canRollback: false,
      reason: `操作类型 ${op.action} 不支持回退`,
      compensatingAction: 'DELETE',
      warnings: [],
    };
  }

  // 只能回退成功的操作（rolled_back/failed/partial 都不可回退）
  if (op.status !== 'success') {
    return {
      operationId,
      action: op.action as 'CREATE' | 'UPDATE' | 'DELETE',
      canRollback: false,
      reason: `操作状态为 ${op.status}，只能回退 success 状态的操作`,
      compensatingAction: 'DELETE',
      warnings: [],
    };
  }

  // 保留期检查
  if (op.createdAt) {
    const createdAt = new Date(op.createdAt + 'Z').getTime();
    const now = Date.now();
    const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays > retentionDays) {
      return {
        operationId,
        action: op.action as 'CREATE' | 'UPDATE' | 'DELETE',
        canRollback: false,
        reason: `操作已超过保留期 ${retentionDays} 天（当前 ${Math.floor(ageDays)} 天）`,
        compensatingAction: 'DELETE',
        warnings: [`age: ${Math.floor(ageDays)} days`],
      };
    }
  }

  const warnings: string[] = [];
  let beforeSnapshot: Record<string, unknown> | undefined;
  let afterSnapshot: Record<string, unknown> | undefined;

  try {
    if (op.beforeSnapshot) beforeSnapshot = JSON.parse(op.beforeSnapshot);
  } catch {
    warnings.push('beforeSnapshot 解析失败');
  }
  try {
    if (op.afterSnapshot) afterSnapshot = JSON.parse(op.afterSnapshot);
  } catch {
    warnings.push('afterSnapshot 解析失败');
  }

  // 根据原操作确定补偿动作
  let compensatingAction: 'DELETE' | 'UPDATE' | 'CREATE';
  if (op.action === 'CREATE') {
    compensatingAction = 'DELETE';
    if (!afterSnapshot) {
      return {
        operationId,
        action: 'CREATE',
        canRollback: false,
        reason: '缺少 afterSnapshot，无法定位要删除的记录',
        compensatingAction,
        warnings,
      };
    }
  } else if (op.action === 'UPDATE') {
    compensatingAction = 'UPDATE';
    if (!beforeSnapshot) {
      return {
        operationId,
        action: 'UPDATE',
        canRollback: false,
        reason: '缺少 beforeSnapshot，无法恢复旧值',
        compensatingAction,
        warnings,
      };
    }
  } else {
    // DELETE
    compensatingAction = 'CREATE';
    if (!beforeSnapshot) {
      return {
        operationId,
        action: 'DELETE',
        canRollback: false,
        reason: '缺少 beforeSnapshot，无法重建记录',
        compensatingAction,
        warnings,
      };
    }
  }

  // 并发冲突检测（仅当 force=false 时）
  if (!force && op.domainId && op.recordId) {
    const conflict = await detectConcurrentChange(op.domainId, op.recordId, afterSnapshot, beforeSnapshot);
    if (conflict) {
      warnings.push(`并发冲突: ${conflict}`);
    }
  }

  return {
    operationId,
    action: op.action as 'CREATE' | 'UPDATE' | 'DELETE',
    canRollback: true,
    compensatingAction,
    beforeSnapshot,
    afterSnapshot,
    warnings,
  };
}

/**
 * 检测远端记录是否已被并发修改。
 * 通过对比快照中的关键字段与远端当前值。
 */
async function detectConcurrentChange(
  domainId: number,
  recordId: number,
  afterSnapshot: Record<string, unknown> | undefined,
  beforeSnapshot: Record<string, unknown> | undefined
): Promise<string | null> {
  try {
    // 读取本地记录当前值
    const localRows = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.id, recordId))
      .limit(1);

    if (localRows.length === 0) {
      // 本地记录已不存在——可能是已被删除
      // 如果原操作是 CREATE，那回退（DELETE）应该是安全的
      // 如果原操作是 UPDATE，那无法恢复
      if (beforeSnapshot) {
        return `本地记录 ${recordId} 已不存在，可能已被其他操作删除`;
      }
      return null;
    }

    const local = localRows[0];
    const snapshotToCompare = afterSnapshot ?? beforeSnapshot;

    if (snapshotToCompare) {
      const snapContent = snapshotToCompare.content;
      const snapTtl = snapshotToCompare.ttl;
      if (snapContent !== undefined && String(snapContent) !== String(local.content)) {
        return `content 已变化（快照: ${snapContent}, 当前: ${local.content}）`;
      }
      if (snapTtl !== undefined && Number(snapTtl) !== Number(local.ttl)) {
        return `ttl 已变化（快照: ${snapTtl}, 当前: ${local.ttl}）`;
      }
    }

    return null;
  } catch (err) {
    // 检测失败不阻塞回退，但记录警告
    return `并发检测失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ============================================================
// 执行回退
// ============================================================

/**
 * 执行单条操作的回退。
 *
 * @param operationId 要回退的操作 ID
 * @param context 审计上下文
 * @param options.force 是否强制回退（忽略并发冲突）
 * @param options.confirm 必须为 true 才执行（二次确认）
 */
export async function rollbackOperation(
  operationId: number,
  context: AuditContext,
  options: { force?: boolean; confirm?: boolean } = {}
): Promise<RollbackResult> {
  const { force = false, confirm = false } = options;

  if (!confirm) {
    throw new ValidationError(
      '回退操作必须显式确认（confirm=true）',
      'Rollback requires explicit confirmation (confirm=true)'
    );
  }

  const startedAt = new Date().toISOString();

  // 先预览
  const plan = await previewRollback(operationId, { force });
  if (!plan.canRollback) {
    throw new RollbackFailedError(
      `无法回退: ${plan.reason}`,
      `Cannot rollback: ${plan.reason}`
    );
  }

  // 检测并发冲突（即使 force=true 也要记录警告）
  if (plan.warnings.length > 0 && !force) {
    throw new RollbackConflictError(
      `检测到并发变化，拒绝回退: ${plan.warnings.join('; ')}。如需强制回退，设置 force=true`,
      `Concurrent change detected, refusing rollback: ${plan.warnings.join('; ')}. Set force=true to override`,
      plan.warnings.join('\n')
    );
  }

  // 加载原操作记录
  const rows = await db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.id, operationId))
    .limit(1);
  const op = rows[0];

  if (!op.domainId) {
    throw new RollbackFailedError(
      '原操作缺少 domainId，无法回退',
      'Original operation has no domainId, cannot rollback'
    );
  }

  // 实例化 Provider
  const { provider, domain, providerEntity } = await createProviderInstanceForDomain(op.domainId);

  const completedAt = new Date().toISOString();
  let status: 'success' | 'failed' = 'success';
  let message = '';

  try {
    if (plan.compensatingAction === 'DELETE') {
      // CREATE 的补偿：删除创建的记录
      if (!plan.afterSnapshot) {
        throw new RollbackFailedError('缺少 afterSnapshot，无法定位要删除的记录', 'Missing afterSnapshot');
      }
      const providerRecordId = String(plan.afterSnapshot.providerRecordId ?? '');
      if (!providerRecordId) {
        throw new RollbackFailedError('afterSnapshot 缺少 providerRecordId', 'afterSnapshot missing providerRecordId');
      }
      const result = await provider.deleteRecord(domain.name, providerRecordId);
      if (!result.success) {
        throw new Error(result.error || 'Provider deleteRecord failed');
      }
      // 同步本地 DB：删除本地记录
      if (op.recordId) {
        await db.delete(dnsRecords).where(eq(dnsRecords.id, op.recordId));
      }
      message = `已删除记录 ${plan.afterSnapshot.name ?? ''}（补偿 CREATE）`;

    } else if (plan.compensatingAction === 'UPDATE') {
      // UPDATE 的补偿：恢复旧值
      if (!plan.beforeSnapshot) {
        throw new RollbackFailedError('缺少 beforeSnapshot，无法恢复旧值', 'Missing beforeSnapshot');
      }
      const providerRecordId = String(plan.beforeSnapshot.providerRecordId ?? '');
      if (!providerRecordId) {
        throw new RollbackFailedError('beforeSnapshot 缺少 providerRecordId', 'beforeSnapshot missing providerRecordId');
      }
      // 恢复 proxied（仅当快照中存在有效值时；null/undefined 视为未设置）
      const restoreProxied =
        plan.beforeSnapshot.proxied === true || plan.beforeSnapshot.proxied === false
          ? (plan.beforeSnapshot.proxied as boolean)
          : undefined;
      const result = await provider.updateRecord(domain.name, providerRecordId, {
        type: plan.beforeSnapshot.type as DNSRecordType,
        name: String(plan.beforeSnapshot.name ?? ''),
        content: String(plan.beforeSnapshot.content ?? ''),
        ttl: plan.beforeSnapshot.ttl ? Number(plan.beforeSnapshot.ttl) : undefined,
        priority: plan.beforeSnapshot.priority != null ? Number(plan.beforeSnapshot.priority) : undefined,
        proxied: restoreProxied,
      });
      if (!result.success) {
        throw new Error(result.error || 'Provider updateRecord failed');
      }
      // 同步本地 DB：恢复旧值
      if (op.recordId) {
        await db
          .update(dnsRecords)
          .set({
            type: String(plan.beforeSnapshot.type ?? ''),
            name: String(plan.beforeSnapshot.name ?? ''),
            content: String(plan.beforeSnapshot.content ?? ''),
            ttl: plan.beforeSnapshot.ttl ? Number(plan.beforeSnapshot.ttl) : 600,
            priority: plan.beforeSnapshot.priority != null ? Number(plan.beforeSnapshot.priority) : null,
            proxied: restoreProxied ?? null,
            proxiable: plan.beforeSnapshot.proxiable === true || plan.beforeSnapshot.proxiable === false
              ? (plan.beforeSnapshot.proxiable as boolean)
              : null,
            // 回退补偿视为一次新的修改，version 自增以维持乐观锁一致性
            version: sql`${dnsRecords.version} + 1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(dnsRecords.id, op.recordId));
      }
      message = `已恢复记录 ${plan.beforeSnapshot.name ?? ''} 到旧值（补偿 UPDATE）`;

    } else {
      // DELETE 的补偿：重新创建
      if (!plan.beforeSnapshot) {
        throw new RollbackFailedError('缺少 beforeSnapshot，无法重建记录', 'Missing beforeSnapshot');
      }
      const restoreProxied =
        plan.beforeSnapshot.proxied === true || plan.beforeSnapshot.proxied === false
          ? (plan.beforeSnapshot.proxied as boolean)
          : undefined;
      const result = await provider.addRecord(domain.name, {
        type: plan.beforeSnapshot.type as DNSRecordType,
        name: String(plan.beforeSnapshot.name ?? ''),
        content: String(plan.beforeSnapshot.content ?? ''),
        ttl: plan.beforeSnapshot.ttl ? Number(plan.beforeSnapshot.ttl) : 600,
        priority: plan.beforeSnapshot.priority != null ? Number(plan.beforeSnapshot.priority) : undefined,
        proxied: restoreProxied,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Provider addRecord failed');
      }
      // 同步本地 DB：重新插入记录（注意 providerRecordId 可能变化）
      await db.insert(dnsRecords).values({
        domainId: op.domainId,
        type: String(plan.beforeSnapshot.type ?? ''),
        name: String(plan.beforeSnapshot.name ?? ''),
        content: String(plan.beforeSnapshot.content ?? ''),
        ttl: plan.beforeSnapshot.ttl ? Number(plan.beforeSnapshot.ttl) : 600,
        priority: plan.beforeSnapshot.priority != null ? Number(plan.beforeSnapshot.priority) : null,
        providerRecordId: result.data.id,
        isActive: true,
        proxied: result.data.proxied ?? restoreProxied ?? null,
        proxiable: result.data.proxiable ?? null,
      });
      message = `已重建记录 ${plan.beforeSnapshot.name ?? ''}（补偿 DELETE）`;
    }

    // 标记原操作为已回退
    await markRolledBack(operationId, completedAt);

    // 写入回退审计日志
    const rollbackOpId = await writeAuditLog({
      action: 'ROLLBACK',
      entityType: 'record',
      entityId: op.recordId ?? 0,
      status: 'success',
      details: {
        originalOperationId: operationId,
        originalAction: op.action,
        compensatingAction: plan.compensatingAction,
        message,
        force,
      },
      providerId: providerEntity.id,
      domainId: op.domainId,
      recordId: op.recordId ?? undefined,
      beforeSnapshot: plan.afterSnapshot,
      afterSnapshot: plan.beforeSnapshot,
      startedAt,
      completedAt,
      rollbackOf: operationId,
      context,
    });

    return {
      operationId,
      rollbackOperationId: rollbackOpId ?? 0,
      status: 'success',
      compensatingAction: plan.compensatingAction,
      message,
    };
  } catch (err) {
    status = 'failed';
    const error = normalizeError(err);

    // 写入失败回退日志
    const rollbackOpId = await writeAuditLog({
      action: 'ROLLBACK',
      entityType: 'record',
      entityId: op.recordId ?? 0,
      status: 'failed',
      details: {
        originalOperationId: operationId,
        originalAction: op.action,
        compensatingAction: plan.compensatingAction,
        force,
      },
      errorMessage: error.messageEn,
      errorCode: error.code,
      providerId: providerEntity.id,
      domainId: op.domainId,
      recordId: op.recordId ?? undefined,
      startedAt,
      completedAt: new Date().toISOString(),
      rollbackOf: operationId,
      context,
    });

    throw new RollbackFailedError(
      `回退失败: ${error.messageCn}`,
      `Rollback failed: ${error.messageEn}`,
      error.details
    );
  }
}

/**
 * 批量回退一个 batchId 下的所有操作（逆序）。
 */
export async function rollbackBatch(
  batchId: string,
  context: AuditContext,
  options: { force?: boolean; confirm?: boolean } = {}
): Promise<BatchRollbackResult> {
  const { force = false, confirm = false } = options;

  if (!confirm) {
    throw new ValidationError(
      '批量回退必须显式确认（confirm=true）',
      'Batch rollback requires explicit confirmation (confirm=true)'
    );
  }

  // 查询该 batch 下所有成功的操作，按 id 倒序（即执行顺序的逆序）
  const ops = await db
    .select()
    .from(operationLogs)
    .where(
      and(
        eq(operationLogs.batchId, batchId),
        eq(operationLogs.status, 'success')
      )
    )
    .orderBy(sql`${operationLogs.id} DESC`);

  if (ops.length === 0) {
    throw new NotFoundError(
      `批量操作 ${batchId} 不存在或无可回退的操作`,
      `Batch ${batchId} not found or no rollbackable operations`
    );
  }

  const results: RollbackResult[] = [];
  let totalSuccess = 0;
  let totalFailed = 0;

  for (const op of ops) {
    try {
      const result = await rollbackOperation(op.id, context, { force, confirm: true });
      results.push(result);
      totalSuccess++;
    } catch (err) {
      const error = normalizeError(err);
      results.push({
        operationId: op.id,
        rollbackOperationId: 0,
        status: 'failed',
        compensatingAction: 'DELETE',
        message: error.messageEn,
      });
      totalFailed++;
    }
  }

  const status: OperationStatus = totalFailed === 0 ? 'success' : totalSuccess === 0 ? 'failed' : 'partial';

  return {
    batchId,
    results,
    totalSuccess,
    totalFailed,
    status,
  };
}
