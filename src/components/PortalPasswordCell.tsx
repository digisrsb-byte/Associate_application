import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { revealPortalPassword } from '../utils/api.ts';

interface PortalPasswordCellProps {
  kind: 'it' | 'gst';
  id: string;
  hasPassword?: boolean;
}

/**
 * Ordinary ledger views never receive portal passwords from /api/ledger.
 * Reveal/copy fetches via a session-authenticated endpoint only.
 */
export function PortalPasswordCell({
  kind,
  id,
  hasPassword = false,
}: PortalPasswordCellProps) {
  const [plain, setPlain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasPassword) {
    return (
      <span className="font-mono text-[11px] text-[var(--muted)]">—</span>
    );
  }

  const fetchPlain = async (): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const value = await revealPortalPassword(kind, id);
      setPlain(value);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reveal failed');
      setPlain(null);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleReveal = async () => {
    if (plain) {
      setPlain(null);
      return;
    }
    await fetchPlain();
  };

  const copy = async () => {
    const value = plain || (await fetchPlain());
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setError('Copy failed');
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[var(--ink)]">
      <span className="max-w-[82px] truncate" title={error || undefined}>
        {busy ? '…' : plain ? plain : '••••••••'}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void toggleReveal();
        }}
        disabled={busy}
        className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer disabled:opacity-50"
        title={plain ? 'Hide password' : 'Show password'}
      >
        {plain ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void copy();
        }}
        disabled={busy}
        className="p-0.5 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer disabled:opacity-50"
        title="Copy password"
      >
        {copied ? (
          <Check className="w-3 h-3 text-[var(--success)]" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
