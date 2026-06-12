import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { domains, dnsProviders, dnsRecords, operationLogs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';

/**
 * POST /api/ai-magic/execute
 * 执行经 AI 解析并由用户确认后的 DNS 操作指令
 */
export async function POST(request: NextRequest) {

    try {
        const instruction = await request.json();

        // 如果是批量记录则需要拆解循环，这里为了简化先支持单条记录。
        // 我们假设前端如果有 batch 的情况，已经将其拆解为一个个单独的 API 请求发过来，或者在这里遍历。
        // 此处写单个指令执行逻辑：
        const { action, domain, type, name, content, ttl, priority } = instruction;

        if (!action || !domain || !type || !name) {
            return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });
        }

        // 查找域名
        const [domainRecord] = await db
            .select()
            .from(domains)
            .where(eq(domains.name, domain));

        if (!domainRecord) {
            return NextResponse.json({ success: false, error: `域名 ${domain} 未找到，请先同步` }, { status: 404 });
        }

        // 查找服务商
        const [provider] = await db
            .select()
            .from(dnsProviders)
            .where(eq(dnsProviders.id, domainRecord.providerId));

        if (!provider) {
            return NextResponse.json({ success: false, error: '无法找到服务商配置' }, { status: 404 });
        }

        const credentials = decryptJSON<Record<string, string>>(provider.credentials);
        const providerTypeEnum = provider.type.toUpperCase() as keyof typeof ProviderType;
        const dnsProvider = DNSProviderFactory.create(ProviderType[providerTypeEnum], credentials);

        console.log(`[AI Magic Exec] Executing ${action} on ${domain} via ${provider.name}`);

        let apiResult;
        let detailsStr = '';

        if (action === 'CREATE') {
            if (!content) throw new Error('CREATE 操作缺少 content 参数');
            apiResult = await dnsProvider.addRecord(domainRecord.name, {
                type, name, content, ttl: ttl || 600, priority: priority || 10
            });
            detailsStr = `Created ${type} record ${name} -> ${content}`;

        } else if (action === 'UPDATE') {
            if (!content) throw new Error('UPDATE 操作缺少 content 参数');
            const recordsResult = await dnsProvider.listRecords(domainRecord.name);
            if (!recordsResult.success || !recordsResult.data || recordsResult.data.length === 0) {
                throw new Error('未在云端找到要更新的记录');
            }
            // 需要查找对应的记录 ID
            const targetRecord = recordsResult.data.find(r => r.type === type && (r.name === name || r.name === `${name}.${domainRecord.name}`));
            if (!targetRecord) throw new Error('未在云端找到要更新的具体记录');
            const remoteId = targetRecord.id;
            apiResult = await dnsProvider.updateRecord(domainRecord.name, remoteId.toString(), {
                type, name, content, ttl: ttl || 600, priority: priority || 10
            });
            detailsStr = `Updated ${type} record ${name} -> ${content}`;

        } else if (action === 'DELETE') {
            const recordsResult = await dnsProvider.listRecords(domainRecord.name);
            if (!recordsResult.success || !recordsResult.data || recordsResult.data.length === 0) {
                throw new Error('未在云端找到要删除的记录');
            }
            const targetRecord = recordsResult.data.find(r => r.type === type && (r.name === name || r.name === `${name}.${domainRecord.name}`));
            if (!targetRecord) throw new Error('未在云端找到要删除的具体记录');
            const remoteId = targetRecord.id;
            apiResult = await dnsProvider.deleteRecord(domainRecord.name, remoteId.toString());
            detailsStr = `Deleted ${type} record ${name}`;

        } else if (action === 'QUERY') {
            const recordsResult = await dnsProvider.listRecords(domainRecord.name);
            return NextResponse.json({ success: true, data: recordsResult.data });
        } else {
            throw new Error(`不支持的操作类型：${action}`);
        }

        if (!apiResult.success) {
            throw new Error(`云端服务商 API 错误: ${apiResult.error}`);
        }

        // 记录审计日志
        await db.insert(operationLogs).values({
            action: `AI_${action}`,
            entityType: 'domain',
            entityId: domainRecord.id,
            details: detailsStr,
            status: 'success',
            createdBy: 'ai_magic',
        });

        return NextResponse.json({
            success: true,
            data: { message: `操作成功：${detailsStr}` },
        });

    } catch (error) {
        console.error('AI action execution error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : '执行失败' },
            { status: 500 }
        );
    }
}
