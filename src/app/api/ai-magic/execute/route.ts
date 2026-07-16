import { NextRequest, NextResponse } from 'next/server';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  listRecords,
  findDomainByName,
  getRecord,
  DnsServiceError,
  normalizeError,
  ValidationError,
  type AuditContext,
  type CreateRecordInput,
  type UpdateRecordInput,
} from '@/lib/services';
import { db } from '@/lib/db/connection';
import { dnsRecords } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * POST /api/ai-magic/execute
 * 执行经 AI 解析并由用户确认后的 DNS 操作指令
 *
 * 已修复（vs 旧代码）：
 * - 旧代码操作云端后不写本地 DB（数据一致性 bug）→ 现在通过 Service 层统一同步
 * - 旧代码审计日志格式不统一（entityType='domain', action='AI_xxx'）→ 现在统一为 record/CREATE|UPDATE|DELETE
 * - 旧代码不写失败日志 → 现在 Service 层会写
 */
export async function POST(request: NextRequest) {
  try {
    const instruction = await request.json();
    const { action, domain, type, name, content, ttl, priority, proxied } = instruction;

    if (!action || !domain || !type || !name) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_ERROR',
        messageCn: '参数不完整',
        messageEn: 'Missing required parameters',
      }, { status: 400 });
    }

    // 查找域名（支持精确匹配 + 父域名回退）
    const domainEntity = await findDomainByName(domain);
    if (!domainEntity) {
      return NextResponse.json({
        success: false,
        code: 'NOT_FOUND',
        messageCn: `域名 ${domain} 未找到，请先同步`,
        messageEn: `Domain ${domain} not found, please sync first`,
      }, { status: 404 });
    }

    const context: AuditContext = {
      source: 'ai',
      actor: 'ai-magic',
      requestId: crypto.randomUUID?.() ?? `ai-${Date.now()}`,
    };

    if (action === 'CREATE') {
      if (!content) {
        throw new ValidationError('CREATE 操作缺少 content', 'CREATE action requires content');
      }
      const input: CreateRecordInput = {
        domainId: domainEntity.id,
        type,
        name,
        content,
        ttl: ttl ?? 600,
        priority: priority ?? null,
        proxied,
      };
      const result = await createRecord(input, context);
      return NextResponse.json({
        success: true,
        data: { message: `创建成功：${type} ${name} -> ${content}`, record: result.record },
      });
    }

    if (action === 'UPDATE') {
      if (!content) {
        throw new ValidationError('UPDATE 操作缺少 content', 'UPDATE action requires content');
      }
      // 查找本地记录（按 domainId + type + name 匹配）
      const [localRecord] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, domainEntity.id),
            eq(dnsRecords.type, type.toUpperCase()),
            eq(dnsRecords.name, name),
            eq(dnsRecords.isActive, true)
          )
        )
        .limit(1);

      if (!localRecord) {
        return NextResponse.json({
          success: false,
          code: 'NOT_FOUND',
          messageCn: `未在本地找到要更新的记录：${type} ${name}`,
          messageEn: `Record not found locally to update: ${type} ${name}`,
        }, { status: 404 });
      }

      const changes: UpdateRecordInput = {
        type,
        name,
        content,
        ttl: ttl ?? undefined,
        priority: priority ?? undefined,
        proxied,
      };
      const result = await updateRecord(localRecord.id, changes, context);
      return NextResponse.json({
        success: true,
        data: { message: `更新成功：${type} ${name} -> ${content}`, record: result.record },
      });
    }

    if (action === 'DELETE') {
      // 查找本地记录
      const [localRecord] = await db
        .select()
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.domainId, domainEntity.id),
            eq(dnsRecords.type, type.toUpperCase()),
            eq(dnsRecords.name, name),
            eq(dnsRecords.isActive, true)
          )
        )
        .limit(1);

      if (!localRecord) {
        return NextResponse.json({
          success: false,
          code: 'NOT_FOUND',
          messageCn: `未在本地找到要删除的记录：${type} ${name}`,
          messageEn: `Record not found locally to delete: ${type} ${name}`,
        }, { status: 404 });
      }

      await deleteRecord(localRecord.id, context);
      return NextResponse.json({
        success: true,
        data: { message: `删除成功：${type} ${name}` },
      });
    }

    if (action === 'QUERY') {
      const records = await listRecords(domainEntity.id);
      return NextResponse.json({ success: true, data: records });
    }

    return NextResponse.json({
      success: false,
      code: 'VALIDATION_ERROR',
      messageCn: `不支持的操作类型：${action}`,
      messageEn: `Unsupported action: ${action}`,
    }, { status: 400 });
  } catch (error) {
    const err = error instanceof DnsServiceError ? error : normalizeError(error);
    return NextResponse.json(err.toPayload(), { status: err.httpStatus() });
  }
}
