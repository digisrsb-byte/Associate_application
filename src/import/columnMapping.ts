import {
  fieldsForDomain,
  type FieldDef,
  type ImportDomain,
} from './fieldCatalog.ts';

/** Map of target field key → Excel heading (exact heading text from sheet). */
export type ColumnMapping = Record<string, string | null>;

export type MappingSuggestion = {
  mapping: ColumnMapping;
  unmappedHeadings: string[];
  missingRequired: string[];
  fingerprint: string;
};

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchHeading(
  headings: string[],
  field: FieldDef,
  used: Set<string>
): string | null {
  const byNorm = new Map(headings.map((h) => [norm(h), h]));
  for (const alias of field.aliases) {
    const hit = byNorm.get(norm(alias));
    if (hit && !used.has(hit)) return hit;
  }
  // Prefer exact alias over contains for "pan" vs "client id (pan)"
  for (const alias of field.aliases) {
    const a = norm(alias);
    for (const h of headings) {
      if (used.has(h)) continue;
      const hn = norm(h);
      if (hn === a || hn.includes(a)) return h;
    }
  }
  return null;
}

export function suggestColumnMapping(
  domain: ImportDomain,
  headings: string[]
): MappingSuggestion {
  const fields = fieldsForDomain(domain);
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  for (const field of fields) {
    const hit = matchHeading(headings, field, used);
    mapping[field.key] = hit;
    if (hit) used.add(hit);
  }

  const mapped = new Set(
    Object.values(mapping).filter((v): v is string => Boolean(v))
  );
  const unmappedHeadings = headings.filter((h) => !mapped.has(h));
  const missingRequired = fields
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.key);

  return {
    mapping,
    unmappedHeadings,
    missingRequired,
    fingerprint: mappingFingerprint(mapping),
  };
}

export function mappingFingerprint(mapping: ColumnMapping): string {
  const keys = Object.keys(mapping).sort();
  return keys.map((k) => `${k}=${mapping[k] ?? ''}`).join('|');
}

export function validateMapping(
  domain: ImportDomain,
  mapping: ColumnMapping,
  headings: string[]
): { ok: true } | { ok: false; errors: string[] } {
  const fields = fieldsForDomain(domain);
  const headingSet = new Set(headings);
  const errors: string[] = [];
  for (const f of fields) {
    const h = mapping[f.key];
    if (f.required && !h) {
      errors.push(`Required field "${f.label}" is not mapped.`);
    }
    if (h && !headingSet.has(h)) {
      errors.push(`Mapped heading "${h}" for "${f.label}" is not on the sheet.`);
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

export function unmappedSourceHeadings(
  headings: string[],
  mapping: ColumnMapping
): string[] {
  const mapped = new Set(
    Object.values(mapping).filter((v): v is string => Boolean(v))
  );
  return headings.filter((h) => !mapped.has(h));
}
