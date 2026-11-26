import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, RotateCcw } from 'lucide-react';
import {
  TABLE_FOCUS_RING,
  TABLE_PILL_BTN,
  TABLE_ROUND_NAV_BTN,
} from './tableStyles.ts';

export interface TopPeriodNavigatorProps {
  canPrev: boolean;
  canNext: boolean;
  showAll: boolean;
  isViewingCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
  onShowAll: () => void;
  prevAriaLabel: string;
  nextAriaLabel: string;
  allLabel: string;
  /** Domain dropdown (years / months) — kept in parent. */
  periodSlot: ReactNode;
  /**
   * `inline` — sheet tables (prev/slot/next + Current + All in one row).
   * `split` — simple list tables (nav left, Current/All right).
   */
  layout?: 'inline' | 'split';
}

export function TopPeriodNavigator({
  canPrev,
  canNext,
  showAll,
  isViewingCurrent,
  onPrev,
  onNext,
  onCurrent,
  onShowAll,
  prevAriaLabel,
  nextAriaLabel,
  allLabel,
  periodSlot,
  layout = 'inline',
}: TopPeriodNavigatorProps) {
  const stepDisabled = showAll;
  const navCluster = (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || stepDisabled}
        aria-label={prevAriaLabel}
        className={`${TABLE_ROUND_NAV_BTN} ${TABLE_FOCUS_RING}`}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {periodSlot}

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || stepDisabled}
        aria-label={nextAriaLabel}
        className={`${TABLE_ROUND_NAV_BTN} ${TABLE_FOCUS_RING}`}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  const currentBtn = (
    <button
      type="button"
      onClick={onCurrent}
      disabled={isViewingCurrent && !showAll}
      className={`${TABLE_PILL_BTN} ${TABLE_FOCUS_RING}`}
    >
      <RotateCcw className="w-3.5 h-3.5" />
      <span>Current</span>
    </button>
  );

  const allBtn = (
    <button
      type="button"
      onClick={onShowAll}
      aria-pressed={showAll}
      className={`${TABLE_PILL_BTN} ${TABLE_FOCUS_RING} ${
        showAll
          ? 'bg-[var(--navy-900)] text-white border-[var(--navy-900)] hover:bg-[var(--navy-700)]'
          : ''
      }`}
    >
      <LayoutGrid className="w-3.5 h-3.5" />
      <span>{allLabel}</span>
    </button>
  );

  if (layout === 'split') {
    return (
      <>
        {navCluster}
        <div className="inline-flex items-center gap-2">
          {currentBtn}
          {allBtn}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {navCluster}
      {currentBtn}
      {allBtn}
    </div>
  );
}

export interface BottomPeriodNavigatorProps {
  canPrev: boolean;
  canNext: boolean;
  showAll: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Full label text e.g. "‹ Previous · 25-26" */
  prevText: string;
  /** Full label text e.g. "Next · 26-27 ›" */
  nextText: string;
}

export function BottomPeriodNavigator({
  canPrev,
  canNext,
  showAll,
  onPrev,
  onNext,
  prevText,
  nextText,
}: BottomPeriodNavigatorProps) {
  const stepDisabled = showAll;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev || stepDisabled}
        className={`${TABLE_PILL_BTN} ${TABLE_FOCUS_RING}`}
      >
        <span>{prevText}</span>
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext || stepDisabled}
        className={`${TABLE_PILL_BTN} ${TABLE_FOCUS_RING}`}
      >
        <span>{nextText}</span>
      </button>
    </div>
  );
}
