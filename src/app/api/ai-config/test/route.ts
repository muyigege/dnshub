import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai-config/test
 * 测试 AI 配置连接
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, modelId, apiKey } = body;

    if (!apiUrl || !modelId || !apiKey) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段' },
        { status: 400 }
      );
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Connection successful',
    });
  } catch (error) {
    console.error('Test AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test AI configuration',
      },
      { status: 500 }
    );
  }
}
