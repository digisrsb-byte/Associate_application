import { useEffect, useId, useMemo, useState } from 'react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import {
  computeClientTotals,
  formatPlainNumber,
  normalizePan,
  sortAssessmentYears,
} from '../utils/ledgerUtils.ts';
import {
  FIELD_LIMITS,
  PAN_FORMAT_EXAMPLE,
  validateOptionalPhone,
  validatePanValue,
} from '../utils/fieldValidation.ts';
import { DrawerShell } from './shared/DrawerShell.tsx';
import { LabeledField } from './shared/LabeledField.tsx';
import { PasswordField } from './shared/PasswordField.tsx';
import {
  DRAWER_MONO_INPUT_CLASS,
  DRAWER_PAN_INPUT_CLASS,
  DRAWER_TEXT_INPUT_CLASS,
  DRAWER_TEXTAREA_CLASS,
  FOCUS_RING,
} from './shared/formStyles.ts';

export type ItDrawerMode = 'edit' | 'history';

interface ClientEditDrawerProps {
  client: ClientRecord | null;
  mode: ItDrawerMode | null;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    name: string;
    pan: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
  }) => Promise<void>;
  onEditFiling?: (client: ClientRecord, year: string, filing: FilingRecord) => void;
}

export function ClientEditDrawer({
  client,
  mode,
  onClose,
  onSave,
  onEditFiling,
}: ClientEditDrawerProps) {
  const uid = useId();
  const open = Boolean(client && mode);
  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client || !mode) return;
    setError(null);
    setShowPassword(false);
    setName(client.name);
    setPan(client.pan);
    setPassword('');
    setPhone(client.phone || '');
    setReferenceNumber(client.referenceNumber || '');
    setRemark(client.remark || '');
  }, [client, mode]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  const historyYears = useMemo(() => {
    if (!client) return [];
    return sortAssessmentYears(Object.keys(client.filings || {}));
  }, [client]);

  const totals = useMemo(
    () => (client ? computeClientTotals(client) : null),
    [client]
  );

  if (!open || !client || !mode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().slice(0, FIELD_LIMITS.name);
    const cleanPassword = password.trim();
    const keepExisting = !!client.hasPortalPassword && !cleanPassword;
    const panUnchanged = normalizePan(pan) === normalizePan(client.pan || '');

    let cleanPan: string;
    if (panUnchanged) {
      cleanPan = normalizePan(client.pan || '');
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
        client.hasPortalPassword
          ? 'Name and PAN are mandatory. Leave password blank to keep the stored portal password.'
          : 'Name, PAN, and Password are mandatory.'
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

    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: client.id,
        name: cleanName,
        pan: cleanPan,
        password: cleanPassword,
        phone: phone.trim(),
        referenceNumber: referenceNumber.trim(),
        remark: remark.trim(),
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
          form="it-client-edit-form"
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
      titleId="it-client-drawer-title"
      eyebrow={mode === 'edit' ? 'Edit client' : 'Filing history'}
      title={client.name}
      onClose={onClose}
      closeDisabled={saving}
      footer={footer}
    >
      {mode === 'edit' ? (
        <form
          id="it-client-edit-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
        >
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
              Account details
            </h3>
            <LabeledField
              id={`${uid}-name`}
              label="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputClassName={DRAWER_TEXT_INPUT_CLASS}
              required
            />
            <LabeledField
              id={`${uid}-pan`}
              label="PAN *"
              value={pan}
              onChange={(e) => setPan(normalizePan(e.target.value))}
              maxLength={FIELD_LIMITS.pan}
              inputClassName={DRAWER_PAN_INPUT_CLASS}
              placeholder={PAN_FORMAT_EXAMPLE}
              title="Format example only — not a real or government-verified PAN"
              required
            />
            <PasswordField
              id={`${uid}-password`}
              variant="drawer"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              showPassword={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
              keepStoredHint={!!client.hasPortalPassword}
            />
            <LabeledField
              id={`${uid}-phone`}
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputClassName={DRAWER_MONO_INPUT_CLASS}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
              Reference & notes
            </h3>
            <LabeledField
              id={`${uid}-ref`}
              label="Reference Number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              inputClassName={DRAWER_MONO_INPUT_CLASS}
            />
            <LabeledField
              as="textarea"
              id={`${uid}-remark`}
              label="Remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              inputClassName={DRAWER_TEXTAREA_CLASS}
            />
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
            {historyYears.length} assessment{' '}
            {historyYears.length === 1 ? 'year' : 'years'} · Outstanding ₹
            {formatPlainNumber(totals?.outstandingTotal || 0)}
          </div>

          {historyYears.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">
              No assessment year filings recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {historyYears.map((year) => {
                const filing = client.filings[year];
                if (!filing) return null;
                return (
                  <li
                    key={year}
                    className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--ink)]">
                        {year}
                      </span>
                      <span
                        className={`font-mono text-sm font-semibold ${
                          filing.balance > 0 ? 'text-[var(--blue-500)]' : 'text-[var(--ink)]'
                        }`}
                      >
                        ₹{formatPlainNumber(filing.balance)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                      <span>Fees ₹{formatPlainNumber(filing.fees)}</span>
                      <span>Received ₹{formatPlainNumber(filing.received)}</span>
                      <span>Balance ₹{formatPlainNumber(filing.balance)}</span>
                    </div>
                    {onEditFiling && (
                      <button
                        type="button"
                        onClick={() => onEditFiling(client, year, filing)}
                        className={`mt-2 text-[11px] font-semibold text-[var(--blue-500)] hover:underline cursor-pointer ${FOCUS_RING}`}
                      >
                        Edit year entry
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
