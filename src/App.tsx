import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Search, Table2 } from 'lucide-react';
import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
  LedgerState,
  MainSection,
} from './types/ledger.ts';
import {
  computeClientTotals,
  computeGstClientTotals,
  downloadTextFile,
  getCurrentGstFinancialYearLabel,
  getMonthsForGstFinancialYear,
  getNextAssessmentYear,
  getNextGstMonth,
  normalizeAssessmentYearLabel,
  normalizeGstMonthLabel,
  sortAssessmentYears,
  sortGstMonths,
} from './utils/ledgerUtils.ts';
import {
  exportAllDataExcelCsv,
  exportClientSummaryExcelCsv,
  exportContinuousSheetExcelCsv,
  exportGstAllDataExcelCsv,
  exportGstClientSummaryExcelCsv,
  exportGstContinuousSheetExcelCsv,
  exportGstMonthSummaryExcelCsv,
  exportMobileSummaryExcelCsv,
  exportYearSummaryExcelCsv,
} from './utils/csvExport.ts';
import { MobileHeader, Sidebar, type SheetTab } from './components/Sidebar.tsx';
import { TopSummaryCards } from './components/TopSummaryCards.tsx';
import { OverallDashboard } from './components/OverallDashboard.tsx';
import { ClientSummaryView } from './components/ClientSummaryView.tsx';
import { MobileSummaryView } from './components/MobileSummaryView.tsx';
import { SimpleClientTable } from './components/SimpleClientTable.tsx';
import { ContinuousSheetTable } from './components/ContinuousSheetTable.tsx';
import { GstSimpleTable } from './components/GstSimpleTable.tsx';
import { GstSheetTable } from './components/GstSheetTable.tsx';
import { GstClientSummaryView } from './components/GstSummaryViews.tsx';
import { ClientModal } from './components/ClientModal.tsx';
import { FilingQuickModal } from './components/FilingQuickModal.tsx';
import { GstCompanyModal } from './components/GstCompanyModal.tsx';
import { GstFilingQuickModal } from './components/GstFilingQuickModal.tsx';
import {
  GstCompanyEditDrawer,
  type GstDrawerMode,
} from './components/GstCompanyEditDrawer.tsx';
import {
  ClientEditDrawer,
  type ItDrawerMode,
} from './components/ClientEditDrawer.tsx';
import { ToastBanner, type ToastMessage } from './components/ToastBanner.tsx';
import { DataTransferModal } from './components/DataTransferModal.tsx';

