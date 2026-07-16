import { NextRequest, NextResponse } from 'next/server';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  listRecords,
  batchMutateRecords,
  findDomainByName,
  generateBatchId,
  DnsServiceError,
  normalizeError,
  ValidationError,
  type AuditContext,
  type CreateRecordInput,
  type UpdateRecordInput,
  type BatchMutationItem,
} from '@/lib/services';
import { db } from '@/lib/db/connection';
import { dnsRecords } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/ai/execute
 * 执行 AI 解析后的 DNS 操作（支持单条和批量）
 *
 * 已修复（vs 旧代码）：
 * - 单条和批量两套重复 CRUD 逻辑 → 统一委托 Service 层（消除约 400 行重复代码）
 * - 父域名回退逻辑分散 → 用 Service 层 findDomainByName 统一处理
 * - 审计日志格式不统一 → Service 层统一写入
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 批量指令
    if (body.batch === true && Array.isArray(body.instructions) && body.instructions.length > 0) {
      return await executeBatchInstruction(body.instructions);
    }

    // 单条指令
    const { action, domain, type, name, content, oldContent, ttl = 600, priority, proxied } = body;

    if (!action || !domain || !type) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '缺少 action、domain 或 type',
        messageEn: 'action, domain, and type are required',
      }, { status: 400 });
    }

    // 查找域名（支持精确匹配 + 父域名回退 + 子域名名拼接）
    let resolvedName = name;
    const domainEntity = await findDomainByName(domain);
    if (!domainEntity) {
      return NextResponse.json({
        success: false,
        code: 'NOT_FOUND',
        messageCn: `域名 ${domain} 未找到，请先同步`,
        messageEn: `Domain "${domain}" not found, please sync first`,
      }, { status: 404 });
    }

    // 如果找到的是父域名，且原 domain 是子域名，需要拼接子域名名
    if (domainEntity.name !== domain) {
      const sub = domain.slice(0, domain.length - domainEntity.name.length - 1);
      if (sub) {
        resolvedName = name === '@' || !name ? sub : `${sub}.${name}`;
      }
    }

    const context: AuditContext = {
      source: 'ai',
      actor: 'ai',
      requestId: crypto.randomUUID?.() ?? `ai-${Date.now()}`,
    };

    switch (action) {
      case 'CREATE': {
        if (!resolvedName || !content) {
          return NextResponse.json({
            success: false,
            code: 'VALIDATION_ERROR',
            messageCn: 'CREATE 操作缺少 name 或 content',
            messageEn: 'name and content are required for CREATE',
          }, { status: 400 });
        }
        const input: CreateRecordInput = {
          domainId: domainEntity.id,
          type,
          name: resolvedName,
          content,
          ttl,
          priority: priority ?? null,
          proxied,
        };
        const result = await createRecord(input, context);
        return NextResponse.json({
          success: true,
          data: result.record,
          message: `成功创建 ${type} 记录`,
        });
      }

      case 'UPDATE': {
        if (!resolvedName || !content) {
          return NextResponse.json({
            success: false,
            code: 'VALIDATION_ERROR',
            messageCn: 'UPDATE 操作缺少 name 或 content',
            messageEn: 'name and content are required for UPDATE',
          }, { status: 400 });
        }
        // 查找本地记录（支持 oldContent 精确匹配）
        const conditions = [
          eq(dnsRecords.domainId, domainEntity.id),
          eq(dnsRecords.type, type.toUpperCase()),
          eq(dnsRecords.name, resolvedName),
        ];
        if (oldContent) {
          conditions.push(eq(dnsRecords.content, oldContent));
        }
        const [localRecord] = await db.select().from(dnsRecords).where(and(...conditions)).limit(1);

        if (!localRecord) {
          return NextResponse.json({
            success: false,
            code: 'NOT_FOUND',
            messageCn: oldContent
              ? `未找到匹配的记录（oldContent="${oldContent}"）`
              : `未找到记录，请指定 oldContent 用于确认`,
            messageEn: oldContent
              ? `Record not found with oldContent="${oldContent}"`
              : `Record not found, please specify old content for confirmation`,
          }, { status: 404 });
        }

        const changes: UpdateRecordInput = {
          type,
          name: resolvedName,
          content,
          ttl,
          priority: priority ?? undefined,
          proxied,
        };
        const result = await updateRecord(localRecord.id, changes, context);
        return NextResponse.json({
          success: true,
          data: result.record,
          message: `成功更新 ${type} 记录`,
        });
      }

      case 'DELETE': {
        // 查找本地记录
        const conditions = [
          eq(dnsRecords.domainId, domainEntity.id),
          eq(dnsRecords.type, type.toUpperCase()),
        ];
        if (resolvedName) conditions.push(eq(dnsRecords.name, resolvedName));
        if (oldContent) conditions.push(eq(dnsRecords.content, oldContent));
        const [localRecord] = await db.select().from(dnsRecords).where(and(...conditions)).limit(1);

        if (!localRecord) {
          return NextResponse.json({
            success: false,
            code: 'NOT_FOUND',
            messageCn: `未找到要删除的记录：${type} ${resolvedName ?? ''}`,
            messageEn: `Record not found to delete: ${type} ${resolvedName ?? ''}`,
          }, { status: 404 });
        }

        await deleteRecord(localRecord.id, context);
        return NextResponse.json({
          success: true,
          message: `成功删除 ${type} 记录`,
        });
      }

      case 'QUERY': {
        const records = await listRecords(domainEntity.id);
        return NextResponse.json({ success: true, data: records });
      }

      default:
        return NextResponse.json({
          success: false,
          code: 'VALIDATION_ERROR',
          messageCn: `不支持的操作：${action}`,
          messageEn: `Unsupported action: ${action}`,
        }, { status: 400 });
    }
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}

