import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { encryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dnsProviders, operationLogs } from '@/lib/db/schema';
import { handleCloudError, successResponse, validateRequired } from '@/lib/api';

/**
 * POST /api/providers - 添加或更新服务商
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, type, apiToken, apiKey, email, accessKeyId, accessKeySecret, secretId, secretKey } = body;

    // 验证必填字段
    const validationError = validateRequired({ name, type }, ['name', 'type']);
    if (validationError) {
      return NextResponse.json(validationError, { status: 400 });
    }

    // 验证类型
    const validTypes = ['cloudflare', 'aliyun', 'tencent'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_TYPE',
        messageCn: '无效的服务商类型',
        messageEn: 'Invalid provider type',
      }, { status: 400 });
    }

    // 根据类型验证和构建凭证
    const credentials: Record<string, string> = {};

    if (type === 'cloudflare') {
      if (apiKey && email) {
        credentials.apiKey = apiKey;
        credentials.email = email;
      } else if (apiToken) {
        credentials.apiToken = apiToken;
      } else {
        return NextResponse.json({
          success: false,
          code: 'MISSING_CREDENTIAL',
          messageCn: 'Cloudflare 需要 API Token 或 Global API Key + Email',
          messageEn: 'Cloudflare requires API Token or Global API Key + Email',
        }, { status: 400 });
      }
    } else if (type === 'aliyun') {
      if (!accessKeyId || !accessKeySecret) {
        return NextResponse.json({
          success: false,
          code: 'MISSING_CREDENTIAL',
          messageCn: '阿里云需要 AccessKey ID 和 Secret',
          messageEn: 'Aliyun requires AccessKey ID and Secret',
        }, { status: 400 });
      }
      credentials.accessKeyId = accessKeyId;
      credentials.accessKeySecret = accessKeySecret;
    } else if (type === 'tencent') {
      if (!secretId || !secretKey) {
        return NextResponse.json({
          success: false,
          code: 'MISSING_CREDENTIAL',
          messageCn: '腾讯云需要 Secret ID 和 Key',
          messageEn: 'Tencent requires Secret ID and Key',
        }, { status: 400 });
      }
      credentials.secretId = secretId;
      credentials.secretKey = secretKey;
    }

    // 加密凭证
    const encryptedCredentials = encryptJSON(credentials);

    let result;

    if (id) {
      // 更新
      const [updated] = await db
        .update(dnsProviders)
        .set({
          name,
          type,
          credentials: encryptedCredentials,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(dnsProviders.id, id))
        .returning();

      if (!updated) {
        return NextResponse.json({
          success: false,
          code: 'NOT_FOUND',
          messageCn: '服务商不存在',
          messageEn: 'Provider not found',
        }, { status: 404 });
      }

      await db.insert(operationLogs).values({
        action: 'UPDATE',
        entityType: 'provider',
        entityId: updated.id,
        details: JSON.stringify({ name, type }),
        status: 'success',
        createdBy: 'system',
      });

      result = { id: updated.id, name: updated.name, type: updated.type };
    } else {
      // 创建
      const [created] = await db
        .insert(dnsProviders)
        .values({
          name,
          type,
          credentials: encryptedCredentials,
          isActive: true,
        })
        .returning();

      await db.insert(operationLogs).values({
        action: 'CREATE',
        entityType: 'provider',
        entityId: created.id,
        details: JSON.stringify({ name, type }),
        status: 'success',
        createdBy: 'system',
      });

      result = { id: created.id, name: created.name, type: created.type };
    }

    revalidatePath('/providers');
    return NextResponse.json(successResponse(result));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}

/**
 * GET /api/providers - 获取所有服务商列表
 */
export async function GET() {
  try {
    const providers = await db
      .select({
        id: dnsProviders.id,
        name: dnsProviders.name,
        type: dnsProviders.type,
        isActive: dnsProviders.isActive,
        createdAt: dnsProviders.createdAt,
        updatedAt: dnsProviders.updatedAt,
      })
      .from(dnsProviders);

    return NextResponse.json(successResponse(providers));
  } catch (error) {
    return NextResponse.json(handleCloudError(error), { status: 500 });
  }
}