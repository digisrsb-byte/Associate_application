import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import type { LedgerState, MainSection } from '../types/ledger.ts';

type Domain = MainSection;

type TargetField = {
  key: string;
  label: string;
  required: boolean;
  sensitive?: boolean;
};

type SheetInfo = {
  name: string;
  role: string;
  headerRow: number;
  headings: string[];
  dataRowCount: number;
};

type ValidateResponse = {
  domain: Domain;
  canCommit: boolean;
  mappingFingerprint: string;
  policies: { mode: string; onConflict: string };
  preview: {
    samples: Array<Record<string, unknown>>;
    issueCounts: { error: number; warn: number };
    unknownColumns: string[];
    finance: Record<string, number | null>;
    diff: {
      newClients: number;
      existingClients: number;
      filingsToAdd: number;
      filingsToUpdate: number;
      filingsToSkip: number;
      invalidRecords: number;
    };
    validClientCount?: number;
    validCompanyCount?: number;
    validFilingCount: number;
  };
  issues: Array<{
    level: string;
    code: string;
    row?: number;
    message: string;
  }>;
  parseStats: {
    rowsRead: number;
    rowsSkipped: number;
    duplicateFilingRows: number;
  };
  policyNotes: string[];
};

type CommitReport = {
  clientsCreated: number;
  clientsUpdated: number;
  filingsAdded: number;
  filingsUpdated: number;
  filingsSkipped: number;
  backupFile?: string;
  domain?: string;
  note?: string;
};

type Step =
  | 'domain'
  | 'file'
  | 'sheet'
  | 'map'
  | 'preview'
  | 'review'
  | 'confirm'
  | 'done';

const STEPS: Step[] = [
  'domain',
  'file',
  'sheet',
  'map',
  'preview',
  'review',
  'confirm',
  'done',
];

