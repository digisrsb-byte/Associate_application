import {
  Building2,
  LayoutDashboard,
  MoreHorizontal,
  Users,
} from 'lucide-react';
import type { MainSection } from '../../types/ledger.ts';
import type { SheetTab } from '../Sidebar.tsx';

export type MobileNavTab = 'dashboard' | 'it' | 'gst' | 'more';

interface MobileBottomNavProps {
  mainSection: MainSection;
  activeTab: SheetTab;
  moreOpen: boolean;
  onSelectDashboard: () => void;
  onSelectIt: () => void;
  onSelectGst: () => void;
  onSelectMore: () => void;
}

function resolveActive(
  mainSection: MainSection,
  activeTab: SheetTab,
  moreOpen: boolean
): MobileNavTab {
  if (moreOpen) return 'more';
  if (activeTab === 'year-summary') return 'dashboard';
  if (mainSection === 'gst') return 'gst';
  return 'it';
}

const items: {
  id: MobileNavTab;
  label: string;
  Icon: typeof LayoutDashboard;
}[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'it', label: 'IT Clients', Icon: Users },
  { id: 'gst', label: 'GST', Icon: Building2 },
  { id: 'more', label: 'More', Icon: MoreHorizontal },
];

export function MobileBottomNav({
  mainSection,
  activeTab,
  moreOpen,
  onSelectDashboard,
  onSelectIt,
  onSelectGst,
  onSelectMore,
}: MobileBottomNavProps) {
  const active = resolveActive(mainSection, activeTab, moreOpen);

  const handlers: Record<MobileNavTab, () => void> = {
    dashboard: onSelectDashboard,
    it: onSelectIt,
    gst: onSelectGst,
    more: onSelectMore,
  };

  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(20,30,60,0.08)]"
    >
      <ul className="grid grid-cols-4 m-0 p-0 list-none">
        {items.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={handlers[id]}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 cursor-pointer transition-colors ${
                  isActive
                    ? 'text-[var(--navy-900)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                    isActive ? 'bg-[var(--frost-100)]' : ''
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className="text-[10px] font-semibold tracking-wide truncate max-w-full">
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
