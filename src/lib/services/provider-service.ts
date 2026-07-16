/**
 * ProviderService
 *
 * 封装"加载 domain → 加载 provider → 解密凭证 → 实例化 Provider"4 步模板。
 * 当前这 4 步在 9 处重复，是重复代码的最大来源。
 *
 * 同时提供 Provider 能力元数据（supportsProxy、supportsPriority、supportedRecordTypes）。
 */

import { db } from '@/lib/db/connection';
import { dnsProviders, domains, dnsRecords } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { decryptJSON } from '@/lib/encryption';
import {
  DNSProviderFactory,
  IDNSProvider,
  ProviderType,
  DNSRecordType,
} from '@/lib/providers/base';
import {
  NotFoundError,
  ProviderAuthError,
  ValidationError,
  DnsServiceError,
} from './errors';

export interface ProviderEntity {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DomainEntity {
  id: number;
  providerId: number;
  name: string;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCapability {
  /** 是否支持 Cloudflare 风格的 proxied 代理状态 */
  supportsProxy: boolean;
  /** 是否支持 MX 优先级 */
  supportsPriority: boolean;
  /** 是否支持批量操作（部分服务商有原生批量 API） */
  supportsBatch: boolean;
  /** 支持的记录类型 */
  supportedRecordTypes: DNSRecordType[];
}

/**
 * 将字符串类型转换为 ProviderType 枚举。
 * 兼容大小写和枚举值两种形式。
 */
export function resolveProviderType(typeStr: string): ProviderType {
  // 先按枚举值匹配（小写）
  const lower = typeStr.toLowerCase();
  for (const key of Object.keys(ProviderType)) {
    const value = ProviderType[key as keyof typeof ProviderType];
    if (value === lower) return value;
  }
  // 再按枚举 key 匹配（大写）
  const upper = typeStr.toUpperCase();
  if (upper in ProviderType) {
    return ProviderType[upper as keyof typeof ProviderType];
  }
  throw new ValidationError(
    `不支持的服务商类型: ${typeStr}`,
    `Unsupported provider type: ${typeStr}`
  );
}

/**
 * 根据 ID 加载服务商记录
 */
export async function getProviderEntity(providerId: number): Promise<ProviderEntity> {
  const rows = await db
    .select()
    .from(dnsProviders)
    .where(eq(dnsProviders.id, providerId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError(
      `服务商 ID ${providerId} 不存在`,
      `Provider ${providerId} not found`
    );
  }

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 根据 ID 加载域名记录
 */
export async function getDomainEntity(domainId: number): Promise<DomainEntity> {
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError(
      `域名 ID ${domainId} 不存在`,
      `Domain ${domainId} not found`
    );
  }

  const row = rows[0];
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 根据域名名称查找域名记录（支持精确匹配 + 父域名回退）
 *
 * 逻辑（沿用自原 ai/execute/route.ts）：
 * 1. 精确匹配域名
 * 2. 如果未找到，尝试用子域名推断父域名
 * 3. 多个匹配时返回最近更新的一个
 */
export async function findDomainByName(domainName: string): Promise<DomainEntity | null> {
  // 精确匹配
  const exact = await db
    .select()
    .from(domains)
    .where(and(eq(domains.name, domainName), eq(domains.isActive, true)))
    .limit(1);
  if (exact.length > 0) {
    return mapDomainRow(exact[0]);
  }

  // 父域名回退：domainName 是子域名，找它的父域名
  const parts = domainName.split('.');
  if (parts.length > 2) {
    // 尝试最后两段作为父域名（example.com）
    const parentName = parts.slice(-2).join('.');
    const parent = await db
      .select()
      .from(domains)
      .where(and(eq(domains.name, parentName), eq(domains.isActive, true)))
      .limit(1);
    if (parent.length > 0) {
      return mapDomainRow(parent[0]);
    }
    // 尝试最后三段（如 co.uk 类域名）
    if (parts.length > 3) {
      const parentName3 = parts.slice(-3).join('.');
      const parent3 = await db
        .select()
        .from(domains)
        .where(and(eq(domains.name, parentName3), eq(domains.isActive, true)))
        .limit(1);
      if (parent3.length > 0) {
        return mapDomainRow(parent3[0]);
      }
    }
  }

  return null;
}

function mapDomainRow(row: typeof domains.$inferSelect): DomainEntity {
  return {
    id: row.id,
    providerId: row.providerId,
    name: row.name,
    isActive: row.isActive,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 实例化 Provider。
 * 内部处理：加载服务商记录 → 解密凭证 → DNSProviderFactory.create。
 */
export async function createProviderInstance(providerId: number): Promise<{
  provider: IDNSProvider;
  entity: ProviderEntity;
}> {
  const entity = await getProviderEntity(providerId);

  if (!entity.isActive) {
    throw new ValidationError(
      `服务商 ${entity.name} 已被禁用`,
      `Provider ${entity.name} is disabled`
    );
  }

  // 加载凭证密文
  const rows = await db
    .select({ credentials: dnsProviders.credentials })
    .from(dnsProviders)
    .where(eq(dnsProviders.id, providerId))
    .limit(1);

  const credentialsCipher = rows[0]?.credentials;
  if (!credentialsCipher) {
    throw new ProviderAuthError(
      `服务商 ${entity.name} 凭证为空`,
      `Provider ${entity.name} has empty credentials`
    );
  }

  let credentials: unknown;
  try {
    credentials = decryptJSON(credentialsCipher);
  } catch (err) {
    throw new ProviderAuthError(
      `服务商 ${entity.name} 凭证解密失败，请重新填写`,
      `Provider ${entity.name} credentials decryption failed, please re-enter`,
      err instanceof Error ? err.message : String(err)
    );
  }

  const providerType = resolveProviderType(entity.type);
  const provider = DNSProviderFactory.create(providerType, credentials);

  return { provider, entity };
}

/**
 * 根据 domainId 实例化 Provider（自动找到对应的 providerId）。
 */
export async function createProviderInstanceForDomain(domainId: number): Promise<{
  provider: IDNSProvider;
  domain: DomainEntity;
  providerEntity: ProviderEntity;
}> {
  const domain = await getDomainEntity(domainId);
  const { provider, entity } = await createProviderInstance(domain.providerId);
  return { provider, domain, providerEntity: entity };
}

/**
 * 根据 domainName 实例化 Provider（用于 AI 解析等场景）。
 */
export async function createProviderInstanceForDomainName(domainName: string): Promise<{
  provider: IDNSProvider;
  domain: DomainEntity;
  providerEntity: ProviderEntity;
}> {
  const domain = await findDomainByName(domainName);
  if (!domain) {
    throw new NotFoundError(
      `未找到域名 ${domainName}，请先在域名管理中添加`,
      `Domain ${domainName} not found, please add it in domain management first`
    );
  }
  const { provider, entity } = await createProviderInstance(domain.providerId);
  return { provider, domain, providerEntity: entity };
}

/**
 * 获取 Provider 能力元数据。
 *
 * 目前基于 provider type 静态推断，后续可扩展为动态查询。
 */
export function getProviderCapability(providerType: ProviderType | string): ProviderCapability {
  const type = typeof providerType === 'string' ? resolveProviderType(providerType) : providerType;

  const commonRecordTypes: DNSRecordType[] = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV'];

  switch (type) {
    case ProviderType.CLOUDFLARE:
      return {
        supportsProxy: true,
        supportsPriority: true,
        supportsBatch: false,
        supportedRecordTypes: [...commonRecordTypes, 'SOA', 'CAA'],
      };
    case ProviderType.ALIYUN:
    case ProviderType.TENCENT:
    case ProviderType.HUAWEI:
    case ProviderType.GOOGLE:
    case ProviderType.ROUTE53:
    case ProviderType.HETZNER:
    case ProviderType.DIGITALOCEAN:
    case ProviderType.GODADDY:
    case ProviderType.PORKBUN:
    case ProviderType.NAMESILO:
      return {
        supportsProxy: false,
        supportsPriority: true,
        supportsBatch: false,
        supportedRecordTypes: commonRecordTypes,
      };
    default:
      return {
        supportsProxy: false,
        supportsPriority: true,
        supportsBatch: false,
        supportedRecordTypes: commonRecordTypes,
      };
  }
}

/**
 * 根据 recordId 加载本地记录
 */
export async function getRecordEntity(recordId: number) {
  const rows = await db
    .select()
    .from(dnsRecords)
    .where(eq(dnsRecords.id, recordId))
    .limit(1);

  if (rows.length === 0) {
    throw new NotFoundError(
      `DNS 记录 ID ${recordId} 不存在`,
      `DNS record ${recordId} not found`
    );
  }

  return rows[0];
}
