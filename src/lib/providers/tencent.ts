import { IDNSProvider, DNSRecordData, DomainData, OperationResult, TencentConfig, DNSRecordType } from './base';

/**
 * 腾讯云 DNS Provider 实现
 */
export class TencentProvider implements IDNSProvider {
  readonly name = 'Tencent';

  private readonly region: string;
  private readonly serviceVersion = '2021-03-23';
  private readonly service = 'dnspod';

  constructor(private config: TencentConfig) {
    this.region = config.region || 'ap-guangzhou';
  }

  /**
   * 生成腾讯云 API 签名 (TC3-HMAC-SHA256)
   */
  private async generateSignature(
    httpMethod: string,
    endpoint: string,
    params: Record<string, any>,
    timestamp: number
  ): Promise<string> {
    const { secretId, secretKey } = this.config;
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10);

    // 1. 构造规范请求串
    const payload = JSON.stringify(params);
    const hashedPayload = await this.sha256Hex(payload);
    const canonicalUri = '/';
    const canonicalQuerystring = '';
    const canonicalHeaders = `content-type:application/json\nhost:${endpoint}\n`;
    const signedHeaders = 'content-type;host';
    const canonicalRequest = [
      httpMethod,
      canonicalUri,
      canonicalQuerystring,
      canonicalHeaders,
      signedHeaders,
      hashedPayload,
    ].join('\n');

    // 构造待签名字符串
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const hashedCanonicalRequest = await this.sha256Hex(canonicalRequest);
    const stringToSign = [
      'TC3-HMAC-SHA256',
      timestamp.toString(),
      credentialScope,
      hashedCanonicalRequest,
    ].join('\n');

    // 3. 计算签名
    const secretDate = await this.hmacSha256(date, secretKey);
    const secretService = await this.hmacSha256(this.service, secretDate);
    const secretSigning = await this.hmacSha256('tc3_request', secretService);
    const signatureHex = await this.hmacSha256(stringToSign, secretSigning);
    const signature = signatureHex.toString('hex');

    return signature;
  }

  /**
   * HMAC-SHA256
   */
  private async hmacSha256(data: string, key: string | Buffer): Promise<Buffer> {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  /**
   * SHA256 Hex
   */
  private async sha256Hex(data: string): Promise<string> {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 调用腾讯云 API
   */
  private async callAPI(action: string, params: Record<string, any> = {}): Promise<any> {
    const endpoint = 'dnspod.tencentcloudapi.com';
    const httpMethod = 'POST';
    const service = this.service;
    const serviceVersion = this.serviceVersion;

    const timestamp = Math.floor(Date.now() / 1000);

    const requestPayload = {
      Action: action,
      Version: this.serviceVersion,
      Region: this.region,
      Timestamp: timestamp,
      ...params,
    };

    const signature = await this.generateSignature(httpMethod, endpoint, requestPayload, timestamp);
    const date = new Date(timestamp * 1000).toISOString().substr(0, 10);
    const { secretId } = this.config;

    // 构造 Authorization 头
    const authorization = [
      `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request`,
      `SignedHeaders=content-type;host`,
      `Signature=${signature}`,
    ].join(', ');

    const response = await fetch(`https://${endpoint}`, {
      method: httpMethod,
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'Host': endpoint,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': this.region,
        'X-TC-Version': this.serviceVersion,
      },
      body: JSON.stringify(requestPayload),
    });

    return await response.json();
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<OperationResult> {
    try {
      const result = await this.callAPI('DescribeDomainList', {});
      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Connection test failed',
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
      const result = await this.callAPI('DescribeDomainList', {});

      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Failed to fetch domains',
        };
      }

      const domains: DomainData[] = (result.Response?.DomainList || []).map((domain: any) => ({
        id: domain.DomainId,
        name: domain.Name,
        status: domain.Status,
      }));

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
      const result = await this.callAPI('DescribeRecordList', {
        Domain: domainName,
        Limit: 3000,
      });

      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Failed to fetch DNS records',
        };
      }

      const records: DNSRecordData[] = (result.Response?.RecordList || []).map((record: any) => ({
        id: record.RecordId,
        type: record.Type as DNSRecordType,
        name: record.SubDomain,
        content: record.Value,
        ttl: record.TTL,
        priority: record.MX,
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
      const params: Record<string, any> = {
        Domain: domainName,
        RecordType: record.type,
        RecordLine: '默认',
        SubDomain: record.name,
        Value: record.content,
        TTL: record.ttl || 600,
      };

      if (record.type === 'MX' && record.priority) {
        params.MX = record.priority;
      }

      const result = await this.callAPI('CreateRecord', params);

      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Failed to add DNS record',
        };
      }

      const newRecord: DNSRecordData = {
        id: result.Response?.RecordId,
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

      const params: Record<string, any> = {
        Domain: domainName,
        RecordId: recordId,
        RecordType: record.type || currentRecord.type,
        RecordLine: '默认',
        SubDomain: record.name || currentRecord.name,
        Value: record.content || currentRecord.content,
        TTL: record.ttl || currentRecord.ttl,
      };

      if ((record.type || currentRecord.type) === 'MX') {
        params.MX = record.priority || currentRecord.priority;
      }

      const result = await this.callAPI('ModifyRecord', params);

      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Failed to update DNS record',
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
      const result = await this.callAPI('DeleteRecord', {
        Domain: domainName,
        RecordId: recordId,
      });

      if (result.Response?.Error) {
        return {
          success: false,
          error: result.Response.Error.Message || 'Failed to delete DNS record',
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