/**
 * 批量执行指令。
 * 统一委托给 Service 层的 batchMutateRecords，支持部分失败。
 */
async function executeBatchInstruction(instructions: any[]) {
  const batchId = generateBatchId();
  const context: AuditContext = {
    source: 'ai',
    actor: 'ai-batch',
    batchId,
    requestId: crypto.randomUUID?.() ?? `ai-batch-${Date.now()}`,
  };

  // 将指令转换为 BatchMutationItem
  const items: BatchMutationItem[] = [];

  for (const inst of instructions) {
    const { action, domain, type, name, content, oldContent, ttl = 600, priority, proxied } = inst;
    if (!action || !domain || !type) {
      items.push({
        action: action?.toLowerCase() === 'create' ? 'create' : action?.toLowerCase() === 'update' ? 'update' : 'delete',
      });
      continue;
    }

    const domainEntity = await findDomainByName(domain);
    if (!domainEntity) {
      items.push({
        action: action.toLowerCase() === 'create' ? 'create' : action.toLowerCase() === 'update' ? 'update' : 'delete',
      });
      continue;
    }

    // 子域名名拼接
    let resolvedName = name;
    if (domainEntity.name !== domain) {
      const sub = domain.slice(0, domain.length - domainEntity.name.length - 1);
      if (sub) {
        resolvedName = name === '@' || !name ? sub : `${sub}.${name}`;
      }
    }

    const lowerAction = action.toLowerCase();
    if (lowerAction === 'create') {
      items.push({
        action: 'create',
        input: {
          domainId: domainEntity.id,
          type,
          name: resolvedName,
          content,
          ttl,
          priority: priority ?? null,
          proxied,
        },
      });
    } else if (lowerAction === 'update') {
      // 找本地记录
      const conditions = [
        eq(dnsRecords.domainId, domainEntity.id),
        eq(dnsRecords.type, type.toUpperCase()),
      ];
      if (resolvedName) conditions.push(eq(dnsRecords.name, resolvedName));
      if (oldContent) conditions.push(eq(dnsRecords.content, oldContent));
      const [localRecord] = await db.select().from(dnsRecords).where(and(...conditions)).limit(1);
      if (!localRecord) {
        items.push({ action: 'update' });
        continue;
      }
      items.push({
        action: 'update',
        recordId: localRecord.id,
        changes: {
          type,
          name: resolvedName,
          content,
          ttl,
          priority: priority ?? undefined,
          proxied,
        },
      });
    } else if (lowerAction === 'delete') {
      const conditions = [
        eq(dnsRecords.domainId, domainEntity.id),
        eq(dnsRecords.type, type.toUpperCase()),
      ];
      if (resolvedName) conditions.push(eq(dnsRecords.name, resolvedName));
      if (oldContent) conditions.push(eq(dnsRecords.content, oldContent));
      const [localRecord] = await db.select().from(dnsRecords).where(and(...conditions)).limit(1);
      if (!localRecord) {
        items.push({ action: 'delete' });
        continue;
      }
      items.push({
        action: 'delete',
        recordId: localRecord.id,
      });
    }
  }

  const batchResult = await batchMutateRecords(items, context);

  return NextResponse.json({
    success: batchResult.totalFailed === 0,
    message: `批量执行完成：成功 ${batchResult.totalSuccess} 条，失败 ${batchResult.totalFailed} 条`,
    batchId: batchResult.batchId,
    total: instructions.length,
    successCount: batchResult.totalSuccess,
    failureCount: batchResult.totalFailed,
    results: batchResult.results,
  });
}
