import { ReactNode } from 'react';

// 全局主视口容器，限制最大宽度并提供响应式边距
export function ResponsiveContainer({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}

// 响应式网格：移动端 1 列，平板 2 列，桌面 3 列，布局紧凑统一
export function ResponsiveGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const colClass = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  };
  return (
    <div className={`grid ${colClass[cols]} gap-6`}>
      {children}
    </div>
  );
}

// 移动端横向无缝滚动表格容器：防止撑破视口，支持移动端首列或操作列的自适应
export function ResponsiveTable({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
      <div className="min-w-[640px] align-middle">
        {children}
      </div>
    </div>
  );
}

// 内联确认占位容器：包裹"删除/确认"按钮，防止文字长度变化触发弹性盒模型重绘
// isConfirming: true 时宽度更大（显示确认+取消按钮），false 时宽度较小（只显示删除按钮）
export function InlineActionKeeper({ 
  children, 
  isConfirming,
  width = 'normal'
}: { 
  children: ReactNode; 
  isConfirming: boolean;
  width?: 'small' | 'normal' | 'large';
}) {
  const widthConfig = {
    small: 'w-32 min-w-[128px]',
    normal: 'w-40 min-w-[160px]',
    large: 'w-72 min-w-[288px]',
  };
  
  return (
    <div
      data-confirming={isConfirming}
      className={`relative flex max-w-full items-center justify-end flex-shrink-0 ${widthConfig[width]}`}
    >
      {children}
    </div>
  );
}

// 表格操作列固定宽度容器
export function TableActionCell({ children }: { children: ReactNode }) {
  return (
    <td className="px-4 py-3 w-40 min-w-[160px] flex-shrink-0 text-right">
      <div className="flex items-center justify-end gap-2">
        {children}
      </div>
    </td>
  );
}

// 移动端底部弹出面板：使用动态视口单位防止 Safari 工具栏遮挡
export function MobileBottomPanel({ 
  children, 
  isOpen,
  title,
  onClose
}: { 
  children: ReactNode; 
  isOpen: boolean;
  title?: string;
  onClose?: () => void;
}) {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 面板内容 */}
      <div className="relative bg-white dark:bg-neutral-900 rounded-t-2xl shadow-xl h-dvh max-h-[85dvh] flex flex-col">
        {/* 标题栏 */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h3 className="font-semibold text-neutral-900 dark:text-white">{title}</h3>
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        
        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// 统计卡片容器
export function StatCard({ 
  title, 
  value, 
  icon,
  color = 'blue'
}: { 
  title: string; 
  value: number | string; 
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'cyan';
}) {
  const colorConfig = {
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300',
    purple: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-300',
  };
  
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorConfig[color]}`}>
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{title}</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

// 加载状态骨架屏
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse flex space-x-4">
          <div className="h-4 w-4 bg-neutral-200 dark:bg-neutral-700 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-3/4" />
            <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// 空状态提示
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
        <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="text-neutral-500 dark:text-neutral-400">{message}</p>
    </div>
  );
}
