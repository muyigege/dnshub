import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/test-raw-token - 直接测试原始 API Token
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: '缺少 token 参数' },
        { status: 400 }
      );
    }

    console.log('Testing Cloudflare API Token...');
    console.log('Token length:', token.length);
    console.log('Token prefix:', token.substring(0, 10) + '...');

    // 调用 Cloudflare API 验证端点
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    console.log('Cloudflare API Response status:', response.status);
    console.log('Cloudflare API Response:', JSON.stringify(data, null, 2));

    // 尝试获取 Zone 列表
    const zonesResponse = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=5', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const zonesData = await zonesResponse.json();

    return NextResponse.json({
      success: true,
      tokenInfo: {
        length: token.length,
        prefix: token.substring(0, 10) + '...',
        suffix: '...' + token.substring(token.length - 4),
      },
      tokenVerifyResponse: {
        status: response.status,
        ok: response.ok,
        success: data.success,
        errors: data.errors,
        result: data.result,
      },
      zonesResponse: {
        status: zonesResponse.status,
        ok: zonesResponse.ok,
        success: zonesData.success,
        count: zonesData.result?.length || 0,
        zones: zonesData.result?.map((z: any) => ({ id: z.id, name: z.name, status: z.status })) || [],
        errors: zonesData.errors,
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
