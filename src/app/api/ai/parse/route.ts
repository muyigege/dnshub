'use server';

import { parseDnsInstruction } from '@/lib/ai/parser';
import { isClarification } from '@/lib/ai/parser';

/**
 * API Route: 解析 DNS 指令
 * 用于客户端调用 AI parser
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json(
        {
          success: false,
          error: 'Invalid prompt',
        },
        { status: 400 }
      );
    }

    // 调用 AI parser
    const result = await parseDnsInstruction(prompt);

    return Response.json(result);
  } catch (error) {
    console.error('Parse DNS instruction API error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
