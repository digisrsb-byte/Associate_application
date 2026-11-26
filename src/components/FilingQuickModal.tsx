import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import { computeBalance, formatPlainNumber } from '../utils/ledgerUtils.ts';
import { LimeSelect } from './LimeSelect.tsx';
import { ConfirmDangerButton } from './mobile/ConfirmDangerButton.tsx';
import type { ItQuickEditFocus } from '../types/itUi.ts';

interface FilingQuickModalProps {
  target: {
    client: ClientRecord;
    year: string;
    existing?: FilingRecord;
    focus?: ItQuickEditFocus;
  } | null;
  onClose: () => void;
  onSave: (clientId: string, filing: FilingRecord) => Promise<void>;
  onDelete: (clientId: string, year: string) => Promise<void>;
}

const fieldClass =
  'w-full min-h-11 px-3 py-2.5 text-sm sm:text-xs sm:min-h-0 sm:py-2 font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';

const sectionTitle =
  'text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide';

export function FilingQuickModal({
  target,
  onClose,
  onSave,
  onDelete,
}: FilingQuickModalProps) {
  const uid = useId();
  const feesInputRef = useRef<HTMLInputElement>(null);
  const receivedInputRef = useRef<HTMLInputElement>(null);
  const [filingDate, setFilingDate] = useState('');
  const [fees, setFees] = useState('');
  const [received, setReceived] = useState('');
  const [paymentType, setPaymentType] = useState('GPay');
  const [paymentReceiveDate, setPaymentReceiveDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setError(null);
    const f = target.existing;
    if (f) {
      setFilingDate(f.filingDate || '');
      setFees(String(f.fees ?? 0));
      setReceived(String(f.received ?? 0));
      setPaymentType(f.paymentType || 'GPay');
      setPaymentReceiveDate(f.paymentReceiveDate || '');
    } else {
      setFilingDate('');
      setFees('');
      setReceived('');
      setPaymentType('GPay');
      setPaymentReceiveDate('');
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const focusPayment = target.focus === 'payment';
    const id = window.setTimeout(() => {
      const el = focusPayment ? receivedInputRef.current : feesInputRef.current;
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [target]);

  if (!target) return null;

  const numFees = Math.max(0, Number(fees) || 0);
  const numReceived = Math.max(0, Number(received) || 0);
  const balance = computeBalance(numFees, numReceived);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(target.client.id, {
        assessmentYear: target.year,
        filingDate: filingDate.trim(),
        fees: numFees,
        received: numReceived,
        balance,
        paymentType: paymentType.trim(),
        paymentReceiveDate: paymentReceiveDate.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(target.client.id, target.year);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-filing-title"
    >
      <div className="bg-[var(--card)] border border-[var(--line)] sm:rounded-2xl rounded-t-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[min(92dvh,100%)] sm:max-h-[90vh] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="px-5 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between shrink-0">
          <div className="min-w-0 pr-2">
            <h2 id="quick-filing-title" className="font-display text-base font-semibold truncate">
              {target.year} · {target.client.name}
            </h2>
            <p className="text-xs font-mono text-[var(--sidebar-text)] mt-0.5">
              PAN: {target.client.pan}
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain">
            {error && (
              <div className="px-3 py-2 text-xs text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <p className="rounded-xl border border-[var(--line)] bg-[var(--frost-100)] px-3 py-2.5 text-[11px] text-[var(--muted)] leading-relaxed">
              Enter billed{' '}
              <span className="font-semibold text-[var(--ink)]">Fees</span> and
              total{' '}
              <span className="font-semibold text-[var(--ink)]">Received</span>.
              Balance updates live as Fees − Received (minimum zero).{' '}
              <span className="font-semibold text-[var(--ink)]">Save filing</span>{' '}
              saves Fees and Received together for this year (same existing
              filing record).
            </p>

            <section className="space-y-3" aria-labelledby={`${uid}-charges-heading`}>
              <h3 id={`${uid}-charges-heading`} className={sectionTitle}>
                Filing charges
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${uid}-filing-date`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Filing Date
                  </label>
                  <input
                    id={`${uid}-filing-date`}
                    type="date"
                    value={filingDate}
                    onChange={(e) => setFilingDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-fees`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Fees (₹)
                  </label>
                  <input
                    id={`${uid}-fees`}
                    ref={feesInputRef}
                    type="number"
                    min={0}
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    placeholder="10000"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3" aria-labelledby={`${uid}-payment-heading`}>
              <h3 id={`${uid}-payment-heading`} className={sectionTitle}>
                Payment received
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${uid}-received`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Received (₹)
                  </label>
                  <input
                    id={`${uid}-received`}
                    ref={receivedInputRef}
                    type="number"
                    min={0}
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="9000"
                    className={fieldClass}
                  />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Total paid for this year so far.
                  </p>
                </div>

                <div>
                  <p className="block text-xs font-medium text-[var(--ink)] mb-1">
                    Balance (₹)
                  </p>
                  <div
                    className={`min-h-11 sm:min-h-0 px-3 py-2.5 sm:py-2 text-sm sm:text-xs font-mono font-semibold rounded-xl border tabular-nums flex items-center ${
                      balance > 0
                        ? 'bg-[var(--frost-100)] border-[var(--line)] text-[var(--blue-500)]'
                        : 'bg-[var(--success-15)] border-[var(--success)] text-[var(--success)]'
                    }`}
                    aria-live="polite"
                  >
                    ₹{formatPlainNumber(balance)}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Outstanding for this year (read-only).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${uid}-pay-date`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Payment Receive Date
                  </label>
                  <input
                    id={`${uid}-pay-date`}
                    type="date"
                    value={paymentReceiveDate}
                    onChange={(e) => setPaymentReceiveDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-payment-type`}
                    className="block text-xs font-medium text-[var(--ink)] mb-1"
                  >
                    Payment Type
                  </label>
                  <LimeSelect
                    id={`${uid}-payment-type`}
                    value={paymentType}
                    options={
                      paymentType &&
                      !(PAYMENT_TYPES as readonly string[]).includes(paymentType)
                        ? [...PAYMENT_TYPES, paymentType]
                        : PAYMENT_TYPES
                    }
                    onChange={setPaymentType}
                    ariaLabel="Payment type"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="px-5 py-4 border-t border-[var(--line)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 bg-[var(--card)]">
            {target.existing ? (
              <ConfirmDangerButton
                disabled={saving}
                label="Remove filing"
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
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-none min-h-11 px-5 py-2 text-sm sm:text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save filing'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
