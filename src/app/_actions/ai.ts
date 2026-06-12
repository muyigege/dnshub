'use server';

import { db } from '@/lib/db/connection';
import { dnsProviders, domains } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { manageRecord } from './records';
import { eq } from 'drizzle-orm';
import { DNSInstruction, isDNSInstruction } from '@/lib/ai/parser';

/**
 * 执行 AI 解析的指令
 */
export async function executeAIInstruction(
  instruction: DNSInstruction,
  domainName: string
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    // 查找域名
    const [domain] = await db.select().from(domains).where(eq(domains.name, domainName));

    if (!domain) {
      return {
        success: false,
        error: `域名 ${domainName} 不存在，请先同步该域名`,
      };
    }

    // QUERY 操作特殊处理（不修改记录）
    if (instruction.action === 'QUERY') {
      return {
        success: true,
        data: {
          action: 'QUERY',
          domain: domainName,
          message: '查询指令已接收，请在域名管理页面查看记录',
        },
      };
    }

    // 执行记录操作
    const result = await manageRecord({
      action: instruction.action as 'CREATE' | 'UPDATE' | 'DELETE',
      domainId: domain.id,
      type: instruction.type,
      name: instruction.name || '@',
      content: instruction.content,
      ttl: instruction.ttl,
      priority: instruction.priority,
    });

    return result;
  } catch (error) {
    console.error('Execute AI instruction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '执行指令失败',
    };
  }
}

/**
 * 获取可用域名列表
 * 用于 AI 在需要澄清时提供上下文
 */
export async function getAvailableDomains(): Promise<{
  success: boolean;
  data?: Array<{ id: number; name: string }>;
  error?: string;
}> {
  try {
    const result = await db
      .select({
        id: domains.id,
        name: domains.name,
      })
      .from(domains)
      .orderBy(domains.name);

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Get available domains error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取域名列表失败',
    };
  }
}
