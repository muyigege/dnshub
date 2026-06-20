import crypto from 'crypto';
import { DNSRecordData, DNSRecordType, DomainData, HuaweiCloudDNSConfig, IDNSProvider, OperationResult } from './base';
import { fail, ok, parseJsonResponse, toFqdnRecordName, toRelativeRecordName, ttlOrDefault } from './utils';

export class HuaweiCloudDNSProvider implements IDNSProvider {
  readonly name = 'Huawei Cloud DNS';
  private readonly endpoint = 'https://dns.myhuaweicloud.com';
  private readonly host = 'dns.myhuaweicloud.com';

  constructor(private config: HuaweiCloudDNSConfig) {}

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private hmac(value: string) {
    return crypto.createHmac('sha256', this.config.secretAccessKey).update(value).digest('hex');
  }

  private sdkDate(date = new Date()) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private encode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  private canonicalQuery(query: Record<string, string>) {
    return Object.keys(query)
      .sort()
      .map((key) => `${this.encode(key)}=${this.encode(query[key])}`)
      .join('&');
  }

  private async request(method: string, path: string, query: Record<string, string> = {}, body: Record<string, any> | null = null) {
    const bodyText = body ? JSON.stringify(body) : '';
    const date = this.sdkDate();
    const queryString = this.canonicalQuery(query);
    const canonicalHeaders = `content-type:application/json\nhost:${this.host}\nx-sdk-date:${date}\n`;
    const signedHeaders = 'content-type;host;x-sdk-date';
    const canonicalRequest = [method, path, queryString, canonicalHeaders, signedHeaders, this.hash(bodyText)].join('\n');
    const stringToSign = ['SDK-HMAC-SHA256', date, this.hash(canonicalRequest)].join('\n');
    const signature = this.hmac(stringToSign);
    const authorization = `SDK-HMAC-SHA256 Access=${this.config.accessKeyId}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${this.endpoint}${path}${queryString ? `?${queryString}` : ''}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        'X-Sdk-Date': date,
      },
      body: body ? bodyText : undefined,
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.message || data.error_msg || data.error_code || `Huawei Cloud DNS API error ${response.status}`);
    return data;
  }

  private async findZone(domainName: string) {
    const zones = await this.listDomains();
    return zones.data?.find((zone) => zone.name === domainName);
  }

  private recordValue(record: Partial<DNSRecordData>) {
    if (record.type === 'MX' && record.priority !== undefined && record.content && !/^\d+\s+/.test(record.content)) {
      return `${record.priority} ${record.content}`;
    }
    return record.content || '';
  }

  private parseValue(type: string, value: string) {
    if (type === 'MX') {
      const match = value.match(/^(\d+)\s+(.+)$/);
      if (match) return { content: match[2], priority: Number(match[1]) };
    }
    return { content: value, priority: undefined };
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request('GET', '/v2/zones', { type: 'public', limit: '1' });
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const data = await this.request('GET', '/v2/zones', { type: 'public', limit: '500' });
      return ok((data.zones || []).map((zone: any) => ({
        id: zone.id,
        name: String(zone.name || '').replace(/\.$/, ''),
        status: zone.status || 'active',
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      const data = await this.request('GET', `/v2/zones/${encodeURIComponent(zone.id)}/recordsets`, { limit: '500' });
      return ok((data.recordsets || []).map((record: any) => {
        const parsed = this.parseValue(record.type, record.records?.[0] || '');
        return {
          id: record.id,
          type: record.type as DNSRecordType,
          name: toRelativeRecordName(record.name, domainName),
          content: parsed.content,
          ttl: record.ttl,
          priority: parsed.priority,
        };
      }).filter((record: DNSRecordData) => ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'SOA', 'CAA'].includes(record.type)));
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      const data = await this.request('POST', `/v2/zones/${encodeURIComponent(zone.id)}/recordsets`, {}, {
        name: `${toFqdnRecordName(record.name, domainName)}.`,
        type: record.type,
        ttl: ttlOrDefault(record.ttl),
        records: [this.recordValue(record)],
      });
      return ok({
        id: data.id,
        type: data.type,
        name: toRelativeRecordName(data.name, domainName),
        content: this.parseValue(data.type, data.records?.[0] || record.content).content,
        ttl: data.ttl,
        priority: record.priority,
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
      const data = await this.request('PUT', `/v2/zones/${encodeURIComponent(zone.id)}/recordsets/${encodeURIComponent(recordId)}`, {}, {
        name: `${toFqdnRecordName(updated.name, domainName)}.`,
        type: updated.type,
        ttl: ttlOrDefault(updated.ttl),
        records: [this.recordValue(updated)],
      });
      return ok({
        id: data.id,
        type: data.type,
        name: toRelativeRecordName(data.name, domainName),
        content: this.parseValue(data.type, data.records?.[0] || updated.content).content,
        ttl: data.ttl,
        priority: updated.priority,
      });
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request('DELETE', `/v2/zones/${encodeURIComponent(zone.id)}/recordsets/${encodeURIComponent(recordId)}`);
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}