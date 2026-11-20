import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type {
  ClientRecord,
  FilingRecord,
  GstClientRecord,
  GstMonthlyFiling,
  LedgerState,
} from './src/types/ledger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ledger.json');
const PORT = Number(process.env.PORT) || 3000;

function extractYearOrderKey(ayLabel: string): number {
  const match = ayLabel.match(/(\d{4})/);
  if (match) return parseInt(match[1], 10);
  const shortMatch = ayLabel.match(/(\d{2})/);
  if (shortMatch) return 2000 + parseInt(shortMatch[1], 10);
  return 0;
}

function sortYears(years: string[]): string[] {
  return [...new Set(years.map((y) => y.trim()).filter(Boolean))].sort(
    (a, b) => extractYearOrderKey(a) - extractYearOrderKey(b) || a.localeCompare(b)
  );
}

const MONTH_INDEX: Record<string, number> = {
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

function extractMonthOrderKey(label: string): number {
  const match = label.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const idx = MONTH_INDEX[match[1].slice(0, 3).toLowerCase()];
    const yr = parseInt(match[2], 10);
    if (idx !== undefined) return yr * 12 + idx;
  }
  return 0;
}

function sortMonths(months: string[]): string[] {
  return [...new Set(months.map((m) => m.trim()).filter(Boolean))].sort(
    (a, b) => extractMonthOrderKey(a) - extractMonthOrderKey(b) || a.localeCompare(b)
  );
}

const BASELINE_ASSESSMENT_YEARS = [
  'AY 2019-20',
  'AY 2020-21',
  'AY 2021-22',
  'AY 2022-23',
  'AY 2023-24',
  'AY 2024-25',
  'AY 2025-26',
  'AY 2026-27',
];

const BASELINE_GST_MONTHS = [
  'Apr 2026',
  'May 2026',
  'Jun 2026',
  'Jul 2026',
  'Aug 2026',
  'Sep 2026',
  'Oct 2026',
  'Nov 2026',
  'Dec 2026',
  'Jan 2027',
  'Feb 2027',
  'Mar 2027',
];



