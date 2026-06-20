import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { handleCloudError, successResponse, validateRequired } from '@/lib/api';
import { syncRecordsForDomain } from '@/lib/dns-record-sync';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const providerId = Number(body.providerId);

    const validationError = validateRequired({ providerId }, ['providerId']);
    if (validationError || Number.isNaN(providerId)) {
      return NextResponse.json(
        validationError || {
          success: false,
          code: 'INVALID_PARAM',
          messageCn: '服务商 ID 无效',
          messageEn: 'Invalid provider id',
        },
        { status: 400 }
      );
    }

    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, providerId));

    if (!provider) {
      return NextResponse.json({
        success: false,
        code: 'NOT_FOUND',
        messageCn: '服务商不存在',
        messageEn: 'Provider not found',
      }, { status: 404 });
    }

    const credentials = decryptJSON<Record<string, string>>(provider.credentials);
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);
    const domainsResult = await dnsProvider.listDomains();

    if (!domainsResult.success || !domainsResult.data) {
      return NextResponse.json(handleCloudError(domainsResult.error, provider.type), { status: 500 });
    }

    const remoteDomains = domainsResult.data;
    const syncedDomainRows: Array<typeof domains.$inferSelect> = [];
    let synced = 0;
    let updated = 0;

    for (const remoteDomain of remoteDomains) {
      const [existing] = await db
        .select()
        .from(domains)
        .where(
          and(
            eq(domains.providerId, provider.id),
            eq(domains.name, remoteDomain.name)
          )
        );

      if (existing) {
        const [updatedDomain] = await db
          .update(domains)
          .set({
            isActive: remoteDomain.status ? remoteDomain.status !== 'inactive' : existing.isActive,
            lastSyncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(domains.id, existing.id))
          .returning();
        syncedDomainRows.push(updatedDomain || existing);
        updated++;
      } else {
        const [createdDomain] = await db.insert(domains).values({
          providerId: provider.id,
          name: remoteDomain.name,
          isActive: remoteDomain.status ? remoteDomain.status !== 'inactive' : true,
          lastSyncedAt: new Date().toISOString(),
        }).returning();
        syncedDomainRows.push(createdDomain);
        synced++;
      }
    }

    const recordSync = {
      domains: 0,
      failed: 0,
      synced: 0,
      updated: 0,
      total: 0,
      errors: [] as Array<{ domain: string; error: string }>,
    };

    for (const domain of syncedDomainRows) {
      try {
        const summary = await syncRecordsForDomain(domain, dnsProvider, {
          log: false,
          source: 'domain-sync',
        });
        recordSync.domains++;
        recordSync.synced += summary.synced;
        recordSync.updated += summary.updated;
        recordSync.total += summary.total;
      } catch (error) {
        recordSync.failed++;
        recordSync.errors.push({
          domain: domain.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'domain',
      entityId: provider.id,
      details: JSON.stringify({
        providerId,
        totalRemote: remoteDomains.length,
        synced,
        updated,
        records: recordSync,
      }),
      status: 'success',
      createdBy: 'system',
    });

    revalidatePath('/domains');

    return NextResponse.json(successResponse({
      totalRemote: remoteDomains.length,
      synced,
      updated,
      records: recordSync,
      domains: remoteDomains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        status: domain.status,
      })),
    }));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}
