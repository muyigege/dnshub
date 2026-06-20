import crypto from 'crypto';
import { DNSRecordData, DNSRecordType, DomainData, IDNSProvider, OperationResult, Route53Config } from './base';
import { decodeXml, escapeXml, fail, getXmlBlocks, getXmlTag, ok, toFqdnRecordName, toRelativeRecordName, ttlOrDefault } from './utils';

export class Route53Provider implements IDNSProvider {
  readonly name = 'AWS Route53';
  private readonly endpoint = 'https://route53.amazonaws.com';
  private readonly host = 'route53.amazonaws.com';
  private readonly region = 'us-east-1';
  private readonly service = 'route53';

  constructor(private config: Route53Config) {}

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private hmac(key: string | Buffer, value: string) {
    return crypto.createHmac('sha256', key).update(value).digest();
  }

  private amzDate(date = new Date()) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private shortDate(amzDate: string) {
    return amzDate.slice(0, 8);
  }

  private signingKey(date: string) {
    const kDate = this.hmac(`AWS4${this.config.secretAccessKey}`, date);
    const kRegion = this.hmac(kDate, this.region);
    const kService = this.hmac(kRegion, this.service);
    return this.hmac(kService, 'aws4_request');
  }

  private async request(method: 'GET' | 'POST', path: string, query = '', body = '') {
    const amzDate = this.amzDate();
    const shortDate = this.shortDate(amzDate);
    const payloadHash = this.hash(body);
    const canonicalHeaders = `host:${this.host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${shortDate}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, this.hash(canonicalRequest)].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(shortDate)).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${this.endpoint}${path}${query ? `?${query}` : ''}`, {
      method,
      headers: {
        Authorization: authorization,
        'X-Amz-Date': amzDate,
        'Content-Type': 'application/xml',
      },
      body: method === 'POST' ? body : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(getXmlTag(text, 'Message') || `Route53 API error ${response.status}`);
    }
    return text;
  }

  private cleanZoneId(id: string) {
    return id.replace(/^\/hostedzone\//, '');
  }

  private route53Value(record: Partial<DNSRecordData>) {
    let value = record.content || '';
    if (record.type === 'MX' && record.priority !== undefined && !/^\d+\s+/.test(value)) {
      value = `${record.priority} ${value}`;
    }
    if (record.type === 'TXT' && !/^".*"$/.test(value)) {
      value = `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  private parseRecordValue(type: string, value: string) {
    const decoded = decodeXml(value).replace(/^"|"$/g, '');
    if (type === 'MX') {
      const match = decoded.match(/^(\d+)\s+(.+)$/);
      if (match) return { content: match[2], priority: Number(match[1]) };
    }
    return { content: decoded, priority: undefined };
  }

  private changeXml(action: 'CREATE' | 'UPSERT' | 'DELETE', domainName: string, record: Partial<DNSRecordData>) {
    const type = record.type || 'A';
    const value = this.route53Value(record);
    return `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>
      <Change>
        <Action>${action}</Action>
        <ResourceRecordSet>
          <Name>${escapeXml(toFqdnRecordName(record.name || '@', domainName))}.</Name>
          <Type>${escapeXml(type)}</Type>
          <TTL>${ttlOrDefault(record.ttl)}</TTL>
          <ResourceRecords>
            <ResourceRecord><Value>${escapeXml(value)}</Value></ResourceRecord>
          </ResourceRecords>
        </ResourceRecordSet>
      </Change>
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;
  }

  async testConnection(): Promise<OperationResult> {
    try {
      await this.request('GET', '/2013-04-01/hostedzone', 'maxitems=1');
      return ok();
    } catch (error) {
      return fail(error, 'Connection test failed');
    }
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    try {
      const xml = await this.request('GET', '/2013-04-01/hostedzone', 'maxitems=100');
      const zones = getXmlBlocks(xml, 'HostedZone').map((zone) => ({
        id: this.cleanZoneId(getXmlTag(zone, 'Id')),
        name: getXmlTag(zone, 'Name').replace(/\.$/, ''),
        status: getXmlTag(zone, 'PrivateZone') === 'true' ? 'private' : 'active',
      }));
      return ok(zones);
    } catch (error) {
      return fail(error, 'Failed to fetch domains');
    }
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    try {
      const domains = await this.listDomains();
      const zone = domains.data?.find((item) => item.name === domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');

      const xml = await this.request('GET', `/2013-04-01/hostedzone/${encodeURIComponent(zone.id)}/rrset`, 'maxitems=300');
      const records = getXmlBlocks(xml, 'ResourceRecordSet').map((block) => {
        const type = getXmlTag(block, 'Type') as DNSRecordType;
        const name = toRelativeRecordName(getXmlTag(block, 'Name'), domainName);
        const values = getXmlBlocks(block, 'ResourceRecord').map((rr) => getXmlTag(rr, 'Value'));
        const firstValue = values[0] || getXmlTag(block, 'DNSName');
        const parsed = this.parseRecordValue(type, firstValue);
        return {
          id: `${type}:${name}`,
          type,
          name,
          content: parsed.content,
          ttl: Number(getXmlTag(block, 'TTL')) || 300,
          priority: parsed.priority,
        };
      }).filter((record) => ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'SOA', 'CAA'].includes(record.type));
      return ok(records);
    } catch (error) {
      return fail(error, 'Failed to fetch DNS records');
    }
  }

  async addRecord(domainName: string, record: Omit<DNSRecordData, 'id'>): Promise<OperationResult<DNSRecordData>> {
    try {
      const domains = await this.listDomains();
      const zone = domains.data?.find((item) => item.name === domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request('POST', `/2013-04-01/hostedzone/${encodeURIComponent(zone.id)}/rrset`, '', this.changeXml('CREATE', domainName, record));
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
      const domains = await this.listDomains();
      const zone = domains.data?.find((item) => item.name === domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request('POST', `/2013-04-01/hostedzone/${encodeURIComponent(zone.id)}/rrset`, '', this.changeXml('UPSERT', domainName, updated));
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
      const domains = await this.listDomains();
      const zone = domains.data?.find((item) => item.name === domainName);
      if (!zone) return fail(`Domain ${domainName} not found`, 'Domain not found');
      await this.request('POST', `/2013-04-01/hostedzone/${encodeURIComponent(zone.id)}/rrset`, '', this.changeXml('DELETE', domainName, current));
      return ok();
    } catch (error) {
      return fail(error, 'Failed to delete DNS record');
    }
  }
}