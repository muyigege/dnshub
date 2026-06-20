import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { encryptJSON } from '@/lib/encryption';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dnsProviders, operationLogs } from '@/lib/db/schema';
import { handleCloudError, successResponse, validateRequired } from '@/lib/api';

const validTypes = [
  'cloudflare',
  'aliyun',
  'tencent',
  'digitalocean',
  'godaddy',
  'porkbun',
  'namesilo',
  'hetzner',
  'route53',
  'google',
  'huawei',
] as const;

type ProviderTypeValue = typeof validTypes[number];

function missingCredential(messageCn: string, messageEn: string) {
  return NextResponse.json({
    success: false,
    code: 'MISSING_CREDENTIAL',
    messageCn,
    messageEn,
  }, { status: 400 });
}

function parseGoogleServiceAccount(serviceAccountJson?: string) {
  if (!serviceAccountJson?.trim()) return null;
  const parsed = JSON.parse(serviceAccountJson);
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

function buildCredentials(type: ProviderTypeValue, body: any) {
  const credentials: Record<string, string> = {};

  if (type === 'cloudflare') {
    if (body.apiKey && body.email) {
      credentials.apiKey = body.apiKey;
      credentials.email = body.email;
    } else if (body.apiToken) {
      credentials.apiToken = body.apiToken;
    }
  }

  if (type === 'aliyun') {
    if (body.accessKeyId) credentials.accessKeyId = body.accessKeyId;
    if (body.accessKeySecret) credentials.accessKeySecret = body.accessKeySecret;
    if (body.regionId) credentials.regionId = body.regionId;
  }

  if (type === 'tencent') {
    if (body.secretId) credentials.secretId = body.secretId;
    if (body.secretKey) credentials.secretKey = body.secretKey;
    if (body.region) credentials.region = body.region;
  }

  if (type === 'digitalocean' || type === 'hetzner') {
    if (body.apiToken) credentials.apiToken = body.apiToken;
  }

  if (type === 'godaddy') {
    if (body.apiKey) credentials.apiKey = body.apiKey;
    if (body.apiSecret) credentials.apiSecret = body.apiSecret;
    if (body.shopperId) credentials.shopperId = body.shopperId;
  }

  if (type === 'porkbun') {
    if (body.apiKey) credentials.apiKey = body.apiKey;
    if (body.secretApiKey) credentials.secretApiKey = body.secretApiKey;
  }

  if (type === 'namesilo') {
    if (body.apiKey) credentials.apiKey = body.apiKey;
  }

  if (type === 'route53') {
    if (body.accessKeyId) credentials.accessKeyId = body.accessKeyId;
    if (body.secretAccessKey) credentials.secretAccessKey = body.secretAccessKey;
  }

  if (type === 'google') {
    const serviceAccount = parseGoogleServiceAccount(body.serviceAccountJson);
    credentials.projectId = body.projectId || serviceAccount?.projectId;
    credentials.clientEmail = body.clientEmail || serviceAccount?.clientEmail;
    credentials.privateKey = body.privateKey || serviceAccount?.privateKey;
  }

  if (type === 'huawei') {
    if (body.accessKeyId) credentials.accessKeyId = body.accessKeyId;
    if (body.secretAccessKey) credentials.secretAccessKey = body.secretAccessKey;
    if (body.region) credentials.region = body.region;
  }

  return credentials;
}

function validateCredentials(type: ProviderTypeValue, credentials: Record<string, string>) {
  if (type === 'cloudflare' && !credentials.apiToken && !(credentials.apiKey && credentials.email)) {
    return missingCredential('Cloudflare 需要 API Token 或 Global API Key + Email', 'Cloudflare requires API Token or Global API Key + Email');
  }
  if (type === 'aliyun' && (!credentials.accessKeyId || !credentials.accessKeySecret)) {
    return missingCredential('阿里云需要 AccessKey ID 和 AccessKey Secret', 'Aliyun requires AccessKey ID and AccessKey Secret');
  }
  if (type === 'tencent' && (!credentials.secretId || !credentials.secretKey)) {
    return missingCredential('腾讯云需要 Secret ID 和 Secret Key', 'Tencent Cloud requires Secret ID and Secret Key');
  }
  if ((type === 'digitalocean' || type === 'hetzner') && !credentials.apiToken) {
    return missingCredential('该服务商需要 API Token', 'This provider requires an API Token');
  }
  if (type === 'godaddy' && (!credentials.apiKey || !credentials.apiSecret)) {
    return missingCredential('GoDaddy 需要 API Key 和 API Secret', 'GoDaddy requires API Key and API Secret');
  }
  if (type === 'porkbun' && (!credentials.apiKey || !credentials.secretApiKey)) {
    return missingCredential('Porkbun 需要 API Key 和 Secret API Key', 'Porkbun requires API Key and Secret API Key');
  }
  if (type === 'namesilo' && !credentials.apiKey) {
    return missingCredential('NameSilo 需要 API Key', 'NameSilo requires API Key');
  }
  if (type === 'route53' && (!credentials.accessKeyId || !credentials.secretAccessKey)) {
    return missingCredential('AWS Route53 需要 Access Key ID 和 Secret Access Key', 'AWS Route53 requires Access Key ID and Secret Access Key');
  }
  if (type === 'google' && (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey)) {
    return missingCredential('Google Cloud DNS 需要服务账号 JSON，或 Project ID、Client Email 和 Private Key', 'Google Cloud DNS requires a service account JSON or Project ID, Client Email and Private Key');
  }
  if (type === 'huawei' && (!credentials.accessKeyId || !credentials.secretAccessKey)) {
    return missingCredential('华为云 DNS 需要 Access Key ID 和 Secret Access Key', 'Huawei Cloud DNS requires Access Key ID and Secret Access Key');
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, type } = body;

    const validationError = validateRequired({ name, type }, ['name', 'type']);
    if (validationError) return NextResponse.json(validationError, { status: 400 });

    if (!validTypes.includes(type)) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_TYPE',
        messageCn: '无效的服务商类型',
        messageEn: 'Invalid provider type',
      }, { status: 400 });
    }

    let credentials: Record<string, string>;
    try {
      credentials = buildCredentials(type, body);
    } catch (error) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_CREDENTIAL',
        messageCn: '凭证格式无效，请检查输入内容',
        messageEn: 'Invalid credential format, please check input',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }

    const credentialError = validateCredentials(type, credentials);
    if (credentialError) return credentialError;

    const encryptedCredentials = encryptJSON(credentials);
    let result;

    if (id) {
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
      const [created] = await db
        .insert(dnsProviders)
        .values({ name, type, credentials: encryptedCredentials, isActive: true })
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