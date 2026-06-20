import { NextRequest, NextResponse } from 'next/server';
import { normalizeAIChatCompletionsUrl } from '@/lib/ai-config-helpers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, modelId, apiKey } = body;

    if (!apiUrl || !modelId || !apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          messageCn: '请填写 API URL、模型 ID 和 API Key',
          messageEn: 'Please fill API URL, Model ID and API Key',
        },
        { status: 400 }
      );
    }

    const normalizedApiUrl = normalizeAIChatCompletionsUrl(String(apiUrl));
    const response = await fetch(normalizedApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
      return NextResponse.json(
        {
          success: false,
          error: `API request failed: ${response.status} - ${errorText.slice(0, 500)}`,
          messageCn:
            response.status === 404
              ? `模型接口返回 404，请确认地址是否为 ${normalizedApiUrl}`
              : `模型接口请求失败（${response.status}）`,
          messageEn: `Model API request failed (${response.status})`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Connection successful',
      data: { apiUrl: normalizedApiUrl },
    });
  } catch (error) {
    console.error('Test AI configuration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test AI configuration',
        messageCn: '测试连接失败，请检查网络或接口配置',
        messageEn: 'Connection test failed, please check network or API configuration',
      },
      { status: 500 }
    );
  }
}
