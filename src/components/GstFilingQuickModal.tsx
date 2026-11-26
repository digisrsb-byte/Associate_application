import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type {
  GstClientRecord,
  GstMonthlyFiling,
  GstPaymentEntry,
} from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import {
  computeGstFilingReceived,
  computeGstFilingTotal,
  formatPlainNumber,
  gstFilingHasOverReceipt,
} from '../utils/ledgerUtils.ts';
import { isValidPaymentCalendarDate } from '../utils/fieldValidation.ts';
import {
  GST_OUTSTANDING_UNALLOCATED_EXPLAIN,
  GST_UNALLOCATED_LABEL,
  gstFilingDeleteWarning,
  gstPaymentDeleteWarning,
} from '../utils/gstCopy.ts';
import { ConfirmDangerButton } from './mobile/ConfirmDangerButton.tsx';
import { LimeSelect } from './LimeSelect.tsx';

interface GstFilingQuickModalProps {
  target: {
    company: GstClientRecord;
    month: string;
    existing?: GstMonthlyFiling;
    /** Mobile Pay opens payment section; Edit Charges focuses fees. */
    focus?: 'charges' | 'payment';
  } | null;
  onClose: () => void;
  onSave: (companyId: string, filing: GstMonthlyFiling) => Promise<void>;
  onDelete: (companyId: string, month: string) => Promise<void>;
  onRecordPayment?: (
    companyId: string,
    month: string,
    payment: {
      amount: number;
      paymentDate: string;
      paymentMode: string;
      reference?: string;
      idempotencyKey?: string;
    }
  ) => Promise<void>;
  onUpdatePayment?: (
    companyId: string,
    month: string,
    paymentId: string,
    payment: {
      amount: number;
      paymentDate: string;
      paymentMode: string;
      reference?: string;
    }
  ) => Promise<void>;
  onDeletePayment?: (
    companyId: string,
    month: string,
    paymentId: string
  ) => Promise<void>;
}

const fieldClass =
  'w-full min-h-11 px-3 py-2.5 text-sm sm:text-xs sm:min-h-0 sm:py-2 font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';

const readOnlyBox =
  'min-h-11 sm:min-h-0 px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-mono font-semibold rounded-xl border tabular-nums flex items-center';

const sectionTitle =
  'text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]';

