import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import type { ClientRecord, FilingRecord } from '../types/ledger.ts';
import {
  computeClientTotals,
  formatPlainNumber,
  normalizePan,
  sortAssessmentYears,
} from '../utils/ledgerUtils.ts';
import {
  FIELD_LIMITS,
  isValidPanFormat,
  validateOptionalPhone,
} from '../utils/fieldValidation.ts';

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

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

export function ClientEditDrawer({
  client,
  mode,
  onClose,
  onSave,
  onEditFiling,
}: ClientEditDrawerProps) {
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
    const cleanPan = normalizePan(pan);
    const cleanPassword = password.trim();
    const keepExisting = !!client.hasPortalPassword && !cleanPassword;
    const panUnchanged = cleanPan === normalizePan(client.pan || '');
    if (!cleanName || !cleanPan || (!cleanPassword && !keepExisting)) {
      setError(
        client.hasPortalPassword
          ? 'Name and PAN are mandatory. Leave password blank to keep the stored portal password.'
          : 'Name, PAN, and Password are mandatory.'
      );
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

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-[var(--navy-900)]/35 cursor-pointer"
        onClick={() => {
          if (!saving) onClose();
        }}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="it-client-drawer-title"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--card)] shadow-card flex flex-col animate-in"
      >
        <header className="px-5 py-4 border-b border-[var(--line)] bg-[var(--frost-100)] flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {mode === 'edit' ? 'Edit client' : 'Filing history'}
            </p>
            <h2
              id="it-client-drawer-title"
              className="font-display text-lg font-bold text-[var(--ink)] mt-0.5"
            >
              {client.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`p-2 rounded-xl text-[var(--muted)] hover:bg-[var(--frost-100)] hover:text-[var(--ink)] cursor-pointer ${focusRing}`}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

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
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  PAN *
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(normalizePan(e.target.value))}
                  maxLength={FIELD_LIMITS.pan}
                  className={`w-full px-3 py-2 text-sm font-mono uppercase border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Password{' '}
                  {client.hasPortalPassword ? (
                    <span className="text-[var(--muted)] font-normal">
                      (leave blank to keep stored)
                    </span>
                  ) : (
                    '*'
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      client.hasPortalPassword
                        ? 'Leave blank to keep stored password'
                        : 'Password'
                    }
                    autoComplete="new-password"
                    className={`w-full px-3 py-2 pr-10 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                    required={!client.hasPortalPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer ${focusRing}`}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                />
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                Reference & notes
              </h3>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--ink)] mb-1">Remark</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={3}
                  className={`w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] resize-y ${focusRing}`}
                />
              </div>
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
                          className={`mt-2 text-[11px] font-semibold text-[var(--blue-500)] hover:underline cursor-pointer ${focusRing}`}
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

        <footer className="px-5 py-4 border-t border-[var(--line)] bg-[var(--frost-100)] flex items-center justify-end gap-2">
          {mode === 'edit' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={`px-4 py-2 text-xs font-semibold text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="it-client-edit-form"
                disabled={saving}
                className={`px-4 py-2 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60 ${focusRing}`}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
            >
              Close
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
