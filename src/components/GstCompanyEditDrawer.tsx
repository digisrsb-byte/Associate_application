import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstClientTotals,
  formatPlainNumber,
  sortGstMonths,
} from '../utils/ledgerUtils.ts';

export type GstDrawerMode = 'edit' | 'history';

interface GstCompanyEditDrawerProps {
  company: GstClientRecord | null;
  mode: GstDrawerMode | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    companyName: string;
    userId: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    totalReceived: number;
  }) => Promise<void>;
  onEditFiling?: (company: GstClientRecord, month: string, filing: GstMonthlyFiling) => void;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

export function GstCompanyEditDrawer({
  company,
  mode,
  onClose,
  onSave,
  onEditFiling,
}: GstCompanyEditDrawerProps) {
  const open = Boolean(company && mode);
  const [companyName, setCompanyName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');
  const [totalReceived, setTotalReceived] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company || !mode) return;
    setError(null);
    setShowPassword(false);
    setCompanyName(company.companyName);
    setUserId(company.userId);
    setPassword('');
    setPhone(company.phone || '');
    setReferenceNumber(company.referenceNumber || '');
    setRemark(company.remark || '');
    setTotalReceived(String(company.totalReceived ?? 0));
  }, [company, mode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const historyMonths = useMemo(() => {
    if (!company) return [];
    return sortGstMonths(Object.keys(company.filings || {}));
  }, [company]);

  const totals = useMemo(
    () => (company ? computeGstClientTotals(company) : null),
    [company]
  );

  if (!open || !company || !mode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCompany = companyName.trim();
    const cleanUserId = userId.trim();
    const cleanPassword = password.trim();
    const keepExisting = !!company.hasPortalPassword && !cleanPassword;
    if (!cleanCompany || !cleanUserId || (!cleanPassword && !keepExisting)) {
      setError(
        company.hasPortalPassword
          ? 'Company Name and User ID are mandatory. Leave password blank to keep the stored portal password.'
          : 'Company Name, User ID, and Password are mandatory.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: company.id,
        companyName: cleanCompany,
        userId: cleanUserId,
        password: cleanPassword,
        phone: phone.trim(),
        referenceNumber: referenceNumber.trim(),
        remark: remark.trim(),
        totalReceived: Math.max(0, Number(totalReceived) || 0),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-[var(--navy-900)]/35 cursor-pointer"
        onClick={() => {
          if (!saving) onClose();
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="gst-company-drawer-title"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--card)] shadow-card flex flex-col animate-in"
      >
        <header className="px-5 py-4 border-b border-[var(--line)] bg-[var(--frost-100)] flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {mode === 'edit' ? 'Edit company' : 'Filing history'}
            </p>
            <h2
              id="gst-company-drawer-title"
              className="font-display text-lg font-bold text-[var(--ink)] mt-0.5"
            >
              {company.companyName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`p-2 rounded-xl text-[var(--muted)] hover:bg-[var(--frost-100)] hover:text-[var(--ink)] cursor-pointer ${focusRing}`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {mode === 'edit' ? (
          <form
            id="gst-company-edit-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
          >
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                Account details
              </h3>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={`w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Password{' '}
                  {company.hasPortalPassword ? (
                    <span className="text-[var(--muted)] font-normal">
                      (leave blank to keep stored)
                    </span>
                  ) : (
                    '*'
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      company.hasPortalPassword
                        ? 'Leave blank to keep stored password'
                        : 'Password'
                    }
                    autoComplete="new-password"
                    className={`w-full px-3 py-2 pr-10 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                    required={!company.hasPortalPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer ${focusRing}`}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                Contact & notes
              </h3>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Mobile Number"
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">Remark</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] resize-y ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Total Received (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  value={totalReceived}
                  onChange={(e) => setTotalReceived(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                />
                {totals && (
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    Outstanding:{' '}
                    <span className="font-mono font-semibold text-[var(--ink)]">
                      ₹{formatPlainNumber(Math.max(0, totals.totalBilled - Math.max(0, Number(totalReceived) || 0)))}
                    </span>
                  </p>
                )}
              </div>
            </section>

            {error && (
              <p className="text-xs font-semibold text-[var(--danger)] bg-[var(--danger-15)] border border-[var(--danger)] rounded-xl px-3 py-2">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div className="rounded-2xl bg-[var(--frost-100)] border border-[var(--line)] px-3.5 py-3 text-xs text-[var(--muted)]">
              {historyMonths.length} monthly{' '}
              {historyMonths.length === 1 ? 'filing' : 'filings'} · Total billed ₹
              {formatPlainNumber(totals?.totalBilled || 0)}
            </div>

            {historyMonths.length === 0 ? (
              <p className="text-sm text-[var(--muted)] py-8 text-center">
                No monthly filings recorded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {historyMonths.map((month) => {
                  const filing = company.filings[month];
                  if (!filing) return null;
                  return (
                    <li
                      key={month}
                      className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-3.5 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--ink)]">
                          {month}
                        </span>
                        <span className="font-mono text-sm font-semibold text-[var(--ink)]">
                          ₹{formatPlainNumber(filing.total)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                        <span>Fees ₹{formatPlainNumber(filing.fees)}</span>
                        <span>Interest ₹{formatPlainNumber(filing.interest)}</span>
                        <span>Tax ₹{formatPlainNumber(filing.tax)}</span>
                      </div>
                      {onEditFiling && (
                        <button
                          type="button"
                          onClick={() => onEditFiling(company, month, filing)}
                          className={`mt-2 text-[11px] font-semibold text-[var(--blue-500)] hover:underline cursor-pointer ${focusRing}`}
                        >
                          Edit month entry
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <footer className="px-5 py-4 border-t border-[var(--line)] bg-[var(--frost-100)] flex items-center justify-end gap-2">
          {mode === 'edit' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={`px-4 py-2 text-xs font-semibold text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="gst-company-edit-form"
                disabled={saving}
                className={`px-4 py-2 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60 ${focusRing}`}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
            >
              Close
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
