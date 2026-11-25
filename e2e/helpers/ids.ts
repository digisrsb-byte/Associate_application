/** Synthetic identifiers — never real client PANs or names. */
let seq = 0;

export function nextSeq(): number {
  seq += 1;
  // Mix ms + monotonic counter so rapid same-second runs still diverge.
  return (Date.now() % 1_000_000) * 1000 + (seq % 1000);
}

/**
 * Valid Indian PAN *structure* only (4th char entity type).
 * Pattern: [A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]
 *
 * Uses 5th letter + 4 digits + check letter from `n` so uniqueness is not
 * capped at the last four digits alone (shared e2e DB accumulates rows).
 */
export function syntheticPan(n = nextSeq()): string {
  const digits = String(n % 10000).padStart(4, '0');
  const letter5 = String.fromCharCode(65 + (Math.floor(n / 10000) % 26));
  const letter10 = String.fromCharCode(65 + (n % 26));
  return `ZZAP${letter5}${digits}${letter10}`;
}

export function syntheticName(prefix: string, n = nextSeq()): string {
  return `E2E ${prefix} ${n}`;
}

export function syntheticPhone(n = nextSeq()): string {
  return `9${String(n).padStart(9, '0').slice(-9)}`;
}

export const PORTAL_PASSWORD = 'E2ePortal@Test99';
