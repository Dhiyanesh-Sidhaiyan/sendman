import { useEffect } from 'react';

export interface ToastProps {
  kind: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Toast({ kind, message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [onClose, duration]);

  const styles = {
    success: 'bg-green-500/20 border-green-500/60 text-green-400',
    error: 'bg-red-500/20 border-red-500/60 text-red-400',
    warning: 'bg-yellow-500/20 border-yellow-500/60 text-yellow-400',
    info: 'bg-blue-500/20 border-blue-500/60 text-blue-400',
  };

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ⓘ',
  };

  return (
    <div
      onClick={onClose}
      className={`fixed top-20 right-6 z-[9999] px-4 py-3 rounded-lg text-sm border-2 shadow-2xl cursor-pointer hover:opacity-80 transition-all animate-slide-in flex items-center gap-2 max-w-md ${styles[kind]}`}
    >
      <span className="text-lg font-bold">{icons[kind]}</span>
      <span className="flex-1">{message}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="text-xs opacity-60 hover:opacity-100 px-1"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: {
  toasts: Array<{ id: string } & ToastProps>;
  onDismiss: (id: string) => void;
}) {
  return (
    <>
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ top: `${20 + index * 80}px` }} className="fixed right-6">
          <Toast {...toast} onClose={() => onDismiss(toast.id)} />
        </div>
      ))}
    </>
  );
}
