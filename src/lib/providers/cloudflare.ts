import { IDNSProvider, DNSRecordData, DomainData, OperationResult, CloudflareConfig, DNSRecordType } from './base';

/**
 * Cloudflare DNS Provider 实现
 * 支持两种认证方式：
 * 1. API Token（推荐）: apiToken
 * 2. Global API Key: apiKey + email
 */
export class CloudflareProvider implements IDNSProvider {
  readonly name = 'Cloudflare';
  private readonly useApiKey: boolean;

  constructor(private config: CloudflareConfig) {
    // 判断使用哪种认证方式
    this.useApiKey = !!(this.config.apiKey && this.config.email);

    console.log('[Cloudflare] Using authentication method:', this.useApiKey ? 'Global API Key' : 'API Token');
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.useApiKey) {
      // 使用 Global API Key 方式
      headers['X-Auth-Key'] = this.config.apiKey!;
      headers['X-Auth-Email'] = this.config.email!;
    } else {
      // 使用 API Token 方式
      headers['Authorization'] = `Bearer ${this.config.apiToken}`;
    }

    return headers;
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<OperationResult> {
    try {
      console.log('[Cloudflare] Testing connection...');

      // 统一使用 Zones 端点测试（更可靠）
      const response = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=1', {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await response.json();

      console.log('[Cloudflare] Response status:', response.status);
      console.log('[Cloudflare] Response success:', data.success);

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.errors?.[0]?.message || (this.useApiKey ? 'Invalid API Key or Email' : 'Invalid API Token'),
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[Cloudflare] Test connection error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * 获取所有域名（Zone）列表
   */
  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      let domains: DomainData[] = [];
      let page = 1;
      const perPage = 50;

      while (true) {
        const url = this.config.zoneId
          ? `https://api.cloudflare.com/client/v4/zones/${this.config.zoneId}`
          : `https://api.cloudflare.com/client/v4/zones?page=${page}&per_page=${perPage}`;

        const response = await fetch(url, {
          headers: this.getHeaders(),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          return {
            success: false,
            error: data.errors?.[0]?.message || 'Failed to fetch domains',
          };
        }

        const result = Array.isArray(data.result) ? data.result : [data.result];
        domains = domains.concat(
          result.map((zone: any) => ({
            id: zone.id,
            name: zone.name,
            status: zone.status,
          }))
        );

        // 检查是否有更多数据
        const resultInfo = data.result_info;
        if (resultInfo && resultInfo.total_pages > page) {
          page++;
        } else {
          break;
        }

        // 如果指定了特定 zoneId，直接返回
        if (this.config.zoneId) {
          break;
        }
      }

      return { success: true, data: domains };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch domains',
      };
    }
  }

  /**
   * 获取指定域名的 DNS 记录
   */
  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      // 先获取 Zone ID
      const zonesResult = await this.listDomains();
      if (!zonesResult.success || !zonesResult.data) {
        return {
          success: false,
          error: zonesResult.error || 'Failed to fetch domains',
        };
      }

      const zone = zonesResult.data.find(d => d.name === domainName);
      if (!zone) {
        return {
          success: false,
          error: `Domain ${domainName} not found`,
        };
      }

      // 获取 DNS 记录
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
        headers: this.getHeaders(),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Failed to fetch DNS records',
        };
      }

      const records: DNSRecordData[] = data.result.map((record: any) => ({
        id: record.id,
        type: record.type as DNSRecordType,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        priority: record.priority,
        proxied: record.proxied,
      }));

      return { success: true, data: records };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch DNS records',
      };
    }
  }

  /**
   * 添加 DNS 记录
   */
  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      // 获取 Zone ID
      const zonesResult = await this.listDomains();
      if (!zonesResult.success || !zonesResult.data) {
        return {
          success: false,
          error: zonesResult.error || 'Failed to fetch domains',
        };
      }

      const zone = zonesResult.data.find(d => d.name === domainName);
      if (!zone) {
        return {
          success: false,
          error: `Domain ${domainName} not found`,
        };
      }

      // 创建 DNS 记录
      const payload: any = {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 600,
      };

      // Cloudflare 特定字段
      if (record.proxied !== undefined) {
        payload.proxied = record.proxied;
      }

      if (record.type === 'MX' && record.priority) {
        payload.priority = record.priority;
      }

      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Failed to add DNS record',
        };
      }

      const newRecord: DNSRecordData = {
        id: data.result.id,
        type: data.result.type,
        name: data.result.name,
        content: data.result.content,
        ttl: data.result.ttl,
        priority: data.result.priority,
        proxied: data.result.proxied,
      };

      return { success: true, data: newRecord };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add DNS record',
      };
    }
  }

  /**
   * 更新 DNS 记录
   */
  async updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>> {
    try {
      // 获取 Zone ID
      const zonesResult = await this.listDomains();
      if (!zonesResult.success || !zonesResult.data) {
        return {
          success: false,
          error: zonesResult.error || 'Failed to fetch domains',
        };
      }

      const zone = zonesResult.data.find(d => d.name === domainName);
      if (!zone) {
        return {
          success: false,
          error: `Domain ${domainName} not found`,
        };
      }

      // 更新 DNS 记录
      const payload: any = {};
      if (record.type) payload.type = record.type;
      if (record.name) payload.name = record.name;
      if (record.content) payload.content = record.content;
      if (record.ttl) payload.ttl = record.ttl;
      if (record.proxied !== undefined) payload.proxied = record.proxied;
      if (record.type === 'MX' && record.priority) payload.priority = record.priority;

      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${recordId}`,
        {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Failed to update DNS record',
        };
      }

      const updatedRecord: DNSRecordData = {
        id: data.result.id,
        type: data.result.type,
        name: data.result.name,
        content: data.result.content,
        ttl: data.result.ttl,
        priority: data.result.priority,
        proxied: data.result.proxied,
      };

      return { success: true, data: updatedRecord };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update DNS record',
      };
    }
  }

  /**
   * 删除 DNS 记录
   */
  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      // 获取 Zone ID
      const zonesResult = await this.listDomains();
      if (!zonesResult.success || !zonesResult.data) {
        return {
          success: false,
          error: zonesResult.error || 'Failed to fetch domains',
        };
      }

      const zone = zonesResult.data.find(d => d.name === domainName);
      if (!zone) {
        return {
          success: false,
          error: `Domain ${domainName} not found`,
        };
      }

      // 删除 DNS 记录
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${recordId}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.errors?.[0]?.message || 'Failed to delete DNS record',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete DNS record',
      };
    }
  }
}
