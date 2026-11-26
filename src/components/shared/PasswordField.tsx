import { Eye, EyeOff } from 'lucide-react';
import type { ChangeEvent, ReactNode } from 'react';
import { FIELD_LABEL_CLASS, FOCUS_RING } from './formStyles.ts';

export type PasswordFieldVariant = 'drawer' | 'modal';

type PasswordFieldProps = {
  id: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  /** When true, show “leave blank to keep stored” hint and relax required. */
  keepStoredHint: boolean;
  required?: boolean;
  placeholder?: string;
  /** `drawer` keeps focus-ring / pr-10 / title; `modal` keeps pr-9 / danger asterisk. */
  variant?: PasswordFieldVariant;
  labelPrefix?: ReactNode;
};

const DRAWER_INPUT = `w-full px-3 py-2 pr-10 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${FOCUS_RING}`;
const MODAL_INPUT =
  'w-full px-3 py-2 pr-9 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';
const DRAWER_TOGGLE = `absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer ${FOCUS_RING}`;
const MODAL_TOGGLE =
  'absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer';

/**
 * Shared portal-password field with show/hide control.
 * Variant prop preserves existing drawer vs modal class differences.
 */
export function PasswordField({
  id,
  value,
  onChange,
  showPassword,
  onToggleShow,
  keepStoredHint,
  required,
  placeholder,
  variant = 'modal',
  labelPrefix = 'Password',
}: PasswordFieldProps) {
  const isDrawer = variant === 'drawer';
  const resolvedRequired = required ?? !keepStoredHint;
  const resolvedPlaceholder =
    placeholder ??
    (keepStoredHint ? 'Leave blank to keep stored password' : 'Password');

  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {labelPrefix}{' '}
        {keepStoredHint ? (
          <span className="text-[var(--muted)] font-normal">
            (leave blank to keep stored)
          </span>
        ) : isDrawer ? (
          '*'
        ) : (
          <span className="text-[var(--danger)]">*</span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={resolvedPlaceholder}
          autoComplete="new-password"
          required={resolvedRequired}
          className={isDrawer ? DRAWER_INPUT : MODAL_INPUT}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          className={isDrawer ? DRAWER_TOGGLE : MODAL_TOGGLE}
          title={isDrawer ? (showPassword ? 'Hide password' : 'Show password') : undefined}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
