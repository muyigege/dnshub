import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { domains, dnsProviders, operationLogs } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function GET() {
  try {
    const result = await db
      .select({
        id: domains.id,
        name: domains.name,
        providerId: domains.providerId,
        isActive: domains.isActive,
        lastSyncedAt: domains.lastSyncedAt,
        createdAt: domains.createdAt,
        updatedAt: domains.updatedAt,
        providerName: dnsProviders.name,
        providerType: dnsProviders.type,
      })
      .from(domains)
      .leftJoin(dnsProviders, eq(domains.providerId, dnsProviders.id))
      .orderBy(domains.name);

    return NextResponse.json({
      success: true,
      data: result.map((row: any) => ({
        id: row.id,
        name: row.name,
        providerId: row.providerId,
        isActive: row.isActive,
        lastSyncedAt: row.lastSyncedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        providerName: row.providerName,
        providerType: row.providerType,
      })),
    });
  } catch (error) {
    console.error('Get domains error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取域名列表失败',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const providerId = Number(body.providerId);
    const name = String(body.name || '').trim().toLowerCase();

    if (!providerId || !name) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段', messageCn: '请填写服务商和域名', messageEn: 'Please fill provider and domain' },
        { status: 400 }
      );
    }

    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, providerId));
    if (!provider) {
      return NextResponse.json(
        { success: false, error: '服务商不存在', messageCn: '服务商不存在', messageEn: 'Provider not found' },
        { status: 404 }
      );
    }

    const [existing] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.providerId, providerId), eq(domains.name, name)));

    if (existing) {
      return NextResponse.json(
        { success: false, error: '域名已存在', messageCn: '该服务商下已存在此域名', messageEn: 'Domain already exists under this provider' },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(domains)
      .values({ providerId, name, isActive: true, lastSyncedAt: new Date().toISOString() })
      .returning();

    await db.insert(operationLogs).values({
      action: 'CREATE',
      entityType: 'domain',
      entityId: created.id,
      details: JSON.stringify({ providerId, name }),
      status: 'success',
      createdBy: 'system',
    });

    revalidatePath('/domains');
    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    console.error('Add domain error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '添加域名失败' },
      { status: 500 }
    );
  }
}