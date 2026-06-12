'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/context';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  messageCn: string;
  messageEn: string;
  type: ToastType;
}

const ToastContext = createContext<{
  toast: (cn: string, en: string, type?: ToastType) => void;
  success: (cn: string, en: string) => void;
  error: (cn: string, en: string) => void;
  warning: (cn: string, en: string) => void;
  info: (cn: string, en: string) => void;
}>({
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const { lang, isMounted } = useI18n();

  const toast = (messageCn: string, messageEn: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, messageCn, messageEn, type }]);
    
    // 3.5秒后自动消失
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const success = (cn: string, en: string) => toast(cn, en, 'success');
  const error = (cn: string, en: string) => toast(cn, en, 'error');
  const warning = (cn: string, en: string) => toast(cn, en, 'warning');
  const info = (cn: string, en: string) => toast(cn, en, 'info');

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 水合安全：未挂载时不渲染 toast
  if (!isMounted) {
    return (
      <ToastContext.Provider value={{ toast, success, error, warning, info }}>
        {children}
      </ToastContext.Provider>
    );
  }

  const typeStyles = {
    success: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/90',
      border: 'border-emerald-200 dark:border-emerald-800',
      text: 'text-emerald-800 dark:text-emerald-300',
      icon: '✅',
    },
    error: {
      bg: 'bg-rose-50 dark:bg-rose-950/90',
      border: 'border-rose-200 dark:border-rose-800',
      text: 'text-rose-800 dark:text-rose-300',
      icon: '❌',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/90',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-300',
      icon: '⚠️',
    },
    info: {
      bg: 'bg-sky-50 dark:bg-sky-950/90',
      border: 'border-sky-200 dark:border-sky-800',
      text: 'text-sky-800 dark:text-sky-300',
      icon: 'ℹ️',
    },
  };

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      
      {/* 全局悬浮提示容器，固定在右上方，Z轴置顶 */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const style = typeStyles[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-xl border shadow-lg transition-all duration-300 transform animate-slide-in flex items-center gap-3 text-sm ${style.bg} ${style.border} ${style.text}`}
              role="alert"
            >
              <span className="text-lg">{style.icon}</span>
              <div className="flex-1 font-medium">
                {lang === 'zh' ? t.messageCn : t.messageEn}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);