import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { FOCUS_RING } from './formStyles.ts';

type DrawerShellProps = {
  titleId: string;
  eyebrow: ReactNode;
  title: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Shared right-side drawer chrome (backdrop + aside + header + footer slot).
 * Body content stays with each domain drawer.
 */
export function DrawerShell({
  titleId,
  eyebrow,
  title,
  onClose,
  closeDisabled = false,
  children,
  footer,
}: DrawerShellProps) {
  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-[var(--navy-900)]/35 cursor-pointer"
        onClick={() => {
          if (!closeDisabled) onClose();
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--card)] shadow-card flex flex-col animate-in"
      >
        <header className="px-5 py-4 border-b border-[var(--line)] bg-[var(--frost-100)] flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {eyebrow}
            </p>
            <h2
              id={titleId}
              className="font-display text-lg font-bold text-[var(--ink)] mt-0.5"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className={`p-2 rounded-xl text-[var(--muted)] hover:bg-[var(--frost-100)] hover:text-[var(--ink)] cursor-pointer ${FOCUS_RING}`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {children}

        <footer className="px-5 py-4 border-t border-[var(--line)] bg-[var(--frost-100)] flex items-center justify-end gap-2">
          {footer}
        </footer>
      </aside>
    </div>
  );
}
