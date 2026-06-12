import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { dnsProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/test-cloudflare-headers - 测试 Cloudflare 请求头
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const providerId = searchParams.get('id');

    if (!providerId) {
      return NextResponse.json(
        { success: false, error: '缺少 provider ID 参数' },
        { status: 400 }
      );
    }

    // 获取服务商信息
    const [provider] = await db
      .select()
      .from(dnsProviders)
      .where(eq(dnsProviders.id, parseInt(providerId, 10)));

    if (!provider) {
      return NextResponse.json(
        { success: false, error: '服务商不存在' },
        { status: 404 }
      );
    }

    // 解密凭证
    const credentials = decryptJSON<Record<string, string>>(provider.credentials);

    console.log('Credentials keys:', Object.keys(credentials));
    console.log('Has apiKey:', !!credentials.apiKey);
    console.log('Has email:', !!credentials.email);
    console.log('Has apiToken:', !!credentials.apiToken);

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const useApiKey = !!(credentials.apiKey && credentials.email);

    if (useApiKey) {
      // 使用 Global API Key 方式
      headers['X-Auth-Key'] = credentials.apiKey!;
      headers['X-Auth-Email'] = credentials.email!;
      console.log('Using Global API Key method');
      console.log('X-Auth-Email:', credentials.email);
      console.log('X-Auth-Key length:', credentials.apiKey!.length);
    } else {
      // 使用 API Token 方式
      headers['Authorization'] = `Bearer ${credentials.apiToken}`;
      console.log('Using API Token method');
    }

    // 测试 API 调用
    const response = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=1', {
      method: 'GET',
      headers: headers,
    });

    const data = await response.json();

    return NextResponse.json({
      success: true,
      authMethod: useApiKey ? 'Global API Key' : 'API Token',
      headers: {
        'Content-Type': headers['Content-Type'],
        'X-Auth-Email': headers['X-Auth-Email'] ? '***' + headers['X-Auth-Email'].split('@')[0] : undefined,
        'X-Auth-Key': headers['X-Auth-Key'] ? headers['X-Auth-Key'].substring(0, 10) + '...' : undefined,
        'Authorization': headers['Authorization'] ? headers['Authorization'].substring(0, 20) + '...' : undefined,
      },
      apiResponse: {
        status: response.status,
        ok: response.ok,
        success: data.success,
        errors: data.errors,
        result: data.result,
      },
    });
  } catch (error) {
    console.error('Test cloudflare headers error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '测试失败',
      },
      { status: 500 }
    );
  }
}
