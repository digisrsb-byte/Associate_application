import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type LimeSelectOption = string | { value: string; label: string };

interface LimeSelectProps {
  value: string;
  options: readonly LimeSelectOption[] | LimeSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

function normalizeOptions(
  options: readonly LimeSelectOption[] | LimeSelectOption[]
): { value: string; label: string }[] {
  return options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
}

export function LimeSelect({
  value,
  options,
  onChange,
  ariaLabel = 'Select option',
  className = '',
  buttonClassName = '',
  disabled = false,
}: LimeSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const normalized = normalizeOptions(options);
  const selectedLabel =
    normalized.find((o) => o.value === value)?.label || value || '—';

  const updateMenuPos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(224, Math.max(120, preferBelow ? spaceBelow : spaceAbove));
    const top = preferBelow
      ? rect.bottom + gap
      : Math.max(8, rect.top - gap - maxHeight);
    setMenuPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 160),
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onReposition = () => updateMenuPos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            className="fixed z-[200] rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-card overflow-hidden"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div
              className="overflow-y-auto py-1.5 px-1.5"
              style={{ maxHeight: menuPos.maxHeight }}
            >
              {normalized.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold cursor-pointer ${focusRing} ${
                      selected
                        ? 'bg-[var(--navy-900)] text-white'
                        : 'text-[var(--ink)] hover:bg-[var(--frost-100)]'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={`w-full inline-flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--navy-900)] rounded-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${focusRing} ${buttonClassName}`}
      >
        <span className="truncate text-left">{selectedLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--ink)]" />
      </button>
      {menu}
    </div>
  );
}
