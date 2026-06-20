export type DNSRecordType = 'A' | 'CNAME' | 'TXT' | 'AAAA' | 'MX' | 'NS' | 'SRV' | 'SOA' | 'CAA';

export interface DNSRecordData {
  id: string;
  type: DNSRecordType;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

export interface DomainData {
  id: string;
  name: string;
  status: string;
}

export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface IDNSProvider {
  readonly name: string;
  testConnection(): Promise<OperationResult>;
  listDomains(): Promise<OperationResult<DomainData[]>>;
  listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>>;
  addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>>;
  updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>>;
  deleteRecord(domainName: string, recordId: string): Promise<OperationResult>;
}

export interface CloudflareConfig {
  apiToken?: string;
  zoneId?: string;
  apiKey?: string;
  email?: string;
}

export interface AliYunConfig {
  accessKeyId: string;
  accessKeySecret: string;
  regionId?: string;
}

export interface TencentConfig {
  secretId: string;
  secretKey: string;
  region?: string;
}

export interface DigitalOceanConfig {
  apiToken: string;
}

export interface GoDaddyConfig {
  apiKey: string;
  apiSecret: string;
  shopperId?: string;
}

export interface PorkbunConfig {
  apiKey: string;
  secretApiKey: string;
}

export interface NameSiloConfig {
  apiKey: string;
}

export interface HetznerConfig {
  apiToken: string;
}

export interface Route53Config {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface GoogleCloudDNSConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export interface HuaweiCloudDNSConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export enum ProviderType {
  CLOUDFLARE = 'cloudflare',
  ALIYUN = 'aliyun',
  TENCENT = 'tencent',
  DIGITALOCEAN = 'digitalocean',
  GODADDY = 'godaddy',
  PORKBUN = 'porkbun',
  NAMESILO = 'namesilo',
  HETZNER = 'hetzner',
  ROUTE53 = 'route53',
  GOOGLE = 'google',
  HUAWEI = 'huawei',
}

export class DNSProviderFactory {
  static create(type: ProviderType, config: unknown): IDNSProvider {
    switch (type) {
      case ProviderType.CLOUDFLARE:
        return new (require('./cloudflare').CloudflareProvider)(config as CloudflareConfig);
      case ProviderType.ALIYUN:
        return new (require('./aliyun').AliYunProvider)(config as AliYunConfig);
      case ProviderType.TENCENT:
        return new (require('./tencent').TencentProvider)(config as TencentConfig);
      case ProviderType.DIGITALOCEAN:
        return new (require('./digitalocean').DigitalOceanProvider)(config as DigitalOceanConfig);
      case ProviderType.GODADDY:
        return new (require('./godaddy').GoDaddyProvider)(config as GoDaddyConfig);
      case ProviderType.PORKBUN:
        return new (require('./porkbun').PorkbunProvider)(config as PorkbunConfig);
      case ProviderType.NAMESILO:
        return new (require('./namesilo').NameSiloProvider)(config as NameSiloConfig);
      case ProviderType.HETZNER:
        return new (require('./hetzner').HetznerProvider)(config as HetznerConfig);
      case ProviderType.ROUTE53:
        return new (require('./route53').Route53Provider)(config as Route53Config);
      case ProviderType.GOOGLE:
        return new (require('./google').GoogleCloudDNSProvider)(config as GoogleCloudDNSConfig);
      case ProviderType.HUAWEI:
        return new (require('./huawei').HuaweiCloudDNSProvider)(config as HuaweiCloudDNSConfig);
      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }
}