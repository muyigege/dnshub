'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { ResponsiveContainer, ResponsiveTable } from '@/components/ui/responsive-container';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/context';

type DomainRow = {
  id: number;
  name: string;
  providerId: number;
  providerName: string;
  providerType: string;
  isActive: boolean;
  lastSyncedAt?: string | null;
};

type ProviderRow = {
  id: number;
  name: string;
  type: string;
};

type DomainSyncData = {
  totalRemote: number;
  synced: number;
  updated: number;
  records?: {
    domains: number;
    failed: number;
    synced: number;
    updated: number;
    total: number;
    errors?: Array<{ domain: string; error: string }>;
  };
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  messageCn?: string;
  messageEn?: string;
};

async function readApiJson<T>(response: Response): Promise<ApiResult<T>> {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const messageCn =
      response.status === 404
        ? '接口返回 404：当前运行的服务未加载最新 API，请重新构建并重启容器'
        : text.slice(0, 180) || `请求失败（${response.status}）`;
    return {
      success: false,
      error: messageCn,
      messageCn,
      messageEn:
        response.status === 404
          ? 'API returned 404. Rebuild and restart the running container.'
          : `Request failed (${response.status})`,
    };
  }

  return response.json();
}

function resultMessage<T>(result: ApiResult<T>, fallback: string) {
  return result.messageCn || result.error || fallback;
}

