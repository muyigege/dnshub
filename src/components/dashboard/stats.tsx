'use client';

import { useEffect, useState } from 'react';

/**
 * Dashboard 统计数据组件（客户端版本）
 * 从 API 获取统计数据
 */
export function DashboardStats() {
  const [stats, setStats] = useState({
    providers: 0,
    domains: 0,
    records: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 从 API 获取统计数据
    fetch('/api/stats')
      .then(res => res.json())
      .then(response => {
        if (response.success && response.data) {
          setStats(response.data);
        }
      })
      .catch(error => {
        console.error('Failed to fetch stats:', error);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 服务商统计 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">服务商</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {stats.providers}
            </p>
          </div>
          <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <svg className="h-6 w-6 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">已配置的 DNS 服务商</p>
      </div>

      {/* 域名统计 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">域名</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {stats.domains}
            </p>
          </div>
          <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
            <svg className="h-6 w-6 text-green-600 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">已同步的域名数量</p>
      </div>

      {/* DNS 记录统计 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">DNS 记录</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {stats.records}
            </p>
          </div>
          <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
            <svg className="h-6 w-6 text-purple-600 dark:text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">已配置的 DNS 记录</p>
      </div>
    </div>
  );
}
