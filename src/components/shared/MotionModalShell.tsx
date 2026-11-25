import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { fadeScale, overlayFade } from '../../motion/presets.ts';

type MotionModalShellProps = {
  titleId: string;
  title: ReactNode;
  onClose: () => void;
  /** Panel width class — ClientModal uses max-w-xl; GstCompanyModal uses max-w-lg. */
  panelClassName?: string;
  children: ReactNode;
};

/**
 * Shared animated create/edit modal overlay + navy header.
 * Form body remains in each modal to avoid merging domain fields.
 */
export function MotionModalShell({
  titleId,
  title,
  onClose,
  panelClassName = 'max-w-xl',
  children,
}: MotionModalShellProps) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-900)]/50 backdrop-blur-[1px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      variants={overlayFade}
      initial="hidden"
      animate="show"
    >
      <motion.div
        variants={fadeScale}
        initial="hidden"
        animate="show"
        className={`bg-[var(--card)] border border-[var(--line)] rounded-2xl w-full shadow-xl overflow-hidden my-auto ${panelClassName}`}
      >
        <div className="px-6 py-4 bg-[var(--navy-900)] text-white flex items-center justify-between">
          <h2 id={titleId} className="font-display text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/75 hover:text-white rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
