import type { Transition, Variants } from 'motion/react';

export const easeOut: Transition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const springSoft = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 28,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { ...easeOut, delay: Number(i) * 0.06 },
  }),
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export const fadeScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: easeOut },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18 } },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const cardPop: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
};

export const overlayFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const drawerSlide: Variants = {
  hidden: { x: '100%', opacity: 0.6 },
  show: { x: 0, opacity: 1, transition: springSoft },
  exit: { x: '100%', opacity: 0.6, transition: { duration: 0.22 } },
};

export const toastSlide: Variants = {
  hidden: { opacity: 0, y: -16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
  exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.18 } },
};
