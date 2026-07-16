'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft, RotateCcw, CheckCircle, XCircle, AlertCircle, Clock,
  RefreshCw, Loader2, ShieldAlert, Info,
} from 'lucide-react';

// ============================================================
// 类型定义
// ============================================================

interface OperationDetail {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  details: unknown;
  status: string;
  errorMessage: string | null;
  errorCode: string | null;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  source: string | null;
  actor: string | null;
  clientName: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  batchId: string | null;
  parentOperationId: number | null;
  providerId: number | null;
  domainId: number | null;
  recordId: number | null;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  requestedSnapshot: unknown;
  rolledBackAt: string | null;
  rollbackOf: number | null;
}

interface RollbackPlan {
  operationId: number;
  action: string;
  canRollback: boolean;
  reason?: string;
  compensatingAction: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  warnings: string[];
}

// ============================================================
// 工具函数
// ============================================================

const STATUS_STYLES: Record<string, { icon: any; color: string; key: string }> = {
  success: { icon: CheckCircle, color: 'text-green-600 dark:text-green-400', key: 'logs.statusSuccess' },
  failed: { icon: XCircle, color: 'text-red-600 dark:text-red-400', key: 'logs.statusFailed' },
  partial: { icon: AlertCircle, color: 'text-amber-600 dark:text-amber-400', key: 'logs.statusPartial' },
  pending: { icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', key: 'logs.statusPending' },
  running: { icon: RefreshCw, color: 'text-yellow-600 dark:text-yellow-400', key: 'logs.statusPending' },
  rolled_back: { icon: RotateCcw, color: 'text-gray-600 dark:text-gray-400', key: 'logs.statusRolledBack' },
  rollback_failed: { icon: XCircle, color: 'text-red-600 dark:text-red-400', key: 'logs.statusRollbackFailed' },
};

function formatSnapshot(snapshot: unknown): string {
  if (snapshot === null || snapshot === undefined) return '';
  if (typeof snapshot === 'string') return snapshot;
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return String(snapshot);
  }
}

