import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronDown,
  Download,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  Plus,
  Table2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { MainSection } from '../types/ledger.ts';

export type SheetTab = 'year-summary' | 'all-data' | 'client-summary' | 'mobile-summary';

interface SidebarProps {
  mainSection: MainSection;
  onSectionChange: (section: MainSection) => void;
  activeTab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onAddClient: () => void;
  addLabel?: string;
  onExportCsv: () => void;
  exportLabel?: string;
  onOpenDataTransfer?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userEmail?: string | null;
  onLogout?: () => void;
}

type NavItem = {
  id: SheetTab;
  label: string;
  icon: typeof LayoutDashboard;
  section: MainSection;
};

export function Sidebar({
  mainSection,
  onSectionChange,
  activeTab,
  onTabChange,
  onAddClient,
  addLabel = 'Add Client',
  onExportCsv,
  exportLabel = 'Export CSV',
  onOpenDataTransfer,
  mobileOpen,
  onCloseMobile,
  userEmail,
  onLogout,
}: SidebarProps) {
  const isDashboard = activeTab === 'year-summary';
  const [openSection, setOpenSection] = useState<MainSection | null>(
    isDashboard ? null : mainSection
  );

  useEffect(() => {
    if (activeTab === 'year-summary') return;
    setOpenSection(mainSection);
  }, [mainSection, activeTab]);

  const goDashboard = () => {
    onTabChange('year-summary');
    setOpenSection(null);
    onCloseMobile();
  };

  const toggleSection = (section: MainSection) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const goSectionTab = (section: MainSection, tab: SheetTab) => {
    onSectionChange(section);
    onTabChange(tab);
    setOpenSection(section);
    onCloseMobile();
  };

  const itItems: NavItem[] = [
    { id: 'all-data', label: 'ALL DATA', icon: Table2, section: 'it' },
    { id: 'client-summary', label: 'CLIENT SUMMARY', icon: Users, section: 'it' },
    { id: 'mobile-summary', label: 'MOBILE SUMMARY', icon: Phone, section: 'it' },
  ];

  const gstItems: NavItem[] = [
    { id: 'all-data', label: 'ALL DATA', icon: Table2, section: 'gst' },
    { id: 'client-summary', label: 'COMPANY SUMMARY', icon: Users, section: 'gst' },
  ];

  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive =
      !isDashboard &&
      item.section === mainSection &&
      activeTab === item.id;

    return (
      <button
        key={`${item.section}-${item.id}`}
        type="button"
        onClick={() => goSectionTab(item.section, item.id)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 min-h-[40px] text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)] ${
          isActive
            ? 'bg-white/15 text-white border-2 border-[var(--gold)] shadow-card'
            : 'text-[var(--sidebar-text)] border-2 border-transparent hover:bg-white/[0.08] hover:text-white'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            isActive ? 'text-[var(--gold)]' : 'text-[var(--sidebar-text)]'
          }`}
        />
        <span className="whitespace-nowrap truncate">{item.label}</span>
      </button>
    );
  };

  const renderSectionDropdown = (
    section: MainSection,
    label: string,
    items: NavItem[]
  ) => {
    const isOpen = openSection === section;
    const sectionActive = !isDashboard && mainSection === section;

    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => toggleSection(section)}
          aria-expanded={isOpen}
          className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 min-h-[40px] text-xs font-bold tracking-[0.12em] uppercase rounded-full cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)] ${
            isOpen || sectionActive
              ? 'bg-white/[0.08] text-white'
              : 'text-[var(--sidebar-text)] hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <span>{label}</span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && (
          <div className="space-y-1 pl-1 animate-in">
            {items.map(renderNavButton)}
          </div>
        )}
      </div>
    );
  };

  const sidebarBody = (
    <aside className="w-[216px] h-full bg-[var(--navy-900)] text-white flex flex-col justify-between select-none shrink-0 rounded-r-3xl overflow-hidden shadow-card relative z-20">
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        <div className="bg-[var(--navy-900)] px-5 pt-5 pb-4 flex flex-col items-center text-center border-b border-white/10 shrink-0">
          <div className="relative w-[52px] h-[52px] rounded-2xl overflow-hidden bg-[var(--navy-700)] border border-[var(--ice)]/40 shadow-card flex items-center justify-center">
            <img
              src="/srsb-logo.jpg"
              alt="SRSB"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="mt-2.5 font-display text-sm font-bold tracking-wider uppercase text-white">
            ASSOCIATE
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--sidebar-text)]">IT & GST Ledger</p>
        </div>

        <nav className="mt-4 px-3.5 space-y-3 overflow-y-auto min-h-0 flex-1" aria-label="Dashboard navigation">
          <button
            type="button"
            onClick={goDashboard}
            className={`w-full flex items-center gap-3 px-4 py-2.5 min-h-[40px] text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)] ${
              isDashboard
                ? 'bg-white/15 text-white border-2 border-[var(--gold)] shadow-card'
                : 'text-[var(--sidebar-text)] border-2 border-transparent hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <LayoutDashboard
              className={`w-4 h-4 shrink-0 ${
                isDashboard ? 'text-[var(--gold)]' : 'text-[var(--sidebar-text)]'
              }`}
            />
            <span className="whitespace-nowrap truncate">DASHBOARD</span>
          </button>

          {renderSectionDropdown('it', 'IT', itItems)}
          {renderSectionDropdown('gst', 'GST', gstItems)}
        </nav>
      </div>

      <div className="p-4 space-y-2 border-t border-white/10 bg-[var(--navy-900)]">
        <motion.button
          type="button"
          onClick={() => {
            onAddClient();
            onCloseMobile();
          }}
          whileTap={{ scale: 0.98 }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[40px] text-xs font-bold text-[var(--ink)] bg-[var(--gold)] hover:brightness-95 rounded-full shadow-sm cursor-pointer whitespace-nowrap focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="truncate">{addLabel}</span>
        </motion.button>

        {onOpenDataTransfer && (
          <button
            type="button"
            onClick={() => {
              onOpenDataTransfer();
              onCloseMobile();
            }}
            title={
              mainSection === 'gst'
                ? 'Import or export the GST Filing Master Report workbook'
                : 'Import or export the Filing Master Report workbook'
            }
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[38px] text-xs font-medium text-[var(--sidebar-text)] hover:text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
            <span className="truncate">Import / Export</span>
          </button>
        )}

        <button
          type="button"
          onClick={onExportCsv}
          title="Download current view in Excel CSV format"
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[38px] text-xs font-medium text-[var(--sidebar-text)] hover:text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]"
        >
          <Download className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
          <span className="truncate">{exportLabel}</span>
        </button>

        {onLogout && (
          <div className="pt-1 space-y-1.5">
            {userEmail && (
              <p
                className="px-1 text-[10px] text-[var(--sidebar-text)] truncate"
                title={userEmail}
              >
                {userEmail}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                onLogout();
                onCloseMobile();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 min-h-[38px] text-xs font-medium text-[var(--sidebar-text)] hover:text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]"
            >
              <LogOut className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
              <span className="truncate">Log out</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:flex h-dvh max-h-dvh shrink-0 relative z-20">
        {sidebarBody}
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex bg-black/45">
          <div className="relative h-full">
            {sidebarBody}
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close menu"
              className="absolute top-3 right-3 p-1.5 text-white/80 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
}

export function MobileHeader({
  mainSection,
  activeTab,
  onOpenMenu,
  onAddClient,
  addLabel = 'Add Client',
}: {
  mainSection: MainSection;
  activeTab: SheetTab;
  onOpenMenu: () => void;
  onAddClient: () => void;
  addLabel?: string;
}) {
  const contextLabel =
    activeTab === 'year-summary'
      ? 'Overall'
      : mainSection === 'it'
        ? 'IT'
        : 'GST';

  return (
    <div className="lg:hidden sticky top-0 z-30 bg-[var(--navy-900)] text-white px-4 py-3 flex items-center justify-between gap-2 shadow-sm">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenMenu}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/srsb-logo.jpg"
            alt="SRSB"
            className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10"
          />
          <div className="min-w-0">
            <span className="font-display text-sm font-bold tracking-wider uppercase block text-white">
              ASSOCIATE
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sidebar-text)]">
              {contextLabel}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onAddClient}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-[var(--gold)] hover:brightness-95 text-[var(--ink)] rounded-full cursor-pointer whitespace-nowrap"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{addLabel}</span>
      </button>
    </div>
  );
}