export default function DomainsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState<number | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormData, setAddFormData] = useState({ providerId: '', domainName: '' });

  const loadData = async () => {
    try {
      setLoading(true);
      const [domainsResponse, providersResponse] = await Promise.all([
        fetch('/api/domains', { cache: 'no-store' }),
        fetch('/api/providers', { cache: 'no-store' }),
      ]);
      const domainsResult = await readApiJson<DomainRow[]>(domainsResponse);
      const providersResult = await readApiJson<ProviderRow[]>(providersResponse);

      if (domainsResponse.ok && domainsResult.success && domainsResult.data) setDomains(domainsResult.data);
      if (providersResponse.ok && providersResult.success && providersResult.data) setProviders(providersResult.data);

      if (!domainsResponse.ok || !domainsResult.success) {
        toast.error(resultMessage(domainsResult, '获取域名失败'), domainsResult.messageEn || 'Failed to fetch domains');
      }
      if (!providersResponse.ok || !providersResult.success) {
        toast.error(resultMessage(providersResult, '获取服务商失败'), providersResult.messageEn || 'Failed to fetch providers');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取数据失败', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showSyncToast = (data: DomainSyncData) => {
    const records = data.records;
    if (!records) {
      toast.success(
        `域名同步完成：新增 ${data.synced} 个，更新 ${data.updated} 个`,
        `Domains synced: ${data.synced} created, ${data.updated} updated`
      );
      return;
    }

    toast.success(
      `同步完成：域名新增 ${data.synced} 个、更新 ${data.updated} 个；解析记录新增 ${records.synced} 条、更新 ${records.updated} 条`,
      `Sync complete: ${data.synced} domains created, ${data.updated} updated; ${records.synced} records created, ${records.updated} updated`
    );

    if (records.failed > 0) {
      toast.warning(
        `${records.failed} 个域名的解析记录同步失败，请查看服务端日志`,
        `${records.failed} domain record syncs failed. Check server logs.`
      );
    }
  };

  const handleSync = async (providerId: number) => {
    setSyncing(providerId);
    try {
      const response = await fetch('/api/domains/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const result = await readApiJson<DomainSyncData>(response);

      if (!response.ok || !result.success || !result.data) {
        toast.error(resultMessage(result, '同步失败'), result.messageEn || 'Sync failed');
        return false;
      }

      showSyncToast(result.data);
      await loadData();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '同步失败', 'Sync failed');
      return false;
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    if (providers.length === 0) {
      toast.warning(t('errors.providerNotFound'), 'Please add a provider first');
      return;
    }

    setSyncingAll(true);
    try {
      for (const provider of providers) {
        await handleSync(provider.id);
      }
    } finally {
      setSyncingAll(false);
    }
  };

  const handleAddDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!addFormData.providerId || !addFormData.domainName) {
      toast.warning('请填写所有必填字段', 'Please fill all required fields');
      return;
    }

    const providerId = Number.parseInt(addFormData.providerId, 10);
    const existing = domains.find((domain) => domain.providerId === providerId && domain.name === addFormData.domainName);
    if (existing) {
      toast.warning('该域名已存在', 'Domain already exists');
      return;
    }

    try {
      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, name: addFormData.domainName }),
      });
      const result = await readApiJson<unknown>(response);

      if (!response.ok || !result.success) {
        toast.error(resultMessage(result, '添加失败'), result.messageEn || 'Add failed');
        return;
      }

      toast.success('域名添加成功', 'Domain added successfully');
      setShowAddModal(false);
      setAddFormData({ providerId: '', domainName: '' });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '添加失败', 'Add failed');
    }
  };

  const handleDeleteDomain = async (id: number) => {
    if (!window.confirm('确定删除此域名吗？相关记录也会一起删除。')) return;

    try {
      const response = await fetch(`/api/domains/${id}`, { method: 'DELETE' });
      const result = await readApiJson<unknown>(response);

      if (!response.ok || !result.success) {
        toast.error(resultMessage(result, '删除失败'), result.messageEn || 'Delete failed');
        return;
      }

      toast.success('域名删除成功', 'Domain deleted successfully');
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败', 'Delete failed');
    }
  };

  const filteredDomains = domains.filter((domain) => {
    const matchesSearch = domain.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = providerFilter === 'all' || domain.providerId === providerFilter;
    return matchesSearch && matchesProvider;
  });

  const getProviderTypeLabel = (type: string) => {
    const labels: Record<string, string> = { cloudflare: 'Cloudflare', aliyun: '阿里云', tencent: '腾讯云 DNSPod', huawei: '华为云 DNS', route53: 'AWS Route53', google: 'Google Cloud DNS', digitalocean: 'DigitalOcean', godaddy: 'GoDaddy', porkbun: 'Porkbun', namesilo: 'NameSilo', hetzner: 'Hetzner DNS' };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ResponsiveContainer>
        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('domains.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">同步域名时会自动同步解析记录。</p>
          </div>
          <button
            onClick={() => {
              if (providers.length === 0) {
                toast.warning(t('errors.providerNotFound'), 'Please add a provider first');
                return;
              }
              setShowAddModal(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            <Plus className="h-5 w-5" />
            {t('domains.addDomain')}
          </button>
        </div>

        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={`${t('common.search')} ${t('domains.domainName')}`}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            <div className="w-full sm:w-64">
              <select
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="all">{t('common.all')}</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              <RefreshCw className={`h-5 w-5 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? '同步中...' : '同步全部'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <Globe className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              {searchTerm || providerFilter !== 'all' ? '没有找到匹配的域名' : '暂无域名'}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {providers.length === 0 ? '先添加服务商，再同步域名。' : '点击同步按钮从服务商获取域名和解析记录。'}
            </p>
          </div>
        ) : (
          <ResponsiveTable>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="min-w-[160px] px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('domains.domainName')}</th>
                  <th className="min-w-[140px] px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('providers.name')}</th>
                  <th className="min-w-[120px] px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('common.type')}</th>
                  <th className="min-w-[160px] px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('logs.time')}</th>
                  <th className="min-w-[100px] px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('common.status')}</th>
                  <th className="w-[260px] min-w-[260px] px-6 py-3 text-right text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filteredDomains.map((domain) => (
                  <tr key={domain.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="min-w-[160px] whitespace-nowrap px-6 py-4">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{domain.name}</span>
                    </td>
                    <td className="min-w-[140px] whitespace-nowrap px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{domain.providerName}</span>
                    </td>
                    <td className="min-w-[120px] whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        {getProviderTypeLabel(domain.providerType)}
                      </span>
                    </td>
                    <td className="min-w-[160px] whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {domain.lastSyncedAt ? new Date(domain.lastSyncedAt).toLocaleString() : '从未同步'}
                    </td>
                    <td className="min-w-[100px] whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${domain.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-gray-100 text-gray-800'}`}>
                        {domain.isActive ? '活跃' : '停用'}
                      </span>
                    </td>
                    <td className="w-[260px] min-w-[260px] whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleSync(domain.providerId)}
                          disabled={syncing === domain.providerId || syncingAll}
                          className="inline-flex w-20 items-center justify-center text-blue-600 hover:text-blue-900 disabled:opacity-50 dark:text-blue-400"
                        >
                          {syncing === domain.providerId ? '同步中...' : '同步'}
                        </button>
                        <Link href={`/domains/${domain.id}`} className="whitespace-nowrap text-gray-600 hover:text-gray-900 dark:text-gray-400">
                          查看记录
                        </Link>
                        <button onClick={() => handleDeleteDomain(domain.id)} className="text-rose-600 hover:text-rose-900 dark:text-rose-400" aria-label="删除域名">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        {!loading && filteredDomains.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            显示 {filteredDomains.length} 个域名，共 {domains.length} 个
          </div>
        )}
      </ResponsiveContainer>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 dark:bg-gray-800">
            <h2 className="mb-6 text-xl font-bold text-gray-900 dark:text-white">手动添加域名</h2>
            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">服务商</label>
                <select
                  required
                  value={addFormData.providerId}
                  onChange={(event) => setAddFormData({ ...addFormData, providerId: event.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">选择服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.name} ({getProviderTypeLabel(provider.type)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">域名</label>
                <input
                  type="text"
                  required
                  value={addFormData.domainName}
                  onChange={(event) => setAddFormData({ ...addFormData, domainName: event.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="example.com"
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddFormData({ providerId: '', domainName: '' });
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                  添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
