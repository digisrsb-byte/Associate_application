import { Check, X } from 'lucide-react';

export type ToastMessage = {
  type: 'success' | 'error';
  message: string;
} | null;

interface ToastBannerProps {
  toast: ToastMessage;
  onClose: () => void;
}

export function ToastBanner({ toast, onClose }: ToastBannerProps) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed top-4 right-4 z-[80] max-w-sm w-[min(100%-2rem,24rem)]">
      <div
        role="status"
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-card ${
          isSuccess
            ? 'bg-[var(--card)] border-[var(--success)] text-[var(--success)]'
            : 'bg-[var(--card)] border-[var(--danger)] text-[var(--danger)]'
        }`}
      >
        <span
          className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ${
            isSuccess ? 'bg-[var(--success-15)]' : 'bg-[var(--danger-15)]'
          }`}
        >
          {isSuccess ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        </span>
        <p className="flex-1 text-xs font-semibold text-[var(--ink)] pt-0.5">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-[var(--muted)] hover:text-[var(--ink)] rounded-lg cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
