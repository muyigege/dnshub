import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

/**
 * AI 配置表
 * 存储用于解析自然语言指令的 AI 模型配置
 */
export const aiConfigurations = sqliteTable("ai_configurations", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  name: text("name").notNull(),
  providerType: text("provider_type").default('custom').notNull(),
  apiUrl: text("api_url").notNull(),
  modelId: text("model_id").notNull(),
  apiKey: text("api_key").notNull(),
  isActive: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

/**
 * 操作日志表
 * 记录所有 DNS 操作历史（含批量、回退、快照、来源等扩展字段）
 *
 * 字段设计原则：
 * - batchId / parentOperationId：支持批量操作和子操作关联
 * - source：区分 ui / rest / ai / mcp / system
 * - beforeSnapshot / afterSnapshot：用于 diff 展示和补偿回退
 * - status：支持 pending / running / success / failed / partial / rolled_back / rollback_failed
 * - rollbackOf / rolledBackAt：回退关系链
 * - requestId / idempotencyKey：用于 MCP 和 API 幂等
 * - actor / clientName：操作发起方（不记录密钥）
 *
 * 敏感数据脱敏由 AuditLogger 负责，凭证/API Key 不得写入任何字段。
 */
export const operationLogs = sqliteTable("operation_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  // 原有字段（保持向后兼容）
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),

  // 批量与父子关系
  batchId: text("batch_id"),
  parentOperationId: integer("parent_operation_id"),

  // 来源与幂等
  source: text("source").default('system').notNull(),
  actor: text("actor"),
  clientName: text("client_name"),
  requestId: text("request_id"),
  idempotencyKey: text("idempotency_key"),

  // 关联实体
  providerId: integer("provider_id"),
  domainId: integer("domain_id"),
  recordId: integer("record_id"),

  // 快照（JSON 字符串，脱敏后存储）
  beforeSnapshot: text("before_snapshot"),
  requestedSnapshot: text("requested_snapshot"),
  afterSnapshot: text("after_snapshot"),

  // 状态与时间
  startedAt: text("started_at"),
  completedAt: text("completed_at"),

  // 回退关系
  rollbackOf: integer("rollback_of"),
  rolledBackAt: text("rolled_back_at"),

  // 错误码（标准化）
  errorCode: text("error_code"),
});

/**
 * DNS 服务商表
 * 存储不同云服务商的凭证信息（加密存储）
 */
export const dnsProviders = sqliteTable("dns_providers", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  credentials: text("credentials").notNull(),
  isActive: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

/**
 * 域名表
 * 存储从各个服务商同步的域名列表
 */
export const domains = sqliteTable("domains", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  providerId: integer("provider_id").references(() => dnsProviders.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

/**
 * DNS 记录表
 * 存储域名的 DNS 记录信息
 */
export const dnsRecords = sqliteTable("dns_records", {
  id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  ttl: integer("ttl").default(600).notNull(),
  priority: integer("priority"),
  providerRecordId: text("provider_record_id"),
  isActive: integer("is_active", { mode: 'boolean' }).default(true).notNull(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
  updatedAt: text("updated_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

// 导出类型
export type DNSProvider = typeof dnsProviders.$inferSelect;
export type NewDNSProvider = typeof dnsProviders.$inferInsert;

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;

export type DNSRecord = typeof dnsRecords.$inferSelect;
export type NewDNSRecord = typeof dnsRecords.$inferInsert;

export type AIConfiguration = typeof aiConfigurations.$inferSelect;
export type NewAIConfiguration = typeof aiConfigurations.$inferInsert;

export type OperationLog = typeof operationLogs.$inferSelect;
export type NewOperationLog = typeof operationLogs.$inferInsert;
