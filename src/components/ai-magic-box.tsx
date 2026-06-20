'use client';

import { useState } from 'react';

/**
 * AI 解析结果状态
 */
type ParseState = {
  status: 'idle' | 'parsing' | 'success' | 'error' | 'needsClarification';
  result?: any;
  error?: string;
};

/**
 * 执行状态
 */
type ExecuteState = {
  isExecuting: boolean;
  result?: { success: boolean; error?: string; message?: string; results?: any[]; successCount?: number; failureCount?: number };
};

/**
 * AI Magic Box 组件
 * 用户输入自然语言，AI 解析为 DNS 操作
 */
export function AIMagicBox() {
  const [input, setInput] = useState('');
  const [parseState, setParseState] = useState<ParseState>({ status: 'idle' });
  const [executeState, setExecuteState] = useState<ExecuteState>({ isExecuting: false });

  /**
   * 解析用户输入（通过 API Route）
   */
  const handleParse = async () => {
    if (!input.trim()) return;

    setParseState({ status: 'parsing' });

    try {
      const response = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: input }),
      });

      const result = await response.json();

      if (result.success && result.result) {
        setParseState({
          status: 'needsClarification' in result.result ? 'needsClarification' : 'success',
          result: result.result,
        });
      } else {
        setParseState({
          status: 'error',
          error: result.error || '解析失败',
        });
      }
    } catch (error) {
      setParseState({
        status: 'error',
        error: error instanceof Error ? error.message : '解析失败',
      });
    }
  };

  /**
   * 确认并执行操作
   */
  const handleExecute = async () => {
    if (!parseState.result || 'needsClarification' in parseState.result) return;

    setExecuteState({ isExecuting: true });

    try {
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parseState.result),
      });

      const result = await response.json();

      setExecuteState({
        isExecuting: false,
        result: {
          success: result.success,
          error: result.error,
          message: result.message,
          results: result.results,
          successCount: result.successCount,
          failureCount: result.failureCount,
        },
      });

      if (result.success) {
        // 重置状态
        setTimeout(() => {
          setInput('');
          setParseState({ status: 'idle' });
          setExecuteState({ isExecuting: false });
        }, 3000);
      }
    } catch (error) {
      setExecuteState({
        isExecuting: false,
        result: {
          success: false,
          error: error instanceof Error ? error.message : '执行失败',
        },
      });
    }
  };

  /**
   * 重置状态
   */
  const handleReset = () => {
    setInput('');
    setParseState({ status: 'idle' });
    setExecuteState({ isExecuting: false });
  };

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          AI 智能调度中心
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          使用自然语言描述你想要的 DNS 操作，AI 会帮你解析并执行
        </p>
      </div>

      {/* 输入区域 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如：帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录"
          className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
          disabled={parseState.status === 'parsing' || executeState.isExecuting}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            输入自然语言指令，AI 会自动解析
          </p>
          <button
            onClick={handleParse}
            disabled={!input.trim() || parseState.status === 'parsing' || executeState.isExecuting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {parseState.status === 'parsing' ? '解析中...' : '解析指令'}
          </button>
        </div>
      </div>

      {/* 解析结果 */}
      {parseState.status === 'success' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-300 mb-3">
                ✅ AI 解析成功
              </h3>

              {/* 批量操作提示 */}
              {parseState.result.batch && (
                <div className="mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-300">
                    📦 批量操作：共 {parseState.result.instructions?.length || 0} 条记录
                  </p>
                </div>
              )}

              {/* 操作卡片列表 */}
              {parseState.result.batch ? (
                // 批量操作：展示所有记录
                <div className="space-y-3 mb-4">
                  {parseState.result.instructions?.map((instruction: any, idx: number) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          #{idx + 1}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {instruction.action}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">记录类型:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {instruction.type}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">域名:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {instruction.domain}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">记录名称:</span>
                          <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                            {instruction.name}
                          </span>
                        </div>
                        {instruction.content && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">记录值:</span>
                            <span className="ml-2 font-semibold text-gray-900 dark:text-white break-all">
                              {instruction.content}
                            </span>
                          </div>
                        )}
                        {instruction.ttl && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">TTL:</span>
                            <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                              {instruction.ttl}秒
                            </span>
                          </div>
                        )}
                        {instruction.priority !== undefined && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">优先级:</span>
                            <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                              {instruction.priority}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // 单条操作：展示单个卡片
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">操作类型:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {parseState.result.action}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">域名:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {parseState.result.domain}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">记录类型:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {parseState.result.type}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">记录名称:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {parseState.result.name}
                      </span>
                    </div>
                    {parseState.result.content && (
                      <div className="col-span-2">
                        {parseState.result.action === 'UPDATE' && parseState.result.oldContent ? (
                          <div className="space-y-1">
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">旧值:</span>
                              <span className="ml-2 font-semibold text-gray-600 dark:text-gray-400 line-through">
                                {parseState.result.oldContent}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">新值:</span>
                              <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
                                {parseState.result.content}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">记录值:</span>
                            <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                              {parseState.result.content}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {parseState.result.ttl && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">TTL:</span>
                        <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                          {parseState.result.ttl}秒
                        </span>
                      </div>
                    )}
                    {parseState.result.priority !== undefined && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">优先级:</span>
                        <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                          {parseState.result.priority}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 推理说明 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">AI 理解：</span>
                  {parseState.result.batch ? parseState.result.reasoning : parseState.result.reasoning}
                </p>
              </div>

              {/* 执行结果 */}
              {executeState.result && (
                <>
                  <div className={`rounded-lg p-4 mb-4 ${
                    executeState.result.success
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-300'
                  }`}>
                    <p className="text-sm">
                      {executeState.result.success
                        ? `✅ ${executeState.result.message || '操作执行成功！'}`
                        : `❌ ${executeState.result.message || '执行失败'}: ${executeState.result.error}`}
                    </p>
                    {executeState.result.successCount !== undefined && executeState.result.failureCount !== undefined && (
                      <p className="text-sm mt-2">
                        成功 {executeState.result.successCount} 条，失败 {executeState.result.failureCount} 条
                      </p>
                    )}
                  </div>

                  {/* 批量执行详细结果 */}
                  {executeState.result.results && executeState.result.results.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        详细执行结果：
                      </p>
                      <div className="space-y-2">
                        {executeState.result.results.map((result: any, idx: number) => (
                          <div
                            key={idx}
                            className={`rounded-lg p-3 ${
                              result.success
                                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                            }`}
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-sm font-medium">
                                #{result.index} - {result.instruction?.type} {result.instruction?.name}
                              </span>
                              <span className={`text-xs ${result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {result.success ? '✅' : '❌'}
                              </span>
                            </div>
                            {!result.success && result.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {result.error}
                              </p>
                            )}
                            {result.success && result.message && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                {result.message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 操作按钮 */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleExecute}
                  disabled={executeState.isExecuting || (executeState.result?.success === true)}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {executeState.isExecuting ? '执行中...' : '确认执行'}
                </button>
                <button
                  onClick={handleReset}
                  disabled={executeState.isExecuting}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 需要澄清 */}
      {parseState.status === 'needsClarification' && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <div>
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              ⚠️ 需要更多信息
            </h3>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                {parseState.result.message}
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">AI 理解：</span>
                  {parseState.result.reasoning}
                </p>
              </div>
            </div>

            {parseState.result.suggestions && parseState.result.suggestions.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  建议的指令：
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  {parseState.result.suggestions.map((suggestion: string, index: number) => (
                    <li key={index} className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                      onClick={() => setInput(suggestion)}>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              重新输入
            </button>
          </div>
        </div>
      )}

      {/* 错误 */}
      {parseState.status === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">
                ❌ 解析失败
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {parseState.error}
              </p>
            </div>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* 示例提示 */}
      {parseState.status === 'idle' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-3">
            💡 示例指令
          </h3>
          <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setInput('帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录')}>
              • 帮我在 example.com 添加一个指向 1.2.3.4 的 A 记录
            </li>
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setInput('把 example.com 的 www 记录改成 8.8.8.8')}>
              • 把 example.com 的 www 记录改成 8.8.8.8
            </li>
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setInput('删除 example.com 的 TXT 记录')}>
              • 删除 example.com 的 TXT 记录
            </li>
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setInput('给 blog.example.com 添加 CNAME 指向 example.com')}>
              • 给 blog.example.com 添加 CNAME 指向 example.com
            </li>
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setInput('为 example.com 配置邮件服务器，优先级 10，指向 mail.example.com')}>
              • 为 example.com 配置邮件服务器，优先级 10，指向 mail.example.com
            </li>
            <li className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 font-semibold"
                onClick={() => setInput('在 DNS 解析中添加以下记录\nedu TXT verification-code-site-App_feishu=ZMAjGIoKWtDFzIEuuiVP\nedu TXT v=spf1 +include:_netblocks.m.feishu.cn -all\nedu MX mx1.feishu.cn 1\nedu MX mx2.feishu.cn 5\nedu MX mx3.feishu.cn 10')}>
              • 📦 批量添加多条 DNS 记录（飞书验证示例）
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
