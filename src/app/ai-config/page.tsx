'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Loader2, CheckCircle, XCircle, ExternalLink, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ResponsiveContainer } from '@/components/ui/responsive-container';

type AIConfig = {
  id: number;
  name: string;
  providerType: string;
  apiUrl: string;
  modelId: string;
  apiKey: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const PRESET_TEMPLATES = {
  deepseek_v3: { name: 'DeepSeek-V3', providerType: 'siliconflow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', modelId: 'deepseek-ai/DeepSeek-V3' },
  qwen3_32b: { name: '通义千问 Qwen3-32B', providerType: 'siliconflow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', modelId: 'Qwen/Qwen3-32B' },
  qwen3_coder: { name: '通义千问 Qwen3-Coder', providerType: 'siliconflow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', modelId: 'Qwen/Qwen3-Coder-30B-A3B-Instruct' },
  qwen25_72b: { name: '通义千问 Qwen2.5-72B', providerType: 'siliconflow', apiUrl: 'https://api.siliconflow.cn/v1/chat/completions', modelId: 'Qwen/Qwen2.5-72B-Instruct' },
};

export default function AIConfigPage() {
  const toast = useToast();
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [formData, setFormData] = useState({ name: '', providerType: 'custom', apiUrl: '', modelId: '', apiKey: '' });

  useEffect(() => { loadConfigs(); }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ai-config');
      const result = await response.json();
      if (result.success && result.data) setConfigs(result.data);
      else toast.error('加载配置失败', 'Failed to load configs');
    } catch (error) {
      toast.error('加载配置失败，请检查网络连接', 'Failed to load configs, check network');
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (preset: keyof typeof PRESET_TEMPLATES) => {
    const template = PRESET_TEMPLATES[preset];
    setFormData({ ...formData, name: template.name, providerType: template.providerType, apiUrl: template.apiUrl, modelId: template.modelId });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.apiUrl || !formData.modelId || !formData.apiKey) {
      toast.warning('请填写所有必填字段', 'Please fill all required fields');
      return;
    }
    try {
      const response = editingConfig
        ? await fetch(`/api/ai-config/${editingConfig.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
        : await fetch('/api/ai-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      const result = await response.json();
      if (result.success) {
        toast.success('配置保存成功', 'Config saved successfully');
        await loadConfigs();
        setDialogOpen(false);
        setEditingConfig(null);
        setFormData({ name: '', providerType: 'custom', apiUrl: '', modelId: '', apiKey: '' });
        setTestResult(null);
      } else {
        toast.error('保存失败', 'Save failed');
      }
    } catch (error) {
      toast.error('保存失败，请检查网络连接', 'Save failed, check network');
    }
  };

  const handleEdit = (config: AIConfig) => {
    setEditingConfig(config);
    setFormData({ name: config.name, providerType: config.providerType, apiUrl: config.apiUrl, modelId: config.modelId, apiKey: config.apiKey });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除此 AI 配置吗？')) return;

    try {
      const response = await fetch(`/api/ai-config/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        toast.success('配置删除成功', 'Config deleted successfully');
        await loadConfigs();
      }
    } catch (error) {
      toast.error('删除失败', 'Delete failed');
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      const response = await fetch(`/api/ai-config/${id}/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      const result = await response.json();
      if (result.success) {
        toast.success(isActive ? '配置已激活' : '配置已禁用', isActive ? 'Config activated' : 'Config deactivated');
        await loadConfigs();
      } else {
        toast.error('切换失败', 'Toggle failed');
      }
    } catch (error) {
      toast.error('切换失败，请检查网络连接', 'Toggle failed, check network');
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
      const response = await fetch('/api/ai-config/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiUrl: formData.apiUrl, modelId: formData.modelId, apiKey: formData.apiKey }) });
      const result = await response.json();
      setTesting(false);
      setTestResult(result);
      if (result.success) toast.success('连接测试成功', 'Connection test successful');
      else toast.error('测试失败', 'Test failed');
    } catch (error) {
      setTesting(false);
      setTestResult({ success: false, message: '测试失败，请检查网络连接' });
      toast.error('测试失败，请检查网络连接', 'Test failed, check network');
    }
  };

  const resetForm = () => {
    setEditingConfig(null);
    setFormData({ name: '', providerType: 'custom', apiUrl: '', modelId: '', apiKey: '' });
    setTestResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <ResponsiveContainer>
      <div className="py-6 sm:py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50 mb-2 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-purple-600" />
            大模型配置
          </h1>
          <p className="text-slate-600 dark:text-slate-400">配置自定义大模型 API，支持 OpenAI 和硅基流动等兼容 OpenAI 接口的服务商</p>
        </div>

        {/* 硅基流动引导卡片 */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-slate-900 dark:text-slate-50"><Sparkles className="w-5 h-5 text-purple-600" />推荐使用硅基流动</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">兼容 OpenAI 接口，支持 Qwen/DeepSeek 等开源大模型，注册即送额度</p>
            </div>
            <button onClick={() => window.open('https://cloud.siliconflow.cn/i/8UoNCRqs', '_blank')} className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
              <ExternalLink className="w-4 h-4" />
              注册硅基流动（免费额度）
            </button>
          </div>
        </div>

        {/* 预设模板卡片 */}
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700 mb-6">
          <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-50">快速开始</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">选择预设模板快速创建配置</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <button onClick={() => handlePresetSelect('deepseek_v3')} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className="font-semibold mb-1 text-slate-900 dark:text-slate-50">DeepSeek-V3</div>
              <div className="text-sm text-slate-500">高性价比推理模型</div>
            </button>
            <button onClick={() => handlePresetSelect('qwen3_32b')} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className="font-semibold mb-1 text-slate-900 dark:text-slate-50">通义千问 Qwen3-32B</div>
              <div className="text-sm text-slate-500">阿里开源旗舰模型</div>
            </button>
            <button onClick={() => handlePresetSelect('qwen3_coder')} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className="font-semibold mb-1 text-slate-900 dark:text-slate-50">Qwen3-Coder</div>
              <div className="text-sm text-slate-500">代码专用模型</div>
            </button>
            <button onClick={() => handlePresetSelect('qwen25_72b')} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <div className="font-semibold mb-1 text-slate-900 dark:text-slate-50">Qwen2.5-72B</div>
              <div className="text-sm text-slate-500">超大规模推理</div>
            </button>
          </div>
        </div>

        {/* 配置列表 */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">配置列表</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">管理所有大模型配置</p>
            </div>
            <button onClick={() => { resetForm(); setDialogOpen(true); }} className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors dark:bg-slate-700 dark:hover:bg-slate-600">
              <Plus className="w-4 h-4" />
              添加配置
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="text-center py-8 text-slate-500">加载中...</div>
            ) : configs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">暂无配置，点击右上角添加配置</div>
            ) : (
              <div className="space-y-4">
                {configs.map(config => (
                  <div key={config.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 dark:text-slate-50">{config.name}</span>
                        {config.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">已激活</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">未激活</span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">{config.providerType}</span>
                      </div>
                      <div className="text-sm text-slate-500 space-y-1">
                        <div>模型: {config.modelId}</div>
                        <div className="truncate">{config.apiUrl}</div>
                      </div>
                    </div>
                    <div className="flex w-full flex-shrink-0 items-center justify-end gap-2 sm:w-auto">
                      <button onClick={() => handleToggleActive(config.id, !config.isActive)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.isActive ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <button onClick={() => handleEdit(config)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      </button>
                      <button onClick={() => handleDelete(config.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 添加/编辑对话框 */}
        {dialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[85dvh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{editingConfig ? '编辑配置' : '添加配置'}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">配置大模型 API 连接信息</p>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">配置名称</label>
                    <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="如：OpenAI GPT-4" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">服务商类型</label>
                    <select value={formData.providerType} onChange={e => setFormData({ ...formData, providerType: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                      <option value="openai">OpenAI</option>
                      <option value="siliconflow">硅基流动</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API URL</label>
                  <input type="text" value={formData.apiUrl} onChange={e => setFormData({ ...formData, apiUrl: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">模型 ID</label>
                  <input type="text" value={formData.modelId} onChange={e => setFormData({ ...formData, modelId: e.target.value })} placeholder="gpt-4" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">API Key</label>
                  <input type="password" value={formData.apiKey} onChange={e => setFormData({ ...formData, apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>

                {/* 测试连接 */}
                <div className="flex items-center gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button onClick={handleTest} disabled={testing} className="border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 cursor-not-allowed">
                    {testing ? (<><Loader2 className="w-4 h-4 animate-spin" />测试中...</>) : (<><Edit2 className="w-4 h-4" />测试连接</>)}
                  </button>
                  {testResult && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2 ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'}`}>
                      {testResult.success ? (<><CheckCircle className="w-3 h-3 mr-1" />连接成功</>) : (<><XCircle className="w-3 h-3 mr-1" />{testResult.message || '连接失败'}</>)}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                <button onClick={() => setDialogOpen(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors">取消</button>
                <button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">{editingConfig ? '保存' : '创建'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
      </ResponsiveContainer>
    </div>
  );
}
