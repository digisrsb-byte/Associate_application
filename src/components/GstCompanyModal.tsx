import { useEffect, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstFilingTotal,
  normalizeGstMonthLabel,
} from '../utils/ledgerUtils.ts';

interface GstCompanyModalProps {
  isOpen: boolean;
  editingCompany: GstClientRecord | null;
  availableMonths: string[];
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    companyName: string;
    userId: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    totalReceived: number;
    initialFiling?: GstMonthlyFiling;
  }) => Promise<void>;
}

export function GstCompanyModal({
  isOpen,
  editingCompany,
  availableMonths,
  onClose,
  onSave,
}: GstCompanyModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');
  const [totalReceived, setTotalReceived] = useState('');

  const [addFiling, setAddFiling] = useState(true);
  const [month, setMonth] = useState('Apr 2026');
  const [fees, setFees] = useState('');
  const [interest, setInterest] = useState('');
  const [tax, setTax] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowPassword(false);

    if (editingCompany) {
      setCompanyName(editingCompany.companyName);
      setUserId(editingCompany.userId);
      setPassword(editingCompany.password);
      setPhone(editingCompany.phone || '');
      setReferenceNumber(editingCompany.referenceNumber || '');
      setRemark(editingCompany.remark || '');
      setTotalReceived(String(editingCompany.totalReceived ?? 0));
      setAddFiling(false);
    } else {
      setCompanyName('');
      setUserId('');
      setPassword('');
      setPhone('');
      setReferenceNumber('');
      setRemark('');
      setTotalReceived('');
      setAddFiling(true);
      setMonth(availableMonths[0] || 'Apr 2026');
      setFees('');
      setInterest('');
      setTax('');
    }
  }, [isOpen, editingCompany, availableMonths]);

  if (!isOpen) return null;

  const numFees = Math.max(0, Number(fees) || 0);
  const numInterest = Math.max(0, Number(interest) || 0);
  const numTax = Math.max(0, Number(tax) || 0);
  const total = computeGstFilingTotal(numFees, numInterest, numTax);
  const numTotalReceived = Math.max(0, Number(totalReceived) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCompany = companyName.trim();
    const cleanUserId = userId.trim();
    const cleanPassword = password.trim();

    if (!cleanCompany || !cleanUserId || !cleanPassword) {
      setError('Company Name, User ID, and Password are mandatory.');
      return;
    }

    let initialFiling: GstMonthlyFiling | undefined;
    if (!editingCompany && addFiling) {
      const normalizedMonth = normalizeGstMonthLabel(month);
      if (!normalizedMonth) {
        setError('Please enter a valid Month (e.g. Apr 2026).');
        return;
      }
      initialFiling = {
        month: normalizedMonth,
        fees: numFees,
        interest: numInterest,
        tax: numTax,
        total,
      };
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: editingCompany?.id,
        companyName: cleanCompany,
        userId: cleanUserId,
        password: cleanPassword,
        phone: phone.trim(),
        referenceNumber: referenceNumber.trim(),
        remark: remark.trim(),
        totalReceived: numTotalReceived,
        initialFiling,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save GST company.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gst-company-modal-title"
    >
      <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden my-auto">
        <div className="px-6 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between">
          <h2 id="gst-company-modal-title" className="font-display text-base font-semibold">
            {editingCompany ? 'Edit GST Company' : 'Add GST Company'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/75 hover:text-white rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs font-medium text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Company Name <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company Name"
                className="w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                User ID <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="User ID"
                className="w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Password <span className="text-[var(--danger)]">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2 pr-9 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Mobile Number"
                className="w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Ref No
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Reference No"
                className="w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Total Recd (₹)
              </label>
              <input
                type="number"
                min={0}
                value={totalReceived}
                onChange={(e) => setTotalReceived(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Remark
              </label>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Optional remark"
                className="w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>
          </div>

          {!editingCompany && (
            <div className="pt-4 border-t border-[var(--line)] space-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addFiling}
                  onChange={(e) => setAddFiling(e.target.checked)}
                  className="rounded border-[var(--line)] accent-[var(--navy-900)]"
                />
                <span>Add Monthly Filing entry now</span>
              </label>

              {addFiling && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[var(--frost-100)] border border-[var(--line)] rounded-xl p-3.5">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Month
                    </label>
                    <input
                      type="text"
                      list="gst-modal-months-list"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      placeholder="Apr 2026"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                    <datalist id="gst-modal-months-list">
                      {availableMonths.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Fees (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={fees}
                      onChange={(e) => setFees(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Interest (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={interest}
                      onChange={(e) => setInterest(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Tax (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Total (₹)
                    </label>
                    <div className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-[var(--frost-100)] border border-[var(--line)] rounded-lg text-[var(--ink)] tabular-nums">
                      ₹{total.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-[var(--line)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
