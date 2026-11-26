/**
 * Shared Excel cell helpers for import (browser + Node).
 * Never logs cell contents.
 */
import type ExcelJS from 'exceljs';

export function unwrapCell(value: ExcelJS.CellValue): unknown {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('result' in value && (value as { result?: unknown }).result !== undefined) {
      return unwrapCell((value as { result: ExcelJS.CellValue }).result);
    }
    if (
      'richText' in value &&
      Array.isArray((value as { richText: { text: string }[] }).richText)
    ) {
      return (value as { richText: { text: string }[] }).richText
        .map((t) => t.text)
        .join('');
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      return (value as { text: string }).text;
    }
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: ExcelJS.CellValue }).result;
      if (result !== undefined) return unwrapCell(result);
      return '';
    }
  }
  return value;
}

export function cellText(value: ExcelJS.CellValue): string {
  const v = unwrapCell(value);
  if (v == null) return '';
  if (v instanceof Date) return '';
  return String(v).trim();
}

export function parseAmount(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw * 100) / 100);
  }
  const s = String(raw)
    .replace(/[₹,\s]/g, '')
    .trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function toIsoDate(value: unknown): {
  iso: string;
  ok: boolean;
  wasDate: boolean;
} {
  if (value == null || value === '') return { iso: '', ok: true, wasDate: false };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return { iso: `${y}-${m}-${d}`, ok: true, wasDate: true };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(value) * 86400000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime()) && value > 20000 && value < 80000) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return { iso: `${y}-${m}-${d}`, ok: true, wasDate: true };
    }
  }
  const s = String(value).trim();
  if (!s) return { iso: '', ok: true, wasDate: false };

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ok: true, wasDate: false };

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return { iso: `${m[3]}-${mm}-${dd}`, ok: true, wasDate: false };
  }

  m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (mon != null) {
      const dd = m[1].padStart(2, '0');
      const mm = String(mon + 1).padStart(2, '0');
      return { iso: `${m[3]}-${mm}-${dd}`, ok: true, wasDate: false };
    }
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+\d/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ok: true, wasDate: true };

  return { iso: '', ok: false, wasDate: false };
}

export function normalizeAy(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^AY\s*(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/i);
  if (m) {
    const start = m[1];
    const end = m[2].length === 2 ? m[2] : m[2].slice(-2);
    return `AY ${start}-${end}`;
  }
  m = s.match(/^(\d{4})\s*[-–]\s*(\d{2}|\d{4})$/);
  if (m) {
    const start = m[1];
    const end = m[2].length === 2 ? m[2] : m[2].slice(-2);
    return `AY ${start}-${end}`;
  }
  return null;
}

/** OOXML xlsx is a ZIP; PK\x03\x04 magic. */
export function looksLikeXlsxBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

export const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;
