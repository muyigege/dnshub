import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/connection';
import {
  encryptWithPassword,
  decryptWithPassword,
  encrypt,
  decrypt,
  getEncryptionSecret,
} from '@/lib/encryption';

// 获取当前系统的加密密钥
const getEncryptionKey = (): string => {
  return getEncryptionSecret();
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
  let transactionStarted = false;

  try {
    const body = await request.json();
    const { data, password, overwrite = false } = body;

    if (!data) {
      return NextResponse.json(
        { success: false, error: '缺少导入数据' },
        { status: 400 }
      );
    }

    const importPayload = parseImportPayload(data, password);

    // 如果不是覆盖模式，检查是否已有数据
    if (!overwrite) {
      const existing = await db.run(sql`
        SELECT
          (SELECT COUNT(*) FROM dns_providers) +
          (SELECT COUNT(*) FROM ai_configurations) +
          (SELECT COUNT(*) FROM domains) +
          (SELECT COUNT(*) FROM dns_records) as cnt
      `);
      const count = Number((existing.rows[0] as unknown as { cnt: number }).cnt || 0);
      if (count > 0) {
        return NextResponse.json(
          { success: false, error: '系统已有配置数据，请勾选"覆盖现有数据"' },
          { status: 400 }
        );
      }
    }

    await db.run(sql`BEGIN IMMEDIATE`);
    transactionStarted = true;

    // 覆盖模式：先清空现有数据
    if (overwrite) {
      await db.run(sql`DELETE FROM dns_records`);
      await db.run(sql`DELETE FROM domains`);
      await db.run(sql`DELETE FROM dns_providers`);
      await db.run(sql`DELETE FROM ai_configurations`);
    }

    const sourceKey = getString(importPayload, 'encryptionKey', 'encryption_key') || '';
    const currentKey = getEncryptionKey();
    const needKeyMigration = sourceKey && currentKey && sourceKey !== currentKey;

    const payload = importPayload.data;

    // ID 映射表：old_id → new_id
    const providerIdMap = new Map<number, number>();
    const domainIdMap = new Map<number, number>();

    // ========== 导入服务商 ==========
    if (payload.providers && Array.isArray(payload.providers)) {
      for (const provider of payload.providers as Array<Record<string, unknown>>) {
        const oldId = getNumber(provider, 'id') ?? 0;
        const providerName = getString(provider, 'name') || '';
        const providerType = getString(provider, 'type') || 'cloudflare';
        const credentials = normalizeEncryptedField(
          getRaw(provider, 'credentials'),
          sourceKey,
          currentKey,
          `服务商 "${providerName || oldId}" 凭证`
        );

        const result = await db.run(sql`
          INSERT INTO dns_providers (name, type, credentials, is_active, created_at, updated_at)
          VALUES (${providerName}, ${providerType},
                  ${credentials}, ${getBoolean(provider, 'isActive', 'is_active', true) ? 1 : 0},
                  ${getString(provider, 'createdAt', 'created_at') ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
        providerIdMap.set(oldId, Number(result.lastInsertRowid));
      }
    }

    // ========== 导入 AI 配置 ==========
    if (payload.aiConfigs && Array.isArray(payload.aiConfigs)) {
      for (const config of payload.aiConfigs as Array<Record<string, unknown>>) {
        const configName = getString(config, 'name') || '';
        const apiKey = normalizeEncryptedField(
          getRaw(config, 'apiKey', 'api_key'),
          sourceKey,
          currentKey,
          `AI 配置 "${configName}" API Key`
        );

        await db.run(sql`
          INSERT INTO ai_configurations (name, provider_type, api_url, model_id, api_key, is_active, created_at, updated_at)
          VALUES (${configName}, ${getString(config, 'providerType', 'provider_type') ?? 'custom'},
                  ${getString(config, 'apiUrl', 'api_url') || ''}, ${getString(config, 'modelId', 'model_id') || ''},
                  ${apiKey}, ${getBoolean(config, 'isActive', 'is_active', true) ? 1 : 0},
                  ${getString(config, 'createdAt', 'created_at') ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
      }
    }

    // ========== 导入域名（映射 provider_id）==========
    if (payload.domains && Array.isArray(payload.domains)) {
      for (const domain of payload.domains as Array<Record<string, unknown>>) {
        const oldId = getNumber(domain, 'id') ?? 0;
        const oldProviderId = getNumber(domain, 'providerId', 'provider_id') ?? 0;
        const newProviderId = providerIdMap.get(oldProviderId) ?? oldProviderId;

        const result = await db.run(sql`
          INSERT INTO domains (provider_id, name, is_active, last_synced_at, created_at, updated_at)
          VALUES (${newProviderId}, ${getString(domain, 'name') || ''},
                  ${getBoolean(domain, 'isActive', 'is_active', true) ? 1 : 0},
                  ${getString(domain, 'lastSyncedAt', 'last_synced_at') || null},
                  ${getString(domain, 'createdAt', 'created_at') ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
        domainIdMap.set(oldId, Number(result.lastInsertRowid));
      }
    }

    // ========== 导入 DNS 记录（映射 domain_id）==========
    if (payload.records && Array.isArray(payload.records)) {
      for (const record of payload.records as Array<Record<string, unknown>>) {
        const oldDomainId = getNumber(record, 'domainId', 'domain_id') ?? 0;
        const newDomainId = domainIdMap.get(oldDomainId) ?? oldDomainId;

        await db.run(sql`
          INSERT INTO dns_records (domain_id, type, name, content, ttl, priority, provider_record_id, is_active, created_at, updated_at)
          VALUES (${newDomainId}, ${getString(record, 'type') || 'A'},
                  ${getString(record, 'name') || ''}, ${getString(record, 'content') || ''},
                  ${getNumber(record, 'ttl') ?? 600}, ${getNumber(record, 'priority') || null},
                  ${getString(record, 'providerRecordId', 'provider_record_id') || null},
                  ${getBoolean(record, 'isActive', 'is_active', true) ? 1 : 0},
                  ${getString(record, 'createdAt', 'created_at') ?? new Date().toISOString()}, ${new Date().toISOString()})
        `);
      }
    }

    await db.run(sql`COMMIT`);
    transactionStarted = false;

    return NextResponse.json({
      success: true,
      message: needKeyMigration
        ? '配置导入成功（已自动完成跨系统密钥迁移）'
        : '配置导入成功',
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.run(sql`ROLLBACK`);
      } catch (rollbackError) {
        console.error('Rollback config import error:', rollbackError);
      }
    }

    console.error('Import config error:', error);
    const status = error instanceof ImportInputError ? 400 : 500;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '导入失败' },
      { status }
    );
  }
}

type ImportTableData = {
  providers?: unknown[];
  aiConfigs?: unknown[];
  domains?: unknown[];
  records?: unknown[];
};

type ImportPayload = {
  version?: string;
  encryptionKey?: string;
  data: ImportTableData;
};

class ImportInputError extends Error {}

function parseImportPayload(input: unknown, password?: string): ImportPayload {
  let candidate = input;

  for (let index = 0; index < 4; index++) {
    if (typeof candidate === 'string') {
      candidate = parsePasswordProtectedPayload(candidate, password);
      continue;
    }

    if (!isRecord(candidate)) break;

    if (candidate.encrypted === true) {
      const encryptedData = candidate.data;
      if (typeof encryptedData !== 'string') {
        throw new ImportInputError('加密配置文件格式不正确');
      }
      candidate = parsePasswordProtectedPayload(encryptedData, password);
      continue;
    }

    if ('success' in candidate && 'data' in candidate) {
      candidate = candidate.data;
      continue;
    }

    break;
  }

  if (!isRecord(candidate)) {
    throw new ImportInputError('配置文件格式不正确');
  }

  const rawData = getRaw(candidate, 'data');
  const rawTables = isRecord(rawData) ? rawData : candidate;

  if (!isRecord(rawTables)) {
    throw new ImportInputError('配置文件缺少 data 数据');
  }

  const tableData = {
    providers: getOptionalArray(rawTables, 'providers'),
    aiConfigs: getOptionalArray(rawTables, 'aiConfigs', 'ai_configs'),
    domains: getOptionalArray(rawTables, 'domains'),
    records: getOptionalArray(rawTables, 'records'),
  };

  if (!tableData.providers && !tableData.aiConfigs && !tableData.domains && !tableData.records) {
    throw new ImportInputError('配置文件中没有可导入的数据');
  }

  return {
    version: getString(candidate, 'version'),
    encryptionKey: getString(candidate, 'encryptionKey', 'encryption_key'),
    data: tableData,
  };
}

function parsePasswordProtectedPayload(encryptedData: string, password?: string): unknown {
  if (!password) {
    throw new ImportInputError('此配置文件已加密，请输入解密密码');
  }

  try {
    return JSON.parse(decryptWithPassword(encryptedData, password));
  } catch {
    throw new ImportInputError('密码错误，无法解密配置文件');
  }
}

function normalizeEncryptedField(
  value: unknown,
  sourceKey: string,
  currentKey: string,
  label: string
): string {
  if (value === undefined || value === null || value === '') return '';

  if (isRecord(value) || Array.isArray(value)) {
    return encrypt(JSON.stringify(value));
  }

  const ciphertext = String(value).trim();
  if (!ciphertext) return '';

  if (sourceKey && currentKey && sourceKey !== currentKey) {
    try {
      return encrypt(decryptWithKey(ciphertext, sourceKey));
    } catch {
      throw new ImportInputError(`${label} 密钥迁移失败，请确认导出文件完整且未被修改`);
    }
  }

  try {
    decrypt(ciphertext);
    return ciphertext;
  } catch {
    if (!sourceKey) {
      throw new ImportInputError(`${label} 无法解密：导入文件缺少源系统密钥，请在源系统使用新版导出功能重新导出`);
    }
    throw new ImportInputError(`${label} 无法使用当前密钥解密，请重新导出配置文件`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRaw(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

function getString(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  const value = getRaw(row, ...keys);
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function getNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  const value = getRaw(row, ...keys);
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function getBoolean(
  row: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  defaultValue: boolean
): boolean {
  const value = getRaw(row, camelKey, snakeKey);
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return Boolean(value);
}

function getOptionalArray(row: Record<string, unknown>, ...keys: string[]): unknown[] | undefined {
  const value = getRaw(row, ...keys);
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ImportInputError(`配置文件字段 ${keys[0]} 必须是数组`);
  }
  return value;
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
