import { IDNSProvider, DNSRecordData, DomainData, OperationResult, AliYunConfig, DNSRecordType } from './base';

/**
 * 阿里云 DNS Provider 实现
 */
export class AliYunProvider implements IDNSProvider {
  readonly name = 'AliYun';

  constructor(private config: AliYunConfig) {
    // 设置默认区域
    if (!config.regionId) {
      this.config.regionId = 'cn-hangzhou';
    }
  }

  /**
   * 生成阿里云 API 签名
   */
  private generateSignature(params: Record<string, string>, timestamp: string): string {
    const { accessKeyId, accessKeySecret } = this.config;

    // 排序参数
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // 构造签名字符串
    const stringToSign = `GET&%2F&${encodeURIComponent(sortedParams)}`;

    // 使用 HMAC-SHA1 生成签名
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha1', `${accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64');

    return signature;
  }

  /**
   * 调用阿里云 API
   */
  private async callAPI(action: string, params: Record<string, string> = {}): Promise<any> {
    const timestamp = new Date().toISOString();
    const nonce = Math.random().toString(36).substring(2);

    const requestParams = {
      Format: 'JSON',
      Version: '2015-01-09',
      AccessKeyId: this.config.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: nonce,
      Timestamp: timestamp,
      Action: action,
      ...params,
    };

    const signature = this.generateSignature(requestParams, timestamp);

    const url = `https://alidns.aliyuncs.com/?${Object.entries(requestParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&')}&Signature=${encodeURIComponent(signature)}`;

    const response = await fetch(url);
    return await response.json();
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<OperationResult> {
    try {
      const result = await this.callAPI('DescribeDomains');
      if (result.Code) {
        return {
          success: false,
          error: result.Message || 'Connection test failed',
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * 获取所有域名列表
   */
  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      let domains: DomainData[] = [];
      let pageNumber = 1;
      const pageSize = 50;

      while (true) {
        const result = await this.callAPI('DescribeDomains', {
          PageNumber: pageNumber.toString(),
          PageSize: pageSize.toString(),
        });

        if (result.Code) {
          return {
            success: false,
            error: result.Message || 'Failed to fetch domains',
          };
        }

        const pageDomains = (result.Domains?.Domain || []).map((domain: any) => ({
          id: domain.DomainId,
          name: domain.DomainName,
          status: domain.Status,
        }));

        domains = domains.concat(pageDomains);

        // 检查是否有更多数据
        const totalItems = result.TotalCount || 0;
        if (domains.length >= totalItems || pageDomains.length === 0) {
          break;
        }

        pageNumber++;
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
      // 先获取域名 ID
      const domainsResult = await this.listDomains();
      if (!domainsResult.success || !domainsResult.data) {
        return {
          success: false,
          error: domainsResult.error || 'Failed to fetch domains',
        };
      }

      const domain = domainsResult.data.find(d => d.name === domainName);
      if (!domain) {
        return {
          success: false,
          error: `Domain ${domainName} not found`,
        };
      }

      // 获取 DNS 记录
      const result = await this.callAPI('DescribeDomainRecords', {
        DomainName: domainName,
        PageSize: '500',
      });

      if (result.Code) {
        return {
          success: false,
          error: result.Message || 'Failed to fetch DNS records',
        };
      }

      const records: DNSRecordData[] = (result.DomainRecords?.Record || []).map((record: any) => ({
        id: record.RecordId,
        type: record.Type as DNSRecordType,
        name: record.RR,
        content: record.Value,
        ttl: record.TTL,
        priority: record.Priority,
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
      const params: Record<string, string> = {
        DomainName: domainName,
        RR: record.name,
        Type: record.type,
        Value: record.content,
        TTL: (record.ttl || 600).toString(),
      };

      if (record.type === 'MX' && record.priority) {
        params.Priority = record.priority.toString();
      }

      const result = await this.callAPI('AddDomainRecord', params);

      if (result.Code) {
        return {
          success: false,
          error: result.Message || 'Failed to add DNS record',
        };
      }

      const newRecord: DNSRecordData = {
        id: result.RecordId,
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 600,
        priority: record.priority,
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
      // 先获取当前记录
      const recordsResult = await this.listRecords(domainName);
      if (!recordsResult.success || !recordsResult.data) {
        return {
          success: false,
          error: recordsResult.error || 'Failed to fetch records',
        };
      }

      const currentRecord = recordsResult.data.find(r => r.id === recordId);
      if (!currentRecord) {
        return {
          success: false,
          error: `Record ${recordId} not found`,
        };
      }

      const params: Record<string, string> = {
        RecordId: recordId,
        RR: record.name || currentRecord.name,
        Type: record.type || currentRecord.type,
        Value: record.content || currentRecord.content,
        TTL: (record.ttl || currentRecord.ttl || 600).toString(),
      };

      if ((record.type || currentRecord.type) === 'MX') {
        const priority = record.priority || currentRecord.priority || 10;
        params.Priority = priority.toString();
      }

      const result = await this.callAPI('UpdateDomainRecord', params);

      if (result.Code) {
        return {
          success: false,
          error: result.Message || 'Failed to update DNS record',
        };
      }

      const updatedRecord: DNSRecordData = {
        ...currentRecord,
        ...record,
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
      const result = await this.callAPI('DeleteDomainRecord', {
        RecordId: recordId,
      });

      if (result.Code) {
        return {
          success: false,
          error: result.Message || 'Failed to delete DNS record',
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
