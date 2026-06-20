import { DNSRecordData, DNSRecordType, DomainData, HetznerConfig, IDNSProvider, OperationResult } from './base';
import { fail, ok, parseJsonResponse, toFqdnRecordName, toRelativeRecordName, ttlOrDefault } from './utils';

export class HetznerProvider implements IDNSProvider {
  readonly name = 'Hetzner DNS';
  private readonly baseUrl = 'https://dns.hetzner.com/api/v1';

  constructor(private config: HetznerConfig) {}

  private headers() {
    return {
      'Auth-API-Token': this.config.apiToken,
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
      throw new Error(data.error || data.message || `Hetzner DNS API error ${response.status}`);
    }
    return data;
  }

  private async findZone(domainName: string) {
    const zones = await this.listDomains();
    return zones.data?.find((zone) => zone.name === domainName);
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request('/zones?per_page=1');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const data = await this.request('/zones?per_page=100');
      return ok((data.zones || []).map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        status: zone.verified ? 'active' : 'pending',
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');

      const data = await this.request(`/records?zone_id=${encodeURIComponent(zone.id)}`);
      return ok((data.records || []).map((record: any) => ({
        id: record.id,
        type: record.type as DNSRecordType,
        name: toRelativeRecordName(record.name, domainName),
        content: record.value,
        ttl: record.ttl,
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');

      const data = await this.request('/records', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: zone.id,
          type: record.type,
          name: toFqdnRecordName(record.name, domainName),
          value: record.content,
          ttl: ttlOrDefault(record.ttl),
        }),
      });
      const created = data.record;
      return ok({
        id: created.id,
        type: created.type,
        name: toRelativeRecordName(created.name, domainName),
        content: created.value,
        ttl: created.ttl,
      });
    } catch (error) {
      return fail(error, 'Failed to add DNS record');
    }
  }

  async updateRecord(domainName: string, recordId: string, record: Partial<DNSRecordData>): Promise<OperationResult<DNSRecordData>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      const existing = await this.listRecords(domainName);
      const current = existing.data?.find((item) => item.id === recordId);
      if (!current) return fail(`Record ${recordId} not found`, 'Record not found');
      const updated = { ...current, ...record };

      const data = await this.request(`/records/${encodeURIComponent(recordId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          zone_id: zone.id,
          type: updated.type,
          name: toFqdnRecordName(updated.name, domainName),
          value: updated.content,
          ttl: ttlOrDefault(updated.ttl),
        }),
      });
      const responseRecord = data.record;
      return ok({
        id: responseRecord.id,
        type: responseRecord.type,
        name: toRelativeRecordName(responseRecord.name, domainName),
        content: responseRecord.value,
        ttl: responseRecord.ttl,
      });
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      await this.request(`/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}