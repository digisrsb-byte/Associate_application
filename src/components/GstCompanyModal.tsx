import { useEffect, useId, useState } from 'react';
import type { GstClientRecord, GstMonthlyFiling } from '../types/ledger.ts';
import {
  computeGstFilingTotal,
  normalizeGstMonthLabel,
} from '../utils/ledgerUtils.ts';
import { FIELD_LIMITS, validateRequiredPhone } from '../utils/fieldValidation.ts';
import { LabeledField } from './shared/LabeledField.tsx';
import { ModalFormFooter } from './shared/ModalFormFooter.tsx';
import { MotionModalShell } from './shared/MotionModalShell.tsx';
import { PasswordField } from './shared/PasswordField.tsx';
import {
  MODAL_MONO_INPUT_CLASS,
  MODAL_REMARK_INPUT_CLASS,
  MODAL_TEXT_INPUT_CLASS,
} from './shared/formStyles.ts';

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
  const uid = useId();
  const [companyName, setCompanyName] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');

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
      setPassword('');
      setPhone(editingCompany.phone || '');
      setReferenceNumber(editingCompany.referenceNumber || '');
      setRemark(editingCompany.remark || '');
    } else {
      setCompanyName('');
      setUserId('');
      setPassword('');
      setPhone('');
      setReferenceNumber('');
      setRemark('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCompany = companyName.trim().slice(0, FIELD_LIMITS.companyName);
    const cleanUserId = userId.trim().slice(0, FIELD_LIMITS.userId);
    const cleanPassword = password.trim();

    const keepExisting =
      !!editingCompany?.hasPortalPassword && !cleanPassword;
    if (!cleanCompany || !cleanUserId || (!cleanPassword && !keepExisting)) {
      setError(
        editingCompany?.hasPortalPassword
          ? 'Company Name and User ID are mandatory. Leave password blank to keep the stored portal password.'
          : 'Company Name, User ID, and Password are mandatory.'
      );
      return;
    }
    if (companyName.trim().length > FIELD_LIMITS.companyName) {
      setError(
        `Company Name must be at most ${FIELD_LIMITS.companyName} characters.`
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
    if (cleanRef.length > FIELD_LIMITS.referenceNumber) {
      setError(
        `Ref No must be at most ${FIELD_LIMITS.referenceNumber} characters.`
      );
      return;
    }
    const cleanRemark = remark.trim();
    if (!cleanRemark) {
      setError('Remark is required.');
      return;
    }
    if (cleanRemark.length > FIELD_LIMITS.remark) {
      setError(`Remark must be at most ${FIELD_LIMITS.remark} characters.`);
      return;
    }

    let initialFiling: GstMonthlyFiling | undefined;
    if (!editingCompany) {
      const normalizedMonth = normalizeGstMonthLabel(month);
      if (!normalizedMonth) {
        setError('Monthly Filing is required. Enter a valid Month (e.g. Apr 2026).');
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
        phone: phoneCheck.value,
        referenceNumber: cleanRef.slice(0, FIELD_LIMITS.referenceNumber),
        remark: cleanRemark.slice(0, FIELD_LIMITS.remark),
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
    <MotionModalShell
      titleId="gst-company-modal-title"
      title={editingCompany ? 'Edit GST Company' : 'Add GST Company'}
      onClose={onClose}
      panelClassName="max-w-lg"
    >
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs font-medium text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LabeledField
              id={`${uid}-company-name`}
              label={
                <>
                  Company Name <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={FIELD_LIMITS.companyName}
              placeholder="Company Name"
              inputClassName={MODAL_TEXT_INPUT_CLASS}
              wrapperClassName="sm:col-span-2"
            />

            <LabeledField
              id={`${uid}-user-id`}
              label={
                <>
                  User ID <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID"
              inputClassName={MODAL_MONO_INPUT_CLASS}
            />

            <PasswordField
              id={`${uid}-password`}
              variant="modal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((p) => !p)}
              keepStoredHint={!!editingCompany?.hasPortalPassword}
            />

            <LabeledField
              id={`${uid}-phone`}
              label={
                <>
                  Phone <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile Number"
              inputClassName={MODAL_MONO_INPUT_CLASS}
            />

            <LabeledField
              id={`${uid}-ref`}
              label={
                <>
                  Ref No <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Reference No"
              inputClassName={MODAL_MONO_INPUT_CLASS}
            />

            <LabeledField
              id={`${uid}-remark`}
              label={
                <>
                  Remark <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Remark"
              inputClassName={MODAL_REMARK_INPUT_CLASS}
              wrapperClassName="sm:col-span-2"
            />
          </div>

          {!editingCompany && (
            <div className="pt-4 border-t border-[var(--line)] space-y-3">
              <p className="text-xs font-medium text-[var(--ink)]">
                Monthly Filing <span className="text-[var(--danger)]">*</span>
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[var(--frost-100)] border border-[var(--line)] rounded-xl p-3.5">
                <div className="col-span-2 sm:col-span-1">
                  <label
                    htmlFor={`${uid}-month`}
                    className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                  >
                    Month
                  </label>
                  <input
                    id={`${uid}-month`}
                    type="text"
                    list={`${uid}-months-list`}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    placeholder="Apr 2026"
                    required
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                  />
                  <datalist id={`${uid}-months-list`}>
                    {availableMonths.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-fees`}
                    className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                  >
                    Fees (₹)
                  </label>
                  <input
                    id={`${uid}-fees`}
                    type="number"
                    min={0}
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-interest`}
                    className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                  >
                    Interest (₹)
                  </label>
                  <input
                    id={`${uid}-interest`}
                    type="number"
                    min={0}
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-tax`}
                    className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                  >
                    Tax (₹)
                  </label>
                  <input
                    id={`${uid}-tax`}
                    type="number"
                    min={0}
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                  />
                </div>

                <div>
                  <p className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                    Total (₹)
                  </p>
                  <div
                    className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-[var(--frost-100)] border border-[var(--line)] rounded-lg text-[var(--ink)] tabular-nums"
                    aria-live="polite"
                  >
                    ₹{total.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>
          )}

          <ModalFormFooter onCancel={onClose} saving={saving} />
        </form>
    </MotionModalShell>
  );
}
