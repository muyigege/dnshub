'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Trash2, CheckCircle, X, Plus, Search, Undo2, Clock, Square, CheckSquare } from 'lucide-react';
import { ResponsiveContainer, ResponsiveTable, InlineActionKeeper, MobileBottomPanel } from '@/components/ui/responsive-container';
import { useToast } from '@/components/ui/toast';

interface DNSRecord {
  id: number;
  domainId: number;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  isActive: boolean;
  updatedAt: string;
}

type OperationLog = {
  id: number;
  action: 'create' | 'update' | 'delete' | 'sync' | 'batch_delete';
  recordType?: string;
  recordName?: string;
  recordContent?: string;
  details: string;
  timestamp: Date;
  rollbackData?: any;
};

export default function DomainRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const toast = useToast();
  const { id } = use(params);
  const domainId = parseInt(id);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainInfo, setDomainInfo] = useState<any>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // 批量操作
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  // 同步结果
  const [syncResult, setSyncResult] = useState<{ synced?: number; total?: number; error?: string } | null>(null);

  // 操作记录
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logIdRef = useRef(0);

  const [formData, setFormData] = useState({ type: 'A', name: '@', content: '', ttl: 600, priority: 10 });

  useEffect(() => { loadData(); }, [domainId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recordsResponse, domainResponse] = await Promise.all([
        fetch(`/api/records?domainId=${domainId}`),
        fetch(`/api/domains`),
      ]);
      const recordsResult = await recordsResponse.json();
      const domainResult = await domainResponse.json();
      if (recordsResult.success && recordsResult.data) setRecords(recordsResult.data);
      if (domainResult.success && domainResult.data) {
        const domain = domainResult.data.find((d: any) => d.id === domainId);
        setDomainInfo(domain);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (action: OperationLog['action'], details: string, rollbackData?: any, recordType?: string, recordName?: string, recordContent?: string) => {
    const log: OperationLog = { id: ++logIdRef.current, action, recordType, recordName, recordContent, details, timestamp: new Date(), rollbackData };
    setOperationLogs(prev => [...prev.slice(-20), log]);
  };

  const handleSyncRecords = async () => {
    if (!domainInfo) return;
    try {
      const response = await fetch(`/api/domains/${domainId}/records/sync`, { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        const synced = result.data?.synced || 0;
        const total = result.data?.total || 0;
        setSyncResult({ synced, total });
        toast.success(`同步成功：处理 ${synced} 条新记录，共 ${total} 条`, `Sync successful: ${synced} new records processed, total ${total}`);
        addLog('sync', `同步成功：处理 ${synced} 条新记录，共 ${total} 条`);
        await loadData();
      } else {
        const errorMsg = result.messageCn || result.error || '同步失败';
        const errorMsgEn = result.messageEn || 'Sync failed';
        toast.error(errorMsg, errorMsgEn);
        setSyncResult({ error: errorMsg });
      }
    } catch (error) {
      const errorMsg = '同步失败，请检查网络连接';
      toast.error(errorMsg, 'Sync failed, check network');
      setSyncResult({ error: errorMsg });
    }
  };

  const handleDelete = async (record: DNSRecord) => {
    setDeleteConfirm(null);
    try {
      const response = await fetch(`/api/records/${record.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        addLog('delete', `删除 ${record.type} 记录 ${record.name}`, { record }, record.type, record.name, record.content);
        await loadData();
      }
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeleteConfirm(false);
    const recordsToDelete = records.filter(r => selectedRecords.has(r.id));
    const deletedRecords: DNSRecord[] = [];
    for (const record of recordsToDelete) {
      try {
        const response = await fetch(`/api/records/${record.id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) deletedRecords.push(record);
      } catch (error) {
        console.error('Failed to delete record:', error);
      }
    }
    if (deletedRecords.length > 0) {
      addLog('batch_delete', `批量删除 ${deletedRecords.length} 条记录`, { records: deletedRecords });
      setSelectedRecords(new Set());
      await loadData();
    }
  };

  const handleRollback = async (log: OperationLog) => {
    if (!log.rollbackData) return;
    try {
      if (log.action === 'delete' && log.rollbackData.record) {
        const record = log.rollbackData.record;
        const response = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domainId: record.domainId, type: record.type, name: record.name, content: record.content, ttl: record.ttl, priority: record.priority }),
        });
        const result = await response.json();
        if (result.success) {
          addLog('create', `回退：重新创建 ${record.type} 记录 ${record.name}`);
          await loadData();
        }
      } else if (log.action === 'batch_delete' && log.rollbackData.records) {
        for (const record of log.rollbackData.records) {
          await fetch('/api/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domainId: record.domainId, type: record.type, name: record.name, content: record.content, ttl: record.ttl, priority: record.priority }),
          });
        }
        addLog('create', `回退：重新创建 ${log.rollbackData.records.length} 条记录`);
        await loadData();
      }
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRecord) {
        const response = await fetch(`/api/records/${editingRecord.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (result.success) {
          addLog('update', `更新 ${formData.type} 记录 ${formData.name}`, { oldRecord: editingRecord }, formData.type, formData.name, formData.content);
          setShowModal(false);
          await loadData();
        }
      } else {
        const response = await fetch('/api/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, domainId }),
        });
        const result = await response.json();
        if (result.success) {
          addLog('create', `创建 ${formData.type} 记录 ${formData.name}`, null, formData.type, formData.name, formData.content);
          setShowModal(false);
          await loadData();
        }
      }
    } catch (error) {
      console.error('Failed to save record:', error);
    }
  };

  const handleEdit = (record: DNSRecord) => {
    setEditingRecord(record);
    setFormData({ type: record.type, name: record.name, content: record.content, ttl: record.ttl, priority: record.priority || 10 });
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingRecord(null);
    setFormData({ type: 'A', name: '@', content: '', ttl: 600, priority: 10 });
    setShowModal(true);
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedRecords(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) setSelectedRecords(new Set());
    else setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
  };

  const filteredRecords = records.filter((record) => {
    const matchesSearch = record.name.toLowerCase().includes(searchTerm.toLowerCase()) || record.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || record.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const recordTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SRV', 'SOA'];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <ResponsiveContainer>
          <div className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button onClick={() => router.back()} className="text-slate-600 hover:text-slate-900 dark:text-slate-400 flex items-center gap-2 text-sm">
              ← 返回域名列表
            </button>
            <div className="flex items-center gap-2">
              <button onClick={handleSyncRecords} className="px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4" />
                同步记录
              </button>
              <button onClick={() => setShowLogs(!showLogs)} className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${showLogs ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                <Clock className="w-4 h-4" />
                操作记录
              </button>
            </div>
          </div>

          <div className="pb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{domainInfo?.name || '加载中...'}</h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{domainInfo?.providerName && `服务商: ${domainInfo.providerName}`}</p>
          </div>

          {/* 同步结果提示 */}
          {syncResult && (
            <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${syncResult.error ? 'bg-red-50 dark:bg-red-900/30 text-red-700' : 'bg-green-50 dark:bg-green-900/30 text-green-700'}`}>
              <span>{syncResult.error || `同步成功：处理 ${syncResult.synced} 条新记录，共 ${syncResult.total} 条`}</span>
              <button onClick={() => setSyncResult(null)} className="hover:opacity-70"><X className="w-4 h-4" /></button>
            </div>
          )}
        </ResponsiveContainer>
      </div>

      {/* 主内容区 */}
      <ResponsiveContainer>
        <div className="py-6 flex flex-col lg:flex-row lg:flex-wrap lg:gap-6">
          {/* 记录列表 */}
          <div className="flex-1 min-w-[300px]">
            {/* 工具栏 */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-3 sm:p-4 mb-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="搜索记录..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm" />
                </div>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm">
                  <option value="all">全部类型</option>
                  {recordTypes.map((type) => (<option key={type} value={type}>{type}</option>))}
                </select>
              </div>
              
              {/* 操作按钮 */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {/* 批量删除按钮 */}
                <InlineActionKeeper isConfirming={batchDeleteConfirm && selectedRecords.size > 0} width="large">
                  {batchDeleteConfirm && selectedRecords.size > 0 ? (
                    <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      <span className="text-sm text-red-700 dark:text-red-300 whitespace-nowrap">确认删除 {selectedRecords.size} 条?</span>
                      <button onClick={handleBatchDelete} className="px-2 py-1 bg-red-600 text-white rounded text-sm flex-shrink-0">确认</button>
                      <button onClick={() => setBatchDeleteConfirm(false)} className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 rounded text-sm flex-shrink-0">取消</button>
                    </div>
                  ) : (
                    selectedRecords.size > 0 && (
                      <button onClick={() => setBatchDeleteConfirm(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm">
                        <Trash2 className="w-4 h-4" />
                        删除选中 ({selectedRecords.size})
                      </button>
                    )
                  )}
                </InlineActionKeeper>
                
                <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" />
                  添加记录
                </button>
              </div>
            </div>

            {/* 记录表格 */}
            {loading ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-slate-500">没有找到记录</p>
              </div>
            ) : (
              <ResponsiveTable>
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left w-12 min-w-[48px]">
                        <button onClick={toggleSelectAll} className="p-1">
                          {selectedRecords.size === filteredRecords.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase min-w-[80px]">类型</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase min-w-[100px]">名称</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase min-w-[140px]">内容</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase min-w-[80px]">TTL</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase min-w-[80px]">状态</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase w-[160px] min-w-[160px] flex-shrink-0">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredRecords.map((record) => (
                      <tr key={record.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedRecords.has(record.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                        <td className="px-4 py-4 w-12 min-w-[48px]">
                          <button onClick={() => toggleSelect(record.id)} className="p-1">
                            {selectedRecords.has(record.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap min-w-[80px]">
                          <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700">{record.type}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white min-w-[100px]">{record.name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 min-w-[140px] max-w-xs truncate">{record.content}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 min-w-[80px]">{record.ttl}</td>
                        <td className="px-6 py-4 whitespace-nowrap min-w-[80px]">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${record.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700'}`}>
                            {record.isActive ? '活跃' : '禁用'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm w-[160px] min-w-[160px] flex-shrink-0">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleEdit(record)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400">编辑</button>
                            {/* 删除按钮 */}
                            <InlineActionKeeper isConfirming={deleteConfirm === record.id} width="small">
                              {deleteConfirm === record.id ? (
                                <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 rounded px-2 py-1">
                                  <span className="text-xs text-red-600">确认?</span>
                                  <button onClick={() => handleDelete(record)} className="text-red-600"><CheckCircle className="w-4 h-4" /></button>
                                  <button onClick={() => setDeleteConfirm(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                                </div>
                              ) : (
                                <button onClick={() => setDeleteConfirm(record.id)} className="text-red-600 hover:text-red-900 dark:text-red-400">删除</button>
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
            {!loading && filteredRecords.length > 0 && (
              <div className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                显示 {filteredRecords.length} 条记录，共 {records.length} 条
                {selectedRecords.size > 0 && ` · 已选中 ${selectedRecords.size} 条`}
              </div>
            )}
          </div>

          {/* 操作记录面板 - 桌面端侧边栏 */}
          {showLogs && (
            <div className="hidden lg:block lg:w-80 lg:flex-shrink-0 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">操作记录</h3>
                <button onClick={() => setOperationLogs([])} className="text-xs text-slate-500 hover:text-slate-700">清空</button>
              </div>
              <div className="overflow-y-auto p-3 space-y-2 max-h-[400px] lg:max-h-[calc(100vh-300px)]">
                {operationLogs.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">暂无操作记录</p>
                ) : (
                  operationLogs.map((log) => (
                    <div key={log.id} className={`p-3 rounded-lg text-sm ${log.action === 'delete' || log.action === 'batch_delete' ? 'bg-red-50 dark:bg-red-900/20' : log.action === 'create' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {log.action === 'create' ? '创建' : log.action === 'update' ? '更新' : log.action === 'delete' ? '删除' : log.action === 'batch_delete' ? '批量删除' : '同步'}
                          {log.recordType && ` ${log.recordType}`}
                          {log.recordName && ` ${log.recordName}`}
                        </span>
                        <span className="text-xs text-slate-400">{log.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{log.details}</p>
                      {log.rollbackData && (
                        <button onClick={() => handleRollback(log)} className="mt-2 text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                          <Undo2 className="w-3 h-3" />
                          回退此操作
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </ResponsiveContainer>

      {/* 操作记录面板 - 移动端底部弹出 */}
      <MobileBottomPanel isOpen={showLogs} title="操作记录" onClose={() => setShowLogs(false)}>
        <div className="space-y-2">
          {operationLogs.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">暂无操作记录</p>
          ) : (
            operationLogs.map((log) => (
              <div key={log.id} className={`p-3 rounded-lg text-sm ${log.action === 'delete' || log.action === 'batch_delete' ? 'bg-red-50 dark:bg-red-900/20' : log.action === 'create' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {log.action === 'create' ? '创建' : log.action === 'update' ? '更新' : log.action === 'delete' ? '删除' : log.action === 'batch_delete' ? '批量删除' : '同步'}
                    {log.recordType && ` ${log.recordType}`}
                    {log.recordName && ` ${log.recordName}`}
                  </span>
                  <span className="text-xs text-slate-400">{log.timestamp.toLocaleTimeString()}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{log.details}</p>
                {log.rollbackData && (
                  <button onClick={() => handleRollback(log)} className="mt-2 text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1">
                    <Undo2 className="w-3 h-3" />
                    回退此操作
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <button onClick={() => setOperationLogs([])} className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg">清空记录</button>
      </MobileBottomPanel>

      {/* 添加/编辑对话框 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90dvh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">{editingRecord ? '编辑记录' : '添加记录'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">类型</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                  {recordTypes.map((type) => (<option key={type} value={type}>{type}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">名称</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700" placeholder="@ 或子域名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">内容</label>
                <input type="text" value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700" placeholder="IP 地址或域名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">TTL</label>
                <input type="number" value={formData.ttl} onChange={(e) => setFormData({ ...formData, ttl: parseInt(e.target.value) })} className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700" />
              </div>
              {(formData.type === 'MX' || formData.type === 'SRV') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">优先级</label>
                  <input type="number" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })} className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700" />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editingRecord ? '保存' : '添加'}</button>
                <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300">取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}