interface ExcelImportWizardProps {
  initialDomain?: Domain;
  onImported: (ledger: LedgerState) => void;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function ExcelImportWizard({
  initialDomain = 'it',
  onImported,
}: ExcelImportWizardProps) {
  const [step, setStep] = useState<Step>('domain');
  const [domain, setDomain] = useState<Domain>(initialDomain);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [sheetName, setSheetName] = useState<string>('');
  const [targetFields, setTargetFields] = useState<TargetField[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [unmappedHeadings, setUnmappedHeadings] = useState<string[]>([]);

  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [onConflict, setOnConflict] = useState<'update' | 'skip'>('update');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [validated, setValidated] = useState<ValidateResponse | null>(null);
  const [report, setReport] = useState<CommitReport | null>(null);

  useEffect(() => {
    setDomain(initialDomain);
  }, [initialDomain]);

  useEffect(() => {
    return () => {
      if (sessionId) {
        void fetch(`/api/import/session/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      }
    };
  }, [sessionId]);

  const stepIndex = STEPS.indexOf(step);
  const headings = useMemo(() => {
    const s = sheets.find((x) => x.name === sheetName);
    return s?.headings || [];
  }, [sheets, sheetName]);

  const resetAfterDomain = () => {
    if (sessionId) {
      void fetch(`/api/import/session/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }
    setSessionId(null);
    setFilename('');
    setSheets([]);
    setSheetName('');
    setTargetFields([]);
    setMapping({});
    setUnmappedHeadings([]);
    setValidated(null);
    setReport(null);
    setError(null);
    setConfirmChecked(false);
    setReplaceConfirm('');
  };

  const uploadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        if (!/\.xlsx$/i.test(file.name)) {
          setError('Only .xlsx files are supported.');
          return;
        }
        const contentBase64 = await fileToBase64(file);
        const res = await fetch('/api/import/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            filename: file.name,
            contentBase64,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Upload failed.');
          return;
        }
        setSessionId(data.sessionId);
        setFilename(data.filename);
        setSheets(data.sheets || []);
        setSheetName(data.suggestedSheetName || data.sheets?.[0]?.name || '');
        setTargetFields(data.targetFields || []);
        setMapping(data.suggestedMapping || {});
        setUnmappedHeadings(data.unmappedHeadings || []);
        setStep('sheet');
      } catch {
        setError('Upload failed.');
      } finally {
        setBusy(false);
      }
    },
    [domain]
  );

  const runValidate = async () => {
    if (!sessionId || !sheetName) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/session/${sessionId}/validate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetName,
          mapping,
          mode,
          onConflict,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Validation failed.');
        return;
      }
      setValidated(data);
      setUnmappedHeadings(data.preview?.unknownColumns || []);
      setStep('preview');
    } catch {
      setError('Validation failed.');
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!sessionId || !validated) return;
    if (mode === 'replace' && replaceConfirm !== 'REPLACE') return;
    if (!confirmChecked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/session/${sessionId}/commit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          mappingFingerprint: validated.mappingFingerprint,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Commit failed.');
        return;
      }
      setReport(data.report);
      setSessionId(null);
      if (data.ledger) onImported(data.ledger);
      setStep('done');
    } catch {
      setError('Commit failed.');
    } finally {
      setBusy(false);
    }
  };

  const onSheetChosen = (name: string) => {
    setSheetName(name);
    const meta = sheets.find((s) => s.name === name);
    if (!meta) return;
    // Keep existing mapping keys; remap suggestions client-side lightly
    const next: Record<string, string | null> = { ...mapping };
    for (const f of targetFields) {
      if (next[f.key] && meta.headings.includes(next[f.key]!)) continue;
      const hit = meta.headings.find(
        (h) =>
          h.toLowerCase() === f.label.toLowerCase() ||
          h.toLowerCase().includes(f.key.toLowerCase())
      );
      next[f.key] = hit || null;
    }
    setMapping(next);
    setUnmappedHeadings(
      meta.headings.filter((h) => !Object.values(next).includes(h))
    );
  };

  const visibleSteps = STEPS.filter((s) => s !== 'done' || step === 'done');
  const progressPct =
    visibleSteps.length <= 1
      ? 100
      : Math.round((stepIndex / (visibleSteps.length - 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Step {Math.min(stepIndex + 1, visibleSteps.length)} of {visibleSteps.length}
            <span className="normal-case tracking-normal font-semibold text-[var(--ink)]">
              {' '}
              · {step}
            </span>
          </p>
          <p className="text-[11px] font-mono font-semibold text-[var(--muted)] tabular-nums">
            {progressPct}%
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--frost-100)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--navy-900)] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="hidden sm:flex flex-wrap gap-1">
          {visibleSteps.map((s, i) => (
            <span
              key={s}
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${
                i <= stepIndex
                  ? 'bg-[var(--navy-900)] text-white'
                  : 'bg-[var(--frost-100)] text-[var(--muted)]'
              }`}
            >
              {i + 1}. {s}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-[var(--danger)] bg-[var(--danger-15)] rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {step === 'domain' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink)]">
            Choose which workbook type you are importing into the shared
            organization.
          </p>
          <div className="flex gap-2">
            {(
              [
                ['it', 'Income Tax'],
                ['gst', 'GST'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  resetAfterDomain();
                  setDomain(id);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer ${
                  domain === id
                    ? 'bg-[var(--navy-900)] text-white'
                    : 'border border-[var(--line)] text-[var(--ink)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer"
            onClick={() => setStep('file')}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'file' && (
        <div className="space-y-3">
          <div
            className="border-2 border-dashed border-[var(--line)] rounded-2xl p-6 text-center bg-[var(--frost-100)]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void uploadFile(f);
            }}
          >
            <Upload className="w-6 h-6 mx-auto text-[var(--blue-500)] mb-2" />
            <p className="text-sm font-semibold text-[var(--ink)]">
              Drop .xlsx here or choose a file
            </p>
            <p className="text-[11px] text-[var(--muted)] mt-1">
              .xls is not supported. Macros are never executed.
            </p>
            <label className="inline-block mt-3 px-4 py-2 text-xs font-bold bg-[var(--card)] border border-[var(--navy-900)] rounded-xl cursor-pointer">
              Choose .xlsx
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                }}
              />
            </label>
            {busy && (
              <p className="mt-2 text-xs text-[var(--muted)] flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
              </p>
            )}
          </div>
          <button
            type="button"
            className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
            onClick={() => setStep('domain')}
          >
            Back
          </button>
        </div>
      )}

      {step === 'sheet' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--muted)]">
            File: {filename} · Domain: {domain.toUpperCase()}
          </p>
          <label className="block text-sm font-semibold text-[var(--ink)]">
            Worksheet
            <select
              className="mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2 text-sm bg-[var(--card)]"
              value={sheetName}
              onChange={(e) => onSheetChosen(e.target.value)}
            >
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.dataRowCount} rows · {s.role})
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
              onClick={() => {
                resetAfterDomain();
                setStep('file');
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={!sheetName}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer disabled:opacity-50"
              onClick={() => setStep('map')}
            >
              Map columns
            </button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--muted)]">
            Map Excel headings to application fields. Unmapped source columns are
            reported (not discarded silently).
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {targetFields.map((f) => (
              <label
                key={f.key}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm"
              >
                <span className="sm:w-44 font-medium text-[var(--ink)]">
                  {f.label}
                  {f.required ? ' *' : ''}
                  {f.sensitive ? ' (encrypted)' : ''}
                </span>
                <select
                  className="flex-1 border border-[var(--line)] rounded-xl px-3 py-1.5 text-sm bg-[var(--card)]"
                  value={mapping[f.key] || ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setMapping((m) => ({ ...m, [f.key]: v }));
                  }}
                >
                  <option value="">— not mapped —</option>
                  {headings.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {unmappedHeadings.length > 0 && (
            <div className="text-xs text-[var(--muted)] bg-[var(--frost-100)] rounded-xl px-3 py-2">
              Unmapped Excel columns: {unmappedHeadings.join(', ')}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              Mode
              <select
                className="border border-[var(--line)] rounded-lg px-2 py-1"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value === 'replace' ? 'replace' : 'merge')
                }
              >
                <option value="merge">Merge</option>
                <option value="replace">Replace domain</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              On conflict
              <select
                className="border border-[var(--line)] rounded-lg px-2 py-1"
                value={onConflict}
                onChange={(e) =>
                  setOnConflict(e.target.value === 'skip' ? 'skip' : 'update')
                }
              >
                <option value="update">Update existing</option>
                <option value="skip">Skip existing</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
              onClick={() => setStep('sheet')}
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              onClick={() => void runValidate()}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Preview & validate
            </button>
          </div>
        </div>
      )}

      {(step === 'preview' || step === 'review') && validated && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-bold text-[var(--ink)]">Valid records</p>
              <p className="text-[var(--muted)]">
                {validated.domain === 'it'
                  ? `${validated.preview.validClientCount ?? 0} clients`
                  : `${validated.preview.validCompanyCount ?? 0} companies`}{' '}
                · {validated.preview.validFilingCount} filings
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-bold text-[var(--ink)]">Issues</p>
              <p className="text-[var(--muted)]">
                {validated.preview.issueCounts.error} errors ·{' '}
                {validated.preview.issueCounts.warn} warnings ·{' '}
                {validated.preview.diff.invalidRecords} invalid
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-bold text-[var(--ink)]">New / existing</p>
              <p className="text-[var(--muted)]">
                {validated.preview.diff.newClients} new ·{' '}
                {validated.preview.diff.existingClients} existing
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-bold text-[var(--ink)]">Filings</p>
              <p className="text-[var(--muted)]">
                +{validated.preview.diff.filingsToAdd} · upd{' '}
                {validated.preview.diff.filingsToUpdate} · skip{' '}
                {validated.preview.diff.filingsToSkip}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] p-3 text-xs space-y-1">
            <p className="font-bold text-[var(--ink)]">Financial reconciliation</p>
            {validated.domain === 'it' ? (
              <p className="text-[var(--muted)]">
                Fees {String(validated.preview.finance.itFees)} · Received{' '}
                {String(validated.preview.finance.itReceived)} · Calculated
                outstanding{' '}
                {String(validated.preview.finance.itCalculatedOutstanding)} ·
                Balance mismatches{' '}
                {String(validated.preview.finance.itBalanceDiscrepancies)}
              </p>
            ) : (
              <p className="text-[var(--muted)]">
                Fees {String(validated.preview.finance.gstFees)} · Interest{' '}
                {String(validated.preview.finance.gstInterest)} · Tax{' '}
                {String(validated.preview.finance.gstTax)} · Calculated total{' '}
                {String(validated.preview.finance.gstCalculatedTotal)} · Total
                mismatches{' '}
                {String(validated.preview.finance.gstTotalDiscrepancies)}
              </p>
            )}
          </div>

          {validated.preview.unknownColumns.length > 0 && (
            <p className="text-xs text-[var(--muted)]">
              Unknown / unmapped columns:{' '}
              {validated.preview.unknownColumns.join(', ')}
            </p>
          )}

          <div className="rounded-xl border border-[var(--line)] p-3 text-xs">
            <p className="font-bold text-[var(--ink)] mb-1">
              Anonymized samples (no passwords)
            </p>
            <ul className="space-y-1 text-[var(--muted)]">
              {validated.preview.samples.map((s, i) => (
                <li key={i}>
                  {validated.domain === 'it'
                    ? `${String(s.nameMasked)} · pan ${String(s.panFingerprint)} · ${String(s.filingCount)} filings`
                    : `${String(s.companyNameMasked)} · id ${String(s.userIdFingerprint)} · ${String(s.filingCount)} filings${s.hasPassword ? ' · password present' : ''}`}
                </li>
              ))}
            </ul>
          </div>

          {step === 'review' && (
            <div className="max-h-40 overflow-y-auto text-xs space-y-1 border border-[var(--line)] rounded-xl p-3">
              {validated.issues.length === 0 && (
                <p className="text-[var(--muted)]">No issues listed.</p>
              )}
              {validated.issues.map((iss, i) => (
                <p
                  key={i}
                  className={
                    iss.level === 'error'
                      ? 'text-[var(--danger)]'
                      : 'text-[var(--muted)]'
                  }
                >
                  [{iss.level}] {iss.row != null ? `row ${iss.row}: ` : ''}
                  {iss.message}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
              onClick={() => setStep('map')}
            >
              Back to mapping
            </button>
            {step === 'preview' && (
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-bold border border-[var(--navy-900)] text-[var(--navy-900)] cursor-pointer"
                onClick={() => setStep('review')}
              >
                Review errors & duplicates
              </button>
            )}
            <button
              type="button"
              disabled={!validated.canCommit}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer disabled:opacity-50"
              onClick={() => setStep('confirm')}
            >
              Continue to confirm
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && validated && (
        <div className="space-y-3">
          <ul className="text-xs text-[var(--muted)] list-disc pl-5 space-y-1">
            {validated.policyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-sm text-[var(--ink)]">
            About to import{' '}
            <strong>
              {validated.domain === 'it'
                ? validated.preview.validClientCount
                : validated.preview.validCompanyCount}
            </strong>{' '}
            records ({validated.preview.validFilingCount} filings) with mode{' '}
            <strong>{mode}</strong> / conflict <strong>{onConflict}</strong>.
          </p>
          {mode === 'replace' && (
            <label className="block text-sm">
              Type REPLACE to confirm destructive domain replace
              <input
                className="mt-1 w-full border border-[var(--line)] rounded-xl px-3 py-2"
                value={replaceConfirm}
                onChange={(e) => setReplaceConfirm(e.target.value)}
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            I confirm this import into the shared organization workspace.
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:underline cursor-pointer"
              onClick={() => setStep('review')}
            >
              Back
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !confirmChecked ||
                (mode === 'replace' && replaceConfirm !== 'REPLACE')
              }
              className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              onClick={() => void runCommit()}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Commit import
            </button>
          </div>
        </div>
      )}

      {step === 'done' && report && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Import complete
          </p>
          <ul className="text-xs text-[var(--muted)] space-y-1">
            <li>Created: {report.clientsCreated}</li>
            <li>Updated: {report.clientsUpdated}</li>
            <li>Filings added: {report.filingsAdded}</li>
            <li>Filings updated: {report.filingsUpdated}</li>
            <li>Filings skipped: {report.filingsSkipped}</li>
            {report.backupFile ? <li>Backup: {report.backupFile}</li> : null}
            {report.note ? <li>{report.note}</li> : null}
          </ul>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-bold bg-[var(--navy-900)] text-white cursor-pointer"
            onClick={() => {
              resetAfterDomain();
              setStep('domain');
            }}
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