export function GstFilingQuickModal({
  target,
  onClose,
  onSave,
  onDelete,
  onRecordPayment,
  onUpdatePayment,
  onDeletePayment,
}: GstFilingQuickModalProps) {
  const uid = useId();
  const feesInputRef = useRef<HTMLInputElement>(null);
  const payAmountInputRef = useRef<HTMLInputElement>(null);
  const paymentSectionRef = useRef<HTMLElement>(null);
  const [fees, setFees] = useState('');
  const [interest, setInterest] = useState('');
  const [tax, setTax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payMode, setPayMode] = useState<string>('GPay');
  const [payRef, setPayRef] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  /** Stable per create-submit attempt so retries do not duplicate. */
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<
    string | null
  >(null);
  /** Tracks month identity so we only reset payment UI when switching months. */
  const monthKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    const f = target.existing;
    if (f) {
      setFees(String(f.fees ?? 0));
      setInterest(String(f.interest ?? 0));
      setTax(String(f.tax ?? 0));
    } else {
      setFees('');
      setInterest('');
      setTax('');
    }
    setPayAmount('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMode('GPay');
    setPayRef('');
    setEditingPaymentId(null);
    createIdempotencyKeyRef.current = null;
  }, [
    target?.company.id,
    target?.month,
    target?.existing?.fees,
    target?.existing?.interest,
    target?.existing?.tax,
  ]);

  useEffect(() => {
    if (!target) return;
    const key = `${target.company.id}::${target.month}`;
    if (monthKeyRef.current !== key) {
      monthKeyRef.current = key;
      setConfirmDeletePaymentId(null);
      setSuccess(null);
    }
  }, [target?.company.id, target?.month]);

  useEffect(() => {
    if (!target) return;
    const focusPayment = target.focus === 'payment';
    const frame = window.requestAnimationFrame(() => {
      if (focusPayment) {
        paymentSectionRef.current?.scrollIntoView({
          block: 'start',
          behavior: 'smooth',
        });
        payAmountInputRef.current?.focus({ preventScroll: true });
      } else {
        feesInputRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [target?.company.id, target?.month, target?.focus]);

  const liveFiling = target?.existing;
  const payments: GstPaymentEntry[] = useMemo(
    () => (Array.isArray(liveFiling?.payments) ? liveFiling!.payments! : []),
    [liveFiling?.payments]
  );

  const received = liveFiling ? computeGstFilingReceived(liveFiling) : 0;
  const companyUnallocated = Math.max(
    0,
    Number(target?.company.unallocatedReceived) || 0
  );

  if (!target) return null;

  const numFees = Math.max(0, Number(fees) || 0);
  const numInterest = Math.max(0, Number(interest) || 0);
  const numTax = Math.max(0, Number(tax) || 0);
  const total = computeGstFilingTotal(numFees, numInterest, numTax);
  // Preview Outstanding from draft Total vs payment-sum Received (IT-like live feel).
  const outstanding = Math.max(0, total - received);
  const overReceipt = liveFiling
    ? gstFilingHasOverReceipt({ ...liveFiling, total }) ||
      received - total > 0.009
    : received - total > 0.009;
  const filingExists = Boolean(liveFiling);
  const canManagePayments = filingExists && Boolean(onRecordPayment);
  /** Pay action opens a payment-first layout; Edit Charges keeps charges first. */
  const quickPayMode = target.focus === 'payment';

  const handleSaveFiling = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const wasNew = !liveFiling;
    try {
      await onSave(target.company.id, {
        month: target.month,
        fees: numFees,
        interest: numInterest,
        tax: numTax,
        total,
      });
      // Keep modal open so a new month can receive its first payment without reopen.
      setSuccess(
        wasNew
          ? 'Filing saved. You can record a payment below.'
          : 'Filing saved.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(target.company.id, target.month);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const startEditPayment = (p: GstPaymentEntry) => {
    setEditingPaymentId(p.id);
    setPayAmount(String(p.amount));
    setPayDate(p.paymentDate || '');
    setPayMode(p.paymentMode || 'GPay');
    setPayRef(p.reference || '');
    setError(null);
    setSuccess(null);
    setConfirmDeletePaymentId(null);
  };

  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setPayAmount('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMode('GPay');
    setPayRef('');
    createIdempotencyKeyRef.current = null;
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!liveFiling || !onRecordPayment) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be a positive number.');
      return;
    }
    if (!isValidPaymentCalendarDate(payDate)) {
      setError('Payment date must be a valid calendar date (YYYY-MM-DD).');
      return;
    }
    if (!payMode.trim()) {
      setError('Payment mode is required.');
      return;
    }
    if (!(PAYMENT_TYPES as readonly string[]).includes(payMode.trim())) {
      setError('Unsupported payment mode.');
      return;
    }
    // Match server rule: new payments cannot exceed remaining outstanding.
    if (!editingPaymentId && amount - outstanding > 0.009) {
      setError(
        `Payment amount exceeds remaining outstanding (₹${formatPlainNumber(outstanding)}).`
      );
      return;
    }
    if (editingPaymentId && onUpdatePayment) {
      const otherReceived = payments
        .filter((p) => p.id !== editingPaymentId)
        .reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
      const remainingForEdit = Math.max(0, total - otherReceived);
      if (amount - remainingForEdit > 0.009) {
        setError(
          `Payment amount exceeds remaining outstanding (₹${formatPlainNumber(remainingForEdit)}).`
        );
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        amount,
        paymentDate: payDate.trim(),
        paymentMode: payMode.trim(),
        ...(payRef.trim() ? { reference: payRef.trim() } : {}),
      };
      if (editingPaymentId && onUpdatePayment) {
        await onUpdatePayment(
          target.company.id,
          target.month,
          editingPaymentId,
          payload
        );
        resetPaymentForm();
        setSuccess('Payment updated.');
      } else {
        if (!createIdempotencyKeyRef.current) {
          createIdempotencyKeyRef.current =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }
        await onRecordPayment(target.company.id, target.month, {
          ...payload,
          idempotencyKey: createIdempotencyKeyRef.current,
        });
        resetPaymentForm();
        setSuccess('Payment recorded.');
        window.requestAnimationFrame(() => {
          payAmountInputRef.current?.focus({ preventScroll: true });
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!onDeletePayment) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await onDeletePayment(target.company.id, target.month, paymentId);
      setConfirmDeletePaymentId(null);
      if (editingPaymentId === paymentId) {
        resetPaymentForm();
      }
      setSuccess('Payment removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete payment.');
    } finally {
      setSaving(false);
    }
  };

  const paymentModes =
    payMode && !(PAYMENT_TYPES as readonly string[]).includes(payMode)
      ? [...PAYMENT_TYPES, payMode]
      : [...PAYMENT_TYPES];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gst-quick-filing-title"
    >
      <div className="bg-[var(--card)] border border-[var(--line)] sm:rounded-2xl rounded-t-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[min(92dvh,100%)] sm:max-h-[90vh] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="px-5 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-2">
            <h2
              id="gst-quick-filing-title"
              className="font-display text-base font-semibold truncate"
            >
              {quickPayMode
                ? `Record payment · ${target.month}`
                : `${target.month} · ${target.company.companyName}`}
            </h2>
            <p className="text-xs font-mono text-[var(--sidebar-text)] mt-0.5 truncate">
              {quickPayMode
                ? target.company.companyName
                : `User ID: ${target.company.userId}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-white/75 hover:text-white rounded-lg cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-5 overflow-y-auto flex-1 overscroll-contain flex flex-col gap-5">
            {error && (
              <div className="px-3 py-2 text-xs text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg order-first">
                {error}
              </div>
            )}
            {success && (
              <div className="px-3 py-2 text-xs text-[var(--success)] bg-[var(--success-15)] border border-[var(--success)] rounded-lg order-first">
                {success}
              </div>
            )}

            {/* Section 1 — Filing Charges (after payment when opened via Pay) */}
            <section
              className={`space-y-3 ${quickPayMode ? 'order-3' : 'order-1'}`}
              aria-labelledby={`${uid}-charges-heading`}
            >
              <h3 id={`${uid}-charges-heading`} className={sectionTitle}>
                Filing Charges
              </h3>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                Edit Fees, Interest and Tax here. Total updates live. Use{' '}
                <span className="font-semibold text-[var(--ink)]">Save Filing</span>{' '}
                for charges only — it never records a payment.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor={`${uid}-gst-fees`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Fees (₹)
                  </label>
                  <input
                    id={`${uid}-gst-fees`}
                    ref={feesInputRef}
                    type="number"
                    min={0}
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    placeholder="0"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-gst-interest`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Interest (₹)
                  </label>
                  <input
                    id={`${uid}-gst-interest`}
                    type="number"
                    min={0}
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    placeholder="0"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-gst-tax`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Tax (₹)
                  </label>
                  <input
                    id={`${uid}-gst-tax`}
                    type="number"
                    min={0}
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    placeholder="0"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-[var(--frost-100)] border border-[var(--line)]">
                <span className="text-xs font-semibold text-[var(--ink)]">
                  Total (Fees + Interest + Tax)
                </span>
                <span
                  className="font-mono text-sm font-bold text-[var(--ink)] tabular-nums"
                  aria-live="polite"
                >
                  ₹{formatPlainNumber(total)}
                </span>
              </div>
            </section>

            {/* Section 2 — Payment Details (first when opened via Pay) */}
            <section
              ref={paymentSectionRef}
              className={`space-y-3 ${quickPayMode ? 'order-1' : 'order-2'}`}
              aria-labelledby={`${uid}-payment-details-heading`}
            >
              <h3 id={`${uid}-payment-details-heading`} className={sectionTitle}>
                Payment Details
              </h3>
              {quickPayMode ? (
                <p className="text-[11px] text-[var(--muted)] leading-relaxed -mt-1">
                  Type the amount received below. Received and Outstanding refresh
                  after you save.
                </p>
              ) : null}

              {quickPayMode ? (
                <div
                  className={`rounded-2xl border px-4 py-3.5 ${
                    outstanding > 0
                      ? 'border-[var(--navy-900)]/20 bg-[var(--frost-100)]'
                      : 'border-[var(--success)]/40 bg-[var(--success-15)]'
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Outstanding now
                  </p>
                  <p
                    className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                      outstanding > 0
                        ? 'text-[var(--navy-900)]'
                        : 'text-[var(--success)]'
                    }`}
                    aria-live="polite"
                    data-testid="gst-month-outstanding"
                  >
                    ₹{formatPlainNumber(outstanding)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Total ₹{formatPlainNumber(total)} − Received ₹
                    {formatPlainNumber(received)} (minimum zero). Received is
                    the sum of saved payments — not typed here.
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="block text-xs font-medium text-[var(--ink)] mb-1">
                    Total Received (₹)
                  </p>
                  <div
                    className={`${readOnlyBox} bg-[var(--frost-100)] border-[var(--line)] text-[var(--success)]`}
                    aria-live="polite"
                    data-testid="gst-month-received"
                  >
                    ₹{formatPlainNumber(received)}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Sum of saved payments for this month (read-only).
                  </p>
                </div>
                {!quickPayMode ? (
                  <div>
                    <p className="block text-xs font-medium text-[var(--ink)] mb-1">
                      Outstanding (₹)
                    </p>
                    <div
                      className={`${readOnlyBox} ${
                        outstanding > 0
                          ? 'bg-[var(--frost-100)] border-[var(--line)] text-[var(--blue-500)]'
                          : 'bg-[var(--success-15)] border-[var(--success)] text-[var(--success)]'
                      }`}
                      aria-live="polite"
                      data-testid="gst-month-outstanding"
                    >
                      ₹{formatPlainNumber(outstanding)}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Total − Received for this month (minimum zero).
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="block text-xs font-medium text-[var(--ink)] mb-1">
                      Month total (₹)
                    </p>
                    <div
                      className={`${readOnlyBox} bg-[var(--frost-100)] border-[var(--line)] text-[var(--ink)]`}
                      aria-live="polite"
                    >
                      ₹{formatPlainNumber(total)}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Fees + Interest + Tax (edit charges below if needed).
                    </p>
                  </div>
                )}
              </div>

              {overReceipt && (
                <div className="px-3 py-2 text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg">
                  Warning: Received (₹{formatPlainNumber(received)}) exceeds Total
                  (₹{formatPlainNumber(total)}) for this month. Outstanding is ₹0.
                  Payments were not changed.
                </div>
              )}
              {companyUnallocated > 0 && (
                <div className="text-[11px] text-[var(--muted)] space-y-1">
                  <p>
                    {GST_UNALLOCATED_LABEL} ₹
                    {formatPlainNumber(companyUnallocated)} (not part of this
                    month&apos;s Received).
                  </p>
                  <p>{GST_OUTSTANDING_UNALLOCATED_EXPLAIN}</p>
                </div>
              )}

              {canManagePayments ? (
                <form
                  className={`space-y-3 rounded-xl border p-3.5 ${
                    quickPayMode
                      ? 'border-[var(--navy-900)]/25 bg-[var(--card)] shadow-sm'
                      : 'border-[var(--line)]'
                  }`}
                  onSubmit={(e) => {
                    void handlePaymentSubmit(e);
                  }}
                >
                  <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide">
                    {editingPaymentId ? 'Edit payment' : 'Record payment'} ·{' '}
                    {target.month}
                  </p>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label
                        htmlFor={`${uid}-pay-amount`}
                        className="block text-xs font-medium text-[var(--ink)]"
                      >
                        Amount received (₹)
                      </label>
                      {!editingPaymentId && outstanding > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPayAmount(
                              String(
                                Number.isInteger(outstanding)
                                  ? outstanding
                                  : Math.round(outstanding * 100) / 100
                              )
                            );
                            setError(null);
                            payAmountInputRef.current?.focus();
                          }}
                          className="text-[11px] font-bold text-[var(--navy-900)] hover:underline cursor-pointer"
                        >
                          Use outstanding ₹{formatPlainNumber(outstanding)}
                        </button>
                      ) : null}
                    </div>
                    <input
                      ref={payAmountInputRef}
                      id={`${uid}-pay-amount`}
                      type="number"
                      min={0.01}
                      step="0.01"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={
                        outstanding > 0
                          ? String(
                              Number.isInteger(outstanding)
                                ? outstanding
                                : Math.round(outstanding * 100) / 100
                            )
                          : '0'
                      }
                      className={`${fieldClass} ${
                        quickPayMode
                          ? 'text-lg sm:text-base font-bold min-h-14 sm:min-h-12'
                          : ''
                      }`}
                      required
                      autoComplete="off"
                      aria-label="Payment Amount (₹)"
                    />
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      Type the amount for this payment only. Partial payments are
                      allowed; amount cannot exceed outstanding.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor={`${uid}-pay-date`}
                        className="block text-xs font-medium text-[var(--ink)] mb-1"
                      >
                        Payment Date
                      </label>
                      <input
                        id={`${uid}-pay-date`}
                        type="date"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className={fieldClass}
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${uid}-pay-mode`}
                        className="block text-xs font-medium text-[var(--ink)] mb-1"
                      >
                        Payment Mode
                      </label>
                      <LimeSelect
                        id={`${uid}-pay-mode`}
                        value={payMode}
                        options={paymentModes}
                        onChange={setPayMode}
                        ariaLabel="Payment mode"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={`${uid}-pay-ref`}
                      className="block text-xs font-medium text-[var(--ink)] mb-1"
                    >
                      Reference (optional)
                    </label>
                    <input
                      id={`${uid}-pay-ref`}
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="UTR / ref"
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex gap-2">
                    {editingPaymentId ? (
                      <button
                        type="button"
                        onClick={() => {
                          resetPaymentForm();
                          setError(null);
                          setSuccess(null);
                        }}
                        className="min-h-11 px-3 text-xs font-medium text-[var(--muted)] border border-[var(--line)] rounded-xl cursor-pointer"
                      >
                        Cancel edit
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        (!editingPaymentId && outstanding <= 0)
                      }
                      className="flex-1 min-h-12 px-4 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
                    >
                      {editingPaymentId
                        ? 'Update Payment'
                        : outstanding <= 0
                          ? 'Fully paid'
                          : 'Record Payment'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-[11px] text-[var(--muted)]">
                  Save the filing to enable payment entry for this month. Save
                  Filing never records a payment.
                </p>
              )}
            </section>

            {/* Section 3 — Existing Payment History (always visible when filing exists) */}
            {filingExists ? (
              <section
                className={`space-y-3 ${quickPayMode ? 'order-2' : 'order-3'}`}
                aria-labelledby={`${uid}-payment-history-heading`}
              >
                <h3
                  id={`${uid}-payment-history-heading`}
                  className={sectionTitle}
                >
                  Payment History ({payments.length})
                </h3>
                <div className="space-y-2">
                  {payments.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">
                      No payments recorded for this month.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {payments.map((p) => (
                        <li
                          key={p.id}
                          className="flex flex-col gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono font-semibold text-[var(--ink)]">
                                ₹{formatPlainNumber(p.amount)}
                              </p>
                              <p className="text-[var(--muted)] truncate">
                                {p.paymentDate} · {p.paymentMode}
                                {p.reference ? ` · ${p.reference}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {onUpdatePayment && (
                                <button
                                  type="button"
                                  onClick={() => startEditPayment(p)}
                                  className="p-2 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                                  aria-label="Edit payment"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onDeletePayment &&
                              confirmDeletePaymentId !== p.id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeletePaymentId(p.id)
                                  }
                                  className="p-2 text-[var(--muted)] hover:text-[var(--danger)] cursor-pointer"
                                  aria-label="Delete payment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                          {onDeletePayment &&
                          confirmDeletePaymentId === p.id ? (
                            <div className="flex flex-col gap-2">
                              <p className="text-[11px] leading-snug text-[var(--danger)] font-medium">
                                {gstPaymentDeleteWarning(
                                  `₹${formatPlainNumber(p.amount)}`,
                                  p.paymentDate || ''
                                )}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void handleDeletePayment(p.id)
                                  }
                                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-red-700 px-3 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
                                >
                                  {saving ? 'Removing…' : 'Confirm remove'}
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    setConfirmDeletePaymentId(null)
                                  }
                                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--muted)] cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}
          </div>

          <div className="px-5 py-4 border-t border-[var(--line)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 bg-[var(--card)]">
            {filingExists ? (
              <ConfirmDangerButton
                disabled={saving}
                label="Remove filing"
                confirmLabel="Delete filing & payments"
                warning={gstFilingDeleteWarning(payments.length)}
                onConfirm={handleDelete}
                className="sm:w-auto"
              />
            ) : (
              <span className="hidden sm:block" />
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none min-h-11 px-4 py-2 text-sm sm:text-xs font-medium text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void handleSaveFiling();
                }}
                className="flex-1 sm:flex-none min-h-11 px-5 py-2 text-sm sm:text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Filing'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
