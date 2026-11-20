/**
 * Phase 5 – shared PAN / field-length validation.
 * Format checks do NOT verify a PAN with the Income Tax Department.
 */

/** Indian PAN structure (structure only — not ITD verification). */
export const PAN_REGEX = /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/;

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
      error: `PAN must be exactly ${FIELD_LIMITS.pan} characters (e.g. ABCPE1234F).`,
    };
  }
  if (!isValidPanFormat(pan)) {
    return {
      ok: false,
      error:
        'Invalid PAN format. Expected 5 letters (4th = entity type A/B/C/F/G/H/L/J/P/T), 4 digits, then 1 letter. This check does not verify the PAN with the Income Tax Department.',
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value };
}
