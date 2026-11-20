import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import { computeBalance, formatPlainNumber } from '../utils/ledgerUtils.ts';
import { LimeSelect } from './LimeSelect.tsx';

interface FilingQuickModalProps {
  target: {
    client: ClientRecord;
    year: string;
    existing?: FilingRecord;
  } | null;
  onClose: () => void;
  onSave: (clientId: string, filing: FilingRecord) => Promise<void>;
  onDelete: (clientId: string, year: string) => Promise<void>;
}

export function FilingQuickModal({
  target,
  onClose,
  onSave,
  onDelete,
}: FilingQuickModalProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-filing-title"
    >
      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-5 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between">
          <div>
            <h2 id="quick-filing-title" className="font-display text-base font-semibold">
              {target.year} · {target.client.name}
            </h2>
            <p className="text-xs font-mono text-[var(--sidebar-text)] mt-0.5">
              PAN: {target.client.pan}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/75 hover:text-white rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 text-xs text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Filing Date
              </label>
              <input
                type="date"
                value={filingDate}
                onChange={(e) => setFilingDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Payment Receive Date
              </label>
              <input
                type="date"
                value={paymentReceiveDate}
                onChange={(e) => setPaymentReceiveDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Fees (₹)
              </label>
              <input
                type="number"
                min={0}
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Received (₹)
              </label>
              <input
                type="number"
                min={0}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder="9000"
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Balance (₹)
              </label>
              <div
                className={`px-3 py-2 text-xs font-mono font-semibold rounded-xl border tabular-nums ${
                  balance > 0
                    ? 'bg-[var(--frost-100)] border-[var(--line)] text-[var(--blue-500)]'
                    : 'bg-[var(--success-15)] border-[var(--success)] text-[var(--success)]'
                }`}
              >
                ₹{formatPlainNumber(balance)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--ink)] mb-1">
              Payment Type
            </label>
            <LimeSelect
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

          <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between">
            {target.existing ? (
              <button
                type="button"
                disabled={saving}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--danger)] hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
