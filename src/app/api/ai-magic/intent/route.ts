import { NextRequest, NextResponse } from 'next/server';
import { parseDnsInstruction } from '@/lib/ai/parser';
import { db } from '@/lib/db/connection';
import { domains } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * POST /api/ai-magic/intent
 * 接收自然语言输入，结合当前用户域名信息，调用大模型解析意图
 */
export async function POST(request: NextRequest) {

    try {
        const { prompt } = await request.json();

        if (!prompt) {
            return NextResponse.json(
                { success: false, error: '输入指令不能为空' },
                { status: 400 }
            );
        }

        // 获取有权限的域名列表，提供给大模型作为上下文提示
        const dbDomains = await db.select().from(domains).where(sql`${domains.isActive} = true`);
        const domainNames = dbDomains.map((d) => d.name).join(', ');

        // 增强 Prompt：带上用户现有的域名范围
        const enhancedPrompt = `用户可管理的域名列表有: [${domainNames || '无'}]。用户的指令是: ${prompt}。如果指令中没有明确顶级域名，请结合上述列表推断。`;

        const result = await parseDnsInstruction(enhancedPrompt);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error, rawResponse: result.rawResponse },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result.result,
        });
    } catch (error) {
        console.error('AI intent parse error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : '解析失败' },
            { status: 500 }
        );
    }
}
