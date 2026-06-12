'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language } from './translations';

const I18nContext = createContext<{
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isMounted: boolean;
}>({
  lang: 'zh',
  setLang: () => {},
  t: () => '',
  isMounted: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('zh');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // 客户端挂载后读取本地存储
    const savedLang = localStorage.getItem('lang') as Language;
    if (savedLang === 'zh' || savedLang === 'en') {
      setLang(savedLang);
    }
    setIsMounted(true);
  }, []);

  const changeLang = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('lang', newLang);
  };

  // 支持参数替换，如 t('records.syncSuccess', { synced: 5, total: 10 })
  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: any = translations[lang];
    for (const k of keys) {
      value = value?.[k];
    }
    
    if (!value) return key;
    
    // 替换参数
    if (params && typeof value === 'string') {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }
    
    return value;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t, isMounted }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);