function formatDate(dateStr: string | null, lang: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ============================================================
// 页面
// ============================================================

export default function OperationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t, lang, isMounted } = useI18n();
  const toast = useToast();

  const [operation, setOperation] = useState<OperationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 回退相关
  const [rollbackPlan, setRollbackPlan] = useState<RollbackPlan | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [forceRollback, setForceRollback] = useState(false);
  const [executing, setExecuting] = useState(false);

  // 加载操作详情
  useEffect(() => {
    if (!isMounted) return;
    setLoading(true);
    fetch(`/api/operations/${id}`)
      .then(res => res.json())
      .then(json => {
        if (!json.success) {
          setError(json.messageCn || json.messageEn || 'Failed');
        } else {
          setOperation(json.data as OperationDetail);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id, isMounted]);

  // 预览回退
  const handlePreviewRollback = async () => {
    setRollbackLoading(true);
    try {
      const res = await fetch(`/api/operations/${id}/rollback`);
      const json = await res.json();
      if (!json.success) {
        toast.error(json.messageCn || '回退预览失败', json.messageEn || 'Rollback preview failed');
        return;
      }
      setRollbackPlan(json.data as RollbackPlan);
      if ((json.data as RollbackPlan).warnings.length > 0) {
        // 有并发冲突警告，默认开启 force 选项供用户选择
        setForceRollback(false);
      }
      setShowConfirm(true);
    } catch (err) {
      toast.error('回退预览失败', 'Rollback preview failed');
    } finally {
      setRollbackLoading(false);
    }
  };

  // 执行回退
  const handleConfirmRollback = async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/operations/${id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, force: forceRollback }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.messageCn || '回退失败', json.messageEn || 'Rollback failed');
        return;
      }
      toast.success(t('operations.rollbackSuccess'), 'Rollback successful');
      setShowConfirm(false);
      // 刷新详情
      router.refresh();
      // 重新拉取
      fetch(`/api/operations/${id}`)
        .then(r => r.json())
        .then(j => { if (j.success) setOperation(j.data); });
    } catch {
      toast.error('回退失败', 'Rollback failed');
    } finally {
      setExecuting(false);
    }
  };

  if (!isMounted || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !operation) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">{error || t('operations.notFound')}</p>
          </div>
          <Link href="/logs" className="mt-4 inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            <ArrowLeft className="w-4 h-4" /> {t('logs.title')}
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[operation.status.toLowerCase()] || STATUS_STYLES.failed;
  const StatusIcon = statusStyle.icon;
  const canRollbackStatus = operation.status === 'success' && !operation.rolledBackAt;
  const beforeText = formatSnapshot(operation.beforeSnapshot);
  const afterText = formatSnapshot(operation.afterSnapshot);
  const requestedText = formatSnapshot(operation.requestedSnapshot);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 顶部导航 */}
        <div className="mb-6 flex items-center justify-between">
          <Link href="/logs" className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            <ArrowLeft className="w-4 h-4" />
            {t('logs.title')}
          </Link>
          {canRollbackStatus && (
            <button
              onClick={handlePreviewRollback}
              disabled={rollbackLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {rollbackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              {t('operations.rollback')}
            </button>
          )}
        </div>

        {/* 标题 */}
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('operations.title')} #{operation.id}
          </h1>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 ${statusStyle.color}`}>
            <StatusIcon className="w-4 h-4" />
            {t(statusStyle.key)}
          </span>
          {operation.rolledBackAt && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <RotateCcw className="w-3.5 h-3.5" />
              {t('operations.alreadyRolledBack')}
            </span>
          )}
        </div>

        {/* 基本信息卡片 */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('operations.basicInfo')}</h2>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <InfoRow label={t('operations.operationId')} value={`#${operation.id}`} />
            <InfoRow label={t('logs.action')} value={operation.action} />
            <InfoRow label={t('logs.entity')} value={`${operation.entityType} #${operation.entityId}`} />
            <InfoRow label={t('logs.source')} value={operation.source || '-'} />
            <InfoRow label={t('operations.actor')} value={operation.actor || operation.createdBy || '-'} />
            <InfoRow label={t('operations.requestTime')} value={formatDate(operation.createdAt, lang)} />
            {operation.providerId && <InfoRow label={t('operations.provider')} value={`#${operation.providerId}`} />}
            {operation.domainId && <InfoRow label={t('operations.domain')} value={`#${operation.domainId}`} />}
            {operation.recordId && <InfoRow label={t('operations.record')} value={`#${operation.recordId}`} />}
            {operation.batchId && <InfoRow label={t('operations.batchId')} value={operation.batchId} mono />}
            {operation.completedAt && <InfoRow label={t('operations.requestTime')} value={formatDate(operation.completedAt, lang)} />}
          </div>
          {operation.errorMessage && (
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-800 dark:text-red-300">{t('operations.errorMessage')}</p>
                  <p className="text-sm text-red-700 dark:text-red-200 mt-1">{operation.errorMessage}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 快照卡片 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <SnapshotCard title={t('operations.beforeSnapshot')} content={beforeText} lang={lang} />
          <SnapshotCard title={t('operations.afterSnapshot')} content={afterText} lang={lang} />
        </div>

        {requestedText && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('operations.requestedSnapshot')}</h2>
            </div>
            <div className="p-5">
              <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
                {requestedText}
              </pre>
            </div>
          </div>
        )}

        {/* 不可回退提示 */}
        {!canRollbackStatus && !operation.rolledBackAt && operation.status !== 'success' && (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Info className="w-4 h-4" />
            {t('operations.noRollback')}
          </div>
        )}
      </main>

      {/* 回退确认对话框 */}
      <ConfirmDialog
        open={showConfirm}
        title={t('operations.rollbackConfirmTitle')}
        description={t('operations.rollbackConfirmDesc')}
        confirmLabel={t('operations.rollbackConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirmRollback}
        onCancel={() => { setShowConfirm(false); setForceRollback(false); }}
        loading={executing}
        variant="warning"
      >
        {rollbackPlan && (
          <div className="space-y-3">
            {/* 回退计划概要 */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('operations.compensatingAction')}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{rollbackPlan.compensatingAction}</span>
              </div>
              {!rollbackPlan.canRollback && rollbackPlan.reason && (
                <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                  <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{rollbackPlan.reason}</span>
                </div>
              )}
            </div>

            {/* 并发冲突警告 */}
            {rollbackPlan.warnings.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('operations.warnings')}</span>
                </div>
                <ul className="space-y-1">
                  {rollbackPlan.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-200">{w}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceRollback}
                    onChange={(e) => setForceRollback(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs text-amber-800 dark:text-amber-300">{t('operations.rollbackForce')}</span>
                </label>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

// ============================================================
// 子组件
// ============================================================

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function SnapshotCard({ title, content, lang }: { title: string; content: string; lang: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <div className="p-5">
        {content ? (
          <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-64">
            {content}
          </pre>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">{lang === 'zh' ? '无快照' : 'No snapshot'}</p>
        )}
      </div>
    </div>
  );
}
