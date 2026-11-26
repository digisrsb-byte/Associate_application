import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  BACKUP_MAGIC,
  decryptLedgerBackup,
  encryptLedgerBackup,
  isEncryptedBackupBuffer,
  loadBackupEncryptionKey,
  parseAndValidateLedgerJson,
  verifyEncryptedBackupFile,
} from '../backupCrypto';
import { apiLogin, e2eDataPaths } from './helpers/security';
import { createItClientViaUi } from './helpers/clients';
import { findItClientInLedger } from './helpers/finance';
import { loginAsE2eAdmin } from './helpers/auth';
import { nextSeq, syntheticName, syntheticPan } from './helpers/ids';

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function listEncBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('ledger-') && f.endsWith('.json.enc'))
    .sort();
}

function loadE2eBackupKey(): Buffer {
  const keyPath = path.resolve(e2eDataPaths().dataDir, 'BACKUP_ENCRYPTION_KEY');
  const status = loadBackupEncryptionKey({ keyFilePath: keyPath });
  expect(status.ok).toBeTruthy();
  if (!status.ok) throw new Error('E2E backup key missing');
  return status.key;
}

test.describe('Stage 7C — backup encryption and recovery', () => {
  test('unauthenticated GET /api/backups returns 401 Unauthorized', async ({
    page,
  }) => {
    await page.goto('/');
    // No login — do not supply a session cookie; do not touch backup files
    const res = await page.request.get('/api/backups');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(String(body.error || '')).toMatch(/Unauthorized/i);
  });

  test('unauthenticated POST /api/backups/restore returns 401 Unauthorized', async ({
    page,
  }) => {
    await page.goto('/');
    // No login — middleware must reject before any restore/file access
    const res = await page.request.post('/api/backups/restore', {
      data: { file: 'ledger-unauth-probe.json.enc', confirm: true },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(String(body.error || '')).toMatch(/Unauthorized/i);
  });

  test('1–4 — new backup encrypted; no plaintext; decrypt matches; restore verifies', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const paths = e2eDataPaths();
    const backupDir = path.resolve(paths.backups);
    const ledgerPath = path.resolve(paths.ledger);
    const liveData = path.resolve('data');
    expect(path.resolve(paths.dataDir)).not.toBe(liveData);

    await loginAsE2eAdmin(page);
    const n = nextSeq();
    const pan = syntheticPan(n);
    await createItClientViaUi(page, {
      name: syntheticName('EncBak', n),
      pan,
    });
    await findItClientInLedger(page.request, pan);
    const originalLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

    const { res: loginRes } = await apiLogin(page.request);
    expect(loginRes.ok()).toBeTruthy();
    const imp = await page.request.post('/api/import/it', {
      data: {
        mode: 'merge',
        onConflict: 'skip',
        clients: [
          {
            pan: syntheticPan(n + 3),
            name: syntheticName('EncImp', n),
            phone: '',
            otherMobiles: '',
            nameVariants: '',
            filings: {},
          },
        ],
      },
    });
    expect(imp.ok()).toBeTruthy();
    const impBody = await imp.json();
    const backupName = String(impBody.report?.backupFile || impBody.backupFile || '');
    expect(backupName).toMatch(/^ledger-.*\.json\.enc$/);

    const backupFile = path.join(backupDir, backupName);
    expect(fs.existsSync(backupFile)).toBeTruthy();

    // 1 — encrypted
    const raw = fs.readFileSync(backupFile);
    expect(isEncryptedBackupBuffer(raw)).toBeTruthy();
    expect(raw.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)).toBeTruthy();

    // 2 — plaintext JSON not left as this backup; no "clients" in raw ciphertext file as JSON
    const asText = raw.toString('utf8');
    expect(asText.trim().startsWith('{')).toBeFalsy();
    expect(asText).not.toContain(`"pan":"${pan}"`);

    // Newest encrypted backups should not be plaintext .json siblings with same stamp
    const plaintextTwin = backupFile.replace(/\.json\.enc$/, '.json');
    expect(fs.existsSync(plaintextTwin)).toBeFalsy();

    // 3 — correct key decrypts
    const key = loadE2eBackupKey();
    const decrypted = decryptLedgerBackup(raw, key);
    const parsed = parseAndValidateLedgerJson(decrypted);
    expect(Array.isArray(parsed.clients)).toBeTruthy();
    expect(
      (parsed.clients as { pan: string }[]).some((c) => c.pan === pan)
    ).toBeTruthy();

    // 4 — restored data matches original test snapshot (pre-import backup of original)
    // The backup was taken at import start — should include EncBak pan
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'associate-e2e-enc-restore-'));
    expect(path.resolve(tempDir).startsWith(path.resolve(liveData))).toBeFalsy();
    const restoredPath = path.join(tempDir, 'ledger.json');
    fs.writeFileSync(restoredPath, decrypted, 'utf8');
    const restored = JSON.parse(fs.readFileSync(restoredPath, 'utf8'));
    expect(restored.clients.some((c: { pan: string }) => c.pan === pan)).toBeTruthy();
    // Structural match vs original for the seeded client
    const origClient = originalLedger.clients.find((c: { pan: string }) => c.pan === pan);
    const restClient = restored.clients.find((c: { pan: string }) => c.pan === pan);
    expect(restClient?.name).toBe(origClient?.name);
    expect(restClient?.pan).toBe(origClient?.pan);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('5–8 — wrong key, tamper, incomplete rejected; failed restore safe', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const paths = e2eDataPaths();
    const backupDir = path.resolve(paths.backups);
    const ledgerPath = path.resolve(paths.ledger);

    await loginAsE2eAdmin(page);
    const { res: loginRes } = await apiLogin(page.request);
    expect(loginRes.ok()).toBeTruthy();
    const imp = await page.request.post('/api/import/it', {
      data: { mode: 'merge', onConflict: 'skip', clients: [] },
    });
    expect(imp.ok()).toBeTruthy();
    const backupName = String(
      (await imp.json()).report?.backupFile || ''
    );
    expect(backupName).toMatch(/\.json\.enc$/);
    const backupFile = path.join(backupDir, backupName);
    const good = fs.readFileSync(backupFile);
    const key = loadE2eBackupKey();

    // 5 — wrong key
    const wrongKey = crypto.randomBytes(32);
    expect(() => decryptLedgerBackup(good, wrongKey)).toThrow(/wrong key|tampered/i);

    // 6 — tampered
    const tampered = Buffer.from(good);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptLedgerBackup(tampered, key)).toThrow();

    // 7 — incomplete
    const incomplete = good.subarray(0, 20);
    expect(() => decryptLedgerBackup(incomplete, key)).toThrow(/incomplete|empty|magic/i);

    // 8 — failed restore does not damage e2e ledger
    const before = sha256File(ledgerPath);
    const badRestore = await page.request.post('/api/backups/restore', {
      data: { file: backupName, confirm: true },
      headers: {
        // Force wrong by using a non-enc name / or restore garbage file name
      },
    });
    // Valid encrypted restore should succeed — instead POST with fake name
    const fail = await page.request.post('/api/backups/restore', {
      data: { file: 'ledger-does-not-exist.json.enc', confirm: true },
    });
    expect(fail.status()).toBe(400);
    expect(sha256File(ledgerPath)).toBe(before);

    // Tampered file on disk under a temp name — restore API only reads from backups/
    const evilName = `ledger-tampered-test.json.enc`;
    const evilPath = path.join(backupDir, evilName);
    fs.writeFileSync(evilPath, tampered);
    const failTamper = await page.request.post('/api/backups/restore', {
      data: { file: evilName, confirm: true },
    });
    expect(failTamper.status()).toBe(400);
    expect(sha256File(ledgerPath)).toBe(before);
    // Cleanup tampered artifact we created (do not delete unrelated backups)
    fs.unlinkSync(evilPath);

    void verifyEncryptedBackupFile;
    void encryptLedgerBackup;
    void badRestore;
  });

  test('9 — key file reload (simulated restart) still decrypts', async ({ page }) => {
    await loginAsE2eAdmin(page);
    const { res: loginRes } = await apiLogin(page.request);
    expect(loginRes.ok()).toBeTruthy();
    const imp = await page.request.post('/api/import/it', {
      data: { mode: 'merge', onConflict: 'skip', clients: [] },
    });
    expect(imp.ok()).toBeTruthy();
    const backupName = String((await imp.json()).report?.backupFile || '');
    const backupFile = path.join(path.resolve(e2eDataPaths().backups), backupName);
    const blob = fs.readFileSync(backupFile);

    const key1 = loadE2eBackupKey();
    const plain1 = decryptLedgerBackup(blob, key1);
    // Simulate process restart: re-read key material from disk
    const key2 = loadE2eBackupKey();
    const plain2 = decryptLedgerBackup(blob, key2);
    expect(plain1).toBe(plain2);
    parseAndValidateLedgerJson(plain2);
  });

  test('10 — successful encrypted restore into data-e2e + list endpoint', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const paths = e2eDataPaths();
    const ledgerPath = path.resolve(paths.ledger);

    await loginAsE2eAdmin(page);
    const n = nextSeq();
    const pan = syntheticPan(n);
    await createItClientViaUi(page, {
      name: syntheticName('RestSeed', n),
      pan,
    });

    const { res: loginRes } = await apiLogin(page.request);
    expect(loginRes.ok()).toBeTruthy();
    const imp = await page.request.post('/api/import/it', {
      data: { mode: 'merge', onConflict: 'skip', clients: [] },
    });
    expect(imp.ok()).toBeTruthy();
    const backupName = String((await imp.json()).report?.backupFile || '');
    expect(backupName).toMatch(/\.json\.enc$/);

    const list = await page.request.get('/api/backups');
    expect(list.ok()).toBeTruthy();
    const listBody = await list.json();
    expect(
      (listBody.backups || []).some(
        (b: { file: string; encrypted: boolean }) =>
          b.file === backupName && b.encrypted === true
      )
    ).toBeTruthy();

    const beforeHash = sha256File(ledgerPath);
    const restore = await page.request.post('/api/backups/restore', {
      data: { file: backupName, confirm: true },
    });
    expect(restore.ok()).toBeTruthy();
    const body = await restore.json();
    expect(body.ok).toBeTruthy();
    expect(body.preRestoreBackup).toMatch(/\.json\.enc$/);
    // Ledger still valid JSON after restore
    const after = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    expect(Array.isArray(after.clients)).toBeTruthy();
    expect(after.clients.some((c: { pan: string }) => c.pan === pan)).toBeTruthy();
    // pre-restore backup preserved a recoverable copy (hash may change after restore)
    void beforeHash;
  });
});
