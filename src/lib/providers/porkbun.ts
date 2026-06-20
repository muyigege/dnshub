import { DNSRecordData, DNSRecordType, DomainData, IDNSProvider, OperationResult, PorkbunConfig } from './base';
import { fail, ok, parseJsonResponse, toRelativeRecordName, ttlOrDefault } from './utils';

export class PorkbunProvider implements IDNSProvider {
  readonly name = 'Porkbun';
  private readonly baseUrl = 'https://api.porkbun.com/api/json/v3';

  constructor(private config: PorkbunConfig) {}

  private authBody(extra: Record<string, any> = {}) {
    return {
      apikey: this.config.apiKey,
      secretapikey: this.config.secretApiKey,
      ...extra,
    };
  }

  private async post(path: string, body: Record<string, any> = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.authBody(body)),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok || data.status === 'ERROR') {
      throw new Error(data.message || `Porkbun API error ${response.status}`);
    }
    return data;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.post('/ping');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const data = await this.post('/domain/listAll');
      return ok((data.domains || []).map((domain: any) => ({
        id: domain.domain,
        name: domain.domain,
        status: domain.status || 'active',
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const data = await this.post(`/dns/retrieve/${encodeURIComponent(domainName)}`);
      return ok((data.records || []).map((record: any) => ({
        id: String(record.id),
        type: record.type as DNSRecordType,
        name: toRelativeRecordName(record.name || domainName, domainName),
        content: record.content,
        ttl: Number(record.ttl) || 600,
        priority: record.prio !== undefined ? Number(record.prio) : undefined,
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const data = await this.post(`/dns/create/${encodeURIComponent(domainName)}`, {
        type: record.type,
        name: record.name === '@' ? '' : record.name,
        content: record.content,
        ttl: String(ttlOrDefault(record.ttl)),
        prio: record.priority !== undefined ? String(record.priority) : undefined,
      });
      return ok({
        id: String(data.id),
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: ttlOrDefault(record.ttl),
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
      await this.post(`/dns/edit/${encodeURIComponent(domainName)}/${encodeURIComponent(recordId)}`, {
        type: updated.type,
        name: updated.name === '@' ? '' : updated.name,
        content: updated.content,
        ttl: String(ttlOrDefault(updated.ttl)),
        prio: updated.priority !== undefined ? String(updated.priority) : undefined,
      });
      return ok(updated);
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.post(`/dns/delete/${encodeURIComponent(domainName)}/${encodeURIComponent(recordId)}`);
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}