import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { decryptJSON } from '@/lib/encryption';
import { dnsProviders } from '@/lib/db/schema';

/**
 * GET /api/diagnose - 诊断服务商数据
 */
export async function GET() {
  try {
    const providers = await db.select().from(dnsProviders);

    const results = providers.map((provider) => {
      let decryptedInfo = null;
      let decryptError = null;

      // 尝试解密
      try {
        const decrypted = decryptJSON<Record<string, string>>(provider.credentials);
        decryptedInfo = {
          hasApiToken: !!decrypted.apiToken,
          apiTokenLength: decrypted.apiToken?.length || 0,
          apiTokenPrefix: decrypted.apiToken?.substring(0, 10) || '',
          credentialsKeys: Object.keys(decrypted),
        };
      } catch (error) {
        decryptError = error instanceof Error ? error.message : String(error);
      }

      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        encryptedLength: provider.credentials.length,
        encryptedPrefix: provider.credentials.substring(0, 50),
        decryptedInfo,
        decryptError,
      };
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      providers: results,
    });
  } catch (error) {
    console.error('Diagnosis error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '诊断失败',
      },
      { status: 500 }
    );
  }
}
