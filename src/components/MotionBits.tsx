import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cardPop, fadeScale, fadeUp, springSoft, staggerContainer } from '../motion/presets.ts';

export function PageFade({
  id,
  children,
  className = '',
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={id}
      variants={fadeScale}
      initial="hidden"
      animate="show"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function RiseItem({
  children,
  className = '',
  i = 0,
}: {
  children: ReactNode;
  className?: string;
  i?: number;
}) {
  return (
    <motion.div custom={i} variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}

export function PopCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={cardPop}
      whileHover={{ y: -3, transition: springSoft }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function PulseDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--gold)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--gold)]" />
    </span>
  );
}
