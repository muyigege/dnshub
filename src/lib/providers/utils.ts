import { DNSRecordData, DNSRecordType, OperationResult } from './base';

export function normalizeDomainName(name: string) {
  return name.replace(/\.$/, '').toLowerCase();
}

export function toFqdnRecordName(name: string, domainName: string) {
  const cleanName = name.trim().replace(/\.$/, '');
  const cleanDomain = normalizeDomainName(domainName);

  if (!cleanName || cleanName === '@') return cleanDomain;
  if (normalizeDomainName(cleanName) === cleanDomain) return cleanDomain;
  if (normalizeDomainName(cleanName).endsWith(`.${cleanDomain}`)) return normalizeDomainName(cleanName);
  return `${cleanName}.${cleanDomain}`;
}

export function toRelativeRecordName(name: string, domainName: string) {
  const cleanName = name.replace(/\.$/, '');
  const cleanDomain = normalizeDomainName(domainName);
  const normalizedName = normalizeDomainName(cleanName);

  if (normalizedName === cleanDomain) return '@';
  if (normalizedName.endsWith(`.${cleanDomain}`)) {
    return cleanName.slice(0, cleanName.length - cleanDomain.length - 1) || '@';
  }
  return cleanName || '@';
}

export function ttlOrDefault(ttl?: number, fallback = 600) {
  return ttl && ttl > 0 ? ttl : fallback;
}

export function splitRecordId(recordId: string) {
  const [type = '', ...nameParts] = recordId.split(':');
  return { type, name: nameParts.join(':') || '@' };
}

export async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function ok<T>(data?: T): OperationResult<T> {
  return data === undefined ? { success: true } : { success: true, data };
}

export function fail<T = void>(error: unknown, fallback: string): OperationResult<T> {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error || fallback),
  };
}

export function mapPriority(record: Partial<DNSRecordData>) {
  if (record.type === 'MX' || record.type === 'SRV') return record.priority;
  return undefined;
}

export function escapeXml(value: string | number | undefined | null) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function getXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

export function getXmlBlocks(xml: string, tag: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))).map((match) => match[1]);
}

export function asRecordType(type: string): DNSRecordType {
  return type.toUpperCase() as DNSRecordType;
}