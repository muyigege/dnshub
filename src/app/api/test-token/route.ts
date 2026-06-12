import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { dnsProviders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/test-token - 测试服务商的 API Token
 */
export async function GET(request: NextRequest) {
  try {

    // 获取查询参数中的 provider ID
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
    const apiToken = credentials.apiToken;

    if (!apiToken) {
      return NextResponse.json(
        { success: false, error: 'API Token 为空' },
        { status: 400 }
      );
    }

    // 调用 Cloudflare API
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    return NextResponse.json({
      success: true,
      apiTokenLength: apiToken.length,
      apiTokenPrefix: apiToken.substring(0, 10) + '...',
      apiTokenSuffix: '...' + apiToken.substring(apiToken.length - 4),
      cloudflareResponse: {
        status: response.status,
        ok: response.ok,
        success: data.success,
        errors: data.errors,
        result: data.result,
      },
    });
  } catch (error) {
    console.error('Test token error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '测试失败',
      },
      { status: 500 }
    );
  }
}
