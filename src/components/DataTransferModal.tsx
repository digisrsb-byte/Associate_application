import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Download, Loader2, Upload, X } from 'lucide-react';
import type { LedgerState } from '../types/ledger.ts';
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
import {
  checkMobileSummary,
  checkYearSummary,
  detectSheets,
  downloadCheckCsv,
  downloadIssuesCsv,
  parseImport,
  parseReviewNeeded,
  type DetectedSheets,
  type ImportClient,
  type ImportPreview,
} from '../utils/excelImport.ts';
import {
  detectGstSheets,
  parseGstAllData,
  type GstDetectedSheets,
  type GstImportPreview,
} from '../utils/gstExcelImport.ts';
import type ExcelJS from 'exceljs';
import type { MainSection } from '../types/ledger.ts';

type Tab = 'export' | 'import';
type Domain = MainSection;

type ImportOpts = {
  allData: boolean;
  clientSummary: boolean;
  mobileSummary: boolean;
  yearSummary: boolean;
  reviewNeeded: boolean;
};

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

  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ExcelJS.Workbook | null>(null);
  const [detected, setDetected] = useState<DetectedSheets | null>(null);
  const [gstDetected, setGstDetected] = useState<GstDetectedSheets | null>(null);
  const [importOpts, setImportOpts] = useState<ImportOpts>({
    allData: false,
    clientSummary: false,
    mobileSummary: false,
    yearSummary: false,
    reviewNeeded: false,
  });
  const [gstImportAllData, setGstImportAllData] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [gstPreview, setGstPreview] = useState<GstImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [onConflict, setOnConflict] = useState<'update' | 'skip'>('update');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    clientsCreated: number;
    clientsUpdated: number;
    filingsAdded: number;
    filingsUpdated: number;
    filingsSkipped: number;
    backupFile: string;
    invalidPanCount?: number;
    invalidPanRows?: Array<{ pan: string; name: string; reason: string }>;
    note?: string;
  } | null>(null);
  const [checkResults, setCheckResults] = useState<{
    mobile?: ReturnType<typeof checkMobileSummary>;
    year?: ReturnType<typeof checkYearSummary>;
    review?: ReturnType<typeof parseReviewNeeded>;
  } | null>(null);
  const [openReview, setOpenReview] = useState<Record<number, boolean>>({});

  const filingCount = useMemo(() => countFilings(ledger), [ledger]);
  const gstFilingCount = useMemo(() => countGstFilings(ledger), [ledger]);
  const years = ledger.assessmentYears;
  const firstAy = years[0] || '—';
  const lastAy = years[years.length - 1] || '—';
  const gstMonths = ledger.gstMonths;
  const firstGstMonth = gstMonths[0] || '—';
  const lastGstMonth = gstMonths[gstMonths.length - 1] || '—';

  const existingPans = useMemo(
    () => new Set(ledger.clients.map((c) => c.pan.toUpperCase())),
    [ledger.clients]
  );
  const existingUserIds = useMemo(
    () => new Set(ledger.gstClients.map((c) => c.userId.toLowerCase())),
    [ledger.gstClients]
  );

  const previewStats = useMemo(() => {
    if (!preview) return null;
    let newC = 0;
    let existingC = 0;
    let addF = 0;
    let updateF = 0;
    let skipF = 0;
    for (const c of preview.clients) {
      const exists = existingPans.has(c.pan.toUpperCase());
      if (exists) existingC += 1;
      else newC += 1;
      const app = ledger.clients.find(
        (x) => x.pan.toUpperCase() === c.pan.toUpperCase()
      );
      for (const ay of Object.keys(c.filings)) {
        if (!app?.filings?.[ay]) addF += 1;
        else if (onConflict === 'update') updateF += 1;
        else skipF += 1;
      }
    }
    return { newC, existingC, addF, updateF, skipF };
  }, [preview, existingPans, ledger.clients, onConflict]);

  const gstPreviewStats = useMemo(() => {
    if (!gstPreview) return null;
    let newC = 0;
    let existingC = 0;
    let addF = 0;
    let updateF = 0;
    let skipF = 0;
    for (const c of gstPreview.companies) {
      const exists = existingUserIds.has(c.userId.toLowerCase());
      if (exists) existingC += 1;
      else newC += 1;
      const app = ledger.gstClients.find(
        (x) => x.userId.toLowerCase() === c.userId.toLowerCase()
      );
      for (const m of Object.keys(c.filings)) {
        if (!app?.filings?.[m]) addF += 1;
        else if (onConflict === 'update') updateF += 1;
        else skipF += 1;
      }
    }
    return { newC, existingC, addF, updateF, skipF };
  }, [gstPreview, existingUserIds, ledger.gstClients, onConflict]);

  useEffect(() => {
    if (!open) return;
    setTab('export');
    setDomain(initialDomain);
    setExportError(null);
    setExportNote(null);
    setFile(null);
    setWorkbook(null);
    setDetected(null);
    setGstDetected(null);
    setPreview(null);
    setGstPreview(null);
    setParseError(null);
    setImportReport(null);
    setCheckResults(null);
    setMode('merge');
    setOnConflict('update');
    setReplaceConfirm('');
  }, [open]);

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

  const runDetectAndPreview = useCallback(
    async (f: File, opts: ImportOpts, wb?: ExcelJS.Workbook) => {
      setParseError(null);
      try {
        let workbookLocal = wb;
        let sheets = detected;
        if (!workbookLocal) {
          const det = await detectSheets(f);
          workbookLocal = det.workbook;
          sheets = det.sheets;
          setWorkbook(det.workbook);
          setDetected(det.sheets);
          const nextOpts: ImportOpts = {
            allData: !!det.sheets.find((s) => s.name === 'All Data')?.present,
            clientSummary: !!det.sheets.find((s) => s.name === 'Client Summary')
              ?.present,
            mobileSummary: !!det.sheets.find((s) => s.name === 'Mobile Summary')
              ?.present,
            yearSummary: !!det.sheets.find((s) => s.name === 'Year Summary')
              ?.present,
            reviewNeeded: !!det.sheets.find((s) => s.name === 'Review Needed')
              ?.present,
          };
          setImportOpts(nextOpts);
          opts = nextOpts;
        }
        void sheets;
        if (opts.allData || opts.clientSummary) {
          const prev = await parseImport(
            f,
            { allData: opts.allData, clientSummary: opts.clientSummary },
            workbookLocal
          );
          setPreview(prev);
        } else {
          setPreview(null);
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to read file.');
        setPreview(null);
      }
    },
    [detected]
  );

  const onFileChosen = async (f: File | null) => {
    setFile(f);
    setWorkbook(null);
    setDetected(null);
    setGstDetected(null);
    setPreview(null);
    setGstPreview(null);
    setImportReport(null);
    setCheckResults(null);
    setParseError(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      setParseError('Please choose an .xlsx Excel file.');
      return;
    }
    if (domain === 'gst') {
      try {
        const det = await detectGstSheets(f);
        setWorkbook(det.workbook);
        setGstDetected(det.sheets);
        const hasAllData = !!det.sheets.find((s) => s.name === 'All Data');
        setGstImportAllData(hasAllData);
        if (hasAllData) {
          setGstPreview(parseGstAllData(det.workbook));
        }
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : 'Failed to read GST Excel.'
        );
      }
      return;
    }
    await runDetectAndPreview(f, importOpts);
  };

  const toggleOpt = async (key: keyof ImportOpts) => {
    if (!file || !detected) return;
    const sheet = detected.find(
      (s) =>
        (key === 'allData' && s.name === 'All Data') ||
        (key === 'clientSummary' && s.name === 'Client Summary') ||
        (key === 'mobileSummary' && s.name === 'Mobile Summary') ||
        (key === 'yearSummary' && s.name === 'Year Summary') ||
        (key === 'reviewNeeded' && s.name === 'Review Needed')
    );
    if (!sheet?.present) return;
    const next = { ...importOpts, [key]: !importOpts[key] };
    setImportOpts(next);
    if (key === 'allData' || key === 'clientSummary') {
      await runDetectAndPreview(file, next, workbook || undefined);
    }
  };

  const runChecks = (wb: ExcelJS.Workbook, updatedLedger: LedgerState) => {
    const results: typeof checkResults = {};
    if (importOpts.mobileSummary) {
      results.mobile = checkMobileSummary(wb, updatedLedger);
    }
    if (importOpts.yearSummary) {
      results.year = checkYearSummary(wb, updatedLedger);
    }
    if (importOpts.reviewNeeded) {
      results.review = parseReviewNeeded(wb);
    }
    setCheckResults(results);
  };

  const handleImport = async () => {
    if (!file || !workbook) return;
    if (mode === 'replace' && replaceConfirm !== 'REPLACE') return;
    setImporting(true);
    setParseError(null);
    setImportReport(null);
    try {
      if (domain === 'gst') {
        const prev = gstPreview || parseGstAllData(workbook);
        if (!gstPreview) setGstPreview(prev);
        if (!gstImportAllData || prev.companies.length === 0) {
          setParseError('No GST companies found to import from All Data.');
          setImporting(false);
          return;
        }
        const res = await fetch('/api/import/gst', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            onConflict,
            companies: prev.companies,
          }),
        });
        const rawText = await res.text();
        let data: {
          error?: string;
          ledger?: LedgerState;
          report?: {
            clientsCreated: number;
            clientsUpdated: number;
            filingsAdded: number;
            filingsUpdated: number;
            filingsSkipped: number;
            backupFile: string;
          };
        } = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          throw new Error(
            rawText?.slice(0, 160) || 'Import failed (invalid server response).'
          );
        }
        if (!res.ok) throw new Error(data.error || 'GST import failed.');
        if (data.ledger) {
          onImported(data.ledger);
        }
        if (data.report) setImportReport(data.report);
        setImporting(false);
        return;
      }

      let clients: ImportClient[] = [];
      if (importOpts.allData || importOpts.clientSummary) {
        const prev =
          preview ||
          (await parseImport(
            file,
            {
              allData: importOpts.allData,
              clientSummary: importOpts.clientSummary,
            },
            workbook
          ));
        clients = prev.clients;
        if (!preview) setPreview(prev);
      }

      let updatedLedger = ledger;
      if (clients.length > 0) {
        const res = await fetch('/api/import/it', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode,
            onConflict,
            clients,
          }),
        });
        const rawText = await res.text();
        let data: {
          error?: string;
          ledger?: LedgerState;
          report?: {
            clientsCreated: number;
            clientsUpdated: number;
            filingsAdded: number;
            filingsUpdated: number;
            filingsSkipped: number;
            backupFile: string;
          };
        } = {};
        try {
          data = rawText ? (JSON.parse(rawText) as typeof data) : {};
        } catch {
          throw new Error(
            res.ok
              ? 'Server returned an empty or invalid response. Restart the TaxLedger server (npm run dev) and try again.'
              : `Import failed (HTTP ${res.status}). Restart the TaxLedger server if you just added this feature.`
          );
        }
        if (!res.ok) {
          throw new Error(data.error || `Import failed (HTTP ${res.status}).`);
        }
        if (!data.ledger || !data.report) {
          throw new Error(
            'Import response was incomplete. Restart the TaxLedger server (npm run dev) and try again.'
          );
        }
        setImportReport(data.report);
        updatedLedger = data.ledger;
        onImported(data.ledger);
      }

      runChecks(workbook, updatedLedger);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const writingSelected =
    domain === 'gst'
      ? gstImportAllData
      : importOpts.allData || importOpts.clientSummary;
  const checkOnlySelected =
    domain === 'it' &&
    (importOpts.mobileSummary ||
      importOpts.yearSummary ||
      importOpts.reviewNeeded);
  const canImport =
    !!file &&
    !!workbook &&
    (domain === 'gst'
      ? !!gstDetected && writingSelected
      : !!detected && (writingSelected || checkOnlySelected)) &&
    !(mode === 'replace' && replaceConfirm !== 'REPLACE') &&
    !importing;

  if (!open) return null;

  const optionCard = (
    key: keyof ImportOpts,
    title: string,
    desc: string,
    badge: 'Updates data' | 'Check only' | 'View only',
    sheetName: string
  ) => {
    const det = detected?.find((s) => s.name === sheetName);
    const present = !!det?.present;
    return (
      <label
        key={key}
        className={`flex gap-3 items-start p-3 rounded-2xl border ${
          present
            ? 'bg-[var(--card)] border-[var(--line)]'
            : 'bg-[var(--frost-100)] border-[var(--line)] opacity-70'
        }`}
      >
        <input
          type="checkbox"
          className="mt-1 accent-[var(--blue-500)]"
          checked={importOpts[key]}
          disabled={!present}
          onChange={() => void toggleOpt(key)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[var(--ink)]">{title}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                badge === 'Updates data'
                  ? 'bg-[var(--navy-900)] text-white'
                  : 'bg-[var(--frost-100)] text-[var(--muted)]'
              }`}
            >
              {badge}
            </span>
            {!present && (
              <span className="text-[10px] text-[var(--danger)] font-medium">
                Sheet not found
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] mt-0.5">{desc}</p>
          {present && (
            <p className="text-[11px] text-[var(--muted)] mt-0.5">
              {det?.rowCount ?? 0} data rows
            </p>
          )}
        </div>
      </label>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-[var(--card)] rounded-2xl shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <h2 id={titleId} className="text-lg font-bold text-[var(--ink)]">
            Import / Export
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--frost-100)] cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          <div className="inline-flex bg-[var(--frost-100)] rounded-full p-1">
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
                  setDomain(id);
                  setFile(null);
                  setWorkbook(null);
                  setDetected(null);
                  setGstDetected(null);
                  setPreview(null);
                  setGstPreview(null);
                  setParseError(null);
                  setImportReport(null);
                }}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer ${
                  domain === id
                    ? 'bg-[var(--navy-900)] text-white shadow-sm'
                    : 'text-[var(--muted)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {(['export', 'import'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-xs font-bold rounded-xl cursor-pointer ${
                  tab === t
                    ? 'bg-[var(--navy-900)] text-white'
                    : 'text-[var(--muted)] hover:bg-[var(--frost-100)]'
                }`}
              >
                {t === 'export' ? 'Export' : 'Import'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
                        className="flex items-center gap-2 text-sm text-[var(--ink)]"
                      >
                        <input
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
                        className="flex items-center gap-2 text-sm text-[var(--ink)]"
                      >
                        <input
                          type="checkbox"
                          className="accent-[var(--blue-500)]"
                          checked={exportFlags[key]}
                          onChange={() =>
                            setExportFlags((f) => ({ ...f, [key]: !f[key] }))
                          }
                        />
                        {label}
                      </label>
                    ))}
                <p className="text-xs text-[var(--muted)]">
                  Notes sheet is always included
                </p>
              </div>
              {exportNote && (
                <p className="text-xs text-[var(--blue-500)]">{exportNote}</p>
              )}
              {exportError && (
                <p className="text-xs text-[var(--danger)]">{exportError}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExport()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-50"
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
            <>
              <div
                className="border-2 border-dashed border-[var(--line)] rounded-2xl p-6 text-center bg-[var(--frost-100)]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void onFileChosen(f);
                }}
              >
                <Upload className="w-6 h-6 mx-auto text-[var(--blue-500)] mb-2" />
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Drop .xlsx here or choose a file
                </p>
                <label className="inline-block mt-3 px-4 py-2 text-xs font-bold bg-[var(--card)] border border-[var(--navy-900)] rounded-xl cursor-pointer">
                  Choose .xlsx file
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) =>
                      void onFileChosen(e.target.files?.[0] || null)
                    }
                  />
                </label>
                {file && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {parseError && (
                <p className="text-xs text-[var(--danger)] bg-[var(--danger-15)] rounded-xl px-3 py-2">
                  {parseError}
                </p>
              )}

              {domain === 'gst' && gstDetected && (
                <div className="space-y-2">
                  <label
                    className={`flex gap-3 items-start p-3 rounded-2xl border ${
                      gstDetected.some((s) => s.name === 'All Data')
                        ? 'bg-[var(--card)] border-[var(--line)]'
                        : 'bg-[var(--frost-100)] border-[var(--line)] opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 accent-[var(--blue-500)]"
                      checked={gstImportAllData}
                      disabled={!gstDetected.some((s) => s.name === 'All Data')}
                      onChange={() => setGstImportAllData((v) => !v)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--ink)]">
                          All Data
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--navy-900)] text-white">
                          Updates data
                        </span>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        Writes GST company filings by User ID.
                      </p>
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">
                        Sheets found:{' '}
                        {gstDetected.map((s) => `${s.name} (${s.rows})`).join(' · ')}
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {domain === 'gst' && gstPreview && gstPreviewStats && (
                <div className="bg-[var(--frost-100)] rounded-2xl p-3 text-xs text-[var(--ink)] space-y-1">
                  <p className="font-semibold">Preview</p>
                  <p>
                    {gstPreviewStats.newC} new companies ·{' '}
                    {gstPreviewStats.existingC} existing ·{' '}
                    {gstPreviewStats.addF} filings to add ·{' '}
                    {gstPreviewStats.updateF} to update ·{' '}
                    {gstPreviewStats.skipF} to skip
                  </p>
                  {gstPreview.issues.length > 0 && (
                    <p className="text-[var(--danger)]">
                      {gstPreview.issues.length} parse note(s)
                    </p>
                  )}
                </div>
              )}

              {domain === 'it' && detected && (
                <div className="space-y-2">
                  {optionCard(
                    'allData',
                    'All Data',
                    'Writes filings and client info found in rows.',
                    'Updates data',
                    'All Data'
                  )}
                  {optionCard(
                    'clientSummary',
                    'Client Summary',
                    'Writes latest name, mobile, other mobiles, name variants.',
                    'Updates data',
                    'Client Summary'
                  )}
                  {optionCard(
                    'mobileSummary',
                    'Mobile Summary',
                    'Compares mobile totals with the app — no data changes.',
                    'Check only',
                    'Mobile Summary'
                  )}
                  {optionCard(
                    'yearSummary',
                    'Year Summary',
                    'Compares year-wise totals with the app — no data changes.',
                    'Check only',
                    'Year Summary'
                  )}
                  {optionCard(
                    'reviewNeeded',
                    'Review Needed',
                    'Shows data-quality sections from the workbook.',
                    'View only',
                    'Review Needed'
                  )}
                </div>
              )}

              {domain === 'it' && preview && writingSelected && previewStats && (
                <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 space-y-2">
                  <h3 className="text-sm font-bold text-[var(--ink)]">Preview</h3>
                  <p className="text-xs text-[var(--muted)]">
                    Rows read {preview.stats.rowsRead} · skipped{' '}
                    {preview.stats.rowsSkipped} · clients in file{' '}
                    {preview.stats.uniqueClients} ({previewStats.newC} new,{' '}
                    {previewStats.existingC} existing)
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Filings: add {previewStats.addF} · update{' '}
                    {previewStats.updateF} · skip {previewStats.skipF}
                    {preview.stats.duplicateClientYearRows > 0 &&
                      ` · ${preview.stats.duplicateClientYearRows} duplicate client-year rows merged`}
                  </p>
                  {preview.stats.years.length > 0 && (
                    <p className="text-xs text-[var(--muted)]">
                      Years: {preview.stats.years.join(', ')}
                    </p>
                  )}
                  {preview.issues.length > 0 && (
                    <div className="space-y-1">
                      {preview.issues.slice(0, 8).map((iss, i) => (
                        <p key={i} className="text-[11px] text-[var(--muted)]">
                          [{iss.level}] {iss.message}
                          {iss.pan ? ` (${iss.pan}` : ''}
                          {iss.ay ? ` ${iss.ay}` : ''}
                          {iss.pan ? ')' : ''}
                        </p>
                      ))}
                      <button
                        type="button"
                        className="text-[11px] font-medium text-[var(--blue-500)] hover:underline cursor-pointer"
                        onClick={() => downloadIssuesCsv(preview.issues)}
                      >
                        Download all issues (CSV)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {writingSelected && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={mode === 'merge'}
                        onChange={() => setMode('merge')}
                        className="mt-1 accent-[var(--blue-500)]"
                      />
                      Merge into existing data (recommended)
                    </label>
                    <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={mode === 'replace'}
                        onChange={() => setMode('replace')}
                        className="mt-1 accent-[var(--blue-500)]"
                      />
                      Replace all {domain === 'gst' ? 'GST' : 'IT'} data
                    </label>
                  </div>
                  {mode === 'replace' && (
                    <div>
                      <p className="text-xs text-[var(--danger)] mb-1">
                        Type REPLACE to confirm.{' '}
                        {domain === 'gst'
                          ? 'GST companies whose User ID is not in the file will be removed. IT data is never modified.'
                          : 'IT clients whose PAN is not in the file will be removed. GST data is never modified.'}
                      </p>
                      <input
                        value={replaceConfirm}
                        onChange={(e) => setReplaceConfirm(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-[var(--line)] rounded-xl"
                        placeholder="REPLACE"
                      />
                    </div>
                  )}
                  {mode === 'merge' && (
                    <label className="block text-xs text-[var(--muted)]">
                      If a filing already exists:
                      <select
                        value={onConflict}
                        onChange={(e) =>
                          setOnConflict(e.target.value as 'update' | 'skip')
                        }
                        className="mt-1 w-full px-3 py-2 text-xs border border-[var(--line)] rounded-xl text-[var(--ink)]"
                      >
                        <option value="update">
                          Update from Excel (default)
                        </option>
                        <option value="skip">Keep existing</option>
                      </select>
                    </label>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={!canImport}
                onClick={() => void handleImport()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {writingSelected ? 'Import' : 'Run checks'}
              </button>

              {importReport && (
                <div className="bg-[var(--frost-100)] border border-[var(--navy-900)] rounded-2xl p-4 text-xs text-[var(--ink)] space-y-1">
                  <p className="font-bold">Import complete</p>
                  <p>
                    Created {importReport.clientsCreated} · updated{' '}
                    {importReport.clientsUpdated} · filings added{' '}
                    {importReport.filingsAdded} · updated{' '}
                    {importReport.filingsUpdated} · skipped{' '}
                    {importReport.filingsSkipped}
                  </p>
                  <p>Backup: {importReport.backupFile}</p>
                  {typeof importReport.invalidPanCount === 'number' &&
                    importReport.invalidPanCount > 0 && (
                      <div className="mt-2 space-y-1 text-[var(--danger)]">
                        <p className="font-semibold">
                          Invalid PAN rows skipped:{' '}
                          {importReport.invalidPanCount} (existing ledger data
                          kept)
                        </p>
                        <ul className="max-h-28 overflow-auto list-disc pl-4">
                          {(importReport.invalidPanRows || [])
                            .slice(0, 20)
                            .map((row, i) => (
                              <li key={`${row.pan}-${i}`}>
                                {row.pan || '(empty)'}
                                {row.name ? ` · ${row.name}` : ''}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  {importReport.note && (
                    <p className="text-[var(--muted)]">{importReport.note}</p>
                  )}
                </div>
              )}

              {checkResults?.year?.error && (
                <p className="text-xs text-[var(--warning)]">{checkResults.year.error}</p>
              )}
              {checkResults?.mobile && (
                <CheckTable
                  title="Mobile Summary check"
                  rows={[
                    ...checkResults.mobile.mismatches.map((m) => ({
                      key: m.mobile,
                      field: m.field,
                      file: m.file,
                      app: m.app,
                    })),
                    ...checkResults.mobile.missingInApp.map((m) => ({
                      key: m,
                      field: 'missing in app',
                      file: m,
                      app: '—',
                    })),
                    ...checkResults.mobile.missingInFile.map((m) => ({
                      key: m,
                      field: 'missing in file',
                      file: '—',
                      app: m,
                    })),
                  ]}
                  filename="mobile-summary-check.csv"
                />
              )}
              {checkResults?.year && !checkResults.year.error && (
                <CheckTable
                  title="Year Summary check"
                  rows={checkResults.year.mismatches.map((m) => ({
                    key: m.ay,
                    field: m.field,
                    file: m.file,
                    app: m.app,
                  }))}
                  filename="year-summary-check.csv"
                />
              )}
              {checkResults?.review && checkResults.review.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-[var(--ink)]">
                    Review Needed
                  </h3>
                  {checkResults.review.map((sec, i) => (
                    <div
                      key={i}
                      className="border border-[var(--line)] rounded-2xl overflow-hidden"
                    >
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-[var(--ink)] bg-[var(--frost-100)] cursor-pointer"
                        onClick={() =>
                          setOpenReview((o) => ({ ...o, [i]: !o[i] }))
                        }
                      >
                        {sec.title} ({sec.rows.length})
                      </button>
                      {openReview[i] && (
                        <div className="px-3 py-2 max-h-48 overflow-y-auto text-[11px] text-[var(--muted)] space-y-1">
                          {sec.rows.length === 0 ? (
                            <p>None</p>
                          ) : (
                            sec.rows.slice(0, 100).map((r, ri) => (
                              <p key={ri}>{r.filter(Boolean).join(' · ')}</p>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckTable({
  title,
  rows,
  filename,
}: {
  title: string;
  rows: Array<{
    key: string;
    field: string;
    file: string | number;
    app: string | number;
  }>;
  filename: string;
}) {
  const limited = rows.slice(0, 100);
  return (
    <div className="border border-[var(--line)] rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--ink)]">
          {title}{' '}
          <span className="font-normal text-[var(--muted)]">
            ({rows.length === 0 ? 'no differences' : `${rows.length} differences`}
            )
          </span>
        </h3>
        {rows.length > 0 && (
          <button
            type="button"
            className="text-[11px] text-[var(--blue-500)] hover:underline cursor-pointer"
            onClick={() =>
              downloadCheckCsv(
                rows.map((r) => ({
                  key: r.key,
                  field: r.field,
                  file: r.file,
                  app: r.app,
                })),
                filename
              )
            }
          >
            Download CSV
          </button>
        )}
      </div>
      {limited.length > 0 && (
        <div className="max-h-40 overflow-y-auto text-[11px] space-y-1">
          {limited.map((r, i) => (
            <p key={i} className="text-[var(--muted)]">
              {r.key} · {r.field}: file={String(r.file)} app={String(r.app)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
