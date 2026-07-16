'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/context';
import { useToast } from '@/components/ui/toast';
import {
  CheckCircle, XCircle, RefreshCw, Plus, Edit2, Trash2,
  Upload, Download, RotateCcw, Layers, ChevronLeft, ChevronRight,
  Filter, Eye, AlertCircle, Clock,
} from 'lucide-react';

// ============================================================
// 类型定义（与 /api/operations 响应对齐）
// ============================================================

interface OperationRow {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  details: unknown;
  status: string;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: string;
  source: string | null;
  actor: string | null;
  clientName: string | null;
  batchId: string | null;
  providerId: number | null;
  domainId: number | null;
  recordId: number | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  rolledBackAt: string | null;
  rollbackOf: number | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================
// 标签映射
// ============================================================

const ACTION_BADGES: Record<string, { icon: any; color: string; key: string }> = {
  CREATE: { icon: Plus, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', key: 'logs.actionCreate' },
  UPDATE: { icon: Edit2, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', key: 'logs.actionUpdate' },
  DELETE: { icon: Trash2, color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', key: 'logs.actionDelete' },
  SYNC: { icon: RefreshCw, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300', key: 'logs.actionSync' },
  TEST: { icon: CheckCircle, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300', key: 'logs.actionTest' },
  ROLLBACK: { icon: RotateCcw, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', key: 'logs.actionRollback' },
  BATCH: { icon: Layers, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300', key: 'logs.actionBatch' },
  IMPORT: { icon: Upload, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300', key: 'logs.actionCreate' },
  EXPORT: { icon: Download, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300', key: 'logs.actionCreate' },
};

const STATUS_BADGES: Record<string, { icon: any; color: string; key: string }> = {
  success: { icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', key: 'logs.statusSuccess' },
  failed: { icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', key: 'logs.statusFailed' },
  partial: { icon: AlertCircle, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', key: 'logs.statusPartial' },
  pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', key: 'logs.statusPending' },
  running: { icon: RefreshCw, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', key: 'logs.statusPending' },
  rolled_back: { icon: RotateCcw, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', key: 'logs.statusRolledBack' },
  rollback_failed: { icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', key: 'logs.statusRollbackFailed' },
};

const SOURCE_BADGES: Record<string, { key: string }> = {
  ui: { key: 'logs.sourceUi' },
  rest: { key: 'logs.sourceRest' },
  ai: { key: 'logs.sourceAi' },
  mcp: { key: 'logs.sourceMcp' },
  system: { key: 'logs.sourceSystem' },
};

const ENTITY_LABELS: Record<string, { zh: string; en: string }> = {
  provider: { zh: '服务商', en: 'Provider' },
  domain: { zh: '域名', en: 'Domain' },
  record: { zh: '记录', en: 'Record' },
  config: { zh: '配置', en: 'Config' },
  ai_config: { zh: 'AI配置', en: 'AI Config' },
};

const PAGE_SIZE = 20;
const ACTION_OPTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'SYNC', 'ROLLBACK', 'BATCH'];
const STATUS_OPTIONS = ['', 'success', 'failed', 'partial', 'rolled_back', 'rollback_failed'];
const SOURCE_OPTIONS = ['', 'ui', 'rest', 'ai', 'mcp', 'system'];

// ============================================================
// 页面
// ============================================================

export default function LogsPage() {
  const { t, lang, isMounted } = useI18n();
  const toast = useToast();

  const [rows, setRows] = useState<OperationRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const fetchData = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (filterAction) params.set('action', filterAction);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSource) params.set('source', filterSource);

      const res = await fetch(`/api/operations?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.messageCn || json.messageEn || 'Failed');
      }
      setRows(json.data as OperationRow[]);
      setPagination(json.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error('加载操作日志失败', 'Failed to load operation logs');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterStatus, filterSource, toast]);

  useEffect(() => {
    if (isMounted) fetchData(1);
  }, [isMounted, fetchData]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const summarizeDetails = (details: unknown): string => {
    if (!details) return '-';
    if (typeof details === 'string') return details;
    try {
      const d = details as Record<string, unknown>;
      const parts: string[] = [];
      if (d.domain) parts.push(String(d.domain));
      if (d.type) parts.push(String(d.type));
      if (d.name) parts.push(String(d.name));
      if (d.content) parts.push(`→ ${d.content}`);
      if (d.synced !== undefined) parts.push(`${lang === 'zh' ? '新增' : 'synced'} ${d.synced}`);
      if (d.total !== undefined) parts.push(`${lang === 'zh' ? '共' : 'total'} ${d.total}`);
      return parts.length > 0 ? parts.join(' ') : JSON.stringify(d).slice(0, 80);
    } catch {
      return String(details).slice(0, 80);
    }
  };

  const getActionBadge = (action: string) => {
    return ACTION_BADGES[action.toUpperCase()] || { icon: RefreshCw, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', key: '' };
  };

  const getStatusBadge = (status: string) => {
    return STATUS_BADGES[status.toLowerCase()] || { icon: AlertCircle, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', key: '' };
  };

  const handleFilterChange = () => {
    fetchData(1);
  };

  const clearFilters = () => {
    setFilterAction('');
    setFilterStatus('');
    setFilterSource('');
  };

  const hasFilters = filterAction || filterStatus || filterSource;

  // 水合安全占位
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 标题 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('logs.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('logs.totalRecords', { total: pagination.total })}
            </p>
          </div>
          <button
            onClick={() => fetchData(pagination.page)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
            <Filter className="w-4 h-4" />
            <span>{t('common.filter')}</span>
          </div>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">{t('logs.filterAction')}: {t('logs.all')}</option>
            {ACTION_OPTIONS.slice(1).map((a) => (
              <option key={a} value={a}>{t('logs.filterAction')}: {t(`logs.action${a.charAt(0)}${a.slice(1).toLowerCase()}`) !== `logs.action${a.charAt(0)}${a.slice(1).toLowerCase()}` ? t(`logs.action${a.charAt(0)}${a.slice(1).toLowerCase()}`) : a}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">{t('logs.filterStatus')}: {t('logs.all')}</option>
            {STATUS_OPTIONS.slice(1).map((s) => (
              <option key={s} value={s}>{t('logs.filterStatus')}: {t(`logs.status${s.charAt(0).toUpperCase()}${s.slice(1).replace('_', '')}`) !== `logs.status${s.charAt(0).toUpperCase()}${s.slice(1).replace('_', '')}` ? t(`logs.status${s.charAt(0).toUpperCase()}${s.slice(1).replace('_', '')}`) : s}</option>
            ))}
          </select>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">{t('logs.filterSource')}: {t('logs.all')}</option>
            {SOURCE_OPTIONS.slice(1).map((s) => (
              <option key={s} value={s}>{t('logs.filterSource')}: {t(`logs.source${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</option>
            ))}
          </select>
          <button
            onClick={handleFilterChange}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            {t('common.filter')}
          </button>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              {t('logs.clearFilter')}
            </button>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* 表格 */}
        {loading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">{t('logs.noLogs')}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.time')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.action')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.entity')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.source')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.details')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('logs.status')}</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((row) => {
                    const action = getActionBadge(row.action);
                    const status = getStatusBadge(row.status);
                    const ActionIcon = action.icon;
                    const StatusIcon = status.icon;
                    const entityLabel = ENTITY_LABELS[row.entityType]?.[lang] || row.entityType;
                    const sourceKey = row.source ? SOURCE_BADGES[row.source]?.key : null;
                    const isRolledBack = !!row.rolledBackAt;
                    return (
                      <tr key={row.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${isRolledBack ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${action.color}`}>
                            <ActionIcon className="w-3 h-3" />
                            {action.key ? t(action.key) : row.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {entityLabel} <span className="text-gray-400">#{row.entityId}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {sourceKey && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              {t(sourceKey)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={summarizeDetails(row.details)}>
                          {summarizeDetails(row.details)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.key ? t(status.key) : row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <Link
                            href={`/operations/${row.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t('logs.viewDetail')}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {t('logs.totalRecords', { total: pagination.total })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchData(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {t('logs.prev')}
                  </button>
                  <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => fetchData(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages || loading}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('logs.next')}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
