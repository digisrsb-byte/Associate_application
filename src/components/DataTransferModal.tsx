import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import type { LedgerState, MainSection } from '../types/ledger.ts';
import {
  buildImportTemplateBlob,
  buildWorkbookBlob,
  downloadBlob,
  exportFilename,
  type ExportSheetFlags,
} from '../utils/excelExport.ts';
import {
  buildGstImportTemplateBlob,
  buildGstWorkbookBlob,
  gstExportFilename,
  type GstExportSheetFlags,
} from '../utils/gstExcelExport.ts';
import { ExcelImportWizard } from './ExcelImportWizard.tsx';

type Tab = 'export' | 'import';
type Domain = MainSection;

interface DataTransferModalProps {
  open: boolean;
  onClose: () => void;
  ledger: LedgerState;
  onImported: (ledger: LedgerState) => void;
  initialDomain?: Domain;
}

function countFilings(ledger: LedgerState): number {
  let n = 0;
  for (const c of ledger.clients) n += Object.keys(c.filings || {}).length;
  return n;
}

function countGstFilings(ledger: LedgerState): number {
  let n = 0;
  for (const c of ledger.gstClients) n += Object.keys(c.filings || {}).length;
  return n;
}

export function DataTransferModal({
  open,
  onClose,
  ledger,
  onImported,
  initialDomain = 'it',
}: DataTransferModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<Tab>('export');
  const [domain, setDomain] = useState<Domain>(initialDomain);

  const [exportFlags, setExportFlags] = useState<ExportSheetFlags>({
    yearSummary: true,
    allData: true,
    clientSummary: true,
    mobileSummary: true,
    reviewNeeded: true,
  });
  const [gstExportFlags, setGstExportFlags] = useState<GstExportSheetFlags>({
    monthSummary: true,
    allData: true,
    sheetView: true,
    companySummary: true,
  });
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const filingCount = useMemo(() => countFilings(ledger), [ledger]);
  const gstFilingCount = useMemo(() => countGstFilings(ledger), [ledger]);
  const years = ledger.assessmentYears;
  const firstAy = years[0] || '—';
  const lastAy = years[years.length - 1] || '—';
  const gstMonths = ledger.gstMonths;
  const firstGstMonth = gstMonths[0] || '—';
  const lastGstMonth = gstMonths[gstMonths.length - 1] || '—';

  useEffect(() => {
    if (!open) return;
    setTab('export');
    setDomain(initialDomain);
    setExportError(null);
    setExportNote(null);
  }, [open, initialDomain]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const root = dialogRef.current;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    first?.focus();
    const onTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusables.length === 0) return;
      const list = [...focusables];
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault();
          list[list.length - 1]?.focus();
        }
      } else if (i === list.length - 1) {
        e.preventDefault();
        list[0]?.focus();
      }
    };
    root.addEventListener('keydown', onTabKey);
    return () => root.removeEventListener('keydown', onTabKey);
  }, [open, tab]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    setExportNote(null);
    try {
      if (domain === 'gst') {
        const blob = await buildGstWorkbookBlob(ledger, gstExportFlags);
        downloadBlob(blob, gstExportFilename(ledger));
      } else {
        const { blob, forcedSheets } = await buildWorkbookBlob(
          ledger,
          exportFlags
        );
        if (forcedSheets.length) {
          setExportNote(
            `Also included required sheet(s): ${forcedSheets.join(', ')} (referenced by selected summaries).`
          );
        }
        downloadBlob(blob, exportFilename(ledger));
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleTemplate = async () => {
    setExporting(true);
    setExportError(null);
    try {
      if (domain === 'gst') {
        const blob = await buildGstImportTemplateBlob(ledger.gstMonths);
        downloadBlob(blob, 'GST_Filing_Master_Report_Import_Template.xlsx');
      } else {
        const blob = await buildImportTemplateBlob(ledger.assessmentYears);
        downloadBlob(blob, 'Filing_Master_Report_Import_Template.xlsx');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Template failed.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 border-0 bg-transparent p-0 cursor-pointer"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-3xl max-h-[min(94dvh,100%)] sm:max-h-[90vh] overflow-hidden flex flex-col bg-[var(--card)] rounded-t-3xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] shrink-0">
          <h2 id={titleId} className="text-lg font-bold text-[var(--ink)]">
            Import / Export
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-[var(--frost-100)] cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-5 pt-3 shrink-0">
          <div className="inline-flex w-full sm:w-auto bg-[var(--frost-100)] rounded-full p-1">
            {(
              [
                ['it', 'Income Tax'],
                ['gst', 'GST'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDomain(id)}
                className={`flex-1 sm:flex-none min-h-10 px-3.5 py-2 rounded-full text-[12px] font-semibold cursor-pointer ${
                  domain === id
                    ? 'bg-[var(--navy-900)] text-white shadow-sm'
                    : 'text-[var(--muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:flex gap-1 w-full sm:w-auto sm:ml-auto">
            {(['export', 'import'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`min-h-11 px-4 py-2 text-xs font-bold rounded-xl cursor-pointer ${
                  tab === t
                    ? 'bg-[var(--navy-900)] text-white'
                    : 'text-[var(--muted)] hover:bg-[var(--frost-100)] border border-[var(--line)] sm:border-0'
                }`}
              >
                {t === 'export' ? 'Export' : 'Import'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 min-h-0">
          {tab === 'export' && (
            <>
              <p className="text-xs text-[var(--muted)]">
                {domain === 'gst'
                  ? `${ledger.gstClients.length} companies · ${gstFilingCount} filings · ${firstGstMonth}–${lastGstMonth}`
                  : `${ledger.clients.length} clients · ${filingCount} filings · AY ${firstAy}–${lastAy}`}
              </p>
              <div className="space-y-2">
                {domain === 'gst'
                  ? (
                      [
                        ['monthSummary', 'Month Summary'],
                        ['allData', 'All Data'],
                        ['sheetView', 'Sheet View'],
                        ['companySummary', 'Company Summary'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        htmlFor={`${titleId}-gst-exp-${key}`}
                        className="flex items-center gap-2 text-sm text-[var(--ink)]"
                      >
                        <input
                          id={`${titleId}-gst-exp-${key}`}
                          type="checkbox"
                          className="accent-[var(--blue-500)]"
                          checked={gstExportFlags[key]}
                          onChange={() =>
                            setGstExportFlags((f) => ({
                              ...f,
                              [key]: !f[key],
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))
                  : (
                      [
                        ['yearSummary', 'Year Summary'],
                        ['allData', 'All Data'],
                        ['clientSummary', 'Client Summary'],
                        ['mobileSummary', 'Mobile Summary'],
                        ['reviewNeeded', 'Review Needed'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        htmlFor={`${titleId}-exp-${key}`}
                        className="flex items-center gap-2 text-sm text-[var(--ink)]"
                      >
                        <input
                          id={`${titleId}-exp-${key}`}
                          type="checkbox"
                          className="accent-[var(--blue-500)]"
                          checked={exportFlags[key]}
                          onChange={() =>
                            setExportFlags((f) => ({
                              ...f,
                              [key]: !f[key],
                            }))
                          }
                        />
                        {label}
                      </label>
                    ))}
              </div>
              {exportNote && (
                <p className="text-xs text-[var(--muted)]">{exportNote}</p>
              )}
              {exportError && (
                <p className="text-xs text-[var(--danger)]">{exportError}</p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExport()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--navy-900)] text-white cursor-pointer disabled:opacity-50"
                >
                  {exporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download Excel (.xlsx)
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleTemplate()}
                  className="text-xs font-medium text-[var(--blue-500)] hover:underline cursor-pointer"
                >
                  Download blank import template
                </button>
              </div>
            </>
          )}

          {tab === 'import' && (
            <ExcelImportWizard
              initialDomain={domain}
              onImported={onImported}
            />
          )}
        </div>
      </div>
    </div>
  );
}
