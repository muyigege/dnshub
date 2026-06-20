import crypto from 'crypto';
import { DNSRecordData, DNSRecordType, DomainData, IDNSProvider, OperationResult, TencentConfig } from './base';
import { fail, ok, ttlOrDefault } from './utils';

export class TencentProvider implements IDNSProvider {
  readonly name = 'Tencent Cloud DNSPod';
  private readonly endpoint = 'dnspod.tencentcloudapi.com';
  private readonly serviceVersion = '2021-03-23';
  private readonly service = 'dnspod';
  private readonly region: string;

  constructor(private config: TencentConfig) {
    this.region = config.region || 'ap-guangzhou';
  }

  private sha256Hex(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private hmac(value: string, key: string | Buffer) {
    return crypto.createHmac('sha256', key).update(value).digest();
  }

  private async callAPI(action: string, params: Record<string, any> = {}) {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const payload = JSON.stringify(params);
    const hashedPayload = this.sha256Hex(payload);
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${this.endpoint}\n`;
    const signedHeaders = 'content-type;host';
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, hashedPayload].join('\n');
    const credentialScope = `${date}/${this.service}/tc3_request`;
    const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, this.sha256Hex(canonicalRequest)].join('\n');
    const secretDate = this.hmac(date, `TC3${this.config.secretKey}`);
    const secretService = this.hmac(this.service, secretDate);
    const secretSigning = this.hmac('tc3_request', secretService);
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    const authorization = `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${this.endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: this.endpoint,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': this.serviceVersion,
        'X-TC-Region': this.region,
      },
      body: payload,
    });
    const data = await response.json();
    if (!response.ok || data.Response?.Error) {
      throw new Error(data.Response?.Error?.Message || `Tencent Cloud API error ${response.status}`);
    }
    return data.Response;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.callAPI('DescribeDomainList', { Limit: 1 });
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const domains: DomainData[] = [];
      let offset = 0;
      const limit = 100;
      while (true) {
        const result = await this.callAPI('DescribeDomainList', { Offset: offset, Limit: limit });
        const pageDomains = (result.DomainList || []).map((domain: any) => ({
          id: String(domain.DomainId || domain.Name),
          name: domain.Name,
          status: domain.Status || 'active',
        }));
        domains.push(...pageDomains);
        if (pageDomains.length < limit) break;
        offset += limit;
      }
      return ok(domains);
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const result = await this.callAPI('DescribeRecordList', { Domain: domainName, Limit: 3000 });
      return ok((result.RecordList || []).map((record: any) => ({
        id: String(record.RecordId),
        type: record.Type as DNSRecordType,
        name: record.Name || record.SubDomain || '@',
        content: record.Value,
        ttl: Number(record.TTL) || 600,
        priority: record.MX !== undefined ? Number(record.MX) : undefined,
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const params: Record<string, any> = {
        Domain: domainName,
        RecordType: record.type,
        RecordLine: '默认',
        SubDomain: record.name || '@',
        Value: record.content,
        TTL: ttlOrDefault(record.ttl),
      };
      if (record.priority !== undefined) params.MX = record.priority;
      const result = await this.callAPI('CreateRecord', params);
      return ok({ ...record, id: String(result.RecordId), ttl: ttlOrDefault(record.ttl) });
    } catch (error) {
      return fail(error, 'Failed to add DNS record');
    }
  }

  async updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>> {
    try {
      const records = await this.listRecords(domainName);
      const current = records.data?.find((item) => item.id === recordId);
      if (!current) return fail(`Record ${recordId} not found`, 'Record not found');
      const updated = { ...current, ...record };
      const params: Record<string, any> = {
        Domain: domainName,
        RecordId: Number(recordId),
        RecordType: updated.type,
        RecordLine: '默认',
        SubDomain: updated.name || '@',
        Value: updated.content,
        TTL: ttlOrDefault(updated.ttl),
      };
      if (updated.priority !== undefined) params.MX = updated.priority;
      await this.callAPI('ModifyRecord', params);
      return ok(updated);
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.callAPI('DeleteRecord', { Domain: domainName, RecordId: Number(recordId) });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}