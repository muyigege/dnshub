import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsProviders } from '@/lib/db/schema';

/**
 * POST /api/providers/clear - 清空所有服务商（用于解决加密密钥变更问题）
 * 注意：此操作会删除所有服务商及其相关数据
 */
export async function POST() {
  try {

    // 删除所有服务商（会级联删除相关域名和记录）
    await db.delete(dnsProviders);

    return NextResponse.json({
      success: true,
      message: '已清空所有服务商数据',
    });
  } catch (error) {
    console.error('Clear providers error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '清空失败',
      },
      { status: 500 }
    );
  }
}
