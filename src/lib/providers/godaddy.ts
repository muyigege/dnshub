import { DNSRecordData, DNSRecordType, DomainData, GoDaddyConfig, IDNSProvider, OperationResult } from './base';
import { fail, ok, parseJsonResponse, splitRecordId, ttlOrDefault } from './utils';

export class GoDaddyProvider implements IDNSProvider {
  readonly name = 'GoDaddy';
  private readonly baseUrl = 'https://api.godaddy.com/v1';

  constructor(private config: GoDaddyConfig) {}

  private headers() {
    const headers: Record<string, string> = {
      Authorization: `sso-key ${this.config.apiKey}:${this.config.apiSecret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.config.shopperId) headers['X-Shopper-Id'] = this.config.shopperId;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers || {}) },
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.message || data.code || `GoDaddy API error ${response.status}`);
    }
    return data;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request('/domains?limit=1');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const data = await this.request('/domains?limit=1000');
      return ok((Array.isArray(data) ? data : []).map((domain: any) => ({
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
      const data = await this.request(`/domains/${encodeURIComponent(domainName)}/records`);
      return ok((Array.isArray(data) ? data : []).map((record: any) => ({
        id: `${record.type}:${record.name || '@'}`,
        type: record.type as DNSRecordType,
        name: record.name || '@',
        content: record.data,
        ttl: record.ttl,
        priority: record.priority,
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const payload: Record<string, any> = {
        type: record.type,
        name: record.name || '@',
        data: record.content,
        ttl: ttlOrDefault(record.ttl),
      };
      if (record.priority !== undefined) payload.priority = record.priority;

      await this.request(`/domains/${encodeURIComponent(domainName)}/records`, {
        method: 'PATCH',
        body: JSON.stringify([payload]),
      });
      return ok({
        id: `${record.type}:${record.name || '@'}`,
        type: record.type,
        name: record.name || '@',
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
      const { type, name } = splitRecordId(recordId);
      const existing = await this.listRecords(domainName);
      const current = existing.data?.find((item) => item.id === recordId);
      if (!current) return fail(`Record ${recordId} not found`, 'Record not found');
      const updated = { ...current, ...record };

      const payload: Record<string, any> = {
        data: updated.content,
        ttl: ttlOrDefault(updated.ttl),
      };
      if (updated.priority !== undefined) payload.priority = updated.priority;

      await this.request(`/domains/${encodeURIComponent(domainName)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify([payload]),
      });
      return ok({ ...updated, id: `${updated.type}:${updated.name}` });
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      const { type, name } = splitRecordId(recordId);
      await this.request(`/domains/${encodeURIComponent(domainName)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, { method: 'DELETE' });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}