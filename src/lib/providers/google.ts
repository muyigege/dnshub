import crypto from 'crypto';
import { DNSRecordData, DNSRecordType, DomainData, GoogleCloudDNSConfig, IDNSProvider, OperationResult } from './base';
import { fail, ok, parseJsonResponse, toFqdnRecordName, toRelativeRecordName, ttlOrDefault } from './utils';

export class GoogleCloudDNSProvider implements IDNSProvider {
  readonly name = 'Google Cloud DNS';
  private readonly apiBase = 'https://dns.googleapis.com/dns/v1';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private config: GoogleCloudDNSConfig) {}

  private base64Url(input: string | Buffer) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private async getAccessToken() {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) return this.tokenCache.token;

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: this.config.clientEmail,
      scope: 'https://www.googleapis.com/auth/ndev.clouddns.readwrite',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    const signingInput = `${this.base64Url(JSON.stringify(header))}.${this.base64Url(JSON.stringify(claim))}`;
    const privateKey = this.config.privateKey.replace(/\\n/g, '\n');
    const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
    const assertion = `${signingInput}.${this.base64Url(signature)}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.error_description || data.error || `Google OAuth error ${response.status}`);

    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    };
    return this.tokenCache.token;
  }

  private async request(path: string, init: RequestInit = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.error?.message || data.message || `Google Cloud DNS API error ${response.status}`);
    return data;
  }

  private async findZone(domainName: string) {
    const zones = await this.listDomains();
    return zones.data?.find((zone) => zone.name === domainName);
  }

  private recordData(record: Partial<DNSRecordData>) {
    let value = record.content || '';
    if (record.type === 'MX' && record.priority !== undefined && !/^\d+\s+/.test(value)) value = `${record.priority} ${value}`;
    if (record.type === 'TXT' && !/^".*"$/.test(value)) value = `"${value.replace(/"/g, '\\"')}"`;
    return value;
  }

  private parseRecordData(type: string, value: string) {
    const cleanValue = value.replace(/^"|"$/g, '');
    if (type === 'MX') {
      const match = cleanValue.match(/^(\d+)\s+(.+)$/);
      if (match) return { content: match[2], priority: Number(match[1]) };
    }
    return { content: cleanValue, priority: undefined };
  }

  private rrset(domainName: string, record: Partial<DNSRecordData>) {
    return {
      name: `${toFqdnRecordName(record.name || '@', domainName)}.`,
      type: record.type,
      ttl: ttlOrDefault(record.ttl),
      rrdatas: [this.recordData(record)],
    };
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones?maxResults=1`);
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const data = await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones`);
      return ok((data.managedZones || []).map((zone: any) => ({
        id: zone.name,
        name: String(zone.dnsName || '').replace(/\.$/, ''),
        status: 'active',
      })));
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      const data = await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones/${encodeURIComponent(zone.id)}/rrsets`);
      return ok((data.rrsets || []).map((record: any) => {
        const parsed = this.parseRecordData(record.type, record.rrdatas?.[0] || '');
        const name = toRelativeRecordName(record.name, domainName);
        return {
          id: `${record.type}:${name}`,
          type: record.type as DNSRecordType,
          name,
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
      await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones/${encodeURIComponent(zone.id)}/changes`, {
        method: 'POST',
        body: JSON.stringify({ additions: [this.rrset(domainName, record)] }),
      });
      return ok({ ...record, id: `${record.type}:${record.name}` });
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
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones/${encodeURIComponent(zone.id)}/changes`, {
        method: 'POST',
        body: JSON.stringify({ deletions: [this.rrset(domainName, current)], additions: [this.rrset(domainName, updated)] }),
      });
      return ok(updated);
    } catch (error) {
      return fail(error, 'Failed to update DNS record');
    }
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    try {
      const records = await this.listRecords(domainName);
      const current = records.data?.find((item) => item.id === recordId);
      if (!current) return fail(`Record ${recordId} not found`, 'Record not found');
      const zone = await this.findZone(domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request(`/projects/${encodeURIComponent(this.config.projectId)}/managedZones/${encodeURIComponent(zone.id)}/changes`, {
        method: 'POST',
        body: JSON.stringify({ deletions: [this.rrset(domainName, current)] }),
      });
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}