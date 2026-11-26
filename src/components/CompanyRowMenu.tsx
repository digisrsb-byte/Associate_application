import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, MoreVertical, Pencil, Trash2 } from 'lucide-react';

interface CompanyRowMenuProps {
  onEditDetails: () => void;
  onViewHistory: () => void;
  onDelete: () => void | Promise<void>;
  deleteLabel?: string;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue-500)]';

const MENU_WIDTH = 176;

export function CompanyRowMenu({
  onEditDetails,
  onViewHistory,
  onDelete,
  deleteLabel = 'Delete Company',
}: CompanyRowMenuProps) {
  const confirmNoun = deleteLabel.toLowerCase().includes('client') ? 'client' : 'company';
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const menuHeight = confirmDelete ? 92 : 132;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - 8
    );
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUpward = spaceBelow < menuHeight && rect.top > menuHeight + 8;
    const top = openUpward ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4;
    setCoords({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, confirmDelete]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setConfirmDelete(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setConfirmDelete(false);
      }
    };

    const onReposition = () => updatePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, confirmDelete]);

  const menu =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: MENU_WIDTH,
              zIndex: 9999,
            }}
            className="rounded-xl border border-[var(--line)] bg-[var(--card)] shadow-card overflow-hidden py-1"
          >
            {confirmDelete ? (
              <div className="px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-semibold text-[var(--ink)]">
                  Delete this {confirmNoun}?
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={deleting}
                    onClick={() => {
                      void (async () => {
                        setDeleting(true);
                        try {
                          await onDelete();
                          setOpen(false);
                          setConfirmDelete(false);
                        } finally {
                          setDeleting(false);
                        }
                      })();
                    }}
                    className={`flex-1 min-h-11 px-2 py-2 text-[11px] font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg cursor-pointer disabled:opacity-60 ${focusRing}`}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className={`flex-1 min-h-11 px-2 py-2 text-[11px] font-semibold text-[var(--muted)] bg-[var(--frost-100)] hover:bg-[var(--frost-100)] rounded-lg cursor-pointer ${focusRing}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onEditDetails();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-3 min-h-11 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--muted)]" />
                  Edit Details
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onViewHistory();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-3 min-h-11 text-left text-xs font-semibold text-[var(--ink)] hover:bg-[var(--frost-100)] cursor-pointer ${focusRing}`}
                >
                  <History className="w-3.5 h-3.5 text-[var(--muted)]" />
                  View History
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDelete(true)}
                  className={`w-full flex items-center gap-2 px-3 py-3 min-h-11 text-left text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-15)] cursor-pointer ${focusRing}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleteLabel}
                </button>
              </>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="inline-flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setConfirmDelete(false);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Company actions"
        className={`rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--frost-100)] opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 cursor-pointer min-h-11 min-w-11 inline-flex items-center justify-center ${focusRing}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {menu}
    </div>
  );
}
