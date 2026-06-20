import crypto from 'crypto';
import { AliYunConfig, DNSRecordData, DNSRecordType, DomainData, IDNSProvider, OperationResult } from './base';
import { fail, ok, ttlOrDefault } from './utils';

export class AliYunProvider implements IDNSProvider {
  readonly name = 'Aliyun DNS';
  private readonly endpoint = 'https://alidns.aliyuncs.com/';

  constructor(private config: AliYunConfig) {
    if (!config.regionId) this.config.regionId = 'cn-hangzhou';
  }

  private percentEncode(value: string) {
    return encodeURIComponent(value)
      .replace(/\+/g, '%20')
      .replace(/\*/g, '%2A')
      .replace(/%7E/g, '~');
  }

  private timestamp() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  private generateSignature(params: Record<string, string>) {
    const sortedQuery = Object.keys(params)
      .sort()
      .map((key) => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
      .join('&');
    const stringToSign = `GET&%2F&${this.percentEncode(sortedQuery)}`;
    return crypto.createHmac('sha1', `${this.config.accessKeySecret}&`).update(stringToSign).digest('base64');
  }

  private async callAPI(action: string, params: Record<string, string> = {}) {
    const requestParams: Record<string, string> = {
      Format: 'JSON',
      Version: '2015-01-09',
      AccessKeyId: this.config.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomUUID(),
      Timestamp: this.timestamp(),
      Action: action,
      ...params,
    };
    const signature = this.generateSignature(requestParams);
    const query = Object.entries({ ...requestParams, Signature: signature })
      .map(([key, value]) => `${this.percentEncode(key)}=${this.percentEncode(value)}`)
      .join('&');

    const response = await fetch(`${this.endpoint}?${query}`);
    const data = await response.json();
    if (data.Code) throw new Error(data.Message || data.Code);
    return data;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.callAPI('DescribeDomains', { PageSize: '1' });
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const domains: DomainData[] = [];
      let pageNumber = 1;
      const pageSize = 100;
      while (true) {
        const result = await this.callAPI('DescribeDomains', {
          PageNumber: String(pageNumber),
          PageSize: String(pageSize),
        });
        const pageDomains = (result.Domains?.Domain || []).map((domain: any) => ({
          id: domain.DomainId || domain.DomainName,
          name: domain.DomainName,
          status: domain.Status || 'active',
        }));
        domains.push(...pageDomains);
        if (domains.length >= (result.TotalCount || 0) || pageDomains.length === 0) break;
        pageNumber++;
      }
      return ok(domains);
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const records: DNSRecordData[] = [];
      let pageNumber = 1;
      const pageSize = 500;
      while (true) {
        const result = await this.callAPI('DescribeDomainRecords', {
          DomainName: domainName,
          PageNumber: String(pageNumber),
          PageSize: String(pageSize),
        });
        const pageRecords = (result.DomainRecords?.Record || []).map((record: any) => ({
          id: String(record.RecordId),
          type: record.Type as DNSRecordType,
          name: record.RR || '@',
          content: record.Value,
          ttl: Number(record.TTL) || 600,
          priority: record.Priority !== undefined ? Number(record.Priority) : undefined,
        }));
        records.push(...pageRecords);
        if (records.length >= (result.TotalCount || 0) || pageRecords.length === 0) break;
        pageNumber++;
      }
      return ok(records);
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const params: Record<string, string> = {
        DomainName: domainName,
        RR: record.name || '@',
        Type: record.type,
        Value: record.content,
        TTL: String(ttlOrDefault(record.ttl)),
      };
      if (record.priority !== undefined) params.Priority = String(record.priority);
      const result = await this.callAPI('AddDomainRecord', params);
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
      const params: Record<string, string> = {
        RecordId: recordId,
        RR: updated.name || '@',
        Type: updated.type,
        Value: updated.content,
        TTL: String(ttlOrDefault(updated.ttl)),
      };
      if (updated.priority !== undefined) params.Priority = String(updated.priority);
      await this.callAPI('UpdateDomainRecord', params);
      return ok(updated);
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.callAPI('DeleteDomainRecord', { RecordId: recordId });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}