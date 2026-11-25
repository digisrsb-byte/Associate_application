import { useEffect, useId, useState } from 'react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import { PAYMENT_TYPES } from '../types/ledger.ts';
import {
  computeBalance,
  normalizeAssessmentYearLabel,
  normalizePan,
} from '../utils/ledgerUtils.ts';
import {
  FIELD_LIMITS,
  PAN_FORMAT_EXAMPLE,
  validateOptionalPhone,
  validatePanValue,
} from '../utils/fieldValidation.ts';
import { LimeSelect } from './LimeSelect.tsx';
import { LabeledField } from './shared/LabeledField.tsx';
import { ModalFormFooter } from './shared/ModalFormFooter.tsx';
import { MotionModalShell } from './shared/MotionModalShell.tsx';
import { PasswordField } from './shared/PasswordField.tsx';
import {
  MODAL_MONO_INPUT_CLASS,
  MODAL_PAN_INPUT_CLASS,
  MODAL_REMARK_INPUT_CLASS,
  MODAL_TEXT_INPUT_CLASS,
} from './shared/formStyles.ts';

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
  const uid = useId();
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
    const cleanPassword = password.trim();
    const keepExisting =
      !!editingClient?.hasPortalPassword && !cleanPassword;
    const panUnchanged =
      !!editingClient &&
      normalizePan(pan) === normalizePan(editingClient.pan || '');

    let cleanPan: string;
    if (panUnchanged) {
      cleanPan = normalizePan(editingClient?.pan || '');
    } else {
      const panRes = validatePanValue(pan, { required: true });
      if (!panRes.ok) {
        setError(panRes.error);
        return;
      }
      cleanPan = panRes.pan;
    }

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
    <MotionModalShell
      titleId="client-modal-title"
      title={editingClient ? 'Edit Client' : 'Add Client'}
      onClose={onClose}
      panelClassName="max-w-xl"
    >
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-xs font-medium text-red-800 bg-[var(--danger-15)] border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LabeledField
              id={`${uid}-name`}
              label={
                <>
                  Name <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={FIELD_LIMITS.name}
              placeholder="Client Name"
              inputClassName={MODAL_TEXT_INPUT_CLASS}
              wrapperClassName="sm:col-span-2"
            />

            <LabeledField
              id={`${uid}-pan`}
              label={
                <>
                  PAN <span className="text-[var(--danger)]">*</span>
                </>
              }
              type="text"
              required
              maxLength={FIELD_LIMITS.pan}
              value={pan}
              onChange={(e) => setPan(normalizePan(e.target.value))}
              placeholder={PAN_FORMAT_EXAMPLE}
              title="Format example only — not a real or government-verified PAN"
              inputClassName={MODAL_PAN_INPUT_CLASS}
            />

            <PasswordField
              id={`${uid}-password`}
              variant="modal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((p) => !p)}
              keepStoredHint={!!editingClient?.hasPortalPassword}
            />

            <LabeledField
              id={`${uid}-phone`}
              label="Phone Number"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile Number"
              inputClassName={MODAL_MONO_INPUT_CLASS}
            />

            <LabeledField
              id={`${uid}-ref`}
              label="Reference No"
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Reference Number"
              inputClassName={MODAL_MONO_INPUT_CLASS}
            />

            <LabeledField
              id={`${uid}-remark`}
              label="Remark"
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Optional remark"
              inputClassName={MODAL_REMARK_INPUT_CLASS}
              wrapperClassName="sm:col-span-2"
            />
          </div>

          {!editingClient && (
            <div className="pt-4 border-t border-[var(--line)] space-y-3">
              <label
                htmlFor={`${uid}-add-filing`}
                className="flex items-center gap-2 text-xs font-medium text-[var(--ink)] cursor-pointer select-none"
              >
                <input
                  id={`${uid}-add-filing`}
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
                    <label
                      htmlFor={`${uid}-year`}
                      className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                    >
                      Year
                    </label>
                    <input
                      id={`${uid}-year`}
                      type="text"
                      list={`${uid}-years-list`}
                      value={assessmentYear}
                      onChange={(e) => setAssessmentYear(e.target.value)}
                      placeholder="AY 2026-27"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                    <datalist id={`${uid}-years-list`}>
                      {availableYears.map((y) => (
                        <option key={y} value={y} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label
                      htmlFor={`${uid}-filing-date`}
                      className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                    >
                      Filing Date
                    </label>
                    <input
                      id={`${uid}-filing-date`}
                      type="date"
                      value={filingDate}
                      onChange={(e) => setFilingDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`${uid}-payment-type`}
                      className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                    >
                      Payment Type
                    </label>
                    <LimeSelect
                      id={`${uid}-payment-type`}
                      value={paymentType}
                      options={PAYMENT_TYPES}
                      onChange={setPaymentType}
                      ariaLabel="Payment type"
                      buttonClassName="py-1.5 px-2.5 rounded-full"
                    />
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
                      placeholder="10000"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`${uid}-received`}
                      className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                    >
                      Received (₹)
                    </label>
                    <input
                      id={`${uid}-received`}
                      type="number"
                      min={0}
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      placeholder="9000"
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-[var(--card)] border border-[var(--line)] rounded-lg focus:outline-none focus:border-[var(--blue-500)]"
                    />
                  </div>

                  <div>
                    <p className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                      Balance Outstanding
                    </p>
                    <div
                      className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-[var(--frost-100)] border border-[var(--line)] rounded-lg text-[var(--ink)] tabular-nums"
                      aria-live="polite"
                    >
                      ₹{balance.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-3">
                    <label
                      htmlFor={`${uid}-pay-date`}
                      className="block text-[11px] font-medium text-[var(--muted)] mb-1"
                    >
                      Payment Receive Date
                    </label>
                    <input
                      id={`${uid}-pay-date`}
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

          <ModalFormFooter onCancel={onClose} saving={saving} />
        </form>
    </MotionModalShell>
  );
}
