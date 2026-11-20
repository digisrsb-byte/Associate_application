import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstFilingTotal,
  formatPlainNumber,
} from '../utils/ledgerUtils.ts';

interface GstFilingQuickModalProps {
  target: {
    company: GstClientRecord;
    month: string;
    existing?: GstMonthlyFiling;
  } | null;
  onClose: () => void;
  onSave: (companyId: string, filing: GstMonthlyFiling) => Promise<void>;
  onDelete: (companyId: string, month: string) => Promise<void>;
}

export function GstFilingQuickModal({
  target,
  onClose,
  onSave,
  onDelete,
}: GstFilingQuickModalProps) {
  const [fees, setFees] = useState('');
  const [interest, setInterest] = useState('');
  const [tax, setTax] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [target]);

  if (!target) return null;

  const numFees = Math.max(0, Number(fees) || 0);
  const numInterest = Math.max(0, Number(interest) || 0);
  const numTax = Math.max(0, Number(tax) || 0);
  const total = computeGstFilingTotal(numFees, numInterest, numTax);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(target.company.id, {
        month: target.month,
        fees: numFees,
        interest: numInterest,
        tax: numTax,
        total,
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
      await onDelete(target.company.id, target.month);
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
      aria-labelledby="gst-quick-filing-title"
    >
      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="px-5 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between">
          <div>
            <h2 id="gst-quick-filing-title" className="font-display text-base font-semibold">
              {target.month} · {target.company.companyName}
            </h2>
            <p className="text-xs font-mono text-[var(--sidebar-text)] mt-0.5">
              User ID: {target.company.userId}
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
                placeholder="0"
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Interest (₹)
              </label>
              <input
                type="number"
                min={0}
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Tax (₹)
              </label>
              <input
                type="number"
                min={0}
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-xs font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[var(--frost-100)] border border-[var(--line)]">
            <span className="text-xs font-semibold text-[var(--ink)]">
              Total (Fees + Interest + Tax)
            </span>
            <span className="font-mono text-sm font-bold text-[var(--ink)] tabular-nums">
              ₹{formatPlainNumber(total)}
            </span>
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
