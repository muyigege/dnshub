import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/connection';
import { dnsRecords, domains, operationLogs } from '@/lib/db/schema';
import { DNSRecordData, IDNSProvider } from '@/lib/providers/base';

export type RecordSyncSummary = {
  synced: number;
  updated: number;
  total: number;
};

type DomainRow = typeof domains.$inferSelect;

type SyncOptions = {
  log?: boolean;
  source?: 'manual' | 'domain-sync';
};

function getRecordMatch(domainId: number, record: DNSRecordData) {
  if (record.id) {
    return and(
      eq(dnsRecords.domainId, domainId),
      eq(dnsRecords.providerRecordId, record.id)
    );
  }

  return and(
    eq(dnsRecords.domainId, domainId),
    eq(dnsRecords.type, record.type),
    eq(dnsRecords.name, record.name),
    eq(dnsRecords.content, record.content)
  );
}

export async function syncRecordsForDomain(
  domain: DomainRow,
  dnsProvider: IDNSProvider,
  options: SyncOptions = {}
): Promise<RecordSyncSummary> {
  const recordsResult = await dnsProvider.listRecords(domain.name);

  if (!recordsResult.success || !recordsResult.data) {
    throw new Error(recordsResult.error || `Failed to sync records for ${domain.name}`);
  }

  let synced = 0;
  let updated = 0;

  for (const record of recordsResult.data) {
    const [existing] = await db
      .select()
      .from(dnsRecords)
      .where(getRecordMatch(domain.id, record));

    const recordValues = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl ?? 600,
      priority: record.priority ?? null,
      providerRecordId: record.id || null,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await db
        .update(dnsRecords)
        .set(recordValues)
        .where(eq(dnsRecords.id, existing.id));
      updated++;
    } else {
      await db.insert(dnsRecords).values({
        domainId: domain.id,
        ...recordValues,
      });
      synced++;
    }
  }

  const summary = {
    synced,
    updated,
    total: recordsResult.data.length,
  };

  if (options.log !== false) {
    await db.insert(operationLogs).values({
      action: 'SYNC',
      entityType: 'record',
      entityId: domain.id,
      details: JSON.stringify({ ...summary, source: options.source || 'manual' }),
      status: 'success',
      createdBy: 'system',
    });
  }

  return summary;
}
