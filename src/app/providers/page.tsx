'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Edit2, Plus, ServerCog, Trash2, XCircle } from 'lucide-react';
import { ResponsiveContainer, ResponsiveGrid } from '@/components/ui/responsive-container';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/context';

type ProviderTypeValue =
  | 'cloudflare'
  | 'aliyun'
  | 'tencent'
  | 'digitalocean'
  | 'godaddy'
  | 'porkbun'
  | 'namesilo'
  | 'hetzner'
  | 'route53'
  | 'google'
  | 'huawei';

type Provider = {
  id: number;
  name: string;
  type: ProviderTypeValue;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormData = {
  name: string;
  type: ProviderTypeValue;
  authMethod: 'token' | 'global';
  apiToken: string;
  apiKey: string;
  apiSecret: string;
  secretApiKey: string;
  shopperId: string;
  email: string;
  accessKeyId: string;
  accessKeySecret: string;
  secretId: string;
  secretKey: string;
  secretAccessKey: string;
  region: string;
  regionId: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
  serviceAccountJson: string;
};

const PROVIDER_OPTIONS: Array<{ type: ProviderTypeValue; label: string; description: string; className: string }> = [
  { type: 'cloudflare', label: 'Cloudflare', description: '全球 DNS/CDN，支持 API Token 和 Global API Key', className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  { type: 'aliyun', label: '阿里云 DNS', description: '国内主流云解析服务', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
  { type: 'tencent', label: '腾讯云 DNSPod', description: '腾讯云 DNSPod API', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  { type: 'huawei', label: '华为云 DNS', description: '华为云云解析服务 DNS', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  { type: 'route53', label: 'AWS Route53', description: 'AWS 托管区域和记录集', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  { type: 'google', label: 'Google Cloud DNS', description: 'Google Cloud Managed Zones', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  { type: 'digitalocean', label: 'DigitalOcean', description: 'DigitalOcean Domains API', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' },
  { type: 'godaddy', label: 'GoDaddy', description: '域名注册商 DNS API', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  { type: 'porkbun', label: 'Porkbun', description: 'Porkbun DNS API', className: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300' },
  { type: 'namesilo', label: 'NameSilo', description: 'NameSilo DNS Manager API', className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  { type: 'hetzner', label: 'Hetzner DNS', description: 'Hetzner DNS Console API', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
];

const emptyForm: FormData = {
  name: '',
  type: 'cloudflare',
  authMethod: 'token',
  apiToken: '',
  apiKey: '',
  apiSecret: '',
  secretApiKey: '',
  shopperId: '',
  email: '',
  accessKeyId: '',
  accessKeySecret: '',
  secretId: '',
  secretKey: '',
  secretAccessKey: '',
  region: '',
  regionId: '',
  projectId: '',
  clientEmail: '',
  privateKey: '',
  serviceAccountJson: '',
};

const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function providerOption(type: string) {
  return PROVIDER_OPTIONS.find((option) => option.type === type) || PROVIDER_OPTIONS[0];
}

async function readJson(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return { success: false, messageCn: `请求失败（${response.status}）`, messageEn: `Request failed (${response.status})` };
  }
  return response.json();
}

export default function ProvidersPage() {
  const toast = useToast();
  const { t } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [decryptFailedConfirm, setDecryptFailedConfirm] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/providers', { cache: 'no-store' });
      const result = await readJson(response);
      if (result.success && result.data) {
        setProviders(result.data);
      } else {
        toast.error(result.messageCn || '加载服务商失败', result.messageEn || 'Failed to load providers');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载服务商失败', 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const openForm = (provider?: Provider) => {
    setEditingProvider(provider || null);
    setFormData(provider ? { ...emptyForm, name: provider.name, type: provider.type } : emptyForm);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除此服务商吗？相关域名和记录也会一起删除。')) return;

    try {
      const response = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
      const result = await readJson(response);
      if (result.success) {
        toast.success('服务商已删除', 'Provider deleted');
        await loadProviders();
      } else {
        toast.error(result.messageCn || result.error || '删除失败', result.messageEn || 'Delete failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败', 'Delete failed');
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingProviderId(id);
    setTestResult(null);
    try {
      const response = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
      const result = await readJson(response);
      const message = result.success ? '连接测试成功' : result.messageCn || result.error || '连接测试失败';
      setTestResult({ id, success: result.success, message });
      if (!result.success && result.code === 'DECRYPTION_FAILED') setDecryptFailedConfirm(true);
    } catch (error) {
      setTestResult({ id, success: false, message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      const response = await fetch('/api/providers/clear', { method: 'POST' });
      const result = await readJson(response);
      if (result.success) await loadProviders();
      else toast.error(result.messageCn || '清空失败', result.messageEn || 'Clear failed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空失败', 'Clear failed');
    }
  };

  const handleClearAllClick = async () => {
    if (!window.confirm('确定清空所有服务商数据吗？此操作不可恢复。')) return;
    await handleClearAll();
  };

  const validateForm = () => {
    const type = formData.type;
    if (!formData.name.trim()) return '请填写服务商名称';
    if (type === 'cloudflare' && formData.authMethod === 'token' && !formData.apiToken) return '请填写 Cloudflare API Token';
    if (type === 'cloudflare' && formData.authMethod === 'global' && (!formData.apiKey || !formData.email)) return '请填写 Cloudflare Email 和 Global API Key';
    if (type === 'aliyun' && (!formData.accessKeyId || !formData.accessKeySecret)) return '请填写阿里云 AccessKey ID 和 Secret';
    if (type === 'tencent' && (!formData.secretId || !formData.secretKey)) return '请填写腾讯云 Secret ID 和 Secret Key';
    if ((type === 'digitalocean' || type === 'hetzner') && !formData.apiToken) return '请填写 API Token';
    if (type === 'godaddy' && (!formData.apiKey || !formData.apiSecret)) return '请填写 GoDaddy API Key 和 API Secret';
    if (type === 'porkbun' && (!formData.apiKey || !formData.secretApiKey)) return '请填写 Porkbun API Key 和 Secret API Key';
    if (type === 'namesilo' && !formData.apiKey) return '请填写 NameSilo API Key';
    if (type === 'route53' && (!formData.accessKeyId || !formData.secretAccessKey)) return '请填写 AWS Access Key ID 和 Secret Access Key';
    if (type === 'google' && !formData.serviceAccountJson && (!formData.projectId || !formData.clientEmail || !formData.privateKey)) return '请填写 Google 服务账号 JSON，或 Project ID、Client Email 和 Private Key';
    if (type === 'huawei' && (!formData.accessKeyId || !formData.secretAccessKey)) return '请填写华为云 Access Key ID 和 Secret Access Key';
    return '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = validateForm();
    if (error) {
      toast.warning(error, 'Please fill required fields');
      return;
    }

    const body = {
      ...formData,
      name: formData.name.trim(),
      id: editingProvider?.id,
    };

    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await readJson(response);
      if (result.success) {
        toast.success(editingProvider ? '服务商已更新' : '服务商已添加', editingProvider ? 'Provider updated' : 'Provider added');
        setShowModal(false);
        await loadProviders();
      } else {
        toast.error(result.messageCn || result.error || '保存失败', result.messageEn || 'Save failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败', 'Save failed');
    }
  };

  const renderCredentialFields = () => {
    switch (formData.type) {
      case 'cloudflare':
        return (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>认证方式</label>
              <select value={formData.authMethod} onChange={(e) => setFormData({ ...formData, authMethod: e.target.value as 'token' | 'global' })} className={inputClass}>
                <option value="token">API Token（推荐）</option>
                <option value="global">Global API Key + Email</option>
              </select>
            </div>
            {formData.authMethod === 'token' ? (
              <PasswordField label="API Token" value={formData.apiToken} onChange={(apiToken) => setFormData({ ...formData, apiToken })} />
            ) : (
              <>
                <TextField label="账户邮箱" type="email" value={formData.email} onChange={(email) => setFormData({ ...formData, email })} placeholder="you@example.com" />
                <PasswordField label="Global API Key" value={formData.apiKey} onChange={(apiKey) => setFormData({ ...formData, apiKey })} />
              </>
            )}
          </div>
        );
      case 'aliyun':
        return <AccessKeyFields secretLabel="AccessKey Secret" useLegacySecret />;
      case 'tencent':
        return (
          <>
            <TextField label="Secret ID" value={formData.secretId} onChange={(secretId) => setFormData({ ...formData, secretId })} />
            <PasswordField label="Secret Key" value={formData.secretKey} onChange={(secretKey) => setFormData({ ...formData, secretKey })} />
            <TextField label="Region（可选）" value={formData.region} onChange={(region) => setFormData({ ...formData, region })} placeholder="ap-guangzhou" />
          </>
        );
      case 'digitalocean':
      case 'hetzner':
        return <PasswordField label="API Token" value={formData.apiToken} onChange={(apiToken) => setFormData({ ...formData, apiToken })} />;
      case 'godaddy':
        return (
          <>
            <PasswordField label="API Key" value={formData.apiKey} onChange={(apiKey) => setFormData({ ...formData, apiKey })} />
            <PasswordField label="API Secret" value={formData.apiSecret} onChange={(apiSecret) => setFormData({ ...formData, apiSecret })} />
            <TextField label="Shopper ID（可选）" value={formData.shopperId} onChange={(shopperId) => setFormData({ ...formData, shopperId })} />
          </>
        );
      case 'porkbun':
        return (
          <>
            <PasswordField label="API Key" value={formData.apiKey} onChange={(apiKey) => setFormData({ ...formData, apiKey })} />
            <PasswordField label="Secret API Key" value={formData.secretApiKey} onChange={(secretApiKey) => setFormData({ ...formData, secretApiKey })} />
          </>
        );
      case 'namesilo':
        return <PasswordField label="API Key" value={formData.apiKey} onChange={(apiKey) => setFormData({ ...formData, apiKey })} />;
      case 'route53':
        return <AccessKeyFields secretLabel="Secret Access Key" useSecretAccessKey />;
      case 'google':
        return (
          <>
            <div>
              <label className={labelClass}>服务账号 JSON（推荐直接粘贴）</label>
              <textarea value={formData.serviceAccountJson} onChange={(e) => setFormData({ ...formData, serviceAccountJson: e.target.value })} className={`${inputClass} min-h-28 font-mono text-xs`} placeholder='{"type":"service_account",...}' />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField label="Project ID" value={formData.projectId} onChange={(projectId) => setFormData({ ...formData, projectId })} />
              <TextField label="Client Email" value={formData.clientEmail} onChange={(clientEmail) => setFormData({ ...formData, clientEmail })} />
            </div>
            <div>
              <label className={labelClass}>Private Key</label>
              <textarea value={formData.privateKey} onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })} className={`${inputClass} min-h-24 font-mono text-xs`} placeholder="-----BEGIN PRIVATE KEY-----" />
            </div>
          </>
        );
      case 'huawei':
        return (
          <>
            <AccessKeyFields secretLabel="Secret Access Key" useSecretAccessKey />
            <TextField label="Region（可选）" value={formData.region} onChange={(region) => setFormData({ ...formData, region })} placeholder="cn-north-4" />
          </>
        );
      default:
        return null;
    }
  };

  const AccessKeyFields = ({ secretLabel, useSecretAccessKey = false, useLegacySecret = false }: { secretLabel: string; useSecretAccessKey?: boolean; useLegacySecret?: boolean }) => (
    <>
      <TextField label="Access Key ID" value={formData.accessKeyId} onChange={(accessKeyId) => setFormData({ ...formData, accessKeyId })} />
      <PasswordField
        label={secretLabel}
        value={useSecretAccessKey ? formData.secretAccessKey : formData.accessKeySecret}
        onChange={(value) => setFormData({ ...formData, [useSecretAccessKey ? 'secretAccessKey' : 'accessKeySecret']: value })}
      />
      {useLegacySecret && <TextField label="Region ID（可选）" value={formData.regionId} onChange={(regionId) => setFormData({ ...formData, regionId })} placeholder="cn-hangzhou" />}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ResponsiveContainer>
        <div className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('providers.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">已支持 Cloudflare、阿里云、腾讯云、华为云、AWS、Google、DigitalOcean、GoDaddy、Porkbun、NameSilo、Hetzner。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              {t('providers.add')}
            </button>
            <button onClick={handleClearAllClick} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700">
              <Database className="h-4 w-4" />
              {t('common.clearAll')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : providers.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <ServerCog className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无服务商</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">添加服务商后即可同步域名和解析记录。</p>
            <button onClick={() => openForm()} className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">添加服务商</button>
          </div>
        ) : (
          <ResponsiveGrid cols={3}>
            {providers.map((provider) => {
              const option = providerOption(provider.type);
              return (
                <div key={provider.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">{provider.name}</h3>
                      <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-medium ${option.className}`}>{option.label}</span>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <button onClick={() => openForm(provider)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="重新配置凭证">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(provider.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400" aria-label="删除服务商">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div>{option.description}</div>
                    <div>凭证已加密存储</div>
                    <div>更新于 {new Date(provider.updatedAt).toLocaleDateString()}</div>
                  </div>

                  {testResult && testResult.id === provider.id && (
                    <div className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${testResult.success ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>
                      {testResult.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                      <span>{testResult.message}</span>
                    </div>
                  )}

                  <button onClick={() => handleTestConnection(provider.id)} disabled={testingProviderId === provider.id} className="mt-4 w-full rounded-lg border bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
                    {testingProviderId === provider.id ? '测试中...' : '测试连接'}
                  </button>
                  <button onClick={() => openForm(provider)} className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">重新配置凭证</button>
                </div>
              );
            })}
          </ResponsiveGrid>
        )}

        {decryptFailedConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/50">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">加密密钥已变化</h3>
              </div>
              <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">旧服务商凭证无法解密。建议重新配置凭证；必要时可清空服务商后重新添加。</p>
              <div className="flex gap-3">
                <button onClick={() => { handleClearAll(); setDecryptFailedConfirm(false); }} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700">清空</button>
                <button onClick={() => setDecryptFailedConfirm(false)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">取消</button>
              </div>
            </div>
          </div>
        )}
      </ResponsiveContainer>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 dark:bg-gray-800">
            <h2 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{editingProvider ? '重新配置凭证' : '添加服务商'}</h2>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">{providerOption(formData.type).description}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <TextField label="服务商名称" value={formData.name} onChange={(name) => setFormData({ ...formData, name })} placeholder="例如：生产环境 Cloudflare" />

              <div>
                <label className={labelClass}>服务商类型</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...emptyForm, name: formData.name, type: e.target.value as ProviderTypeValue })} className={inputClass}>
                  {PROVIDER_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
                </select>
              </div>

              <div className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                {renderCredentialFields()}
              </div>

              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">取消</button>
                <button type="submit" className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">{editingProvider ? '更新' : '添加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder={placeholder} />
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <TextField label={label} value={value} onChange={onChange} placeholder={placeholder} type="password" />;
}