export default function App() {
  const [ledger, setLedger] = useState<LedgerState>({
    assessmentYears: [],
    clients: [],
    gstMonths: [],
    gstClients: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mainSection, setMainSection] = useState<MainSection>('it');
  const [activeTab, setActiveTab] = useState<SheetTab>('year-summary');
  const [dataViewMode, setDataViewMode] = useState<'simple' | 'sheet'>('simple');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const currentGstFy = useMemo(() => getCurrentGstFinancialYearLabel(), []);

  // IT Modals / Drawer
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [itDrawerClientId, setItDrawerClientId] = useState<string | null>(null);
  const [itDrawerMode, setItDrawerMode] = useState<ItDrawerMode | null>(null);
  const [quickEditTarget, setQuickEditTarget] = useState<{
    client: ClientRecord;
    year: string;
    existing?: FilingRecord;
  } | null>(null);

  // GST Modals / Drawer
  const [gstCompanyModalOpen, setGstCompanyModalOpen] = useState(false);
  const [gstDrawerCompanyId, setGstDrawerCompanyId] = useState<string | null>(null);
  const [gstDrawerMode, setGstDrawerMode] = useState<GstDrawerMode | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);
  const [gstQuickEditTarget, setGstQuickEditTarget] = useState<{
    company: GstClientRecord;
    month: string;
    existing?: GstMonthlyFiling;
  } | null>(null);

  const fetchLedger = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/ledger');
      if (!res.ok) throw new Error('Unable to load records.');
      const data = (await res.json()) as LedgerState;
      setLedger({
        assessmentYears: sortAssessmentYears(data.assessmentYears || []),
        clients: data.clients || [],
        gstMonths: sortGstMonths(data.gstMonths || []),
        gstClients: data.gstClients || [],
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLedger();
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ledger.clients;
    return ledger.clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.pan.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.referenceNumber || '').toLowerCase().includes(q) ||
        (c.remark || '').toLowerCase().includes(q)
    );
  }, [ledger.clients, searchQuery]);

  const filteredGstClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ledger.gstClients;
    return ledger.gstClients.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.userId.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.referenceNumber || '').toLowerCase().includes(q) ||
        (c.remark || '').toLowerCase().includes(q)
    );
  }, [ledger.gstClients, searchQuery]);

  const itTotalsSummary = useMemo(() => {
    let totalReceived = 0;
    let outstandingTotal = 0;
    let totalBilled = 0;
    let totalEntries = 0;

    for (const c of ledger.clients) {
      const t = computeClientTotals(c);
      totalReceived += t.totalReceived;
      outstandingTotal += t.outstandingTotal;
      for (const f of Object.values(c.filings || {})) {
        totalBilled += Number(f.fees) || 0;
        totalEntries += 1;
      }
    }
    return { totalReceived, outstandingTotal, totalBilled, totalEntries };
  }, [ledger.clients]);

  const suggestedNextYear = useMemo(
    () => getNextAssessmentYear(ledger.assessmentYears),
    [ledger.assessmentYears]
  );

  const activeGstFy = currentGstFy;

  const visibleGstMonths = useMemo(
    () => getMonthsForGstFinancialYear(activeGstFy),
    [activeGstFy]
  );

  const gstTotalsSummary = useMemo(() => {
    const monthSet = new Set(visibleGstMonths);
    let totalReceived = 0;
    let outstandingTotal = 0;
    let totalBilled = 0;
    let totalEntries = 0;

    for (const c of ledger.gstClients) {
      const t = computeGstClientTotals(c);
      totalReceived += t.totalReceived;
      outstandingTotal += t.outstandingTotal;
      for (const [month, filing] of Object.entries(c.filings || {})) {
        if (!monthSet.has(month)) continue;
        totalBilled +=
          typeof filing.total === 'number' && Number.isFinite(filing.total)
            ? Math.max(0, filing.total)
            : Math.max(0, Number(filing.fees) || 0) +
              Math.max(0, Number(filing.interest) || 0) +
              Math.max(0, Number(filing.tax) || 0);
        totalEntries += 1;
      }
    }
    return { totalReceived, outstandingTotal, totalBilled, totalEntries };
  }, [ledger.gstClients, visibleGstMonths]);

  const gstOverallTotalsSummary = useMemo(() => {
    let totalReceived = 0;
    let outstandingTotal = 0;
    let totalBilled = 0;
    let totalEntries = 0;

    for (const c of ledger.gstClients) {
      const t = computeGstClientTotals(c);
      totalReceived += t.totalReceived;
      outstandingTotal += t.outstandingTotal;
      totalBilled += t.totalBilled;
      totalEntries += Object.keys(c.filings || {}).length;
    }
    return { totalReceived, outstandingTotal, totalBilled, totalEntries };
  }, [ledger.gstClients]);

  const overallGstMonths = useMemo(
    () =>
      sortGstMonths(
        ledger.gstMonths.length > 0
          ? ledger.gstMonths
          : Array.from(
              new Set(
                ledger.gstClients.flatMap((c) => Object.keys(c.filings || {}))
              )
            )
      ),
    [ledger.gstMonths, ledger.gstClients]
  );

  const suggestedNextMonth = useMemo(
    () => getNextGstMonth(visibleGstMonths.length ? visibleGstMonths : ledger.gstMonths),
    [visibleGstMonths, ledger.gstMonths]
  );

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  };

  // ---------- IT Handlers ----------

  const handleSaveClient = async (payload: {
    id?: string;
    name: string;
    pan: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    initialFiling?: FilingRecord;
  }) => {
    if (payload.id) {
      const res = await fetch(`/api/clients/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          pan: payload.pan,
          password: payload.password,
          phone: payload.phone,
          referenceNumber: payload.referenceNumber,
          remark: payload.remark,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update client.');
      setLedger(data.ledger);
      showToast('success', 'Client details updated.');
    } else {
      const filings: Record<string, FilingRecord> = {};
      if (payload.initialFiling) {
        filings[payload.initialFiling.assessmentYear] = payload.initialFiling;
      }
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          pan: payload.pan,
          password: payload.password,
          phone: payload.phone,
          referenceNumber: payload.referenceNumber,
          remark: payload.remark,
          filings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add client.');
      setLedger(data.ledger);
      showToast('success', 'Client added.');
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete client.');
      setLedger(data.ledger);
      showToast('success', 'Client deleted.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete client.'
      );
      throw err;
    }
  };

  const handleSaveFiling = async (clientId: string, filing: FilingRecord) => {
    const res = await fetch(`/api/clients/${clientId}/filings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filing),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save filing.');
    setLedger(data.ledger);
  };

  const handleDeleteFiling = async (clientId: string, year: string) => {
    const res = await fetch(
      `/api/clients/${clientId}/filings/${encodeURIComponent(year)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove filing.');
    setLedger(data.ledger);
  };

  const handleAddYearColumn = async (rawLabel: string) => {
    const normalized = normalizeAssessmentYearLabel(rawLabel);
    if (!normalized) return;
    const res = await fetch('/api/years', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: normalized }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add year.');
    setLedger(data);
  };

  // ---------- GST Handlers ----------

  const openItClientDrawer = (client: ClientRecord, mode: ItDrawerMode) => {
    setItDrawerClientId(client.id);
    setItDrawerMode(mode);
  };

  const closeItClientDrawer = () => {
    setItDrawerClientId(null);
    setItDrawerMode(null);
  };

  const itDrawerClient = useMemo(() => {
    if (!itDrawerClientId) return null;
    return ledger.clients.find((c) => c.id === itDrawerClientId) ?? null;
  }, [itDrawerClientId, ledger.clients]);

  const openGstCompanyDrawer = (company: GstClientRecord, mode: GstDrawerMode) => {
    setGstDrawerCompanyId(company.id);
    setGstDrawerMode(mode);
  };

  const closeGstCompanyDrawer = () => {
    setGstDrawerCompanyId(null);
    setGstDrawerMode(null);
  };

  const gstDrawerCompany = useMemo(() => {
    if (!gstDrawerCompanyId) return null;
    return ledger.gstClients.find((c) => c.id === gstDrawerCompanyId) ?? null;
  }, [gstDrawerCompanyId, ledger.gstClients]);

  const handleSaveGstCompany = async (payload: {
    id?: string;
    companyName: string;
    userId: string;
    password: string;
    phone: string;
    referenceNumber: string;
    remark: string;
    totalReceived?: number;
    initialFiling?: GstMonthlyFiling;
  }) => {
    if (payload.id) {
      const res = await fetch(`/api/gst/clients/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: payload.companyName,
          userId: payload.userId,
          password: payload.password,
          phone: payload.phone,
          referenceNumber: payload.referenceNumber,
          remark: payload.remark,
          ...(payload.totalReceived !== undefined
            ? { totalReceived: payload.totalReceived }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update GST company.');
      setLedger(data.ledger);
      showToast('success', 'Company details updated.');
    } else {
      const filings: Record<string, GstMonthlyFiling> = {};
      if (payload.initialFiling) {
        filings[payload.initialFiling.month] = payload.initialFiling;
      }
      const res = await fetch('/api/gst/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: payload.companyName,
          userId: payload.userId,
          password: payload.password,
          phone: payload.phone,
          referenceNumber: payload.referenceNumber,
          remark: payload.remark,
          filings,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add GST company.');
      setLedger(data.ledger);
      showToast('success', 'GST company added.');
    }
  };

  const handleDeleteGstCompany = async (companyId: string) => {
    try {
      const res = await fetch(`/api/gst/clients/${companyId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete GST company.');
      setLedger(data.ledger);
      showToast('success', 'Company deleted.');
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to delete GST company.'
      );
      throw err;
    }
  };

  const handleSaveGstFiling = async (companyId: string, filing: GstMonthlyFiling) => {
    const res = await fetch(`/api/gst/clients/${companyId}/filings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filing),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save GST filing.');
    setLedger(data.ledger);
  };

  const handleDeleteGstFiling = async (companyId: string, month: string) => {
    const res = await fetch(
      `/api/gst/clients/${companyId}/filings/${encodeURIComponent(month)}`,
      { method: 'DELETE' }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove GST filing.');
    setLedger(data.ledger);
  };

  const handleAddMonthColumn = async (rawLabel: string) => {
    const normalized = normalizeGstMonthLabel(rawLabel);
    if (!normalized) return;
    const res = await fetch('/api/gst/months', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: normalized }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add month.');
    setLedger(data);
  };

  // ---------- Action & Export Helpers ----------

  const openAddPrimaryModal = () => {
    if (mainSection === 'it') {
      setClientModalOpen(true);
    } else {
      setGstCompanyModalOpen(true);
    }
  };

  const addLabel = mainSection === 'it' ? 'Add Client' : 'Add GST Company';

  const handleSectionChange = (nextSection: MainSection) => {
    setMainSection(nextSection);
    if (nextSection === 'gst' && activeTab === 'mobile-summary') {
      setActiveTab('client-summary');
    }
  };

  const openItAllData = () => {
    setMainSection('it');
    setActiveTab('all-data');
  };

  const openGstAllData = () => {
    setMainSection('gst');
    setActiveTab('all-data');
  };

  const handleExportCsv = () => {
    if (activeTab === 'year-summary') {
      downloadTextFile(
        'overall-it-year-summary.csv',
        exportYearSummaryExcelCsv(ledger.clients, ledger.assessmentYears)
      );
      downloadTextFile(
        'overall-gst-month-summary.csv',
        exportGstMonthSummaryExcelCsv(ledger.gstClients, overallGstMonths)
      );
      return;
    }

    if (mainSection === 'it') {
      if (activeTab === 'client-summary') {
        downloadTextFile(
          'client-summary.csv',
          exportClientSummaryExcelCsv(ledger.clients, ledger.assessmentYears)
        );
        return;
      }
      if (activeTab === 'mobile-summary') {
        downloadTextFile(
          'mobile-summary.csv',
          exportMobileSummaryExcelCsv(ledger.clients, ledger.assessmentYears)
        );
        return;
      }
      if (dataViewMode === 'sheet') {
        downloadTextFile(
          'continuous-sheet.csv',
          exportContinuousSheetExcelCsv(ledger.clients, ledger.assessmentYears)
        );
        return;
      }
      downloadTextFile(
        'all-data.csv',
        exportAllDataExcelCsv(ledger.clients, ledger.assessmentYears)
      );
      return;
    }

    if (activeTab === 'client-summary') {
      downloadTextFile(
        'gst-company-summary.csv',
        exportGstClientSummaryExcelCsv(ledger.gstClients, visibleGstMonths)
      );
      return;
    }
    if (dataViewMode === 'sheet') {
      downloadTextFile(
        'gst-continuous-sheet.csv',
        exportGstContinuousSheetExcelCsv(ledger.gstClients, visibleGstMonths)
      );
      return;
    }
    downloadTextFile(
      'gst-all-data.csv',
      exportGstAllDataExcelCsv(ledger.gstClients, visibleGstMonths)
    );
  };

  const viewHeading =
    activeTab === 'year-summary'
      ? 'Dashboard'
      : activeTab === 'all-data'
        ? mainSection === 'it'
          ? 'IT · All Data'
          : 'GST · All Data'
        : activeTab === 'client-summary'
          ? mainSection === 'it'
            ? 'IT · Client Summary'
            : 'GST · Company Summary'
          : 'IT · Mobile Summary';

  const firstYearLabel = ledger.assessmentYears[0] || 'AY 2019-20';
  const lastYearLabel =
    ledger.assessmentYears[ledger.assessmentYears.length - 1] || 'AY 2026-27';
  const firstMonthLabel = visibleGstMonths[0] || 'Apr 2026';
  const lastMonthLabel =
    visibleGstMonths[visibleGstMonths.length - 1] || 'Mar 2027';

  const overallTotals = useMemo(
    () => ({
      totalReceived:
        itTotalsSummary.totalReceived + gstOverallTotalsSummary.totalReceived,
      outstandingTotal:
        itTotalsSummary.outstandingTotal +
        gstOverallTotalsSummary.outstandingTotal,
      totalBilled:
        itTotalsSummary.totalBilled + gstOverallTotalsSummary.totalBilled,
      totalEntries:
        itTotalsSummary.totalEntries + gstOverallTotalsSummary.totalEntries,
    }),
    [itTotalsSummary, gstOverallTotalsSummary]
  );

  const totals =
    activeTab === 'year-summary'
      ? overallTotals
      : mainSection === 'it'
        ? itTotalsSummary
        : gstTotalsSummary;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)] flex flex-col lg:flex-row">
      <MobileHeader
        mainSection={mainSection}
        activeTab={activeTab}
        onOpenMenu={() => setMobileMenuOpen(true)}
        onAddClient={openAddPrimaryModal}
        addLabel={addLabel}
      />

      <Sidebar
        mainSection={mainSection}
        onSectionChange={handleSectionChange}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddClient={openAddPrimaryModal}
        addLabel={addLabel}
        onExportCsv={handleExportCsv}
        onOpenDataTransfer={() => setTransferOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <main
        className={`flex-1 min-w-0 w-full mx-auto py-4 space-y-4 ${
          activeTab === 'year-summary'
            ? 'max-w-[1280px] px-3 sm:px-4 lg:px-2'
            : 'max-w-[1680px] px-3 sm:px-5 lg:px-5'
        }`}
      >
        {activeTab !== 'year-summary' && (
          <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink)]">
                {viewHeading}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                {mainSection === 'it' ? (
                  <>
                    <span className="font-mono">
                      {firstYearLabel} – {lastYearLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ledger.clients.length}{' '}
                      {ledger.clients.length === 1 ? 'Client' : 'Clients'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono">{activeGstFy}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {firstMonthLabel} – {lastMonthLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ledger.gstClients.length}{' '}
                      {ledger.gstClients.length === 1 ? 'Company' : 'Companies'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </header>
        )}

        {activeTab !== 'year-summary' && (
          <TopSummaryCards
            totalClients={
              mainSection === 'it'
                ? ledger.clients.length
                : ledger.gstClients.length
            }
            yearsCount={
              mainSection === 'it'
                ? ledger.assessmentYears.length
                : visibleGstMonths.length
            }
            totalReceived={totals.totalReceived}
            outstandingTotal={totals.outstandingTotal}
            totalBilled={totals.totalBilled}
            totalEntries={totals.totalEntries}
            entityPluralLabel={mainSection === 'it' ? 'Clients' : 'Companies'}
            entitySingularLabel={mainSection === 'it' ? 'client' : 'company'}
            periodPluralLabel={
              mainSection === 'it' ? 'Assessment Years' : 'Months'
            }
            periodSingularLabel={
              mainSection === 'it' ? 'Assessment Year' : 'Month'
            }
          />
        )}

        {activeTab === 'all-data' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  mainSection === 'it'
                    ? 'Search clients by name, PAN, phone, ref…'
                    : 'Search companies by name, user ID, phone, ref…'
                }
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-[var(--card)] border border-[var(--line)] rounded-xl shadow-sm placeholder:text-[var(--sidebar-text)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-500)]/30 focus:border-[var(--blue-500)]"
              />
            </div>
            <div
              role="tablist"
              aria-label="Data view mode"
              className="inline-flex self-start p-1 rounded-xl bg-[var(--card)] border border-[var(--line)] shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={dataViewMode === 'simple'}
                onClick={() => setDataViewMode('simple')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  dataViewMode === 'simple'
                    ? 'bg-[var(--navy-900)] text-white'
                    : 'text-[var(--muted)] hover:bg-[var(--frost-100)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Simple View
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dataViewMode === 'sheet'}
                onClick={() => setDataViewMode('sheet')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  dataViewMode === 'sheet'
                    ? 'bg-[var(--navy-900)] text-white'
                    : 'text-[var(--muted)] hover:bg-[var(--frost-100)]'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Sheet View
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-5 space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-11 bg-[var(--frost-100)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="bg-[var(--card)] rounded-2xl border border-[var(--line)] p-8 text-center space-y-3">
            <p className="text-sm font-medium text-red-800">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchLedger()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : activeTab === 'year-summary' ? (
          <OverallDashboard
            itClients={ledger.clients}
            assessmentYears={ledger.assessmentYears}
            gstClients={ledger.gstClients}
            gstMonths={overallGstMonths}
            onAddClient={() => setClientModalOpen(true)}
            onAddCompany={() => setGstCompanyModalOpen(true)}
            onExportCsv={handleExportCsv}
            onOpenItAllData={openItAllData}
            onOpenGstAllData={openGstAllData}
          />
        ) : mainSection === 'it' ? (
          activeTab === 'all-data' ? (
            dataViewMode === 'simple' ? (
              <SimpleClientTable
                clients={filteredClients}
                availableYears={ledger.assessmentYears}
                onEditClient={(client) => openItClientDrawer(client, 'edit')}
                onViewHistory={(client) => openItClientDrawer(client, 'history')}
                onDeleteClient={handleDeleteClient}
                onSaveFiling={handleSaveFiling}
                onDeleteFiling={handleDeleteFiling}
                onOpenQuickEdit={(client, year, existing) =>
                  setQuickEditTarget({ client, year, existing })
                }
                onAddClientClick={() => {
                  setClientModalOpen(true);
                }}
              />
            ) : (
              <ContinuousSheetTable
                clients={filteredClients}
                years={ledger.assessmentYears}
                onEditCell={(client, year, existing) =>
                  setQuickEditTarget({ client, year, existing })
                }
                onEditClient={(client) => openItClientDrawer(client, 'edit')}
                onViewHistory={(client) => openItClientDrawer(client, 'history')}
                onDeleteClient={handleDeleteClient}
                onAddYearColumn={handleAddYearColumn}
                suggestedNextYear={suggestedNextYear}
                onAddClientClick={() => {
                  setClientModalOpen(true);
                }}
              />
            )
          ) : activeTab === 'client-summary' ? (
            <ClientSummaryView
              clients={ledger.clients}
              years={ledger.assessmentYears}
            />
          ) : (
            <MobileSummaryView
              clients={ledger.clients}
              years={ledger.assessmentYears}
            />
          )
        ) : activeTab === 'all-data' ? (
          dataViewMode === 'simple' ? (
            <GstSimpleTable
              clients={filteredGstClients}
              availableMonths={visibleGstMonths}
              onEditCompany={(company) => openGstCompanyDrawer(company, 'edit')}
              onViewHistory={(company) =>
                openGstCompanyDrawer(company, 'history')
              }
              onDeleteCompany={handleDeleteGstCompany}
              onSaveFiling={handleSaveGstFiling}
              onDeleteFiling={handleDeleteGstFiling}
              onOpenQuickEdit={(company, month, existing) =>
                setGstQuickEditTarget({ company, month, existing })
              }
              onAddCompanyClick={() => {
                setGstCompanyModalOpen(true);
              }}
            />
          ) : (
            <GstSheetTable
              clients={filteredGstClients}
              months={visibleGstMonths}
              onEditCell={(company, month, existing) =>
                setGstQuickEditTarget({ company, month, existing })
              }
              onEditCompany={(company) => openGstCompanyDrawer(company, 'edit')}
              onViewHistory={(company) =>
                openGstCompanyDrawer(company, 'history')
              }
              onDeleteCompany={handleDeleteGstCompany}
              onAddMonthColumn={handleAddMonthColumn}
              suggestedNextMonth={suggestedNextMonth}
              onAddCompanyClick={() => {
                setGstCompanyModalOpen(true);
              }}
            />
          )
        ) : (
          <GstClientSummaryView
            clients={ledger.gstClients}
            months={visibleGstMonths}
          />
        )}
      </main>

      {/* IT Modals / Drawer */}
      <ClientModal
        isOpen={clientModalOpen}
        editingClient={null}
        availableYears={ledger.assessmentYears}
        onClose={() => {
          setClientModalOpen(false);
        }}
        onSave={handleSaveClient}
      />

      <ClientEditDrawer
        client={itDrawerClient}
        mode={itDrawerClient ? itDrawerMode : null}
        onClose={closeItClientDrawer}
        onSave={async (payload) => {
          await handleSaveClient(payload);
        }}
        onEditFiling={(client, year, filing) => {
          closeItClientDrawer();
          setQuickEditTarget({ client, year, existing: filing });
        }}
      />

      <FilingQuickModal
        target={quickEditTarget}
        onClose={() => setQuickEditTarget(null)}
        onSave={handleSaveFiling}
        onDelete={handleDeleteFiling}
      />

      {/* GST Modals / Drawer */}
      <GstCompanyModal
        isOpen={gstCompanyModalOpen}
        editingCompany={null}
        availableMonths={visibleGstMonths}
        onClose={() => {
          setGstCompanyModalOpen(false);
        }}
        onSave={handleSaveGstCompany}
      />

      <GstCompanyEditDrawer
        company={gstDrawerCompany}
        mode={gstDrawerCompany ? gstDrawerMode : null}
        onClose={closeGstCompanyDrawer}
        onSave={async (payload) => {
          await handleSaveGstCompany(payload);
        }}
        onEditFiling={(company, month, filing) => {
          closeGstCompanyDrawer();
          setGstQuickEditTarget({ company, month, existing: filing });
        }}
      />

      <GstFilingQuickModal
        target={gstQuickEditTarget}
        onClose={() => setGstQuickEditTarget(null)}
        onSave={handleSaveGstFiling}
        onDelete={handleDeleteGstFiling}
      />

      <DataTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        ledger={ledger}
        initialDomain={mainSection}
        onImported={(next) => setLedger(next)}
      />

      <ToastBanner toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
