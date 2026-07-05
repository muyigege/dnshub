'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Play, CheckCircle, AlertCircle, RefreshCw, ChevronDown, ChevronUp, Zap, Settings, X, Copy, Check, Loader2 } from 'lucide-react';

type DNSInstruction = {
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'QUERY';
    domain: string;
    type: string;
    name: string;
    content?: string;
    oldContent?: string;
    ttl?: number;
    priority?: number;
    reasoning: string;
};

type BatchIntent = {
    batch: boolean;
    instructions: DNSInstruction[];
    reasoning: string;
};

type DomainInfo = {
    id: number;
    name: string;
    providerName?: string;
};

type ExecLog = {
    id: number;
    action: string;
    type: string;
    name: string;
    status: 'success' | 'error';
    message: string;
    timestamp: Date;
};

export default function AIMagicPage() {
    const [prompt, setPrompt] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parsedIntent, setParsedIntent] = useState<DNSInstruction | null>(null);
    const [batchIntent, setBatchIntent] = useState<BatchIntent | null>(null);
    const [clarification, setClarification] = useState<any>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [execResult, setExecResult] = useState<any>(null);
    const [domains, setDomains] = useState<DomainInfo[]>([]);
    const [isLoadingDomains, setIsLoadingDomains] = useState(true);
    const [expandedInstructions, setExpandedInstructions] = useState<Set<number>>(new Set());
    const [currentExecIndex, setCurrentExecIndex] = useState(-1);
    const [autoExecute, setAutoExecute] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [execLogs, setExecLogs] = useState<ExecLog[]>([]);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [parseProgress, setParseProgress] = useState(0);
    const logIdRef = useRef(0);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDomains();
    }, []);

    useEffect(() => {
        if (execLogs.length > 0) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [execLogs]);

    // 解析进度动画
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isParsing) {
            interval = setInterval(() => {
                setParseProgress(prev => (prev + 5) % 100);
            }, 100);
        } else {
            setParseProgress(0);
        }
        return () => clearInterval(interval);
    }, [isParsing]);

    const loadDomains = async () => {
        setIsLoadingDomains(true);
        try {
            const res = await fetch('/api/domains');
            const result = await res.json();
            if (result.success && result.data) {
                setDomains(result.data);
            }
        } catch (e) {
            console.error('Failed to load domains', e);
        } finally {
            setIsLoadingDomains(false);
        }
    };

    const addLog = (action: string, type: string, name: string, status: 'success' | 'error', message: string) => {
        const newLog: ExecLog = {
            id: ++logIdRef.current,
            action,
            type,
            name,
            status,
            message,
            timestamp: new Date(),
        };
        setExecLogs(prev => [...prev.slice(-50), newLog]);
    };

    const handleParse = async () => {
        if (!prompt.trim()) return;
        setIsParsing(true);
        setParsedIntent(null);
        setBatchIntent(null);
        setClarification(null);
        setExecResult(null);
        setCurrentExecIndex(-1);

        try {
            const res = await fetch('/api/ai-magic/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            const data = await res.json();

            if (data.success) {
                if (data.data.needsClarification) {
                    setClarification(data.data);
                } else if (data.data.batch && data.data.instructions && data.data.instructions.length > 1) {
                    setBatchIntent(data.data);
                    setExpandedInstructions(new Set(data.data.instructions.map((_: any, i: number) => i)));
                } else {
                    const singleIntent = data.data.instructions ? data.data.instructions[0] : data.data;
                    setParsedIntent(singleIntent);
                    
                    if (autoExecute) {
                        await executeSingle(singleIntent);
                    }
                }
            } else {
                addLog('PARSE', '-', prompt.slice(0, 30), 'error', data.error);
            }
        } catch (error) {
            addLog('PARSE', '-', prompt.slice(0, 30), 'error', '解析意图失败，请检查网络连接或 AI 配置');
        } finally {
            setIsParsing(false);
        }
    };

    const executeSingle = async (instruction: DNSInstruction) => {
        setIsExecuting(true);
        setParsedIntent(null);

        try {
            const res = await fetch('/api/ai-magic/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(instruction),
            });
            const data = await res.json();

            if (data.success) {
                const msg = data.data?.message || '操作成功执行完毕';
                setExecResult({ success: true, message: msg });
                addLog(instruction.action, instruction.type, instruction.name, 'success', msg);
            } else {
                const err = data.error || '执行失败';
                setExecResult({ success: false, message: err });
                addLog(instruction.action, instruction.type, instruction.name, 'error', err);
            }
        } catch (error) {
            const err = '执行过程发生网络异常';
            setExecResult({ success: false, message: err });
            addLog(instruction.action, instruction.type, instruction.name, 'error', err);
        } finally {
            setIsExecuting(false);
        }
    };

    const handleExecute = async () => {
        if (!parsedIntent) return;
        await executeSingle(parsedIntent);
        setPrompt('');
    };

    const handleExecuteBatch = async () => {
        if (!batchIntent || batchIntent.instructions.length === 0) return;
        setIsExecuting(true);
        setExecResult(null);

        const results: { success: boolean; instruction: DNSInstruction; message: string }[] = [];
        let allSuccess = true;

        for (let i = 0; i < batchIntent.instructions.length; i++) {
            setCurrentExecIndex(i);
            const instruction = batchIntent.instructions[i];

            try {
                const res = await fetch('/api/ai-magic/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(instruction),
                });
                const data = await res.json();

                if (data.success) {
                    const msg = data.data?.message || '操作成功';
                    results.push({ success: true, instruction, message: msg });
                    addLog(instruction.action, instruction.type, instruction.name, 'success', msg);
                } else {
                    results.push({ success: false, instruction, message: data.error });
                    addLog(instruction.action, instruction.type, instruction.name, 'error', data.error);
                    allSuccess = false;
                }
            } catch (error) {
                results.push({ success: false, instruction, message: '网络异常' });
                addLog(instruction.action, instruction.type, instruction.name, 'error', '网络异常');
                allSuccess = false;
            }
        }

        setCurrentExecIndex(-1);
        setExecResult({ success: allSuccess, results, isBatch: true });
        setBatchIntent(null);
        setPrompt('');
        setIsExecuting(false);
    };

    const toggleInstruction = (index: number) => {
        const newExpanded = new Set(expandedInstructions);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedInstructions(newExpanded);
    };

    const getActionDisplay = (action: string) => {
        const actionMap: Record<string, { cn: string; en: string; color: string }> = {
            CREATE: { cn: '新增', en: 'ADD', color: 'text-green-600 dark:text-green-400' },
            UPDATE: { cn: '更新', en: 'UPDATE', color: 'text-blue-600 dark:text-blue-400' },
            DELETE: { cn: '删除', en: 'DELETE', color: 'text-red-600 dark:text-red-400' },
            QUERY: { cn: '查询', en: 'QUERY', color: 'text-purple-600 dark:text-purple-400' },
        };
        return actionMap[action] || { cn: action, en: action, color: 'text-slate-600' };
    };

    const getStatusBadge = (status: boolean) => {
        return status ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                [成功/SUCCESS]
            </span>
        ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                [失败/FAILED]
            </span>
        );
    };

    const copyLog = async (log: ExecLog) => {
        const text = `[${log.timestamp.toLocaleTimeString()}] ${log.action} ${log.type} ${log.name}: ${log.message}`;
        // HTTP 部署时 navigator.clipboard 不可用，需降级
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                fallbackCopy(text);
            }
        } else {
            fallbackCopy(text);
        }
        setCopiedId(log.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const fallbackCopy = (text: string) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
        } catch {
            // 忽略复制失败
        }
        document.body.removeChild(ta);
    };

    const clearLogs = () => setExecLogs([]);

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
            {/* 顶部 Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Sparkles className="w-7 h-7 text-purple-600" />
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">AI 智能调度中心</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">自然语言管理 DNS 解析</p>
                        </div>
                    </div>
                    <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <Settings className={`w-5 h-5 text-slate-600 dark:text-slate-400 ${showSettings ? 'text-purple-600' : ''}`} />
                    </button>
                </div>
            </header>

            {/* 设置面板 */}
            {showSettings && (
                <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                        <label className="flex flex-wrap items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={autoExecute} onChange={(e) => setAutoExecute(e.target.checked)} className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                            <span className="text-sm text-slate-700 dark:text-slate-300">自动执行模式</span>
                            <span className="text-xs text-slate-500">（单条操作解析后直接执行，无需确认）</span>
                        </label>
                    </div>
                </div>
            )}

            {/* 主内容区 */}
            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100dvh-180px)]">
                    {/* 左侧：输入和解析结果 */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        {/* 输入框 */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
                            <textarea
                                className="w-full h-24 p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm"
                                placeholder="输入 DNS 操作指令，如：给 example.com 添加一个 A 记录指向 1.1.1.1"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleParse();
                                    }
                                }}
                            />
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    {autoExecute && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 text-xs rounded-full">
                                            <Zap className="w-3 h-3" />
                                            自动执行
                                        </span>
                                    )}
                                </div>
                                <button onClick={handleParse} disabled={isParsing || !prompt.trim() || isExecuting} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                                    {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    {isParsing ? '解析中...' : '发送指令'}
                                </button>
                            </div>
                        </div>

                        {/* 解析中动画 */}
                        {isParsing && (
                            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-xl shadow-sm border border-purple-200 dark:border-purple-700 p-6">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <Zap className="w-10 h-10 text-purple-600 animate-pulse" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-16 h-16 border-2 border-purple-300 rounded-full animate-spin opacity-20"></div>
                                        </div>
                                        {/* 点阵动画效果 */}
                                        <div className="absolute -inset-4 flex items-center justify-center">
                                            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                                                <div
                                                    key={i}
                                                    className="absolute w-2 h-2 bg-purple-400 rounded-full animate-ping"
                                                    style={{
                                                        transform: `rotate(${angle}deg) translateY(-32px)`,
                                                        animationDelay: `${i * 100}ms`,
                                                        animationDuration: '1.5s',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                                            ⚡ 正在解析自然语言指令
                                        </h3>
                                        <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">Parsing instructions...</p>
                                        <div className="mt-3">
                                            <div className="h-2 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-purple-600 transition-all duration-100" style={{ width: `${parseProgress}%` }}></div>
                                            </div>
                                        </div>
                                        {/* 动态点阵指示器 */}
                                        <div className="flex items-center gap-1 mt-3">
                                            {[0, 1, 2, 3, 4].map((i) => (
                                                <div
                                                    key={i}
                                                    className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                                                    style={{
                                                        animationDelay: `${i * 150}ms`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 单条操作确认区 - 仅在非自动执行模式显示 */}
                        {parsedIntent && !autoExecute && !isParsing && (
                            <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-700 p-4 animate-in fade-in slide-in-from-bottom-2">
                                <h3 className="text-sm font-semibold mb-3 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    确认执行
                                </h3>
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getActionDisplay(parsedIntent.action).color}`}>
                                            [{getActionDisplay(parsedIntent.action).cn}/{getActionDisplay(parsedIntent.action).en}]
                                        </span>
                                        <span className="text-sm text-slate-600 dark:text-slate-400">
                                            Type: <span className="font-medium">{parsedIntent.type}</span> |
                                            Name: <span className="font-medium">{parsedIntent.name}</span> |
                                            Domain: <span className="font-medium">{parsedIntent.domain}</span>
                                        </span>
                                    </div>
                                    {parsedIntent.content && (
                                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                                            Content: <span className="font-medium">{parsedIntent.content}</span>
                                        </div>
                                    )}
                                    {parsedIntent.oldContent && parsedIntent.action === 'UPDATE' && (
                                        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                                            原内容: <span className="line-through text-red-500">{parsedIntent.oldContent}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <button onClick={handleExecute} disabled={isExecuting} className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                        <CheckCircle className="w-4 h-4" />
                                        确认执行
                                    </button>
                                    <button onClick={() => setParsedIntent(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                        取消
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 批量操作确认区 - 结构化 Diff 展示 */}
                        {batchIntent && !isParsing && (
                            <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl shadow-sm border border-indigo-200 dark:border-indigo-700 p-4 animate-in fade-in slide-in-from-bottom-2">
                                <h3 className="text-sm font-semibold mb-3 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    批量操作预览（共 {batchIntent.instructions.length} 项）
                                </h3>
                                <div className="bg-white dark:bg-slate-800 rounded-lg overflow-x-auto scrollbar-thin">
                                    {/* 表格头部 */}
                                    <div className="grid min-w-[720px] grid-cols-12 gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-600">
                                        <div className="col-span-2">序号</div>
                                        <div className="col-span-2">操作</div>
                                        <div className="col-span-1">类型</div>
                                        <div className="col-span-2">名称</div>
                                        <div className="col-span-4">内容</div>
                                        <div className="col-span-1">状态</div>
                                    </div>
                                    {/* 表格内容 */}
                                    {batchIntent.instructions.map((instruction, index) => {
                                        const actionInfo = getActionDisplay(instruction.action);
                                        const isExecuting = currentExecIndex === index;
                                        return (
                                            <div key={index} className={`grid min-w-[720px] grid-cols-12 gap-2 px-4 py-2 border-t border-slate-200 dark:border-slate-700 items-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors`}>
                                                <div className="col-span-2 flex items-center">
                                                    {isExecuting ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                                    ) : (
                                                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-700">
                                                            {index + 1}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="col-span-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${actionInfo.color}`}>
                                                        [{actionInfo.cn}/{actionInfo.en}]
                                                    </span>
                                                </div>
                                                <div className="col-span-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                                                    {instruction.type}
                                                </div>
                                                <div className="col-span-2 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                                    {instruction.name}
                                                </div>
                                                <div className="col-span-4 text-xs text-slate-600 dark:text-slate-400 truncate">
                                                    {instruction.action === 'DELETE' ? (
                                                        <span className="text-red-500 line-through">{instruction.content || instruction.oldContent}</span>
                                                    ) : instruction.action === 'UPDATE' && instruction.oldContent ? (
                                                        <span>
                                                            <span className="text-red-500 line-through">{instruction.oldContent}</span>
                                                            {' → '}
                                                            <span className="text-green-600">{instruction.content}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-600">{instruction.content}</span>
                                                    )}
                                                </div>
                                                <div className="col-span-1">
                                                    {isExecuting ? (
                                                        <span className="text-xs text-indigo-600">执行中</span>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">-</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <button onClick={handleExecuteBatch} disabled={isExecuting} className="flex-1 flex justify-center items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                                        {isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                        执行全部 {batchIntent.instructions.length} 项
                                    </button>
                                    <button onClick={() => setBatchIntent(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                                        取消
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 澄清提示区 */}
                        {clarification && !isParsing && (
                            <div className="bg-orange-50 dark:bg-orange-900/30 rounded-xl shadow-sm border border-orange-200 dark:border-orange-700 p-4">
                                <h3 className="text-sm font-semibold mb-2 text-orange-900 dark:text-orange-200">
                                    ⚠️ 指令不明确
                                </h3>
                                <p className="text-orange-800 dark:text-orange-300 text-sm mb-2">{clarification.message}</p>
                                {clarification.suggestions && clarification.suggestions.length > 0 && (
                                    <div className="mt-3">
                                        <h4 className="text-xs font-semibold text-orange-900 dark:text-orange-200 mb-1">建议这样说：</h4>
                                        <ul className="list-disc pl-4 text-sm text-orange-800 dark:text-orange-300 space-y-1">
                                            {clarification.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 执行结果 */}
                        {execResult && !isParsing && (
                            <div className={`rounded-xl shadow-sm border p-4 ${execResult.success ? 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800'}`}>
                                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${execResult.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                    {execResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    {execResult.success ? '执行完成' : '执行失败'}
                                </h3>
                                {execResult.isBatch && execResult.results ? (
                                    <div className="space-y-2">
                                        {execResult.results.map((item: any, index: number) => {
                                            const actionInfo = getActionDisplay(item.instruction.action);
                                            return (
                                                <div key={index} className="flex flex-col gap-2 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${actionInfo.color}`}>
                                                            [{actionInfo.cn}/{actionInfo.en}]
                                                        </span>
                                                        <span className="text-sm text-slate-600 dark:text-slate-400">
                                                            {item.instruction.type} | {item.instruction.name}
                                                        </span>
                                                    </div>
                                                    {getStatusBadge(item.success)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <p className={`text-sm ${execResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                            {execResult.message}
                                        </p>
                                        {getStatusBadge(execResult.success)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 右侧：执行日志 */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex min-h-[360px] flex-col overflow-hidden lg:min-h-0">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-50">执行日志</h3>
                            <button onClick={clearLogs} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                清空
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {execLogs.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-8">暂无执行记录</p>
                            ) : (
                                execLogs.map((log) => {
                                    const actionInfo = getActionDisplay(log.action);
                                    return (
                                        <div key={log.id} className={`text-xs p-3 rounded-lg ${log.status === 'success' ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${actionInfo.color}`}>
                                                        [{actionInfo.cn}/{actionInfo.en}]
                                                    </span>
                                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                                        {log.type}
                                                    </span>
                                                    <span className="text-slate-500">
                                                        {log.name}
                                                    </span>
                                                </div>
                                                <button onClick={() => copyLog(log)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                                                    {copiedId === log.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                </button>
                                            </div>
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                <p className={`${log.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    {log.message}
                                                </p>
                                                {getStatusBadge(log.status === 'success')}
                                            </div>
                                            <p className="text-slate-400 mt-1">
                                                {log.timestamp.toLocaleTimeString()}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
