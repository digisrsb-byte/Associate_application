type ModalFormFooterProps = {
  onCancel: () => void;
  saving: boolean;
  saveLabel?: string;
  savingLabel?: string;
};

/** Cancel / Save footer used by ClientModal and GstCompanyModal. */
export function ModalFormFooter({
  onCancel,
  saving,
  saveLabel = 'Save',
  savingLabel = 'Saving...',
}: ModalFormFooterProps) {
  return (
    <div className="pt-4 border-t border-[var(--line)] flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-[var(--muted)] bg-[var(--card)] border border-[var(--line)] rounded-xl hover:bg-[var(--frost-100)] cursor-pointer"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 text-sm font-bold text-white bg-[var(--navy-900)] hover:bg-[var(--navy-700)] rounded-xl cursor-pointer disabled:opacity-60"
      >
        {saving ? savingLabel : saveLabel}
      </button>
    </div>
  );
}
