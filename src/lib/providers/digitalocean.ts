import { DigitalOceanConfig, DNSRecordData, DNSRecordType, DomainData, IDNSProvider, OperationResult } from './base';
import { fail, ok, parseJsonResponse, ttlOrDefault } from './utils';

export class DigitalOceanProvider implements IDNSProvider {
  readonly name = 'DigitalOcean';
  private readonly baseUrl = 'https://api.digitalocean.com/v2';

  constructor(private config: DigitalOceanConfig) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers || {}) },
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(data.message || data.id || `DigitalOcean API error ${response.status}`);
    }
    return data;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request('/domains?per_page=1');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const domains: DomainData[] = [];
      let page = 1;
      while (true) {
        const data = await this.request(`/domains?per_page=200&page=${page}`);
        domains.push(...(data.domains || []).map((domain: any) => ({
          id: domain.name,
          name: domain.name,
          status: 'active',
        })));
        if (!data.links?.pages?.next) break;
        page++;
      }
      return ok(domains);
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const records: DNSRecordData[] = [];
      let page = 1;
      while (true) {
        const data = await this.request(`/domains/${encodeURIComponent(domainName)}/records?per_page=200&page=${page}`);
        records.push(...(data.domain_records || []).map((record: any) => ({
          id: String(record.id),
          type: record.type as DNSRecordType,
          name: record.name || '@',
          content: record.data,
          ttl: record.ttl,
          priority: record.priority,
        })));
        if (!data.links?.pages?.next) break;
        page++;
      }
      return ok(records);
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

      const data = await this.request(`/domains/${encodeURIComponent(domainName)}/records`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const created = data.domain_record;
      return ok({
        id: String(created.id),
        type: created.type,
        name: created.name || '@',
        content: created.data,
        ttl: created.ttl,
        priority: created.priority,
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

      const payload: Record<string, any> = {
        type: record.type || current.type,
        name: record.name || current.name,
        data: record.content || current.content,
        ttl: ttlOrDefault(record.ttl || current.ttl),
      };
      const priority = record.priority ?? current.priority;
      if (priority !== undefined) payload.priority = priority;

      const data = await this.request(`/domains/${encodeURIComponent(domainName)}/records/${encodeURIComponent(recordId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const updated = data.domain_record;
      return ok({
        id: String(updated.id),
        type: updated.type,
        name: updated.name || '@',
        content: updated.data,
        ttl: updated.ttl,
        priority: updated.priority,
      });
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.request(`/domains/${encodeURIComponent(domainName)}/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}