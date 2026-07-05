'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Download, Upload } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { t, isMounted, lang } = useI18n();

  // 导航项使用 i18n
  const navigation = [
    { nameKey: 'common.aiMagic', href: '/ai-magic' },
    { nameKey: 'common.providers', href: '/providers' },
    { nameKey: 'common.domains', href: '/domains' },
    { nameKey: 'aiConfig.title', href: '/ai-config' },
  ];

  const handleExport = async () => {
    try {
      const response = await fetch('/api/config');
      const result = await response.json();
      if (result.success) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dns-hub-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(lang === 'zh' ? '配置导出成功！' : 'Config exported successfully!');
      }
    } catch (error) {
      alert(lang === 'zh' ? '导出失败' : 'Export failed');
    }
  };

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center gap-2">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span className="text-xl font-bold text-gray-900 dark:text-white">
                  Universal DNS Hub
                </span>
              </Link>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  // 水合安全：未挂载时显示占位符
                  const name = isMounted ? t(item.nameKey) : item.nameKey;
                  return (
                    <Link
                      key={item.nameKey}
                      href={item.href}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                    >
                      {name}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
          {/* 右侧功能区 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title={lang === 'zh' ? '导出配置' : 'Export Config'}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'zh' ? '导出' : 'Export'}</span>
            </button>
            <Link
              href="/config"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title={lang === 'zh' ? '导入配置' : 'Import Config'}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'zh' ? '导入' : 'Import'}</span>
            </Link>
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
}