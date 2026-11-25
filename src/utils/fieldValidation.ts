/**
 * Phase 5 – shared PAN / field-length validation.
 * Format checks do NOT verify a PAN with the Income Tax Department.
 */

/** Indian PAN structure (structure only — not ITD verification). */
export const PAN_REGEX = /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/;

/**
 * Syntactically valid PAN-shaped example for placeholders and error hints.
 * Demo / format-example data only — not a real or government-verified PAN.
 */
export const PAN_FORMAT_EXAMPLE = 'ABCPK1234D';

export const FIELD_LIMITS = {
  name: 120,
  companyName: 120,
  userId: 80,
  pan: 10,
  phone: 20,
  referenceNumber: 40,
  remark: 500,
  otherMobiles: 120,
  nameVariants: 200,
  email: 254,
  gstin: 15,
  paymentType: 40,
  assessmentYear: 32,
  gstMonth: 32,
} as const;

export type FieldLimitsKey = keyof typeof FIELD_LIMITS;

export function normalizePanInput(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, FIELD_LIMITS.pan);
}

export function isValidPanFormat(pan: string): boolean {
  return PAN_REGEX.test(pan);
}

export function validatePanValue(
  raw: string,
  options?: { required?: boolean }
): { ok: true; pan: string } | { ok: false; error: string } {
  const required = options?.required !== false;
  const pan = normalizePanInput(raw);
  if (!pan) {
    if (required) {
      return { ok: false, error: 'PAN is required.' };
    }
    return { ok: true, pan: '' };
  }
  if (pan.length !== FIELD_LIMITS.pan) {
    return {
      ok: false,
      error: `PAN must be exactly ${FIELD_LIMITS.pan} characters (e.g. ${PAN_FORMAT_EXAMPLE}). Format example only — not government-verified.`,
    };
  }
  if (!isValidPanFormat(pan)) {
    return {
      ok: false,
      error: `Invalid PAN format. Expected 5 letters (4th = entity type A/B/C/F/G/H/L/J/P/T), 4 digits, then 1 letter (e.g. ${PAN_FORMAT_EXAMPLE}). This check does not verify the PAN with the Income Tax Department.`,
    };
  }
  return { ok: true, pan };
}

export function clipField(
  value: unknown,
  key: FieldLimitsKey
): string {
  const max = FIELD_LIMITS[key];
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

export function validateRequiredText(
  raw: unknown,
  label: string,
  key: FieldLimitsKey
): { ok: true; value: string } | { ok: false; error: string } {
  const value = clipField(raw, key);
  if (!value) {
    return { ok: false, error: `${label} is required.` };
  }
  if (String(raw ?? '').trim().length > FIELD_LIMITS[key]) {
    return {
      ok: false,
      error: `${label} must be at most ${FIELD_LIMITS[key]} characters.`,
    };
  }
  return { ok: true, value };
}

export function validateOptionalText(
  raw: unknown,
  label: string,
  key: FieldLimitsKey
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = String(raw ?? '').trim();
  if (trimmed.length > FIELD_LIMITS[key]) {
    return {
      ok: false,
      error: `${label} must be at most ${FIELD_LIMITS[key]} characters.`,
    };
  }
  return { ok: true, value: trimmed.slice(0, FIELD_LIMITS[key]) };
}

/** Optional phone: empty allowed; otherwise length + printable digits/symbols. */
export function validateOptionalPhone(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: true, value: '' };
  if (value.length > FIELD_LIMITS.phone) {
    return {
      ok: false,
      error: `Phone must be at most ${FIELD_LIMITS.phone} characters.`,
    };
  }
  if (!/^[0-9+\-\s()]*$/.test(value)) {
    return {
      ok: false,
      error: 'Phone may only contain digits, spaces, +, -, and parentheses.',
    };
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length > 0 && (digits.length < 8 || digits.length > 15)) {
    return {
      ok: false,
      error: 'Phone number should have between 8 and 15 digits.',
    };
  }
  return { ok: true, value };
}

/** Required phone: non-empty plus the same shape rules as optional phone. */
export function validateRequiredPhone(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim();
  if (!value) {
    return { ok: false, error: 'Phone is required.' };
  }
  return validateOptionalPhone(raw);
}

/** Canonical payment date format shared by FE date inputs and BE. */
export const PAYMENT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for a real calendar date in YYYY-MM-DD. */
export function isValidPaymentCalendarDate(raw: unknown): boolean {
  const value = String(raw ?? '').trim();
  const match = PAYMENT_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function validatePaymentDate(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim();
  if (!value) {
    return { ok: false, error: 'Payment date is required.' };
  }
  if (!isValidPaymentCalendarDate(value)) {
    return {
      ok: false,
      error: 'Payment date must be a valid calendar date (YYYY-MM-DD).',
    };
  }
  return { ok: true, value };
}

/**
 * Linear-time shape check equivalent to /^[^\s@]+@[^\s@]+\.[^\s@]+$/.
 * Intentionally not HTML5/RFC — preserves prior accept/reject set (Unicode, +, dots).
 */
function matchesOptionalEmailShape(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local.length || !domain.length) return false;
  if (/[\s@]/.test(local) || /[\s@]/.test(domain)) return false;

  for (let i = 1; i < domain.length - 1; i++) {
    if (domain[i] === '.') return true;
  }
  return false;
}

export function validateOptionalEmail(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!value) return { ok: true, value: '' };
  if (value.length > FIELD_LIMITS.email) {
    return {
      ok: false,
      error: `Email must be at most ${FIELD_LIMITS.email} characters.`,
    };
  }
  if (!matchesOptionalEmailShape(value)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value };
}

/** Indian GSTIN structure only — not government verification. */
export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstinInput(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, FIELD_LIMITS.gstin);
}

export function isValidGstinFormat(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin);
}

export function validateOptionalGstin(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeGstinInput(String(raw ?? ''));
  if (!value) return { ok: true, value: '' };
  if (value.length !== FIELD_LIMITS.gstin || !isValidGstinFormat(value)) {
    return {
      ok: false,
      error:
        'Invalid GSTIN format (15 characters). Format check only — not government-verified.',
    };
  }
  return { ok: true, value };
}
