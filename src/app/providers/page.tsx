'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Edit2, Plus, Database } from 'lucide-react';
import { ResponsiveContainer, ResponsiveGrid } from '@/components/ui/responsive-container';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/context';

type Provider = {
  id: number;
  name: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updatedAt: string;
};

export default function ProvidersPage() {
  const toast = useToast();
  const { t, isMounted } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [decryptFailedConfirm, setDecryptFailedConfirm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    type: 'cloudflare',
    authMethod: 'token',
    apiToken: '',
    apiKey: '',
    email: '',
    accessKeyId: '',
    accessKeySecret: '',
    secretId: '',
    secretKey: '',
  });

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch('/api/providers');
      const result = await response.json();
      if (result.success && result.data) {
        setProviders(result.data);
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingProvider(null);
    setFormData({
      name: '',
      type: 'cloudflare',
      authMethod: 'token',
      apiToken: '',
      apiKey: '',
      email: '',
      accessKeyId: '',
      accessKeySecret: '',
      secretId: '',
      secretKey: '',
    });
    setShowModal(true);
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      authMethod: 'token',
      apiToken: '',
      apiKey: '',
      email: '',
      accessKeyId: '',
      accessKeySecret: '',
      secretId: '',
      secretKey: '',
    });
    setShowModal(true);
  };

  const handleResetCredentials = (provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      authMethod: 'token',
      apiToken: '',
      apiKey: '',
      email: '',
      accessKeyId: '',
      accessKeySecret: '',
      secretId: '',
      secretKey: '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除此服务商吗？相关域名和记录也会一起删除。')) return;

    try {
      const response = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        await loadProviders();
      }
    } catch (error) {
      console.error('Failed to delete provider:', error);
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingProviderId(id);
    setTestResult(null);
    try {
      const response = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const result = await response.json();
      setTestResult({
        id,
        success: result.success,
        message: result.success ? '连接测试成功' : result.error || '连接测试失败',
      });
      if (!result.success && result.error === 'Decryption failed') {
        setDecryptFailedConfirm(true);
      }
    } catch (error) {
      setTestResult({
        id,
        success: false,
        message: error instanceof Error ? error.message : '连接测试失败',
      });
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      const response = await fetch('/api/providers/clear', { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        await loadProviders();
      }
    } catch (error) {
      console.error('Failed to clear providers:', error);
    }
  };

  const handleClearAllClick = async () => {
    if (!window.confirm('确定清空所有服务商数据吗？此操作不可恢复。')) return;
    await handleClearAll();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validType: 'cloudflare' | 'aliyun' | 'tencent' =
        formData.type === 'cloudflare' ? 'cloudflare' :
        formData.type === 'aliyun' ? 'aliyun' : 'tencent';

      const body: any = { name: formData.name, type: validType };

      if (validType === 'cloudflare') {
        if (formData.authMethod === 'global') {
          if (!formData.apiKey || !formData.email) {
            toast.warning('Global API Key 方式需要填写邮箱和 API Key', 'Global API Key requires email and API Key');
            return;
          }
          body.apiKey = formData.apiKey;
          body.email = formData.email;
        } else {
          if (!formData.apiToken) {
            toast.warning('API Token 方式需要填写 Token', 'API Token method requires Token');
            return;
          }
          body.apiToken = formData.apiToken;
        }
      } else if (validType === 'aliyun') {
        body.accessKeyId = formData.accessKeyId;
        body.accessKeySecret = formData.accessKeySecret;
      } else if (validType === 'tencent') {
        body.secretId = formData.secretId;
        body.secretKey = formData.secretKey;
      }

      if (editingProvider?.id) {
        body.id = editingProvider.id;
      }

      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (result.success) {
        setShowModal(false);
        await loadProviders();
      } else {
        toast.error(result.messageCn || '保存失败', result.messageEn || 'Save failed');
      }
    } catch (error) {
      console.error('Failed to save provider:', error);
      toast.error(error instanceof Error ? error.message : '保存失败', 'Save failed');
    }
  };

  const getProviderTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      cloudflare: 'Cloudflare',
      aliyun: '阿里云',
      tencent: '腾讯云',
    };
    return labels[type] || type;
  };

  const getProviderTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      cloudflare: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      aliyun: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      tencent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ResponsiveContainer>
        {/* Page Header */}
        <div className="py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('providers.title')}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('providers.name')} {t('common.config')}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex flex-wrap gap-3 items-center">
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('providers.add')}
          </button>
          
          <button
            onClick={handleClearAllClick}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 justify-center"
          >
            <Database className="h-4 w-4" />
            {t('common.clearAll')}
          </button>
          
          {/* 右侧空间占位 */}
          <div className="flex-1"></div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无服务商</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">添加一个服务商开始管理您的 DNS 记录</p>
            <button onClick={handleAdd} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              添加服务商
            </button>
          </div>
        ) : (
          <ResponsiveGrid cols={3}>
            {providers.map((provider) => (
              <div key={provider.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{provider.name}</h3>
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full mt-1 ${getProviderTypeColor(provider.type)}`}>
                      {getProviderTypeLabel(provider.type)}
                    </span>
                  </div>
                  
                  <div className="flex flex-shrink-0 gap-2">
                    <button onClick={() => handleEdit(provider)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(provider.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>凭证已加密存储</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>更新于 {new Date(provider.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Test Result */}
                {testResult && testResult.id === provider.id && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${testResult.success ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
                    {testResult.message}
                  </div>
                )}

                {/* Test Button */}
                <button
                  onClick={() => handleTestConnection(provider.id)}
                  disabled={testingProviderId === provider.id}
                  className={`mt-4 w-full px-4 py-2 rounded-lg border transition-colors ${testingProviderId === provider.id ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                >
                  {testingProviderId === provider.id ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                      测试中...
                    </span>
                  ) : '测试连接'}
                </button>

                {/* Reset Credentials Button */}
                <button onClick={() => handleResetCredentials(provider)} className="mt-2 w-full px-4 py-2 rounded-lg text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                  重新设置凭证
                </button>
              </div>
            ))}
          </ResponsiveGrid>
        )}

        {/* Decrypt Failed Confirmation */}
        {decryptFailedConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg max-w-sm w-full p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">加密密钥变更</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                由于加密密钥变更，旧数据无法解密。是否清空所有服务商数据并重新添加？
              </p>
              <div className="flex gap-3">
                <button onClick={() => { handleClearAll(); setDecryptFailedConfirm(false); }} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">确认清空</button>
                <button onClick={() => setDecryptFailedConfirm(false)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">取消</button>
              </div>
            </div>
          </div>
        )}
      </ResponsiveContainer>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 max-h-[85dvh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              {editingProvider ? '重新设置凭证' : '添加服务商'}
            </h2>
            {editingProvider && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-4">
                原有凭证将被新凭证替换，请确保输入正确的凭证信息
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">服务商名称</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：生产环境-Cloudflare"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">服务商类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cloudflare">Cloudflare</option>
                  <option value="aliyun">阿里云</option>
                  <option value="tencent">腾讯云</option>
                </select>
              </div>

              {formData.type === 'cloudflare' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">认证方式</label>
                    <select
                      value={formData.authMethod}
                      onChange={(e) => setFormData({ ...formData, authMethod: e.target.value, apiToken: '', apiKey: '', email: '' })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="token">API Token</option>
                      <option value="global">Global API Key</option>
                    </select>
                  </div>
                  {formData.authMethod === 'token' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Token</label>
                      <input
                        type="password"
                        required
                        value={formData.apiToken}
                        onChange={(e) => setFormData({ ...formData, apiToken: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="输入 Cloudflare API Token"
                      />
                      <p className="mt-1 text-xs text-gray-500">在 Cloudflare Dashboard → My Profile → API Tokens 中创建</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">账户邮箱</label>
                        <input
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="your-email@example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Global API Key</label>
                        <input
                          type="password"
                          required
                          value={formData.apiKey}
                          onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="输入 Global API Key"
                        />
                        <p className="mt-1 text-xs text-gray-500">在 Cloudflare Dashboard → My Profile → API Keys 中查看</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formData.type === 'aliyun' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AccessKey ID</label>
                    <input type="text" required value={formData.accessKeyId} onChange={(e) => setFormData({ ...formData, accessKeyId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="输入阿里云 AccessKey ID" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AccessKey Secret</label>
                    <input type="password" required value={formData.accessKeySecret} onChange={(e) => setFormData({ ...formData, accessKeySecret: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="输入阿里云 AccessKey Secret" />
                  </div>
                </>
              )}

              {formData.type === 'tencent' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Secret ID</label>
                    <input type="text" required value={formData.secretId} onChange={(e) => setFormData({ ...formData, secretId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="输入腾讯云 Secret ID" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Secret Key</label>
                    <input type="password" required value={formData.secretKey} onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="输入腾讯云 Secret Key" />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingProvider ? '更新' : '添加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
