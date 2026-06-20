import { DNSRecordData, DNSRecordType, DomainData, IDNSProvider, NameSiloConfig, OperationResult } from './base';
import { fail, ok, toRelativeRecordName, ttlOrDefault } from './utils';

export class NameSiloProvider implements IDNSProvider {
  readonly name = 'NameSilo';
  private readonly baseUrl = 'https://www.namesilo.com/api';

  constructor(private config: NameSiloConfig) {}

  private async callAPI(command: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${command}`);
    url.searchParams.set('version', '1');
    url.searchParams.set('type', 'json');
    url.searchParams.set('key', this.config.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString());
    const data = await response.json();
    const code = String(data.reply?.code || data.code || '');
    if (!response.ok || (code && code !== '300')) {
      throw new Error(data.reply?.detail || data.detail || `NameSilo API error ${response.status}`);
    }
    return data.reply || data;
  }

  private asArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.callAPI('listDomains');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const reply = await this.callAPI('listDomains');
      const domains = this.asArray<string>(reply.domains?.domain || reply.domain);
      return ok(domains.map((domain) => ({ id: domain, name: domain, status: 'active' })));
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const reply = await this.callAPI('dnsListRecords', { domain: domainName });
      const records = this.asArray<any>(reply.resource_record);
      return ok(records.map((record: any) => ({
        id: String(record.record_id || record.recordId),
        type: String(record.type).toUpperCase() as DNSRecordType,
        name: toRelativeRecordName(record.host || domainName, domainName),
        content: record.value,
        ttl: Number(record.ttl) || 7200,
        priority: record.distance !== undefined ? Number(record.distance) : undefined,
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const params: Record<string, string> = {
        domain: domainName,
        rrtype: record.type,
        rrhost: record.name === '@' ? '' : record.name,
        rrvalue: record.content,
        rrttl: String(ttlOrDefault(record.ttl, 7200)),
      };
      if (record.priority !== undefined) params.rrdistance = String(record.priority);
      const reply = await this.callAPI('dnsAddRecord', params);
      return ok({
        id: String(reply.record_id || reply.recordId),
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: ttlOrDefault(record.ttl, 7200),
        priority: record.priority,
      });
    } catch (error) {
      return fail(error, 'Failed to add DNS record');
    }
  }

  async updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>> {
    try {
      const existing = await this.listRecords(domainName);
      const current = existing.data?.find((item) => item.id === recordId);
      if (!current) return fail(`Record ${recordId} not found`, 'Record not found');
      const updated = { ...current, ...record };

      const params: Record<string, string> = {
        domain: domainName,
        rrid: recordId,
        rrtype: updated.type,
        rrhost: updated.name === '@' ? '' : updated.name,
        rrvalue: updated.content,
        rrttl: String(ttlOrDefault(updated.ttl, 7200)),
      };
      if (updated.priority !== undefined) params.rrdistance = String(updated.priority);
      await this.callAPI('dnsUpdateRecord', params);
      return ok(updated);
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.callAPI('dnsDeleteRecord', { domain: domainName, rrid: recordId });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}