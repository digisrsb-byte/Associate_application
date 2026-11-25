import {
  Building2,
  Download,
  FileSpreadsheet,
  LogOut,
  Smartphone,
  TableProperties,
  Users,
  X,
} from 'lucide-react';
import type { MainSection } from '../../types/ledger.ts';
import type { SheetTab } from '../Sidebar.tsx';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  mainSection: MainSection;
  userEmail: string | null;
  onGoTab: (section: MainSection, tab: SheetTab) => void;
  onOpenDataTransfer: () => void;
  onExportCsv: () => void;
  onLogout: () => void;
}

export function MobileMoreSheet({
  open,
  onClose,
  mainSection,
  userEmail,
  onGoTab,
  onOpenDataTransfer,
  onExportCsv,
  onLogout,
}: MobileMoreSheetProps) {
  if (!open) return null;

  const go = (section: MainSection, tab: SheetTab) => {
    onGoTab(section, tab);
    onClose();
  };

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-[var(--navy-900)]/40 p-0 cursor-pointer"
        aria-label="Close more menu"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="relative z-10 rounded-t-3xl bg-[var(--card)] border border-[var(--line)] shadow-xl max-h-[85dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-[var(--ink)]">More</p>
            {userEmail ? (
              <p className="text-[11px] text-[var(--muted)] truncate mt-0.5">{userEmail}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--frost-100)] cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-4">
          <section>
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Income Tax
            </p>
            <div className="rounded-2xl border border-[var(--line)] overflow-hidden divide-y divide-[var(--line)]">
              <MoreRow
                icon={TableProperties}
                label="IT All Data"
                onClick={() => go('it', 'all-data')}
              />
              <MoreRow
                icon={Users}
                label="Client Summary"
                onClick={() => go('it', 'client-summary')}
              />
              <MoreRow
                icon={Smartphone}
                label="Mobile Summary"
                onClick={() => go('it', 'mobile-summary')}
              />
            </div>
          </section>

          <section>
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              GST
            </p>
            <div className="rounded-2xl border border-[var(--line)] overflow-hidden divide-y divide-[var(--line)]">
              <MoreRow
                icon={TableProperties}
                label="GST All Data"
                onClick={() => go('gst', 'all-data')}
              />
              <MoreRow
                icon={Building2}
                label="Company Summary"
                onClick={() => go('gst', 'client-summary')}
              />
            </div>
          </section>

          <section>
            <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
              Data
            </p>
            <div className="rounded-2xl border border-[var(--line)] overflow-hidden divide-y divide-[var(--line)]">
              <MoreRow
                icon={FileSpreadsheet}
                label="Import / Export"
                onClick={() => {
                  onClose();
                  onOpenDataTransfer();
                }}
              />
              <MoreRow
                icon={Download}
                label={
                  mainSection === 'gst' ? 'Export GST CSV pack' : 'Export IT CSV pack'
                }
                onClick={() => {
                  onClose();
                  onExportCsv();
                }}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-15)] text-[var(--danger)] text-sm font-bold cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function MoreRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-12 flex items-center gap-3 px-3.5 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--frost-100)] text-[var(--navy-900)]">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}