function createInitialLedger(): LedgerState {
  const now = new Date().toISOString();
  return {
    assessmentYears: [...BASELINE_ASSESSMENT_YEARS],
    clients: [
      {
        id: 'demo-1',
        name: 'Ramesh Kumar',
        pan: 'ABCPR1234K',
        password: 'Ramesh@2026',
        phone: '9820112233',
        referenceNumber: 'REF-01',
        remark: 'Regular yearly filing',
        filings: {
          'AY 2019-20': {
            assessmentYear: 'AY 2019-20',
            filingDate: '2020-01-15',
            fees: 10000,
            received: 9000,
            balance: 1000,
            paymentType: 'GPay',
            paymentReceiveDate: '2020-01-16',
          },
          'AY 2020-21': {
            assessmentYear: 'AY 2020-21',
            filingDate: '2021-01-10',
            fees: 10000,
            received: 9000,
            balance: 1000,
            paymentType: 'PhonePe',
            paymentReceiveDate: '2021-01-12',
          },
          'AY 2021-22': {
            assessmentYear: 'AY 2021-22',
            filingDate: '2022-07-28',
            fees: 10000,
            received: 10000,
            balance: 0,
            paymentType: 'BOB',
            paymentReceiveDate: '2022-07-29',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-30',
            fees: 12000,
            received: 9000,
            balance: 3000,
            paymentType: 'P-Pay',
            paymentReceiveDate: '2026-10-29',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-2',
        name: 'Priya Nair',
        pan: 'BKLPN5678M',
        password: 'Priya#456',
        phone: '9845022334',
        referenceNumber: 'REF-02',
        remark: 'All dues cleared',
        filings: {
          'AY 2025-26': {
            assessmentYear: 'AY 2025-26',
            filingDate: '2025-07-24',
            fees: 6000,
            received: 6000,
            balance: 0,
            paymentType: 'GPay',
            paymentReceiveDate: '2025-07-25',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-27',
            fees: 6500,
            received: 6500,
            balance: 0,
            paymentType: 'UPI',
            paymentReceiveDate: '2026-07-28',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'demo-3',
        name: 'Suresh Verma',
        pan: 'AGTPV8899R',
        password: 'Suresh@789',
        phone: '9765099887',
        referenceNumber: 'REF-03',
        remark: 'Follow up for AY 2026-27 payment',
        filings: {
          'AY 2025-26': {
            assessmentYear: 'AY 2025-26',
            filingDate: '2025-07-29',
            fees: 8000,
            received: 5000,
            balance: 3000,
            paymentType: 'Cash',
            paymentReceiveDate: '2025-08-02',
          },
          'AY 2026-27': {
            assessmentYear: 'AY 2026-27',
            filingDate: '2026-07-31',
            fees: 8500,
            received: 0,
            balance: 8500,
            paymentType: 'Pending',
            paymentReceiveDate: '',
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
    gstMonths: [...BASELINE_GST_MONTHS],
    gstClients: [],
  };
}

function readLedger(): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createInitialLedger();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<LedgerState>;
    const allYears = new Set<string>([
      ...BASELINE_ASSESSMENT_YEARS,
      ...(parsed.assessmentYears || []),
    ]);
    for (const c of parsed.clients || []) {
      for (const y of Object.keys(c.filings || {})) {
        allYears.add(y);
      }
    }

    const needsGstSeed = parsed.gstClients === undefined;
    const gstClients = Array.isArray(parsed.gstClients) ? parsed.gstClients : [];

    const allMonths = new Set<string>([
      ...BASELINE_GST_MONTHS,
      ...(parsed.gstMonths || []),
    ]);
    for (const gc of gstClients) {
      for (const m of Object.keys(gc.filings || {})) {
        allMonths.add(m);
      }
    }

    const normalizedGstClients: GstClientRecord[] = gstClients.map((gc) => ({
      ...gc,
      phone: String((gc as GstClientRecord).phone || ''),
    }));

    const state: LedgerState = {
      assessmentYears: sortYears([...allYears]),
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      gstMonths: sortMonths([...allMonths]),
      gstClients: normalizedGstClients,
    };

    if (needsGstSeed) {
      writeLedger(state);
    }
    return state;
  } catch {
    const initial = createInitialLedger();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function backupLedgerFile(): string {
  const backupDir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const d = new Date();
  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
    `-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const backupFile = `ledger-${stamp}.json`;
  const dest = path.join(backupDir, backupFile);
  if (fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(DATA_FILE, dest);
  } else {
    fs.writeFileSync(dest, JSON.stringify(createInitialLedger(), null, 2), 'utf-8');
  }
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('ledger-') && f.endsWith('.json'))
    .map((f) => ({ f, m: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  for (const extra of files.slice(10)) {
    try {
      fs.unlinkSync(path.join(backupDir, extra.f));
    } catch {
      /* ignore */
    }
  }
  return backupFile;
}

function writeLedger(state: LedgerState): LedgerState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const allYears = new Set<string>(state.assessmentYears || []);
  for (const c of state.clients) {
    for (const y of Object.keys(c.filings || {})) {
      allYears.add(y);
    }
  }

  const allMonths = new Set<string>(state.gstMonths || []);
  for (const gc of state.gstClients || []) {
    for (const m of Object.keys(gc.filings || {})) {
      allMonths.add(m);
    }
  }

  const normalized: LedgerState = {
    assessmentYears: sortYears([...allYears]),
    clients: state.clients,
    gstMonths: sortMonths([...allMonths]),
    gstClients: state.gstClients || [],
  };
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
  return normalized;
}

function sanitizeFiling(year: string, input: Partial<FilingRecord>): FilingRecord {
  const fees = Math.max(0, Number(input.fees) || 0);
  const received = Math.max(0, Number(input.received) || 0);
  const balance =
    typeof input.balance === 'number' && Number.isFinite(input.balance)
      ? Math.max(0, input.balance)
      : Math.max(0, fees - received);
  return {
    assessmentYear: year.trim(),
    filingDate: String(input.filingDate || '').trim(),
    fees,
    received,
    balance,
    paymentType: String(input.paymentType || '').trim(),
    paymentReceiveDate: String(input.paymentReceiveDate || '').trim(),
  };
}

function sanitizeGstFiling(month: string, input: Partial<GstMonthlyFiling>): GstMonthlyFiling {
  const fees = Math.max(0, Number(input.fees) || 0);
  const interest = Math.max(0, Number(input.interest) || 0);
  const tax = Math.max(0, Number(input.tax) || 0);
  const total = fees + interest + tax;
  return {
    month: month.trim(),
    fees,
    interest,
    tax,
    total,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!err) {
        next();
        return;
      }
      const e = err as { type?: string; status?: number; message?: string };
      if (e.type === 'entity.too.large' || e.status === 413) {
        res.status(413).json({
          error: 'Import payload is too large. Try fewer sheets or a smaller file.',
        });
        return;
      }
      if (e instanceof SyntaxError || e.status === 400) {
        res.status(400).json({ error: 'Invalid JSON body.' });
        return;
      }
      next(err);
    }
  );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/ledger', (_req, res) => {
    res.json(readLedger());
  });

  // ---------- IT Routes ----------

  app.post('/api/years', (req, res) => {
    const year = String(req.body?.year || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Year is required.' });
      return;
    }
    const state = readLedger();
    state.assessmentYears = sortYears([...state.assessmentYears, year]);
    const saved = writeLedger(state);
    res.json(saved);
  });

  app.post('/api/clients', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const pan = String(req.body?.pan || '').trim().toUpperCase();
    const password = String(req.body?.password || '').trim();

    if (!name || !pan || !password) {
      res.status(400).json({ error: 'Name, PAN, and Password are mandatory.' });
      return;
    }

    const state = readLedger();
    const now = new Date().toISOString();

    const filings: Record<string, FilingRecord> = {};
    if (req.body?.filings && typeof req.body.filings === 'object') {
      for (const [yr, f] of Object.entries(req.body.filings as Record<string, Partial<FilingRecord>>)) {
        if (yr.trim()) {
          filings[yr.trim()] = sanitizeFiling(yr.trim(), f);
        }
      }
    }

    const newClient: ClientRecord = {
      id: `cli-${crypto.randomUUID().slice(0, 8)}`,
      name,
      pan,
      password,
      phone: String(req.body?.phone || '').trim(),
      referenceNumber: String(req.body?.referenceNumber || '').trim(),
      remark: String(req.body?.remark || '').trim(),
      filings,
      createdAt: now,
      updatedAt: now,
    };

    state.clients.push(newClient);
    const saved = writeLedger(state);
    res.status(201).json({ client: newClient, ledger: saved });
  });

  app.put('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const existing = state.clients[index];
    const name = String(req.body?.name ?? existing.name).trim();
    const pan = String(req.body?.pan ?? existing.pan).trim().toUpperCase();
    const password = String(req.body?.password ?? existing.password).trim();

    if (!name || !pan || !password) {
      res.status(400).json({ error: 'Name, PAN, and Password are mandatory.' });
      return;
    }

    const updated: ClientRecord = {
      ...existing,
      name,
      pan,
      password,
      phone: req.body?.phone !== undefined ? String(req.body.phone).trim() : existing.phone,
      referenceNumber:
        req.body?.referenceNumber !== undefined
          ? String(req.body.referenceNumber).trim()
          : existing.referenceNumber,
      remark:
        req.body?.remark !== undefined
          ? String(req.body.remark).trim()
          : (existing.remark || ''),
      updatedAt: new Date().toISOString(),
    };

    state.clients[index] = updated;
    const saved = writeLedger(state);
    res.json({ client: updated, ledger: saved });
  });

  app.delete('/api/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const nextClients = state.clients.filter((c) => c.id !== id);
    if (nextClients.length === state.clients.length) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    state.clients = nextClients;
    const saved = writeLedger(state);
    res.json({ ledger: saved });
  });

  app.post('/api/clients/:id/filings', (req, res) => {
    const { id } = req.params;
    const year = String(req.body?.assessmentYear || '').trim();
    if (!year) {
      res.status(400).json({ error: 'Assessment Year is required.' });
      return;
    }

    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const filing = sanitizeFiling(year, req.body);
    state.clients[index] = {
      ...state.clients[index],
      filings: {
        ...state.clients[index].filings,
        [year]: filing,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({ client: state.clients[index], ledger: saved });
  });

  app.delete('/api/clients/:id/filings/:year', (req, res) => {
    const { id, year } = req.params;
    const decodedYear = decodeURIComponent(year);
    const state = readLedger();
    const index = state.clients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const nextFilings = { ...state.clients[index].filings };
    delete nextFilings[decodedYear];
    state.clients[index] = {
      ...state.clients[index],
      filings: nextFilings,
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({ client: state.clients[index], ledger: saved });
  });

  app.post('/api/import/it', (req, res) => {
    try {
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      const onConflict = req.body?.onConflict === 'skip' ? 'skip' : 'update';
      const clientsIn = req.body?.clients;

      if (!Array.isArray(clientsIn)) {
        res.status(400).json({ error: 'clients must be an array.' });
        return;
      }
      if (clientsIn.length > 20000) {
        res.status(400).json({ error: 'Too many clients (max 20000).' });
        return;
      }

      const cap = (v: unknown, max = 200) =>
        String(v ?? '')
          .trim()
          .slice(0, max);

      type Incoming = {
        pan: string;
        name: string;
        phone: string;
        otherMobiles: string;
        nameVariants: string;
        filings: Record<
          string,
          {
            filingDate: string;
            fees: number;
            received: number;
            paymentType: string;
            paymentReceiveDate: string;
          }
        >;
      };

      const incoming: Incoming[] = [];
      for (const raw of clientsIn) {
        if (!raw || typeof raw !== 'object') continue;
        const pan = cap((raw as Incoming).pan).toUpperCase();
        if (!pan) continue;
        const filingsIn =
          (raw as Incoming).filings && typeof (raw as Incoming).filings === 'object'
            ? (raw as Incoming).filings
            : {};
        const filings: Incoming['filings'] = {};
        for (const [ay, f] of Object.entries(filingsIn || {})) {
          const year = cap(ay, 32);
          if (!year || !f || typeof f !== 'object') continue;
          filings[year] = {
            filingDate: cap((f as { filingDate?: string }).filingDate, 32),
            fees: Math.max(0, Number((f as { fees?: number }).fees) || 0),
            received: Math.max(0, Number((f as { received?: number }).received) || 0),
            paymentType: cap((f as { paymentType?: string }).paymentType),
            paymentReceiveDate: cap(
              (f as { paymentReceiveDate?: string }).paymentReceiveDate,
              32
            ),
          };
        }
        incoming.push({
          pan,
          name: cap((raw as Incoming).name),
          phone: cap((raw as Incoming).phone, 40),
          otherMobiles: cap((raw as Incoming).otherMobiles),
          nameVariants: cap((raw as Incoming).nameVariants),
          filings,
        });
      }

      const state = readLedger();
      const backupFile = backupLedgerFile();

      const byPan = new Map(
        state.clients.map((c) => [c.pan.toUpperCase(), c] as const)
      );
      const filePans = new Set(incoming.map((c) => c.pan));

      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;
      const now = new Date().toISOString();

      for (const inc of incoming) {
        const existing = byPan.get(inc.pan);
        if (!existing) {
          const filings: Record<string, FilingRecord> = {};
          for (const [ay, f] of Object.entries(inc.filings)) {
            filings[ay] = sanitizeFiling(ay, f);
            filingsAdded += 1;
          }
          const created: ClientRecord = {
            id: `cli-${crypto.randomUUID().slice(0, 8)}`,
            name: inc.name || inc.pan,
            pan: inc.pan,
            password: 'NOT SET',
            phone: inc.phone || '',
            referenceNumber: '',
            remark: '',
            otherMobiles: inc.otherMobiles || undefined,
            nameVariants: inc.nameVariants || undefined,
            filings,
            createdAt: now,
            updatedAt: now,
          };
          state.clients.push(created);
          byPan.set(inc.pan, created);
          clientsCreated += 1;
          continue;
        }

        let changed = false;
        if (inc.name) {
          existing.name = inc.name;
          changed = true;
        }
        if (inc.phone) {
          existing.phone = inc.phone;
          changed = true;
        }
        if (inc.otherMobiles) {
          existing.otherMobiles = inc.otherMobiles;
          changed = true;
        }
        if (inc.nameVariants) {
          existing.nameVariants = inc.nameVariants;
          changed = true;
        }

        for (const [ay, f] of Object.entries(inc.filings)) {
          if (existing.filings?.[ay]) {
            if (onConflict === 'skip') {
              filingsSkipped += 1;
            } else {
              existing.filings[ay] = sanitizeFiling(ay, f);
              filingsUpdated += 1;
              changed = true;
            }
          } else {
            existing.filings = existing.filings || {};
            existing.filings[ay] = sanitizeFiling(ay, f);
            filingsAdded += 1;
            changed = true;
          }
        }

        if (changed) {
          existing.updatedAt = now;
          clientsUpdated += 1;
        }
      }

      if (mode === 'replace') {
        state.clients = state.clients.filter((c) =>
          filePans.has(c.pan.toUpperCase())
        );
      }

      // GST untouched — only rewrite clients / years via writeLedger
      const saved = writeLedger(state);
      res.json({
        ledger: saved,
        report: {
          clientsCreated,
          clientsUpdated,
          filingsAdded,
          filingsUpdated,
          filingsSkipped,
          backupFile,
        },
      });
    } catch (err) {
      console.error('IT import failed', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Import failed.',
      });
    }
  });

  app.post('/api/import/gst', (req, res) => {
    try {
      const mode = req.body?.mode === 'replace' ? 'replace' : 'merge';
      const onConflict = req.body?.onConflict === 'skip' ? 'skip' : 'update';
      const companiesIn = req.body?.companies;

      if (!Array.isArray(companiesIn)) {
        res.status(400).json({ error: 'companies must be an array.' });
        return;
      }
      if (companiesIn.length > 20000) {
        res.status(400).json({ error: 'Too many companies (max 20000).' });
        return;
      }

      const cap = (v: unknown, max = 200) =>
        String(v ?? '')
          .trim()
          .slice(0, max);

      type IncomingGst = {
        userId: string;
        companyName: string;
        password: string;
        phone: string;
        referenceNumber: string;
        remark: string;
        totalReceived: number;
        filings: Record<
          string,
          {
            fees: number;
            interest: number;
            tax: number;
            total: number;
          }
        >;
      };

      const incoming: IncomingGst[] = [];
      for (const raw of companiesIn) {
        if (!raw || typeof raw !== 'object') continue;
        const userId = cap((raw as IncomingGst).userId, 80);
        if (!userId) continue;
        const filingsIn =
          (raw as IncomingGst).filings &&
          typeof (raw as IncomingGst).filings === 'object'
            ? (raw as IncomingGst).filings
            : {};
        const filings: IncomingGst['filings'] = {};
        for (const [month, f] of Object.entries(filingsIn || {})) {
          const m = cap(month, 32);
          if (!m || !f || typeof f !== 'object') continue;
          const fees = Math.max(0, Number((f as { fees?: number }).fees) || 0);
          const interest = Math.max(
            0,
            Number((f as { interest?: number }).interest) || 0
          );
          const tax = Math.max(0, Number((f as { tax?: number }).tax) || 0);
          const total = Math.max(
            0,
            Number((f as { total?: number }).total) || fees + interest + tax
          );
          filings[m] = { fees, interest, tax, total };
        }
        incoming.push({
          userId,
          companyName: cap((raw as IncomingGst).companyName) || userId,
          password: cap((raw as IncomingGst).password, 80),
          phone: cap((raw as IncomingGst).phone, 40),
          referenceNumber: cap((raw as IncomingGst).referenceNumber),
          remark: cap((raw as IncomingGst).remark),
          totalReceived: Math.max(
            0,
            Number((raw as IncomingGst).totalReceived) || 0
          ),
          filings,
        });
      }

      const state = readLedger();
      const backupFile = backupLedgerFile();
      const byUser = new Map(
        state.gstClients.map((c) => [c.userId.toLowerCase(), c] as const)
      );
      const fileUsers = new Set(incoming.map((c) => c.userId.toLowerCase()));

      let clientsCreated = 0;
      let clientsUpdated = 0;
      let filingsAdded = 0;
      let filingsUpdated = 0;
      let filingsSkipped = 0;
      const now = new Date().toISOString();
      const monthsSet = new Set(state.gstMonths);

      for (const inc of incoming) {
        const key = inc.userId.toLowerCase();
        const existing = byUser.get(key);
        Object.keys(inc.filings).forEach((m) => monthsSet.add(m));

        if (!existing) {
          const filings: Record<string, GstMonthlyFiling> = {};
          for (const [m, f] of Object.entries(inc.filings)) {
            filings[m] = sanitizeGstFiling(m, f);
            filingsAdded += 1;
          }
          const created: GstClientRecord = {
            id: `gst-${crypto.randomUUID().slice(0, 8)}`,
            companyName: inc.companyName,
            userId: inc.userId,
            password: inc.password || 'NOT SET',
            phone: inc.phone || '',
            referenceNumber: inc.referenceNumber || '',
            remark: inc.remark || '',
            totalReceived: inc.totalReceived,
            filings,
            createdAt: now,
            updatedAt: now,
          };
          state.gstClients.push(created);
          byUser.set(key, created);
          clientsCreated += 1;
          continue;
        }

        let changed = false;
        if (inc.companyName && inc.companyName !== existing.companyName) {
          existing.companyName = inc.companyName;
          changed = true;
        }
        if (
          inc.password &&
          inc.password !== 'NOT SET' &&
          inc.password !== existing.password
        ) {
          existing.password = inc.password;
          changed = true;
        }
        if (inc.phone && inc.phone !== existing.phone) {
          existing.phone = inc.phone;
          changed = true;
        }
        if (
          inc.referenceNumber &&
          inc.referenceNumber !== existing.referenceNumber
        ) {
          existing.referenceNumber = inc.referenceNumber;
          changed = true;
        }
        if (inc.remark && inc.remark !== (existing.remark || '')) {
          existing.remark = inc.remark;
          changed = true;
        }
        if (
          Number.isFinite(inc.totalReceived) &&
          inc.totalReceived !== existing.totalReceived
        ) {
          existing.totalReceived = inc.totalReceived;
          changed = true;
        }

        for (const [m, f] of Object.entries(inc.filings)) {
          if (existing.filings?.[m]) {
            if (onConflict === 'skip') {
              filingsSkipped += 1;
            } else {
              existing.filings[m] = sanitizeGstFiling(m, f);
              filingsUpdated += 1;
              changed = true;
            }
          } else {
            existing.filings = existing.filings || {};
            existing.filings[m] = sanitizeGstFiling(m, f);
            filingsAdded += 1;
            changed = true;
          }
        }

        if (changed) {
          existing.updatedAt = now;
          clientsUpdated += 1;
        }
      }

      if (mode === 'replace') {
        state.gstClients = state.gstClients.filter((c) =>
          fileUsers.has(c.userId.toLowerCase())
        );
      }

      state.gstMonths = sortMonths([...monthsSet]);
      const saved = writeLedger(state);
      res.json({
        ledger: saved,
        report: {
          clientsCreated,
          clientsUpdated,
          filingsAdded,
          filingsUpdated,
          filingsSkipped,
          backupFile,
        },
      });
    } catch (err) {
      console.error('GST import failed', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Import failed.',
      });
    }
  });

  // ---------- GST Routes ----------

  app.post('/api/gst/months', (req, res) => {
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }
    const state = readLedger();
    state.gstMonths = sortMonths([...state.gstMonths, month]);
    const saved = writeLedger(state);
    res.json(saved);
  });

  app.post('/api/gst/clients', (req, res) => {
    const companyName = String(req.body?.companyName || '').trim();
    const userId = String(req.body?.userId || '').trim();
    const password = String(req.body?.password || '').trim();

    if (!companyName || !userId || !password) {
      res.status(400).json({ error: 'Company Name, User ID, and Password are mandatory.' });
      return;
    }

    const state = readLedger();
    const now = new Date().toISOString();

    const filings: Record<string, GstMonthlyFiling> = {};
    if (req.body?.filings && typeof req.body.filings === 'object') {
      for (const [m, f] of Object.entries(
        req.body.filings as Record<string, Partial<GstMonthlyFiling>>
      )) {
        if (m.trim()) {
          filings[m.trim()] = sanitizeGstFiling(m.trim(), f);
        }
      }
    }

    const newClient: GstClientRecord = {
      id: `gst-${crypto.randomUUID().slice(0, 8)}`,
      companyName,
      userId,
      password,
      phone: String(req.body?.phone || '').trim(),
      referenceNumber: String(req.body?.referenceNumber || '').trim(),
      remark: String(req.body?.remark || '').trim(),
      totalReceived: Math.max(0, Number(req.body?.totalReceived) || 0),
      filings,
      createdAt: now,
      updatedAt: now,
    };

    state.gstClients.push(newClient);
    const saved = writeLedger(state);
    res.status(201).json({ client: newClient, ledger: saved });
  });

  app.put('/api/gst/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const existing = state.gstClients[index];
    const companyName = String(req.body?.companyName ?? existing.companyName).trim();
    const userId = String(req.body?.userId ?? existing.userId).trim();
    const password = String(req.body?.password ?? existing.password).trim();

    if (!companyName || !userId || !password) {
      res.status(400).json({ error: 'Company Name, User ID, and Password are mandatory.' });
      return;
    }

    const updated: GstClientRecord = {
      ...existing,
      companyName,
      userId,
      password,
      phone:
        req.body?.phone !== undefined
          ? String(req.body.phone).trim()
          : existing.phone || '',
      referenceNumber:
        req.body?.referenceNumber !== undefined
          ? String(req.body.referenceNumber).trim()
          : existing.referenceNumber,
      remark:
        req.body?.remark !== undefined
          ? String(req.body.remark).trim()
          : existing.remark || '',
      totalReceived:
        req.body?.totalReceived !== undefined
          ? Math.max(0, Number(req.body.totalReceived) || 0)
          : Math.max(0, Number(existing.totalReceived) || 0),
      updatedAt: new Date().toISOString(),
    };

    state.gstClients[index] = updated;
    const saved = writeLedger(state);
    res.json({ client: updated, ledger: saved });
  });

  app.delete('/api/gst/clients/:id', (req, res) => {
    const { id } = req.params;
    const state = readLedger();
    const nextClients = state.gstClients.filter((c) => c.id !== id);
    if (nextClients.length === state.gstClients.length) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }
    state.gstClients = nextClients;
    const saved = writeLedger(state);
    res.json({ ledger: saved });
  });

  app.post('/api/gst/clients/:id/filings', (req, res) => {
    const { id } = req.params;
    const month = String(req.body?.month || '').trim();
    if (!month) {
      res.status(400).json({ error: 'Month is required.' });
      return;
    }

    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const filing = sanitizeGstFiling(month, req.body);
    state.gstClients[index] = {
      ...state.gstClients[index],
      filings: {
        ...state.gstClients[index].filings,
        [month]: filing,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({ client: state.gstClients[index], ledger: saved });
  });

  app.delete('/api/gst/clients/:id/filings/:month', (req, res) => {
    const { id, month } = req.params;
    const decodedMonth = decodeURIComponent(month);
    const state = readLedger();
    const index = state.gstClients.findIndex((c) => c.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'GST company not found.' });
      return;
    }

    const nextFilings = { ...state.gstClients[index].filings };
    delete nextFilings[decodedMonth];
    state.gstClients[index] = {
      ...state.gstClients[index],
      filings: nextFilings,
      updatedAt: new Date().toISOString(),
    };

    const saved = writeLedger(state);
    res.json({ client: state.gstClients[index], ledger: saved });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TaxLedger server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
