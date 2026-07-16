import { NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { operationLogs } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * GET /api/logs
 * 获取操作日志列表
 */
export async function GET() {
  try {
    const logs = await db
      .select()
      .from(operationLogs)
      .orderBy(desc(operationLogs.createdAt))
      .limit(100);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Get logs error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}