import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, X } from 'lucide-react';
import { fadeScale, overlayFade } from '../motion/presets.ts';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import {
  computeBalance,
  normalizeAssessmentYearLabel,
  normalizePan,
} from '../utils/ledgerUtils.ts';
import {
  FIELD_LIMITS,
  isValidPanFormat,
  validateOptionalPhone,
} from '../utils/fieldValidation.ts';
import { LimeSelect } from './LimeSelect.tsx';

interface ClientModalProps {
  isOpen: boolean;
  editingClient: ClientRecord | null;
  availableYears: string[];
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    pan: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    initialFiling?: FilingRecord;
  }) => Promise<void>;
}

export function ClientModal({
  isOpen,
  editingClient,
  availableYears,
  onClose,
  onSave,
}: ClientModalProps) {
  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');

  const [addFiling, setAddFiling] = useState(true);
  const [assessmentYear, setAssessmentYear] = useState('AY 2026-27');
  const [filingDate, setFilingDate] = useState('');
  const [fees, setFees] = useState('');
  const [received, setReceived] = useState('');
  const [paymentType, setPaymentType] = useState('GPay');
  const [paymentReceiveDate, setPaymentReceiveDate] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowPassword(false);

    if (editingClient) {
      setName(editingClient.name);
      setPan(editingClient.pan);
      setPassword('');
      setPhone(editingClient.phone || '');
      setReferenceNumber(editingClient.referenceNumber || '');
      setRemark(editingClient.remark || '');
      setAddFiling(false);
    } else {
      setName('');
      setPan('');
      setPassword('');
      setPhone('');
      setReferenceNumber('');
      setRemark('');
      setAddFiling(true);
      setAssessmentYear(availableYears[availableYears.length - 1] || 'AY 2026-27');
      setFilingDate('');
      setFees('');
      setReceived('');
      setPaymentType('GPay');
      setPaymentReceiveDate('');
    }
  }, [isOpen, editingClient, availableYears]);

  if (!isOpen) return null;

  const numFees = Math.max(0, Number(fees) || 0);
  const numReceived = Math.max(0, Number(received) || 0);
  const balance = computeBalance(numFees, numReceived);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().slice(0, FIELD_LIMITS.name);
    const cleanPan = normalizePan(pan);
    const cleanPassword = password.trim();
    const keepExisting =
      !!editingClient?.hasPortalPassword && !cleanPassword;
    const panUnchanged =
      !!editingClient &&
      cleanPan === normalizePan(editingClient.pan || '');

    if (!cleanName || !cleanPan || (!cleanPassword && !keepExisting)) {
      setError(
        editingClient?.hasPortalPassword
          ? 'Name and PAN are mandatory. Leave password blank to keep the stored portal password.'
          : 'Name, PAN, and Password are mandatory.'
      );
      return;
    }
    if (name.trim().length > FIELD_LIMITS.name) {
      setError(`Name must be at most ${FIELD_LIMITS.name} characters.`);
      return;
    }
    if (!panUnchanged && !isValidPanFormat(cleanPan)) {
      setError(
        'Invalid PAN format (e.g. ABCDE1234F). This does not verify the PAN with the Income Tax Department.'
      );
      return;
    }
    const phoneCheck = validateOptionalPhone(phone);
    if (!phoneCheck.ok) {
      setError(phoneCheck.error);
      return;
    }
    if (remark.trim().length > FIELD_LIMITS.remark) {
      setError(`Remark must be at most ${FIELD_LIMITS.remark} characters.`);
      return;
    }

    let initialFiling: FilingRecord | undefined;
    if (!editingClient && addFiling) {
      const normalizedYear = normalizeAssessmentYearLabel(assessmentYear);
      if (!normalizedYear) {
        setError('Please enter a valid Year (e.g. AY 2026-27).');
        return;
      }
      initialFiling = {
        assessmentYear: normalizedYear,
        filingDate: filingDate.trim(),
        fees: numFees,
        received: numReceived,
        balance,
        paymentType: paymentType.trim(),
        paymentReceiveDate: paymentReceiveDate.trim(),
      };
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: editingClient?.id,
        name: cleanName,
        pan: cleanPan,
        password: cleanPassword,
        phone: phone.trim(),
        referenceNumber: referenceNumber.trim(),
        remark: remark.trim(),
        initialFiling,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-modal-title"
      variants={overlayFade}
      initial="hidden"
      animate="show"
    >
      <motion.div
        variants={fadeScale}
        initial="hidden"
        animate="show"
        className="bg-[var(--card)] border border-[var(--line)] rounded-2xl w-full max-w-xl shadow-xl overflow-hidden my-auto"
      >
        <div className="px-6 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between">
          <h2 id="client-modal-title" className="font-display text-base font-semibold">
            {editingClient ? 'Edit Client' : 'Add Client'}
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
                Name <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={FIELD_LIMITS.name}
                placeholder="Client Name"
                className="w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                PAN <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={FIELD_LIMITS.pan}
                value={pan}
                onChange={(e) => setPan(normalizePan(e.target.value))}
                placeholder="ABCDE1234F"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                Password{' '}
                {editingClient?.hasPortalPassword ? (
                  <span className="text-[var(--muted)] font-normal">
                    (leave blank to keep stored)
                  </span>
                ) : (
                  <span className="text-[var(--danger)]">*</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!editingClient?.hasPortalPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    editingClient?.hasPortalPassword
                      ? 'Leave blank to keep stored password'
                      : 'Password'
                  }
                  autoComplete="new-password"
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
                Reference No
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Reference Number"
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

          {!editingClient && (
            <div className="pt-4 border-t border-[var(--line)] space-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addFiling}
                  onChange={(e) => setAddFiling(e.target.checked)}
                  className="rounded border-[var(--line)] accent-[var(--navy-900)]"
                />
                <span>Add Filing Date entry now</span>
              </label>

              {addFiling && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[var(--frost-100)] border border-[var(--line)] rounded-xl p-3.5">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Year
                    </label>
                    <input
                      type="text"
                      list="modal-years-list"
                      value={assessmentYear}
                      onChange={(e) => setAssessmentYear(e.target.value)}
                      placeholder="AY 2026-27"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                    <datalist id="modal-years-list">
                      {availableYears.map((y) => (
                        <option key={y} value={y} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Filing Date
                    </label>
                    <input
                      type="date"
                      value={filingDate}
                      onChange={(e) => setFilingDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Payment Type
                    </label>
                    <LimeSelect
                      value={paymentType}
                      options={PAYMENT_TYPES}
                      onChange={setPaymentType}
                      ariaLabel="Payment type"
                      buttonClassName="py-1.5 px-2.5 rounded-full"
                    />
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
                      placeholder="10000"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Received (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      placeholder="9000"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Balance Outstanding
                    </label>
                    <div className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-[var(--frost-100)] border border-[var(--line)] rounded-lg text-[var(--ink)] tabular-nums">
                      ₹{balance.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-3">
                    <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Payment Receive Date
                    </label>
                    <input
                      type="date"
                      value={paymentReceiveDate}
                      onChange={(e) => setPaymentReceiveDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
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
      </motion.div>
    </motion.div>
  );
}
