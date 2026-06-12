'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertTriangle, Trash2, CheckCircle, X, Plus, Search, Filter, Globe } from 'lucide-react';
import { ResponsiveContainer, ResponsiveTable, InlineActionKeeper } from '@/components/ui/responsive-container';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/context';

export default function DomainsPage() {
  const { t } = useI18n();
  const [domains, setDomains] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState<number | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [addFormData, setAddFormData] = useState({ providerId: '', domainName: '' });
  const toast = useToast();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [domainsResponse, providersResponse] = await Promise.all([
        fetch('/api/domains'),
        fetch('/api/providers'),
      ]);
      const domainsResult = await domainsResponse.json();
      const providersResult = await providersResponse.json();
      if (domainsResult.success && domainsResult.data) setDomains(domainsResult.data);
      if (providersResult.success && providersResult.data) setProviders(providersResult.data);
    } catch (error) {
      toast.error('获取数据失败', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (providerId: number) => {
    setSyncConfirm(null);
    setSyncing(providerId);
    try {
      const response = await fetch('/api/domains/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('域名同步成功', 'Domains synced successfully');
        await loadData();
      } else {
        toast.error(result.messageCn || '同步失败', result.messageEn || 'Sync failed');
      }
    } catch (error) {
      toast.error('同步失败', 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFormData.providerId || !addFormData.domainName) {
      toast.warning('请填写所有必填字段', 'Please fill all required fields');
      return;
    }
    const existing = domains.find(d => d.providerId === parseInt(addFormData.providerId) && d.name === addFormData.domainName);
    if (existing) {
      toast.warning('该域名已存在', 'Domain already exists');
      return;
    }
    try {
      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: parseInt(addFormData.providerId), name: addFormData.domainName }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success('域名添加成功', 'Domain added successfully');
        setShowAddModal(false);
        setAddFormData({ providerId: '', domainName: '' });
        await loadData();
      } else {
        toast.error(result.messageCn || '添加失败', result.messageEn || 'Add failed');
      }
    } catch (error) {
      toast.error('添加失败', 'Add failed');
    }
  };

  const handleDeleteDomain = async (id: number) => {
    setDeleteConfirm(null);
    try {
      const response = await fetch(`/api/domains/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        toast.success('域名删除成功', 'Domain deleted successfully');
        await loadData();
      } else {
        toast.error(result.messageCn || '删除失败', result.messageEn || 'Delete failed');
      }
    } catch (error) {
      toast.error('删除失败', 'Delete failed');
    }
  };

  const filteredDomains = domains.filter((domain) => {
    const matchesSearch = domain.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = providerFilter === 'all' || domain.providerId === providerFilter;
    return matchesSearch && matchesProvider;
  });

  const getProviderTypeLabel = (type: string) => {
    const labels: Record<string, string> = { cloudflare: 'Cloudflare', aliyun: '阿里云', tencent: '腾讯云' };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ResponsiveContainer>
        {/* Page Header */}
        <div className="py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('domains.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('domains.viewDetails')}</p>
          </div>
          <button
            onClick={() => {
              if (providers.length === 0) {
                toast.warning(t('errors.providerNotFound'), 'Please add a provider first');
                return;
              }
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            {t('domains.addDomain')}
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t('common.search') + ' ' + t('domains.domainName')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            <div className="w-full sm:w-64">
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('common.all')}</option>
                {providers.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            {/* Sync All Button */}
            <InlineActionKeeper isConfirming={syncConfirm === -1} width="large">
              {syncConfirm === -1 ? (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-700 dark:text-green-300 whitespace-nowrap">确认同步 {providers.length} 个服务商?</span>
                  <button onClick={() => providers.forEach((p) => handleSync(p.id))} className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex-shrink-0">确认</button>
                  <button onClick={() => setSyncConfirm(null)} className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 text-sm flex-shrink-0">取消</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (providers.length === 0) {
                      toast.warning(t('errors.providerNotFound'), 'Please add a provider first');
                      return;
                    }
                    setSyncConfirm(-1);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <RefreshCw className="h-5 w-5" />
                  {t('common.sync')} {t('domains.title')}
                </button>
              )}
            </InlineActionKeeper>
          </div>
        </div>

        {/* Domains Table */}
        {loading ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <Globe className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              {searchTerm || providerFilter !== 'all' ? '没有找到匹配的域名' : '暂无域名'}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm || providerFilter !== 'all' ? '尝试调整搜索条件' : providers.length === 0 ? '先去服务商管理页面添加服务商' : '点击"同步所有域名"从服务商获取域名'}
            </p>
          </div>
        ) : (
          <ResponsiveTable>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[140px]">{t('domains.domainName')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[120px]">{t('providers.name')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[100px]">{t('common.type')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[140px]">{t('logs.time')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase min-w-[80px]">{t('common.status')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-40 min-w-[160px] flex-shrink-0">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDomains.map((domain) => (
                  <tr key={domain.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap min-w-[140px]">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{domain.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{domain.providerName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap min-w-[100px]">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        {getProviderTypeLabel(domain.providerType)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 min-w-[140px]">
                      {domain.lastSyncedAt ? new Date(domain.lastSyncedAt).toLocaleString() : '从未同步'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap min-w-[80px]">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${domain.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800'}`}>
                        {domain.isActive ? '活跃' : '禁用'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium w-40 min-w-[160px] flex-shrink-0">
                      <div className="flex items-center justify-end gap-2">
                        {/* Sync Button */}
                        <InlineActionKeeper isConfirming={syncConfirm === domain.providerId} width="small">
                          {syncConfirm === domain.providerId ? (
                            <div className="flex items-center gap-1 bg-green-50 dark:bg-green-900/30 rounded px-2 py-1">
                              <span className="text-xs text-green-600">确认?</span>
                              <button onClick={() => handleSync(domain.providerId)} disabled={syncing === domain.providerId} className="text-green-600 hover:text-green-800">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button onClick={() => setSyncConfirm(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setSyncConfirm(domain.providerId)} disabled={syncing === domain.providerId} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 disabled:opacity-50">
                              {syncing === domain.providerId ? '同步中...' : '同步'}
                            </button>
                          )}
                        </InlineActionKeeper>
                        
                        <Link href={`/domains/${domain.id}`} className="text-gray-600 hover:text-gray-900 dark:text-gray-400 whitespace-nowrap">查看记录</Link>
                        
                        {/* Delete Button */}
                        <InlineActionKeeper isConfirming={deleteConfirm === domain.id} width="small">
                          {deleteConfirm === domain.id ? (
                            <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 rounded px-2 py-1">
                              <span className="text-xs text-red-600">确认?</span>
                              <button onClick={() => handleDeleteDomain(domain.id)} className="text-red-600 hover:text-red-800">
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(domain.id)} className="text-red-600 hover:text-red-900 dark:text-red-400">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </InlineActionKeeper>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        {/* Footer */}
        {!loading && filteredDomains.length > 0 && (
          <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            显示 {filteredDomains.length} 个域名，共 {domains.length} 个
          </div>
        )}
      </ResponsiveContainer>

      {/* Add Domain Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">手动添加域名</h2>
            <form onSubmit={handleAddDomain} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">服务商</label>
                <select required value={addFormData.providerId} onChange={(e) => setAddFormData({ ...addFormData, providerId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">选择服务商</option>
                  {providers.map((p) => (<option key={p.id} value={p.id}>{p.name} ({getProviderTypeLabel(p.type)})</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">域名</label>
                <input type="text" required value={addFormData.domainName} onChange={(e) => setAddFormData({ ...addFormData, domainName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="example.com" />
                <p className="mt-1 text-xs text-gray-500">域名必须在选定的服务商中实际存在</p>
              </div>
              <div className="flex gap-2 pt-4">
                <button type="button" onClick={() => { setShowAddModal(false); setAddFormData({ providerId: '', domainName: '' }); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">添加</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}