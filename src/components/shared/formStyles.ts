/** Shared focus ring used by drawer forms (preserve existing a11y chrome). */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

export const FIELD_LABEL_CLASS =
  'block text-xs font-medium text-[var(--ink)] mb-1';

/** Drawer text input (matches ClientEditDrawer / GstCompanyEditDrawer). */
export const DRAWER_TEXT_INPUT_CLASS = `w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${FOCUS_RING}`;

/** Drawer mono input. */
export const DRAWER_MONO_INPUT_CLASS = `w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${FOCUS_RING}`;

/** Drawer uppercase mono (PAN). */
export const DRAWER_PAN_INPUT_CLASS = `w-full px-3 py-2 text-sm font-mono uppercase border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] ${FOCUS_RING}`;

/** Drawer textarea. */
export const DRAWER_TEXTAREA_CLASS = `w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl bg-[var(--card)] focus:outline-none focus:border-[var(--blue-500)] resize-y ${FOCUS_RING}`;

/** Create-modal text input (matches ClientModal / GstCompanyModal). */
export const MODAL_TEXT_INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';

export const MODAL_MONO_INPUT_CLASS =
  'w-full px-3 py-2 text-sm font-mono border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';

export const MODAL_PAN_INPUT_CLASS =
  'w-full px-3 py-2 text-sm font-mono uppercase border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';

export const MODAL_REMARK_INPUT_CLASS =
  'w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--line)] rounded-xl focus:outline-none focus:border-[var(--blue-500)]';
