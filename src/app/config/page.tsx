'use client';

import { useState } from 'react';
import { Download, Upload, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function ConfigPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/config');
      const result = await response.json();

      if (result.success) {
        // 创建下载文件
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dns-hub-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setMessage({ type: 'success', text: '配置导出成功！' });
      } else {
        setMessage({ type: 'error', text: result.error || '导出失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '导出失败' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.json')) {
        setMessage({ type: 'error', text: '请选择 JSON 文件' });
        setImportFile(null);
        return;
      }
      setImportFile(file);
      setMessage(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setMessage({ type: 'error', text: '请先选择导入文件' });
      return;
    }

    setImporting(true);
    setMessage(null);

    try {
      const content = await importFile.text();
      const data = JSON.parse(content);

      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: data.data, overwrite }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: '配置导入成功！' });
        setImportFile(null);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setMessage({ type: 'error', text: result.error || '导入失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '导入失败，文件格式不正确' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">配置备份与迁移</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            导出或导入系统配置，方便数据备份和迁移
          </p>
        </div>

        {/* 导出区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            导出配置
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            将所有配置（包括服务商、AI 配置、域名和记录）导出为 JSON 文件。
            请注意：API 密钥等敏感信息会以加密形式存储在导出文件中。
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? '导出中...' : '导出配置'}
          </button>
        </div>

        {/* 导入区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-green-600" />
            导入配置
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            从之前导出的 JSON 文件导入配置。如果系统已有数据，请勾选覆盖选项。
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="flex-1 text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
              />
            </div>

            {importFile && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                已选择文件: <span className="font-medium">{importFile.name}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="overwrite"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <label htmlFor="overwrite" className="text-sm text-gray-700 dark:text-gray-300">
                覆盖现有数据
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-500">
                （警告：将删除所有现有配置）
              </span>
            </div>

            <button
              onClick={handleImport}
              disabled={importing || !importFile}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? '导入中...' : '导入配置'}
            </button>
          </div>
        </div>

        {/* 提示信息 */}
        {message && (
          <div className={`mt-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 dark:bg-green-900/30 dark:border-green-800' 
              : 'bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            )}
            <span className={message.type === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}>
              {message.text}
            </span>
          </div>
        )}

        {/* 注意事项 */}
        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">⚠️ 重要提示</h3>
          <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            <li>• 导出的配置文件包含加密的敏感信息，请妥善保管</li>
            <li>• 导入前请确保目标系统的加密密钥与源系统相同</li>
            <li>• 覆盖模式将删除所有现有数据，请谨慎操作</li>
            <li>• 建议在导入前先导出当前配置作为备份</li>
          </ul>
        </div>
      </main>
    </div>
  );
}