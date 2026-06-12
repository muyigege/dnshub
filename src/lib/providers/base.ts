/**
 * DNS 记录类型
 */
export type DNSRecordType = 'A' | 'CNAME' | 'TXT' | 'AAAA' | 'MX' | 'NS' | 'SRV' | 'SOA';

/**
 * DNS 记录数据
 */
export interface DNSRecordData {
  id: string;
  type: DNSRecordType;
  name: string; // @, www, api, etc.
  content: string; // IP address, domain name, etc.
  ttl?: number;
  priority?: number; // for MX records
  proxied?: boolean; // Cloudflare specific
}

/**
 * 域名数据
 */
export interface DomainData {
  id: string;
  name: string;
  status: string;
}

/**
 * DNS 操作结果
 */
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * DNS Provider 基础接口
 * 所有 DNS 服务商必须实现此接口
 */
export interface IDNSProvider {
  /**
   * 提供商名称
   */
  readonly name: string;

  /**
   * 测试连接
   */
  testConnection(): Promise<OperationResult>;

  /**
   * 获取所有域名列表
   */
  listDomains(): Promise<OperationResult<DomainData[]>>;

  /**
   * 获取指定域名的所有 DNS 记录
   */
  listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>>;

  /**
   * 添加 DNS 记录
   */
  addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>>;

  /**
   * 更新 DNS 记录
   */
  updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>>;

  /**
   * 删除 DNS 记录
   */
  deleteRecord(domainName: string, recordId: string): Promise<OperationResult>;
}

/**
 * Cloudflare 特定配置
 */
export interface CloudflareConfig {
  // API Token 方式（推荐）
  apiToken?: string;
  zoneId?: string; // 可选，用于指定特定 Zone

  // Global API Key 方式（不推荐，但兼容）
  apiKey?: string;
  email?: string;
}

/**
 * 阿里云特定配置
 */
export interface AliYunConfig {
  accessKeyId: string;
  accessKeySecret: string;
  regionId?: string; // 默认为 "cn-hangzhou"
}

/**
 * 腾讯云特定配置
 */
export interface TencentConfig {
  secretId: string;
  secretKey: string;
  region?: string; // 默认为 "ap-guangzhou"
}

/**
 * DNS Provider 类型
 */
export enum ProviderType {
  CLOUDFLARE = 'cloudflare',
  ALIYUN = 'aliyun',
  TENCENT = 'tencent',
}

/**
 * 创建 DNS Provider 工厂
 */
export class DNSProviderFactory {
  /**
   * 根据类型和配置创建对应的 DNS Provider 实例
   */
  static create(type: ProviderType, config: unknown): IDNSProvider {
    switch (type) {
      case ProviderType.CLOUDFLARE:
        // 动态导入 Cloudflare provider
        return new (require('./cloudflare').CloudflareProvider)(config as CloudflareConfig);
      case ProviderType.ALIYUN:
        // 动态导入 AliYun provider
        return new (require('./aliyun').AliYunProvider)(config as AliYunConfig);
      case ProviderType.TENCENT:
        // 动态导入 Tencent provider
        return new (require('./tencent').TencentProvider)(config as TencentConfig);
      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }
}
