import { useState } from 'react';

interface ConfirmDangerButtonProps {
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optional warning shown only after the first tap (confirm step). */
  warning?: string;
  disabled?: boolean;
  className?: string;
  onConfirm: () => void | Promise<void>;
}

/** Two-tap confirm for destructive mobile actions (filing remove, etc.). */
export function ConfirmDangerButton({
  label = 'Remove',
  confirmLabel = 'Confirm remove',
  cancelLabel = 'Keep',
  warning,
  disabled = false,
  className = '',
  onConfirm,
}: ConfirmDangerButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (confirming) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {warning ? (
          <p className="text-[11px] leading-snug text-[var(--danger)] font-medium max-w-sm">
            {warning}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setConfirming(false);
                } finally {
                  setBusy(false);
                }
              })();
            }}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-red-700 px-3 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
          >
            {busy ? 'Removing…' : confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted)] cursor-pointer"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setConfirming(true)}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-semibold text-[var(--danger)] cursor-pointer disabled:opacity-60 ${className}`}
    >
      {label}
    </button>
  );
}
