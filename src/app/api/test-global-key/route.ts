import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/test-global-key - 测试 Global API Key 方式
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const apiKey = searchParams.get('key');
    const email = searchParams.get('email');

    if (!apiKey || !email) {
      return NextResponse.json(
        { success: false, error: '缺少 key 或 email 参数' },
        { status: 400 }
      );
    }

    console.log('Testing Cloudflare Global API Key...');
    console.log('Email:', email);
    console.log('API Key length:', apiKey.length);

    // 使用 Global API Key 的方式获取 Zone 列表
    const zonesResponse = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=5', {
      method: 'GET',
      headers: {
        'X-Auth-Email': email,
        'X-Auth-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const zonesData = await zonesResponse.json();

    console.log('Zones response status:', zonesResponse.status);

    // 尝试获取用户信息
    const userResponse = await fetch('https://api.cloudflare.com/client/v4/user', {
      method: 'GET',
      headers: {
        'X-Auth-Email': email,
        'X-Auth-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const userData = await userResponse.json();

    return NextResponse.json({
      success: true,
      userInfo: {
        status: userResponse.status,
        success: userData.success,
        result: userData.result ? {
          id: userData.result.id,
          email: userData.result.email,
          username: userData.result.username,
        } : null,
        errors: userData.errors,
      },
      zonesInfo: {
        status: zonesResponse.status,
        success: zonesData.success,
        count: zonesData.result?.length || 0,
        zones: zonesData.result?.map((z: any) => ({ id: z.id, name: z.name, status: z.status })) || [],
        errors: zonesData.errors,
      },
    });
  } catch (error) {
    console.error('Test global key error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '测试失败',
      },
      { status: 500 }
    );
  }
}
