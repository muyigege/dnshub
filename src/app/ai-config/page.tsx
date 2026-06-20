'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Edit2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

type AIConfig = {
  id: number;
  name: string;
  providerType: string;
  apiUrl: string;
  modelId: string;
  apiKey: string;
  apiKeyStatus?: 'ok' | 'missing' | 'invalid';
  apiKeyError?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  messageCn?: string;
  messageEn?: string;
  decryptionWarnings?: Array<{ id: number; name: string; message?: string }>;
};

const PRESET_TEMPLATES = {
  deepseek_v3: {
    name: 'DeepSeek-V3',
    providerType: 'siliconflow',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelId: 'deepseek-ai/DeepSeek-V3',
  },
  qwen3_32b: {
    name: '通义千问 Qwen3-32B',
    providerType: 'siliconflow',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelId: 'Qwen/Qwen3-32B',
  },
  qwen3_coder: {
    name: '通义千问 Qwen3-Coder',
    providerType: 'siliconflow',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelId: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  },
  qwen25_72b: {
    name: '通义千问 Qwen2.5-72B',
    providerType: 'siliconflow',
    apiUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    modelId: 'Qwen/Qwen2.5-72B-Instruct',
  },
};

const emptyForm = {
  name: '',
  providerType: 'custom',
  apiUrl: '',
  modelId: '',
  apiKey: '',
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
  return result.messageCn || result.error || result.message || fallback;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function AIConfigPage() {
  const toast = useToast();
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const loadConfigs = async (silent = false) => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai-config', { cache: 'no-store' });
      const result = await readApiJson<AIConfig[]>(response);

      if (!response.ok || !result.success || !result.data) {
        throw new Error(resultMessage(result, '加载配置失败'));
      }

      setConfigs(result.data);

      if (!silent && result.decryptionWarnings && result.decryptionWarnings.length > 0) {
        toast.warning(
          `${result.decryptionWarnings.length} 个配置的 API Key 无法解密，请重新填写`,
          `${result.decryptionWarnings.length} config API keys need to be re-entered`
        );
      }

      return true;
    } catch (error) {
      if (!silent) {
        toast.error(errorMessage(error, '加载配置失败'), 'Failed to load configs');
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const resetForm = () => {
    setEditingConfig(null);
    setFormData(emptyForm);
    setTestResult(null);
  };

  const handlePresetSelect = (preset: keyof typeof PRESET_TEMPLATES) => {
    const template = PRESET_TEMPLATES[preset];
    setEditingConfig(null);
    setFormData({ ...emptyForm, ...template });
    setTestResult(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.apiUrl || !formData.modelId || !formData.apiKey) {
      toast.warning('请填写所有必填字段', 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const response = editingConfig
        ? await fetch(`/api/ai-config/${editingConfig.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          })
        : await fetch('/api/ai-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });

      const result = await readApiJson<AIConfig>(response);
      if (!response.ok || !result.success) {
        toast.error(resultMessage(result, '保存失败'), result.messageEn || 'Save failed');
        return;
      }

      const refreshed = await loadConfigs(true);
      if (refreshed) {
        toast.success('配置保存成功', 'Config saved successfully');
      } else {
        toast.warning('配置已保存，但列表刷新失败，请重新打开页面', 'Config saved, but refresh failed');
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error(errorMessage(error, '保存失败'), 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: AIConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      providerType: config.providerType,
      apiUrl: config.apiUrl,
      modelId: config.modelId,
      apiKey: config.apiKeyStatus === 'ok' ? config.apiKey : '',
    });
    setTestResult(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除此 AI 配置吗？')) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/ai-config/${id}`, { method: 'DELETE' });
      const result = await readApiJson<unknown>(response);

      if (!response.ok || !result.success) {
        toast.error(resultMessage(result, '删除失败'), result.messageEn || 'Delete failed');
        return;
      }

      toast.success('配置删除成功', 'Config deleted successfully');
      await loadConfigs(true);
    } catch (error) {
      toast.error(errorMessage(error, '删除失败'), 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (config: AIConfig) => {
    if (config.apiKeyStatus && config.apiKeyStatus !== 'ok' && !config.isActive) {
      toast.warning('请先编辑此配置并重新填写 API Key', 'Please re-enter the API Key before activating');
      return;
    }

    setTogglingId(config.id);
    try {
      const response = await fetch(`/api/ai-config/${config.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !config.isActive }),
      });
      const result = await readApiJson<AIConfig>(response);

      if (!response.ok || !result.success) {
        toast.error(resultMessage(result, '切换失败'), result.messageEn || 'Toggle failed');
        return;
      }

      toast.success(!config.isActive ? '配置已激活' : '配置已停用', !config.isActive ? 'Config activated' : 'Config deactivated');
      await loadConfigs(true);
    } catch (error) {
      toast.error(errorMessage(error, '切换失败'), 'Toggle failed');
    } finally {
      setTogglingId(null);
    }
  };

  const handleTest = async () => {
    if (!formData.apiUrl || !formData.modelId || !formData.apiKey) {
      toast.warning('请先填写 API URL、模型 ID 和 API Key', 'Please fill API URL, Model ID and API Key');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/ai-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiUrl: formData.apiUrl, modelId: formData.modelId, apiKey: formData.apiKey }),
      });
      const result = await readApiJson<{ message?: string }>(response);
      const message = result.message || result.error || result.messageCn;
      setTestResult({ success: result.success, message });

      if (result.success) {
        toast.success('连接测试成功', 'Connection test successful');
      } else {
        toast.error(message || '测试失败', result.messageEn || 'Test failed');
      }
    } catch (error) {
      const message = errorMessage(error, '测试失败，请检查网络连接');
      setTestResult({ success: false, message });
      toast.error(message, 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <ResponsiveContainer>
        <div className="py-6 sm:py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
                <Sparkles className="h-7 w-7 text-blue-600" />
                大模型配置
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                配置 OpenAI 兼容接口，用于自然语言 DNS 调度。
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 sm:w-auto dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              <Plus className="h-4 w-4" />
              添加配置
            </button>
          </div>

          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                  <Sparkles className="h-5 w-5 text-blue-600" />
                  推荐使用硅基流动
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  兼容 OpenAI 接口，支持 Qwen、DeepSeek 等模型。
                </p>
              </div>
              <button
                onClick={() => window.open('https://cloud.siliconflow.cn/i/8UoNCRqs', '_blank')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 md:w-auto"
              >
                <ExternalLink className="h-4 w-4" />
                打开硅基流动
              </button>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">快速开始</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">选择预设后填写自己的 API Key。</p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(PRESET_TEMPLATES).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => handlePresetSelect(key as keyof typeof PRESET_TEMPLATES)}
                  className="rounded-lg border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-50">{template.name}</div>
                  <div className="mt-1 truncate text-sm text-slate-500">{template.modelId}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">配置列表</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">当前保存的大模型连接配置。</p>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  加载中...
                </div>
              ) : configs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
                  暂无配置
                </div>
              ) : (
                <div className="space-y-4">
                  {configs.map((config) => {
                    const keyInvalid = config.apiKeyStatus && config.apiKeyStatus !== 'ok';
                    const busy = deletingId === config.id || togglingId === config.id;

                    return (
                      <div
                        key={config.id}
                        className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold text-slate-900 dark:text-slate-50">{config.name}</span>
                            <span
                              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                                config.isActive
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {config.isActive ? '已激活' : '未激活'}
                            </span>
                            <span className="inline-flex items-center rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {config.providerType}
                            </span>
                            {keyInvalid && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                <KeyRound className="h-3 w-3" />
                                密钥需重填
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-slate-500">
                            <div className="truncate">模型：{config.modelId}</div>
                            <div className="truncate">{config.apiUrl}</div>
                            {keyInvalid && <div className="text-rose-600 dark:text-rose-400">{config.apiKeyError}</div>}
                          </div>
                        </div>

                        <div className="flex w-full flex-shrink-0 items-center justify-end gap-2 sm:w-36">
                          <button
                            onClick={() => handleToggleActive(config)}
                            disabled={busy}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                              config.isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                            aria-label={config.isActive ? '停用配置' : '激活配置'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                config.isActive ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => handleEdit(config)}
                            disabled={busy}
                            className="rounded-lg p-2 transition-colors hover:bg-white disabled:opacity-50 dark:hover:bg-slate-800"
                            aria-label="编辑配置"
                          >
                            <Edit2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(config.id)}
                            disabled={busy}
                            className="rounded-lg p-2 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/40"
                            aria-label="删除配置"
                          >
                            {deletingId === config.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </ResponsiveContainer>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-slate-900">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {editingConfig ? '编辑配置' : '添加配置'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">保存后会自动设为当前激活配置。</p>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">配置名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    placeholder="如：OpenAI GPT-4"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">服务商类型</label>
                  <select
                    value={formData.providerType}
                    onChange={(event) => setFormData({ ...formData, providerType: event.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="siliconflow">硅基流动</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">API URL</label>
                <input
                  type="text"
                  value={formData.apiUrl}
                  onChange={(event) => setFormData({ ...formData, apiUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">模型 ID</label>
                <input
                  type="text"
                  value={formData.modelId}
                  onChange={(event) => setFormData({ ...formData, modelId: event.target.value })}
                  placeholder="gpt-4o-mini"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">API Key</label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(event) => setFormData({ ...formData, apiKey: event.target.value })}
                  placeholder={editingConfig?.apiKeyStatus && editingConfig.apiKeyStatus !== 'ok' ? '请重新填写 API Key' : 'sk-...'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-50"
                />
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center">
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:w-auto"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                  {testing ? '测试中...' : '测试连接'}
                </button>
                {testResult && (
                  <span
                    className={`inline-flex min-h-9 items-center rounded px-3 py-1 text-sm font-medium ${
                      testResult.success
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle className="mr-1 h-4 w-4" />
                    ) : (
                      <XCircle className="mr-1 h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="break-all">{testResult.success ? '连接成功' : testResult.message || '连接失败'}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
                disabled={saving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingConfig ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
