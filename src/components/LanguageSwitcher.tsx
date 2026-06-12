'use client';

import { useI18n } from '@/lib/i18n/context';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { lang, setLang, isMounted } = useI18n();

  // 水合安全：未挂载时不渲染，避免 SSR/CSR 不一致
  if (!isMounted) {
    return (
      <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 opacity-50">
        <Globe className="w-4 h-4" />
        <span className="text-sm">...</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      title={lang === 'zh' ? '切换到英文' : '切换到中文'}
    >
      <Globe className="w-4 h-4 text-slate-600 dark:text-slate-400" />
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {lang === 'zh' ? '中' : 'EN'}
      </span>
    </button>
  );
}