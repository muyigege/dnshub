import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/connection';
import {
  encryptWithPassword,
  decryptWithPassword,
  encrypt,
} from '@/lib/encryption';

// 获取当前系统的加密密钥
const getEncryptionKey = (): string => {
  return process.env.ENCRYPTION_KEY || '';
};

/**
 * GET /api/config
 * 导出所有配置数据
 * ?password=xxx  用密码加密导出文件（推荐）
 */
export async function GET(request: NextRequest) {
  try {
    const password = request.nextUrl.searchParams.get('password') || undefined;

    const providers = await db.run(sql`SELECT * FROM dns_providers`);
    const aiConfigs = await db.run(sql`SELECT * FROM ai_configurations`);
    const allDomains = await db.run(sql`SELECT * FROM domains`);
    const allRecords = await db.run(sql`SELECT * FROM dns_records`);

    const exportData = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      encryptionKey: getEncryptionKey(),
      data: {
        providers: rowsToObjects(providers),
        aiConfigs: rowsToObjects(aiConfigs),
        domains: rowsToObjects(allDomains),
        records: rowsToObjects(allRecords),
      },
    };

    if (password) {
      const jsonStr = JSON.stringify(exportData);
      const encrypted = encryptWithPassword(jsonStr, password);
      return NextResponse.json({
        success: true,
        encrypted: true,
        data: encrypted,
      });
    }

    return NextResponse.json({
      success: true,
      encrypted: false,
      data: exportData,
    });
  } catch (error) {
    console.error('Export config error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导出失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/config
 * 导入配置数据
 * { data, password?, overwrite? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { data, password, overwrite = false } = body;

    if (!data) {
      return NextResponse.json(
        { success: false, error: '缺少导入数据' },
        { status: 400 }
      );
    }

    // 如果是密码加密的内容，先解密
    let importPayload: {
      version?: string;
      encryptionKey?: string;
      data: {
        providers?: unknown[];
        aiConfigs?: unknown[];
        domains?: unknown[];
        records?: unknown[];
      };
    };

    if (typeof data === 'string') {
      if (!password) {
        return NextResponse.json(
          { success: false, error: '此配置文件已加密，请提供密码' },
          { status: 400 }
        );
      }
      try {
        const decrypted = decryptWithPassword(data, password);
        importPayload = JSON.parse(decrypted);
      } catch {
        return NextResponse.json(
          { success: false, error: '密码错误，无法解密配置文件' },
          { status: 400 }
        );
      }
    } else {
      importPayload = data;
    }

    // 如果不是覆盖模式，检查是否已有数据
    if (!overwrite) {
      const existing = await db.run(sql`SELECT COUNT(*) as cnt FROM dns_providers`);
      const count = (existing.rows[0] as unknown as { cnt: number }).cnt;
      if (count > 0) {
        return NextResponse.json(
          { success: false, error: '系统已有配置数据，请勾选"覆盖现有数据"' },
          { status: 400 }
        );
      }
    }

    // 覆盖模式：先清空现有数据
    if (overwrite) {
      await db.run(sql`DELETE FROM dns_records`);
      await db.run(sql`DELETE FROM domains`);
      await db.run(sql`DELETE FROM dns_providers`);
      await db.run(sql`DELETE FROM ai_configurations`);
    }

    const sourceKey = importPayload.encryptionKey || '';
    const currentKey = getEncryptionKey();
    const needKeyMigration = sourceKey && currentKey && sourceKey !== currentKey;

    const payload = importPayload.data;

    // ID 映射表：old_id → new_id
    const providerIdMap = new Map<number, number>();
    const domainIdMap = new Map<number, number>();

    // ========== 导入服务商 ==========
    if (payload.providers && Array.isArray(payload.providers)) {
      for (const provider of payload.providers as Array<Record<string, unknown>>) {
        let credentials = provider.credentials as string | undefined;

        if (needKeyMigration && credentials) {
          try {
            const plainCredentials = decryptWithKey(credentials, sourceKey);
            credentials = encrypt(plainCredentials);
          } catch {
            console.warn(`无法迁移提供商 "${provider.name}" 的凭证加密`);
          }
        }

        const result = await db.run(sql`
          INSERT INTO dns_providers (name, type, credentials, is_active, created_at, updated_at)
          VALUES (${(provider.name as string) || ''}, ${(provider.type as string) || 'cloudflare'},
                  ${credentials || ''}, ${(provider.isActive as boolean) ?? true ? 1 : 0},
                  ${(provider.createdAt as string) ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
        providerIdMap.set(provider.id as number, Number(result.lastInsertRowid));
      }
    }

    // ========== 导入 AI 配置 ==========
    if (payload.aiConfigs && Array.isArray(payload.aiConfigs)) {
      for (const config of payload.aiConfigs as Array<Record<string, unknown>>) {
        let apiKey = config.apiKey as string | undefined;

        if (needKeyMigration && apiKey) {
          try {
            const plainKey = decryptWithKey(apiKey, sourceKey);
            apiKey = encrypt(plainKey);
          } catch {
            console.warn(`无法迁移 AI 配置 "${config.name}" 的 API 密钥加密`);
          }
        }

        await db.run(sql`
          INSERT INTO ai_configurations (name, provider_type, api_url, model_id, api_key, is_active, created_at, updated_at)
          VALUES (${(config.name as string) || ''}, ${(config.providerType as string) ?? 'custom'},
                  ${(config.apiUrl as string) || ''}, ${(config.modelId as string) || ''},
                  ${apiKey || ''}, ${(config.isActive as boolean) ?? true ? 1 : 0},
                  ${(config.createdAt as string) ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
      }
    }

    // ========== 导入域名（映射 provider_id）==========
    if (payload.domains && Array.isArray(payload.domains)) {
      for (const domain of payload.domains as Array<Record<string, unknown>>) {
        const oldProviderId = domain.providerId as number;
        const newProviderId = providerIdMap.get(oldProviderId) ?? oldProviderId;

        const result = await db.run(sql`
          INSERT INTO domains (provider_id, name, is_active, last_synced_at, created_at, updated_at)
          VALUES (${newProviderId}, ${(domain.name as string) || ''},
                  ${(domain.isActive as boolean) ?? true ? 1 : 0},
                  ${(domain.lastSyncedAt as string) || null},
                  ${(domain.createdAt as string) ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
        domainIdMap.set(domain.id as number, Number(result.lastInsertRowid));
      }
    }

    // ========== 导入 DNS 记录（映射 domain_id）==========
    if (payload.records && Array.isArray(payload.records)) {
      for (const record of payload.records as Array<Record<string, unknown>>) {
        const oldDomainId = record.domainId as number;
        const newDomainId = domainIdMap.get(oldDomainId) ?? oldDomainId;

        await db.run(sql`
          INSERT INTO dns_records (domain_id, type, name, content, ttl, priority, provider_record_id, is_active, created_at, updated_at)
          VALUES (${newDomainId}, ${(record.type as string) || 'A'},
                  ${(record.name as string) || ''}, ${(record.content as string) || ''},
                  ${(record.ttl as number) ?? 600}, ${(record.priority as number) || null},
                  ${(record.providerRecordId as string) || null},
                  ${(record.isActive as boolean) ?? true ? 1 : 0},
                  ${(record.createdAt as string) ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
      }
    }

    return NextResponse.json({
      success: true,
      message: needKeyMigration
        ? '配置导入成功（已自动完成跨系统密钥迁移）'
        : '配置导入成功',
    });
  } catch (error) {
    console.error('Import config error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}

/**
 * 用指定密钥解密（用于跨系统凭证迁移）
 */
function decryptWithKey(ciphertext: string, key: string): string {
  const ALGORITHM = 'aes-256-gcm';
  const IV_LENGTH = 16;
  const SALT_LENGTH = 64;
  const TAG_LENGTH = 16;
  const TAG_POSITION = SALT_LENGTH + IV_LENGTH;

  const combined = Buffer.from(ciphertext, 'base64');
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, TAG_POSITION);
  const tag = combined.subarray(TAG_POSITION, TAG_POSITION + TAG_LENGTH);
  const encrypted = combined.subarray(TAG_POSITION + TAG_LENGTH);

  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * 将 libsql ResultSet 转为普通对象数组（导出时 snake_case + camelCase）
 */
function rowsToObjects(result: { columns: string[]; rows: Array<Record<string, unknown>> }): Record<string, unknown>[] {
  const cols = result.columns;
  const rawRows = result.rows;
  return rawRows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) {
      const key = cols[i];
      const val = row[key];
      obj[key] = val;
      const camelKey = snakeToCamel(key);
      if (camelKey !== key) {
        obj[camelKey] = val;
      }
    }
    return obj;
  });
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}