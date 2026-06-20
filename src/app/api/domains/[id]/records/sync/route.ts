import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders, domains } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';
import { handleCloudError } from '@/lib/api';
import { syncRecordsForDomain } from '@/lib/dns-record-sync';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let provider: typeof dnsProviders.$inferSelect | undefined;

  try {
    const { id } = await params;
    const domainId = Number.parseInt(id, 10);

    if (Number.isNaN(domainId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid domain id', messageCn: '域名 ID 无效', messageEn: 'Invalid domain id' },
        { status: 400 }
      );
    }

    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId));

    if (!domain) {
      return NextResponse.json(
        { success: false, error: 'Domain not found', messageCn: '域名不存在', messageEn: 'Domain not found' },
        { status: 404 }
      );
    }

    const [foundProvider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domain.providerId));

    if (!foundProvider) {
      return NextResponse.json(
        { success: false, error: 'Provider not found', messageCn: '服务商不存在', messageEn: 'Provider not found' },
        { status: 404 }
      );
    }

    provider = foundProvider;

    const credentials = decryptJSON<Record<string, string>>(provider.credentials);
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);
    const summary = await syncRecordsForDomain(domain, dnsProvider, { source: 'manual' });

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Sync domain records error:', error);
    const errorPayload = handleCloudError(error, provider?.type);
    return NextResponse.json(errorPayload, { status: 500 });
  }
}
