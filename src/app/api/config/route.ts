import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders, aiConfigurations, domains, dnsRecords } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  encryptWithPassword,
  decryptWithPassword,
  encrypt,
  decrypt,
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

    const providers = await db.select().from(dnsProviders);
    const aiConfigs = await db.select().from(aiConfigurations);
    const allDomains = await db.select().from(domains);
    const allRecords = await db.select().from(dnsRecords);

    const exportData = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      encryptionKey: getEncryptionKey(), // 附带源系统密钥，供导入时凭证迁移
      data: {
        providers,
        aiConfigs,
        domains: allDomains,
        records: allRecords,
      },
    };

    if (password) {
      // 密码加密模式
      const jsonStr = JSON.stringify(exportData);
      const encrypted = encryptWithPassword(jsonStr, password);

      return NextResponse.json({
        success: true,
        encrypted: true,
        data: encrypted,
      });
    }

    // 无密码模式（向后兼容，但跨系统导入会失败）
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
      // 加密内容，需要密码
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
      // 明文 JSON（向后兼容旧版无密码导出）
      importPayload = data;
    }

    // 如果不是覆盖模式，检查是否已有数据
    if (!overwrite) {
      const existingProviders = await db.select().from(dnsProviders);
      if (existingProviders.length > 0) {
        return NextResponse.json(
          { success: false, error: '系统已有配置数据，请勾选"覆盖现有数据"' },
          { status: 400 }
        );
      }
    }

    // 覆盖模式：先清空现有数据
    if (overwrite) {
      await db.delete(dnsRecords);
      await db.delete(domains);
      await db.delete(dnsProviders);
      await db.delete(aiConfigurations);
    }

    const sourceKey = importPayload.encryptionKey || '';
    const currentKey = getEncryptionKey();
    const needKeyMigration = sourceKey && currentKey && sourceKey !== currentKey;

    const payload = importPayload.data;

    // 导入服务商配置（处理跨密钥凭证迁移）
    if (payload.providers && Array.isArray(payload.providers)) {
      for (const provider of payload.providers as Array<Record<string, unknown>>) {
        let credentials = provider.credentials as string | undefined;

        // 如果源系统密钥与当前系统不同，需要解密后用新密钥重新加密
        if (needKeyMigration && credentials) {
          try {
            // 用源密钥解密
            const plainCredentials = decryptWithKey(credentials, sourceKey);
            // 用当前系统密钥重新加密
            credentials = encrypt(plainCredentials);
          } catch {
            // 如果解密失败（可能明文存储或旧格式），保持原样
            console.warn(`无法迁移提供商 "${provider.name}" 的凭证加密，将保留原始数据`);
          }
        }

        await db.insert(dnsProviders).values({
          name: (provider.name as string) || '',
          type: (provider.type as string) || 'cloudflare',
          credentials: credentials || '',
          isActive: (provider.isActive as boolean) ?? true,
          createdAt: (provider.createdAt as string) ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 导入 AI 配置（处理跨密钥凭证迁移）
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

        await db.insert(aiConfigurations).values({
          name: (config.name as string) || '',
          providerType: (config.providerType as string) ?? 'custom',
          apiUrl: (config.apiUrl as string) || '',
          modelId: (config.modelId as string) || '',
          apiKey: apiKey || '',
          isActive: (config.isActive as boolean) ?? true,
          createdAt: (config.createdAt as string) ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 导入域名
    if (payload.domains && Array.isArray(payload.domains)) {
      for (const domain of payload.domains as Array<Record<string, unknown>>) {
        await db.insert(domains).values({
          providerId: domain.providerId as number,
          name: (domain.name as string) || '',
          isActive: (domain.isActive as boolean) ?? true,
          lastSyncedAt: domain.lastSyncedAt as string | null,
          createdAt: (domain.createdAt as string) ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 导入 DNS 记录
    if (payload.records && Array.isArray(payload.records)) {
      for (const record of payload.records as Array<Record<string, unknown>>) {
        await db.insert(dnsRecords).values({
          domainId: record.domainId as number,
          type: (record.type as string) || 'A',
          name: (record.name as string) || '',
          content: (record.content as string) || '',
          ttl: (record.ttl as number) ?? 600,
          priority: record.priority as number | undefined,
          providerRecordId: record.providerRecordId as string | undefined,
          isActive: (record.isActive as boolean) ?? true,
          createdAt: (record.createdAt as string) ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
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
 * 用指定密钥解密（用于跨系统凭证迁移，不暴露给外部）
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