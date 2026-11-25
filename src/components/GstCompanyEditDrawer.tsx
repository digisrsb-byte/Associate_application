import { useEffect, useId, useMemo, useState } from 'react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstClientTotals,
  computeGstFilingOutstanding,
  computeGstFilingReceived,
  formatPlainNumber,
  getGstFilingCollectibleTotal,
  sortGstMonths,
} from '../utils/ledgerUtils.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
} from '../utils/gstCopy.ts';
import { FIELD_LIMITS, validateRequiredPhone } from '../utils/fieldValidation.ts';
import { DrawerShell } from './shared/DrawerShell.tsx';
import { LabeledField } from './shared/LabeledField.tsx';
import { PasswordField } from './shared/PasswordField.tsx';
import {
  DRAWER_MONO_INPUT_CLASS,
  DRAWER_TEXT_INPUT_CLASS,
  DRAWER_TEXTAREA_CLASS,
  FOCUS_RING,
} from './shared/formStyles.ts';

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
  }) => Promise<void>;
  onEditFiling?: (company: GstClientRecord, month: string, filing: GstMonthlyFiling) => void;
}

export function GstCompanyEditDrawer({
  company,
  mode,
  onClose,
  onSave,
  onEditFiling,
}: GstCompanyEditDrawerProps) {
  const uid = useId();
  const open = Boolean(company && mode);
  const [companyName, setCompanyName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');
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
    const phoneCheck = validateRequiredPhone(phone);
    if (!phoneCheck.ok) {
      setError(phoneCheck.error);
      return;
    }
    const cleanRef = referenceNumber.trim();
    if (!cleanRef) {
      setError('Ref No is required.');
      return;
    }
    const cleanRemark = remark.trim();
    if (!cleanRemark) {
      setError('Remark is required.');
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
        phone: phoneCheck.value,
        referenceNumber: cleanRef.slice(0, FIELD_LIMITS.referenceNumber),
        remark: cleanRemark.slice(0, FIELD_LIMITS.remark),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const footer =
    mode === 'edit' ? (
      <>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className={`px-4 py-2 text-xs font-semibold text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${FOCUS_RING}`}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="gst-company-edit-form"
          disabled={saving}
          className={`px-4 py-2 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60 ${FOCUS_RING}`}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={onClose}
        className={`px-4 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${FOCUS_RING}`}
      >
        Close
      </button>
    );

  return (
    <DrawerShell
      titleId="gst-company-drawer-title"
      eyebrow={mode === 'edit' ? 'Edit company' : 'Filing history'}
      title={company.companyName}
      onClose={onClose}
      closeDisabled={saving}
      footer={footer}
    >
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
            <LabeledField
              id={`${uid}-company-name`}
              label="Company Name *"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              inputClassName={DRAWER_TEXT_INPUT_CLASS}
              required
            />
            <LabeledField
              id={`${uid}-user-id`}
              label="User ID *"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              inputClassName={DRAWER_MONO_INPUT_CLASS}
              required
            />
            <PasswordField
              id={`${uid}-password`}
              variant="drawer"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              keepStoredHint={!!company.hasPortalPassword}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
              Contact & notes
            </h3>
            <LabeledField
              id={`${uid}-phone`}
              label="Phone *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile Number"
              inputClassName={DRAWER_MONO_INPUT_CLASS}
              required
            />
            <LabeledField
              id={`${uid}-ref`}
              label="Ref No *"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              inputClassName={DRAWER_MONO_INPUT_CLASS}
              required
            />
            <LabeledField
              as="textarea"
              id={`${uid}-remark`}
              label="Remark *"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              inputClassName={DRAWER_TEXTAREA_CLASS}
              required
            />
            {totals && (
              <div className="rounded-xl bg-[var(--frost-100)] border border-[var(--line)] px-3.5 py-3 text-xs text-[var(--muted)] space-y-1">
                <p>
                  Total Recd:{' '}
                  <span className="font-mono font-semibold text-[var(--success)]">
                    ₹{formatPlainNumber(totals.totalReceived)}
                  </span>
                </p>
                {totals.unallocatedReceived > 0 && (
                  <p className="text-[var(--ink)]">
                    {GST_UNALLOCATED_LABEL}:{' '}
                    <span className="font-mono font-semibold">
                      ₹{formatPlainNumber(totals.unallocatedReceived)}
                    </span>
                    <span className="block text-[10px] text-[var(--muted)] mt-0.5">
                      Not assigned to any month. Month Received shows only
                      allocated payments.
                    </span>
                  </p>
                )}
                {totals.allocatedReceived > 0 && (
                  <p>
                    Allocated to months:{' '}
                    <span className="font-mono font-semibold text-[var(--ink)]">
                      ₹{formatPlainNumber(totals.allocatedReceived)}
                    </span>
                  </p>
                )}
                <p>
                  Outstanding:{' '}
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    ₹{formatPlainNumber(totals.outstandingTotal)}
                  </span>
                </p>
                {totals.unallocatedReceived > 0 && (
                  <p className="text-[10px] text-[var(--muted)]">
                    {GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                  </p>
                )}
                <p className="text-[10px]">
                  Summary totals are calculated from monthly filings and payments.
                </p>
              </div>
            )}
          </section>

          {error && (
            <p className="text-xs font-semibold text-[var(--danger)] bg-[var(--danger-15)] border border-[var(--danger)] rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="rounded-2xl bg-[var(--frost-100)] border border-[var(--line)] px-3.5 py-3 text-xs text-[var(--muted)] space-y-1">
            <p>
              {historyMonths.length} monthly{' '}
              {historyMonths.length === 1 ? 'filing' : 'filings'} · Total billed ₹
              {formatPlainNumber(totals?.totalBilled || 0)} · Recd ₹
              {formatPlainNumber(totals?.totalReceived || 0)} · Outstanding ₹
              {formatPlainNumber(totals?.outstandingTotal || 0)}
            </p>
            {(totals?.unallocatedReceived || 0) > 0 && (
              <p className="text-[var(--ink)] font-medium space-y-0.5">
                <span className="block">
                  {GST_UNALLOCATED_LABEL} ₹
                  {formatPlainNumber(totals!.unallocatedReceived)} (not assigned
                  to a month)
                </span>
                <span className="block text-[10px] font-normal text-[var(--muted)]">
                  {GST_OUTSTANDING_UNALLOCATED_EXPLAIN}
                </span>
              </p>
            )}
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
                const monthTotal = getGstFilingCollectibleTotal(filing);
                const monthRecd = computeGstFilingReceived(filing);
                const monthOut = computeGstFilingOutstanding(filing);
                const payCount = Array.isArray(filing.payments)
                  ? filing.payments.length
                  : 0;
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
                        ₹{formatPlainNumber(monthTotal)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                      <span>Fees ₹{formatPlainNumber(filing.fees)}</span>
                      <span>Interest ₹{formatPlainNumber(filing.interest)}</span>
                      <span>Tax ₹{formatPlainNumber(filing.tax)}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                      <span className="text-[var(--success)]">
                        Recd ₹{formatPlainNumber(monthRecd)}
                      </span>
                      <span className="text-[var(--blue-500)]">
                        Outstanding ₹{formatPlainNumber(monthOut)}
                      </span>
                      <span className="text-[var(--muted)]">
                        {payCount} payment{payCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {onEditFiling && (
                      <button
                        type="button"
                        onClick={() => onEditFiling(company, month, filing)}
                        className={`mt-2 text-[11px] font-semibold text-[var(--blue-500)] hover:underline cursor-pointer ${FOCUS_RING}`}
                      >
                        Edit month / record payment
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </DrawerShell>
  );
}
