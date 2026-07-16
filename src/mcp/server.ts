/**
 * Universal DNS Hub — MCP Server
 *
 * 通过 Model Context Protocol 暴露 DNS 管理能力给 AI 客户端。
 *
 * 设计原则（来自生产级改造规范）：
 * - MCP Server 不直接操作数据库，所有写操作通过 Service 层（确保审计、能力校验、补偿回退）
 * - 写操作默认 dryRun=true，必须显式 confirm=true 才真正执行
 * - 支持 idempotencyKey 幂等（同 key 的成功操作不重复执行）
 * - 所有 MCP 调用写入 operationLogs，source=mcp
 * - 最小权限：只暴露必要操作，凭证不通过 MCP 传输
 *
 * 运行方式：
 *   pnpm mcp            # stdio 模式（默认）
 *
 * 客户端配置示例（Claude Desktop / Cursor 等）：
 *   {
 *     "mcpServers": {
 *       "dns-hub": {
 *         "command": "node",
 *         "args": ["dist/mcp/server.js"],
 *         "cwd": "/path/to/universal-dns-hub"
 *       }
 *     }
 *   }
 *
 * 注意：MCP Server 进程复用本项目的 SQLite 数据库（data/local.sqlite），
 * 必须在项目根目录启动（或设置 cwd）。
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  // 只读 Service
  listProviderEntities,
  listDomainEntities,
  getDomainEntity,
  getProviderEntity,
  getProviderCapability,
  resolveProviderType,
  // 写 Service
  createRecord,
  updateRecord,
  deleteRecord,
  setProxy,
  batchMutateRecords,
  listRecords,
  getRecord,
  previewRollback,
  rollbackOperation,
  rollbackBatch,
  findDomainByName,
  getOperation,
  listOperations,
  findOperationByIdempotencyKey,
  generateBatchId,
  DnsServiceError,
  ValidationError,
  normalizeError,
  type AuditContext,
  type CreateRecordInput,
  type UpdateRecordInput,
  type BatchMutationItem,
} from '@/lib/services';

// ============================================================
// 通用辅助
// ============================================================

/** 构造 MCP 调用的审计上下文 */
function buildContext(args: { idempotencyKey?: string; clientName?: string }): AuditContext {
  return {
    source: 'mcp',
    actor: args.clientName ?? 'mcp-client',
    clientName: args.clientName,
    requestId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    idempotencyKey: args.idempotencyKey,
  };
}

/** 将任意值格式化为 MCP 工具返回的 text 内容 */
function toText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 统一错误处理：DnsServiceError 走结构化 payload，其他归一化 */
function handleError(err: unknown) {
  const e = err instanceof DnsServiceError ? err : normalizeError(err);
  return {
    content: [{ type: 'text' as const, text: toText(e.toPayload()) }],
    isError: true,
  };
}

/**
 * 幂等检查：如果 idempotencyKey 已有成功的 MCP 操作，返回已有结果。
 * 返回 null 表示未命中（应继续执行）。
 */
async function checkIdempotency(idempotencyKey: string | undefined) {
  if (!idempotencyKey) return null;
  const existing = await findOperationByIdempotencyKey(idempotencyKey, 'mcp');
  if (existing) {
    return {
      content: [{
        type: 'text' as const,
        text: toText({
          success: true,
          idempotent: true,
          message: `操作已存在（idempotencyKey=${idempotencyKey}），返回已有结果`,
          operation: existing,
        }),
      }],
      isError: false,
    };
  }
  return null;
}

// ============================================================
// 写工具通用 schema 片段
// ============================================================

const writeToolSchema = {
  dryRun: z.boolean().default(true).describe('是否只预览不执行（默认 true）。设置为 false 且 confirm=true 时才真正执行'),
  confirm: z.boolean().default(false).describe('是否确认执行（默认 false）。dryRun=false 时必须设置为 true'),
  idempotencyKey: z.string().optional().describe('幂等键。相同 key 的成功操作不会重复执行'),
  clientName: z.string().optional().describe('调用方名称（用于审计日志）'),
};

/**
 * 校验写工具的 dryRun/confirm 组合。
 * - dryRun=true：预览模式，不执行
 * - dryRun=false 且 confirm=true：执行
 * - dryRun=false 且 confirm=false：报错
 */
function resolveExecutionMode(dryRun: boolean, confirm: boolean): 'preview' | 'execute' {
  if (dryRun) return 'preview';
  if (!confirm) {
    throw new ValidationError(
      'dryRun=false 时必须设置 confirm=true 才能执行',
      'Set confirm=true to execute (dryRun=false)'
    );
  }
  return 'execute';
}

// ============================================================
// 服务器实例
// ============================================================

const server = new McpServer({
  name: 'universal-dns-hub',
  version: '1.0.0',
});

// ============================================================
// 只读工具
// ============================================================

server.tool(
  'dns_list_providers',
  '列出所有已配置的 DNS 服务商（不含凭证）',
  {},
  async () => {
    try {
      const providers = await listProviderEntities();
      const result = providers.map(p => ({
        ...p,
        capability: getProviderCapability(p.type),
      }));
      return { content: [{ type: 'text' as const, text: toText({ count: result.length, providers: result }) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_list_domains',
  '列出所有域名，可选按服务商筛选',
  {
    providerId: z.number().int().positive().optional().describe('按服务商 ID 筛选'),
    onlyActive: z.boolean().optional().default(true).describe('只返回启用的域名（默认 true）'),
  },
  async (args) => {
    try {
      const domains = await listDomainEntities({
        providerId: args.providerId,
        onlyActive: args.onlyActive,
      });
      return { content: [{ type: 'text' as const, text: toText({ count: domains.length, domains }) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_get_domain',
  '获取单个域名详情',
  {
    domainId: z.number().int().positive().describe('域名 ID'),
  },
  async (args) => {
    try {
      const domain = await getDomainEntity(args.domainId);
      const provider = await getProviderEntity(domain.providerId);
      return {
        content: [{
          type: 'text' as const,
          text: toText({ domain, provider: { id: provider.id, name: provider.name, type: provider.type } }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_list_records',
  '列出指定域名的所有 DNS 记录',
  {
    domainId: z.number().int().positive().describe('域名 ID'),
  },
  async (args) => {
    try {
      const records = await listRecords(args.domainId);
      return { content: [{ type: 'text' as const, text: toText({ count: records.length, records }) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_get_record',
  '获取单条 DNS 记录详情',
  {
    recordId: z.number().int().positive().describe('记录 ID'),
  },
  async (args) => {
    try {
      const record = await getRecord(args.recordId);
      return { content: [{ type: 'text' as const, text: toText(record) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_get_operation',
  '获取单条操作日志详情（含 before/after 快照）',
  {
    operationId: z.number().int().positive().describe('操作 ID'),
  },
  async (args) => {
    try {
      const op = await getOperation(args.operationId);
      return { content: [{ type: 'text' as const, text: toText(op) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_list_operation_logs',
  '分页查询操作日志（支持筛选）',
  {
    page: z.number().int().positive().default(1).describe('页码（默认 1）'),
    pageSize: z.number().int().positive().max(100).default(20).describe('每页条数（默认 20，最大 100）'),
    action: z.string().optional().describe('按操作类型筛选：CREATE/UPDATE/DELETE/SYNC/ROLLBACK'),
    status: z.string().optional().describe('按状态筛选：success/failed/partial/rolled_back'),
    source: z.string().optional().describe('按来源筛选：ui/rest/ai/mcp/system'),
    providerId: z.number().int().positive().optional().describe('按服务商筛选'),
    domainId: z.number().int().positive().optional().describe('按域名筛选'),
    batchId: z.string().optional().describe('按批次 ID 筛选'),
    startTime: z.string().optional().describe('起始时间（ISO 8601）'),
    endTime: z.string().optional().describe('结束时间（ISO 8601）'),
  },
  async (args) => {
    try {
      const result = await listOperations(
        {
          action: args.action,
          status: args.status,
          source: args.source,
          providerId: args.providerId,
          domainId: args.domainId,
          batchId: args.batchId,
          startTime: args.startTime,
          endTime: args.endTime,
        },
        args.page,
        args.pageSize
      );
      return { content: [{ type: 'text' as const, text: toText(result) }] };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_preview_changes',
  '预览变更效果（不执行）。支持 create/update/delete 三种预览',
  {
    action: z.enum(['create', 'update', 'delete']).describe('要预览的操作类型'),
    domainId: z.number().int().positive().describe('域名 ID'),
    // create 参数
    type: z.string().optional().describe('记录类型（create 必填）'),
    name: z.string().optional().describe('记录名称（create/update 必填）'),
    content: z.string().optional().describe('记录内容（create/update 必填）'),
    ttl: z.number().int().positive().optional().describe('TTL 秒数'),
    priority: z.number().int().optional().describe('MX 优先级'),
    proxied: z.boolean().optional().describe('Cloudflare 代理状态'),
    // update/delete 参数
    recordId: z.number().int().positive().optional().describe('记录 ID（update/delete 必填）'),
  },
  async (args) => {
    try {
      const domain = await getDomainEntity(args.domainId);
      const provider = await getProviderEntity(domain.providerId);
      const capability = getProviderCapability(provider.type);

      let before: unknown = null;
      let after: unknown = null;
      let warnings: string[] = [];

      if (args.action === 'create') {
        if (!args.type || !args.name || !args.content) {
          throw new ValidationError('create 预览需要 type、name、content', 'create preview requires type, name, content');
        }
        after = {
          type: args.type.toUpperCase(),
          name: args.name,
          content: args.content,
          ttl: args.ttl ?? 600,
          priority: args.priority ?? null,
          proxied: args.proxied ?? null,
        };
        if (args.proxied && !capability.supportsProxy) {
          warnings.push(`服务商 ${provider.name} 不支持代理状态（proxied）`);
        }
      } else if (args.action === 'update') {
        if (!args.recordId) {
          throw new ValidationError('update 预览需要 recordId', 'update preview requires recordId');
        }
        const record = await getRecord(args.recordId);
        before = record;
        after = {
          ...record,
          ...(args.type && { type: args.type.toUpperCase() }),
          ...(args.name && { name: args.name }),
          ...(args.content && { content: args.content }),
          ...(args.ttl && { ttl: args.ttl }),
          ...(args.priority !== undefined && { priority: args.priority }),
          ...(args.proxied !== undefined && { proxied: args.proxied }),
        };
      } else {
        // delete
        if (!args.recordId) {
          throw new ValidationError('delete 预览需要 recordId', 'delete preview requires recordId');
        }
        before = await getRecord(args.recordId);
        after = null;
      }

      return {
        content: [{
          type: 'text' as const,
          text: toText({
            preview: true,
            action: args.action,
            domain: { id: domain.id, name: domain.name },
            provider: { id: provider.id, name: provider.name, type: provider.type },
            capability,
            before,
            after,
            warnings,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：Create
// ============================================================

server.tool(
  'dns_create_record',
  '创建 DNS 记录。默认 dryRun=true 只预览，需设置 dryRun=false 且 confirm=true 才执行',
  {
    domainId: z.number().int().positive().describe('域名 ID'),
    type: z.string().describe('记录类型：A/AAAA/CNAME/TXT/MX/NS/SRV/CAA'),
    name: z.string().describe('记录名称（如 @、www、子域名）'),
    content: z.string().describe('记录值（如 IP 地址、CNAME 目标）'),
    ttl: z.number().int().positive().optional().describe('TTL 秒数（默认 600）'),
    priority: z.number().int().optional().describe('MX 优先级'),
    proxied: z.boolean().optional().describe('Cloudflare 代理状态（仅 A/AAAA/CNAME 且服务商支持时生效）'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      // 幂等检查（仅执行模式）
      if (mode === 'execute') {
        const idempotent = await checkIdempotency(args.idempotencyKey);
        if (idempotent) return idempotent;
      }

      const input: CreateRecordInput = {
        domainId: args.domainId,
        type: args.type,
        name: args.name,
        content: args.content,
        ttl: args.ttl,
        priority: args.priority ?? null,
        proxied: args.proxied,
      };

      if (mode === 'preview') {
        // 预览：不执行，返回预期
        const domain = await getDomainEntity(args.domainId);
        const provider = await getProviderEntity(domain.providerId);
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行',
              action: 'CREATE',
              domain: { id: domain.id, name: domain.name },
              provider: { id: provider.id, name: provider.name },
              input,
              capability: getProviderCapability(provider.type),
            }),
          }],
        };
      }

      // 执行
      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await createRecord(input, context);
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: true,
            message: '记录创建成功',
            record: result.record,
            operationId: result.operationId,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：Update
// ============================================================

server.tool(
  'dns_update_record',
  '更新 DNS 记录。默认 dryRun=true 只预览，需设置 dryRun=false 且 confirm=true 才执行',
  {
    recordId: z.number().int().positive().describe('要更新的记录 ID'),
    type: z.string().optional().describe('新记录类型'),
    name: z.string().optional().describe('新记录名称'),
    content: z.string().optional().describe('新记录值'),
    ttl: z.number().int().positive().optional().describe('新 TTL'),
    priority: z.number().int().optional().describe('新 MX 优先级'),
    proxied: z.boolean().optional().describe('新 Cloudflare 代理状态'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'execute') {
        const idempotent = await checkIdempotency(args.idempotencyKey);
        if (idempotent) return idempotent;
      }

      const before = await getRecord(args.recordId);
      const changes: UpdateRecordInput = {};
      if (args.type !== undefined) changes.type = args.type;
      if (args.name !== undefined) changes.name = args.name;
      if (args.content !== undefined) changes.content = args.content;
      if (args.ttl !== undefined) changes.ttl = args.ttl;
      if (args.priority !== undefined) changes.priority = args.priority;
      if (args.proxied !== undefined) changes.proxied = args.proxied;

      if (mode === 'preview') {
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行',
              action: 'UPDATE',
              recordId: args.recordId,
              before,
              changes,
            }),
          }],
        };
      }

      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await updateRecord(args.recordId, changes, context);
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: true,
            message: '记录更新成功',
            before: result.before,
            after: result.record,
            operationId: result.operationId,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：Delete
// ============================================================

server.tool(
  'dns_delete_record',
  '删除 DNS 记录。默认 dryRun=true 只预览，需设置 dryRun=false 且 confirm=true 才执行',
  {
    recordId: z.number().int().positive().describe('要删除的记录 ID'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'execute') {
        const idempotent = await checkIdempotency(args.idempotencyKey);
        if (idempotent) return idempotent;
      }

      const before = await getRecord(args.recordId);

      if (mode === 'preview') {
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行',
              action: 'DELETE',
              recordId: args.recordId,
              before,
            }),
          }],
        };
      }

      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await deleteRecord(args.recordId, context);
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: true,
            message: '记录删除成功',
            before: result.before,
            operationId: result.operationId,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：批量变更
// ============================================================

server.tool(
  'dns_batch_mutate_records',
  '批量变更 DNS 记录（create/update/delete 混合）。默认 dryRun=true，需 dryRun=false 且 confirm=true 执行',
  {
    items: z.array(z.union([
      z.object({
        action: z.literal('create'),
        input: z.object({
          domainId: z.number().int().positive(),
          type: z.string(),
          name: z.string(),
          content: z.string(),
          ttl: z.number().int().positive().optional(),
          priority: z.number().int().optional(),
          proxied: z.boolean().optional(),
        }),
      }),
      z.object({
        action: z.literal('update'),
        recordId: z.number().int().positive(),
        changes: z.object({
          type: z.string().optional(),
          name: z.string().optional(),
          content: z.string().optional(),
          ttl: z.number().int().positive().optional(),
          priority: z.number().int().optional(),
          proxied: z.boolean().optional(),
        }),
      }),
      z.object({
        action: z.literal('delete'),
        recordId: z.number().int().positive(),
      }),
    ])).min(1).describe('批量操作项列表'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'preview') {
        // 预览：展示每项操作的 before/预期 after
        const previews = [];
        for (const item of args.items) {
          if (item.action === 'create') {
            previews.push({ action: 'create', input: item.input });
          } else if (item.action === 'update') {
            const before = await getRecord(item.recordId);
            previews.push({ action: 'update', recordId: item.recordId, before, changes: item.changes });
          } else {
            const before = await getRecord(item.recordId);
            previews.push({ action: 'delete', recordId: item.recordId, before });
          }
        }
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行',
              count: args.items.length,
              items: previews,
            }),
          }],
        };
      }

      // 执行：批量操作不支持单条幂等（因为包含多个子操作），但用 batchId 关联
      const batchId = generateBatchId();
      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      context.batchId = batchId;

      const items: BatchMutationItem[] = args.items.map(item => {
        if (item.action === 'create') {
          return { action: 'create' as const, input: item.input };
        } else if (item.action === 'update') {
          return { action: 'update' as const, recordId: item.recordId, changes: item.changes };
        } else {
          return { action: 'delete' as const, recordId: item.recordId };
        }
      });

      const result = await batchMutateRecords(items, context);
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: result.status === 'success',
            message: `批量操作完成：成功 ${result.totalSuccess}，失败 ${result.totalFailed}`,
            batchId,
            status: result.status,
            results: result.results,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：Cloudflare 代理状态切换
// ============================================================

server.tool(
  'cloudflare_set_proxy',
  '切换 Cloudflare 记录的代理状态（proxied）。仅对 A/AAAA/CNAME 且服务商支持时生效',
  {
    recordId: z.number().int().positive().describe('记录 ID'),
    proxied: z.boolean().describe('是否开启代理'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'execute') {
        const idempotent = await checkIdempotency(args.idempotencyKey);
        if (idempotent) return idempotent;
      }

      const before = await getRecord(args.recordId);

      if (mode === 'preview') {
        const domain = await getDomainEntity(before.domainId);
        const provider = await getProviderEntity(domain.providerId);
        const capability = getProviderCapability(provider.type);
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行',
              action: 'SET_PROXY',
              recordId: args.recordId,
              before,
              target: { proxied: args.proxied },
              capability,
              warnings: !capability.supportsProxy
                ? [`服务商 ${provider.name} 不支持代理状态`]
                : !['A', 'AAAA', 'CNAME'].includes(before.type.toUpperCase())
                  ? [`记录类型 ${before.type} 不支持代理`]
                  : [],
            }),
          }],
        };
      }

      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await setProxy(args.recordId, args.proxied, context);
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: true,
            message: args.proxied ? '已开启 Cloudflare 代理' : '已关闭 Cloudflare 代理',
            before: result.before,
            after: result.record,
            operationId: result.operationId,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 写工具：回退
// ============================================================

server.tool(
  'dns_rollback_operation',
  '回退一条已成功的操作（补偿式）。默认 dryRun=true 预览，需 dryRun=false 且 confirm=true 执行',
  {
    operationId: z.number().int().positive().describe('要回退的操作 ID'),
    force: z.boolean().default(false).describe('是否强制回退（忽略并发冲突检测）'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'preview') {
        const plan = await previewRollback(args.operationId, { force: args.force });
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行回退',
              plan,
            }),
          }],
        };
      }

      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await rollbackOperation(args.operationId, context, { confirm: true, force: args.force });
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: result.status === 'success',
            message: result.message,
            operationId: result.operationId,
            rollbackOperationId: result.rollbackOperationId,
            status: result.status,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

server.tool(
  'dns_rollback_batch',
  '批量回退一个批次内的所有操作（按逆序）。需 dryRun=false 且 confirm=true 执行',
  {
    batchId: z.string().describe('要回退的批次 ID'),
    force: z.boolean().default(false).describe('是否强制回退'),
    ...writeToolSchema,
  },
  async (args) => {
    try {
      const mode = resolveExecutionMode(args.dryRun, args.confirm);

      if (mode === 'preview') {
        // 预览：列出批次内所有操作
        const ops = await listOperations({ batchId: args.batchId, status: 'success' }, 1, 100);
        const plans = [];
        for (const op of ops.data) {
          try {
            const plan = await previewRollback(op.id, { force: args.force });
            plans.push(plan);
          } catch {
            // 跳过无法预览的
          }
        }
        return {
          content: [{
            type: 'text' as const,
            text: toText({
              preview: true,
              message: '预览模式：设置 dryRun=false 且 confirm=true 以执行批量回退',
              batchId: args.batchId,
              totalOperations: ops.pagination.total,
              plans,
            }),
          }],
        };
      }

      const context = buildContext({ idempotencyKey: args.idempotencyKey, clientName: args.clientName });
      const result = await rollbackBatch(args.batchId, context, { confirm: true, force: args.force });
      return {
        content: [{
          type: 'text' as const,
          text: toText({
            success: result.status === 'success',
            message: `批量回退完成：成功 ${result.totalSuccess}，失败 ${result.totalFailed}`,
            batchId: result.batchId,
            status: result.status,
            results: result.results,
          }),
        }],
      };
    } catch (err) {
      return handleError(err);
    }
  }
);

// ============================================================
// 资源（Resources）
// ============================================================

server.resource(
  'providers',
  'dns://providers',
  { description: '所有 DNS 服务商列表' },
  async () => {
    const providers = await listProviderEntities();
    return {
      contents: [{
        uri: 'dns://providers',
        text: toText(providers),
      }],
    };
  }
);

server.resource(
  'domains',
  'dns://domains',
  { description: '所有域名列表' },
  async () => {
    const domains = await listDomainEntities();
    return {
      contents: [{
        uri: 'dns://domains',
        text: toText(domains),
      }],
    };
  }
);

// ============================================================
// 启动
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 注意：stdio 模式下不要用 console.log，会污染 MCP 通信通道
  // 错误日志走 stderr
  process.stderr.write('[MCP] Universal DNS Hub server started (stdio)\n');
}

main().catch(err => {
  process.stderr.write(`[MCP] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
